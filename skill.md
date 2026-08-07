# x402-reputation — agent skill

Reliability scoring for x402 merchants, built from **signed fulfillment attestations**. A buyer posts what happened after a payment settled — `fulfilled`, `partial`, `failed` or `refunded` — referencing the transaction hash on either rail, and gets a signed attestation record back. Reading a merchant's score returns a signed reliability report: fulfillment rate, refund rate, outcome breakdown, attestor spread across rails, a sample of recent attestations, and an explicit `confidence` level. Scores are recency-decayed and capped per attestor, so a stale reputation fades and one loud wallet cannot swing a merchant's number.

**Base URL**: `{BASE_URL}` (self-hosted; e.g. `http://localhost:4024`)

## Endpoints

### GET /score/:merchantId — $0.001
Buy a merchant's signed reliability report: score, fulfillment/refund/failure rates, attestor spread, a sample of recent attestations, and confidence.

Response `200`:
```json
{
  "merchantId": "osteria-fiorentina.example",
  "document": "x402-reputation/score",
  "score": 88,
  "grade": "B",
  "fulfillmentRate": 0.833,
  "refundRate": 0.083,
  "failureRate": 0.083,
  "attestations": 12,
  "distinctAttestors": 6,
  "attestorsByRail": {
    "evm": 4,
    "solana": 2
  },
  "outcomes": {
    "fulfilled": 10,
    "partial": 0,
    "failed": 1,
    "refunded": 1
  },
  "volumeAttested": "$8.40",
  "firstSeen": "2025-12-02T18:11:00.000Z",
  "lastSeen": "2026-01-12T11:04:00.000Z",
  "confidence": "high",
  "method": {
    "halfLifeDays": 30,
    "maxAttestorShare": 0.25,
    "outcomeCredit": {
      "fulfilled": 1,
      "partial": 0.5,
      "refunded": 0.25,
      "failed": 0
    }
  },
  "sample": [
    {
      "attestationId": "att_3b7c1e05-49a2-4f6d-8c31-0a5e7d9b2f14",
      "document": "x402-reputation/attestation",
      "merchantId": "osteria-fiorentina.example",
      "outcome": "fulfilled",
      "payment": {
        "rail": "solana",
        "network": "solana-devnet",
        "transaction": "5Kq7xJ2mN…signature…",
        "amount": "$0.75"
      },
      "attestor": {
        "rail": "solana",
        "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
      },
      "note": "Table was held, seated on time.",
      "attestedAt": "2026-01-12T11:04:00.000Z"
    }
  ],
  "computedAt": "2026-01-13T09:00:00.000Z",
  "signature": "c40b…hex hmac…",
  "algorithm": "HMAC-SHA256",
  "settlement": {
    "rail": "evm",
    "network": "base-sepolia",
    "transaction": "0xabc…",
    "payer": "0xPayer…",
    "amount": "1000"
  }
}
```

Merchants with no attestations on file return a **free** `404 NO_ATTESTATIONS` — the paywall declines to charge for an empty report.

### POST /attest — $0.001
Record what happened after a payment settled. Returns the signed attestation record linking the payment tx to the outcome.

Request body:
```json
{
  "merchantId": "osteria-fiorentina.example",
  "outcome": "fulfilled",
  "payment": {
    "network": "solana-devnet",
    "transaction": "5Kq7xJ2mN…",
    "amount": "$0.75"
  },
  "attestor": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
  "note": "Table was held, seated on time."
}
```

`attestor` accepts an EVM address or a Solana pubkey. `payment.transaction` is mandatory — an attestation with no payment behind it is just an opinion.

Response `201`:
```json
{
  "attestationId": "att_3b7c1e05-49a2-4f6d-8c31-0a5e7d9b2f14",
  "document": "x402-reputation/attestation",
  "merchantId": "osteria-fiorentina.example",
  "outcome": "fulfilled",
  "payment": {
    "rail": "solana",
    "network": "solana-devnet",
    "transaction": "5Kq7xJ2mN…signature…",
    "amount": "$0.75"
  },
  "attestor": {
    "rail": "solana",
    "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
  },
  "note": "Table was held, seated on time.",
  "attestedAt": "2026-01-12T11:04:00.000Z",
  "signature": "8fa2…hex hmac…",
  "algorithm": "HMAC-SHA256"
}
```

One attestor may attest to one payment once. A duplicate is rejected **before** the paywall, so the second attempt is free.

### GET /merchants — free
Every merchant with attestations on file, so you know which ids are worth scoring.

