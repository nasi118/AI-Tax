/* ==== 08-pages ==== */
/* ============================================================================
   DASHBOARD — decision-oriented: toolbar, KPI row, switchable scenario chart,
   collapsible Form 1040 walk, analysis sections. Detailed schedules collapse
   by default; the marginal-rate sweep only computes when its section opens.
   ========================================================================== */
const CHART_METRICS = [{
  v: "tax",
  l: "Total modeled tax"
}, {
  v: "aftertax",
  l: "After-tax income"
}, {
  v: "spendable",
  l: "Spendable cash"
}, {
  v: "rate",
  l: "Effective rate"
}];
function RateCurveCard({ focus, status, year, A }) {
  // Sweep the marginal rate across a band of additional ordinary income.
  // Lives in its own component so the 50 engine runs only happen when the
  // section is actually open.
  const curve = useMemo(() => {
    const pts = [];
    const start = Math.max(0, A.grossIncome - 20000);
    for (let i = 0; i <= 24; i++) {
      const x = start + i * 12000;
      const bump = structuredClone(focus.s);
      bump.w2Wages = num(bump.w2Wages) + (x - A.grossIncome);
      const a = computeScenario(bump, status, year);
      const bump2 = structuredClone(bump);
      bump2.w2Wages = num(bump2.w2Wages) + 2000;
      const b = computeScenario(bump2, status, year);
      pts.push({
        x,
        y: (b.totalTax - a.totalTax) / 2000
      });
    }
    return pts;
  }, [focus.s, status, year, A.grossIncome]);
  return EL(React.Fragment, null, EL(RateCurve, {
    points: curve,
    markerX: A.grossIncome
  }), EL(Note, null, "The nominal bracket understates reality wherever a phase-out is active. Spikes in this curve are where credits, the QBI cap, or a deduction phase-out stack on top of the statutory rate. Flat regions are where planning is cheapest."));
}
function Dashboard({
  client,
  alignments,
  results,
  bestId,
  baseline,
  status,
  year,
  focusId,
  setFocusId,
  goto,
  setYear,
  setStatus,
  onAskAI,
  onAIReport,
  onTrace
}) {
  const focus = results.find(x => x.s.id === focusId) || results[0];
  const A = focus.r;
  const {
    findings
  } = useMemo(() => analyzeScenario(focus.s, status, year), [focus.s, status, year]);
  const breakdown = taxTypeBreakdown(A);
  const inc = incomeAnalysis(A);
  const br = bracketFill(A.ordinaryTaxable, status, A.C);
  const quantified = findings.filter(f => f.savings > 0);
  const flagged = findings.filter(f => !f.savings);
  const totalOpportunity = quantified.reduce((a, f) => a + f.savings, 0);
  const [metric, setMetric] = useUIPref("dash:metric", "tax");
  const [walkDetail, setWalkDetail] = useUIPref("dash:walkDetail", false);
  const chartData = results.map(({ s, r }) => metric === "tax" ? {
    name: s.name,
    inc: Math.round(clamp0(r.fedIncomeTax - r.creditsApplied)),
    emp: Math.round(r.seTax + r.sCorpFICA + r.addlMedicare),
    niit: Math.round(r.niit)
  } : {
    name: s.name,
    v: metric === "aftertax" ? Math.round(r.afterTaxCash) : metric === "spendable" ? Math.round(r.spendableAfterTaxCash) : r.effectiveRate
  });
  const chartSeries = metric === "tax" ? [{
    key: "inc",
    label: "Income tax",
    color: "#1e40af"
  }, {
    key: "emp",
    label: "Employment tax",
    color: "#60a5fa"
  }, {
    key: "niit",
    label: "NIIT",
    color: "#f59e0b"
  }] : [{
    key: "v",
    label: CHART_METRICS.find(m => m.v === metric).l,
    color: metric === "rate" ? "#475569" : "#047857"
  }];
  const warnKPI = A.qbi.manual || (focus.v && focus.v.warnings.length > 0);
  const kpis = [{
    label: "Economic income",
    value: usd$(A.economicIncome),
    sub: A.C.label + " · " + STATUSES.find(x => x.v === status).l
  }, {
    label: "Adjusted gross income",
    value: usd$(A.agi),
    sub: "total income " + usd$(A.grossIncome),
    trace: "agi"
  }, {
    label: "Taxable income",
    value: usd$(A.taxableIncome),
    sub: A.deductionKind.toLowerCase() + " deduction " + usd$(A.deductionUsed),
    trace: "taxableIncome"
  }, {
    label: "Total modeled federal tax",
    value: usd$(A.totalTax),
    sub: pct(A.effectiveRate) + " effective · " + pct(A.marginal) + " bracket",
    warn: warnKPI,
    trace: "totalTax"
  }, {
    label: "After-tax economic income",
    value: usd$(A.afterTaxCash),
    sub: "spendable " + usd$(A.spendableAfterTaxCash),
    cls: "good"
  }, {
    label: "Quantified opportunity",
    value: usd$(totalOpportunity),
    sub: quantified.length + " sized · " + flagged.length + " to review",
    cls: totalOpportunity > 0 ? "warn" : "good"
  }];
  const walkKey = [
    ["Total income", A.grossIncome, "", "totalIncome"],
    ["Adjusted gross income", A.agi, "", "agi"],
    [A.deductionKind + " deduction", -A.deductionUsed, "", "deduction"],
    ["QBI deduction", -A.qbi.deduction, "", "qbi"],
    ["Taxable income", A.taxableIncome, "tot", "taxableIncome"],
    ["Income tax net of credits", clamp0(A.fedIncomeTax - A.creditsApplied), "", "incomeTax"],
    ["Employment taxes", A.seTax + A.sCorpFICA, "", "employment"],
    ["Surtaxes (Add'l Medicare, NIIT)", A.addlMedicare + A.niit, "", "surtaxes"],
    ["Total modeled federal tax", A.totalTax, "grand", "totalTax"],
    ["Economic income", A.economicIncome],
    ["After-tax economic income", A.afterTaxCash, "tot"],
    ["Spendable after-tax cash", A.spendableAfterTaxCash, "tot"]
  ];
  const walkRef = useRef(null);
  return layoutContainer("dashboard", "tp-stack tp-layout-grid", EL("div", {
    className: "tp-selector"
  }, EL("label", {
    className: "tp-sel"
  }, EL("span", null, "Scenario under analysis"), EL("select", {
    value: focus.s.id,
    onChange: e => setFocusId(e.target.value)
  }, results.map(({ s }) => EL("option", {
    key: s.id,
    value: s.id
  }, s.name, s.id === bestId ? "  ★ lowest modeled tax" : "")))), setYear && EL("label", {
    className: "tp-sel"
  }, EL("span", null, "Tax year"), EL(Seg, {
    small: true,
    value: year,
    onChange: setYear,
    options: [{ v: 2025, l: "2025" }, { v: 2026, l: "2026" }]
  })), setStatus && EL("label", {
    className: "tp-sel"
  }, EL("span", null, "Filing status"), EL("select", {
    value: status,
    onChange: e => setStatus(e.target.value)
  }, STATUSES.map(s => EL("option", { key: s.v, value: s.v }, s.l)))), EL("button", {
    className: "tp-btn ghost",
    onClick: () => goto("scenarios")
  }, "Edit inputs ", I.chevR), onAskAI && EL("button", {
    className: "tp-btn ghost",
    onClick: () => onAskAI({
      scenarioId: focus.s.id,
      question: "Analyze the scenario \"" + focus.s.name + "\" — explain what drives the result, check for inconsistencies, and identify planning opportunities and missing facts.",
      autoRun: true
    })
  }, I.chat, " Analyze with AI"), onAIReport && EL("button", {
    className: "tp-btn ghost",
    onClick: onAIReport
  }, I.file, " Build report"), EL("div", {
    style: { marginLeft: "auto" }
  }, EL(SectionControls, {
    page: "dashboard"
  }))), EL("div", {
    className: "tp-kpis",
    "data-layout": "kpis"
  }, kpis.map(k => EL("div", {
    key: k.label,
    className: "tp-kpi " + (k.cls || "")
  }, EL("span", null, k.label, k.warn && EL("span", {
    title: "Includes a manual override or items flagged for review",
    style: { marginLeft: 5, color: "var(--amber)" }
  }, I.alert), onTrace && k.trace && EL("button", {
    type: "button",
    className: "tp-tracebtn",
    title: "Where did this come from?",
    "aria-label": "Trace " + k.label,
    onClick: () => onTrace(k.trace, focus.s.id)
  }, "?")), EL("strong", null, k.value), EL("em", null, k.sub)))), EL(Section, {
    page: "dashboard",
    id: "chart",
    title: "Scenario comparison",
    summary: results.length + " scenarios",
    fullable: true,
    right: EL("div", {
      className: "tp-chart-tools"
    }, EL(Seg, {
      small: true,
      value: metric,
      onChange: setMetric,
      options: CHART_METRICS
    }), metric === "tax" && EL("div", {
      className: "tp-legend"
    }, chartSeries.map(s => EL("i", {
      key: s.key
    }, EL("span", {
      className: "sw",
      style: { background: s.color }
    }), " ", s.label))))
  }, EL(StackedBars, {
    data: chartData,
    height: 300,
    format: metric === "rate" ? v => pct(v) : usd$,
    axisFormat: metric === "rate" ? v => pct(v, 0) : undefined,
    series: chartSeries
  }), metric !== "tax" && EL(Note, null, "Each metric is drawn on its own scale. Tax and after-tax income are never mixed on one axis — a lower bar here means ", metric === "rate" ? "a lower effective economic rate" : "less cash", ", not necessarily a better outcome; check the economics rows on the Scenarios ledger.")), EL(Section, {
    page: "dashboard",
    id: "walk",
    title: "Form 1040 walk",
    summary: focus.s.name,
    right: EL(React.Fragment, null, typeof CopyForExcel !== "undefined" && EL(CopyForExcel, {
      forRef: walkRef
    }), EL("button", {
      className: "tp-mini",
      type: "button",
      onClick: () => setWalkDetail(!walkDetail),
      "aria-expanded": walkDetail
    }, walkDetail ? "Key totals only" : "Show detailed lines")),
    flush: true,
    fullable: true
  }, !walkDetail ? EL("div", {
    className: "tp-tblwrap",
    ref: walkRef
  }, EL("table", {
    className: "tp-tbl"
  }, EL("tbody", null, walkKey.map(row => EL("tr", {
    key: row[0],
    className: row[2] || ""
  }, EL("td", null, row[0], onTrace && row[3] && EL("button", {
    type: "button",
    className: "tp-tracebtn",
    title: "Where did this come from? Inputs, intermediate values and the formula behind this figure",
    "aria-label": "Trace " + row[0],
    onClick: () => onTrace(row[3], focus.s.id)
  }, "?")), EL("td", {
    className: "num" + (row[2] ? " strong" : "")
  }, row[1] < 0 ? "(" + usd(Math.abs(row[1])) + ")" : usd$(row[1])))))))
    : EL("div", {
    className: "tp-tblwrap",
    ref: walkRef
  }, EL("table", {
    className: "tp-tbl"
  }, EL("tbody", null, EL("tr", {
    className: "sec"
  }, EL("td", { colSpan: 2 }, "Income")), inc.bySource.map(x => EL("tr", {
    key: x.label
  }, EL("td", {
    className: "ind"
  }, x.label, EL("em", {
    className: "tp-rownote"
  }, x.note)), EL("td", {
    className: "num"
  }, usd$(x.amount)))), EL("tr", {
    className: "tot"
  }, EL("td", null, "Total income"), EL("td", {
    className: "num"
  }, usd$(A.grossIncome))), EL("tr", {
    className: "sec"
  }, EL("td", { colSpan: 2 }, "Adjustments to income — Schedule 1 Part II")), A.seDeduction > 0 && EL("tr", null, EL("td", {
    className: "ind"
  }, "Deductible half of self-employment tax"), EL("td", {
    className: "num"
  }, usd$(A.seDeduction))), A.retirementDeduction > 0 && EL("tr", null, EL("td", {
    className: "ind"
  }, "Self-employed retirement plan", A.selectedPlan ? " — " + A.selectedPlan.name : ""), EL("td", {
    className: "num"
  }, usd$(A.retirementDeduction))), A.sehiDeduction > 0 && EL("tr", null, EL("td", {
    className: "ind"
  }, "Self-employed health insurance"), EL("td", {
    className: "num"
  }, usd$(A.sehiDeduction))), A.hsa > 0 && EL("tr", null, EL("td", {
    className: "ind"
  }, "Health savings account"), EL("td", {
    className: "num"
  }, usd$(A.hsa))), A.iraDeduction > 0 && EL("tr", null, EL("td", {
    className: "ind"
  }, "IRA deduction"), EL("td", {
    className: "num"
  }, usd$(A.iraDeduction))), A.s1AdjOther > 0 && EL("tr", null, EL("td", {
    className: "ind"
  }, "Other adjustments"), EL("td", {
    className: "num"
  }, usd$(A.s1AdjOther))), EL("tr", {
    className: "tot"
  }, EL("td", null, "Adjusted gross income"), EL("td", {
    className: "num"
  }, usd$(A.agi))), EL("tr", {
    className: "sec"
  }, EL("td", { colSpan: 2 }, "Deductions")), EL("tr", null, EL("td", {
    className: "ind"
  }, A.deductionKind, " deduction", A.addlStd > 0 ? " incl. " + usd$(A.addlStd) + " age/blindness addition" : ""), EL("td", {
    className: "num"
  }, usd$(A.deductionUsed))), A.sched1ATotal > 0 && EL(React.Fragment, null, EL("tr", null, EL("td", {
    className: "ind"
  }, "Schedule 1-A additional deductions", EL("em", {
    className: "tp-rownote"
  }, "below the line — reduces taxable income but not AGI")), EL("td", {
    className: "num"
  }, usd$(A.sched1ATotal))), A.S1A.detail.map(d => EL("tr", {
    key: d.label,
    className: "muted"
  }, EL("td", {
    className: "ind2"
  }, d.label, d.reduction > 0 ? " (after " + usd$(d.reduction) + " phase-out)" : ""), EL("td", {
    className: "num"
  }, usd$(d.allowed))))), EL("tr", null, EL("td", {
    className: "ind"
  }, "Qualified business income deduction"), EL("td", {
    className: "num"
  }, usd$(A.qbi.deduction))), EL("tr", {
    className: "tot"
  }, EL("td", null, "Taxable income"), EL("td", {
    className: "num"
  }, usd$(A.taxableIncome))), EL("tr", {
    className: "sec"
  }, EL("td", { colSpan: 2 }, "Tax")), EL("tr", null, EL("td", {
    className: "ind"
  }, "Tax on ordinary income"), EL("td", {
    className: "num"
  }, usd$(A.ordTax))), A.cgTax > 0 && EL("tr", null, EL("td", {
    className: "ind"
  }, "Tax on preferential income", A.ltcgMarginal ? " — " + pct(A.ltcgMarginal, 0) + " marginal" : ""), EL("td", {
    className: "num"
  }, usd$(A.cgTax))), A.creditsApplied > 0 && EL("tr", null, EL("td", {
    className: "ind"
  }, "Less nonrefundable credits", A.ctc > 0 ? " (child tax credit " + usd$(A.ctc) + ")" : ""), EL("td", {
    className: "num"
  }, "(", usd(A.creditsApplied), ")")), A.seTax > 0 && EL("tr", null, EL("td", {
    className: "ind"
  }, "Self-employment tax"), EL("td", {
    className: "num"
  }, usd$(A.seTax))), A.sCorpFICA > 0 && EL(React.Fragment, null, EL("tr", null, EL("td", {
    className: "ind"
  }, "S corporation payroll — employee half", EL("em", {
    className: "tp-rownote"
  }, "withheld from the owner's wages")), EL("td", {
    className: "num"
  }, usd$(A.employeeFICA))), EL("tr", null, EL("td", {
    className: "ind"
  }, "S corporation payroll — employer half", EL("em", {
    className: "tp-rownote"
  }, "the corporation's expense; already deducted in arriving at the K-1 above")), EL("td", {
    className: "num"
  }, usd$(A.employerFICA)))), A.addlMedicare > 0 && EL("tr", null, EL("td", {
    className: "ind"
  }, "Additional Medicare Tax"), EL("td", {
    className: "num"
  }, usd$(A.addlMedicare))), A.niit > 0 && EL("tr", null, EL("td", {
    className: "ind"
  }, "Net investment income tax"), EL("td", {
    className: "num"
  }, usd$(A.niit))), EL("tr", {
    className: "grand"
  }, EL("td", null, "Total federal economic tax"), EL("td", {
    className: "num"
  }, usd$(A.totalTax))), A.employerFICA > 0 && EL("tr", null, EL("td", null, "Economic income", EL("em", {
    className: "tp-rownote"
  }, "Form 1040 income plus employer payroll tax, restoring the pre-tax business economics")), EL("td", {
    className: "num"
  }, usd$(A.economicIncome))), EL("tr", {
    className: "tot"
  }, EL("td", null, "After-tax cash"), EL("td", {
    className: "num"
  }, usd$(A.afterTaxCash))), A.payments > 0 && EL(React.Fragment, null, EL("tr", null, EL("td", null, "Less withholding and estimates"), EL("td", {
    className: "num"
  }, "(", usd(A.payments), ")")), EL("tr", {
    className: "tot"
  }, EL("td", null, A.balanceDue >= 0 ? "Balance due" : "Overpayment", EL("em", {
    className: "tp-rownote"
  }, "Form 1040 only; excludes the S corporation's share of payroll tax")), EL("td", {
    className: "num"
  }, usd$(Math.abs(A.balanceDue))))))))), EL("div", {
    className: "tp-2col",
    "data-layout": "analysis"
  }, EL(Section, {
    page: "dashboard",
    id: "bytype",
    title: "Analysis by type of tax",
    flush: true
  }, EL("table", {
    className: "tp-tbl"
  }, EL("thead", null, EL("tr", null, EL("th", null, "Tax"), EL("th", {
    className: "num"
  }, "Amount"), EL("th", {
    className: "num"
  }, "Share"))), EL("tbody", null, breakdown.map(b => EL("tr", {
    key: b.key,
    className: b.amount === 0 ? "muted" : ""
  }, EL("td", null, b.label, EL("em", {
    className: "tp-rownote"
  }, b.note)), EL("td", {
    className: "num strong"
  }, usd$(b.amount)), EL("td", {
    className: "num"
  }, pct(b.share))))))), EL(Section, {
    page: "dashboard",
    id: "bracket",
    title: "Bracket fill",
    flush: true
  }, EL("table", {
    className: "tp-tbl"
  }, EL("thead", null, EL("tr", null, EL("th", null, "Rate"), EL("th", {
    className: "num"
  }, "Bracket"), EL("th", {
    className: "num"
  }, "Income"), EL("th", {
    className: "num"
  }, "Tax"))), EL("tbody", null, br.rows.map(row => {
    const isMarginal = row.rate === br.marginalRate && row.income > 0;
    return EL("tr", {
      key: row.rate,
      className: row.income === 0 ? "muted" : isMarginal ? "best" : ""
    }, EL("td", null, pct(row.rate, 0), isMarginal && " ← current"), EL("td", {
      className: "num sm"
    }, usd$(row.floor), row.ceil === Infinity ? "+" : " – " + usd$(row.ceil)), EL("td", {
      className: "num strong"
    }, usd$(row.income)), EL("td", {
      className: "num"
    }, usd$(row.tax)));
  }), A.prefIncome > 0 && EL("tr", null, EL("td", null, pct(A.ltcgMarginal, 0)), EL("td", {
    className: "num sm"
  }, "preferential"), EL("td", {
    className: "num strong"
  }, usd$(A.prefIncome)), EL("td", {
    className: "num"
  }, usd$(A.cgTax))))), br.headroom !== Infinity && EL("div", {
    style: { padding: "0 15px 13px" }
  }, EL(Note, null, EL("strong", null, usd$(br.headroom)), " of room remains in the ", pct(br.marginalRate, 0), " bracket. That is the working space for Roth conversions or gain realization — but check the MAGI module first, since IRMAA and ACA thresholds usually bind before the bracket does.")))), EL(Section, {
    page: "dashboard",
    id: "curve",
    title: "Effective marginal rate on the next dollar",
    summary: "measured by re-running the full engine, not the nominal bracket",
    defaultOpen: false
  }, EL(RateCurveCard, {
    focus: focus,
    status: status,
    year: year,
    A: A
  })), EL(Section, {
    page: "dashboard",
    id: "opps",
    title: "Opportunities identified",
    count: findings.length,
    warnCount: flagged.length
  }, !findings.length ? EL("div", {
    className: "tp-clean"
  }, I.check, " No further material opportunities detected on these inputs.") : EL("div", {
    className: "tp-findings"
  }, findings.map((f, i) => EL("div", {
    key: f.id,
    className: "tp-finding " + (f.savings > 0 ? "quant" : "flag")
  }, EL("div", {
    className: "tp-finding-rank"
  }, f.savings > 0 ? i + 1 : I.alert), EL("div", {
    className: "tp-finding-body"
  }, EL("div", {
    className: "tp-finding-top"
  }, EL("span", {
    className: "tp-finding-title"
  }, f.title), EL("span", {
    className: "tp-finding-tags"
  }, EL("span", {
    className: "tp-tag"
  }, f.cat), EL("span", {
    className: "tp-pill " + RISK[f.risk].c
  }, RISK[f.risk].label), f.savings > 0 ? EL("span", {
    className: "tp-save"
  }, usd$(f.savings), "/yr") : EL("span", {
    className: "tp-save neutral"
  }, "review"))), EL("div", {
    className: "tp-finding-why"
  }, f.why), EL("div", {
    className: "tp-finding-act"
  }, I.bulb, " ", f.action), EL("div", {
    className: "tp-finding-ref"
  }, f.ref))))), EL(Note, null, "Savings are computed by cloning the scenario, applying exactly one change, and re-running the whole engine. They exclude state tax, implementation cost, and non-tax considerations, and they do not add cleanly — each deduction lowers taxable income and therefore the QBI cap, so implementing several together delivers less than the sum.")));
}

