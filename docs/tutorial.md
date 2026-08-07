# Tutorial — x402-reputation

A complete walkthrough: install, run the server, trigger a real 402, pay it on
either rail, and read the artifact you bought.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-reputation
cd x402-reputation
npm install
```

Node 18 or newer.

## 2. Configure

```bash
cp .env.example .env
```

Everything already has a working default, so you can skip straight to step 3.
The variables that matter:

| Variable | Default | What it does |
|---|---|---|
| `PAY_TO_ADDRESS` | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | EVM address paid on the Base rail |
| `SOLANA_PAY_TO_ADDRESS` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | Solana pubkey paid on the Solana rail |
| `NETWORK` | `base-sepolia` | `base` for EVM mainnet |
| `SOLANA_NETWORK` | `devnet` | `mainnet-beta` for Solana mainnet |
| `FACILITATOR_URL` | `https://x402.org/facilitator` | Verifies + settles the **EVM** rail |
| `SOLANA_FACILITATOR_URL` | `https://facilitator.payai.network` | Verifies + settles the **Solana** rail |
| `SIGNING_SECRET` | `dev-secret-change-me` | HMAC key for signed artifacts — change it |
| `PORT` | `4024` | HTTP port |

> The two `payTo` values above are the suite's own public receive addresses.
> **Set your own** if you want to be paid.

## 3. Run the server

```bash
npm run dev
```

The banner prints both rails:

```
x402-reputation listening on http://localhost:4024
  Pay in USDC on Base or Solana — your client picks the rail.
  rail 1  EVM     network=base-sepolia  payTo=0x40252CFDF8B20Ed757D61ff157719F33Ec332402
                  facilitator=https://x402.org/facilitator
  rail 2  Solana  network=solana-devnet  payTo=WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
                  facilitator=https://facilitator.payai.network
```

## 4. Your first 402

There is nothing to score until something has been attested, and an unknown
merchant is a **free** 404 rather than a paid one. So start with the write side —
call the paid attest route with no payment:

```bash
curl -s -i -X POST http://localhost:4024/attest \
  -H 'content-type: application/json' \
  -d '{"merchantId":"osteria-fiorentina.example","outcome":"fulfilled",
       "payment":{"network":"solana-devnet","transaction":"5Kq7xJ2mN","amount":"$0.75"},
       "attestor":"WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"}'
```

You get `HTTP/1.1 402 Payment Required` and a body whose `accepts` array holds
**two** entries — one per rail. `maxAmountRequired` is in USDC base units
(6 decimals), so `1000` = $0.001.

## 5. Pay it

### EVM rail (`x402-fetch`)

```bash
PRIVATE_KEY=0xYourFundedBaseSepoliaKey npm run client
```

`x402-fetch` reads the 402, picks the `base-sepolia` entry, signs an EIP-3009
`transferWithAuthorization` for exactly `maxAmountRequired`, and retries with
the `X-PAYMENT` header. Get testnet USDC from the
[Circle faucet](https://faucet.circle.com/).

### Solana rail

Point any x402 Solana client at the same URL — it picks the `solana-devnet`
entry instead. Browser wallets (Phantom) go through the drop-in
[`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal),
which reads the same 402 and handles the prepare/sign/encode round trip.

Note that the two rails use **different facilitators**. `https://x402.org/facilitator`
settles Base; Solana settlement goes to `SOLANA_FACILITATOR_URL`
(`https://facilitator.payai.network` by default). The server picks the right one
from the rail the payment arrived on. To check whether a facilitator handles a
network, ask it:

```bash
curl -s https://facilitator.payai.network/supported | jq '.kinds[] | select(.network | startswith("solana"))'
```

## 6. Read the artifact

The `200` body **is** the thing you bought — reliability report (fulfillment rate, refund rate, sample attestations).
No callbacks, no polling for a later delivery.

The response also carries `X-PAYMENT-RESPONSE`, a base64 JSON receipt:

```json
{ "success": true, "rail": "evm", "network": "base-sepolia", "transaction": "0x…", "payer": "0x…" }
```

Every artifact is signed with HMAC-SHA256 over its canonical JSON. Check one:

```bash
curl -s -X POST http://localhost:4024/verify \
  -H 'content-type: application/json' -d @artifact.json
# {"valid":true}
```

## 7. Going to mainnet

```bash
NETWORK=base \
SOLANA_NETWORK=mainnet-beta \
PAY_TO_ADDRESS=0xYourRealAddress \
SOLANA_PAY_TO_ADDRESS=YourRealSolanaPubkey \
FACILITATOR_URL=https://your-mainnet-evm-facilitator \
SOLANA_FACILITATOR_URL=https://facilitator.payai.network \
SIGNING_SECRET=$(openssl rand -hex 32) \
npm run build && npm start
```

Mainnet USDC is real money: use mainnet-capable facilitators on **both** rails
(Coinbase CDP's for Base, for example; PayAI already lists `solana` mainnet),
set a real `SIGNING_SECRET`, and put the service behind TLS so the `resource`
URL in the 402 challenge matches what clients actually call.

## 8. How the score is actually computed

For each attestation:

```
credit(outcome) = fulfilled 1.0 | partial 0.5 | refunded 0.25 | failed 0.0
weight(age)     = 0.5 ^ (ageDays / HALF_LIFE_DAYS)
```

Weights and credits are summed **per attestor**, then each attestor is scaled
down so no single wallet exceeds `MAX_ATTESTOR_SHARE` of the total weight:

```
score = 100 * Σ(scaled credit) / Σ(scaled weight)
```

The report carries these parameters in `method`, so a consumer can see exactly
what produced the number instead of trusting an opaque rating. `confidence`
comes from sample size and attestor spread:

| Attestations | Distinct attestors | Confidence |
|---|---|---|
| 0 | — | `none` (free 404) |
| 1-2, or only 1 attestor | — | `low` |
| 3-9, or 2-3 attestors | — | `medium` |
| 10+ and 4+ attestors | — | `high` |

A `low`-confidence 95 is not better than a `high`-confidence 80, and the report
says so rather than hiding it.

## 9. Attestors on both rails

`attestor` accepts **either** rail:

| Input | Parsed as |
|---|---|
| `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `{ rail: "evm", address: "0x40252c…2402" }` |
| `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | `{ rail: "solana", address: "Wwwu…T3WwW" }` |

The report's `attestorsByRail` shows how the evidence splits, and
`payment.rail` is inferred from the network you name — so a merchant that only
ever gets attested by one rail's users is visible as such.

## 10. Duplicates are free

One attestor may attest to one payment once. A repeat gets `409
DUPLICATE_ATTESTATION` **before** the paywall runs, so the second attempt costs
nothing. Same for scoring a merchant nobody has attested to: free `404`.


## Next

- [API reference](api.md) — every route, schema and error
- [For AI agents](agents.md) — discovery, MCP, listing
- [skill.md](https://github.com/nirholas/x402-reputation/blob/main/skill.md) — the agent-facing contract
