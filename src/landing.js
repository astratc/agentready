export const landing = env => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgentReady: is your site ready for AI agents?</title><meta name="description" content="Audit any URL for AI-agent readiness: x402 payments, did.json, agent card, MCP, llms.txt, robots rules.">
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:820px;margin:auto;padding:24px;color:#111}code,pre{background:#f3f3f3;border-radius:6px}pre{padding:12px;overflow:auto}code{padding:1px 4px}
.card{border:1px solid #ddd;border-radius:10px;padding:16px;margin:14px 0}input{padding:10px;width:65%;font-size:16px}button{padding:10px 16px;font-size:16px;cursor:pointer}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px}.p{color:#0a7d2c}.f{color:#b00020}</style></head><body>
<h1>AgentReady</h1><p>Is your website or API ready for AI agents to find, use and <b>pay</b>? AgentReady checks it and tells you exactly what to fix.</p>
<div class="card"><b>Checks:</b> x402 (HTTP 402 + valid payment requirements), <code>/.well-known/x402</code> discovery, <code>/.well-known/did.json</code>, agent card (<code>agent.json</code> / <code>agent-card.json</code>), MCP endpoint, <code>llms.txt</code>, robots.txt rules for AI bots, OpenAPI, CORS. Result: a 0-100 score, grade and prioritized fix list.</div>
<h2>Try it free</h2><p>${env.DEMO_PER_DAY} free checks per IP per day.</p>
<form id="f"><input id="u" placeholder="example.com or https://api.example.com/v1/paid" required> <button>Check</button></form><div id="out"></div>
<h2>Pricing (USDC on Base via x402, no account or API key)</h2>
<table><tr><th>Endpoint</th><th>Price</th><th>What you get</th></tr>
<tr><td><code>GET /v1/check?url=</code></td><td>${env.PRICE_CHECK}</td><td>Score, grade, checks, fix list</td></tr>
<tr><td><code>GET /v1/report?url=</code></td><td>${env.PRICE_REPORT}</td><td>Full report: probe details, per-bot robots, templates, markdown</td></tr>
<tr><td>Done-for-you fixes</td><td>from $25</td><td>We implement the fixes. Email ${env.CONTACT}</td></tr></table>
<h2>curl</h2><pre>curl "https://agentready.astratc.workers.dev/demo?url=example.com"
curl -i "https://agentready.astratc.workers.dev/v1/check?url=example.com"   # 402 + payment requirements
# pay with any x402 client, e.g. x402-fetch / x402-axios, then retry with the X-PAYMENT header</pre>
<p>Tip: if your paid routes aren't at the root, pass one directly (e.g. <code>?url=https://api.you.com/v1/paid</code>) so the 402 check probes it, or list them in <code>/.well-known/x402</code>.</p>
<p>Machine-readable: <a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">openapi.json</a> · <a href="/.well-known/x402">.well-known/x402</a> · <a href="/agent.json">agent.json</a></p>
<p>Open source (MIT): <a href="https://github.com/astratc/agentready">github.com/astratc/agentready</a> · Put your own API behind x402: <a href="https://github.com/astratc/x402-paywall-kit">x402-paywall-kit</a></p>
<p>Contact: <a href="mailto:${env.CONTACT}">${env.CONTACT}</a> · by Astra Trading Company</p>
<p style="color:#666;font-size:13px">AgentReady sends a few read-only GET requests (and one MCP initialize POST to /mcp) to the site you enter. It never pays, signs or submits anything. Bazaar listing status is not verified.</p>
<script>f.onsubmit=async e=>{e.preventDefault();out.innerHTML="Checking...";const r=await fetch("/demo?url="+encodeURIComponent(u.value));const d=await r.json();
if(!r.ok){out.innerHTML="<p class=f>"+(d.detail||d.error)+"</p>";return}
const esc=s=>String(s).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
out.innerHTML="<h3>"+esc(d.origin)+": "+d.score+"/100 ("+d.grade+")</h3><table>"+d.checks.map(c=>"<tr><td>"+c.id+"</td><td class="+(c.pass?"p>pass":"f>fail")+"</td><td>"+esc(c.detail)+"</td></tr>").join("")+"</table><h3>Fix list</h3><ol>"+d.fixes.map(x=>"<li><b>["+x.priority+"]</b> "+esc(x.fix)+"</li>").join("")+"</ol><p>Demo "+d.demo.used+"/"+d.demo.limit+" today.</p>"}</script>
</body></html>`;