Response `200`:
```json
{
  "merchants": [
    {
      "merchantId": "osteria-fiorentina.example",
      "attestations": 12,
      "lastSeen": "2026-01-12T11:04:00.000Z"
    },
    {
      "merchantId": "slowship.example",
      "attestations": 3,
      "lastSeen": "2026-01-05T08:20:00.000Z"
    }
  ]
}
```

### GET /attestations/:id — free
One signed attestation record, so a report's sample can be re-checked individually.

Response `200`:
```json
{
  "attestationId": "att_3b7c1e05-49a2-4f6d-8c31-0a5e7d9b2f14",
  "document": "x402-reputation/attestation",
  "merchantId": "osteria-fiorentina.example",
  "outcome": "fulfilled",
  "payment": {
    "rail": "solana",
    "network": "solana-devnet",
    "transaction": "5Kq7xJ2mN…signature…",
    "amount": "$0.75"
  },
  "attestor": {
    "rail": "solana",
    "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
  },
  "note": "Table was held, seated on time.",
  "attestedAt": "2026-01-12T11:04:00.000Z",
  "signature": "8fa2…hex hmac…",
  "algorithm": "HMAC-SHA256"
}
```

### POST /verify — free
Verify the HMAC-SHA256 signature of any attestation or score report.

Request body:
```json
{
  "attestationId": "att_3b7c1e05-49a2-4f6d-8c31-0a5e7d9b2f14",
  "document": "x402-reputation/attestation",
  "merchantId": "osteria-fiorentina.example",
  "outcome": "fulfilled",
  "payment": {
    "rail": "solana",
    "network": "solana-devnet",
    "transaction": "5Kq7xJ2mN…signature…",
    "amount": "$0.75"
  },
  "attestor": {
    "rail": "solana",
    "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
  },
  "note": "Table was held, seated on time.",
  "attestedAt": "2026-01-12T11:04:00.000Z",
  "signature": "8fa2…hex hmac…",
  "algorithm": "HMAC-SHA256"
}
```

Response `200`:
```json
{
  "valid": true
}
```

### GET /health — free
Liveness probe.

Response `200`:
```json
{
  "ok": true,
  "service": "x402-reputation"
}
```

## Payment — dual rail

**Pay in USDC on Base or Solana — your client picks the rail.**

Every paid route answers an unpaid request with `402` and an `accepts` array
holding both rails:

```json
{
  "x402Version": 1,
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "asset": "USDC (0x036CbD53842c5426634e7929541eC2318f3dCF7e)",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "<base units, 6 decimals>" },
    { "scheme": "exact", "network": "solana-devnet", "asset": "USDC (4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU)",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "<base units, 6 decimals>",
      "extra": { "feePayer": "<facilitator sponsor>" } }
  ]
}
```

- Protocol: **x402** (HTTP 402). Asset **USDC** on both rails.
- EVM networks: `base-sepolia` (default) or `base` (`NETWORK=base`).
- Solana networks: `solana-devnet` (default) or `solana` (`SOLANA_NETWORK=mainnet-beta`).
- Facilitators — **one per rail, they are not interchangeable**:
  - EVM: `https://x402.org/facilitator` (`FACILITATOR_URL`)
  - Solana: `https://facilitator.payai.network` (`SOLANA_FACILITATOR_URL`) — the x402.org facilitator does not settle Solana.
- Pay via `x402-fetch` (EVM), a Solana x402 client, or any x402-capable client: call the route, read `402`, pick an entry from `accepts`, sign, retry with the `X-PAYMENT` header. You get the artifact in the `200` body plus an `X-PAYMENT-RESPONSE` header carrying the settlement receipt (`{ rail, network, transaction, payer }`).

## Error codes

| Status | Code | Meaning |
|---|---|---|
| 402 | — | Payment required — dual-rail x402 challenge with `accepts[]` |
| 400 | `INVALID_WALLET` | `attestor` is neither an EVM address nor a Solana pubkey |
| 400 | `INVALID_MERCHANT_ID` | `merchantId` is not 2-64 chars of `[a-z0-9._:-]` |
| 400 | `MISSING_PAYMENT_TX` | `payment.transaction` is required — every attestation names a settled payment |
| 404 | `NO_ATTESTATIONS` | Nothing on file for that merchant (**not charged**) |
| 404 | `ATTESTATION_NOT_FOUND` | Unknown attestationId |
| 409 | `DUPLICATE_ATTESTATION` | This attestor already attested to this payment (**not charged**) |
| 400 | `BAD_REQUEST` | Malformed body |

## Discovery

Machine-readable manifest: `{BASE_URL}/.well-known/x402` (lists both networks per resource).

## Contact

nichxbt@gmail.com
