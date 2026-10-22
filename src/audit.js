// AgentReady audit engine: read-only HTTP probes of a public site. Never pays, signs or posts.
const UA = "AgentReady/1.0 (+https://agentready.astratc.workers.dev)";
const TIMEOUT = 6000;

export function normalize(input) {
  if (!input) throw new Error("need url=<domain or https URL>");
  let s = String(input).trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  const u = new URL(s);
  if (!/^https?:$/.test(u.protocol)) throw new Error("only http(s)");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") ||
      /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.includes(":") || /^\[/.test(h))
    throw new Error("private or invalid host");
  return u;
}

async function get(url, opts = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { redirect: "follow", ...opts, signal: ctl.signal, headers: { "user-agent": UA, accept: opts.accept || "*/*", ...(opts.headers || {}) } });
    const text = (await r.text()).slice(0, 200000);
    return { status: r.status, headers: r.headers, text, url: r.url };
  } catch (e) { return { status: 0, error: String(e.message || e).slice(0, 120), text: "", headers: new Headers() }; }
  finally { clearTimeout(t); }
}
const json = t => { try { return JSON.parse(t); } catch { return null; } };

function parse402(r) {
  const out = { status: r.status, is402: r.status === 402, version: null, accepts: [], header: null, problems: [] };
  if (!out.is402) return out;
  const hdr = r.headers.get("payment-required") || r.headers.get("x-payment-required");
  let body = json(r.text);
  if (hdr) { out.header = "PAYMENT-REQUIRED"; try { body = JSON.parse(atob(hdr)); } catch { out.problems.push("PAYMENT-REQUIRED header is not base64 JSON"); } }
  if (!body) { out.problems.push("402 without a JSON payment-requirements body or PAYMENT-REQUIRED header"); return out; }
  out.version = body.x402Version ?? null;
  if (out.version == null) out.problems.push("missing x402Version");
  out.accepts = (body.accepts || []).map(a => ({ scheme: a.scheme, network: a.network, asset: a.asset, payTo: a.payTo, amount: a.maxAmountRequired ?? a.amount, resource: a.resource, description: a.description, mimeType: a.mimeType, hasOutputSchema: !!a.outputSchema }));
  if (!out.accepts.length) out.problems.push("accepts[] is empty");
  for (const a of out.accepts) {
    if (!a.payTo || !/^0x[0-9a-fA-F]{40}$|^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a.payTo)) out.problems.push("accepts entry has missing/invalid payTo");
    if (!a.asset) out.problems.push("accepts entry missing asset");
    if (!a.description) out.problems.push("accepts entry missing description (hurts discovery)");
    if (!a.hasOutputSchema) out.problems.push("accepts entry missing outputSchema (Bazaar/agents can't see response shape)");
  }
  out.problems = [...new Set(out.problems)];
  return out;
}

