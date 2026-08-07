# Expose x402-reputation as an MCP tool

Give Claude (Desktop, Code, or any MCP client) direct access to this service.
The agent pays per call over x402 — on the Base rail with an EVM key, or on the
Solana rail with a Solana keypair.

## 1. A minimal MCP server

```ts
// mcp-x402-reputation.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

const BASE = process.env.REPUTATION_URL ?? "http://localhost:4024";
const payFetch = wrapFetchWithPayment(
  fetch,
  privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`),
);

const server = new McpServer({ name: "x402-reputation", version: "0.1.0" });

server.tool(
  "check_merchant_reliability",
  "Buy a merchant's signed reliability report ($0.001). Returns score, rates, sample attestations and confidence.",
  { merchantId: z.string().describe("Domain, payTo address, or service slug") },
  async ({ merchantId }) => {
    const res = await payFetch(`${BASE}/score/${encodeURIComponent(merchantId)}`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

server.tool(
  "attest_fulfillment",
  "Record what happened after a payment settled ($0.001). Returns the signed attestation record.",
  {
    merchantId: z.string(),
    outcome: z.enum(["fulfilled", "partial", "failed", "refunded"]),
    network: z.string().describe("e.g. base-sepolia or solana-devnet"),
    transaction: z.string().describe("Settlement tx hash / signature"),
    amount: z.string().optional(),
    attestor: z.string().describe("Your wallet: EVM address or Solana pubkey"),
    note: z.string().optional(),
  },
  async ({ merchantId, outcome, network, transaction, amount, attestor, note }) => {
    const res = await payFetch(`${BASE}/attest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ merchantId, outcome, payment: { network, transaction, amount }, attestor, note }),
    });
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
```

```bash
npm i @modelcontextprotocol/sdk zod viem x402-fetch
```

## 2. Register it with Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x402-reputation": {
      "command": "npx",
      "args": ["-y", "tsx", "/absolute/path/to/mcp-x402-reputation.ts"],
      "env": {
        "PRIVATE_KEY": "0xYourFundedBaseSepoliaKey",
        "REPUTATION_URL": "http://localhost:4024"
      }
    }
  }
}
```

For Claude Code: `claude mcp add x402-reputation -- npx -y tsx /absolute/path/to/mcp-x402-reputation.ts`

## 3. Paying on Solana instead

`wrapFetchWithPayment` covers the EVM rail. For the Solana rail, swap it for an
x402 Solana client (or the browser modal's
[`/server` helpers](https://www.npmjs.com/package/@three-ws/x402-payment-modal))
and select the `solana-devnet` / `solana` entry from the 402 `accepts` array.
The tool definitions above do not change — only the fetch wrapper does.

## 4. Spending guardrails

Give the MCP server its own funded key with a small balance. Every route here is
sub-cent to a few cents, and the price is quoted in the 402 before anything is
signed, so an agent can refuse a call whose price exceeds its budget.

Full endpoint reference: [skill.md](https://github.com/nirholas/x402-reputation/blob/main/skill.md).
