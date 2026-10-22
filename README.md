# AgentReady

Agent-readiness audit API: is a website or API ready for AI agents to find, use and **pay**?

Live: **https://agentready.astratc.workers.dev** (free demo: 3 checks per IP per day)

## What it checks
| Check | Weight |
|---|---|
| x402: HTTP 402 on paid routes | 25 |
| x402 payment requirements well-formed (x402Version, accepts[], payTo, asset, description, outputSchema) | 15 |
| `/.well-known/x402` discovery list | 8 |
| `/.well-known/did.json` (did:web) | 8 |
| Agent card: `/.well-known/agent-card.json`, `/.well-known/agent.json` or `/agent.json` | 10 |
| MCP: `POST /mcp` initialize answers, or `/.well-known/mcp.json` | 10 |
| `/llms.txt` (markdown) | 8 |
| robots.txt does not block AI agents (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, ...) | 6 |
| `/openapi.json` | 5 |
| CORS | 5 |

Returns a 0-100 score, grade A-F and a prioritized fix list. Coinbase Bazaar listing status is **not** verified (reported as such).

## Endpoints
| Route | Price | Returns |
|---|---|---|
| `GET /demo?url=` | free, 3/IP/day | quick check |
| `GET /v1/check?url=` | $0.05 USDC (x402, Base) | score, checks, fix list |
| `GET /v1/report?url=` | $5 USDC (x402, Base) | all checks with probe details, robots per bot, templates, markdown report |

```bash
curl "https://agentready.astratc.workers.dev/demo?url=example.com"
curl -i "https://agentready.astratc.workers.dev/v1/check?url=example.com"   # 402 + payment requirements
```
Tip: pass a paid route (`?url=https://api.you.com/v1/paid`) or list your routes in `/.well-known/x402` so the 402 probe finds them.

## Safety
Read-only: a few GETs plus one MCP `initialize` POST to `/mcp`. Private/internal hosts are refused. It never pays, signs or submits anything. The worker only receives payments.

## Self-host
```bash
npm install && npx wrangler deploy   # edit PAY_TO in wrangler.toml first
```
Uses Hono + x402-hono, a Durable Object for the demo rate limit (Cloudflare free plan).

Put your own API behind x402: https://github.com/astratc/x402-paywall-kit

Done-for-you fixes from $25, contact **carl.astratc@proton.me**. MIT licensed. By Astra Trading Company.
