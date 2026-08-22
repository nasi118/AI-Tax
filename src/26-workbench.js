/* ==== 26-workbench ==== */
/* ============================================================================
   PROFESSIONAL WORKBENCH UTILITIES — copy-for-Excel, command bar, calculation
   trace, pop-out views, recent items. Presentation and navigation only:
   nothing here computes a tax number or mutates a scenario. Every amount a
   trace shows is read from the deterministic engine's result object.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   Clipboard helpers. navigator.clipboard needs a secure context; the
   execCommand path keeps copy working on plain-HTTP internal hosts.
   ------------------------------------------------------------------------- */
function wbCopyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true, () => wbCopyFallback(text));
  }
  return Promise.resolve(wbCopyFallback(text));
}
function wbCopyFallback(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

/* ---------------------------------------------------------------------------
   Copy for Excel — serialise a rendered table to tab-separated values with
   Excel-native cells: "$1,234" and "(1,234)" become plain numbers, "12.3%"
   stays a percent literal (Excel parses it as a percentage), text stays text.
   CSV is deliberately not used: TSV pastes straight into a worksheet grid.
   ------------------------------------------------------------------------- */
function wbCellForExcel(raw) {
  let t = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
  if (!t || t === "—" || t === "–") return "";
  // Normalise the typographic minus the app renders for negatives
  let s = t.replace(/−/g, "-");
  let neg = false;
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) {
    neg = true;
    s = paren[1];
  }
  if (s.charAt(0) === "-") {
    neg = true;
    s = s.slice(1);
  }
  s = s.replace(/^\$/, "").replace(/,/g, "");
  if (/^\d+(\.\d+)?$/.test(s)) return (neg ? "-" : "") + s;
  if (/^\d+(\.\d+)?%$/.test(s)) return (neg ? "-" : "") + s; // percent literal
  return t; // anything non-numeric is preserved verbatim
}
function wbTableToTSV(tableEl) {
  if (!tableEl) return "";
  const lines = [];
  tableEl.querySelectorAll("tr").forEach(tr => {
    // Skip rows that are pure chrome (e.g. an input-only memo row is kept:
    // inputs contribute their current value)
    const cells = [];
    tr.querySelectorAll("th,td").forEach(cell => {
      const input = cell.querySelector("input,textarea,select");
      const raw = input ? input.value : cell.textContent;
      const v = wbCellForExcel(raw);
      cells.push(v);
      const span = parseInt(cell.getAttribute("colspan") || "1", 10);
      for (let i = 1; i < span; i++) cells.push("");
    });
    if (cells.length) lines.push(cells.join("\t"));
  });
  return lines.join("\n");
}
/* CSS-grid ledgers (div cells, not <table>) serialise by chunking children
   into rows of `cols` cells; full-width group headers get their own line. */
function wbGridToTSV(gridEl, cols) {
  if (!gridEl) return "";
  const lines = [];
  let row = [];
  Array.from(gridEl.children).forEach(cell => {
    const full = cell.classList.contains("tp-group") || /1\s*\/\s*-?\d/.test(cell.style.gridColumn || "");
    const input = cell.querySelector("input,select,textarea");
    const v = wbCellForExcel(input ? input.value : cell.textContent);
    if (full) {
      if (row.length) {
        lines.push(row.join("\t"));
        row = [];
      }
      lines.push(v);
      return;
    }
    row.push(v);
    if (row.length >= cols) {
      lines.push(row.join("\t"));
      row = [];
    }
  });
  if (row.length) lines.push(row.join("\t"));
  return lines.join("\n");
}

/* Button that copies the nearest table inside the element `forRef` points at.
   Lightweight enough to sit in any card header or toolbar. */