function robotsAI(txt) {
  const bots = ["GPTBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "PerplexityBot", "CCBot", "OAI-SearchBot", "ChatGPT-User"];
  const lines = txt.split(/\r?\n/).map(l => l.replace(/#.*/, "").trim()).filter(Boolean);
  const groups = []; let cur = null;
  for (const l of lines) {
    const [k, ...v] = l.split(":"); const key = k.trim().toLowerCase(), val = v.join(":").trim();
    if (key === "user-agent") { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(val.toLowerCase()); }
    else if (cur && (key === "disallow" || key === "allow")) cur.rules.push([key, val]);
  }
  const blocked = a => { const g = groups.find(g => g.agents.includes(a.toLowerCase())) || groups.find(g => g.agents.includes("*")); return !!g && g.rules.some(([k, v]) => k === "disallow" && v === "/"); };
  const res = {}; for (const b of bots) res[b] = blocked(b) ? "blocked" : "allowed";
  return res;
}

export async function audit(input, { full = false } = {}) {
  const u = normalize(input); const origin = u.origin; const started = Date.now();
  const p = path => get(origin + path);
  const [root, target, wk402, did, agentWk, agentRoot, agentCard, mcpWk, llms, robots, openapi, mcpPost] = await Promise.all([
    p("/"), u.pathname !== "/" ? get(u.href) : Promise.resolve(null), p("/.well-known/x402"), p("/.well-known/did.json"),
    p("/.well-known/agent.json"), p("/agent.json"), p("/.well-known/agent-card.json"), p("/.well-known/mcp.json"),
    p("/llms.txt"), p("/robots.txt"), p("/openapi.json"),
    get(origin + "/mcp", { method: "POST", accept: "application/json, text/event-stream", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "agentready", version: "1.0" } } }) }),
  ]);
  const checks = []; const fixes = [];
  const add = (id, weight, pass, detail, fix) => { checks.push({ id, weight, pass: !!pass, detail }); if (!pass && fix) fixes.push({ id, priority: weight >= 15 ? "high" : weight >= 8 ? "medium" : "low", fix }); };

  // x402: probe target path, else resources listed in /.well-known/x402, else root
  const wk = wk402.status === 200 ? json(wk402.text) : null;
  const resources = (wk?.resources || []).filter(r => typeof r === "string").slice(0, full ? 5 : 2);
  let probes = [];
  if (target) probes.push({ url: u.href, r: parse402(target) });
  if (!target || !probes[0].r.is402) {
    const rs = await Promise.all(resources.filter(r => { try { return new URL(r).origin === origin; } catch { return false; } }).map(async r => ({ url: r, r: parse402(await get(r)) })));
    probes.push(...rs);
  }
  if (!probes.length) probes.push({ url: origin + "/", r: parse402(root) });
  const paid = probes.filter(x => x.r.is402);
  add("x402_402_response", 25, paid.length > 0, paid.length ? `${paid.length}/${probes.length} probed resource(s) return 402` : `no 402 found (probed ${probes.map(x => x.url + " -> " + x.r.status).join(", ")})`,
    "Return HTTP 402 with x402 payment requirements (x402Version, accepts[] with scheme, network, asset, payTo, amount) on paid routes. Pass a paid URL as ?url= if your root is free.");
  const probs = [...new Set(paid.flatMap(x => x.r.problems))];
  if (paid.length) add("x402_requirements_valid", 15, probs.length === 0, probs.length ? probs : "payment requirements well-formed", "Fix payment requirements: " + probs.join("; "));
  add("x402_discovery", 8, !!wk?.resources?.length, wk ? `/.well-known/x402 lists ${wk.resources?.length || 0} resource(s)` : `/.well-known/x402 -> ${wk402.status}`,
    "Publish /.well-known/x402 as JSON {version:1, resources:[absolute paid URLs]} so agents and directories can discover your paid endpoints.");
  const d = did.status === 200 ? json(did.text) : null;
  add("did_json", 8, d && d.id && String(d.id).startsWith("did:"), d ? `id=${d.id}` : `/.well-known/did.json -> ${did.status}`,
    `Publish /.well-known/did.json with "id": "did:web:${u.hostname}" and a verificationMethod/service entry.`);
  const ag = [[agentWk, "/.well-known/agent.json"], [agentRoot, "/agent.json"], [agentCard, "/.well-known/agent-card.json"]].map(([r, path]) => ({ path, j: r.status === 200 ? json(r.text) : null })).find(x => x.j);
  add("agent_card", 10, !!ag, ag ? `${ag.path} (name=${ag.j.name || "?"})` : "no agent.json / agent-card.json",
    "Publish /.well-known/agent-card.json (A2A style: name, description, url, skills, contact) and/or /agent.json describing what your agent/API does and how to pay.");
  const mcpOk = (mcpPost.status === 200 && /jsonrpc|serverInfo|protocolVersion/.test(mcpPost.text)) || (mcpPost.status === 401 && /bearer|oauth/i.test(mcpPost.headers.get("www-authenticate") || ""));
  const mcpManifest = mcpWk.status === 200 && json(mcpWk.text);
  add("mcp_endpoint", 10, mcpOk || mcpManifest, mcpOk ? `POST /mcp -> ${mcpPost.status} (MCP server answers)` : mcpManifest ? "/.well-known/mcp.json present" : `POST /mcp -> ${mcpPost.status}; /.well-known/mcp.json -> ${mcpWk.status}`,
    "Expose an MCP server (Streamable HTTP at /mcp) or a /.well-known/mcp.json manifest so agent clients can connect without custom code.");
  const llmsOk = llms.status === 200 && llms.text.trim().startsWith("#") && !/<html/i.test(llms.text.slice(0, 300));
  add("llms_txt", 8, llmsOk, llmsOk ? `llms.txt ${llms.text.length} chars` : `/llms.txt -> ${llms.status}${llms.status === 200 ? " (not markdown)" : ""}`,
    "Add /llms.txt (markdown: # Name, > summary, ## Docs links, prices, how to pay) for LLM/agent readers.");
  const rb = robots.status === 200 && !/<html/i.test(robots.text.slice(0, 200)) ? robotsAI(robots.text) : null;
  const blockedBots = rb ? Object.entries(rb).filter(([, v]) => v === "blocked").map(([k]) => k) : [];
  add("robots_ai_agents", 6, !blockedBots.length, rb ? (blockedBots.length ? "blocks: " + blockedBots.join(", ") : "AI agents allowed") : `/robots.txt -> ${robots.status} (none = allowed)`,
    `robots.txt blocks ${blockedBots.join(", ")} site-wide. If you want agent traffic/sales, allow them at least on your API, docs and llms.txt paths.`);
  const oa = openapi.status === 200 ? json(openapi.text) : null;
  add("openapi", 5, !!oa?.paths, oa ? `openapi ${oa.openapi || oa.swagger} with ${Object.keys(oa.paths || {}).length} paths` : `/openapi.json -> ${openapi.status}`,
    "Publish /openapi.json describing endpoints, parameters and the 402 response so agents can call you correctly.");
  const cors = (paid[0] ? null : null) || root.headers.get("access-control-allow-origin") || wk402.headers.get("access-control-allow-origin");
  add("cors", 5, !!cors, cors ? `access-control-allow-origin: ${cors}` : "no CORS header on / or /.well-known/x402",
    "Send Access-Control-Allow-Origin (and expose PAYMENT-REQUIRED / X-PAYMENT-RESPONSE headers) so browser-based agents can pay.");
  add("https", 0, u.protocol === "https:" , u.protocol, "Serve over HTTPS.");

  const max = checks.reduce((s, c) => s + c.weight, 0), got = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
  const score = Math.round(100 * got / max);
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : score >= 30 ? "D" : "F";
  const out = { target: u.href, origin, checked_at: new Date().toISOString(), ms: Date.now() - started, score, grade,
    passed: checks.filter(c => c.pass).length, total: checks.length, checks: full ? checks : checks.map(({ id, pass, detail }) => ({ id, pass, detail: Array.isArray(detail) ? detail.join("; ") : detail })),
    fixes: fixes.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority])),
    bazaar: { checked: false, note: "Coinbase Bazaar listing is not verified by this tool; Bazaar indexes resources settled via the CDP facilitator with discoverable metadata (description, outputSchema)." } };
  if (full) { out.x402_probes = probes.map(x => ({ url: x.url, ...x.r })); out.robots = rb; out.markdown = toMarkdown(out); }
  return out;
}

