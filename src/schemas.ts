/**
 * Per-route request/response schemas published in the x402 402 challenge.
 *
 * Generated from `openapi.json` so the discovery metadata and the runtime
 * challenge cannot drift apart: `accepts[].outputSchema.input` describes how to
 * call the route, `accepts[].outputSchema.output` describes what the paid 200
 * returns. Keys match the paywall route map in `server.ts` exactly.
 *
 * Update `openapi.json` first, then re-derive this file.
 */

/** x402 Bazaar-style schema pair carried by every accept entry. */
export type RouteSchema = {
  /** How to invoke the route: method, query params and/or JSON body fields. */
  input: Record<string, unknown>;
  /** JSON Schema of the paid 200 response body. */
  output: Record<string, unknown>;
};

export const ROUTE_SCHEMAS: Record<string, RouteSchema> = {
  "GET /score/:merchantId": {
    "input": {
      "type": "http",
      "method": "GET",
      "pathParams": {
        "merchantId": {
          "type": "string",
          "description": "Domain, payTo address, or service slug — 2-64 chars of `[a-z0-9._:-]`"
        }
      },
      "queryParams": {}
    },
    "output": {
      "type": "object",
      "properties": {
        "merchantId": {
          "type": "string"
        },
        "document": {
          "const": "x402-reputation/score"
        },
        "score": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "grade": {
          "type": "string",
          "enum": [
            "A",
            "B",
            "C",
            "D",
            "F"
          ]
        },
        "fulfillmentRate": {
          "type": "number"
        },
        "refundRate": {
          "type": "number"
        },
        "failureRate": {
          "type": "number"
        },
        "attestations": {
          "type": "integer"
        },
        "distinctAttestors": {
          "type": "integer"
        },
        "attestorsByRail": {
          "type": "object"
        },
        "outcomes": {
          "type": "object"
        },
        "volumeAttested": {
          "type": "string"
        },
        "firstSeen": {
          "type": "string",
          "format": "date-time"
        },
        "lastSeen": {
          "type": "string",
          "format": "date-time"
        },
        "confidence": {
          "type": "string",
          "enum": [
            "none",
            "low",
            "medium",
            "high"
          ]
        },
        "method": {
          "type": "object",
          "description": "The exact scoring parameters used — half-life, attestor cap, outcome credits"
        },
        "sample": {
          "type": "array",
          "items": {
            "type": "object"
          }
        },
        "computedAt": {
          "type": "string",
          "format": "date-time"
        },
        "signature": {
          "type": "string"
        },
        "algorithm": {
          "const": "HMAC-SHA256"
        }
      }
    }
  },
  "POST /attest": {
    "input": {
      "type": "http",
      "method": "POST",
      "bodyType": "json",
      "bodyFields": {
        "merchantId": {
          "type": "string"
        },
        "outcome": {
          "type": "string",
          "enum": [
            "fulfilled",
            "partial",
            "failed",
            "refunded"
          ]
        },
        "payment": {
          "type": "object",
          "required": [
            "transaction"
          ],
          "properties": {
            "transaction": {
              "type": "string"
            },
            "network": {
              "type": "string"
            },
            "amount": {
              "type": "string"
            }
          }
        },
        "attestor": {
          "type": "string"
        },
        "note": {
          "type": "string",
          "maxLength": 280
        }
      },
      "bodyFieldsRequired": [
        "merchantId",
        "attestor",
        "payment"
      ]
    },
    "output": {
      "type": "object",
      "properties": {
        "attestationId": {
          "type": "string"
        },
        "document": {
          "const": "x402-reputation/attestation"
        },
        "merchantId": {
          "type": "string"
        },
        "outcome": {
          "type": "string",
          "enum": [
            "fulfilled",
            "partial",
            "failed",
            "refunded"
          ]
        },
        "payment": {
          "type": "object",
          "properties": {
            "rail": {
              "type": "string",
              "enum": [
                "evm",
                "solana",
                "unknown"
              ]
            },
            "network": {
              "type": "string"
            },
            "transaction": {
              "type": "string"
            },
            "amount": {
              "type": "string"
            }
          }
        },
        "attestor": {
          "type": "object",
          "description": "Dual-rail wallet identity",
          "properties": {
            "rail": {
              "type": "string",
              "enum": [
                "evm",
                "solana"
              ]
            },
            "address": {
              "type": "string",
              "description": "Lowercased 0x address, or base58 Solana pubkey"
            }
          }
        },
        "note": {
          "type": "string"
        },
        "attestedAt": {
          "type": "string",
          "format": "date-time"
        },
        "signature": {
          "type": "string"
        },
        "algorithm": {
          "const": "HMAC-SHA256"
        }
      }
    }
  },
};
