/* ==== 00-format ==== */
/* ============================================================================
   FORMATTERS — declared first so the engine can use them at call time
   ========================================================================== */
function usd(v) {
  const n = Math.round(Number(v) || 0);
  const s = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? "(" + s + ")" : n === 0 ? "—" : s;
}
function usd$(v) {
  if (v === Infinity) return "no limit";
  if (v == null) return "—";
  const n = Math.round(Number(v) || 0);
  const s = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? "($" + s + ")" : "$" + s;
}
function usdc(v) {
  if (v == null) return "—";
  const n = Number(v) || 0;
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function pct(v, d) {
  if (v == null || !isFinite(v)) return "—";
  return (v * 100).toFixed(d == null ? 1 : d) + "%";
}
function pctRaw(v, d) {
  if (v == null || !isFinite(v)) return "—";
  return v.toFixed(d == null ? 1 : d) + "%";
}
/* Immutable system IDs. Primary: crypto.randomUUID. First fallback: an
   RFC-4122 v4 UUID assembled from crypto.getRandomValues (same entropy,
   older browsers). Last resort (no crypto at all): two Math.random draws +
   timestamp + a monotonic counter, so even rapid same-millisecond calls
   cannot collide within a session. */
const uid = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = b[6] & 0x0f | 0x40;
    b[8] = b[8] & 0x3f | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, "0"));
    return h.slice(0, 4).join("") + "-" + h.slice(4, 6).join("") + "-" + h.slice(6, 8).join("") + "-" + h.slice(8, 10).join("") + "-" + h.slice(10).join("");
  }
  uid._c = (uid._c || 0) + 1;
  return "id" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36) + uid._c.toString(36);
};