/* ============================================================================
   SCENARIOS — the input ledger
   ========================================================================== */
function ScenariosPage({
  client,
  alignments,
  scenarios,
  results,
  bestId,
  baseline,
  status,
  year,
  update,
  addScenario,
  duplicate,
  remove,
  reset,
  onAIOptimize,
  onAIReport,
  onAskAI,
  activeId,
  onAddPlanningScenario,
  onModelStrategy
}) {
  /* Ledger group collapse state persists per user; density is a preference. */
  const [open, setOpen] = useUIPref("ledger:groups", {
    income: true,
    sched: true,
    ded: false,
    other: false,
    econ: true
  });
  const toggle = k => setOpen({ ...open, [k]: !open[k] });
  const setAllGroups = v => setOpen({ income: v, sched: v, ded: v, other: v, econ: v });
  const [density, setDensity] = useUIPref("ledger:density", "standard");
  const ledgerRef = useRef(null);
  const [copyMsg, setCopyMsg] = useState("");
  /* Column sizing within bounded limits, persisted like every UI preference */
  const [labWidth, setLabWidth] = useUIPref("ledger:labw", 235);
  const [colWidth, setColWidth] = useUIPref("ledger:colw", 185);
  const labW = Math.min(320, Math.max(200, num(labWidth) || 235));
  const colW = Math.min(260, Math.max(145, num(colWidth) || 185));
  const [drill, setDrill] = useState(null);
  const [aiPanel, setAiPanel] = useState(null); // scenario id with the AI panel expanded
  const n = scenarios.length;
  const baseId = scenarios[0].id;
  /* "Add Compare" narrows the ledger (the Planner) to a chosen subset of
     scenarios without touching the underlying scenario list — null means no
     filter is active and every scenario shows, which is the original,
     unfiltered behavior and stays the default until the user opts in. */
  const [compareIds, setCompareIds] = useUIPref("compareIds:" + client.id, null);
  const [comparePicker, setComparePicker] = useState(false);
  const [strategyLibrary, setStrategyLibrary] = useState(false);
  const ledgerScenarios = compareIds ? scenarios.filter(s => compareIds.includes(s.id)) : scenarios;
  const ledgerResults = compareIds ? results.filter(x => compareIds.includes(x.s.id)) : results;
  const ledgerN = ledgerScenarios.length;
  const removeFromCompare = id => {
    if (!compareIds || id === baseId) return;
    setCompareIds(compareIds.filter(x => x !== id));
  };
  const cols = {
    gridTemplateColumns: `minmax(${Math.min(210, labW)}px,${labW}px) repeat(${ledgerN}, minmax(${Math.max(130, colW - 35)}px,${colW}px))`
  };
  const richestId = results.length > 1 ? results.reduce((a, b) => b.r.spendableAfterTaxCash > a.r.spendableAfterTaxCash ? b : a).s.id : null;
  const bestAlignedId = alignments && results.length > 1 && alignments.some(a => a && a.pct != null) ? results[alignments.reduce((bi, a, i) => a && a.pct != null && (alignments[bi] == null || alignments[bi].pct == null || a.pct > alignments[bi].pct) ? i : bi, 0)].s.id : null;
  const bestAfterTaxId = results.length > 1 ? results.reduce((a, b) => b.r.afterTaxCash > a.r.afterTaxCash ? b : a).s.id : null;

  /* The ledger rows are module-level components (defined below). They must not
     be wrapped or redefined here: a component created inside this function is a
     new type on every render, which remounts every input and drops focus after
     a single keystroke. */

  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, onAIOptimize && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tp-ai-bar-label"
  }, I.chat, " AI advisory"), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid sm",
    type: "button",
    onClick: onAIOptimize
  }, "AI Optimize"), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => onAskAI({
      scope: "all",
      question: "Compare all scenarios. Explain what drives the differences in total modeled federal tax, after-tax economic income and spendable cash, whether the scenarios are economically comparable, and which differences are permanent versus timing.",
      autoRun: true
    })
  }, "AI Compare Scenarios"), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: onAIReport
  }, "AI Build Report"), onAddPlanningScenario && EL(PlanningScenariosMenu, {
    onAddScenario: () => {
      const id = onAddPlanningScenario(activeId);
      setCompareIds(ids => ids ? Array.from(new Set([...ids, id])) : ids);
      setDrill({ id, type: "overview" });
    },
    onDuplicateActive: () => duplicate(activeId),
    onOpenComparePicker: () => setComparePicker(true),
    onOpenStrategyLibrary: () => setStrategyLibrary(true)
  }), /*#__PURE__*/React.createElement("em", null, "Proposals require approval; the engine computes every result.")), /*#__PURE__*/React.createElement("div", {
    className: "tp-verdict"
  }, results.map(({
    s,
    r,
    v
  }, i) => {
    const isBest = s.id === bestId;
    const al = alignments ? alignments[i] : null;
    const comparable = !baseline || Math.abs(r.economicIncome - baseline.r.economicIncome) <= 1;
    const delta = baseline ? r.totalTax - baseline.r.totalTax : 0;
    return EL("div", {
      key: s.id,
      className: "tp-vcard " + (isBest ? "best" : "")
    }, isBest && EL("div", {
      className: "tp-badge"
    }, I.award, " Lowest modeled tax"), !isBest && s.id === richestId && EL("div", {
      className: "tp-badge alt"
    }, "Highest spendable cash"), EL("div", {
      className: "tp-vname",
      title: s.name
    }, s.name), EL("div", {
      className: "tp-vtags"
    }, i === 0 && EL("span", {
      className: "tp-tag"
    }, "Base"), s.aiGenerated && EL("span", {
      className: "tp-tag amber"
    }, "AI proposed"), s.id === bestAfterTaxId && EL("span", {
      className: "tp-tag green"
    }, "Highest after-tax income"), s.id === bestAlignedId && EL("span", {
      className: "tp-tag green"
    }, "Best aligned with goals")), EL("div", {
      className: "tp-vtotal"
    }, usd$(r.totalTax)), EL("div", {
      className: "tp-vsub"
    }, pct(r.effectiveRate), " effective economic rate"), EL("div", {
      className: "tp-vrows"
    }, EL("div", {
      className: "tp-vrow"
    }, EL("span", null, "After-tax economic income"), EL("strong", null, usd$(r.afterTaxCash))), EL("div", {
      className: "tp-vrow"
    }, EL("span", null, "Spendable after-tax cash"), EL("strong", null, usd$(r.spendableAfterTaxCash)))), al && al.pct != null && EL(GoalAlignmentBlock, {
      al: al
    }), EL("div", {
      className: "tp-vdelta " + (delta < 0 ? "save" : delta > 0 ? "cost" : "base")
    }, i === 0 ? "baseline" : delta === 0 ? "same as baseline" : (delta < 0 ? "saves " : "costs ") + usd$(Math.abs(delta)) + " vs. " + baseline.s.name), i > 0 && !comparable && EL("div", {
      className: "tp-vcompat"
    }, "Not directly comparable \u2014 economic inputs differ."), v && v.blocking && EL("div", {
      className: "tp-vcompat err"
    }, "Blocking validation error \u2014 resolve before relying on this scenario."), v && !v.blocking && v.warnings.length > 0 && EL("div", {
      className: "tp-vcompat"
    }, "Needs review"), EL("div", {
      className: "tp-vactions"
    }, onAskAI && EL("button", {
      className: "tp-mini ai",
      type: "button",
      "aria-expanded": aiPanel === s.id,
      onClick: () => setAiPanel(aiPanel === s.id ? null : s.id)
    }, I.chat, " Analyze with AI"), onAskAI && EL(AICardMenu, {
      scenario: s,
      status: status,
      year: year,
      onAskAI: onAskAI,
      onAIOptimize: onAIOptimize
    })));
  })), aiPanel && (() => {
    const entry = results.find(x => x.s.id === aiPanel);
    return entry ? EL(ScenarioAIPanel, {
      key: entry.s.id,
      entry: entry,
      client: client,
      baseline: baseline,
      status: status,
      year: year,
      onClose: () => setAiPanel(null),
      onOpenWorkspace: q => onAskAI({
        scenarioId: entry.s.id,
        question: q || "",
        autoRun: !!q
      })
    }) : null;
  })(), /*#__PURE__*/React.createElement("div", {
    className: "tp-ledger-wrap density-" + density
  }, EL("div", {
    className: "tp-ledger-toolbar"
  }, EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => setAllGroups(true)
  }, "Expand all groups"), EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => setAllGroups(false)
  }, "Collapse all groups"), EL(Seg, {
    small: true,
    value: density,
    onChange: setDensity,
    options: [{
      v: "comfortable",
      l: "Comfortable"
    }, {
      v: "standard",
      l: "Standard"
    }, {
      v: "compact",
      l: "Compact"
    }]
  }), EL("label", {
    className: "tp-colsize",
    title: "Width of the line-item column"
  }, "Labels", EL("input", {
    type: "range",
    min: 200,
    max: 320,
    value: labW,
    onChange: e => setLabWidth(num(e.target.value)),
    "aria-label": "Line-item column width"
  })), EL("label", {
    className: "tp-colsize",
    title: "Width of each scenario column"
  }, "Columns", EL("input", {
    type: "range",
    min: 145,
    max: 260,
    value: colW,
    onChange: e => setColWidth(num(e.target.value)),
    "aria-label": "Scenario column width"
  })), EL("button", {
    className: "tp-mini tp-copyxl",
    type: "button",
    title: "Copy the ledger as tab-separated values that paste into Excel as real numbers",
    onClick: () => {
      const tsv = wbGridToTSV(ledgerRef.current, scenarios.length + 1);
      wbCopyText(tsv).then(ok => {
        setCopyMsg(ok ? "Copied for Excel" : "Copy blocked");
        setTimeout(() => setCopyMsg(""), 1600);
      });
    }
  }, "⧉ Copy for Excel"), copyMsg && EL("em", {
    className: "tp-copyxl-msg"
  }, copyMsg), compareIds && EL("span", {
    className: "tp-comparenote"
  }, "Comparing ", ledgerN, " of ", n, " scenarios", EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => setCompareIds(null)
  }, "Show all")), EL("em", null, "Line-item column and scenario headers stay pinned while you scroll")), /*#__PURE__*/React.createElement("div", {
    className: "tp-ledger",
    style: cols,
    ref: ledgerRef
  },/*#__PURE__*/React.createElement("div", {
    className: "tp-cell tp-corner"
  }, "Line item"), ledgerScenarios.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    className: "tp-cell tp-schead " + (s.id === bestId ? "best" : "")
  }, /*#__PURE__*/React.createElement("input", {
    className: "tp-name",
    value: s.name,
    onChange: e => update(s.id, "name", e.target.value)
  }), /*#__PURE__*/React.createElement("div", {
    className: "tp-schead-a"
  }, compareIds && s.id !== baseId && /*#__PURE__*/React.createElement("button", {
    onClick: () => removeFromCompare(s.id),
    title: "Remove from comparison (keeps the scenario)"
  }, I.x), /*#__PURE__*/React.createElement("button", {
    onClick: () => duplicate(s.id),
    title: "Duplicate"
  }, I.copy), /*#__PURE__*/React.createElement("button", {
    onClick: () => remove(s.id),
    disabled: n === 1 || s.id === baseId,
    title: s.id === baseId ? "The baseline scenario can't be deleted" : "Delete"
  }, I.trash)))), /*#__PURE__*/React.createElement(LedgerGroup, {
    label: "Income",
    k: "income",
    n: ledgerN,
    open: open,
    toggle: toggle
  }), open.income && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "w2Wages",
    label: "W-2 wages",
    scenarios: ledgerScenarios,
    update: update,
    drillType: "wages",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerDrillRow, {
    label: "S corporations",
    hint: "compensation, derived K-1 and §199A",
    get: r => r.scorpComp + r.scorpK1,
    type: "scorp",
    results: ledgerResults,
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerDrillRow, {
    label: "Schedule C — net profit",
    hint: "click to edit businesses",
    get: r => r.schedC,
    type: "schedC",
    results: ledgerResults,
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerDrillRow, {
    label: "Passthrough / K-1",
    hint: "Schedule E entities",
    get: r => r.passthrough,
    type: "passthrough",
    results: ledgerResults,
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "taxableInterest",
    label: "Taxable interest",
    scenarios: ledgerScenarios,
    update: update,
    drillType: "intdiv",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "taxExemptInterest",
    label: "Tax-exempt interest",
    hint: "adds back for ACA and IRMAA MAGI",
    scenarios: ledgerScenarios,
    update: update,
    drillType: "intdiv",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "ordinaryDividends",
    label: "Ordinary dividends",
    scenarios: ledgerScenarios,
    update: update,
    drillType: "intdiv",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "qualifiedDividends",
    label: "— of which qualified",
    indent: true,
    scenarios: ledgerScenarios,
    update: update,
    drillType: "intdiv",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "shortTermGains",
    label: "Short-term capital gains",
    scenarios: ledgerScenarios,
    update: update,
    drillType: "capgains",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "longTermGains",
    label: "Long-term capital gains",
    scenarios: ledgerScenarios,
    update: update,
    drillType: "capgains",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "iraDistributions",
    label: "IRA and pension distributions",
    scenarios: ledgerScenarios,
    update: update,
    drillType: "retirement",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "rothConversion",
    label: "Roth conversion",
    hint: "excluded from Roth MAGI",
    scenarios: ledgerScenarios,
    update: update,
    drillType: "retirement",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "socialSecurityTotal",
    label: "Social Security benefits received",
    scenarios: ledgerScenarios,
    update: update,
    drillType: "retirement",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "socialSecurityTaxable",
    label: "— taxable portion",
    indent: true,
    scenarios: ledgerScenarios,
    update: update,
    drillType: "retirement",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "otherIncome",
    label: "Other income",
    scenarios: ledgerScenarios,
    update: update,
    drillType: "otherincome",
    setDrill: setDrill
  })), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Total income",
    cls: "subtotal",
    get: r => r.grossIncome,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerGroup, {
    label: "Adjustments and deductions",
    k: "sched",
    n: ledgerN,
    open: open,
    toggle: toggle
  }), open.sched && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Deductible half of SE tax",
    get: r => r.seDeduction,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerDrillRow, {
    label: "Self-employed retirement plan",
    hint: "click to set the plan and contribution",
    get: r => r.retirementDeduction,
    type: "retirementPlan",
    results: ledgerResults,
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerDrillRow, {
    label: "Self-employed health insurance",
    hint: "click for premiums and LTC",
    get: r => r.sehiDeduction,
    type: "retirementPlan",
    results: ledgerResults,
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerDrillRow, {
    label: "Health savings account",
    hint: "click to set coverage and contribution",
    get: r => r.hsa,
    type: "retirementPlan",
    results: ledgerResults,
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerDrillRow, {
    label: "IRA deduction",
    hint: "click to set contribution and coverage",
    get: r => r.iraDeduction,
    type: "retirementPlan",
    results: ledgerResults,
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerDrillRow, {
    label: "Other Schedule 1 adjustments",
    hint: "student loan, educator, alimony",
    get: r => r.s1AdjOther,
    type: "schedule1",
    results: ledgerResults,
    setDrill: setDrill
  })), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Adjusted gross income",
    cls: "total",
    get: r => r.agi,
    results: ledgerResults
  }), open.sched && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "tp-cell tp-lab"
  }, "Deduction method"), scenarios.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    className: "tp-cell tp-calc"
  }, /*#__PURE__*/React.createElement("select", {
    className: "tp-mini-sel",
    value: s.deductionMode,
    onChange: e => update(s.id, "deductionMode", e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "auto"
  }, "Auto"), /*#__PURE__*/React.createElement("option", {
    value: "standard"
  }, "Standard"), /*#__PURE__*/React.createElement("option", {
    value: "itemized"
  }, "Itemized"))))), /*#__PURE__*/React.createElement(LedgerDrillRow, {
    label: "Itemized deductions — Schedule A",
    hint: "SALT, interest, charity, medical",
    get: r => r.itemized,
    type: "schedA",
    results: ledgerResults,
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerDrillRow, {
    label: "Schedule 1-A additional deductions",
    hint: "senior, tips, overtime, car loan",
    get: r => r.sched1ATotal,
    type: "sched1A",
    results: ledgerResults,
    setDrill: setDrill
  })), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Deduction applied",
    cls: "subtotal",
    get: r => r.deductionUsed,
    tags: r => r.deductionKind,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerDrillRow, {
    label: "QBI deduction — §199A",
    hint: "click for the entity-level §199A summary",
    get: r => r.qbi.deduction,
    type: "qbiInfo",
    results: ledgerResults,
    setDrill: setDrill,
    cls: "subtotal"
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Taxable income",
    cls: "total",
    get: r => r.taxableIncome,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerGroup, {
    label: "Tax and credits",
    k: "other",
    n: ledgerN,
    open: open,
    toggle: toggle
  }), open.other && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "children",
    label: "Qualifying children under 17",
    scenarios: ledgerScenarios,
    update: update
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "otherCredits",
    label: "Other nonrefundable credits",
    scenarios: ledgerScenarios,
    update: update
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "withholding",
    label: "Federal withholding",
    scenarios: ledgerScenarios,
    update: update,
    drillType: "payments",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "estimatedPayments",
    label: "Estimated payments",
    scenarios: ledgerScenarios,
    update: update,
    drillType: "payments",
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerDrillRow, {
    label: "Estimated tax safe harbor",
    hint: "click to manage quarterly payments",
    get: (r, s) => computeEstimatedTax({
      currentYearTax: r.totalTax, priorYearTax: num(s.priorYearTax) || null, priorYearAGI: s.priorYearAGI,
      status: r.status, C: r.C, withholding: num(s.withholding), paymentsMade: s.estimatedPaymentSchedule || [],
      asOfDate: new Date().toISOString().slice(0, 10)
    }).remainingRequired,
    type: "estimatedTax",
    results: ledgerResults,
    setDrill: setDrill
  }), /*#__PURE__*/React.createElement(LedgerInputRow, {
    field: "householdSize",
    label: "Household size",
    hint: "for ACA percentage of FPL",
    scenarios: ledgerScenarios,
    update: update
  })), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Federal income tax",
    get: r => r.fedIncomeTax,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Less credits",
    get: r => -r.creditsApplied,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Self-employment tax",
    get: r => r.seTax,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "S corporation payroll — employee half",
    get: r => r.employeeFICA,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "S corporation payroll — employer half",
    get: r => r.employerFICA,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Additional Medicare Tax",
    get: r => r.addlMedicare,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Net investment income tax",
    get: r => r.niit,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Total modeled federal tax",
    cls: "grand",
    get: r => r.totalTax,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Effective economic rate",
    cls: "rate",
    get: r => r.effectiveRate,
    isPct: true,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Ordinary marginal bracket",
    cls: "rate",
    get: r => r.marginal,
    isPct: true,
    results: ledgerResults
  }), EL(LedgerGroup, {
    label: "Economic and cash-flow reconciliation",
    k: "econ",
    n: ledgerN,
    open: open,
    toggle: toggle
  }), open.econ && EL(React.Fragment, null, /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Economic income",
    get: r => r.economicIncome,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "After-tax economic income",
    cls: "aftertax",
    get: r => r.afterTaxCash,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Retirement and HSA funding",
    get: r => r.cashOutflows.retirement + r.cashOutflows.hsa,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Charitable cash outflow",
    get: r => r.cashOutflows.charitable,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerCalcRow, {
    label: "Spendable after-tax cash",
    cls: "aftertax",
    get: r => r.spendableAfterTaxCash,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerDeltaRow, {
    label: "Tax change vs base",
    get: r => r.totalTax,
    favorable: "down",
    guard: (r, b) => Math.abs(r.economicIncome - b.economicIncome) <= 1,
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerDeltaRow, {
    label: "Economic-income change vs base",
    get: r => r.economicIncome,
    favorable: "up",
    results: ledgerResults
  }), /*#__PURE__*/React.createElement(LedgerDeltaRow, {
    label: "Spendable-cash change vs base",
    get: r => r.spendableAfterTaxCash,
    favorable: "up",
    results: ledgerResults
  }))), /*#__PURE__*/React.createElement("div", {
    className: "tp-add-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-addbtn",
    onClick: addScenario
  }, I.plus, " Add scenario"), /*#__PURE__*/React.createElement("button", {
    className: "tp-addbtn",
    onClick: reset
  }, I.reset, " Reset to examples"))), drill && /*#__PURE__*/React.createElement(DrillModal, {
    scenario: scenarios.find(s => s.id === drill.id),
    result: results.find(x => x.s.id === drill.id).r,
    type: drill.type,
    status: status,
    year: year,
    onClose: () => setDrill(null),
    update: (k, v) => update(drill.id, k, v),
    onJump: t => setDrill({ id: drill.id, type: t })
  }), comparePicker && EL(ComparePickerModal, {
    scenarios: scenarios,
    results: results,
    baseId: baseId,
    initial: compareIds || scenarios.map(s => s.id),
    onApply: ids => {
      setCompareIds(Array.from(new Set([baseId, ...ids])));
      setComparePicker(false);
    },
    onClose: () => setComparePicker(false)
  }), strategyLibrary && EL(StrategyLibraryModal, {
    status: status,
    year: year,
    onModel: (key, amount) => {
      const id = onModelStrategy ? onModelStrategy(key, amount) : null;
      if (id) {
        setCompareIds(ids => ids ? Array.from(new Set([...ids, id])) : ids);
        setDrill({ id, type: "overview" });
      }
      setStrategyLibrary(false);
    },
    onClose: () => setStrategyLibrary(false)
  }));
}

