/* ============================================================================
   Shared secure proxy to the xAI Grok API, used by every /api/ai/* route.

   XAI_API_KEY lives only in the deployment environment — never in browser
   code, localStorage, or the repository. Authentication is delegated to the
   deployment platform (these previews sit behind Vercel SSO); a public
   production deployment must add its own auth in front of these routes.

   Controls: POST only, request-size ceiling, per-IP rate limit (best effort
   per warm instance), sanitized + truncated history, upstream timeout,
   controlled errors, usage metadata logged without tax data.
   ========================================================================== */

const MAX_BODY_BYTES = 400 * 1024;
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 48 * 1024;
const MAX_SYSTEM_CHARS = 120 * 1024;
const RATE_LIMIT_PER_MIN = 20;
const DEFAULT_MODEL = "grok-4.5";
const ALLOWED_MODELS = ["grok-4.5", "grok-4.1", "grok-4"];

const rateBuckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (rateBuckets.get(ip) || []).filter(t => now - t < 60 * 1000);
  if (recent.length >= RATE_LIMIT_PER_MIN) return true;
  recent.push(now);
  rateBuckets.set(ip, recent);
  if (rateBuckets.size > 5000) rateBuckets.clear();
  return false;
}

/* makeHandler({ requestType, timeoutMs }) -> Vercel handler */
function makeHandler(cfg) {
  const requestType = cfg.requestType || "analyze";
  const timeoutMs = cfg.timeoutMs || 120 * 1000;
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET") {
      res.status(200).json({ status: "ok", route: requestType, configured: !!process.env.XAI_API_KEY });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      res.status(501).json({ error: "AI features are not configured on this deployment (XAI_API_KEY is not set)." });
      return;
    }
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    if (rateLimited(ip)) {
      res.status(429).json({ error: "Too many requests — wait a minute and try again." });
      return;
    }
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Invalid request body." });
      return;
    }
    try {
      if (JSON.stringify(body).length > MAX_BODY_BYTES) {
        res.status(413).json({ error: "Request too large." });
        return;
      }
    } catch (e) {
      res.status(400).json({ error: "Invalid request body." });
      return;
    }
    const system = String(body.system || "").slice(0, MAX_SYSTEM_CHARS);
    const model = ALLOWED_MODELS.includes(body.model) ? body.model : DEFAULT_MODEL;
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length > 0)
      .slice(-MAX_MESSAGES)
      .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      res.status(400).json({ error: "The last message must be from the user." });
      return;
    }
    const started = Date.now();
    let upstream;
    try {
      upstream = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, stream: false, messages: [{ role: "system", content: system }].concat(messages) }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (e) {
      const timedOut = e && (e.name === "TimeoutError" || e.name === "AbortError");
      console.log(JSON.stringify({ evt: "ai_proxy", requestType, ip, model, ms: Date.now() - started, error: timedOut ? "timeout" : "network" }));
      res.status(504).json({ error: timedOut ? "The AI service timed out — try a narrower request." : "The AI service is unreachable." });
      return;
    }
    if (!upstream.ok) {
      console.log(JSON.stringify({ evt: "ai_proxy", requestType, ip, model, ms: Date.now() - started, upstreamStatus: upstream.status }));
      const friendly = upstream.status === 401 ? "The server's AI credential was rejected — contact the administrator." : upstream.status === 429 ? "The AI service is rate-limiting — try again shortly." : "The AI service returned an error.";
      res.status(502).json({ error: friendly });
      return;
    }
    let data;
    try {
      data = await upstream.json();
    } catch (e) {
      res.status(502).json({ error: "The AI service returned an unreadable response." });
      return;
    }
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || "";
    console.log(JSON.stringify({
      evt: "ai_proxy", requestType, ip, model, ms: Date.now() - started,
      promptTokens: data.usage && data.usage.prompt_tokens,
      completionTokens: data.usage && data.usage.completion_tokens
    }));
    res.status(200).json({ text, model, requestType });
  };
}

module.exports = { makeHandler };
