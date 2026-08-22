/* ==== 20-tools-panel ==== */
/* ============================================================================
   RIGHT TOOLS PANEL — quick calculator, active-scenario snapshot, bracket
   headroom, validation center, and the contextual calculator launcher.
   Everything here reads engine output; nothing writes to the scenario.
   ========================================================================== */

const TOOL_CALCS = [{
  id: "scorp",
  label: "S-Corp Salary"
}, {
  id: "qbi",
  label: "QBI"
}, {
  id: "sstb",
  label: "SSTB Phaseout"
}, {
  id: "brackets",
  label: "Tax Brackets"
}, {
  id: "charitable",
  label: "Charitable"
}, {
  id: "auditrisk",
  label: "Audit Risk"
}, {
  id: "s163j",
  label: "§163(j)"
}, {
  id: "payroll",
  label: "Payroll Tax"
}, {
  id: "roth",
  label: "Roth Conversion"
}, {
  id: "retirement",
  label: "Retirement"
}];

/* A compact section inside the tools rail */
function ToolSection({ id, title, children, defaultOpen }) {
  const [open, setOpen] = useUIPref("tool:" + id, defaultOpen !== false);
  return EL("div", {
    className: "tp-toolsec"
  }, EL("button", {
    type: "button",
    className: "tp-toolsec-head",
    onClick: () => setOpen(!open),
    "aria-expanded": open
  }, EL("span", {
    className: "tp-sec-chev" + (open ? " open" : "")
  }, I.chevR), title), open && EL("div", {
    className: "tp-toolsec-body"
  }, children));
}

/* ---- Quick calculator with a tape ---- */
function QuickCalc({ onAddNote }) {
  const [disp, setDisp] = useState("0");
  const [acc, setAcc] = useState(null);
  const [op, setOp] = useState(null);
  const [fresh, setFresh] = useState(true);
  const [tape, setTape] = useState([]);
  const [msg, setMsg] = useState("");
  const cur = () => parseFloat(disp) || 0;
  const apply = (a, o, b) => o === "+" ? a + b : o === "−" ? a - b : o === "×" ? a * b : b === 0 ? 0 : a / b;
  const press = d => {
    if (fresh) {
      setDisp(d === "." ? "0." : d);
      setFresh(false);
    } else if (!(d === "." && disp.includes("."))) setDisp(disp + d);
  };
  const pressOp = o => {
    const v = cur();
    if (acc != null && op && !fresh) {
      const r = apply(acc, op, v);
      setTape(t => [...t, { txt: usdc(v) + " " + o, cls: "" }]);
      setAcc(r);
      setDisp(String(Math.round(r * 100) / 100));
    } else {
      setAcc(v);
      setTape(t => [...t, { txt: usdc(v) + " " + o, cls: "" }]);
    }
    setOp(o);
    setFresh(true);
  };
  const equals = () => {
    if (acc == null || !op) return;
    const v = cur();
    const r = apply(acc, op, v);
    setTape(t => [...t, { txt: usdc(v), cls: "" }, { txt: usdc(r), cls: "total" }]);
    setDisp(String(Math.round(r * 100) / 100));
    setAcc(null);
    setOp(null);
    setFresh(true);
  };
  const clear = () => {
    setDisp("0");
    setAcc(null);
    setOp(null);
    setFresh(true);
  };
  const copy = () => {
    try {
      navigator.clipboard.writeText(disp);
      setMsg("Copied");
    } catch (e) {
      setMsg("Copy blocked");
    }
    setTimeout(() => setMsg(""), 1200);
  };
  const insert = () => {
    const el = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("tp-money") ? document.activeElement : window.__tpLastMoneyInput;
    if (el && el.classList && el.classList.contains("tp-money")) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, disp);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      setMsg("Inserted");
    } else setMsg("Focus an input first");
    setTimeout(() => setMsg(""), 1600);
  };
  const keys = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "C", "+"];
  return EL("div", {
    className: "tp-qcalc"
  }, EL("div", {
    className: "tp-qcalc-tape"
  }, !tape.length ? EL("span", {
    className: "tp-tape-empty"
  }, "Tape is empty.") : tape.slice(-14).map((l, i) => EL("div", {
    key: i,
    className: "tp-tape-line " + l.cls
  }, l.txt))), EL("div", {
    className: "tp-qcalc-disp"
  }, EL("span", null, acc != null && op ? usdc(acc) + " " + op : ""), EL("strong", null, disp)), EL("div", {
    className: "tp-qcalc-pad"
  }, keys.map(k => EL("button", {
    key: k,
    type: "button",
    className: "tp-calcbtn " + ("÷×−+".includes(k) ? "op" : k === "C" ? "fn" : ""),
    onClick: () => "÷×−+".includes(k) ? pressOp(k) : k === "C" ? clear() : press(k)
  }, k)), EL("button", {
    type: "button",
    className: "tp-calcbtn eq",
    style: { gridColumn: "1 / -1" },
    onClick: equals
  }, "=")), EL("div", {
    className: "tp-qcalc-foot"
  }, EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: copy
  }, "Copy"), EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: insert,
    title: "Write the result into the money input that was last focused"
  }, "Insert into input"), onAddNote && EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => {
      setTape(t => [...t, { txt: "— saved to notes —", cls: "note" }]);
      onAddNote("Calculator: " + tape.map(l => l.txt).join("  ") + (tape.length ? "  = " : "") + disp);
    }
  }, "Note"), EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => setTape([])
  }, "Clear tape"), msg && EL("em", {
    className: "tp-qcalc-msg"
  }, msg)));
}

