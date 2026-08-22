/* ==== 14-tools ==== */
/* ============================================================================
   FLOATING TOOL WINDOWS — draggable, keyboard-friendly
   ========================================================================== */
function useDrag(initial) {
  const [pos, setPos] = useState(initial);
  const drag = useRef(null);
  const onDown = e => {
    if (e.button != null && e.button !== 0) return;
    const p = e.touches ? e.touches[0] : e;
    drag.current = {
      dx: p.clientX - pos.x,
      dy: p.clientY - pos.y
    };
    const move = ev => {
      if (!drag.current) return;
      const q = ev.touches ? ev.touches[0] : ev;
      const w = window.innerWidth,
        h = window.innerHeight;
      setPos({
        x: Math.max(-160, Math.min(w - 80, q.clientX - drag.current.dx)),
        y: Math.max(0, Math.min(h - 44, q.clientY - drag.current.dy))
      });
      if (ev.cancelable) ev.preventDefault();
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, {
      passive: false
    });
    window.addEventListener("touchend", up);
  };
  return [pos, onDown, setPos];
}

/* Open near the dock so a tool covers as little of the workspace as possible,
   and stay on screen on narrow displays. */
const CALC_W = 272;
function dockPos(w, slot) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  // Narrow screens: stack with a slight offset so both remain grabbable
  if (vw < 980) return {
    x: Math.max(8, (vw - w) / 2),
    y: Math.max(8, 56 + slot * 28)
  };
  // Wide screens: the calculator hugs the right edge, notes sit to its left
  const right = vw - 24;
  const x = slot === 0 ? right - w : right - CALC_W - 14 - w;
  return {
    x: Math.max(16, x),
    y: Math.max(16, Math.min(84, vh - 420))
  };
}
function ToolWindow({
  title,
  sub,
  onClose,
  children,
  initial,
  width,
  onFocus,
  z
}) {
  const [pos, onDown] = useDrag(initial || {
    x: 120,
    y: 120
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-win",
    style: {
      left: pos.x,
      top: pos.y,
      width: width || 300,
      zIndex: z || 60
    },
    onMouseDown: onFocus
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-win-head",
    onMouseDown: onDown,
    onTouchStart: onDown
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, title), sub && /*#__PURE__*/React.createElement("em", null, sub)), /*#__PURE__*/React.createElement("button", {
    className: "tp-win-x",
    onClick: onClose,
    title: "Close"
  }, I.x)), /*#__PURE__*/React.createElement("div", {
    className: "tp-win-body"
  }, children));
}

/* Hoisted for the same reason: a keypad button defined inside Calculator would
   be a new component type on every render, so React would replace the button
   between mousedown and click and the press would never register. */
function K({
  l,
  on,
  cls
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: "tp-calcbtn " + (cls || ""),
    onClick: on,
    type: "button"
  }, l);
}

/* ============================================================================
   TAPE CALCULATOR
   Adding-machine style: every entry is recorded on a running tape that can be
   copied into the notepad as a workpaper.
   ========================================================================== */
