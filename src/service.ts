/**
 * Reliability scoring for x402-reputation.
 *
 * The question this answers is narrow and useful: **did the merchant actually
 * deliver?** Buyers post signed *fulfillment attestations* — each one links a
 * settled payment (tx hash on either rail) to what happened afterwards — and the
 * score is computed from those attestations alone. Nothing here is a star
 * rating; it is a record of outcomes against payments that provably occurred.
 *
 * Scoring properties worth knowing:
 *   - **Recency decay.** An attestation's weight halves every HALF_LIFE_DAYS,
 *     so a merchant that used to be good but stopped delivering decays quickly.
 *   - **Per-attestor cap.** One wallet can only contribute up to
 *     MAX_ATTESTOR_SHARE of the total weight, so a single loud voice (or a
 *     Sybil with one funded wallet) cannot swing a score.
 *   - **Dual-rail attestors.** An attestor is an EVM address *or* a Solana
 *     pubkey; both count, and the report says how the evidence splits.
 *   - **One attestation per payment per attestor.** Duplicates are rejected
 *     *before* payment, so nobody pays for a rejected write.
 */
import { randomUUID } from "node:crypto";
import { signArtifact, type Signed } from "./sign.js";
import { loadStore, saveStore } from "./store.js";
import { parseWallet, requireWallet, sameWallet, walletRef, type Rail } from "./wallet.js";

export const HALF_LIFE_DAYS = Number(process.env.HALF_LIFE_DAYS || "30");
export const MAX_ATTESTOR_SHARE = Number(process.env.MAX_ATTESTOR_SHARE || "0.25");
export const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE || "5");

export type Outcome = "fulfilled" | "partial" | "failed" | "refunded";

/** How much each outcome counts toward "they delivered". */
const OUTCOME_CREDIT: Record<Outcome, number> = {
  fulfilled: 1,
  partial: 0.5,
  refunded: 0.25,
  failed: 0,
};

const OUTCOMES: Outcome[] = ["fulfilled", "partial", "failed", "refunded"];

export interface WalletRef {
  rail: Rail;
  address: string;
}

export interface Attestation {
  attestationId: string;
  document: "x402-reputation/attestation";
  merchantId: string;
  outcome: Outcome;
  /** The settled payment this outcome is about. */
  payment: { rail: Rail | "unknown"; network: string; transaction: string; amount: string };
  attestor: WalletRef;
  note: string;
  attestedAt: string;
}

export interface ScoreReport {
  merchantId: string;
  document: "x402-reputation/score";
  /** 0-100, recency-weighted and attestor-capped. */
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  fulfillmentRate: number;
  refundRate: number;
  failureRate: number;
  attestations: number;
  distinctAttestors: number;
  attestorsByRail: Record<Rail, number>;
  outcomes: Record<Outcome, number>;
  volumeAttested: string;
  firstSeen: string;
  lastSeen: string;
  /** How much to trust the number above, given sample size and attestor spread. */
  confidence: "none" | "low" | "medium" | "high";
  method: {
    halfLifeDays: number;
    maxAttestorShare: number;
    outcomeCredit: Record<Outcome, number>;
  };
  sample: Array<Omit<Attestation, "note"> & { note: string }>;
  computedAt: string;
}

type AttestationStore = Record<string, Signed<Attestation>>;

let attestations: AttestationStore = loadStore<AttestationStore>("attestations", {});

function persist(): void {
  saveStore("attestations", attestations);
}

export class ReputationError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function normalizeMerchantId(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9._:-]{1,63}$/.test(value)) {
    throw new ReputationError(
      400,
      "INVALID_MERCHANT_ID",
      "merchantId must be 2-64 chars of [a-z0-9._:-] (e.g. a domain, a payTo address, or a service slug)",
    );
  }
  return value;
}

function railOfNetwork(network: string): Rail | "unknown" {
  if (/^solana/.test(network)) return "solana";
  if (/^(base|eip155|avalanche|polygon|sei|abstract|iotex|peaq|story|educhain|skale)/.test(network)) return "evm";
  return "unknown";
}

function forMerchant(merchantId: string): Signed<Attestation>[] {
  return Object.values(attestations).filter((a) => a.merchantId === merchantId);
}

/** True when this attestor has already attested to this exact payment. */
export function isDuplicate(merchantIdRaw: unknown, transaction: unknown, attestorRaw: unknown): boolean {
  const attestor = parseWallet(attestorRaw);
  if (!attestor || typeof transaction !== "string" || typeof merchantIdRaw !== "string") return false;
  const merchantId = merchantIdRaw.trim().toLowerCase();
  return Object.values(attestations).some(
    (a) =>
      a.merchantId === merchantId &&
      a.payment.transaction === transaction.trim() &&
      sameWallet(a.attestor.address, attestor.address),
  );
}

export function hasAttestations(merchantIdRaw: unknown): boolean {
  if (typeof merchantIdRaw !== "string") return false;
  return forMerchant(merchantIdRaw.trim().toLowerCase()).length > 0;
}

/**
 * Record a signed attestation. Paid — the signed record is the artifact the
 * caller receives in the same response.
 */
