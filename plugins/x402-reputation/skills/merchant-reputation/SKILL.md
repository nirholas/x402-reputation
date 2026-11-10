---
name: merchant-reputation
description: Record signed fulfilment attestations and buy merchant reliability scores over x402. Use when an agent should check whether a merchant actually delivered before paying, or report the outcome of a payment.
---

# x402-reputation merchant scores

Agents attest to what happened after a settled payment (the outcome and the payment transaction). The service turns attestations into a signed, weighted reliability report per merchant.

## Run the server

The repo is a self-hosted Express service. It is not published to npm, so run it from a clone.

```bash
git clone https://github.com/nirholas/x402-reputation && cd x402-reputation
npm install
cp .env.example .env   # optional: the defaults run out of the box
npm run dev            # listens on http://localhost:4024 (override with PORT)
```

Set `PAY_TO_ADDRESS` (Base) and `SOLANA_PAY_TO_ADDRESS` (Solana) in `.env` to receive payments yourself.
Tuning knobs in `.env.example`: `HALF_LIFE_DAYS`, `MAX_ATTESTOR_SHARE`, `SAMPLE_SIZE`; `SIGNING_SECRET` signs documents; `DATA_DIR` holds state.
`GET http://localhost:4024/.well-known/x402` lists every route with its price, and `GET /health` is the liveness probe.

## Routes

| Route | Price | Purpose |
|---|---|---|
| `GET /score/:merchantId` | $0.001 | Signed report: score, grade, fulfilment, refund and failure rates, attestor spread, confidence |
| `POST /attest` | $0.001 | Body: `merchantId`, `outcome` (for example `fulfilled`), `payment` (`network`, `transaction`, `amount`), `attestor` (EVM address or Solana pubkey), optional `note` |
| `GET /merchants` | free | Known merchants |
| `GET /attestations/:id` | free | One attestation |
| `POST /verify` | free | Verify a signed document |

`merchantId` is 2 to 64 chars of `[a-z0-9._:-]`. Errors: 400 `INVALID_WALLET`, `INVALID_MERCHANT_ID`, `MISSING_PAYMENT_TX`; 404 `NO_ATTESTATIONS`, `ATTESTATION_NOT_FOUND`; 409 `DUPLICATE_ATTESTATION`. Payment settles before these checks on paid routes, so list `GET /merchants` first.

The full request and response schemas are in `skill.md` at the repo root (the running server also serves it at `GET /skill.md`).

## Paying

Paid routes answer an unpaid request with HTTP 402 and an `accepts` array with one entry per rail (USDC on Base and USDC on Solana). A client picks an entry, signs, and retries with the `X-PAYMENT` header. The 200 body carries the artifact and an `X-PAYMENT-RESPONSE` header carries the settlement receipt. Any x402 client works (`x402-fetch` with `viem` on the EVM rail). Each paid call spends real USDC on whichever network the server is configured for (`NETWORK`, `SOLANA_NETWORK`), so show the user the route, price and network and get a yes before paying.

## Worked example

```bash
curl -s http://localhost:4024/merchants
```

Choose a merchant, then after the user approves the $0.001, pay `GET /score/<merchantId>` and read `score` and `confidence`. After a purchase from that merchant settles, report it with `POST /attest` (also $0.001) naming the payment transaction.
