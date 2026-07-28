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
const uid = () => crypto.randomUUID ? crypto.randomUUID() : "id" + Math.random().toString(36).slice(2) + Date.now();