/* ---- Bracket headroom block ---- */
function BracketHeadroom({ r, status }) {
  const C = r.C;
  const br = bracketFill(r.ordinaryTaxable, status, C);
  const zeroCapacity = clamp0(C.ltcg[status].zero - r.taxableIncome);
  const niitDist = r.magi.niit - C.niitThreshold[status];
  const medBase = r.incomeParts.wages + r.scorpComp + clamp0(r.incomeParts.schedC) * 0.9235;
  const medDist = medBase - C.addlMedThreshold[status];
  const qbiPos = r.tiBeforeQBI - C.qbiThreshold[status];
  const qbiWidth = C.qbiPhaseInWidth[status];
  return EL("div", {
    className: "tp-statstack"
  }, EL(StatLine, {
    label: "Ordinary bracket",
    value: pct(br.marginalRate, 0)
  }), EL(StatLine, {
    label: "Room left in bracket",
    value: br.headroom === Infinity ? "top bracket" : usd$(br.headroom),
    title: "Ordinary income remaining before the next bracket — also the Roth-conversion working space"
  }), EL(StatLine, {
    label: "0% capital-gain capacity",
    value: zeroCapacity > 0 ? usd$(zeroCapacity) : "—",
    cls: zeroCapacity > 0 ? "good" : ""
  }), EL(StatLine, {
    label: "NIIT threshold",
    value: niitDist >= 0 ? usd$(niitDist) + " over" : usd$(-niitDist) + " under",
    cls: niitDist >= 0 ? "bad" : "good"
  }), EL(StatLine, {
    label: "Add'l Medicare threshold",
    value: medDist >= 0 ? usd$(medDist) + " over" : usd$(-medDist) + " under",
    cls: medDist >= 0 ? "bad" : "good"
  }), EL(StatLine, {
    label: "§199A threshold",
    value: qbiPos <= 0 ? usd$(-qbiPos) + " under" : qbiPos < qbiWidth ? "in phase-in (" + pct(qbiPos / qbiWidth, 0) + ")" : "fully above",
    cls: qbiPos <= 0 ? "good" : qbiPos < qbiWidth ? "warn" : "bad",
    title: "Taxable income before the QBI deduction, measured against the §199A(e)(2) threshold"
  }));
}

