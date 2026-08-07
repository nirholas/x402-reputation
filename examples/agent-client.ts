/**
 * Full x402 flow for x402-reputation:
 *   1. post a few signed attestations   ($0.001 each, paid)
 *   2. buy the merchant's score          ($0.001, paid)
 *   3. verify the report offline         (free)
 *
 * Attestors are dual-rail on purpose: the same merchant is attested to by an
 * EVM wallet and a Solana wallet, and the report's `attestorsByRail` shows the
 * split.
 *
 * Usage:
 *   PRIVATE_KEY=0x... BASE_URL=http://localhost:4024 npx tsx examples/agent-client.ts
 */
import { privateKeyToAccount } from "viem/accounts";
import { decodeXPaymentResponse, wrapFetchWithPayment } from "x402-fetch";

const BASE_URL = process.env.BASE_URL || "http://localhost:4024";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MERCHANT = process.env.MERCHANT_ID || "osteria-fiorentina.example";
/** A second attestor on the other rail — a base58 Solana pubkey. */
const SOLANA_ATTESTOR = process.env.SOLANA_ATTESTOR || "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW";

type PayFetch = (input: string, init?: RequestInit) => Promise<Response>;

async function attest(
  payFetch: PayFetch,
  attestor: string,
  outcome: string,
  network: string,
  transaction: string,
  note: string,
): Promise<void> {
  const res = await payFetch(`${BASE_URL}/attest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      merchantId: MERCHANT,
      outcome,
      payment: { network, transaction, amount: "$0.75" },
      attestor,
      note,
    }),
  });
  if (!res.ok) {
    console.error(`  attest(${outcome}) failed:`, res.status, await res.text());
    return;
  }
  const record = (await res.json()) as { attestationId: string; payment: { rail: string } };
  console.log(`  ${outcome} by ${attestor.slice(0, 10)}… → ${record.attestationId} (rail ${record.payment.rail})`);
  const header = res.headers.get("x-payment-response");
  if (header) console.log("    settled:", decodeXPaymentResponse(header));
}

async function main() {
  if (!PRIVATE_KEY) {
    console.error("Set PRIVATE_KEY to a funded base-sepolia key (USDC + a little ETH).");
    process.exit(1);
  }
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  const payFetch = wrapFetchWithPayment(fetch, account) as unknown as PayFetch;

  // 1. Build a little evidence — each attestation names the payment it is about.
  console.log(`Attesting to ${MERCHANT}:`);
  const stamp = Date.now();
  await attest(payFetch, account.address, "fulfilled", "base-sepolia", `0xdemo${stamp}a`, "Delivered as described.");
  await attest(payFetch, SOLANA_ATTESTOR, "fulfilled", "solana-devnet", `sol_demo_${stamp}b`, "Table was held, seated on time.");
  await attest(payFetch, SOLANA_ATTESTOR, "refunded", "solana-devnet", `sol_demo_${stamp}c`, "Cancelled, refunded same day.");

  // A duplicate is rejected BEFORE the paywall — this costs nothing.
  const dup = await payFetch(`${BASE_URL}/attest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      merchantId: MERCHANT,
      outcome: "fulfilled",
      payment: { network: "base-sepolia", transaction: `0xdemo${stamp}a` },
      attestor: account.address,
    }),
  });
  console.log(`\nDuplicate attestation → ${dup.status} (free, no payment taken)`);

  // 2. Buy the report — the artifact is the response body.
  const scoreRes = await payFetch(`${BASE_URL}/score/${encodeURIComponent(MERCHANT)}`);
  if (!scoreRes.ok) {
    console.error("Score failed:", scoreRes.status, await scoreRes.text());
    process.exit(1);
  }
  const report = await scoreRes.json();
  console.log("\nSigned reliability report (the purchased artifact):\n", JSON.stringify(report, null, 2));
  const header = scoreRes.headers.get("x-payment-response");
  if (header) console.log("\nX-PAYMENT-RESPONSE (settlement):\n", decodeXPaymentResponse(header));

  // 3. Verify the signature — free.
  const verified = await (
    await fetch(`${BASE_URL}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The `settlement` echo is excluded from verification server-side, so the
      // whole response body can go straight back in.
      body: JSON.stringify(report),
    })
  ).json();
  console.log("\nReport signature valid:", verified.valid);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/* ---------------------------------------------------------------------------
 * Paying on the Solana rail instead
 * ---------------------------------------------------------------------------
 * Every paid route here answers with a DUAL-RAIL 402: `accepts` holds one
 * base-sepolia entry and one solana-devnet entry. `wrapFetchWithPayment` above
 * picks the EVM one. To pay from a Solana wallet, pick the other entry and
 * build the `X-PAYMENT` envelope yourself:
 *
 *   import {
 *     prepareSolanaCheckout,
 *     encodeX402Payment,
 *   } from "@three-ws/x402-payment-modal/server";
 *
 *   const res = await fetch(url, { method: "POST" });          // 402
 *   const { accepts } = await res.json();
 *   const accept = accepts.find((a) => a.network.startsWith("solana"));
 *
 *   // 1. server-side helper builds the SPL transferChecked the buyer signs.
 *   //    accept.extra.feePayer sponsors the SOL fee, so you need only USDC.
 *   const { tx_base64 } = await prepareSolanaCheckout({
 *     accept, buyer: myPubkey, rpcUrl: process.env.SOLANA_RPC_URL,
 *   });
 *
 *   // 2. sign tx_base64 with your keypair / Phantom.
 *   const signedTxBase64 = await signWithWallet(tx_base64);
 *
 *   // 3. wrap it into the x402 envelope and retry.
 *   const { x_payment } = encodeX402Payment({
 *     accept, signedTxBase64, resourceUrl: url,
 *   });
 *   const paid = await fetch(url, { method: "POST", headers: { "X-PAYMENT": x_payment } });
 *
 * In a browser the drop-in modal does all three steps for you:
 *   <script type="module" src="https://unpkg.com/@three-ws/x402-payment-modal"></script>
 *
 * The raw dual-rail 402 body, for reference:
 *
 *   $ curl -s -i -X POST http://localhost:4024/score/osteria-fiorentina.example
 *   HTTP/1.1 402 Payment Required
 *   {
 *     "x402Version": 1,
 *     "error": "X-PAYMENT header is required",
 *     "accepts": [
 *       { "scheme": "exact", "network": "base-sepolia",  "asset": "0x036CbD…dCF7e",
 *         "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "1000" },
 *       { "scheme": "exact", "network": "solana-devnet", "asset": "4zMMC9…ncDU",
 *         "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "1000",
 *         "extra": { "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4" } }
 *     ]
 *   }
 * ------------------------------------------------------------------------- */
