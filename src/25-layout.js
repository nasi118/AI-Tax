/* ==== 25-layout ==== */
/* ============================================================================
   EDIT LAYOUT — move, resize (grid spans), hide and restore page widgets.

   Design rules:
   - Grid-based, never absolute positioning: widgets occupy 6-column grid
     spans (full / half / third), so nothing can overlap or leave the screen.
   - Real DOM reordering (not CSS `order`), so reading order, keyboard order
     and print order always match what the user sees.
   - Presentation-only: layout state lives in its own versioned store
     (tp_layout_v1), completely separate from client tax data. Moving,
     resizing or hiding a widget never touches an input, a scenario, a
     calculation, or the audit trail of tax data.
   - Mobile keeps responsive rules: below 900px the grid collapses to a
     single column regardless of desktop customization.
   - Unknown widget ids (renamed or removed features) are ignored safely.
   ========================================================================== */

const TP_LAYOUT_KEY = "tp_layout_v1";
const TP_LAYOUT_SPANS = ["full", "half", "third"];

function _layoutLoad() {
  try {
    const raw = JSON.parse(localStorage.getItem(TP_LAYOUT_KEY));
    if (raw && raw.schemaVersion === 1 && typeof raw.tabs === "object" && raw.tabs) return raw;
  } catch (e) {}
  return { schemaVersion: 1, tabs: {} };
}
let TP_LAYOUT = _layoutLoad();
/* While editing: { page, entry (snapshot for Cancel), undo: [snapshots] } */
let TP_LAYOUT_EDIT = null;
const _layoutListeners = new Set();
function _layoutEmit() {
  _layoutListeners.forEach(fn => fn());
}
function _layoutSave() {
  try {
    localStorage.setItem(TP_LAYOUT_KEY, JSON.stringify(TP_LAYOUT));
  } catch (e) {}
}
function _tabLayout(page) {
  return TP_LAYOUT.tabs[page] || { order: [], span: {}, hidden: [] };
}
function _setTabLayout(page, next) {
  TP_LAYOUT = {
    ...TP_LAYOUT,
    tabs: { ...TP_LAYOUT.tabs, [page]: next }
  };
}

/* Subscribe a component to layout changes (global-scope store, matching the
   application's shared-scope architecture). */
function useLayoutTick() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    _layoutListeners.add(fn);
    return () => _layoutListeners.delete(fn);
  }, []);
}

function layoutIsEditing(page) {
  return !!(TP_LAYOUT_EDIT && TP_LAYOUT_EDIT.page === page);
}
function layoutSpanOf(page, id) {
  const s = _tabLayout(page).span[id];
  return TP_LAYOUT_SPANS.includes(s) ? s : "full";
}
function layoutHidden(page) {
  return _tabLayout(page).hidden || [];
}
function layoutOrderIds(page, presentIds) {
  const saved = _tabLayout(page).order || [];
  /* Saved order first (ignoring ids that no longer exist), then anything new
     in its natural position — renamed/removed widgets can never break the app. */
  const known = saved.filter(id => presentIds.includes(id));
  const rest = presentIds.filter(id => !known.includes(id));
  return known.concat(rest);
}

function _layoutMutate(page, fn) {
  if (TP_LAYOUT_EDIT && TP_LAYOUT_EDIT.page === page) {
    TP_LAYOUT_EDIT.undo.push(JSON.stringify(_tabLayout(page)));
    if (TP_LAYOUT_EDIT.undo.length > 30) TP_LAYOUT_EDIT.undo.shift();
  }
  const cur = _tabLayout(page);
  _setTabLayout(page, fn({ order: [...(cur.order || [])], span: { ...(cur.span || {}) }, hidden: [...(cur.hidden || [])] }));
  _layoutEmit();
}