function Calculator({
  onClose,
  result,
  scenarioName,
  onSendToNotes,
  onFocus,
  z,
  tape: tapeProp,
  setTape: setTapeProp
}) {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState(null);
  const [op, setOp] = useState(null);
  const [fresh, setFresh] = useState(true);
  /* The tape can be owned by the app shell so it survives navigation between
     pages and reloads; standalone use keeps the original local state. */
  const [tapeLocal, setTapeLocal] = useState([]);
  const tape = tapeProp || tapeLocal;
  const setTape = setTapeProp || setTapeLocal;
  const [mem, setMem] = useState(0);
  const [flashMsg, setFlashMsg] = useState("");
  const flash = m => {
    setFlashMsg(m);
    setTimeout(() => setFlashMsg(""), 1600);
  };
  /* Write the displayed result into the money input the user last focused —
     the same mechanism the quick calculator uses. */
  const insertIntoInput = () => {
    const el = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("tp-money") ? document.activeElement : window.__tpLastMoneyInput;
    if (el && el.classList && el.classList.contains("tp-money")) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, display.replace(/^-/, "-"));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      flash("Inserted");
    } else flash("Focus a money input first");
  };
  const tapeRef = useRef(null);
  useEffect(() => {
    if (tapeRef.current) tapeRef.current.scrollTop = tapeRef.current.scrollHeight;
  }, [tape]);
  const cur = () => Number(display.replace(/,/g, "")) || 0;
  const show = n => {
    if (!isFinite(n)) return "Error";
    const r = Math.round(n * 1e8) / 1e8;
    return String(r);
  };
  const addTape = (text, value, kind) => setTape(t => [...t.slice(-200), {
    id: uid(),
    text,
    value,
    kind
  }]);

  /* Compute the next display outside the updater. Calling setState from inside
     another state updater is invalid and silently drops the change. */
  const digit = d => {
    const v = display;
    let nv;
    if (fresh) nv = d === "." ? "0." : d;else if (d === "." && v.indexOf(".") >= 0) nv = v;else if (v === "0" && d !== ".") nv = d;else nv = v + d;
    setDisplay(nv);
    setFresh(false);
  };
  const apply = (a, b, o) => {
    if (o === "+") return a + b;
    if (o === "-") return a - b;
    if (o === "*") return a * b;
    if (o === "/") return b === 0 ? NaN : a / b;
    return b;
  };
  const operate = nextOp => {
    const v = cur();
    const sym = {
      "+": "+",
      "-": "−",
      "*": "×",
      "/": "÷"
    };
    if (acc == null) {
      setAcc(v);
      addTape(show(v), v, "entry");
    } else if (!fresh) {
      const r = apply(acc, v, op);
      addTape((op ? sym[op] + " " : "") + show(v), v, "entry");
      addTape("= " + show(r), r, "sub");
      setAcc(r);
      setDisplay(show(r));
    }
    setOp(nextOp);
    setFresh(true);
  };
  const equals = () => {
    const v = cur();
    if (acc == null || op == null) {
      addTape(show(v), v, "entry");
      setFresh(true);
      return;
    }
    const sym = {
      "+": "+",
      "-": "−",
      "*": "×",
      "/": "÷"
    };
    const r = apply(acc, v, op);
    addTape(sym[op] + " " + show(v), v, "entry");
    addTape("= " + show(r), r, "total");
    setDisplay(show(r));
    setAcc(null);
    setOp(null);
    setFresh(true);
  };
  const clearAll = () => {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setFresh(true);
  };
  const pct = () => {
    // On an adding machine, % after + or − is a percentage OF the accumulator
    const v = cur();
    if (acc != null && (op === "+" || op === "-")) {
      const r = acc * v / 100;
      setDisplay(show(r));
      setFresh(false);
      addTape(show(v) + "% of " + show(acc) + " = " + show(r), r, "note");
    } else {
      const r = v / 100;
      setDisplay(show(r));
      setFresh(false);
    }
  };
  const grab = (label, value) => {
    setDisplay(show(value));
    setFresh(false);
    addTape(label + " = " + show(value), value, "grab");
  };
  useEffect(() => {
    const onKey = e => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      const k = e.key;
      if (/^[0-9]$/.test(k)) {
        digit(k);
        e.preventDefault();
      } else if (k === ".") {
        digit(".");
        e.preventDefault();
      } else if (k === "+" || k === "-") {
        operate(k);
        e.preventDefault();
      } else if (k === "*" || k === "x") {
        operate("*");
        e.preventDefault();
      } else if (k === "/") {
        operate("/");
        e.preventDefault();
      } else if (k === "Enter" || k === "=") {
        equals();
        e.preventDefault();
      } else if (k === "Escape") {
        clearAll();
        e.preventDefault();
      } else if (k === "Backspace") {
        setDisplay(v => v.length <= 1 ? "0" : v.slice(0, -1));
        e.preventDefault();
      } else if (k === "%") {
        pct();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const grabs = result ? [["AGI", result.agi], ["Taxable income", result.taxableIncome], ["Total modeled federal tax", result.totalTax], ["Marginal rate", result.marginal], ["Sch C net", result.schedC], ["SE tax", result.seTax]].filter(g => g[1] !== 0) : [];
  const tapeText = () => tape.map(t => t.text).join("\n");
  return /*#__PURE__*/React.createElement(ToolWindow, {
    title: "Calculator",
    sub: scenarioName,
    onClose: onClose,
    initial: dockPos(300, 0),
    width: 272,
    onFocus: onFocus,
    z: z
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-calc-disp"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-calc-op"
  }, acc != null ? show(acc) + " " + ({
    "+": "+",
    "-": "−",
    "*": "×",
    "/": "÷"
  }[op] || "") : "", mem ? "   M" : ""), /*#__PURE__*/React.createElement("div", {
    className: "tp-calc-val"
  }, display)), /*#__PURE__*/React.createElement("div", {
    className: "tp-tape",
    ref: tapeRef
  }, !tape.length && /*#__PURE__*/React.createElement("div", {
    className: "tp-tape-empty"
  }, "Tape is empty. Every entry is recorded here."), tape.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    className: "tp-tape-line " + t.kind
  }, t.text))), /*#__PURE__*/React.createElement("div", {
    className: "tp-calc-pad"
  }, /*#__PURE__*/React.createElement(K, {
    l: "C",
    cls: "fn",
    on: clearAll
  }), /*#__PURE__*/React.createElement(K, {
    l: "←",
    cls: "fn",
    on: () => setDisplay(v => v.length <= 1 ? "0" : v.slice(0, -1))
  }), /*#__PURE__*/React.createElement(K, {
    l: "%",
    cls: "fn",
    on: pct
  }), /*#__PURE__*/React.createElement(K, {
    l: "÷",
    cls: "op",
    on: () => operate("/")
  }), /*#__PURE__*/React.createElement(K, {
    l: "7",
    on: () => digit("7")
  }), /*#__PURE__*/React.createElement(K, {
    l: "8",
    on: () => digit("8")
  }), /*#__PURE__*/React.createElement(K, {
    l: "9",
    on: () => digit("9")
  }), /*#__PURE__*/React.createElement(K, {
    l: "×",
    cls: "op",
    on: () => operate("*")
  }), /*#__PURE__*/React.createElement(K, {
    l: "4",
    on: () => digit("4")
  }), /*#__PURE__*/React.createElement(K, {
    l: "5",
    on: () => digit("5")
  }), /*#__PURE__*/React.createElement(K, {
    l: "6",
    on: () => digit("6")
  }), /*#__PURE__*/React.createElement(K, {
    l: "−",
    cls: "op",
    on: () => operate("-")
  }), /*#__PURE__*/React.createElement(K, {
    l: "1",
    on: () => digit("1")
  }), /*#__PURE__*/React.createElement(K, {
    l: "2",
    on: () => digit("2")
  }), /*#__PURE__*/React.createElement(K, {
    l: "3",
    on: () => digit("3")
  }), /*#__PURE__*/React.createElement(K, {
    l: "+",
    cls: "op",
    on: () => operate("+")
  }), /*#__PURE__*/React.createElement(K, {
    l: "±",
    on: () => setDisplay(v => v.charAt(0) === "-" ? v.slice(1) : "-" + v)
  }), /*#__PURE__*/React.createElement(K, {
    l: "0",
    on: () => digit("0")
  }), /*#__PURE__*/React.createElement(K, {
    l: ".",
    on: () => digit(".")
  }), /*#__PURE__*/React.createElement(K, {
    l: "=",
    cls: "eq",
    on: equals
  })), /*#__PURE__*/React.createElement("div", {
    className: "tp-calc-mem"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    onClick: () => {
      setMem(0);
    }
  }, "MC"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    onClick: () => {
      setDisplay(show(mem));
      setFresh(false);
    }
  }, "MR"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    onClick: () => setMem(m => m + cur())
  }, "M+"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    onClick: () => setMem(m => m - cur())
  }, "M−")), grabs.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "tp-calc-grab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead",
    style: {
      margin: "8px 0 5px"
    }
  }, "Pull from this scenario"), /*#__PURE__*/React.createElement("div", {
    className: "tp-chiprow"
  }, grabs.map(g => /*#__PURE__*/React.createElement("button", {
    key: g[0],
    className: "tp-chip sm",
    onClick: () => grab(g[0], g[1])
  }, g[0])))), /*#__PURE__*/React.createElement("div", {
    className: "tp-calc-foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    onClick: insertIntoInput,
    title: "Write the displayed result into the money input that was last focused"
  }, "Insert into input"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    disabled: !tape.length,
    onClick: () => wbCopyText(tapeText()).then(ok => flash(ok ? "Tape copied" : "Copy blocked")),
    title: "Copy the whole tape to the clipboard"
  }, "Copy tape"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    disabled: !tape.length,
    onClick: () => onSendToNotes("Calculator tape\n" + tapeText())
  }, "Send tape to notes"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    disabled: !tape.length,
    onClick: () => setTape([])
  }, "Clear tape"), flashMsg && /*#__PURE__*/React.createElement("em", {
    className: "tp-qcalc-msg"
  }, flashMsg)));
}

