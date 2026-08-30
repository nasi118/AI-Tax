/* Handler unit tests for the Anthropic Claude proxy (api/_lib/claude-proxy.js).

   These run offline: global fetch is stubbed, so nothing here contacts the
   Anthropic API or needs a key. They cover the request contract the browser
   depends on and the failure paths that decide what a user sees when the AI
   is misconfigured, rate-limited, slow, or declines.

   Run:  node tests/api-claude-proxy.test.mjs                                */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { makeHandler } = require("../api/_lib/claude-proxy.js");

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "PASS  " : "FAIL  ") + n); };

/* Minimal Vercel-style req/res doubles. */
const mkRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
};
const mkReq = (method, body, ip) => ({
  method,
  body,
  headers: { "x-forwarded-for": ip || ("10.0.0." + Math.floor(Math.random() * 250)) }
});
const goodBody = () => ({ system: "sys", messages: [{ role: "user", content: "hello" }] });

/* fetch stub: `next` is what the upstream call returns; `calls` records payloads. */
let calls = [];
let next = () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "hi" }], usage: {}, model: "claude-opus-5" }) });
globalThis.fetch = async (url, opts) => {
  calls.push({ url, opts, payload: JSON.parse(opts.body) });
  return next(calls.length);
};
const reset = () => { calls = []; };

const withKey = async fn => {
  const prev = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  try { await fn(); } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prev;
  }
};

const h = makeHandler({ requestType: "analyze", maxTokens: 4000, outputConfig: { effort: "medium" } });

/* ---- status probe ---- */
{
  delete process.env.ANTHROPIC_API_KEY;
  const res = mkRes();
  await h(mkReq("GET"), res);
  ok(res.code === 200 && res.body.status === "ok", "GET is a status probe");
  ok(res.body.configured === false, "probe reports not-configured when the key is absent");
  ok(res.headers["Cache-Control"] === "no-store", "responses are not cached");
  await withKey(async () => {
    const r2 = mkRes();
    await h(mkReq("GET"), r2);
    ok(r2.body.configured === true, "probe reports configured when the key is present");
  });
}

/* ---- method and configuration guards ---- */
{
  const res = mkRes();
  await h(mkReq("PUT", goodBody()), res);
  ok(res.code === 405, "non-POST is rejected with 405");

  delete process.env.ANTHROPIC_API_KEY;
  const res2 = mkRes();
  await h(mkReq("POST", goodBody()), res2);
  ok(res2.code === 501 && /ANTHROPIC_API_KEY/.test(res2.body.error), "missing key is 501 and names ANTHROPIC_API_KEY");
}

/* ---- body validation ---- */
await withKey(async () => {
  const bad = mkRes();
  await h(mkReq("POST", null), bad);
  ok(bad.code === 400, "a non-object body is rejected");

  const noMsg = mkRes();
  await h(mkReq("POST", { system: "s", messages: [] }), noMsg);
  ok(noMsg.code === 400, "an empty message list is rejected");

  const endsAssistant = mkRes();
  await h(mkReq("POST", { messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }), endsAssistant);
  ok(endsAssistant.code === 400, "a history not ending in a user turn is rejected");

  const huge = mkRes();
  await h(mkReq("POST", { messages: [{ role: "user", content: "x".repeat(500 * 1024) }] }), huge);
  ok(huge.code === 413, "an oversized body is rejected with 413");

  const strBody = mkRes();
  reset();
  await h(mkReq("POST", JSON.stringify(goodBody())), strBody);
  ok(strBody.code === 200, "a JSON string body is parsed rather than rejected");
});

/* ---- the upstream request contract ---- */
await withKey(async () => {
  reset();
  const res = mkRes();
  await h(mkReq("POST", goodBody()), res);
  const c = calls[0];
  ok(c.url === "https://api.anthropic.com/v1/messages", "calls the Anthropic Messages API");
  ok(c.opts.headers["x-api-key"] === "sk-ant-test", "authenticates with x-api-key, not a bearer token");
  ok(c.opts.headers["anthropic-version"] === "2023-06-01", "sends the anthropic-version header");
  ok(c.payload.system === "sys", "system is a TOP-LEVEL parameter, not a message");
  ok(!c.payload.messages.some(m => m.role === "system"), "no system role is smuggled into messages");
  ok(c.payload.max_tokens === 4000, "max_tokens comes from the route's budget");
  ok(c.payload.output_config.effort === "medium", "the route's effort is sent");
  ok(c.payload.model === "claude-opus-5", "defaults to Claude Opus 5");
});