/* ---- Ledger row renderers, hoisted so their component identity stays stable ---- */
function LedgerGroup({
  label,
  k,
  n,
  open,
  toggle
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-cell tp-group",
    style: {
      gridColumn: `1 / ${n + 2}`
    },
    onClick: () => toggle(k)
  }, open[k] ? I.chevD : I.chevR, " ", label);
}
function LedgerInputRow({
  field,
  label,
  hint,
  indent,
  scenarios,
  update,
  drillType,
  setDrill
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "tp-cell tp-lab" + (indent ? " ind" : "")
  }, label, hint && /*#__PURE__*/React.createElement("em", null, hint)), scenarios.map(s => {
    const scheduled = field === "estimatedPayments" && (s.estimatedPaymentSchedule || []).length > 0;
    return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      className: "tp-cell tp-in" + (drillType ? " drillable" : "")
    }, /*#__PURE__*/React.createElement(Money, {
      value: scheduled ? (s.estimatedPaymentSchedule || []).reduce((a, p) => a + num(p.amount), 0) : s[field],
      disabled: scheduled,
      onChange: v => update(s.id, field, v)
    }), drillType && /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "tp-drillchip",
      title: scheduled ? "Set from the dated payment schedule — click to manage it" : "Open the detailed editor",
      "aria-label": "Edit " + label + " in detail for " + s.name,
      onClick: () => setDrill({ id: s.id, type: scheduled ? "estimatedTax" : drillType })
    }, I.chevR));
  }));
}
function LedgerCalcRow({
  label,
  get,
  cls,
  isPct,
  tags,
  results
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "tp-cell tp-lab calc " + (cls || "")
  }, label), results.map(({
    s,
    r
  }) => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    className: "tp-cell tp-calc " + (cls || "")
  }, isPct ? pct(get(r)) : usd$(get(r)), tags && /*#__PURE__*/React.createElement("span", {
    className: "tp-tag"
  }, tags(r)))));
}
function LedgerDeltaRow({
  label,
  get,
  favorable,
  guard,
  results
}) {
  const base = results[0];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "tp-cell tp-lab calc delta"
  }, label), results.map(({
    s,
    r
  }, i) => {
    if (i === 0) return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      className: "tp-cell tp-calc delta"
    }, "base");
    const d = get(r) - get(base.r);
    const comparable = !guard || guard(r, base.r);
    const good = favorable === "down" ? d < -0.5 : d > 0.5;
    const bad = favorable === "down" ? d > 0.5 : d < -0.5;
    return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      className: "tp-cell tp-calc delta " + (good && comparable ? "save" : bad ? "cost" : ""),
      title: comparable ? "" : "Not directly comparable \u2014 economic inputs differ."
    }, (d > 0 ? "+" : "") + (Math.round(d) === 0 ? "0" : usd(Math.round(d))), !comparable && "\u2020");
  }));
}
function LedgerDrillRow({
  label,
  hint,
  get,
  type,
  results,
  setDrill,
  cls
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "tp-cell tp-lab drill " + (cls || "")
  }, label, hint && /*#__PURE__*/React.createElement("em", null, hint)), results.map(({
    s,
    r
  }) => /*#__PURE__*/React.createElement("button", {
    key: s.id,
    className: "tp-cell tp-calc drill " + (cls || ""),
    onClick: () => setDrill({
      id: s.id,
      type
    })
  }, usd$(get(r, s)))));
}

/* ---------------------------------------------------------------------------
   PLANNING SCENARIOS — "Add Scenario" clones the current scenario and opens
   it for editing; "Add Compare" narrows the Planner ledger to a chosen set of
   scenarios. Both work through the existing scenario list and calculation
   pipeline — there is no second scenario store and no separate engine call.
   ------------------------------------------------------------------------- */
function PlanningScenariosMenu({ onAddScenario, onDuplicateActive, onOpenComparePicker, onOpenStrategyLibrary }) {
  const [open, setOpen] = useState(false);
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-cardmenu"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost sm",
    type: "button",
    "aria-expanded": open,
    onClick: () => setOpen(v => !v)
  }, I.layers, " Planning Scenarios"), open && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-cardmenu-pop"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Clone the active scenario into a new planning scenario and open it for editing",
    onClick: () => { setOpen(false); onAddScenario(); }
  }, "Create from Active"), onDuplicateActive && /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Duplicate the active scenario exactly, without opening an editor",
    onClick: () => { setOpen(false); onDuplicateActive(); }
  }, "Duplicate Active"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => { setOpen(false); onOpenComparePicker(); }
  }, "Add Compare"), onOpenStrategyLibrary && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => { setOpen(false); onOpenStrategyLibrary(); }
  }, I.bulb, " Strategy Library")));
}

/* Compact quick-edit panel for a newly added planning scenario. Reuses the
   same modal chrome (tp-overlay/tp-modal) as the Schedule C / S-Corp / etc.
   drill editors, and the same top-level fields the ledger's income rows
   already edit — so nothing here can drift from what the ledger itself does. */
