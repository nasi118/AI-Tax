/* /api/grok — compatibility alias for the AI Tax Reviewer (same proxy). */
const { makeHandler } = require("./_lib/grok-proxy.js");
module.exports = makeHandler({ requestType: "grok", timeoutMs: 90000 });
