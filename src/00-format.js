/* ==== 00-format ==== */
/* ============================================================================
   FORMATTERS — the ONE shared number-formatting service. Every tab, card,
   chart label, report and export path calls these functions; no tab may
   implement its own conflicting formatter.

   Formatting is PRESENTATION-ONLY: TP_NUMFMT carries the user's display
   preferences (set from the Customize panel via setNumberFormat) and the
   defaults reproduce the application's historical output exactly. The
   underlying stored numeric values and every deterministic calculation are
   unaffected by any choice here.
   ========================================================================== */
const TP_NUMFMT_DEFAULTS = {
  currencyDecimals: 0,          // 0 | 2
  negativeStyle: "parentheses", // "parentheses" | "minus"
  zeroStyle: "dash",            // plain numbers at zero: "dash" | "zero" | "blank"
  currencyZeroStyle: "dollar",  // currency at zero: "dollar" ($0) | "dash" | "blank"
  percentDecimals: 1,           // 0 | 1 | 2 (explicit call-site precision wins)
  thousandsSeparator: true
};
let TP_NUMFMT = { ...TP_NUMFMT_DEFAULTS };
/* Which keys the user explicitly chose (vs historical defaults). usdc's
   historical negative style is a leading minus even though usd/usd$ default
   to parentheses, so usdc follows negativeStyle only when explicitly set. */
let TP_NUMFMT_EXPLICIT = new Set();
function setNumberFormat(patch) {
  TP_NUMFMT = { ...TP_NUMFMT_DEFAULTS, ...(patch || {}) };
  TP_NUMFMT_EXPLICIT = new Set(Object.keys(patch || {}));
}
function getNumberFormat() {
  return { ...TP_NUMFMT };
}
function _group(abs, decimals) {
  const opts = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  if (!TP_NUMFMT.thousandsSeparator) opts.useGrouping = false;
  return abs.toLocaleString("en-US", opts);
}
function _negWrap(s, negative, symbol) {
  if (!negative) return symbol + s;
  return TP_NUMFMT.negativeStyle === "minus" ? "-" + symbol + s : "(" + symbol + s + ")";
}
function usd(v) {
  const n = Math.round(Number(v) || 0);
  if (n === 0) {
    return TP_NUMFMT.zeroStyle === "zero" ? _group(0, 0)
      : TP_NUMFMT.zeroStyle === "blank" ? "" : "—";
  }
  return _negWrap(_group(Math.abs(n), 0), n < 0, "");
}
function usd$(v) {
  if (v === Infinity) return "no limit";
  if (v == null) return "—";
  const d = TP_NUMFMT.currencyDecimals;
  const n = d > 0 ? Number(v) || 0 : Math.round(Number(v) || 0);
  if (n === 0) {
    return TP_NUMFMT.currencyZeroStyle === "dash" ? "—"
      : TP_NUMFMT.currencyZeroStyle === "blank" ? ""
      : "$" + _group(0, d);
  }
  return _negWrap(_group(Math.abs(n), d), n < 0, "$");
}
function usdc(v) {
  if (v == null) return "—";
  const n = Number(v) || 0;
  const s = "$" + Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: TP_NUMFMT.thousandsSeparator
  });
  const parens = TP_NUMFMT_EXPLICIT.has("negativeStyle") && TP_NUMFMT.negativeStyle === "parentheses";
  return n < 0 ? (parens ? "(" + s + ")" : "-" + s) : s;
}
function usdCompact(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const s = abs >= 1e6 ? (abs / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
    : abs >= 1e3 ? (abs / 1e3).toFixed(1).replace(/\.0$/, "") + "K"
    : _group(Math.round(abs), 0);
  return _negWrap(s, n < 0, "$");
}
function pct(v, d) {
  if (v == null || !isFinite(v)) return "—";
  return (v * 100).toFixed(d == null ? TP_NUMFMT.percentDecimals : d) + "%";
}
function pctRaw(v, d) {
  if (v == null || !isFinite(v)) return "—";
  return v.toFixed(d == null ? TP_NUMFMT.percentDecimals : d) + "%";
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