function CopyForExcel({ forRef, label, title }) {
  const [msg, setMsg] = useState("");
  const flash = m => {
    setMsg(m);
    setTimeout(() => setMsg(""), 1600);
  };
  return EL(React.Fragment, null, EL("button", {
    type: "button",
    className: "tp-mini tp-copyxl",
    title: title || "Copy this table as tab-separated values that paste into Excel as real numbers",
    onClick: () => {
      const root = forRef && forRef.current;
      const tbl = root ? (root.tagName === "TABLE" ? root : root.querySelector("table")) : null;
      const tsv = wbTableToTSV(tbl);
      if (!tsv) {
        flash("Nothing to copy");
        return;
      }
      wbCopyText(tsv).then(ok => flash(ok ? "Copied for Excel" : "Copy blocked"));
    }
  }, label || "⧉ Copy for Excel"), msg && EL("em", { className: "tp-copyxl-msg" }, msg));
}

/* ---------------------------------------------------------------------------
   Recent items — small navigation history kept in the UI-preference store.
   ------------------------------------------------------------------------- */
function wbPushRecent(entry) {
  const list = (getUIPref("recents", []) || []).filter(x => !(x.kind === entry.kind && x.id === entry.id));
  list.unshift({ ...entry, at: Date.now() });
  setUIPref("recents", list.slice(0, 12));
}
function wbGetRecents() {
  return getUIPref("recents", []) || [];
}

/* ---------------------------------------------------------------------------
   Pop-out / duplicate view. A new tab or pop-out window opens THIS app at the
   same tab and client via URL parameters. Case data is NOT duplicated — every
   view reads the same browser store, and a storage listener in the app shell
   refreshes open views when another tab saves. The URL only ever carries
   interface state (tab id, client id), never tax data.
   ------------------------------------------------------------------------- */
function wbViewURL(tab, clientId) {
  const u = new URL(window.location.href);
  u.search = "";
  u.searchParams.set("tab", tab);
  if (clientId) u.searchParams.set("client", clientId);
  return u.toString();
}
function wbOpenNewTab(tab, clientId) {
  window.open(wbViewURL(tab, clientId), "_blank", "noopener");
}
function wbOpenPopout(tab, clientId) {
  window.open(wbViewURL(tab, clientId), "_blank", "noopener,popup,width=1180,height=840");
}
function wbInitialViewParams() {
  try {
    const p = new URLSearchParams(window.location.search);
    return { tab: p.get("tab") || null, client: p.get("client") || null };
  } catch (e) {
    return { tab: null, client: null };
  }
}

/* ---------------------------------------------------------------------------
   COMMAND BAR — Ctrl/Cmd+K universal search. Navigation-first by design: it
   finds pages, clients, scenarios, calculators and actions that exist in the
   app. It never fabricates authority or content results — content lives on
   its pages, and the empty state says exactly that.
   ------------------------------------------------------------------------- */