function layoutMove(page, presentIds, id, dir) {
  _layoutMutate(page, t => {
    const order = layoutOrderIds(page, presentIds);
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return { ...t, order };
    [order[i], order[j]] = [order[j], order[i]];
    return { ...t, order };
  });
}
function layoutMoveBefore(page, presentIds, id, beforeId) {
  _layoutMutate(page, t => {
    const order = layoutOrderIds(page, presentIds).filter(x => x !== id);
    const at = beforeId ? order.indexOf(beforeId) : order.length;
    order.splice(at < 0 ? order.length : at, 0, id);
    return { ...t, order };
  });
}
function layoutCycleSpan(page, id) {
  _layoutMutate(page, t => {
    const cur = TP_LAYOUT_SPANS.indexOf(t.span[id]);
    const next = TP_LAYOUT_SPANS[(cur + 1 + (cur < 0 ? 1 : 0)) % TP_LAYOUT_SPANS.length];
    return { ...t, span: { ...t.span, [id]: next } };
  });
}
function layoutSetHidden(page, id, hidden) {
  _layoutMutate(page, t => ({
    ...t,
    hidden: hidden ? Array.from(new Set([...t.hidden, id])) : t.hidden.filter(x => x !== id)
  }));
}
function layoutBeginEdit(page) {
  TP_LAYOUT_EDIT = { page, entry: JSON.stringify(_tabLayout(page)), undo: [] };
  _layoutEmit();
}
function layoutUndo(page) {
  if (!TP_LAYOUT_EDIT || TP_LAYOUT_EDIT.page !== page || !TP_LAYOUT_EDIT.undo.length) return;
  _setTabLayout(page, JSON.parse(TP_LAYOUT_EDIT.undo.pop()));
  _layoutEmit();
}
function layoutSaveEdit(page) {
  TP_LAYOUT_EDIT = null;
  _layoutSave();
  _layoutEmit();
}
function layoutCancelEdit(page) {
  if (TP_LAYOUT_EDIT && TP_LAYOUT_EDIT.page === page) {
    _setTabLayout(page, JSON.parse(TP_LAYOUT_EDIT.entry));
  }
  TP_LAYOUT_EDIT = null;
  _layoutEmit();
}
function layoutResetTab(page) {
  _setTabLayout(page, { order: [], span: {}, hidden: [] });
  if (!TP_LAYOUT_EDIT) _layoutSave();
  _layoutEmit();
}
function layoutResetAll() {
  TP_LAYOUT = { schemaVersion: 1, tabs: {} };
  TP_LAYOUT_EDIT = null;
  _layoutSave();
  _layoutEmit();
}

/* ---- container: real-DOM-order arrangement -------------------------------
   layoutContainer(page, className, ...children): children that are Section
   elements for this page, or carry a `data-layout` id, are the movable
   widgets; everything else (toolbars, KPI strips marked fixed) stays put
   ahead of them. */
function layoutContainer(page, className, ...children) {
  return EL(LayoutContainerC, { page, className }, ...children);
}
function LayoutContainerC({ page, className, children }) {
  useLayoutTick();
  const widgets = [];
  const fixed = [];
  React.Children.toArray(children).forEach(c => {
    if (c && c.props && (c.props["data-layout"] || (typeof Section !== "undefined" && c.type === Section && c.props.page === page))) {
      widgets.push({ id: c.props["data-layout"] || c.props.id, el: c });
    } else if (c || c === 0) {
      fixed.push(c);
    }
  });
  const ids = widgets.map(w => w.id);
  const editing = layoutIsEditing(page);
  const hidden = layoutHidden(page);
  const ordered = layoutOrderIds(page, ids)
    .map(id => widgets.find(w => w.id === id))
    .filter(Boolean)
    .filter(w => editing || !hidden.includes(w.id))
    .map(w => EL(LayoutCell, { key: "lw-" + w.id, page, id: w.id, presentIds: ids }, w.el));
  return EL("div", { className: className + (editing ? " tp-layout-editing" : "") },
    ...fixed, ...ordered);
}