function ScenarioOverviewEditor({ scenario, update, onJump }) {
  const set = (k, v) => update(k, v);
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement("p", {
    className: "tp-hint"
  }, "This is an independent planning scenario cloned from \u201c", scenario.name, "\u201d—editing it does not change any other scenario. The deterministic engine recalculates automatically."),
  /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Scenario name"), /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    value: scenario.name,
    onChange: e => set("name", e.target.value)
  })),
  /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Income"),
  /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  },
    /*#__PURE__*/React.createElement(Field, { label: "W-2 wages", value: scenario.w2Wages, onChange: v => set("w2Wages", v) }),
    /*#__PURE__*/React.createElement(Field, { label: "Taxable interest", value: scenario.taxableInterest, onChange: v => set("taxableInterest", v) }),
    /*#__PURE__*/React.createElement(Field, { label: "Tax-exempt interest", value: scenario.taxExemptInterest, onChange: v => set("taxExemptInterest", v) }),
    /*#__PURE__*/React.createElement(Field, { label: "Ordinary dividends", value: scenario.ordinaryDividends, onChange: v => set("ordinaryDividends", v) }),
    /*#__PURE__*/React.createElement(Field, { label: "— of which qualified", value: scenario.qualifiedDividends, onChange: v => set("qualifiedDividends", v) }),
    /*#__PURE__*/React.createElement(Field, { label: "Short-term capital gains", value: scenario.shortTermGains, onChange: v => set("shortTermGains", v) }),
    /*#__PURE__*/React.createElement(Field, { label: "Long-term capital gains", value: scenario.longTermGains, onChange: v => set("longTermGains", v) }),
    /*#__PURE__*/React.createElement(Field, { label: "IRA and pension distributions", value: scenario.iraDistributions, onChange: v => set("iraDistributions", v) }),
    /*#__PURE__*/React.createElement(Field, { label: "Roth conversion", value: scenario.rothConversion, onChange: v => set("rothConversion", v) }),
    /*#__PURE__*/React.createElement(Field, { label: "Other income", value: scenario.otherIncome, onChange: v => set("otherIncome", v) })
  ),
  /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Payments and credits"),
  /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  },
    /*#__PURE__*/React.createElement(Field, { label: "Federal withholding", value: scenario.withholding, onChange: v => set("withholding", v) }),
    /*#__PURE__*/React.createElement(Field, { label: "Estimated payments", value: scenario.estimatedPayments, onChange: v => set("estimatedPayments", v) })
  ),
  onJump && /*#__PURE__*/React.createElement(React.Fragment, null,
    /*#__PURE__*/React.createElement("div", {
      className: "tp-minihead"
    }, "Edit in detail"),
    /*#__PURE__*/React.createElement("div", {
      className: "tp-rp-actions"
    },
      /*#__PURE__*/React.createElement("button", { className: "tp-btn ghost sm", type: "button", onClick: () => onJump("schedC") }, "Schedule C →"),
      /*#__PURE__*/React.createElement("button", { className: "tp-btn ghost sm", type: "button", onClick: () => onJump("scorp") }, "S corporations →"),
      /*#__PURE__*/React.createElement("button", { className: "tp-btn ghost sm", type: "button", onClick: () => onJump("schedule1") }, "Schedule 1 →"),
      /*#__PURE__*/React.createElement("button", { className: "tp-btn ghost sm", type: "button", onClick: () => onJump("schedA") }, "Schedule A →")
    )));
}

/* Scenario picker for "Add Compare" — selection only changes which scenarios
   the Planner ledger displays as columns; it never creates, deletes or
   modifies a scenario. The base scenario is always included. */
function ComparePickerModal({ scenarios, results, baseId, initial, onApply, onClose }) {
  const [sel, setSel] = useState(() => new Set(initial));
  useEffect(() => {
    const k = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const toggle = id => {
    if (id === baseId) return;
    setSel(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-overlay",
    onMouseDown: e => e.target === e.currentTarget && onClose()
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-modal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-modal-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "tp-eyebrow"
  }, "Add Compare"), /*#__PURE__*/React.createElement("h3", null, "Choose scenarios for the Planner")), /*#__PURE__*/React.createElement("button", {
    className: "tp-modal-x",
    onClick: onClose
  }, I.x)), /*#__PURE__*/React.createElement("div", {
    className: "tp-modal-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-vcenter-list"
  }, scenarios.map(s => {
    const r = results.find(x => x.s.id === s.id);
    const isBase = s.id === baseId;
    return /*#__PURE__*/React.createElement("label", {
      key: s.id,
      className: "tp-comparerow"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: sel.has(s.id),
      disabled: isBase,
      onChange: () => toggle(s.id)
    }), /*#__PURE__*/React.createElement("span", {
      className: "tp-comparerow-name"
    }, s.name, isBase && /*#__PURE__*/React.createElement("em", null, " · base")), r && /*#__PURE__*/React.createElement("span", {
      className: "tp-comparerow-tax"
    }, usd$(r.r.totalTax)));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "tp-modal-foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost sm",
    onClick: onClose
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid sm",
    onClick: () => onApply(Array.from(sel))
  }, "Add to comparison"))));
}

/* ---- Drill-down editors ---- */
const DRILL_TITLES = {
  overview: "Scenario overview — quick edit",
  schedC: "Schedule C — profit or loss from business",
  passthrough: "Passthrough and K-1 income — Schedule E",
  schedule1: "Schedule 1 — additional income and adjustments",
  schedA: "Schedule A — itemized deductions",
  sched1A: "Schedule 1-A — additional deductions (OBBBA, 2025-2028)",
  scorp: "S corporations — compensation, K-1 and §199A",
  wages: "Wages — Form 1040, line 1a",
  intdiv: "Interest & dividends — Schedule B",
  capgains: "Capital gains & losses — Schedule D",
  retirement: "Retirement, Roth & Social Security income",
  otherincome: "Other income & nonrefundable credits",
  payments: "Payments & withholding — Form 1040, lines 25–26",
  qbiInfo: "Qualified Business Income — §199A summary",
  retirementPlan: "Retirement plan, HSA, SEHI & IRA",
  estimatedTax: "Estimated taxes — IRC §6654 safe harbor"
};
function DrillModal({
  scenario,
  result,
  type,
  status,
  year,
  onClose,
  update,
  onJump
}) {
  useEffect(() => {
    const k = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-overlay",
    onMouseDown: e => e.target === e.currentTarget && onClose()
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-modal" + (type === "estimatedTax" || type === "retirementPlan" ? " tp-modal-wide" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-modal-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "tp-eyebrow"
  }, scenario.name), /*#__PURE__*/React.createElement("h3", null, DRILL_TITLES[type])), /*#__PURE__*/React.createElement("button", {
    className: "tp-modal-x",
    onClick: onClose
  }, I.x)), /*#__PURE__*/React.createElement("div", {
    className: "tp-modal-body"
  }, type === "overview" && /*#__PURE__*/React.createElement(ScenarioOverviewEditor, {
    scenario: scenario,
    update: update,
    onJump: onJump
  }), type === "schedC" && /*#__PURE__*/React.createElement(SchedCEditor, {
    scenario: scenario,
    update: update
  }), type === "passthrough" && /*#__PURE__*/React.createElement(PassthroughEditor, {
    scenario: scenario,
    update: update,
    result: result
  }), type === "scorp" && /*#__PURE__*/React.createElement(SCorpEditor, {
    scenario: scenario,
    update: update,
    result: result
  }), type === "schedule1" && /*#__PURE__*/React.createElement(Schedule1Editor, {
    scenario: scenario,
    update: update,
    result: result
  }), type === "schedA" && /*#__PURE__*/React.createElement(ScheduleAEditor, {
    scenario: scenario,
    update: update,
    result: result
  }), type === "sched1A" && /*#__PURE__*/React.createElement(Sched1AEditor, {
    scenario: scenario,
    update: update,
    result: result,
    status: status
  }), type === "wages" && /*#__PURE__*/React.createElement(WagesEditor, {
    scenario: scenario,
    update: update,
    result: result
  }), type === "intdiv" && /*#__PURE__*/React.createElement(IntDivEditor, {
    scenario: scenario,
    update: update
  }), type === "capgains" && /*#__PURE__*/React.createElement(CapGainsEditor, {
    scenario: scenario,
    update: update,
    result: result
  }), type === "retirement" && /*#__PURE__*/React.createElement(RetirementIncomeEditor, {
    scenario: scenario,
    update: update
  }), type === "otherincome" && /*#__PURE__*/React.createElement(OtherIncomeEditor, {
    scenario: scenario,
    update: update
  }), type === "payments" && /*#__PURE__*/React.createElement(PaymentsEditor, {
    scenario: scenario,
    update: update,
    result: result,
    onJump: onJump
  }), type === "qbiInfo" && /*#__PURE__*/React.createElement(QBIInfoEditor, {
    scenario: scenario,
    result: result,
    onJump: onJump
  }), type === "retirementPlan" && /*#__PURE__*/React.createElement(RetirementPlanEditor, {
    scenario: scenario,
    update: update,
    result: result
  }), type === "estimatedTax" && /*#__PURE__*/React.createElement(EstimatedTaxEditor, {
    scenario: scenario,
    update: update,
    result: result,
    status: status,
    year: year
  })), /*#__PURE__*/React.createElement("div", {
    className: "tp-modal-foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid",
    onClick: onClose
  }, "Done"))));
}
function LineList({
  items,
  onChange,
  ph
}) {
  const set = (id, k, v) => onChange(items.map(i => i.id === id ? {
    ...i,
    [k]: v
  } : i));
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-linelist"
  }, items.map(i => /*#__PURE__*/React.createElement("div", {
    key: i.id,
    className: "tp-linerow"
  }, /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    placeholder: ph,
    value: i.label,
    onChange: e => set(i.id, "label", e.target.value)
  }), /*#__PURE__*/React.createElement(Money, {
    value: i.amount,
    onChange: v => set(i.id, "amount", v)
  }), /*#__PURE__*/React.createElement("button", {
    className: "tp-iconbtn",
    onClick: () => onChange(items.filter(x => x.id !== i.id))
  }, I.trash))), /*#__PURE__*/React.createElement("button", {
    className: "tp-addbtn sm",
    onClick: () => onChange([...items, {
      id: uid(),
      label: "",
      amount: 0
    }])
  }, I.plus, " Add line"));
}
function SchedCEditor({
  scenario,
  update
}) {
  const sc = scenario.schedC;
  const setB = (bid, k, v) => update("schedC", {
    ...sc,
    businesses: sc.businesses.map(b => b.id === bid ? {
      ...b,
      [k]: v
    } : b)
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, sc.businesses.map(b => {
    const net = businessNet(b);
    return /*#__PURE__*/React.createElement("div", {
      key: b.id,
      className: "tp-biz"
    }, /*#__PURE__*/React.createElement("div", {
      className: "tp-biz-head"
    }, /*#__PURE__*/React.createElement("input", {
      className: "tp-txt big",
      value: b.name,
      onChange: e => setB(b.id, "name", e.target.value)
    }), /*#__PURE__*/React.createElement("button", {
      className: "tp-iconbtn",
      onClick: () => update("schedC", {
        ...sc,
        businesses: sc.businesses.filter(x => x.id !== b.id)
      })
    }, I.trash)), /*#__PURE__*/React.createElement("div", {
      className: "tp-grid3"
    }, /*#__PURE__*/React.createElement(Field, {
      label: "Gross receipts",
      value: b.grossReceipts,
      onChange: v => setB(b.id, "grossReceipts", v)
    }), /*#__PURE__*/React.createElement(Field, {
      label: "Returns and allowances",
      value: b.returns,
      onChange: v => setB(b.id, "returns", v)
    }), /*#__PURE__*/React.createElement(Field, {
      label: "Cost of goods sold",
      value: b.cogs,
      onChange: v => setB(b.id, "cogs", v)
    })), /*#__PURE__*/React.createElement("div", {
      className: "tp-minihead"
    }, "Expenses"), /*#__PURE__*/React.createElement(LineList, {
      items: b.expenses || [],
      onChange: items => setB(b.id, "expenses", items),
      ph: "Expense category"
    }), /*#__PURE__*/React.createElement("div", {
      className: "tp-minihead"
    }, "For §199A"), /*#__PURE__*/React.createElement("div", {
      className: "tp-grid3"
    }, /*#__PURE__*/React.createElement(Field, {
      label: "W-2 wages paid by the business",
      value: b.w2wages,
      onChange: v => setB(b.id, "w2wages", v)
    }), /*#__PURE__*/React.createElement(Field, {
      label: "UBIA of qualified property",
      value: b.ubia,
      onChange: v => setB(b.id, "ubia", v)
    })), /*#__PURE__*/React.createElement("div", {
      className: "tp-biznet " + (net < 0 ? "neg" : "")
    }, /*#__PURE__*/React.createElement("span", null, "Net profit or loss"), /*#__PURE__*/React.createElement("strong", null, usd$(net))));
  }), /*#__PURE__*/React.createElement("button", {
    className: "tp-addbtn",
    onClick: () => update("schedC", {
      ...sc,
      businesses: [...sc.businesses, {
        id: uid(),
        name: "New business",
        grossReceipts: 0,
        returns: 0,
        cogs: 0,
        w2wages: 0,
        ubia: 0,
        expenses: []
      }]
    })
  }, I.plus, " Add business"), /*#__PURE__*/React.createElement("div", {
    className: "tp-editor-total"
  }, /*#__PURE__*/React.createElement("span", null, "Total Schedule C, subject to SE tax"), /*#__PURE__*/React.createElement("strong", null, usd$(schedCTotal(sc)))), /*#__PURE__*/React.createElement(Note, null, "QBI figures entered here are for reference. The §199A computation runs off the entity list in the", /*#__PURE__*/React.createElement("strong", null, " QBI Workbench"), ", which allows SSTB flags and aggregation."));
}
function PassthroughEditor({
  scenario,
  update,
  result
}) {
  const pt = scenario.passthrough;
  const set = (id, k, v) => update("passthrough", {
    ...pt,
    entities: pt.entities.map(e => e.id === id ? {
      ...e,
      [k]: v
    } : e)
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Entity"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Ordinary"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Rental"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "W-2 wages"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "UBIA"), /*#__PURE__*/React.createElement("th", {
    className: "ctr"
  }, "§1411 classification"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, pt.entities.map(e => /*#__PURE__*/React.createElement("tr", {
    key: e.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    value: e.name,
    onChange: ev => set(e.id, "name", ev.target.value)
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Money, {
    value: e.ordinary,
    onChange: v => set(e.id, "ordinary", v)
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Money, {
    value: e.rental,
    onChange: v => set(e.id, "rental", v)
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Money, {
    value: e.w2,
    onChange: v => set(e.id, "w2", v)
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Money, {
    value: e.ubia,
    onChange: v => set(e.id, "ubia", v)
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("select", {
    className: "tp-txt",
    style: { minWidth: 170 },
    value: e.niitClass || "",
    onChange: ev => set(e.id, "niitClass", ev.target.value || null),
    title: "Sec. 1411 net investment income classification for this activity"
  }, /*#__PURE__*/React.createElement("option", { value: "" }, "Unclassified — review required"), NIIT_CLASSES.map(c => /*#__PURE__*/React.createElement("option", { key: c.v, value: c.v }, c.l)))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
    className: "tp-iconbtn",
    onClick: () => update("passthrough", {
      ...pt,
      entities: pt.entities.filter(x => x.id !== e.id)
    })
  }, I.trash)))), !pt.entities.length && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 7,
    className: "tp-empty"
  }, "No entities.")))), /*#__PURE__*/React.createElement("button", {
    className: "tp-addbtn",
    onClick: () => update("passthrough", {
      ...pt,
      entities: [...pt.entities, {
        id: uid(),
        name: "New entity",
        ordinary: 0,
        rental: 0,
        w2: 0,
        ubia: 0
      }]
    })
  }, I.plus, " Add entity"), /*#__PURE__*/React.createElement("div", {
    className: "tp-editor-total"
  }, /*#__PURE__*/React.createElement("span", null, "Total passthrough income, not subject to SE tax"), /*#__PURE__*/React.createElement("strong", null, usd$(ptTotal(pt)))), /*#__PURE__*/React.createElement(Note, null, "Each activity carries its own §1411 classification — the controlled list drives whether the income enters the 3.8% net investment income base. Nonpassive trade-or-business income is excluded by §1411(c)(2)(A); rental income leaves the base only once the activity is affirmatively classified. Unclassified activities keep the legacy treatment and are flagged for human review."), result && (result.niitDetail || []).length > 0 && /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl",
    style: { marginTop: 10 }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Activity"), /*#__PURE__*/React.createElement("th", null, "\u00a71411 treatment"), /*#__PURE__*/React.createElement("th", { className: "num" }, "Income"), /*#__PURE__*/React.createElement("th", { className: "num" }, "In NIIT base"))), /*#__PURE__*/React.createElement("tbody", null, result.niitDetail.map((d, i) => /*#__PURE__*/React.createElement("tr", { key: i }, /*#__PURE__*/React.createElement("td", null, d.name), /*#__PURE__*/React.createElement("td", null, d.classification), /*#__PURE__*/React.createElement("td", { className: "num" }, usd$(d.amount)), /*#__PURE__*/React.createElement("td", { className: "num" }, usd$(d.included)))))), result && (result.niitReview || []).map((w, i) => /*#__PURE__*/React.createElement(Note, {
    kind: "warn",
    key: "nr" + i
  }, "Human review required: ", w)));
}

