/* /api/ai/chat — the AI Tax Reviewer's conversational route.
   Interactive chat: low effort keeps replies snappy inside the platform's
   function-duration limit.

   Replaces the old /api/grok, which is kept as a thin alias in api/grok.js so
   an older cached client build or an external caller does not break. */
const { makeHandler } = require("../_lib/claude-proxy.js");
module.exports = makeHandler({
  requestType: "chat",
  maxTokens: 4000,
  outputConfig: { effort: "low" }
});