/* ============================================================================
   NOTEPAD
   ========================================================================== */
function Notepad({
  onClose,
  notes,
  setNotes,
  scenarioName,
  scenarioId,
  onFocus,
  z,
  draft,
  setDraft
}) {
  const add = () => {
    const text = (draft || "").trim();
    if (!text) return;
    const d = new Date();
    setNotes(n => [...n, {
      id: uid(),
      text,
      scenarioId,
      scenarioName,
      ts: d.getTime(),
      tsLabel: d.toLocaleString()
    }]);
    setDraft("");
  };
  return /*#__PURE__*/React.createElement(ToolWindow, {
    title: "Notes",
    sub: scenarioName,
    onClose: onClose,
    initial: dockPos(390, 1),
    width: 360,
    onFocus: onFocus,
    z: z
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "tp-notearea",
    value: draft,
    placeholder: "Working notes, review points, follow-ups…",
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        add();
        e.preventDefault();
      }
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "tp-note-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid sm",
    onClick: add,
    disabled: !(draft || "").trim()
  }, "Save note"), /*#__PURE__*/React.createElement("span", {
    className: "tp-hint"
  }, "⌘↵ to save")), /*#__PURE__*/React.createElement("div", {
    className: "tp-notelist"
  }, !notes.length && /*#__PURE__*/React.createElement("div", {
    className: "tp-tape-empty"
  }, "No notes yet. Saved notes are included in the Excel export and the client report."), [...notes].reverse().map(n => /*#__PURE__*/React.createElement("div", {
    key: n.id,
    className: "tp-noteitem"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-noteitem-head"
  }, /*#__PURE__*/React.createElement("span", null, n.tsLabel), /*#__PURE__*/React.createElement("em", null, n.scenarioName || "All scenarios"), /*#__PURE__*/React.createElement("button", {
    className: "tp-iconbtn",
    onClick: () => setNotes(x => x.filter(y => y.id !== n.id))
  }, I.trash)), /*#__PURE__*/React.createElement("div", {
    className: "tp-noteitem-body"
  }, n.text)))));
}

