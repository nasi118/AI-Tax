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