/* ---- S corporations: compensation, derived K-1, and §199A attributes ---- */
function SCorpEditor({
  scenario,
  update,
  result
}) {
  const list = scenario.sCorps && scenario.sCorps.entities || [];
  const setE = (id, k, v) => update("sCorps", {
    entities: list.map(e => e.id === id ? {
      ...e,
      [k]: v
    } : e)
  });
  const add = () => update("sCorps", {
    entities: [...list, defaultSCorp("S corporation " + (list.length + 1))]
  });
  const del = id => update("sCorps", {
    entities: list.filter(e => e.id !== id)
  });
  const legacy = num(scenario.sCorpComp) + num(scenario.sCorpK1);
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement(Note, null, "Enter ", /*#__PURE__*/React.createElement("strong", null, "profit before owner compensation"), " and the K-1 is derived — never typed. The employer half of payroll tax is the corporation's expense, so it reduces the K-1 before anything reaches the return:", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("code", {
    className: "tp-code"
  }, "K-1 = profit − owner compensation − employer payroll tax − other expenses"), /*#__PURE__*/React.createElement("br", null), "Skipping that step is the classic way an S-corporation comparison overstates the benefit."), list.map(e => {
    const r = (result.SCORPS || []).find(x => x.id === e.id) || {};
    return /*#__PURE__*/React.createElement("div", {
      key: e.id,
      className: "tp-biz"
    }, /*#__PURE__*/React.createElement("div", {
      className: "tp-biz-head"
    }, /*#__PURE__*/React.createElement("input", {
      className: "tp-txt big",
      value: e.name,
      onChange: ev => setE(e.id, "name", ev.target.value)
    }), /*#__PURE__*/React.createElement("button", {
      className: "tp-iconbtn",
      onClick: () => del(e.id)
    }, I.trash)), /*#__PURE__*/React.createElement("div", {
      className: "tp-grid3"
    }, /*#__PURE__*/React.createElement(Field, {
      label: "Profit before owner compensation",
      hint: "after all other expenses",
      value: e.profitBeforeComp,
      onChange: v => setE(e.id, "profitBeforeComp", v)
    }), /*#__PURE__*/React.createElement(Field, {
      label: "Owner reasonable compensation",
      hint: "W-2, Form 1120-S",
      value: e.ownerComp,
      onChange: v => setE(e.id, "ownerComp", v)
    }), /*#__PURE__*/React.createElement(Field, {
      label: "Other corporate expenses",
      value: e.otherExpenses,
      onChange: v => setE(e.id, "otherExpenses", v)
    })), /*#__PURE__*/React.createElement("div", {
      className: "tp-minihead"
    }, "§199A attributes"), /*#__PURE__*/React.createElement("div", {
      className: "tp-grid3"
    }, /*#__PURE__*/React.createElement(Field, {
      label: "Non-owner W-2 wages",
      hint: "adds to the wage limit",
      value: e.nonOwnerW2,
      onChange: v => setE(e.id, "nonOwnerW2", v)
    }), /*#__PURE__*/React.createElement(Field, {
      label: "UBIA of qualified property",
      value: e.ubia,
      onChange: v => setE(e.id, "ubia", v)
    }), /*#__PURE__*/React.createElement(Field, {
      label: "Ownership percentage",
      hint: "allocates the K-1",
      value: e.ownershipPct,
      onChange: v => setE(e.id, "ownershipPct", v)
    })), /*#__PURE__*/React.createElement("div", {
      className: "tp-inline",
      style: {
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("label", {
      className: "tp-check"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: !!e.sstb,
      onChange: ev => setE(e.id, "sstb", ev.target.checked)
    }), " Specified service trade or business"), /*#__PURE__*/React.createElement("label", {
      className: "tp-check"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: e.active !== false,
      onChange: ev => setE(e.id, "active", ev.target.checked)
    }), " Material participation — active, so the K-1 stays outside net investment income")), /*#__PURE__*/React.createElement("div", {
      className: "tp-minihead"
    }, "Derived"), /*#__PURE__*/React.createElement("table", {
      className: "tp-tbl"
    }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Profit before owner compensation"), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(r.profit))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
      className: "ind"
    }, "Less owner compensation"), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, "(", usd(r.comp), ")")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
      className: "ind"
    }, "Less employer payroll tax", /*#__PURE__*/React.createElement("em", {
      className: "tp-rownote"
    }, "Social Security ", usd$(r.oasdi), " (6.2% to the wage base) + Medicare ", usd$(r.hi), " (1.45%) — the corporation's expense")), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, "(", usd(r.employerFICA), ")")), r.otherExp > 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
      className: "ind"
    }, "Less other corporate expenses"), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, "(", usd(r.otherExp), ")")), /*#__PURE__*/React.createElement("tr", {
      className: "tot"
    }, /*#__PURE__*/React.createElement("td", null, "K-1 ordinary business income", r.pct !== 1 ? " (at " + pct(r.pct, 0) + ")" : ""), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(r.k1))), /*#__PURE__*/React.createElement("tr", {
      className: "sep"
    }, /*#__PURE__*/React.createElement("td", null, "Employee payroll tax", /*#__PURE__*/React.createElement("em", {
      className: "tp-rownote"
    }, "Social Security ", usd$(r.oasdi), " + Medicare ", usd$(r.hi), " — withheld from the owner's wages; Additional Medicare Tax is computed at the return level")), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(r.employeeFICA))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Combined payroll-tax burden on this compensation", /*#__PURE__*/React.createElement("em", {
      className: "tp-rownote"
    }, "employee half is withheld; employer half already reduced the K-1 and is never part of the Form 1040 balance due")), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(r.totalFICA))), /*#__PURE__*/React.createElement("tr", {
      className: "sep"
    }, /*#__PURE__*/React.createElement("td", null, "§199A qualified business income"), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(r.qbiIncome))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "§199A W-2 wages", /*#__PURE__*/React.createElement("em", {
      className: "tp-rownote"
    }, "owner compensation plus non-owner wages")), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(r.qbiW2))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "§199A UBIA"), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(r.qbiUbia))))), /*#__PURE__*/React.createElement(Note, {
      kind: "warn"
    }, "Reasonable compensation is fact-dependent and is the leading S-corporation audit issue. Support it with a documented study covering role, hours and market rates before filing."));
  }), /*#__PURE__*/React.createElement("button", {
    className: "tp-addbtn",
    onClick: add
  }, I.plus, " Add S corporation"), legacy > 0 && /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, "This scenario also carries legacy manual entries of ", usd$(num(scenario.sCorpComp)), " compensation and", " ", usd$(num(scenario.sCorpK1)), " K-1, entered before the entity model existed. They are still included in the totals. Move them into an entity above and clear these to get the derived K-1 and payroll reconciliation.", /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3",
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Legacy compensation",
    value: scenario.sCorpComp,
    onChange: v => update("sCorpComp", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Legacy K-1",
    value: scenario.sCorpK1,
    onChange: v => update("sCorpK1", v)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "tp-editor-total"
  }, /*#__PURE__*/React.createElement("span", null, "Total compensation and K-1 reaching Form 1040"), /*#__PURE__*/React.createElement("strong", null, usd$(result.scorpComp + result.scorpK1 + num(scenario.sCorpComp) + num(scenario.sCorpK1)))), result.employerFICA > 0 && /*#__PURE__*/React.createElement(Note, null, "Employer payroll tax of ", usd$(result.employerFICA), " has already reduced the K-1, so it never appears on the return. It is still a real cost, which is why after-tax cash is measured against profit before owner compensation rather than against Form 1040 income."));
}
function Schedule1Editor({
  scenario,
  update,
  result
}) {
  const s1 = scenario.schedule1;
  const set = (k, v) => update("schedule1", {
    ...s1,
    [k]: v
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Part I — additional income"), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Taxable state and local refunds",
    value: s1.stateRefund,
    onChange: v => set("stateRefund", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Unemployment compensation",
    value: s1.unemployment,
    onChange: v => set("unemployment", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Gambling, prizes and awards",
    value: s1.gambling,
    onChange: v => set("gambling", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Cancellation of debt",
    value: s1.cancellationDebt,
    onChange: v => set("cancellationDebt", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Other additional income",
    value: s1.otherIncome,
    onChange: v => set("otherIncome", v)
  })), /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Part II — adjustments to income"), /*#__PURE__*/React.createElement(Note, null, "Retirement contributions, HSA, self-employed health insurance and the IRA deduction are handled in their own modules, where the statutory limits are enforced."), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Student loan interest",
    hint: "max $2,500",
    value: s1.studentLoanInterest,
    onChange: v => set("studentLoanInterest", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Educator expenses",
    value: s1.educatorExpenses,
    onChange: v => set("educatorExpenses", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Early withdrawal penalty",
    value: s1.earlyWithdrawalPenalty,
    onChange: v => set("earlyWithdrawalPenalty", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Alimony paid",
    hint: "pre-2019 decrees",
    value: s1.alimonyPaid,
    onChange: v => set("alimonyPaid", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Other adjustments",
    value: s1.otherAdjustments,
    onChange: v => set("otherAdjustments", v)
  })), num(s1.studentLoanInterest) > 0 && result.studentLoan && /*#__PURE__*/React.createElement("div", {
    className: "tp-sublist"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Student loan interest — Sec. 221 limitation"), /*#__PURE__*/React.createElement("div", {
    className: "tp-subline"
  }, /*#__PURE__*/React.createElement("span", null, "Interest entered"), /*#__PURE__*/React.createElement("strong", null, usd$(result.studentLoan.entered))), /*#__PURE__*/React.createElement("div", {
    className: "tp-subline"
  }, /*#__PURE__*/React.createElement("span", null, "Maximum deduction"), /*#__PURE__*/React.createElement("strong", null, usd$(result.studentLoan.max))), /*#__PURE__*/React.createElement("div", {
    className: "tp-subline"
  }, /*#__PURE__*/React.createElement("span", null, "MAGI before this deduction"), /*#__PURE__*/React.createElement("strong", null, usd$(result.studentLoan.magi))), /*#__PURE__*/React.createElement("div", {
    className: "tp-subline"
  }, /*#__PURE__*/React.createElement("span", null, "Phase-out applied"), /*#__PURE__*/React.createElement("strong", null, pct(result.studentLoan.phaseoutFraction, 1))), /*#__PURE__*/React.createElement("div", {
    className: "tp-subline"
  }, /*#__PURE__*/React.createElement("span", null, "Allowed deduction"), /*#__PURE__*/React.createElement("strong", null, usd$(result.studentLoan.allowed))), result.studentLoan.reason && /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, result.studentLoan.reason)), /*#__PURE__*/React.createElement("div", {
    className: "tp-editor-total"
  }, /*#__PURE__*/React.createElement("span", null, "Total adjustments to income"), /*#__PURE__*/React.createElement("strong", null, usd$(result.adjustments))));
}
function ScheduleAEditor({
  scenario,
  update,
  result
}) {
  const a = scenario.scheduleA,
    A = result.A,
    C = result.C;
  const set = (k, v) => update("scheduleA", {
    ...a,
    [k]: v
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Medical and dental — deductible above 7.5% of AGI"), /*#__PURE__*/React.createElement(LineList, {
    items: a.medical || [],
    onChange: items => set("medical", items),
    ph: "Medical expense"
  }), /*#__PURE__*/React.createElement("div", {
    className: "tp-subline"
  }, /*#__PURE__*/React.createElement("span", null, "Deductible after the AGI floor"), /*#__PURE__*/React.createElement("strong", null, usd$(A.medical))), /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Taxes paid"), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "State and local income tax",
    value: a.stateIncomeTax,
    onChange: v => set("stateIncomeTax", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Real estate tax",
    value: a.realEstateTax,
    onChange: v => set("realEstateTax", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Personal property tax",
    value: a.personalPropertyTax,
    onChange: v => set("personalPropertyTax", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "General sales tax",
    hint: "alternative to income tax",
    value: a.salesTax,
    onChange: v => set("salesTax", v)
  })), /*#__PURE__*/React.createElement("div", {
    className: "tp-subline"
  }, /*#__PURE__*/React.createElement("span", null, "SALT after the cap of ", usd$(A.saltCap), /*#__PURE__*/React.createElement("em", {
    className: "tp-rownote"
  }, A.saltElection, " — income and sales tax are alternatives, not additive")), /*#__PURE__*/React.createElement("strong", null, usd$(A.salt))), A.saltCap < C.saltCap[result.status] && /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, "The cap is phased down from ", usd$(C.saltCap[result.status]), " because MAGI exceeds ", usd$(C.saltThreshold[result.status]), ". It falls 30 cents per dollar of excess MAGI, with a floor of ", usd$(C.saltFloor[result.status]), "."), /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Interest paid"), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Home mortgage interest",
    value: a.mortgageInterest,
    onChange: v => set("mortgageInterest", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Points",
    value: a.points,
    onChange: v => set("points", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Investment interest",
    hint: "Form 4952",
    value: a.investmentInterest,
    onChange: v => set("investmentInterest", v)
  })), /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Charitable contributions"), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Cash contributions",
    value: a.charityCash,
    onChange: v => set("charityCash", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Non-cash contributions",
    value: a.charityNonCash,
    onChange: v => set("charityNonCash", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Prior-year carryover",
    value: a.charityCarryover,
    onChange: v => set("charityCarryover", v)
  })), A.charityFloor > 0 && /*#__PURE__*/React.createElement("div", {
    className: "tp-subline"
  }, /*#__PURE__*/React.createElement("span", null, "Less the 0.5%-of-AGI floor, new for 2026"), /*#__PURE__*/React.createElement("strong", null, "(", usd(A.charityFloor), ")")), /*#__PURE__*/React.createElement("div", {
    className: "tp-subline"
  }, /*#__PURE__*/React.createElement("span", null, "Charitable allowed"), /*#__PURE__*/React.createElement("strong", null, usd$(A.charity))), /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Other itemized deductions"), /*#__PURE__*/React.createElement(LineList, {
    items: a.other || [],
    onChange: items => set("other", items),
    ph: "Deduction"
  }), A.reduction > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "tp-subline"
  }, /*#__PURE__*/React.createElement("span", null, "Itemized deductions before the overall limit"), /*#__PURE__*/React.createElement("strong", null, usd$(A.beforeCap))), /*#__PURE__*/React.createElement("div", {
    className: "tp-subline warn"
  }, /*#__PURE__*/React.createElement("span", null, "Less the 2/37 reduction for top-bracket income, new for 2026"), /*#__PURE__*/React.createElement("strong", null, "(", usd(A.reduction), ")"))), /*#__PURE__*/React.createElement("div", {
    className: "tp-editor-total"
  }, /*#__PURE__*/React.createElement("span", null, "Total itemized deductions"), /*#__PURE__*/React.createElement("strong", null, usd$(A.total))), /*#__PURE__*/React.createElement(Note, null, "Standard deduction for comparison: ", usd$(result.stdDed), " — ", A.total >= result.stdDed ? "itemizing wins." : "the standard deduction wins."));
}
function Sched1AEditor({
  scenario,
  update,
  result,
  status
}) {
  const p = scenario.sched1A || emptySched1A();
  const set = (k, v) => update("sched1A", {
    ...p,
    [k]: v
  });
  const S = result.S1A,
    C = result.C;
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, "These four OBBBA deductions run 2025 through 2028 and are available whether or not the taxpayer itemizes. Critically, they are reported ", /*#__PURE__*/React.createElement("strong", null, "below the line"), " on Form 1040 line 13b — they reduce taxable income but ", /*#__PURE__*/React.createElement("strong", null, "not AGI"), ", so they never relieve any AGI-driven phase-out, IRMAA tier, or the net investment income tax."), S.ineligibleReason && /*#__PURE__*/React.createElement(Note, {
    kind: "bad"
  }, /*#__PURE__*/React.createElement("strong", null, S.ineligibleReason), " The senior, tip, overtime, and vehicle-loan-interest deductions require a joint return for married taxpayers. Amounts entered below are retained but no deduction is allowed while the filing status is married filing separately."), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Individuals age 65 or older",
    hint: "0, 1 or 2",
    value: p.seniorCount,
    onChange: v => set("seniorCount", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Blind individuals",
    hint: "extra standard deduction",
    value: p.blindCount,
    onChange: v => set("blindCount", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Qualified tips received",
    hint: "cap " + usd$(C.tips.cap),
    value: p.tips,
    onChange: v => set("tips", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Qualified overtime premium",
    hint: "cap " + usd$(C.overtime.cap[status]),
    value: p.overtime,
    onChange: v => set("overtime", v)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Car loan interest",
    hint: "cap " + usd$(C.autoLoan.cap),
    value: p.autoLoanInterest,
    onChange: v => set("autoLoanInterest", v)
  })), /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Deduction"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Eligible"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "MAGI threshold"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Phase-out"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Allowed"))), /*#__PURE__*/React.createElement("tbody", null, S.detail.map(d => /*#__PURE__*/React.createElement("tr", {
    key: d.label
  }, /*#__PURE__*/React.createElement("td", null, d.label), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(d.eligible)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(d.threshold)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, "(", usd(d.reduction), ")"), /*#__PURE__*/React.createElement("td", {
    className: "num strong"
  }, usd$(d.allowed)))), !S.detail.length && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 5,
    className: "tp-empty"
  }, "Nothing entered.")), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Total Schedule 1-A"), /*#__PURE__*/React.createElement("td", {
    colSpan: 3
  }), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(S.total))))), /*#__PURE__*/React.createElement(Note, null, "Tips must be earned in an occupation on the IRS published list and the taxpayer must have an SSN valid for employment. Overtime means only the premium portion above the regular rate, required by the Fair Labor Standards Act. Car loan interest requires a loan originated after December 31, 2024, secured by a first lien on a new personal-use vehicle under 14,000 pounds with final assembly in the United States. Married taxpayers must file jointly for all four."));
}

