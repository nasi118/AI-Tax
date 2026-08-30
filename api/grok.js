/* /api/grok — DEPRECATED compatibility alias for /api/ai/chat.

   The AI backend is the Anthropic Claude API; this route name is a leftover
   from the xAI Grok implementation it replaced. It is retained only so an
   older cached client build or an external caller keeps working, and it
   serves the same Claude-backed handler as /api/ai/chat.

   Nothing in this repository calls it any more. Remove it once no deployed
   client is old enough to ask for it. */
const { makeHandler } = require("./_lib/claude-proxy.js");
module.exports = makeHandler({
  requestType: "chat-legacy",
  maxTokens: 4000,
  outputConfig: { effort: "low" }
});