/* ---- model allowlist ---- */
await withKey(async () => {
  reset();
  await h(mkReq("POST", Object.assign(goodBody(), { model: "claude-haiku-4-5" })), mkRes());
  ok(calls[0].payload.model === "claude-haiku-4-5", "an allowlisted model is honoured");

  reset();
  await h(mkReq("POST", Object.assign(goodBody(), { model: "grok-4.5" })), mkRes());
  ok(calls[0].payload.model === "claude-opus-5", "a legacy grok-* model name falls back to the default");

  reset();
  await h(mkReq("POST", Object.assign(goodBody(), { model: "../../etc/passwd" })), mkRes());
  ok(calls[0].payload.model === "claude-opus-5", "an arbitrary model string cannot be injected");
});

/* ---- success: text blocks only ---- */
await withKey(async () => {
  reset();
  next = () => ({ ok: true, status: 200, json: async () => ({
    /* Thinking is on, so the response carries thinking blocks too — only the
       text blocks are the answer. */
    content: [{ type: "thinking", thinking: "internal" }, { type: "text", text: "Part one. " }, { type: "text", text: "Part two." }],
    stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 7 }, model: "claude-opus-5"
  }) });
  const res = mkRes();
  await h(mkReq("POST", goodBody()), res);
  ok(res.code === 200, "a successful call returns 200");
  ok(res.body.text === "Part one. Part two.", "text blocks are concatenated in order");
  ok(!/internal/.test(res.body.text), "thinking content is never returned to the browser");
  ok(res.body.requestType === "analyze", "the route echoes its request type");
});

/* ---- truncation is disclosed ---- */
await withKey(async () => {
  reset();
  next = () => ({ ok: true, status: 200, json: async () => ({
    content: [{ type: "text", text: "cut off here" }], stop_reason: "max_tokens", usage: {}, model: "claude-opus-5"
  }) });
  const res = mkRes();
  await h(mkReq("POST", goodBody()), res);
  ok(/length limit/i.test(res.body.text), "a max_tokens stop is disclosed rather than passed off as a complete answer");
});

/* ---- refusal ---- */
await withKey(async () => {
  reset();
  next = () => ({ ok: true, status: 200, json: async () => ({ content: [], stop_reason: "refusal", usage: {} }) });
  const res = mkRes();
  await h(mkReq("POST", goodBody()), res);
  ok(res.code === 502 && /declined/i.test(res.body.error), "a safety refusal is reported, not returned as an empty answer");
});

/* ---- upstream failures ---- */
await withKey(async () => {
  reset();
  next = () => ({ ok: false, status: 401, text: async () => "bad key" });
  const r1 = mkRes();
  await h(mkReq("POST", goodBody()), r1);
  ok(r1.code === 502 && /credential/i.test(r1.body.error), "an upstream 401 becomes a credential message");
  ok(!/bad key/.test(JSON.stringify(r1.body)), "upstream error detail is logged, not leaked to the browser");

  reset();
  next = () => ({ ok: false, status: 429, text: async () => "slow down" });
  const r2 = mkRes();
  await h(mkReq("POST", goodBody()), r2);
  ok(r2.code === 502 && /rate-limit/i.test(r2.body.error), "an upstream 429 becomes a rate-limit message");

  reset();
  next = () => { const e = new Error("timeout"); e.name = "TimeoutError"; throw e; };
  const r3 = mkRes();
  await h(mkReq("POST", goodBody()), r3);
  ok(r3.code === 504 && /did not finish/i.test(r3.body.error), "a timeout becomes a controlled 504 with advice");

  reset();
  next = () => { throw new Error("boom"); };
  const r4 = mkRes();
  await h(mkReq("POST", goodBody()), r4);
  ok(r4.code === 504 && /unreachable/i.test(r4.body.error), "a network failure becomes a controlled 504");
});

/* ---- output_config self-healing ---- */
await withKey(async () => {
  reset();
  next = n => n === 1
    ? { ok: false, status: 400, text: async () => "unknown field output_config" }
    : { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "ok" }], usage: {}, model: "claude-opus-5" }) };
  const res = mkRes();
  await h(mkReq("POST", goodBody()), res);
  ok(calls.length === 2, "a 400 on output_config triggers exactly one retry");
  ok(calls[0].payload.output_config !== undefined, "the first attempt sends output_config");
  ok(calls[1].payload.output_config === undefined, "the retry drops output_config");
  ok(res.code === 200 && res.body.text === "ok", "the retry's answer is returned — a slower answer beats no answer");
});

/* ---- rate limiting is per IP ---- */
await withKey(async () => {
  reset();
  next = () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "x" }], usage: {} }) });
  const ip = "203.0.113.99";
  let limited = 0;
  for (let i = 0; i < 25; i++) {
    const r = mkRes();
    await h(mkReq("POST", goodBody(), ip), r);
    if (r.code === 429) limited++;
  }
  ok(limited > 0, "a single IP is rate-limited after the per-minute ceiling (" + limited + " blocked)");
  const other = mkRes();
  await h(mkReq("POST", goodBody(), "203.0.113.7"), other);
  ok(other.code === 200, "a different IP is unaffected by another's rate limit");
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
