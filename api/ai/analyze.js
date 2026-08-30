/* /api/ai/analyze — scenario analysis and planning Q&A.
   Medium effort: analysis quality matters, but the request must still finish
   inside the platform's function-duration limit. */
const { makeHandler } = require("../_lib/claude-proxy.js");
module.exports = makeHandler({
  requestType: "analyze",
  maxTokens: 4000,
  outputConfig: { effort: "medium" }
});