/* ---- Wages, interest/dividends, capital gains, retirement, other income,
   payments — detail editors reached from the ledger's chevron affordance.
   Every field here is the same scenario field the ledger's inline Money
   input already edits: this is a richer presentation of the same input,
   never a second copy of it. ---- */
function WagesEditor({ scenario, update, result }) {
  return /*#__PURE__*/React.createElement("div", { className: "tp-stack" },
    /*#__PURE__*/React.createElement(Note, null, "Box 1 wages and federal income tax withheld from every Form W-2, combined into these two totals."),
    /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement(Field, { label: "W-2 wages (Box 1)", hint: "Form 1040, line 1a", value: scenario.w2Wages, onChange: v => update("w2Wages", v) }),
      /*#__PURE__*/React.createElement(Field, { label: "Federal income tax withheld", hint: "Form 1040, line 25a", value: scenario.withholding, onChange: v => update("withholding", v) })
    ),
    result && result.employeeFICA > 0 && /*#__PURE__*/React.createElement(Note, null, "Employee-side Social Security and Medicare are withheld separately from these two boxes; Additional Medicare Tax on wages above the threshold is computed on the Other Taxes line — IRC §3101(b)(2)."));
}
function IntDivEditor({ scenario, update }) {
  return /*#__PURE__*/React.createElement("div", { className: "tp-stack" },
    /*#__PURE__*/React.createElement(Note, null, "1099-INT and 1099-DIV totals. Tax-exempt interest and the qualified portion of dividends don't drive ordinary tax directly, but both feed NIIT MAGI, IRMAA, and ACA testing."),
    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Interest — Schedule B, Part I"),
    /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement(Field, { label: "Taxable interest", hint: "1099-INT box 1", value: scenario.taxableInterest, onChange: v => update("taxableInterest", v) }),
      /*#__PURE__*/React.createElement(Field, { label: "Tax-exempt interest", hint: "1099-INT box 8 · IRC §103", value: scenario.taxExemptInterest, onChange: v => update("taxExemptInterest", v) })
    ),
    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Dividends — Schedule B, Part II"),
    /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement(Field, { label: "Ordinary dividends", hint: "1099-DIV box 1a", value: scenario.ordinaryDividends, onChange: v => update("ordinaryDividends", v) }),
      /*#__PURE__*/React.createElement(Field, { label: "— of which qualified", hint: "1099-DIV box 1b · taxed at capital-gains rates · IRC §1(h)", value: scenario.qualifiedDividends, onChange: v => update("qualifiedDividends", v) })
    ),
    num(scenario.qualifiedDividends) > num(scenario.ordinaryDividends) && /*#__PURE__*/React.createElement(Note, { kind: "warn" }, "Qualified dividends can't exceed total ordinary dividends."));
}
function CapGainsEditor({ scenario, update, result }) {
  const lots = scenario.capGainLots || { shortTerm: [], longTerm: [] };
  const setLots = (k, items) => update("capGainLots", { ...lots, [k]: items });
  return /*#__PURE__*/React.createElement("div", { className: "tp-stack" },
    /*#__PURE__*/React.createElement(Note, null, "Schedule D totals. Short-term gains are taxed as ordinary income; the engine applies the 0/15/20% long-term breakpoints and the 3.8% net investment income tax. Exclude wash-sale losses before entering a total — IRC §1211/§1212, 61-day window across every account."),
    /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement(Field, { label: "Short-term capital gains", hint: "held ≤ 1 year", value: scenario.shortTermGains, onChange: v => update("shortTermGains", v) }),
      /*#__PURE__*/React.createElement(Field, { label: "Long-term capital gains", hint: "held > 1 year · IRC §1(h)", value: scenario.longTermGains, onChange: v => update("longTermGains", v) })
    ),
    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Lot detail — documentation only; the totals above drive the engine"),
    /*#__PURE__*/React.createElement("em", { className: "tp-rownote" }, "Short-term lots"),
    /*#__PURE__*/React.createElement(LineList, { items: lots.shortTerm || [], onChange: items => setLots("shortTerm", items), ph: "Security / lot description" }),
    /*#__PURE__*/React.createElement("em", { className: "tp-rownote" }, "Long-term lots"),
    /*#__PURE__*/React.createElement(LineList, { items: lots.longTerm || [], onChange: items => setLots("longTerm", items), ph: "Security / lot description" }),
    /*#__PURE__*/React.createElement("div", { className: "tp-editor-total" }, /*#__PURE__*/React.createElement("span", null, "Net capital gain reaching Schedule D"), /*#__PURE__*/React.createElement("strong", null, usd$(num(scenario.shortTermGains) + num(scenario.longTermGains)))));
}
function RetirementIncomeEditor({ scenario, update }) {
  return /*#__PURE__*/React.createElement("div", { className: "tp-stack" },
    /*#__PURE__*/React.createElement(Note, null, "IRA/pension distributions and Social Security feed AGI; a Roth conversion is ordinary income this year but is excluded from Roth-eligibility MAGI testing — IRC §408A(d)(3). Model a qualified charitable distribution as a reduction of IRA distributions from the Strategy Scenario Library."),
    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Distributions"),
    /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement(Field, { label: "IRA and pension distributions", hint: "1099-R box 2a", value: scenario.iraDistributions, onChange: v => update("iraDistributions", v) }),
      /*#__PURE__*/React.createElement(Field, { label: "Roth conversion", hint: "excluded from Roth MAGI", value: scenario.rothConversion, onChange: v => update("rothConversion", v) })
    ),
    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Social Security — Form 1040, lines 6a/6b"),
    /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement(Field, { label: "Total benefits received", value: scenario.socialSecurityTotal, onChange: v => update("socialSecurityTotal", v) }),
      /*#__PURE__*/React.createElement(Field, { label: "Taxable portion", hint: "up to 85% · IRC §86", value: scenario.socialSecurityTaxable, onChange: v => update("socialSecurityTaxable", v) })
    ),
    num(scenario.socialSecurityTaxable) > num(scenario.socialSecurityTotal) && /*#__PURE__*/React.createElement(Note, { kind: "warn" }, "The taxable portion can't exceed total benefits received."));
}
function OtherIncomeEditor({ scenario, update }) {
  return /*#__PURE__*/React.createElement("div", { className: "tp-stack" },
    /*#__PURE__*/React.createElement(Note, null, "Income and credits without their own module. Larger, form-specific items — unemployment, gambling, cancellation of debt, student loan interest — live on the Schedule 1 detail (Adjustments and deductions group)."),
    /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement(Field, { label: "Other income", hint: "not otherwise classified", value: scenario.otherIncome, onChange: v => update("otherIncome", v) }),
      /*#__PURE__*/React.createElement(Field, { label: "Qualifying children under 17", hint: "Child Tax Credit · IRC §24", value: scenario.children, onChange: v => update("children", v) }),
      /*#__PURE__*/React.createElement(Field, { label: "Other nonrefundable credits", value: scenario.otherCredits, onChange: v => update("otherCredits", v) }),
      /*#__PURE__*/React.createElement(Field, { label: "Household size", hint: "ACA percentage of FPL", value: scenario.householdSize, onChange: v => update("householdSize", v) })
    ));
}
function PaymentsEditor({ scenario, update, result, onJump }) {
  const scheduled = (scenario.estimatedPaymentSchedule || []).length > 0;
  return /*#__PURE__*/React.createElement("div", { className: "tp-stack" },
    /*#__PURE__*/React.createElement(Note, null, "Form 1040, lines 25–26. The engine tests total payments against the estimated-tax safe harbor — IRC §6654."),
    /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement(Field, { label: "Federal withholding", hint: "1040 lines 25a–25c", value: scenario.withholding, onChange: v => update("withholding", v) }),
      scheduled
        ? /*#__PURE__*/React.createElement("label", { className: "tp-field" }, /*#__PURE__*/React.createElement("span", null, "Estimated payments", /*#__PURE__*/React.createElement("em", null, "from the dated payment schedule")), /*#__PURE__*/React.createElement("div", { className: "tp-subline" }, /*#__PURE__*/React.createElement("strong", null, usd$(result ? result.estimatedPaymentsResolved : scenario.estimatedPayments))))
        : /*#__PURE__*/React.createElement(Field, { label: "Estimated payments", hint: "1040 line 26", value: scenario.estimatedPayments, onChange: v => update("estimatedPayments", v) })
    ),
    scheduled && /*#__PURE__*/React.createElement(Note, null, "This total comes from the dated payment schedule in the estimated-tax calculator — edit it there, not here."),
    result && /*#__PURE__*/React.createElement("div", { className: "tp-editor-total" }, /*#__PURE__*/React.createElement("span", null, "Total payments"), /*#__PURE__*/React.createElement("strong", null, usd$(num(scenario.withholding) + (scheduled ? result.estimatedPaymentsResolved : num(scenario.estimatedPayments))))),
    onJump && /*#__PURE__*/React.createElement("div", { className: "tp-rp-actions" },
      /*#__PURE__*/React.createElement("button", { className: "tp-btn ghost sm", type: "button", onClick: () => onJump("estimatedTax") }, "Manage estimated payments →")));
}
function QBIInfoEditor({ scenario, result, onJump }) {
  const entities = scenario.qbi && scenario.qbi.entities || [];
  return /*#__PURE__*/React.createElement("div", { className: "tp-stack" },
    /*#__PURE__*/React.createElement(Note, null, "§199A wages, UBIA and SSTB flags are entered per business on Schedule C, per S corporation, and per passthrough K-1 — this is a read-only summary. Aggregation elections and the manual override live in the dedicated QBI module."),
    /*#__PURE__*/React.createElement("table", { className: "tp-tbl" },
      /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Entity"), /*#__PURE__*/React.createElement("th", { className: "num" }, "QBI income"), /*#__PURE__*/React.createElement("th", { className: "num" }, "W-2 wages"), /*#__PURE__*/React.createElement("th", { className: "num" }, "UBIA"), /*#__PURE__*/React.createElement("th", { className: "ctr" }, "SSTB"))),
      /*#__PURE__*/React.createElement("tbody", null,
        entities.map(e => /*#__PURE__*/React.createElement("tr", { key: e.id }, /*#__PURE__*/React.createElement("td", null, e.name), /*#__PURE__*/React.createElement("td", { className: "num" }, usd$(e.income)), /*#__PURE__*/React.createElement("td", { className: "num" }, usd$(e.w2)), /*#__PURE__*/React.createElement("td", { className: "num" }, usd$(e.ubia)), /*#__PURE__*/React.createElement("td", { className: "ctr" }, e.sstb ? "Yes" : "No"))),
        !entities.length && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", { colSpan: 5, className: "tp-empty" }, "No entities on the QBI schedule yet — add one from Schedule C, S corporations, or Passthrough / K-1.")))),
    /*#__PURE__*/React.createElement("div", { className: "tp-editor-total" }, /*#__PURE__*/React.createElement("span", null, "§199A deduction"), /*#__PURE__*/React.createElement("strong", null, usd$(result.qbi.deduction))),
    onJump && /*#__PURE__*/React.createElement("div", { className: "tp-rp-actions" },
      /*#__PURE__*/React.createElement("button", { className: "tp-btn ghost sm", type: "button", onClick: () => onJump("schedC") }, "Schedule C →"),
      /*#__PURE__*/React.createElement("button", { className: "tp-btn ghost sm", type: "button", onClick: () => onJump("scorp") }, "S corporations →"),
      /*#__PURE__*/React.createElement("button", { className: "tp-btn ghost sm", type: "button", onClick: () => onJump("passthrough") }, "Passthrough / K-1 →")));
}

/* ---- Retirement plan, HSA, SEHI and IRA — one editor for the four
   previously read-only "Adjustments and deductions" calc rows. Every field
   here already drives the engine (03-scenario.js); this only adds a click
   surface, it does not duplicate the calculation. ---- */
function RetirementPlanEditor({ scenario, update, result }) {
  const P = scenario.planning || {};
  const setP = (k, v) => update("planning", { ...P, [k]: v });
  const H = scenario.sehi || {};
  const setH = (k, v) => update("sehi", { ...H, [k]: v });
  const I = scenario.ira || {};
  const setI = (k, v) => update("ira", { ...I, [k]: v });
  const options = (result.RET && result.RET.options) || [];
  return /*#__PURE__*/React.createElement("div", { className: "tp-stack" },
    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Self-employed retirement plan"),
    /*#__PURE__*/React.createElement(Note, null, "The engine computes the maximum deductible contribution for the selected plan design from Schedule C profit less half the SE tax. IRC §401(k)/§404(h)/§408(p) apply the statutory limits automatically — enter an age for catch-up eligibility."),
    /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement("label", { className: "tp-field" }, /*#__PURE__*/React.createElement("span", null, "Plan"),
        /*#__PURE__*/React.createElement("select", { className: "tp-txt", value: P.planType || "none", onChange: e => setP("planType", e.target.value) },
          /*#__PURE__*/React.createElement("option", { value: "none" }, "No plan"),
          options.map(o => /*#__PURE__*/React.createElement("option", { key: o.id, value: o.id }, o.name)))),
      /*#__PURE__*/React.createElement(Field, { label: "Age (catch-up eligibility)", value: P.age, onChange: v => setP("age", v) }),
      P.planType && P.planType !== "none" && /*#__PURE__*/React.createElement("label", { className: "tp-field" }, /*#__PURE__*/React.createElement("span", null, "Employer contribution"),
        /*#__PURE__*/React.createElement("select", { className: "tp-txt", value: P.employerMode || "auto", onChange: e => setP("employerMode", e.target.value) },
          /*#__PURE__*/React.createElement("option", { value: "auto" }, "Auto — engine-calculated maximum"),
          /*#__PURE__*/React.createElement("option", { value: "manual" }, "Manual")))),
    P.planType && P.planType !== "none" && /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement(Field, { label: "Employee elective deferral", value: P.employeeDeferral, onChange: v => setP("employeeDeferral", v) }),
      P.employerMode === "manual" && /*#__PURE__*/React.createElement(Field, { label: "Employer contribution (manual)", value: P.employerManual, onChange: v => setP("employerManual", v) })),
    result.selectedPlan && /*#__PURE__*/React.createElement("div", { className: "tp-editor-total" }, /*#__PURE__*/React.createElement("span", null, "Deductible contribution — ", result.selectedPlan.name), /*#__PURE__*/React.createElement("strong", null, usd$(result.retirementDeduction))),

    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Health savings account"),
    /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement("label", { className: "tp-field" }, /*#__PURE__*/React.createElement("span", null, "Contribution"),
        /*#__PURE__*/React.createElement("select", { className: "tp-txt", value: P.hsaMode || "off", onChange: e => setP("hsaMode", e.target.value) },
          /*#__PURE__*/React.createElement("option", { value: "off" }, "None"),
          /*#__PURE__*/React.createElement("option", { value: "max" }, "Max — engine-calculated limit"),
          /*#__PURE__*/React.createElement("option", { value: "manual" }, "Manual"))),
      /*#__PURE__*/React.createElement("label", { className: "tp-field" }, /*#__PURE__*/React.createElement("span", null, "Coverage"),
        /*#__PURE__*/React.createElement("select", { className: "tp-txt", value: P.hsaCoverage || "self", onChange: e => setP("hsaCoverage", e.target.value) },
          /*#__PURE__*/React.createElement("option", { value: "self" }, "Self-only"),
          /*#__PURE__*/React.createElement("option", { value: "family" }, "Family"))),
      P.hsaMode === "manual" && /*#__PURE__*/React.createElement(Field, { label: "Contribution (manual)", value: P.hsaManual, onChange: v => setP("hsaManual", v) })),
    result.hsa > 0 && /*#__PURE__*/React.createElement("div", { className: "tp-editor-total" }, /*#__PURE__*/React.createElement("span", null, "HSA deduction"), /*#__PURE__*/React.createElement("strong", null, usd$(result.hsa))),

    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Self-employed health insurance — IRC §162(l)"),
    /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement(Field, { label: "Annual medical premiums", value: H.medicalPremiums, onChange: v => setH("medicalPremiums", v) })),
    result.sehiDeduction > 0 && /*#__PURE__*/React.createElement("div", { className: "tp-editor-total" }, /*#__PURE__*/React.createElement("span", null, "SEHI deduction"), /*#__PURE__*/React.createElement("strong", null, usd$(result.sehiDeduction))),

    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Traditional IRA"),
    /*#__PURE__*/React.createElement("div", { className: "tp-inline", style: { marginBottom: 10 } },
      /*#__PURE__*/React.createElement("label", { className: "tp-check" }, /*#__PURE__*/React.createElement("input", { type: "checkbox", checked: !!I.enabled, onChange: e => setI("enabled", e.target.checked) }), " Contribution made")),
    I.enabled && /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement(Field, { label: "Contribution", value: I.contribution, onChange: v => setI("contribution", v) }),
      /*#__PURE__*/React.createElement("label", { className: "tp-field" }, /*#__PURE__*/React.createElement("span", null, "Employer plan coverage"),
        /*#__PURE__*/React.createElement("select", { className: "tp-txt", value: I.coverage || "none", onChange: e => setI("coverage", e.target.value) },
          /*#__PURE__*/React.createElement("option", { value: "none" }, "Not covered"),
          /*#__PURE__*/React.createElement("option", { value: "self" }, "Covered"),
          /*#__PURE__*/React.createElement("option", { value: "spouse" }, "Spouse covered")))),
    I.enabled && result.iraDeduction != null && /*#__PURE__*/React.createElement("div", { className: "tp-editor-total" }, /*#__PURE__*/React.createElement("span", null, "IRA deduction"), /*#__PURE__*/React.createElement("strong", null, usd$(result.iraDeduction))));
}