/* ============================================================================
   AUDIT TRAIL PAGE
   ========================================================================== */
function AuditPage({
  auditLog,
  setAuditLog,
  scenarios,
  results,
  year,
  status
}) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const rows = auditLog.filter(e => {
    if (filter !== "all" && e.scenarioId !== filter) return false;
    if (!ql) return true;
    return (e.label + " " + e.scenarioName + " " + (e.memo || "") + " " + e.from + " " + e.to).toLowerCase().includes(ql);
  });
  const totalMoved = auditLog.reduce((a, e) => a + Math.abs(e.delta || 0), 0);
  const netMoved = auditLog.reduce((a, e) => a + (e.delta || 0), 0);
  const setMemo = (id, memo) => setAuditLog(l => l.map(e => e.id === id ? {
    ...e,
    memo
  } : e));
  const tblRef = useRef(null);
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-kpis"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-kpi"
  }, /*#__PURE__*/React.createElement("span", null, "Changes recorded"), /*#__PURE__*/React.createElement("strong", null, auditLog.length), /*#__PURE__*/React.createElement("em", null, new Set(auditLog.map(e => e.scenarioId)).size, " scenario", new Set(auditLog.map(e => e.scenarioId)).size === 1 ? "" : "s", " touched")), /*#__PURE__*/React.createElement("div", {
    className: "tp-kpi"
  }, /*#__PURE__*/React.createElement("span", null, "Gross tax movement"), /*#__PURE__*/React.createElement("strong", null, usd$(totalMoved)), /*#__PURE__*/React.createElement("em", null, "sum of absolute impacts")), /*#__PURE__*/React.createElement("div", {
    className: "tp-kpi " + (netMoved < 0 ? "good" : netMoved > 0 ? "warn" : "")
  }, /*#__PURE__*/React.createElement("span", null, "Net tax movement"), /*#__PURE__*/React.createElement("strong", null, usd$(netMoved)), /*#__PURE__*/React.createElement("em", null, netMoved < 0 ? "reduction across the session" : netMoved > 0 ? "increase across the session" : "no net change")), /*#__PURE__*/React.createElement("div", {
    className: "tp-kpi"
  }, /*#__PURE__*/React.createElement("span", null, "Entries with a memo"), /*#__PURE__*/React.createElement("strong", null, auditLog.filter(e => e.memo).length), /*#__PURE__*/React.createElement("em", null, "documented for the workpaper file"))), /*#__PURE__*/React.createElement(Note, null, "Every input change is recorded with a timestamp, the value before and after, and the movement in total tax it caused. Rapid edits to the same field are coalesced into one entry so the trail reads as decisions rather than keystrokes. Add a memo to any line to record why the change was made — memos carry through to the Excel export."), /*#__PURE__*/React.createElement(Card, {
    title: "Change history",
    right: /*#__PURE__*/React.createElement("div", {
      className: "tp-inline"
    }, /*#__PURE__*/React.createElement("select", {
      className: "tp-mini-sel",
      style: {
        width: 190
      },
      value: filter,
      onChange: e => setFilter(e.target.value)
    }, /*#__PURE__*/React.createElement("option", {
      value: "all"
    }, "All scenarios"), scenarios.map(s => /*#__PURE__*/React.createElement("option", {
      key: s.id,
      value: s.id
    }, s.name))), /*#__PURE__*/React.createElement("input", {
      className: "tp-txt",
      style: {
        width: 190
      },
      placeholder: "Search…",
      value: q,
      onChange: e => setQ(e.target.value)
    }), /*#__PURE__*/React.createElement(CopyForExcel, {
      forRef: tblRef
    }), /*#__PURE__*/React.createElement("button", {
      className: "tp-btn ghost sm",
      disabled: !auditLog.length,
      onClick: () => {
        if (confirm("Clear the entire audit trail? This cannot be undone.")) setAuditLog([]);
      }
    }, "Clear"))
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-tblwrap",
    ref: tblRef
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 132
    }
  }, "Time"), /*#__PURE__*/React.createElement("th", null, "Scenario"), /*#__PURE__*/React.createElement("th", null, "Field"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "From"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "To"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Tax impact"), /*#__PURE__*/React.createElement("th", null, "Memo"))), /*#__PURE__*/React.createElement("tbody", null, !rows.length && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 7,
    className: "tp-empty"
  }, auditLog.length ? "No entries match this filter." : "No changes recorded yet. Edit any input and it will appear here.")), [...rows].reverse().map(e => /*#__PURE__*/React.createElement("tr", {
    key: e.id
  }, /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, e.tsLabel), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, e.scenarioName), /*#__PURE__*/React.createElement("td", null, e.label, e.kind && /*#__PURE__*/React.createElement("span", {
    className: "tp-tag"
  }, e.kind)), /*#__PURE__*/React.createElement("td", {
    className: "num sm"
  }, e.from === "" || e.from == null ? "—" : String(e.from)), /*#__PURE__*/React.createElement("td", {
    className: "num sm"
  }, e.to === "" || e.to == null ? "—" : String(e.to)), /*#__PURE__*/React.createElement("td", {
    className: "num " + (e.delta < 0 ? "up" : e.delta > 0 ? "down" : "")
  }, e.delta == null ? "—" : (e.delta > 0 ? "+" : "") + usd$(e.delta)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    placeholder: "Why…",
    value: e.memo || "",
    onChange: ev => setMemo(e.id, ev.target.value)
  })))))))));
}

