# x402-reputation

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![x402](https://img.shields.io/badge/payments-x402-0052ff.svg)](https://x402.org)
[![USDC on Base + Solana](https://img.shields.io/badge/USDC-Base%20%2B%20Solana-0052ff.svg)](https://x402.org)

**did the merchant actually deliver?** — Reliability scores built from signed fulfillment attestations — each one tied to a payment that provably settled. Recency-decayed, per-attestor capped, and honest about its own confidence.

## Why x402 for this

Reputation systems normally cost nothing to write to, which is exactly why they fill with noise. Charging a cent per attestation puts a real, tiny price on every claim, and because each attestation must name the settled payment it is about, the cost of manufacturing a fake history scales with the cost of manufacturing fake payments. Reading is priced the same way: an agent about to spend money on a merchant can buy the merchant's record for a tenth of a cent, in one request, with the report in the response.

## Pay in USDC on Base **or** Solana — your client picks the rail

Every paid route answers an unpaid request with a 402 whose `accepts` array
carries both rails:

| Rail | Networks | Asset | payTo |
|---|---|---|---|
| EVM | `base-sepolia` (default) · `base` | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana-devnet` (default) · `solana` | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Each rail settles through **its own facilitator** — they are not interchangeable:

| Rail | Facilitator | Env |
|---|---|---|
| EVM | `https://x402.org/facilitator` | `FACILITATOR_URL` |
| Solana | `https://facilitator.payai.network` | `SOLANA_FACILITATOR_URL` |

The x402.org reference facilitator settles Base but not Solana, so the Solana
rail defaults to PayAI's. On Solana, `extra.feePayer` is that facilitator's
sponsor account — discovered from its `/supported` endpoint at boot — so a payer
needs only USDC, never SOL for gas.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-reputation && cd x402-reputation
npm install
cp .env.example .env       # optional — every value has a working default
npm run dev

# in another terminal, the full paid flow on the EVM rail:
PRIVATE_KEY=0xYourFundedBaseSepoliaKey npm run client
```


## API

| Route | Price | What you get back |
|---|---|---|
| `GET /score/:merchantId` | $0.001 | Reliability report (fulfillment rate, refund rate, sample attestations) |
| `POST /attest` | $0.001 | Signed attestation record (links payment tx + outcome) |
| `GET /merchants` | free | Merchant index with attestation counts |
| `GET /attestations/:id` | free | Signed attestation record |
| `POST /verify` | free | `{ valid: true | false }` |
| `GET /health` | free | `{ ok: true }` |
| `GET /.well-known/x402` | free | Machine-readable discovery manifest |

Both paid routes decline to charge when they cannot produce an artifact: an unknown merchant gets a **free** `404`, and a duplicate attestation gets a **free** `409`. You only ever pay for a report or a record you actually receive.

## How x402 works here

1. Call a paid route with no payment → **402** with `accepts[]` quoting the exact price on **both** rails.
2. Your client picks a rail and signs: EIP-3009 `transferWithAuthorization` (EVM) or a serialized SPL transfer (Solana).
3. Retry with the `X-PAYMENT` header. The facilitator **for that rail** verifies and settles.
4. The server returns **the artifact in the 200 body**, plus `X-PAYMENT-RESPONSE` carrying `{ rail, network, transaction, payer }`.

Mainnet: `NETWORK=base`, `SOLANA_NETWORK=mainnet-beta`, and mainnet-capable
`FACILITATOR_URL` / `SOLANA_FACILITATOR_URL`.

## Real backend / API keys

Fully self-contained — **no external APIs and no API keys**. State is file-based (`data/attestations.json`) and scores are computed on demand from it.
Artifacts are signed with HMAC-SHA256 using `SIGNING_SECRET`; the dev default
(`dev-secret-change-me`) is public, so set your own in production.

## For AI agents

- **skill.md**: [skill.md](skill.md) — agent-facing endpoints, prices, schemas, error codes.
- **Discovery manifest**: [`/.well-known/x402`](public/.well-known/x402), served live by the app, listing **both networks per resource** — indexable by [x402scan.com](https://x402scan.com), the x402 Bazaar, and [agentic.market](https://agentic.market). List your deployment there so paying agents can find it.
- **MCP**: [examples/mcp-tool.md](examples/mcp-tool.md) — wrap these routes as MCP tools for Claude.
- **Raw flow**: [examples/curl.md](examples/curl.md) — the 402 → pay → 200 walkthrough by hand.

## Docs

Full docs on GitHub Pages: **https://nirholas.github.io/x402-reputation/** — [tutorial](docs/tutorial.md) · [API reference](docs/api.md) · [for agents](docs/agents.md)

Part of the [x402 Suite](https://github.com/nirholas/x402-suite).

## Support

nichxbt@gmail.com

## License

[Apache-2.0](LICENSE)
