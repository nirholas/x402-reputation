# Raw 402 → pay → 200 walkthrough (curl)

Start the server:

```bash
npm run dev
```

## 1. Attest — $0.001 → dual-rail 402

```bash
curl -s -i -X POST http://localhost:4024/attest \
  -H 'content-type: application/json' \
  -d '{"merchantId":"osteria-fiorentina.example","outcome":"fulfilled",
       "payment":{"network":"solana-devnet","transaction":"5Kq7xJ2mN","amount":"$0.75"},
       "attestor":"WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
       "note":"Table was held, seated on time."}'
```

`HTTP/1.1 402 Payment Required`, with **two** entries in `accepts`:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "1000",
      "resource": "http://localhost:4024/attest",
      "description": "Record a signed fulfillment attestation",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": { "name": "USDC", "version": "2" } },
    { "scheme": "exact", "network": "solana-devnet", "maxAmountRequired": "1000",
      "resource": "http://localhost:4024/attest",
      "description": "Record a signed fulfillment attestation",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "extra": { "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4" } }
  ]
}
```

`maxAmountRequired` is in USDC base units (6 decimals): `1000` = $0.001.

## 2. Pay and retry

```bash
PRIVATE_KEY=0x... npm run client
```

The `201` body is the signed attestation record — that is the artifact you
bought — and `X-PAYMENT-RESPONSE` carries the settlement receipt.

## 3. Buy the score

```bash
# unpaid → 402 (same two rails, $0.001)
curl -s -i http://localhost:4024/score/osteria-fiorentina.example
```

The paid `200` body is the signed reliability report: `score`, `grade`,
`fulfillmentRate`, `refundRate`, `outcomes`, `attestorsByRail`, `confidence`,
the `method` used to compute it, and a `sample` of recent attestations.

## 4. Things that are free

```bash
# a merchant nobody has attested to → free 404, no charge
curl -s -i http://localhost:4024/score/nobody.example

# a duplicate attestation → free 409, no charge
# (same attestor, same payment.transaction, same merchant)

# the index, one attestation, and signature checks
curl -s http://localhost:4024/merchants | jq
curl -s http://localhost:4024/attestations/att_YOUR_ID | jq
curl -s -X POST http://localhost:4024/verify \
  -H 'content-type: application/json' -d @report.json | jq
```