/* ============================================================================
   DATA PAGE — Excel export and import, session save and load
   ========================================================================== */
function DataPage({
  scenarios,
  setScenarios,
  results,
  status,
  year,
  auditLog,
  notes,
  logEvent,
  setYear,
  setStatus,
  clientRecord
}) {
  const [msg, setMsg] = useState(null);
  const [client, setClient] = useState(clientRecord ? clientRecord.name : "");
  const [preparer, setPreparer] = useState("");
  const [firm, setFirm] = useState("");
  const [mode, setMode] = useState("replace");
  const fileRef = useRef(null);
  const jsonRef = useRef(null);
  const flash = (kind, text) => {
    setMsg({
      kind,
      text
    });
    setTimeout(() => setMsg(null), 8000);
  };
  const stamp = () => new Date().toISOString().slice(0, 10);
  const doExport = () => {
    try {
      const d = new Date();
      const bytes = buildTaxWorkbook({
        scenarios,
        results,
        status,
        year,
        auditLog,
        notes,
        meta: {
          client,
          clientId: clientRecord ? clientRecord.clientId : "",
          preparer,
          firm,
          exportedAt: d.toLocaleString(),
          createdISO: d.toISOString().replace(/\.\d+Z$/, "Z")
        }
      });
      downloadBlob(bytes, (client || "Tax_Planning_Workbench").replace(/[^\w-]+/g, "_") + "_" + TY[year].label + "_" + stamp() + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      flash("ok", "Workbook exported. Every computed cell is a live formula — open the Cover sheet for how to trace figures, and check the tie-out block at the foot of each schedule.");
    } catch (err) {
      flash("bad", "Export failed: " + err.message);
    }
  };
  const doTemplate = () => {
    try {
      downloadBlob(buildTemplateWorkbook(year, status), "Tax_Planning_Workbench_input_template_" + TY[year].label + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      flash("ok", "Blank template exported. Fill the scenario columns, then import it back here.");
    } catch (err) {
      flash("bad", "Template export failed: " + err.message);
    }
  };
  const doImport = async file => {
    if (!file) return;
    try {
      const sheets = await readWorkbook(file);
      const inputs = sheets["Inputs"] || sheets[Object.keys(sheets).find(k => /input/i.test(k))];
      if (!inputs) throw new Error("No sheet named Inputs was found in this workbook.");
      const loaded = scenariosFromSheet(inputs);
      if (!loaded.length) throw new Error("The Inputs sheet had no populated scenario columns.");
      setScenarios(cur => mode === "replace" ? loaded : cur.concat(loaded));
      logEvent({
        label: "Imported " + loaded.length + " scenario" + (loaded.length === 1 ? "" : "s") + " from " + file.name,
        kind: "import",
        scenarioName: "Session",
        from: scenarios.length + " scenarios",
        to: (mode === "replace" ? loaded.length : scenarios.length + loaded.length) + " scenarios"
      });
      flash("ok", "Imported " + loaded.length + " scenario" + (loaded.length === 1 ? "" : "s") + ": " + loaded.map(s => s.name).join(", ") + ".");
    } catch (err) {
      flash("bad", "Import failed: " + err.message);
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const doSaveJSON = () => {
    const payload = {
      version: 2,
      savedAt: new Date().toISOString(),
      year,
      status,
      scenarios,
      notes,
      auditLog
    };
    downloadBlob(new TextEncoder().encode(JSON.stringify(payload, null, 2)), "Tax_Planning_Workbench_session_" + stamp() + ".json", "application/json");
    flash("ok", "Session saved. This file restores scenarios, notes and the audit trail exactly.");
  };
  const doLoadJSON = async file => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.scenarios || !data.scenarios.length) throw new Error("No scenarios found in this file.");
      setScenarios(data.scenarios.map(s => Object.assign(blankScenario(s.name), s)));
      flash("ok", "Session restored from " + file.name + ".");
    } catch (err) {
      flash("bad", "Could not read that session file: " + err.message);
    }
    if (jsonRef.current) jsonRef.current.value = "";
  };
  const sheetList = [["Cover", "Engagement details and how to audit the workbook"], ["Constants", "Every statutory figure with its authority, exposed as Excel defined names"], ["Inputs", "Every raw figure, keyed — edit here and the workbook recalculates; this is the round-trip sheet"], ["Schedule C", "Per business, per expense line, with subtotals"], ["Schedule SE", "Net earnings, the wage base offset, and the Additional Medicare Tax"], ["Retirement", "Maximum deductible contribution under each plan design"], ["Adjustments", "Self-employed health insurance, HSA, IRA, and Schedule 1-A"], ["Schedule A", "SALT cap phase-down, the charitable floor, and the overall reduction"], ["QBI 199A", "Per entity, with the wage and UBIA limit and the ratable phase-in"], ["Form 1040", "The full walk from total income to total tax"], ["MAGI Thresholds", "Every threshold-sensitive provision with its position"], ["Audit Trail", "Change history with tax impact and memos"], ["Notes", "Working notes"]];
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, msg && /*#__PURE__*/React.createElement(Note, {
    kind: msg.kind === "ok" ? "ok" : "bad"
  }, msg.text), /*#__PURE__*/React.createElement(Card, {
    title: "Export to Excel",
    sub: "live formulas throughout"
  }, /*#__PURE__*/React.createElement(Note, null, "Every computed cell in the export is a real Excel formula pointing at a named statutory constant or an input cell — nothing is a dead number except raw inputs and recorded history. Each schedule ends with a tie-out that compares the formula result against the value this engine produced and flags any variance, so the workbook audits itself on open."), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Client name"), /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    value: client,
    onChange: e => setClient(e.target.value),
    placeholder: "Client"
  })), /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Prepared by"), /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    value: preparer,
    onChange: e => setPreparer(e.target.value),
    placeholder: "Advisor"
  })), /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Firm"), /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    value: firm,
    onChange: e => setFirm(e.target.value),
    placeholder: "Firm"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "tp-rp-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid",
    onClick: doExport
  }, I.download, " Export workbook (.xlsx)"), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost",
    onClick: doTemplate
  }, I.file, " Blank input template"), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost",
    onClick: doSaveJSON
  }, I.download, " Save session (.json)")), /*#__PURE__*/React.createElement("div", {
    className: "tp-rp-actions",
    style: {
      borderTop: "none",
      paddingTop: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost",
    onClick: () => {
      const g = goldenScenarios();
      setScenarios(cur => mode === "replace" ? g : cur.concat(g));
      // The case is defined for TY2025, married filing jointly — pin the basis
      // so the published figures reproduce without a manual step.
      if (setYear) setYear(2025);
      if (setStatus) setStatus("mfj");
      logEvent({
        label: "Loaded the golden regression case",
        kind: "structure",
        scenarioName: "Session",
        to: g.map(x => x.name).join(", ")
      });
      flash("ok", "Golden case loaded and the basis set to TY2025, married filing jointly. Expect $227,914 of total tax for the sole proprietor and $182,028 for the S corporation — a $45,886 swing. The Reference tab runs all the assertions live.");
    }
  }, I.check, " Load golden test case")), /*#__PURE__*/React.createElement("div", {
    className: "tp-tblwrap",
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Sheet"), /*#__PURE__*/React.createElement("th", null, "Contents"))), /*#__PURE__*/React.createElement("tbody", null, sheetList.map(s => /*#__PURE__*/React.createElement("tr", {
    key: s[0]
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, s[0])), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, s[1]))))))), /*#__PURE__*/React.createElement(Card, {
    title: "Import"
  }, /*#__PURE__*/React.createElement(Note, null, "Import reads the ", /*#__PURE__*/React.createElement("strong", null, "Inputs"), " sheet, matching on the key column, so both a blank template and a full export round-trip. Add columns to the right for more scenarios. Blank cells are treated as zero."), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "On import"), /*#__PURE__*/React.createElement(Seg, {
    small: true,
    value: mode,
    onChange: setMode,
    options: [{
      v: "replace",
      l: "Replace scenarios"
    }, {
      v: "append",
      l: "Add to existing"
    }]
  }))), /*#__PURE__*/React.createElement("div", {
    className: "tp-rp-actions"
  }, /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: ".xlsx",
    style: {
      display: "none"
    },
    onChange: e => doImport(e.target.files[0])
  }), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid",
    onClick: () => fileRef.current && fileRef.current.click()
  }, I.file, " Import Excel (.xlsx)"), /*#__PURE__*/React.createElement("input", {
    ref: jsonRef,
    type: "file",
    accept: ".json",
    style: {
      display: "none"
    },
    onChange: e => doLoadJSON(e.target.files[0])
  }), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost",
    onClick: () => jsonRef.current && jsonRef.current.click()
  }, I.file, " Restore session (.json)")), /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, "Importing with ", /*#__PURE__*/React.createElement("strong", null, "Replace scenarios"), " discards the scenarios currently loaded. The audit trail and notes are kept, and the import itself is recorded as an audit entry. Save the session first if you want an exact restore point.")));
}