export function createAttestation(body: Record<string, unknown>): Signed<Attestation> {
  const merchantId = normalizeMerchantId(body.merchantId);
  const attestor = requireWallet(body.attestor, "attestor");
  const outcome = OUTCOMES.includes(body.outcome as Outcome) ? (body.outcome as Outcome) : "fulfilled";

  const paymentInput = (body.payment || {}) as Record<string, unknown>;
  const transaction =
    typeof paymentInput.transaction === "string" && paymentInput.transaction.trim()
      ? paymentInput.transaction.trim().slice(0, 128)
      : "";
  if (!transaction) {
    throw new ReputationError(
      400,
      "MISSING_PAYMENT_TX",
      "payment.transaction is required — an attestation must reference the settled payment it is about",
    );
  }
  if (isDuplicate(merchantId, transaction, body.attestor)) {
    throw new ReputationError(
      409,
      "DUPLICATE_ATTESTATION",
      `${attestor.rail} wallet ${attestor.address} has already attested to payment ${transaction} for ${merchantId}`,
    );
  }

  const network = typeof paymentInput.network === "string" ? paymentInput.network.slice(0, 40) : "base-sepolia";
  const amount = typeof paymentInput.amount === "string" ? paymentInput.amount.slice(0, 24) : "$0.00";

  const attestation: Attestation = {
    attestationId: `att_${randomUUID()}`,
    document: "x402-reputation/attestation",
    merchantId,
    outcome,
    payment: { rail: railOfNetwork(network), network, transaction, amount },
    attestor: walletRef(attestor),
    note: typeof body.note === "string" ? body.note.slice(0, 280) : "",
    attestedAt: new Date().toISOString(),
  };
  const signed = signArtifact(attestation);
  attestations[attestation.attestationId] = signed;
  persist();
  return signed;
}

function decayWeight(attestedAt: string, now: number): number {
  const ageDays = Math.max(0, (now - new Date(attestedAt).getTime()) / 86_400_000);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function grade(score: number): ScoreReport["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function confidenceOf(count: number, distinct: number): ScoreReport["confidence"] {
  if (count === 0) return "none";
  if (count < 3 || distinct < 2) return "low";
  if (count < 10 || distinct < 4) return "medium";
  return "high";
}

function round(n: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Compute the reliability report. Paid — the report is the artifact returned in
 * the response body.
 */
export function scoreMerchant(merchantIdRaw: string): Signed<ScoreReport> {
  const merchantId = normalizeMerchantId(merchantIdRaw);
  const records = forMerchant(merchantId);
  if (records.length === 0) {
    throw new ReputationError(404, "NO_ATTESTATIONS", `No attestations recorded for merchant ${merchantId}`);
  }

  const now = Date.now();
  const outcomes: Record<Outcome, number> = { fulfilled: 0, partial: 0, failed: 0, refunded: 0 };
  const attestorsByRail: Record<Rail, number> = { evm: 0, solana: 0 };
  const seenAttestors = new Set<string>();
  const rawWeightByAttestor = new Map<string, number>();
  const creditByAttestor = new Map<string, number>();
  let volume = 0;

  for (const record of records) {
    outcomes[record.outcome]++;
    const key = `${record.attestor.rail}:${record.attestor.address}`;
    if (!seenAttestors.has(key)) {
      seenAttestors.add(key);
      attestorsByRail[record.attestor.rail]++;
    }
    const weight = decayWeight(record.attestedAt, now);
    rawWeightByAttestor.set(key, (rawWeightByAttestor.get(key) ?? 0) + weight);
    creditByAttestor.set(
      key,
      (creditByAttestor.get(key) ?? 0) + weight * OUTCOME_CREDIT[record.outcome],
    );
    volume += Number(String(record.payment.amount).replace(/[^0-9.]/g, "")) || 0;
  }

  // Cap any single attestor's share of the total weight.
  const totalRaw = [...rawWeightByAttestor.values()].reduce((a, b) => a + b, 0);
  const cap = totalRaw * MAX_ATTESTOR_SHARE;
  let weighted = 0;
  let credited = 0;
  for (const [key, raw] of rawWeightByAttestor) {
    const scale = raw > cap && cap > 0 ? cap / raw : 1;
    weighted += raw * scale;
    credited += (creditByAttestor.get(key) ?? 0) * scale;
  }

  const score = weighted > 0 ? Math.round((credited / weighted) * 100) : 0;
  const total = records.length;
  const sorted = [...records].sort((a, b) => (a.attestedAt < b.attestedAt ? 1 : -1));

  const report: ScoreReport = {
    merchantId,
    document: "x402-reputation/score",
    score,
    grade: grade(score),
    fulfillmentRate: round(outcomes.fulfilled / total),
    refundRate: round(outcomes.refunded / total),
    failureRate: round(outcomes.failed / total),
    attestations: total,
    distinctAttestors: seenAttestors.size,
    attestorsByRail,
    outcomes,
    volumeAttested: `$${volume.toFixed(2)}`,
    firstSeen: sorted[sorted.length - 1].attestedAt,
    lastSeen: sorted[0].attestedAt,
    confidence: confidenceOf(total, seenAttestors.size),
    method: {
      halfLifeDays: HALF_LIFE_DAYS,
      maxAttestorShare: MAX_ATTESTOR_SHARE,
      outcomeCredit: OUTCOME_CREDIT,
    },
    sample: sorted.slice(0, SAMPLE_SIZE).map(({ signature: _s, algorithm: _a, ...rest }) => rest),
    computedAt: new Date().toISOString(),
  };
  return signArtifact(report);
}

export function getAttestation(id: string): Signed<Attestation> | undefined {
  return attestations[id];
}

/** Free index so callers know which merchants are worth scoring. */
export function merchantIndex(): Array<{ merchantId: string; attestations: number; lastSeen: string }> {
  const byMerchant = new Map<string, Signed<Attestation>[]>();
  for (const record of Object.values(attestations)) {
    const list = byMerchant.get(record.merchantId) ?? [];
    list.push(record);
    byMerchant.set(record.merchantId, list);
  }
  return [...byMerchant.entries()]
    .map(([merchantId, list]) => ({
      merchantId,
      attestations: list.length,
      lastSeen: list.map((a) => a.attestedAt).sort().reverse()[0],
    }))
    .sort((a, b) => b.attestations - a.attestations);
}