/* ---- The rail itself ---- */
function ToolsPanel({
  client,
  alignment,
  active,
  result,
  validation,
  status,
  year,
  onOpenCalc,
  onGotoScenarios,
  onAddNote
}) {
  const r = result;
  /* Pinned calculators float to the top of the launcher; the pin set is a
     device-local interface preference. */
  const [pinned, setPinned] = useUIPref("pinnedCalcs", []);
  const togglePin = id => setPinned(pinned.includes(id) ? pinned.filter(x => x !== id) : [...pinned, id]);
  const orderedCalcs = [...TOOL_CALCS].sort((a, b) => (pinned.includes(b.id) ? 1 : 0) - (pinned.includes(a.id) ? 1 : 0));
  const overrides = (validation.warnings || []).filter(v => /override|manual/i.test(v.msg)).length;
  const topGoal = client && (client.goals || []).slice().sort((a, b) => a.priority - b.priority)[0];
  return EL("div", {
    className: "tp-tools-inner"
  }, EL(ToolSection, {
    id: "snapshot",
    title: "Client snapshot"
  }, EL("div", {
    className: "tp-tool-scname",
    title: (client ? client.name + " — " : "") + active.name
  }, client ? client.name : active.name, EL("em", null, (client ? client.clientId + " · " : "") + TY[year].label, " · ", STATUSES.find(s => s.v === status).l), EL("em", null, "Scenario: ", active.name)), EL("div", {
    className: "tp-statstack"
  }, EL(StatLine, {
    label: "Total income",
    value: usd$(r.grossIncome)
  }), EL(StatLine, {
    label: "Taxable income",
    value: usd$(r.taxableIncome)
  }), EL(StatLine, {
    label: "Marginal bracket",
    value: pct(r.marginal, 0)
  }), EL(StatLine, {
    label: "Total modeled federal tax",
    value: usd$(r.totalTax),
    cls: "strong"
  }), EL(StatLine, {
    label: "After-tax economic income",
    value: usd$(r.afterTaxCash),
    cls: "good"
  }), EL(StatLine, {
    label: "Spendable after-tax cash",
    value: usd$(r.spendableAfterTaxCash),
    cls: "good"
  }), topGoal && EL(StatLine, {
    label: "Primary goal",
    value: topGoal.label,
    title: topGoal.reason || ""
  }))), client && alignment && alignment.rows.length > 0 && EL(ToolSection, {
    id: "goals",
    title: "Goal monitor"
  }, alignment.pct != null && EL(StatLine, {
    label: "Goal alignment (this scenario)",
    value: alignment.pct + "%",
    cls: alignment.pct >= 80 ? "good" : alignment.pct >= 50 ? "warn" : "bad"
  }), EL("div", {
    className: "tp-statstack"
  }, alignment.rows.slice(0, 6).map((row, i) => EL(StatLine, {
    key: i,
    label: row.label,
    value: row.status === "strong" ? "Strong" : row.status === "met" ? "Met" : row.status === "moderate" ? "Moderate" : row.status === "at-risk" ? "At risk" : "Review",
    cls: row.status === "strong" || row.status === "met" ? "good" : row.status === "at-risk" ? "bad" : row.status === "moderate" ? "warn" : "",
    title: row.detail
  })))), EL(ToolSection, {
    id: "headroom",
    title: "Bracket headroom"
  }, EL(BracketHeadroom, {
    r: r,
    status: status
  })), EL(ToolSection, {
    id: "validation",
    title: "Validation center"
  }, EL("div", {
    className: "tp-vcenter"
  }, EL("button", {
    type: "button",
    className: "tp-vcount bad",
    onClick: onGotoScenarios,
    disabled: !validation.errors.length
  }, EL("strong", null, validation.errors.length), " blocking"), EL("button", {
    type: "button",
    className: "tp-vcount warn",
    onClick: onGotoScenarios,
    disabled: !validation.warnings.length
  }, EL("strong", null, validation.warnings.length), " warnings"), EL("button", {
    type: "button",
    className: "tp-vcount info",
    onClick: onGotoScenarios,
    disabled: !validation.infos.length
  }, EL("strong", null, validation.infos.length), " to review"), EL("button", {
    type: "button",
    className: "tp-vcount info",
    onClick: onGotoScenarios,
    disabled: !overrides
  }, EL("strong", null, overrides), " overrides")), validation.all.length > 0 && EL("div", {
    className: "tp-vcenter-list"
  }, validation.errors.map((v, i) => EL("div", {
    key: "e" + i,
    className: "tp-vchip err"
  }, v.msg)), validation.warnings.slice(0, 4).map((v, i) => EL("div", {
    key: "w" + i,
    className: "tp-vchip warn"
  }, v.msg)))), EL(ToolSection, {
    id: "launcher",
    title: "Calculators"
  }, EL("div", {
    className: "tp-launcher"
  }, orderedCalcs.map(c => EL("div", {
    key: c.id,
    className: "tp-launchrow" + (pinned.includes(c.id) ? " pinned" : "")
  }, EL("button", {
    type: "button",
    className: "tp-launchbtn",
    onClick: () => onOpenCalc(c.id)
  }, c.label), EL("button", {
    type: "button",
    className: "tp-pinbtn" + (pinned.includes(c.id) ? " on" : ""),
    title: pinned.includes(c.id) ? "Unpin from the top of this list" : "Pin to the top of this list",
    "aria-label": (pinned.includes(c.id) ? "Unpin " : "Pin ") + c.label,
    "aria-pressed": pinned.includes(c.id),
    onClick: () => togglePin(c.id)
  }, "★")))), EL("p", {
    className: "tp-hint",
    style: { marginTop: 7 }
  }, "Calculators prefill from the active scenario. Overrides are temporary and never modify the scenario itself.")), EL(ToolSection, {
    id: "qcalc",
    title: "Quick calculator",
    defaultOpen: false
  }, EL(QuickCalc, {
    onAddNote: onAddNote
  })));
}
