/* /api/ai/optimize — strategy identification and proposed scenario changes. */
const { makeHandler } = require("../_lib/grok-proxy.js");
module.exports = makeHandler({ requestType: "optimize", timeoutMs: 180000 });