/* One widget cell: applies the grid span; in edit mode adds the chrome
   (drag handle, keyboard move, width cycle, hide) and drag & drop. */
function LayoutCell({ page, id, presentIds, children }) {
  useLayoutTick();
  const editing = layoutIsEditing(page);
  const span = layoutSpanOf(page, id);
  const hiddenNow = layoutHidden(page).includes(id);
  const [dragOver, setDragOver] = useState(false);
  const spanLabel = span === "full" ? "Full width" : span === "half" ? "Half width" : "Third width";
  return EL("div", {
    className: "tp-layout-cell tp-w-" + span + (editing ? " editing" : "") +
      (dragOver ? " dragover" : "") + (hiddenNow ? " layout-hidden" : ""),
    onDragOver: editing ? e => { e.preventDefault(); setDragOver(true); } : undefined,
    onDragLeave: editing ? () => setDragOver(false) : undefined,
    onDrop: editing ? e => {
      e.preventDefault();
      setDragOver(false);
      const src = e.dataTransfer.getData("text/tp-widget");
      if (src && src !== id) layoutMoveBefore(page, presentIds, src, id);
    } : undefined
  }, editing && EL("div", { className: "tp-layout-chrome" },
    EL("span", {
      className: "tp-layout-grip",
      draggable: true,
      title: "Drag to reposition",
      onDragStart: e => e.dataTransfer.setData("text/tp-widget", id)
    }, "⁙ ", id),
    EL("button", { type: "button", className: "tp-mini", "aria-label": "Move " + id + " earlier", onClick: () => layoutMove(page, presentIds, id, -1) }, "◀"),
    EL("button", { type: "button", className: "tp-mini", "aria-label": "Move " + id + " later", onClick: () => layoutMove(page, presentIds, id, 1) }, "▶"),
    EL("button", { type: "button", className: "tp-mini", title: "Cycle width: full → half → third", onClick: () => layoutCycleSpan(page, id) }, spanLabel),
    hiddenNow
      ? EL("button", { type: "button", className: "tp-mini on", onClick: () => layoutSetHidden(page, id, false) }, "Show")
      : EL("button", { type: "button", className: "tp-mini", onClick: () => layoutSetHidden(page, id, true) }, "Hide")),
    children);
}

/* Toolbar for pages that support layout editing (rendered by SectionControls). */
function LayoutControls({ page }) {
  useLayoutTick();
  const editing = layoutIsEditing(page);
  const hidden = layoutHidden(page);
  if (!editing) {
    return EL(React.Fragment, null, EL("button", {
      type: "button",
      className: "tp-mini",
      title: "Move, resize and hide the cards on this tab. Layout is presentation-only and never changes inputs or calculations.",
      onClick: () => layoutBeginEdit(page)
    }, "Edit layout"), hidden.length > 0 && EL("button", {
      type: "button",
      className: "tp-mini",
      title: "This tab has hidden widgets: " + hidden.join(", "),
      onClick: () => layoutBeginEdit(page)
    }, hidden.length + " hidden"));
  }
  return EL(React.Fragment, null,
    EL("span", { className: "tp-layout-mode" }, "Layout edit"),
    EL("button", { type: "button", className: "tp-mini", onClick: () => layoutUndo(page) }, "Undo"),
    EL("button", { type: "button", className: "tp-mini", title: "Restore this tab's default layout", onClick: () => layoutResetTab(page) }, "Reset tab"),
    EL("button", { type: "button", className: "tp-mini", title: "Restore the default layout on every tab", onClick: () => layoutResetAll() }, "Reset all tabs"),
    EL("button", { type: "button", className: "tp-mini", onClick: () => layoutCancelEdit(page) }, "Cancel"),
    EL("button", { type: "button", className: "tp-mini on", onClick: () => layoutSaveEdit(page) }, "Save layout"));
}
