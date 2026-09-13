/* ============================================================================
   Shared secure proxy to the OpenAI API, used by every /api/ai/* route, the
   AI Tax Reviewer chat route (/api/ai/chat) and the deprecated /api/grok alias
   it replaced.

   OPENAI_API_KEY lives only in the deployment environment — never in browser
   code, localStorage, or the repository. Authentication is delegated to the
   deployment platform (these previews sit behind Vercel SSO); a public
   production deployment must add its own auth in front of these routes.

   Controls: POST only, request-size ceiling, per-IP rate limit (best effort
   per warm instance), sanitized + truncated history, upstream timeout,
   controlled errors, usage metadata logged without tax data.

   WHICH OPENAI API
   ----------------
   The Responses API (/v1/responses), which is what OpenAI recommends for the
   GPT-5.6 reasoning models this app runs on. It is also the closer fit: each
   route already declares how hard it wants the model to think, and that maps
   straight onto `reasoning.effort` instead of being approximated.

   The shape it expects differs from Chat Completions in three ways worth
   naming, because they are the usual source of a silent 400:
     · the system prompt is `instructions`, not a message with role "system"
     · the conversation is `input`, not `messages`
     · the ceiling is `max_output_tokens`, not `max_tokens`
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

/* The GPT-5.6 family: `sol` is the flagship, `terra` trades some capability
   for price, `luna` is the high-volume tier. The bare `gpt-5.6` alias points
   at whichever snapshot OpenAI currently serves as flagship; this proxy pins
   the explicit ids instead, so a change on their side cannot silently move
   which model produced a piece of tax analysis. */
const DEFAULT_MODEL = "gpt-5.6-sol";
const ALLOWED_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];

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

/* Pull the assistant's text out of a Responses payload.

   Written to tolerate the documented variants rather than one exact shape:
   the `output_text` convenience field when the SDK-style flattening is
   present, otherwise a walk of `output[] -> content[] -> output_text`. A
   `refusal` block is reported separately by the caller, so it is not
   collected here — returning a refusal as if it were an answer would be the
   worst outcome of the three. */
function extractText(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.output_text === "string" && data.output_text) return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  return output
    .filter(item => item && item.type === "message")
    .map(item => (Array.isArray(item.content) ? item.content : [])
      .filter(part => part && part.type === "output_text" && typeof part.text === "string")
      .map(part => part.text)
      .join(""))
    .join("");
}

/* True when the model declined rather than answered. */
function isRefusal(data) {
  const output = Array.isArray(data && data.output) ? data.output : [];
  return output.some(item => item && item.type === "message" &&
    (Array.isArray(item.content) ? item.content : []).some(part => part && part.type === "refusal"));
}

/* makeHandler({ requestType, timeoutMs, maxTokens, effort }) -> Vercel handler.
   timeoutMs must stay under the function's platform maxDuration (vercel.json)
   with margin — otherwise the platform kills the invocation first and the
   browser sees a bare 504 instead of our controlled error. */
function makeHandler(cfg) {
  const requestType = cfg.requestType || "analyze";
  const timeoutMs = cfg.timeoutMs || PLATFORM_BUDGET_MS;
  const maxTokens = cfg.maxTokens || 4096;
  const effort = cfg.effort || null;
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET") {
      res.status(200).json({ status: "ok", route: requestType, configured: !!process.env.OPENAI_API_KEY });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(501).json({ error: "AI features are not configured on this deployment (OPENAI_API_KEY is not set)." });
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
    /* A client sending a model this proxy does not serve — an older build
       still asking for a Claude or Grok name, a hand-edited preference — gets
       the default rather than an error. The response says which model
       actually ran, so the substitution is never invisible. */
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
    const callUpstream = withEffort => fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + apiKey
      },
      body: JSON.stringify(Object.assign(
        {
          model,
          /* The system prompt is `instructions` on this API — sending it as a
             message with role "system" is silently ignored, which would strip
             every guardrail in AI_SYSTEM_CORE without any error to notice. */
          instructions: system,
          input: messages,
          max_output_tokens: maxTokens
        },
        withEffort && effort ? { reasoning: { effort } } : null
      )),
      signal: AbortSignal.timeout(Math.max(5000, started + timeoutMs - Date.now()))
    });
    let upstream;
    try {
      upstream = await callUpstream(true);
      /* Self-healing: reasoning.effort is the only optional parameter here,
         and the values a model accepts have moved between releases. If this
         model rejects the one a route asked for, retry once without it rather
         than failing every AI request in the product — a slower or less
         considered answer beats no answer. */
      if (upstream.status === 400 && effort) {
        console.log(JSON.stringify({ evt: "ai_proxy", requestType, model, note: "retrying without reasoning effort" }));
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
      const friendly = upstream.status === 401 ? "The server's AI credential was rejected — check OPENAI_API_KEY on the deployment." : upstream.status === 429 ? "The AI service is rate-limiting — try again shortly." : upstream.status === 400 ? "The AI service rejected the request (upstream 400) — contact the administrator." : "The AI service returned an error (upstream " + upstream.status + ").";
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
    if (isRefusal(data)) {
      console.log(JSON.stringify({ evt: "ai_proxy", requestType, ip, model, ms: Date.now() - started, stopReason: "refusal" }));
      res.status(502).json({ error: "The AI service declined this request — rephrase and try again." });
      return;
    }
    let text = extractText(data);
    /* A reply cut off at the token ceiling would otherwise look like a
       complete answer that simply stops mid-sentence — say so plainly. */
    const truncated = data && data.status === "incomplete" &&
      data.incomplete_details && data.incomplete_details.reason === "max_output_tokens";
    if (truncated && text) {
      text += "\n\n[This response reached its length limit and is incomplete. Ask a narrower question, or request the remaining part.]";
    }
    /* An empty body with a 200 is the one failure that would otherwise reach
       the user as a blank answer. It happens when a reasoning model spends
       the whole ceiling thinking and emits no text. */
    if (!text) {
      console.log(JSON.stringify({ evt: "ai_proxy", requestType, ip, model, ms: Date.now() - started, status: data && data.status, note: "empty output" }));
      res.status(502).json({
        error: truncated
          ? "The AI reached its length limit before writing an answer. Ask a narrower question, or select fewer report sections."
          : "The AI service returned an empty response — try again."
      });
      return;
    }
    console.log(JSON.stringify({
      evt: "ai_proxy", requestType, ip, model: (data && data.model) || model, ms: Date.now() - started,
      status: data && data.status,
      promptTokens: data.usage && data.usage.input_tokens,
      completionTokens: data.usage && data.usage.output_tokens
    }));
    res.status(200).json({ text, model: (data && data.model) || model, requestType });
  };
}

module.exports = { makeHandler, extractText, ALLOWED_MODELS, DEFAULT_MODEL };
