// AgentReady: agent-readiness audit API. Paid via x402 (USDC on Base). Receives only; never signs or spends.
import { Hono } from "hono";
import { paymentMiddleware } from "x402-hono";
import { audit } from "./audit.js";
import { landing } from "./landing.js";

const app = new Hono();
const BASE = "https://agentready.astratc.workers.dev";
app.use("*", async (c, next) => { await next(); c.res.headers.set("access-control-allow-origin", "*"); c.res.headers.set("access-control-expose-headers", "PAYMENT-REQUIRED, X-PAYMENT-RESPONSE"); });
app.options("*", c => c.body(null, 204, { "access-control-allow-headers": "*", "access-control-allow-methods": "GET, OPTIONS" }));

app.get("/", c => c.html(landing(c.env)));
app.get("/api", c => c.json({ name: "AgentReady", description: "Agent-readiness audit for any website or API: x402, did.json, agent card, MCP, llms.txt, robots, OpenAPI, CORS.", payTo: c.env.PAY_TO, network: c.env.NETWORK,
  endpoints: { "GET /v1/check?url=": c.env.PRICE_CHECK + " quick score + fix list", "GET /v1/report?url=": c.env.PRICE_REPORT + " full report (JSON + markdown, probes, templates)", "GET /demo?url=": `free, ${c.env.DEMO_PER_DAY}/IP/day` },
  source: "https://github.com/astratc/agentready", contact: c.env.CONTACT }));
app.get("/.well-known/x402", c => c.json({ version: 1, resources: [`${BASE}/v1/check`, `${BASE}/v1/report`], instructions: "GET ?url=<domain>. Pay via x402 v1 (exact, USDC on Base). Docs: " + BASE + "/llms.txt" }));
app.get("/.well-known/did.json", c => c.json({ "@context": ["https://www.w3.org/ns/did/v1"], id: "did:web:agentready.astratc.workers.dev",
  service: [{ id: "#api", type: "x402API", serviceEndpoint: BASE + "/api" }] }));
const card = c => ({ name: "AgentReady", description: "Audits a URL for AI-agent readiness and x402 payment support; returns a score and fix list.", url: BASE, version: "1.0.0", provider: { organization: "Astra Trading Company", url: "https://astratc.github.io" },
  skills: [{ id: "check", name: "Quick check", description: "Score + fix list, $0.05 USDC (x402)" }, { id: "report", name: "Full report", description: "Detailed JSON + markdown report, $5 USDC (x402)" }], payment: { protocol: "x402", network: c.env.NETWORK, asset: "USDC", payTo: c.env.PAY_TO }, contact: c.env.CONTACT });
app.get("/.well-known/agent-card.json", c => c.json(card(c))); app.get("/agent.json", c => c.json(card(c)));
app.get("/llms.txt", c => c.text(`# AgentReady\n> Agent-readiness audit API. Give it a URL; it checks x402 (402 + payment requirements), /.well-known/x402, did.json, agent card, MCP, llms.txt, robots.txt AI rules, OpenAPI and CORS, and returns a 0-100 score with a fix list.\n\n## Endpoints\n- GET ${BASE}/v1/check?url=example.com (${c.env.PRICE_CHECK} USDC, x402 on Base)\n- GET ${BASE}/v1/report?url=example.com (${c.env.PRICE_REPORT} USDC, x402 on Base): full JSON + markdown\n- GET ${BASE}/demo?url=example.com (free, ${c.env.DEMO_PER_DAY} per IP per day)\n\n## Source\nhttps://github.com/astratc/agentready (MIT)\n\n## Contact\n${c.env.CONTACT}\n`));
app.get("/openapi.json", c => { const q = { name: "url", in: "query", required: true, schema: { type: "string" }, description: "domain or https URL (pass a paid route to test its 402)" };
  const op = (s, price) => ({ get: { summary: s, parameters: [q], "x-payment-info": { protocols: [{ x402: {} }], price: { mode: "fixed", currency: "USD", amount: price.replace("$", "") } }, responses: { 200: { description: "audit JSON" }, 402: { description: "Payment required (x402, USDC on Base)" } } } });
  return c.json({ openapi: "3.1.0", info: { title: "AgentReady", version: "1.0.0", contact: { email: "carl.astratc@proton.me", url: "https://github.com/astratc/agentready" }, "x-guidance": "Audit a domain or URL for AI-agent readiness (x402, did.json, agent cards, MCP, llms.txt, OpenAPI, CORS, robots). GET /v1/check?url=... ($0.05) returns score+summary; GET /v1/report?url=... ($5) returns full fix list. Pay via x402 USDC on Base. /demo is free, 3/IP/day." }, servers: [{ url: BASE }], paths: { "/v1/check": op("Quick agent-readiness check", c.env.PRICE_CHECK), "/v1/report": op("Full agent-readiness report", c.env.PRICE_REPORT), "/demo": { get: { security: [], summary: "Free demo (3/IP/day)", parameters: [q], responses: { 200: { description: "audit JSON" }, 429: { description: "daily demo limit" } } } } } }); });