/* ============================================================================
   ESTIMATED TAXES — federal quarterly-payment calculator, IRC §6654 / Form
   1040-ES. Scenario-aware: switching scenarios recalculates every figure
   from that scenario's own projected tax, withholding and payments. Uses
   the versioned C.estimatedTax constants — no threshold, percentage or due
   date is hard-coded in this component. Equal-installment method only; the
   annualized-income method (Form 2210 Schedule AI) is explicitly flagged as
   unsupported rather than silently assumed away. ---- */
function EstimatedTaxEditor({ scenario, update, result, status, year }) {
  const C = TY[year];
  const schedule = scenario.estimatedPaymentSchedule || [];
  // Single field write — the flat estimatedPayments total is DERIVED from
  // this schedule inside the engine (03-scenario.js), never written here.
  const setSchedule = items => update("estimatedPaymentSchedule", items);
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const est = computeEstimatedTax({
    currentYearTax: result.totalTax,
    priorYearTax: num(scenario.priorYearTax) || null,
    priorYearAGI: scenario.priorYearAGI,
    status, C,
    withholding: num(scenario.withholding),
    paymentsMade: schedule,
    asOfDate: asOf
  });
  return /*#__PURE__*/React.createElement("div", { className: "tp-stack" },
    /*#__PURE__*/React.createElement(Note, null, "Federal only. Required annual payment is the lesser of 90% of this scenario's current-year projected tax or the applicable prior-year safe harbor — IRC §6654(d); Form 1040-ES. Standard equal-installment method only."),
    /*#__PURE__*/React.createElement("div", { className: "tp-grid3" },
      /*#__PURE__*/React.createElement(Field, { label: "Prior-year total tax", hint: "optional — enables the prior-year safe harbor", value: scenario.priorYearTax, onChange: v => update("priorYearTax", v) }),
      /*#__PURE__*/React.createElement(Field, { label: "Prior-year AGI", hint: "determines the 100%/110% threshold", value: scenario.priorYearAGI, onChange: v => update("priorYearAGI", v) }),
      /*#__PURE__*/React.createElement(Field, { label: "As-of date", value: asOf, onChange: setAsOf })),
    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Source figures — from this scenario"),
    /*#__PURE__*/React.createElement("table", { className: "tp-tbl" }, /*#__PURE__*/React.createElement("tbody", null,
      /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Current-year projected total tax"), /*#__PURE__*/React.createElement("td", { className: "num" }, usd$(result.totalTax))),
      /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Federal withholding already applied"), /*#__PURE__*/React.createElement("td", { className: "num" }, usd$(num(scenario.withholding)))))),
    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Required annual payment"),
    /*#__PURE__*/React.createElement("table", { className: "tp-tbl" }, /*#__PURE__*/React.createElement("tbody", null,
      est.candidates.map((c, i) => /*#__PURE__*/React.createElement("tr", { key: i, className: c.method === est.controllingMethod ? "tot" : "" },
        /*#__PURE__*/React.createElement("td", null, c.label, c.method === est.controllingMethod && /*#__PURE__*/React.createElement("span", { className: "tp-tag green" }, "Controls")),
        /*#__PURE__*/React.createElement("td", { className: "num" }, usd$(c.amount)))))),
    /*#__PURE__*/React.createElement("div", { className: "tp-editor-total" }, /*#__PURE__*/React.createElement("span", null, "Required annual payment (lesser of the above)"), /*#__PURE__*/React.createElement("strong", null, usd$(est.requiredAnnualPayment))),
    est.warnings.map((w, i) => /*#__PURE__*/React.createElement(Note, { key: i, kind: "warn" }, w)),

    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Estimated payments already made"),
    /*#__PURE__*/React.createElement(LineList, {
      items: schedule.map(p => ({ id: p.id, label: p.date || "", amount: p.amount })),
      onChange: items => setSchedule(items.map(p => ({ id: p.id, date: p.label, amount: p.amount }))),
      ph: "Payment date (YYYY-MM-DD)"
    }),
    /*#__PURE__*/React.createElement(Note, null, "Payment dates are matched to the nearest quarterly installment below. Withholding is treated as paid evenly through the year regardless of when it was actually withheld — the standard §6654 rule."),

    /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, "Quarterly installments"),
    /*#__PURE__*/React.createElement("table", { className: "tp-tbl" },
      /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Due"), /*#__PURE__*/React.createElement("th", { className: "num" }, "Cumulative required"), /*#__PURE__*/React.createElement("th", { className: "num" }, "Cumulative applied"), /*#__PURE__*/React.createElement("th", { className: "num" }, "Shortfall"), /*#__PURE__*/React.createElement("th", null, "Status"))),
      /*#__PURE__*/React.createElement("tbody", null, est.installments.map(inst => /*#__PURE__*/React.createElement("tr", { key: inst.due, className: inst.status === "shortfall" ? "warn" : "" },
        /*#__PURE__*/React.createElement("td", null, inst.due),
        /*#__PURE__*/React.createElement("td", { className: "num" }, usd$(inst.cumulativeRequired)),
        /*#__PURE__*/React.createElement("td", { className: "num" }, usd$(inst.cumulativeApplied)),
        /*#__PURE__*/React.createElement("td", { className: "num" }, inst.shortfall == null ? "—" : usd$(inst.shortfall)),
        /*#__PURE__*/React.createElement("td", null, inst.status === "met" ? "Met" : inst.status === "shortfall" ? "Shortfall" : "Upcoming — " + usd$(est.perRemainingInstallment) + " recommended"))))),

    /*#__PURE__*/React.createElement("div", { className: "tp-editor-total " + (est.meetsSafeHarbor ? "" : "warn") },
      /*#__PURE__*/React.createElement("span", null, est.meetsSafeHarbor ? "Meets the estimated-tax safe harbor" : "Remaining required payment"),
      /*#__PURE__*/React.createElement("strong", null, est.meetsSafeHarbor ? "Yes" : usd$(est.remainingRequired))),
    /*#__PURE__*/React.createElement("div", { className: "tp-editor-total" }, /*#__PURE__*/React.createElement("span", null, "Projected balance due at filing (refund if negative)"), /*#__PURE__*/React.createElement("strong", null, usd$(est.projectedBalance))));
}

/* ============================================================================
   STRATEGY SCENARIO LIBRARY — curated planning strategies drawn from the
   HNWI Tax Planning Guide and CCH reference material (the same source set
   behind the standalone 1040 Planner's library). Each entry clones the
   active scenario and mutates concrete fields the TY2026 engine already
   computes; nothing here is decorative. "Model scenario" runs the standard
   clone -> apply -> recalc -> add-to-list path (10-app.js modelStrategy),
   so a modeled strategy is immediately a first-class scenario: it appears
   in the scenario list, is available for Add Compare, and never touches the
   baseline it was cloned from.
   ========================================================================== */
const STRATEGY_CATEGORIES = ["Retirement & Deferral", "Charitable Giving", "Capital Gains Timing", "Business & Entity", "Other Planning"];
function trackStrategy(s, title, key, amount, note) {
  s.appliedStrategies = (s.appliedStrategies || []).concat([{ id: uid(), title, key, amount: num(amount), note }]);
  return s;
}
const STRATEGY_LIBRARY = [
  /* ---- Retirement & Deferral ---------------------------------------- */
  {
    key: "maxSolo401k", category: "Retirement & Deferral", title: "Max Solo 401(k) contribution",
    summary: "Combine the employee elective deferral with an automatic employer profit-share — roughly $70,000 of total capacity for 2026. Reduces AGI, and thereby the QBI threshold, NIIT and safe-harbor exposure.",
    authority: "IRC §401(k); §415(c)", source: "HNWI Strategies Guide §4.1",
    defaultAmount: 24500, amountLabel: "Employee elective deferral",
    apply: (s, amount) => {
      s.planning = { ...s.planning, planType: "solo401k", employerMode: "auto", employeeDeferral: num(amount) };
      return trackStrategy(s, "Solo 401(k) maximum contribution", "maxSolo401k", amount,
        "Employee deferral plus an automatic employer profit share. The engine caps both at the 2026 statutory limits and deducts above the line.");
    }
  },
  {
    key: "sepIraMax", category: "Retirement & Deferral", title: "SEP-IRA contribution (up to 25% of compensation)",
    summary: "Simpler to administer than a Solo 401(k); an employer-only contribution up to 25% of compensation (net of the deduction, ~20% effective) reduces AGI dollar for dollar.",
    authority: "IRC §408(k); §404(h)(1)(C)", source: "HNWI Strategies Guide §4.1",
    noAmount: true, amountLabel: "Employer contribution — calculated automatically",
    apply: s => {
      s.planning = { ...s.planning, planType: "sep", employerMode: "auto" };
      return trackStrategy(s, "SEP-IRA election", "sepIraMax", 0,
        "Employer-only contribution, engine-calculated at 20% of net self-employment earnings after half the SE tax, capped at the 2026 limit.");
    }
  },
  {
    key: "hsaMax", category: "Retirement & Deferral", title: "Max family HSA contribution",
    summary: "Triple tax advantage: deductible going in, tax-free growth, tax-free qualified withdrawals — an underutilized, bracket-independent saver.",
    authority: "IRC §223", source: "HNWI Strategies Guide",
    noAmount: true, amountLabel: "Contribution — the 2026 family maximum",
    apply: s => {
      s.planning = { ...s.planning, hsaMode: "max", hsaCoverage: "family" };
      return trackStrategy(s, "HSA family maximum contribution", "hsaMax", 0,
        "Requires HDHP coverage. The engine applies the 2026 family limit (plus the 55+ catch-up, by age) and deducts above the line.");
    }
  },
  {
    key: "rothConversion", category: "Retirement & Deferral", title: "Roth conversion (bracket fill)",
    summary: "Pay tax now for tax-free growth, no lifetime RMDs, and tax-free qualified distributions to heirs. Convert in lower-income years and test the amount against the marginal bracket.",
    authority: "IRC §408A(d)(3)", source: "Roth IRA letter · HNWI Guide §4.1",
    defaultAmount: 100000, amountLabel: "Amount converted",
    apply: (s, amount) => {
      s.rothConversion = num(s.rothConversion) + num(amount);
      return trackStrategy(s, "Roth conversion", "rothConversion", amount,
        "Converted amount is ordinary income this year; future qualified distributions are tax-free (5-year rule, age 59½). Watch bracket creep, NIIT MAGI and Medicare premium thresholds.");
    }
  },
  {
    key: "qcd", category: "Retirement & Deferral", title: "Qualified charitable distribution (age 70½+)",
    summary: "Direct IRA-to-charity transfer excluded from income entirely — better than a deduction because it never raises AGI, protecting NIIT, Social Security taxability and the 0.5% charitable floor.",
    authority: "IRC §408(d)(8)", source: "HNWI Strategies Guide §4.2",
    defaultAmount: 50000, amountLabel: "QCD amount",
    apply: (s, amount) => {
      s.iraDistributions = Math.max(0, num(s.iraDistributions) - num(amount));
      return trackStrategy(s, "Qualified charitable distribution", "qcd", amount,
        "Modeled as a reduction of taxable IRA distributions (the transfer goes directly to charity). Requires age 70½+; can satisfy an RMD.");
    }
  },
  {
    key: "nqdcDeferral", category: "Retirement & Deferral", title: "Nonqualified deferred compensation",
    summary: "Defer W-2 income into a future, lower-bracket year. Modeled as a reduction of current Box 1 wages (FICA timing and the §409A election mechanics are not modeled).",
    authority: "IRC §409A", source: "HNWI Strategies Guide §4.6",
    defaultAmount: 50000, amountLabel: "Amount deferred",
    apply: (s, amount) => {
      s.w2Wages = Math.max(0, num(s.w2Wages) - num(amount));
      return trackStrategy(s, "NQDC income deferral", "nqdcDeferral", amount,
        "Box 1 wages reduced by the deferred amount (estimate — FICA timing and §409A election mechanics not modeled).");
    }
  },
  /* ---- Charitable Giving --------------------------------------------- */
  {
    key: "dafBunching", category: "Charitable Giving", title: "Charitable bunching via donor-advised fund",
    summary: "Bunch several years of gifts into one year through a DAF to clear the standard deduction and the new 0.5%-of-AGI charitable floor, then grant to charities over time.",
    authority: "IRC §170(b); §170(f)(18)", source: "HNWI Strategies Guide §4.2",
    defaultAmount: 50000, amountLabel: "Additional cash gifts",
    apply: (s, amount) => {
      s.scheduleA = { ...s.scheduleA, charityCash: num(s.scheduleA.charityCash) + num(amount) };
      return trackStrategy(s, "DAF charitable bunching", "dafBunching", amount,
        "Multiple years of planned giving contributed to a donor-advised fund this year; the engine applies the 60% AGI ceiling and the 0.5% AGI floor.");
    }
  },
  {
    key: "appreciatedStock", category: "Charitable Giving", title: "Donate appreciated securities instead of cash",
    summary: "Gifting appreciated long-term stock avoids capital-gains tax on the embedded gain while still deducting full fair market value (30% AGI ceiling).",
    authority: "IRC §170(b)(1)(C); §1(h)", source: "CCH Capital Gains · HNWI Guide §4.2",
    defaultAmount: 25000, amountLabel: "FMV donated",
    apply: (s, amount) => {
      s.scheduleA = { ...s.scheduleA, charityNonCash: num(s.scheduleA.charityNonCash) + num(amount) };
      s.longTermGains = num(s.longTermGains) - num(amount);
      return trackStrategy(s, "Appreciated securities donation", "appreciatedStock", amount,
        "Assumes the donation replaces a planned sale with embedded gain ≈ FMV — modeled as a non-cash gift plus an offsetting reduction in long-term gains.");
    }
  },
  /* ---- Capital Gains Timing ------------------------------------------ */
  {
    key: "taxLossHarvest", category: "Capital Gains Timing", title: "Tax-loss harvesting",
    summary: "Sell underperformers to offset realized gains, coordinating with rebalancing to avoid the wash-sale rule (no repurchase of a substantially identical security within 61 days, including in an IRA).",
    authority: "IRC §1211(b); §1091", source: "CCH Capital Gains §9050 · HNWI Guide §4.4",
    defaultAmount: 50000, amountLabel: "Losses realized",
    apply: (s, amount) => {
      s.longTermGains = num(s.longTermGains) - num(amount);
      return trackStrategy(s, "Tax-loss harvesting", "taxLossHarvest", amount,
        "Offsets realized gains dollar for dollar. Observe the 61-day wash-sale window — Rev. Rul. 2008-5.");
    }
  },
  {
    key: "gainHarvest", category: "Capital Gains Timing", title: "Capital-gain harvesting at the breakpoints",
    summary: "Realize long-term gains deliberately while taxable income sits below the 0%/15% breakpoints, then re-establish basis.",
    authority: "IRC §1(h); Rev. Proc. 2025-32 §2.03", source: "CCH Capital Gains §9010.25 · HNWI Guide §4.4",
    defaultAmount: 50000, amountLabel: "Gains realized",
    apply: (s, amount) => {
      s.longTermGains = num(s.longTermGains) + num(amount);
      return trackStrategy(s, "Capital-gain harvesting", "gainHarvest", amount,
        "Realizes additional LTCG at preferential rates and resets basis. Check the preferential-band detail on the tax computation line.");
    }
  },
  {
    key: "qofDeferral", category: "Capital Gains Timing", title: "Qualified Opportunity Fund deferral",
    summary: "Reinvest a realized gain into a QOF within 180 days to defer recognition; a 10-year hold can eliminate tax on the QOF's own appreciation.",
    authority: "IRC §1400Z-2", source: "CCH Capital Gains §9080 · HNWI Guide §4.4",
    defaultAmount: 100000, amountLabel: "Gain deferred",
    apply: (s, amount) => {
      s.longTermGains = num(s.longTermGains) - num(amount);
      return trackStrategy(s, "QOF gain deferral", "qofDeferral", amount,
        "180-day reinvestment window from the sale (Form 8997). Deferred gain is recognized later — model the recognition year separately.");
    }
  },
  {
    key: "qsbsExclusion", category: "Capital Gains Timing", title: "QSBS §1202 gain exclusion",
    summary: "Gain on qualified small-business C-corp stock held over five years can be excluded up to the greater of $10M or 10× basis.",
    authority: "IRC §1202; §1045 rollover", source: "CCH Capital Gains §9060 · HNWI Guide §3.2",
    defaultAmount: 250000, amountLabel: "Gain excluded",
    apply: (s, amount) => {
      s.longTermGains = num(s.longTermGains) - num(amount);
      return trackStrategy(s, "QSBS §1202 exclusion", "qsbsExclusion", amount,
        "Requires original-issue C-corp stock, the $50M gross-asset test, the active-business test and a 5+ year hold (§1045 rollover if under 5 years).");
    }
  },
  {
    key: "installmentSale", category: "Capital Gains Timing", title: "Installment sale spread",
    summary: "Spread a large gain over the collection years to stay under the 20% breakpoint and the NIIT threshold in any single year.",
    authority: "IRC §453", source: "HNWI Strategies Guide §4.4",
    defaultAmount: 150000, amountLabel: "Gain deferred to later years",
    apply: (s, amount) => {
      s.longTermGains = num(s.longTermGains) - num(amount);
      return trackStrategy(s, "Installment sale", "installmentSale", amount,
        "Only the current-year installment remains in this projection; depreciation recapture can't be deferred under §453(i).");
    }
  },
  /* ---- Business & Entity ---------------------------------------------- */
  {
    key: "scorpElection", category: "Business & Entity", title: "S-corp election with reasonable compensation",
    summary: "Check-the-box entity classification (Form 8832 / §1362 election) recasts the largest Schedule C business as an S corporation: pay a reasonable salary (W-2, FICA-taxed) and take the remaining profit as a K-1 distribution that avoids SE tax while remaining QBI-eligible.",
    authority: "Reg. §301.7701-3; IRC §1362; §1402", source: "Entity Classification (CCH) · HNWI Guide (S-corp strategies)",
    defaultAmount: 100000, amountLabel: "Reasonable salary", estimated: true,
    apply: (s, amount) => {
      const list = s.schedC.businesses || [];
      if (!list.length) return trackStrategy(s, "S-corp election (no Schedule C business entered)", "scorpElection", amount, "Tracking only — enter a business first.");
      const business = list.reduce((best, b) => !best || businessNet(b) > businessNet(best) ? b : best, null);
      const net = businessNet(business);
      const salary = Math.min(num(amount), Math.max(net, 0));
      s.schedC = { ...s.schedC, businesses: list.filter(b => b.id !== business.id) };
      s.sCorps = {
        entities: (s.sCorps.entities || []).concat([{
          id: uid(), name: business.name || "S corporation", profitBeforeComp: net, ownerComp: salary,
          otherExpenses: 0, nonOwnerW2: num(business.w2wages), ubia: num(business.ubia), ownershipPct: 100,
          sstb: false, active: true
        }])
      };
      return trackStrategy(s, "S-corp election — reasonable compensation", "scorpElection", salary,
        "ESTIMATE: Schedule C profit re-cast as an S-corp entity — W-2 salary plus a derived K-1 (no SE tax; still QBI-eligible). Salary must be defensible against IRS reasonable-compensation factors — §1362 audits target it most.");
    }
  },
  /* ---- Other Planning -------------------------------------------------- */
  {
    key: "muniShift", category: "Other Planning", title: "Shift taxable interest into municipal bonds",
    summary: "Move fixed-income yield into munis: interest becomes federally tax-exempt, though it still counts in MAGI for NIIT and Social Security taxability testing.",
    authority: "IRC §103; §86(b)(2)", source: "HNWI Strategies Guide §4.4",
    defaultAmount: 15000, amountLabel: "Interest shifted",
    apply: (s, amount) => {
      s.taxableInterest = Math.max(0, num(s.taxableInterest) - num(amount));
      s.taxExemptInterest = num(s.taxExemptInterest) + num(amount);
      return trackStrategy(s, "Municipal bond reallocation", "muniShift", amount,
        "Taxable interest replaced with tax-exempt interest at the same yield (before any muni-yield discount). A private-activity bond could be an AMT preference — not modeled.");
    }
  },
  {
    key: "disasterCasualty", category: "Other Planning", title: "Federally-declared disaster casualty loss",
    summary: "Personal casualty losses are deductible only if attributable to a federally declared disaster, after a $100 floor and a 10%-of-AGI haircut.",
    authority: "IRC §165(h); Form 4684", source: "CCH Casualty Losses §39,010–39,040",
    defaultAmount: 50000, amountLabel: "Unreimbursed loss", estimated: true,
    apply: (s, amount, ctx) => {
      const agi = ctx && ctx.status && ctx.year ? computeScenario(s, ctx.status, ctx.year).agi : 0;
      const deductible = Math.max(0, num(amount) - 100 - Math.round(agi * 0.10));
      s.scheduleA = { ...s.scheduleA, other: (s.scheduleA.other || []).concat([{ id: uid(), label: "Disaster casualty loss (net of floors)", amount: deductible }]) };
      return trackStrategy(s, "Disaster casualty loss", "disasterCasualty", deductible,
        "Gross loss " + usd(num(amount)) + " less the $100 floor and 10% of AGI (" + usd(agi) + ") = " + usd(deductible) +
        " added to other itemized deductions. Deductible only for a federally declared disaster.");
    }
  },
  {
    key: "frontLoad529", category: "Other Planning", title: "529 plan five-year front-load",
    summary: "Pre-fund education with five years of annual-exclusion gifts at once — no federal deduction, so no change to this projection, but tax-free growth and wealth moved out of the estate.",
    authority: "IRC §529; §2503(b) exclusion", source: "HNWI Strategies Guide §4.3",
    defaultAmount: 90000, amountLabel: "Amount contributed",
    apply: (s, amount) => trackStrategy(s, "529 five-year front-load", "frontLoad529", amount,
      "Tracking only — no federal income-tax deduction. Five-year gift-tax averaging election on Form 709; some states allow a state deduction.")
  }
];
function StrategyCard({ strategy, onModel }) {
  const [amount, setAmount] = useState(strategy.defaultAmount || 0);
  return /*#__PURE__*/React.createElement("div", { className: "tp-biz tp-strategy-card" },
    /*#__PURE__*/React.createElement("div", { className: "tp-biz-head" },
      /*#__PURE__*/React.createElement("strong", null, strategy.title),
      strategy.estimated && /*#__PURE__*/React.createElement("span", { className: "tp-tag amber" }, "Estimated")),
    /*#__PURE__*/React.createElement("div", { className: "tp-strategy-cite" }, strategy.authority, " · ", strategy.source),
    /*#__PURE__*/React.createElement("p", { className: "tp-hint" }, strategy.summary),
    strategy.noAmount
      ? /*#__PURE__*/React.createElement("div", { className: "tp-subline" }, /*#__PURE__*/React.createElement("span", null, strategy.amountLabel))
      : /*#__PURE__*/React.createElement(Field, { label: strategy.amountLabel, value: amount, onChange: setAmount }),
    /*#__PURE__*/React.createElement("button", { className: "tp-btn solid sm", type: "button", onClick: () => onModel(strategy.key, amount) }, "Model scenario"));
}
function StrategyLibraryModal({ status, year, onModel, onClose }) {
  useEffect(() => {
    const k = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return /*#__PURE__*/React.createElement("div", { className: "tp-overlay", onMouseDown: e => e.target === e.currentTarget && onClose() },
    /*#__PURE__*/React.createElement("div", { className: "tp-modal tp-modal-wide" },
      /*#__PURE__*/React.createElement("div", { className: "tp-modal-head" },
        /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", { className: "tp-eyebrow" }, "Strategy Scenario Library"), /*#__PURE__*/React.createElement("h3", null, STRATEGY_LIBRARY.length + " strategies from the planning reference guides")),
        /*#__PURE__*/React.createElement("button", { className: "tp-modal-x", onClick: onClose }, I.x)),
      /*#__PURE__*/React.createElement("div", { className: "tp-modal-body" },
        /*#__PURE__*/React.createElement(Note, null, "Selecting “Model scenario” clones the active scenario, applies this strategy's real input changes, recalculates through the same engine as every other scenario, and adds the result to the scenario list — available immediately for Add Compare. The baseline is never modified."),
        STRATEGY_CATEGORIES.map(cat => {
          const items = STRATEGY_LIBRARY.filter(s => s.category === cat);
          if (!items.length) return null;
          return /*#__PURE__*/React.createElement(React.Fragment, { key: cat },
            /*#__PURE__*/React.createElement("div", { className: "tp-minihead" }, cat),
            /*#__PURE__*/React.createElement("div", { className: "tp-strategy-grid" }, items.map(s => /*#__PURE__*/React.createElement(StrategyCard, { key: s.key, strategy: s, onModel: onModel }))));
        })),
      /*#__PURE__*/React.createElement("div", { className: "tp-modal-foot" }, /*#__PURE__*/React.createElement("button", { className: "tp-btn ghost sm", onClick: onClose }, "Close"))));
}

/* ============================================================================
   SCENARIO AI PANEL — expands beneath the scenario cards. Inline mode for
   quick questions; drawer mode for longer analysis. Read-only: it can never
   change inputs; proposals route through the AI Analysis workspace.
   ========================================================================== */
const SCENARIO_AI_PROMPTS = [
  ["Explain this scenario", "Explain this scenario: walk through what drives total income, the deduction path, the QBI result, employment taxes and surtaxes, and the after-tax economics."],
  ["Compare to base", "Compare this scenario to the base scenario. What drives the differences in total modeled tax, after-tax economic income and spendable cash? Are the two economically comparable?"],
  ["Compare to client goals", "Compare this scenario against the client's stated goals and constraints in the data package. Which goals does it advance, which does it set back, and which constraints bind? Do not treat the lowest-tax outcome as automatically best."],
  ["Identify opportunities", "Identify planning opportunities relevant to this scenario's facts. Classify each as permanent reduction, deferral, timing, or character conversion, and list the facts to confirm."],
  ["Review calculation logic", "Review the calculation results for internal consistency: deduction election, QBI limitation, NIIT base, payroll reconciliation, and the economic-income tie-out. Flag anything that looks inconsistent."],
  ["Identify missing facts", "What facts are missing from this model that would materially change the analysis? List them as specific questions for the client."],
  ["Reconcile after-tax cash", "Reconcile economic income down to spendable after-tax cash for this scenario, explaining each outflow."]
];
function ScenarioAIPanel({ entry, client, baseline, status, year, onClose, onOpenWorkspace }) {
  const topGoal = client && (client.goals || []).slice().sort((a, b) => a.priority - b.priority)[0];
  const [mode, setMode] = useState("inline"); // inline | drawer
  const [q, setQ] = useState("");
  const [resp, setResp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const abortRef = useRef(null);
  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
  }, []);
  const run = async question => {
    if (!question || busy) return;
    setBusy(true);
    setErr("");
    setResp("");
    const wantsBase = /base|compare/i.test(question);
    const entries = wantsBase && baseline && baseline.s.id !== entry.s.id ? [baseline, entry] : [entry];
    const pack = buildAIDataPackage({
      requestType: "scenario-panel",
      entries,
      status,
      year,
      includeCalcs: true,
      includeWarnings: true
    });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const text = await callAI("analyze", {
        system: AI_SYSTEM_CORE + "\nDATA PACKAGE (authoritative figures):\n" + JSON.stringify(pack) + "\nAnswer concisely for an advisor reviewing the scenario card \"" + entry.s.name + "\". Do not propose input changes here; direct structural proposals to the AI Analysis workspace.",
        messages: [{
          role: "user",
          content: question
        }],
        signal: ctrl.signal
      });
      setResp(text || "(empty response)");
    } catch (e) {
      if (e.name !== "AbortError") setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };
  const body = EL("div", {
    className: "tp-scai-body" + (mode === "drawer" ? " tall" : "")
  }, EL("div", {
    className: "tp-scai-quick"
  }, SCENARIO_AI_PROMPTS.map(p => EL("button", {
    key: p[0],
    type: "button",
    className: "tp-mini",
    disabled: busy,
    onClick: () => {
      setQ(p[1]);
      run(p[1]);
    }
  }, p[0])), EL("button", {
    type: "button",
    className: "tp-mini",
    onClick: () => onOpenWorkspace("Optimize this scenario: propose input changes for deterministic recalculation.")
  }, "Optimize this scenario")), err && EL("div", {
    className: "tp-chat-error"
  }, err), (busy || resp) && EL("div", {
    className: "tp-scai-resp",
    "aria-live": "polite"
  }, busy && !resp ? "Analyzing " + entry.s.name + "…" : resp), EL("div", {
    className: "tp-scai-inputrow"
  }, EL("textarea", {
    value: q,
    rows: 2,
    placeholder: "Ask about this scenario… (Enter to send, Shift+Enter for a new line)",
    onChange: e => setQ(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        run(q);
      }
    }
  }), EL("button", {
    className: "tp-btn solid sm",
    type: "button",
    disabled: busy || !q.trim(),
    onClick: () => run(q)
  }, busy ? "Working…" : "Send")), EL("div", {
    className: "tp-ai-governance-inline"
  }, "AI explains and proposes; the engine computes every stored figure. Nothing here modifies inputs."));
  const head = EL("div", {
    className: "tp-scai-head"
  }, EL("strong", null, "AI analysis — ", entry.s.name), EL("em", {
    className: "tp-scai-ctx"
  }, "Context: ", client ? client.name + " · " : "", TY[year].label, " · ", STATUSES.find(s => s.v === status).l, entry.s.aiGenerated ? " · AI-proposed scenario" : "", topGoal ? " · Primary objective: " + topGoal.label : ""), EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => setMode(mode === "drawer" ? "inline" : "drawer")
  }, mode === "drawer" ? "Inline view" : "Open as drawer"), EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => {
      onClose();
      onOpenWorkspace(null);
    }
  }, "Full AI workspace"), EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: onClose,
    "aria-label": "Close AI panel"
  }, "Close"));
  if (mode === "drawer") return EL(Drawer, {
    title: "AI analysis — " + entry.s.name,
    sub: TY[year].label + " · " + STATUSES.find(s => s.v === status).l + " · the engine stays authoritative",
    width: "min(480px, 100vw)",
    onClose: () => setMode("inline")
  }, body);
  return EL("div", {
    className: "tp-scai"
  }, head, body);
}

/* Transparent per-card goal alignment: percentage plus the scored rows */
function GoalAlignmentBlock({ al }) {
  const [open, setOpen] = useState(false);
  return EL("div", {
    className: "tp-goalalign"
  }, EL("button", {
    type: "button",
    className: "tp-goalalign-head",
    onClick: () => setOpen(o => !o),
    "aria-expanded": open
  }, EL("span", {
    className: "tp-sec-chev" + (open ? " open" : "")
  }, I.chevR), "Goal alignment: ", EL("strong", {
    className: al.pct >= 80 ? "up" : al.pct >= 50 ? "" : "down"
  }, al.pct + "%")), open && EL("div", {
    className: "tp-goalalign-rows"
  }, al.rows.map((row, i) => EL("div", {
    key: i,
    className: "tp-vrow",
    title: row.detail
  }, EL("span", null, row.label), EL("strong", {
    className: row.status === "strong" || row.status === "met" ? "up" : row.status === "at-risk" ? "down" : ""
  }, row.status === "strong" ? "Strong" : row.status === "met" ? "Met" : row.status === "moderate" ? "Moderate" : row.status === "at-risk" ? "At risk" : "Review")))));
}
