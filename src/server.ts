import "dotenv/config";
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paywall, payToBanner, withSettlement } from "./payments.js";
import {
  createAttestation,
  getAttestation,
  hasAttestations,
  isDuplicate,
  merchantIndex,
  ReputationError,
  scoreMerchant,
} from "./service.js";
import { verify } from "./sign.js";
import { WalletError } from "./wallet.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4024);

const app = express();
app.use(express.json({ limit: "64kb" }));

// ---- x402 paywall ----------------------------------------------------------
// Both routes are $0.001. The resolvers decline to charge for requests that
// cannot produce an artifact — an unknown merchant, or a duplicate attestation
// — so a caller never pays for a 404 or a 409.
app.use(
  paywall({
    "GET /score/:merchantId": (req) => {
      const merchantId = decodeURIComponent(req.path.split("/")[2] || "");
      if (!hasAttestations(merchantId)) return null; // free 404
      return {
        price: "$0.001",
        description: `Reliability report for merchant ${merchantId}`,
        outputSchema: { type: "object", description: "Signed reliability report" },
      };
    },
    "POST /attest": (req) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const payment = (body.payment ?? {}) as Record<string, unknown>;
      if (isDuplicate(body.merchantId, payment.transaction, body.attestor)) return null; // free 409
      return {
        price: "$0.001",
        description: "Record a signed fulfillment attestation",
        outputSchema: { type: "object", description: "Signed attestation record" },
      };
    },
  }),
);

// ---- Free routes ------------------------------------------------------------
app.get("/health", (_req, res) => res.json({ ok: true, service: "x402-reputation" }));

app.get("/merchants", (_req, res) => res.json({ merchants: merchantIndex() }));

app.get("/attestations/:id", (req, res) => {
  const attestation = getAttestation(req.params.id);
  if (!attestation) {
    return res.status(404).json({ error: "ATTESTATION_NOT_FOUND", message: `No attestation ${req.params.id}` });
  }
  res.json(attestation);
});

app.post("/verify", (req, res) => {
  const artifact = req.body;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "POST a signed artifact as the JSON body" });
  }
  res.json({ valid: verify(artifact as Record<string, unknown>) });
});

// ---- Paid routes ------------------------------------------------------------
app.get("/score/:merchantId", (req, res) => {
  try {
    const report = scoreMerchant(req.params.merchantId);
    res.json(withSettlement(report, req));
  } catch (err) {
    return fail(res, err);
  }
});

app.post("/attest", (req, res) => {
  try {
    const attestation = createAttestation(req.body ?? {});
    res.status(201).json(withSettlement(attestation, req));
  } catch (err) {
    return fail(res, err);
  }
});

function fail(res: express.Response, err: unknown): void {
  if (err instanceof WalletError || err instanceof ReputationError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }
  throw err;
}

// ---- Static (includes /.well-known/x402) ------------------------------------
app.get("/.well-known/x402", (_req, res) => {
  res.type("application/json").send(readFileSync(path.join(ROOT, "public/.well-known/x402"), "utf8"));
});
app.get("/skill.md", (_req, res) => {
  res.type("text/markdown").send(readFileSync(path.join(ROOT, "skill.md"), "utf8"));
});
app.use(express.static(path.join(ROOT, "public")));

app.listen(PORT, () => {
  console.log(`x402-reputation listening on http://localhost:${PORT}`);
  console.log("  Pay in USDC on Base or Solana — your client picks the rail.");
  for (const line of payToBanner()) console.log(line);
  console.log("  Paid routes:");
  console.log("    GET  /score/:merchantId    $0.001 -> signed reliability report");
  console.log("    POST /attest               $0.001 -> signed attestation record");
  console.log("  Free routes:");
  console.log("    GET  /merchants            merchants with attestations on file");
  console.log("    GET  /attestations/:id     one signed attestation");
  console.log("    POST /verify               verify any signed artifact");
  console.log("    GET  /.well-known/x402     discovery manifest");
});
