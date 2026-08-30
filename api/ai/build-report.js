/* /api/ai/build-report — grounded client-report narrative.
   The client generates a report ONE SECTION PER REQUEST, so each call is a
   short focused writing task: low effort and a small token budget finish well
   inside the platform's function-duration limit. Every figure comes from the
   deterministic engine package; the model only writes narrative around it. */
const { makeHandler } = require("../_lib/claude-proxy.js");
module.exports = makeHandler({
  requestType: "build-report",
  maxTokens: 3000,
  outputConfig: { effort: "low" }
});
