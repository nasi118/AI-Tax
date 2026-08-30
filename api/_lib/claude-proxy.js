/* ============================================================================
   Shared secure proxy to the Anthropic Claude API, used by every /api/ai/*
   route, the AI Tax Reviewer chat route (/api/ai/chat) and the deprecated
   /api/grok alias it replaced.

   Back-ported from AI-Tax-APP so both repositories run one proxy, one
   provider and one env var — docs/ISSUE_BACKLOG.md P0-3.

   ANTHROPIC_API_KEY lives only in the deployment environment — never in
   browser code, localStorage, or the repository. Authentication is delegated
   to the deployment platform (these previews sit behind Vercel SSO); a public
   production deployment must add its own auth in front of these routes.

   Controls: POST only, request-size ceiling, per-IP rate limit (best effort
   per warm instance), sanitized + truncated history, upstream timeout,
   controlled errors, usage metadata logged without tax data.
   ========================================================================== */

/* The deployment platform kills a function at its plan's maximum duration
   (Vercel Hobby = 60s) regardless of what this code intends. Every upstream
   call must finish inside that window with margin, otherwise the browser gets
   a bare platform 504 instead of a controlled, explainable error. Keep this
   below the maxDuration in vercel.json, and keep vercel.json at or below the
   plan ceiling — a higher value there is silently clamped, not honoured. */
const PLATFORM_BUDGET_MS = 50 * 1000;

const MAX_BODY_BYTES = 400 * 1024;
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 48 * 1024;
const MAX_SYSTEM_CHARS = 120 * 1024;
const RATE_LIMIT_PER_MIN = 20;
const DEFAULT_MODEL = "claude-opus-5";
const ALLOWED_MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"];

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

/* makeHandler({ requestType, timeoutMs, maxTokens, outputConfig }) -> Vercel handler.
   timeoutMs must stay under the function's platform maxDuration (vercel.json)
   with margin — otherwise the platform kills the invocation first and the
   browser sees a bare 504 instead of our controlled error. */
function makeHandler(cfg) {
  const requestType = cfg.requestType || "analyze";
  const timeoutMs = cfg.timeoutMs || PLATFORM_BUDGET_MS;
  const maxTokens = cfg.maxTokens || 4096;
  const outputConfig = cfg.outputConfig || null;
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET") {
      res.status(200).json({ status: "ok", route: requestType, configured: !!process.env.ANTHROPIC_API_KEY });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(501).json({ error: "AI features are not configured on this deployment (ANTHROPIC_API_KEY is not set)." });
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
    /* Legacy clients may still send grok-* model names; they map to the default. */
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
    const callUpstream = withOutputConfig => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01"
      },
      /* Adaptive thinking is the model default; fallbacks:"default" re-runs a
         safety-declined request on Anthropic's recommended substitute model. */
      body: JSON.stringify(Object.assign(
        { model, max_tokens: maxTokens, system, messages, fallbacks: "default" },
        withOutputConfig && outputConfig ? { output_config: outputConfig } : null
      )),
      signal: AbortSignal.timeout(Math.max(5000, started + timeoutMs - Date.now()))
    });
    let upstream;
    try {
      upstream = await callUpstream(true);
      /* Self-healing: output_config (the effort control) is the only optional
         parameter here. If this API version rejects it, retry once without it
         rather than failing every AI request in the product — a slower answer
         beats no answer. */
      if (upstream.status === 400 && outputConfig) {
        console.log(JSON.stringify({ evt: "ai_proxy", requestType, model, note: "retrying without output_config" }));
        upstream = await callUpstream(false);
      }
    } catch (e) {
      const timedOut = e && (e.name === "TimeoutError" || e.name === "AbortError");
      console.log(JSON.stringify({ evt: "ai_proxy", requestType, ip, model, ms: Date.now() - started, error: timedOut ? "timeout" : "network" }));
      res.status(504).json({
        error: timedOut
          ? "The AI request did not finish within this deployment's " + Math.round(timeoutMs / 1000) + "-second limit. Ask a narrower question, select fewer report sections, or reduce the number of scenarios in scope."
          : "The AI service is unreachable."
      });
      return;
    }
    if (!upstream.ok) {
      /* Log the upstream error detail server-side (no tax data in it) and put
         the status code in the client message so failures are diagnosable. */
      let detail = "";
      try { detail = (await upstream.text()).slice(0, 300); } catch (e) {}
      console.log(JSON.stringify({ evt: "ai_proxy", requestType, ip, model, ms: Date.now() - started, upstreamStatus: upstream.status, detail }));
      const friendly = upstream.status === 401 ? "The server's AI credential was rejected — check ANTHROPIC_API_KEY on the deployment." : upstream.status === 429 ? "The AI service is rate-limiting — try again shortly." : upstream.status === 400 ? "The AI service rejected the request (upstream 400) — contact the administrator." : "The AI service returned an error (upstream " + upstream.status + ").";
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
    if (data && data.stop_reason === "refusal") {
      console.log(JSON.stringify({ evt: "ai_proxy", requestType, ip, model, ms: Date.now() - started, stopReason: "refusal" }));
      res.status(502).json({ error: "The AI service declined this request — rephrase and try again." });
      return;
    }
    let text = (Array.isArray(data && data.content) ? data.content : [])
      .filter(b => b && b.type === "text" && typeof b.text === "string")
      .map(b => b.text)
      .join("");
    /* A reply cut off at the token ceiling would otherwise look like a
       complete answer that simply stops mid-sentence — say so plainly. */
    if (data && data.stop_reason === "max_tokens" && text) {
      text += "\n\n[This response reached its length limit and is incomplete. Ask a narrower question, or request the remaining part.]";
    }
    console.log(JSON.stringify({
      evt: "ai_proxy", requestType, ip, model: data && data.model || model, ms: Date.now() - started,
      stopReason: data && data.stop_reason,
      promptTokens: data.usage && data.usage.input_tokens,
      completionTokens: data.usage && data.usage.output_tokens
    }));
    res.status(200).json({ text, model: data && data.model || model, requestType });
  };
}

module.exports = { makeHandler };