function CommandBar({ open, onClose, items, recents }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  useEscape(onClose, open);
  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 30);
    }
  }, [open]);
  if (!open) return null;
  const ql = q.trim().toLowerCase();
  const scored = ql
    ? items
        .map(it => {
          const hay = (it.label + " " + (it.hint || "") + " " + it.group).toLowerCase();
          let score = -1;
          if (hay.startsWith(ql)) score = 0;
          else if (it.label.toLowerCase().includes(ql)) score = 1;
          else if (hay.includes(ql)) score = 2;
          return { it, score };
        })
        .filter(x => x.score >= 0)
        .sort((a, b) => a.score - b.score)
        .map(x => x.it)
        .slice(0, 14)
    : (recents || [])
        .map(rc => items.find(it => it.kind === rc.kind && it.id === rc.id))
        .filter(Boolean)
        .slice(0, 8);
  const showing = ql ? scored : scored;
  const run = it => {
    if (!it) return;
    onClose();
    it.run();
  };
  const onKey = e => {
    if (e.key === "ArrowDown") {
      setSel(s => Math.min(showing.length - 1, s + 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setSel(s => Math.max(0, s - 1));
      e.preventDefault();
    } else if (e.key === "Enter") {
      run(showing[Math.max(0, Math.min(sel, showing.length - 1))]);
      e.preventDefault();
    }
  };
  let lastGroup = null;
  return EL(React.Fragment, null,
    EL("div", { className: "tp-cmdbar-overlay", onMouseDown: onClose }),
    EL("div", { className: "tp-cmdbar", role: "dialog", "aria-modal": "true", "aria-label": "Search and commands" },
      EL("input", {
        ref: inputRef,
        className: "tp-cmdbar-input",
        placeholder: "Search pages, clients, scenarios, calculators, actions…",
        value: q,
        "aria-label": "Search pages, clients, scenarios, calculators and actions",
        onChange: e => {
          setQ(e.target.value);
          setSel(0);
        },
        onKeyDown: onKey
      }),
      EL("div", { className: "tp-cmdbar-list", role: "listbox" },
        !showing.length && EL("div", { className: "tp-cmdbar-empty" },
          ql
            ? "No pages, clients, scenarios, calculators or actions match. This search navigates the workbench — it does not search tax authorities or invent results; statutory figures live on the Reference tab."
            : "Type to search. Recent destinations appear here as you use the workbench."),
        !ql && showing.length > 0 && EL("div", { className: "tp-cmdbar-group" }, "Recent"),
        showing.map((it, i) => {
          const head = ql && it.group !== lastGroup ? EL("div", { key: "g" + it.group + i, className: "tp-cmdbar-group" }, it.group) : null;
          lastGroup = it.group;
          return EL(React.Fragment, { key: it.kind + ":" + it.id },
            head,
            EL("button", {
              type: "button",
              className: "tp-cmdbar-item" + (i === sel ? " on" : ""),
              onMouseEnter: () => setSel(i),
              onClick: () => run(it)
            }, EL("span", { className: "tp-cmdbar-ic" }, it.icon || "•"),
              EL("span", { className: "tp-cmdbar-lbl" }, it.label),
              it.hint && EL("em", null, it.hint)));
        })),
      EL("div", { className: "tp-cmdbar-foot" },
        EL("span", null, "↑↓ select · Enter open · Esc close"),
        EL("span", null, "Ctrl+K / ⌘K"))));
}

/* ---------------------------------------------------------------------------
   CALCULATION TRACE — "Where did this figure come from?"
   Every value shown is read from the engine result object of the scenario; the
   drawer adds only labels, the formula description and the authority cite.
   ------------------------------------------------------------------------- */
function wbBuildTrace(lineId, s, r, status, year) {
  const C = r.C;
  const inRow = (label, value, note) => ({ kind: "input", label, value, note: note || "user entry" });
  const calcRow = (label, value, note) => ({ kind: "calc", label, value, note: note || "computed" });
  const constRow = (label, value, cite) => ({ kind: "const", label, value, note: cite });
  const money = v => usd$(v);
  const T = {
    totalIncome: () => ({
      title: "Total income",
      amount: r.grossIncome,
      formula: "Sum of every income source entered on the scenario.",
      rows: incomeAnalysis(r).bySource.map(x => inRow(x.label, money(x.amount), x.note))
    }),
    agi: () => ({
      title: "Adjusted gross income",
      amount: r.agi,
      formula: "Total income − above-the-line adjustments (Schedule 1, Part II).",
      rows: [
        calcRow("Total income", money(r.grossIncome)),
        r.seDeduction > 0 && calcRow("Deductible half of SE tax", "− " + money(r.seDeduction), "IRC §164(f)"),
        r.retirementDeduction > 0 && calcRow("Self-employed retirement plan", "− " + money(r.retirementDeduction), "IRC §404"),
        r.sehiDeduction > 0 && calcRow("Self-employed health insurance", "− " + money(r.sehiDeduction), "IRC §162(l)"),
        r.hsa > 0 && inRow("Health savings account", "− " + money(r.hsa), "IRC §223"),
        r.iraDeduction > 0 && calcRow("IRA deduction", "− " + money(r.iraDeduction), "IRC §219"),
        r.s1AdjOther > 0 && inRow("Other adjustments", "− " + money(r.s1AdjOther))
      ].filter(Boolean)
    }),
    deduction: () => ({
      title: r.deductionKind + " deduction",
      amount: r.deductionUsed,
      formula: "The larger of the standard deduction and itemized deductions is used.",
      rows: [
        constRow("Standard deduction (" + STATUSES.find(x => x.v === status).l + ")", money(C.stdDeduction[status]), "IRC §63 as amended by OBBBA · rules " + RULES_VERSION),
        r.addlStd > 0 && constRow("Age 65+/blind addition", money(r.addlStd), "IRC §63(f)"),
        calcRow("Deduction used", money(r.deductionUsed), r.deductionKind.toLowerCase())
      ].filter(Boolean)
    }),
    qbi: () => ({
      title: "Qualified business income deduction",
      amount: r.qbi.deduction,
      formula: "MIN(§199A component after wage/UBIA limits and SSTB phase-in, 20% × (taxable income before QBI − net capital gain)).",
      rows: [
        calcRow("§199A component (after limits)", money(r.qbi.component)),
        calcRow("Taxable income before QBI", money(r.tiBeforeQBI)),
        constRow("Threshold amount", money(C.qbiThreshold[status]), "IRC §199A(e)(2)"),
        calcRow("Deduction allowed", money(r.qbi.deduction), r.qbi.manual ? "MANUAL OVERRIDE entered by the user" : "engine")
      ]
    }),
    taxableIncome: () => ({
      title: "Taxable income",
      amount: r.taxableIncome,
      formula: "AGI − deduction − Schedule 1-A additional deductions − QBI deduction.",
      rows: [
        calcRow("Adjusted gross income", money(r.agi)),
        calcRow(r.deductionKind + " deduction", "− " + money(r.deductionUsed)),
        r.sched1ATotal > 0 && calcRow("Schedule 1-A additional deductions", "− " + money(r.sched1ATotal), "OBBBA temporary provisions"),
        calcRow("QBI deduction", "− " + money(r.qbi.deduction), "IRC §199A")
      ].filter(Boolean)
    }),
    incomeTax: () => ({
      title: "Income tax net of credits",
      amount: clamp0(r.fedIncomeTax - r.creditsApplied),
      formula: "Ordinary brackets on ordinary taxable income, preferential rates on the capital-gain stack, minus nonrefundable credits.",
      rows: [
        calcRow("Ordinary taxable income", money(r.ordinaryTaxable), "taxed per IRC §1 brackets"),
        constRow("Marginal bracket reached", pct(r.marginal, 0), "Rev. Proc. tables · rules " + RULES_VERSION),
        calcRow("Federal income tax", money(r.fedIncomeTax)),
        r.creditsApplied > 0 && calcRow("Nonrefundable credits", "− " + money(r.creditsApplied), "IRC §24 and others")
      ].filter(Boolean)
    }),
    employment: () => ({
      title: "Employment taxes",
      amount: r.seTax + r.sCorpFICA,
      formula: "Schedule SE on 92.35% of net self-employment earnings up to the wage base, plus modeled S-corporation payroll taxes.",
      rows: [
        calcRow("SE tax (Schedule SE)", money(r.seTax), "IRC §1401"),
        constRow("Social Security wage base", money(C.ssWageBase), "SSA contribution and benefit base"),
        r.sCorpFICA > 0 && calcRow("Modeled S-corp payroll taxes", money(r.sCorpFICA), "both halves — economic view")
      ].filter(Boolean)
    }),
    surtaxes: () => ({
      title: "Surtaxes",
      amount: r.addlMedicare + r.niit,
      formula: "Additional Medicare Tax of 0.9% over its threshold, plus 3.8% NIIT on the lesser of net investment income and MAGI over its threshold.",
      rows: [
        calcRow("Additional Medicare Tax", money(r.addlMedicare), "IRC §3101(b)(2)"),
        constRow("Add'l Medicare threshold", money(C.addlMedThreshold[status]), "never indexed"),
        calcRow("Net investment income tax", money(r.niit), "IRC §1411"),
        constRow("NIIT threshold", money(C.niitThreshold[status]), "never indexed")
      ]
    }),
    totalTax: () => ({
      title: "Total modeled federal tax",
      amount: r.totalTax,
      formula: "Income tax net of credits + employment taxes + Additional Medicare Tax + NIIT.",
      rows: [
        calcRow("Income tax net of credits", money(clamp0(r.fedIncomeTax - r.creditsApplied))),
        calcRow("Employment taxes", money(r.seTax + r.sCorpFICA)),
        calcRow("Surtaxes (Add'l Medicare, NIIT)", money(r.addlMedicare + r.niit))
      ]
    })
  };
  const build = T[lineId];
  return build ? build() : null;
}

function TraceDrawer({ lineId, scenario, result, status, year, lastCalc, onClose, onAskAI }) {
  const trace = wbBuildTrace(lineId, scenario, result, status, year);
  const [msg, setMsg] = useState("");
  if (!trace) return null;
  const kindLabel = { input: "User input", calc: "Engine calculation", const: "Statutory parameter" };
  const traceText = () =>
    trace.title + " = " + usd$(trace.amount) + "\n" + trace.formula + "\n" +
    trace.rows.map(rw => "  " + rw.label + ": " + rw.value + "  [" + kindLabel[rw.kind] + (rw.note ? " — " + rw.note : "") + "]").join("\n") +
    "\nScenario: " + scenario.name + " · " + TY[year].label + " · engine " + ENGINE_VERSION + " · rules " + RULES_VERSION +
    (lastCalc ? " · calculated " + lastCalc.atLabel : "");
  return EL(Drawer, {
    title: "Where did this come from?",
    sub: trace.title + " — " + scenario.name,
    width: 470,
    onClose,
    foot: EL("div", { className: "tp-inline" },
      EL("button", {
        className: "tp-mini",
        type: "button",
        onClick: () => wbCopyText(traceText()).then(ok => {
          setMsg(ok ? "Trace copied" : "Copy blocked");
          setTimeout(() => setMsg(""), 1500);
        })
      }, "Copy trace"),
      onAskAI && EL("button", {
        className: "tp-mini",
        type: "button",
        onClick: () => {
          onClose();
          onAskAI({
            scenarioId: scenario.id,
            question: "Explain this calculation trace in plain language. Do not recompute or replace any figure — the deterministic engine's amounts below are authoritative.\n\n" + traceText(),
            autoRun: true
          });
        }
      }, "Ask AI to explain"),
      msg && EL("em", { className: "tp-copyxl-msg" }, msg))
  },
    EL("div", { className: "tp-trace-amt" }, EL("span", null, trace.title), EL("strong", null, usd$(trace.amount))),
    EL("p", { className: "tp-trace-formula" }, trace.formula),
    EL("div", { className: "tp-trace-rows" },
      trace.rows.map((rw, i) => EL("div", { key: i, className: "tp-trace-row " + rw.kind },
        EL("span", { className: "tp-trace-kind" }, kindLabel[rw.kind]),
        EL("span", { className: "tp-trace-lbl" }, rw.label, rw.note && EL("em", null, rw.note)),
        EL("strong", { className: "tp-trace-val" }, rw.value)))),
    EL("div", { className: "tp-trace-prov" },
      EL("div", null, "Scenario: ", EL("strong", null, scenario.name)),
      EL("div", null, "Basis: ", EL("strong", null, TY[year].label, " · ", STATUSES.find(x => x.v === status).l)),
      EL("div", null, "Engine ", ENGINE_VERSION, " · rules ", RULES_VERSION),
      lastCalc && EL("div", null, "Calculated ", lastCalc.atLabel),
      EL("div", { className: "tp-hint" }, "Every amount above is read from the deterministic engine's result for this scenario. AI can explain the trace but never supplies or alters an amount.")));
}
