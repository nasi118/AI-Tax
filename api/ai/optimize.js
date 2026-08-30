/* /api/ai/optimize — strategy identification and proposed scenario changes.
   Returns a bounded JSON candidate set, so a tight token budget is enough. */
const { makeHandler } = require("../_lib/claude-proxy.js");
module.exports = makeHandler({
  requestType: "optimize",
  maxTokens: 4000,
  outputConfig: { effort: "medium" }
});
