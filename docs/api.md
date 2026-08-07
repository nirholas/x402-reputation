# API reference — x402-reputation

Base URL: `http://localhost:4024` in development.

All paid routes speak **x402** and offer **two rails** — USDC on Base (EVM) and
USDC on Solana. The 402 challenge lists both; your client picks one. The
purchased artifact is always in the `200` body.

| Route | Price | Returns |
|---|---|---|
| `GET /score/:merchantId` | $0.001 | Reliability report (fulfillment rate, refund rate, sample attestations) |
| `POST /attest` | $0.001 | Signed attestation record (links payment tx + outcome) |
| `GET /merchants` | free | Merchant index with attestation counts |
| `GET /attestations/:id` | free | Signed attestation record |
| `POST /verify` | free | `{ valid: true | false }` |
| `GET /health` | free | `{ ok: true }` |

Every artifact is signed: `signature` is an HMAC-SHA256 (hex) over the
canonical JSON of the artifact minus `signature`/`algorithm`, keyed by
`SIGNING_SECRET`. `POST /verify` re-checks it for free.

---

## GET /score/:merchantId

**Price**: $0.001 — USDC on Base or Solana  
**Returns**: Reliability report (fulfillment rate, refund rate, sample attestations)

Buy a merchant's signed reliability report: score, fulfillment/refund/failure rates, attestor spread, a sample of recent attestations, and confidence.

### Path parameters

| Name | Description |
|---|---|
| `merchantId` | Domain, payTo address, or service slug — 2-64 chars of `[a-z0-9._:-]` |

### Example request

```bash
# unpaid → 402 with both rails
curl -s -i http://localhost:4024/score/osteria-fiorentina.example

# paid (EVM rail)
PRIVATE_KEY=0x... npm run client
```

### Example response (`200`)

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

### Unpaid (`402`)

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:4024/score/:merchantId",
      "description": "Buy a merchant's signed reliability report: score, fulfillment/refund/failure rates, attestor spread, a sample of recent attestations, and confidence.",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 120,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    },
    {
      "scheme": "exact",
      "network": "solana-devnet",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:4024/score/:merchantId",
      "description": "Buy a merchant's signed reliability report: score, fulfillment/refund/failure rates, attestor spread, a sample of recent attestations, and confidence.",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 120,
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "extra": {
        "feePayer": "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5"
      }
    }
  ]
}
```

### Errors

| Status | Code | Meaning |
|---|---|---|
| 404 | `NO_ATTESTATIONS` | Nothing on file for that merchant — not charged |
| 400 | `INVALID_MERCHANT_ID` | Malformed merchantId |

---

## POST /attest

**Price**: $0.001 — USDC on Base or Solana  
**Returns**: Signed attestation record (links payment tx + outcome)

Record what happened after a payment settled. Returns the signed attestation record linking the payment tx to the outcome.

### Body parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `merchantId` | string | — | **Required.** 2-64 chars of `[a-z0-9._:-]` |
| `outcome` | `fulfilled`\|`partial`\|`failed`\|`refunded` | `fulfilled` | What actually happened |
| `payment.transaction` | string | — | **Required.** Settlement tx hash / signature, ≤128 chars |
| `payment.network` | string | `base-sepolia` | Network the payment settled on; the rail is inferred from it |
| `payment.amount` | string | `$0.00` | What was paid, for the volume total |
| `attestor` | string | — | **Required.** Your wallet: EVM address or Solana pubkey |
| `note` | string | `""` | Free text, ≤280 chars, included in report samples |

### Example request

```bash
# unpaid → 402 with both rails
curl -s -i -X POST http://localhost:4024/attest -H 'content-type: application/json' \
  -d '{"merchantId":"osteria-fiorentina.example","outcome":"fulfilled",
       "payment":{"network":"base-sepolia","transaction":"0xabc","amount":"$0.75"},
       "attestor":"0x40252CFDF8B20Ed757D61ff157719F33Ec332402"}'

# paid (EVM rail)
PRIVATE_KEY=0x... npm run client
```

### Example response (`201`)

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

### Unpaid (`402`)

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:4024/attest",
      "description": "Record what happened after a payment settled. Returns the signed attestation record linking the payment tx to the outcome.",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 120,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    },
    {
      "scheme": "exact",
      "network": "solana-devnet",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:4024/attest",
      "description": "Record what happened after a payment settled. Returns the signed attestation record linking the payment tx to the outcome.",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 120,
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "extra": {
        "feePayer": "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5"
      }
    }
  ]
}
```

### Errors

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_WALLET` | attestor is not an EVM address or Solana pubkey |
| 400 | `MISSING_PAYMENT_TX` | payment.transaction is required |
| 409 | `DUPLICATE_ATTESTATION` | This attestor already attested to this payment — not charged |

---

## GET /merchants

**Price**: free  
**Returns**: Merchant index with attestation counts

Every merchant with attestations on file, so you know which ids are worth scoring.

### Example request

```bash
curl -s http://localhost:4024/merchants
```

### Example response (`200`)

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

---

## GET /attestations/:id

**Price**: free  
**Returns**: Signed attestation record

One signed attestation record, so a report's sample can be re-checked individually.

### Path parameters

| Name | Description |
|---|---|
| `id` | The attestationId |

### Example request

```bash
curl -s http://localhost:4024/attestations/att_YOUR_ID
```

### Example response (`200`)

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

### Errors

| Status | Code | Meaning |
|---|---|---|
| 404 | `ATTESTATION_NOT_FOUND` | Unknown attestationId |

---

## POST /verify

**Price**: free  
**Returns**: `{ valid: true | false }`

Verify the HMAC-SHA256 signature of any attestation or score report.

### Example request

```bash
curl -s -X POST http://localhost:4024/verify -H 'content-type: application/json' -d @report.json
```

### Example response (`200`)

```json
{
  "valid": true
}
```

---

## GET /health

**Price**: free  
**Returns**: `{ ok: true }`

Liveness probe.

### Example request

```bash
curl -s http://localhost:4024/health
```

### Example response (`200`)

```json
{
  "ok": true,
  "service": "x402-reputation"
}
```


---

## Payment headers

| Header | Direction | Meaning |
|---|---|---|
| `X-PAYMENT` | request | Base64 x402 payload. EVM: signed EIP-3009 authorization. Solana: signed serialized transaction. |
| `X-PAYMENT-RESPONSE` | response | Base64 `{ success, rail, network, transaction, payer }` settlement receipt. |

Paid responses also echo that receipt in the body under `settlement`, purely for
convenience. It is attached **after** the artifact is signed and is excluded from
signature verification, so you can post a whole paid response body straight to
`POST /verify` and still get `{ "valid": true }`.

## Global error shape

```json
{ "error": "CODE", "message": "human readable explanation" }
```