export function toMarkdown(a) {
  return `# AgentReady report: ${a.origin}\n\nScore **${a.score}/100 (${a.grade})**, ${a.passed}/${a.total} checks passed. Checked ${a.checked_at}.\n\n## Checks\n| Check | Result | Detail |\n|---|---|---|\n` +
    a.checks.map(c => `| ${c.id} | ${c.pass ? "pass" : "FAIL"} | ${String(Array.isArray(c.detail) ? c.detail.join("; ") : c.detail).replace(/\|/g, "/")} |`).join("\n") +
    `\n\n## Fix list\n` + (a.fixes.length ? a.fixes.map((f, i) => `${i + 1}. **[${f.priority}] ${f.id}**: ${f.fix}`).join("\n") : "Nothing to fix.") +
    `\n\n## Templates\n- /.well-known/x402: \`{"version":1,"resources":["${a.origin}/v1/your-paid-route"]}\`\n- /.well-known/did.json: \`{"@context":"https://www.w3.org/ns/did/v1","id":"did:web:${new URL(a.origin).hostname}"}\`\n- /llms.txt: \`# Your API\\n> One-line summary\\n## Endpoints\\n- GET /v1/x ($0.01, x402 USDC on Base)\`\n\n_${a.bazaar.note}_\n\nNeed it fixed for you? Setup help from $25: carl.astratc@proton.me. Open-source kit: https://github.com/astratc/x402-paywall-kit\n`;
}
