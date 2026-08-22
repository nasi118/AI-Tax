/* ==== 19-ui-shell ==== */
/* ============================================================================
   UI SHELL PRIMITIVES — interface preferences, collapsible sections, drawers.
   Interface state only: nothing here ever touches scenario or tax data.
   ========================================================================== */
const EL = React.createElement;

/* ---- UI preference store (localStorage-backed, observable) ---- */
const UI_PREFS_KEY = "tp_ui_prefs_v1";
let UI_PREFS = (() => {
  try {
    return JSON.parse(localStorage.getItem(UI_PREFS_KEY)) || {};
  } catch (e) {
    return {};
  }
})();
const uiPrefListeners = new Set();
function getUIPref(key, dflt) {
  return UI_PREFS[key] === undefined ? dflt : UI_PREFS[key];
}
function setUIPref(key, value) {
  UI_PREFS = { ...UI_PREFS, [key]: value };
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(UI_PREFS));
  } catch (e) {/* private browsing: state stays in memory */}
  uiPrefListeners.forEach(fn => fn(key));
}
function useUIPref(key, dflt) {
  const [v, setV] = useState(() => getUIPref(key, dflt));
  useEffect(() => {
    const fn = k => {
      if (k === key) setV(getUIPref(key, dflt));
    };
    uiPrefListeners.add(fn);
    return () => uiPrefListeners.delete(fn);
  }, [key]);
  return [v, nv => setUIPref(key, nv)];
}

/* ---- Section registry: lets a page expand/collapse every section at once ---- */
const SECTION_DEFAULTS = new Map(); // "page" -> Map(id -> defaultOpen)
function registerSection(page, id, defaultOpen) {
  if (!SECTION_DEFAULTS.has(page)) SECTION_DEFAULTS.set(page, new Map());
  SECTION_DEFAULTS.get(page).set(id, defaultOpen);
}
function setAllSections(page, open) {
  const defs = SECTION_DEFAULTS.get(page);
  if (!defs) return;
  if (open === null) {
    setUIPref("sections:" + page, {});
    return;
  }
  const map = {};
  defs.forEach((_, id) => {
    map[id] = open;
  });
  setUIPref("sections:" + page, map);
}

/* Escape-key helper for drawers, modals and full-workspace sections */
function useEscape(onClose, active) {
  useEffect(() => {
    if (active === false) return undefined;
    const k = e => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, active]);
}

/* ----------------------------------------------------------------------------
   Section — a collapsible card. Open state persists per page and section.
   Children are only rendered while open (lazy), keeping hidden schedules,
   charts and guide categories out of the tree entirely.
   -------------------------------------------------------------------------- */
function Section({
  page,
  id,
  title,
  summary,
  count,
  warnCount,
  defaultOpen,
  right,
  fullable,
  flush,
  children
}) {
  const open0 = defaultOpen !== false;
  registerSection(page, id, open0);
  const [map, setMap] = useUIPref("sections:" + page, {});
  const open = map[id] === undefined ? open0 : !!map[id];
  const [full, setFull] = useState(false);
  useEscape(() => setFull(false), full);
  const toggle = () => setMap({ ...map, [id]: !open });
  const bodyId = "tp-sec-" + page + "-" + id;
  return EL("section", {
    className: "tp-card tp-sec" + (full ? " tp-sec-full" : "")
  }, EL("div", {
    className: "tp-sec-head"
  }, EL("button", {
    type: "button",
    className: "tp-sec-toggle",
    onClick: full ? undefined : toggle,
    "aria-expanded": full ? true : open,
    "aria-controls": bodyId
  }, EL("span", {
    className: "tp-sec-chev" + (open || full ? " open" : "")
  }, I.chevR), EL("h3", null, title), summary && EL("em", {
    className: "tp-sec-summary"
  }, summary)), EL("div", {
    className: "tp-sec-right"
  }, count != null && count !== 0 && EL("span", {
    className: "tp-sec-count"
  }, count, typeof count === "number" ? (count === 1 ? " item" : " items") : ""), warnCount > 0 && EL("span", {
    className: "tp-sec-count warn"
  }, warnCount, warnCount === 1 ? " warning" : " warnings"), right, fullable && EL("button", {
    type: "button",
    className: "tp-sec-fullbtn",
    title: full ? "Exit full workspace (Esc)" : "Expand to full workspace",
    "aria-label": full ? "Exit full workspace" : "Expand to full workspace",
    onClick: () => setFull(f => !f)
  }, full ? "✖" : "⛶"))), (open || full) && EL("div", {
    id: bodyId,
    className: flush ? "tp-sec-body flush" : "tp-sec-body"
  }, children));
}

/* Page-level Expand all / Collapse all / Restore controls */
function SectionControls({ page }) {
  return EL("div", {
    className: "tp-sec-controls"
  }, EL("button", {
    type: "button",
    className: "tp-mini",
    onClick: () => setAllSections(page, true)
  }, "Expand all"), EL("button", {
    type: "button",
    className: "tp-mini",
    onClick: () => setAllSections(page, false)
  }, "Collapse all"), EL("button", {
    type: "button",
    className: "tp-mini",
    onClick: () => setAllSections(page, null),
    title: "Restore the default open and collapsed sections"
  }, "Default view"), typeof LayoutControls !== "undefined" && EL(LayoutControls, { page }));
}

/* ----------------------------------------------------------------------------
   Drawer — right-side utility surface used by the contextual calculators and
   the scenario AI panel. Esc closes; focus returns to the opener.
   -------------------------------------------------------------------------- */
function Drawer({ title, sub, width, onClose, children, foot }) {
  useEscape(onClose);
  const ref = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    if (ref.current) ref.current.focus();
    return () => {
      if (opener && opener.focus) opener.focus();
    };
  }, []);
  return EL(React.Fragment, null, EL("div", {
    className: "tp-drawer-overlay",
    onMouseDown: onClose
  }), EL("aside", {
    className: "tp-drawer",
    style: width ? { width } : undefined,
    role: "dialog",
    "aria-modal": "true",
    "aria-label": typeof title === "string" ? title : "Tool",
    tabIndex: -1,
    ref: ref
  }, EL("div", {
    className: "tp-drawer-head"
  }, EL("div", null, EL("strong", null, title), sub && EL("em", null, sub)), EL("button", {
    className: "tp-modal-x",
    onClick: onClose,
    "aria-label": "Close"
  }, I.x)), EL("div", {
    className: "tp-drawer-body"
  }, children), foot && EL("div", {
    className: "tp-drawer-foot"
  }, foot)));
}

/* Simple stat line used across the tools panel and calculators */
function StatLine({ label, value, cls, title }) {
  return EL("div", {
    className: "tp-statline " + (cls || ""),
    title: title
  }, EL("span", null, label), EL("strong", null, value));
}