// free demo, rate-limited per IP per UTC day via a Durable Object counter
app.get("/demo", async c => {
  const raw = c.req.header("cf-connecting-ip") || "0"; const ip = raw.includes(":") ? raw.split(":").slice(0, 3).join(":") + "::/48" : raw; const day = new Date().toISOString().slice(0, 10);
  const lim = +c.env.DEMO_PER_DAY || 3; const key = `demo:${day}:${ip}`;
  let n;
  if (c.env.LIMITER) { const stub = c.env.LIMITER.get(c.env.LIMITER.idFromName(key)); n = await (await stub.fetch("https://do/hit?lim=" + lim)).json(); if (n > lim) return c.json({ error: "demo_limit", detail: `free demo is ${lim} checks per IP per day; use /v1/check (${c.env.PRICE_CHECK} via x402)` }, 429); }
  let res; try { res = await audit(c.req.query("url")); } catch (e) { return c.json({ error: String(e.message) }, 400); }
  res.demo = { used: n, limit: lim, note: "Demo shows the quick check. Full report with probes, templates and markdown: /v1/report ($5)." };
  return c.json(res);
});

const outSchema = { type: "object", properties: { score: { type: "number" }, grade: { type: "string" }, checks: { type: "array" }, fixes: { type: "array" } } };
const inSchema = { queryParams: { url: { type: "string", required: true, description: "domain or https URL to audit" } } };
app.use("/v1/*", (c, next) => paymentMiddleware(c.env.PAY_TO, {
  "/v1/check": { price: c.env.PRICE_CHECK, network: c.env.NETWORK, config: { description: "AgentReady quick check: agent-readiness score (x402, did.json, agent card, MCP, llms.txt, robots, OpenAPI, CORS) + fix list. Query: url=", mimeType: "application/json", inputSchema: inSchema, outputSchema: outSchema, discoverable: true } },
  "/v1/report": { price: c.env.PRICE_REPORT, network: c.env.NETWORK, config: { description: "AgentReady full report: all checks with x402 probe details, robots per AI bot, fix list, templates and markdown report. Query: url=", mimeType: "application/json", inputSchema: inSchema, outputSchema: { ...outSchema, properties: { ...outSchema.properties, markdown: { type: "string" }, x402_probes: { type: "array" } } }, discoverable: true, maxTimeoutSeconds: 120 } },
}, { url: c.env.FACILITATOR_URL })(c, next));
const run = full => async c => { try { return c.json(await audit(c.req.query("url"), { full })); } catch (e) { return c.json({ error: String(e.message) }, 400); } };
app.get("/v1/check", run(false));
app.get("/v1/report", run(true));
app.onError((e, c) => c.json({ error: "internal_error", detail: String(e.message).slice(0, 200) }, 500));
export class Limiter { constructor(state) { this.s = state.storage; }
  async fetch(req) { const n = ((await this.s.get("n")) || 0) + 1; if (n === 1) await this.s.setAlarm(Date.now() + 90000000); await this.s.put("n", n); return Response.json(n); }
  async alarm() { await this.s.deleteAll(); } }
export default app;
