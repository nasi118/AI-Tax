/* /api/ai/build-report — grounded client-report narrative generation. */
const { makeHandler } = require("../_lib/grok-proxy.js");
module.exports = makeHandler({ requestType: "build-report", timeoutMs: 240000 });
