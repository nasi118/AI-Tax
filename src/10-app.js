/* ==== 10-app ==== */
/* ============================================================================
   REPORT GENERATOR
   ========================================================================== */
function ReportPage({
  results,
  bestId,
  baseline,
  status,
  year,
  notes,
  auditLog
}) {
  const [client, setClient] = useState("");
  const [preparer, setPreparer] = useState("");
  const [firm, setFirm] = useState("");
  const [focusId, setFocusId] = useState(bestId);
  const [msg, setMsg] = useState("");
  const ref = useRef(null);
  const focus = results.find(x => x.s.id === focusId) || results[0];
  const A = focus.r;
  const {
    findings
  } = useMemo(() => analyzeScenario(focus.s, status, year), [focus.s, status, year]);
  const quantified = findings.filter(f => f.savings > 0);
  const flagged = findings.filter(f => !f.savings);
  const totalOpp = quantified.reduce((a, f) => a + f.savings, 0);
  const breakdown = taxTypeBreakdown(A);
  const inc = incomeAnalysis(A);
  const br = bracketFill(A.ordinaryTaxable, status, A.C);
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const statusLabel = STATUSES.find(s => s.v === status).l;
  const buildHTML = () => {
    const body = ref.current ? ref.current.innerHTML : "";
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + (client || "Tax Planning Report").replace(/</g, "") + " — Tax Planning Report</title><style>" + REPORT_CSS + "</style></head><body><div class=\"rp\">" + body + "</div></body></html>";
  };
  const flash = m => {
    setMsg(m);
    setTimeout(() => setMsg(""), 4000);
  };
  const doPrint = () => {
    try {
      const w = window.open("", "_blank");
      if (!w) {
        flash("Pop-up blocked. Use Download instead, then print from your browser.");
        return;
      }
      w.document.write(buildHTML());
      w.document.close();
      setTimeout(() => {
        w.focus();
        w.print();
      }, 400);
    } catch (e) {
      flash("Could not open a print window. Use Download instead.");
    }
  };
  const doDownload = () => {
    try {
      const blob = new Blob([buildHTML()], {
        type: "text/html"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (client || "Tax-Planning-Report").replace(/[^\w-]+/g, "_") + "_" + year + ".html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash("Downloaded. Open it and use Print → Save as PDF for a PDF.");
    } catch (e) {
      flash("Download blocked in this view. Try Print instead.");
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Report options"
  }, /*#__PURE__*/React.createElement("div", {
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
  })), /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Scenario to report"), /*#__PURE__*/React.createElement("select", {
    className: "tp-txt",
    value: focus.s.id,
    onChange: e => setFocusId(e.target.value)
  }, results.map(({
    s
  }) => /*#__PURE__*/React.createElement("option", {
    key: s.id,
    value: s.id
  }, s.name, s.id === bestId ? "  ★ lowest tax" : ""))))), /*#__PURE__*/React.createElement("div", {
    className: "tp-rp-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid",
    onClick: doPrint
  }, I.print, " Print or save as PDF"), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost",
    onClick: doDownload
  }, I.download, " Download HTML"), msg && /*#__PURE__*/React.createElement("span", {
    className: "tp-rp-msg"
  }, msg))), /*#__PURE__*/React.createElement("div", {
    className: "tp-rp-page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rp",
    ref: ref
  }, /*#__PURE__*/React.createElement("div", {
    className: "rp-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "rp-eyebrow"
  }, "Tax planning report · ", TY[year].label), /*#__PURE__*/React.createElement("h1", null, client || "Client tax planning report"), /*#__PURE__*/React.createElement("div", {
    className: "rp-sub"
  }, statusLabel, " · Scenario: ", focus.s.name)), /*#__PURE__*/React.createElement("div", {
    className: "rp-meta"
  }, /*#__PURE__*/React.createElement("div", null, today), preparer && /*#__PURE__*/React.createElement("div", null, "Prepared by ", preparer), firm && /*#__PURE__*/React.createElement("div", null, firm))), /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "Key figures"), /*#__PURE__*/React.createElement("div", {
    className: "rp-kpis"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Total income"), /*#__PURE__*/React.createElement("strong", null, usd$(A.grossIncome))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Adjusted gross income"), /*#__PURE__*/React.createElement("strong", null, usd$(A.agi))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, A.deductionKind, " deduction"), /*#__PURE__*/React.createElement("strong", null, usd$(A.deductionUsed))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "QBI deduction"), /*#__PURE__*/React.createElement("strong", null, usd$(A.qbi.deduction))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Taxable income"), /*#__PURE__*/React.createElement("strong", null, usd$(A.taxableIncome))), /*#__PURE__*/React.createElement("div", {
    className: "hi"
  }, /*#__PURE__*/React.createElement("span", null, "Total tax"), /*#__PURE__*/React.createElement("strong", null, usd$(A.totalTax))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Ordinary bracket"), /*#__PURE__*/React.createElement("strong", null, pct(A.marginal, 0))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Effective rate"), /*#__PURE__*/React.createElement("strong", null, pct(A.effectiveRate)))), /*#__PURE__*/React.createElement("p", {
    className: "rp-note"
  }, "Total tax combines federal income tax net of nonrefundable credits with employment taxes and the net investment income tax. The effective rate is measured against total income of ", usd$(A.grossIncome), ".")), /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "Income"), /*#__PURE__*/React.createElement("table", {
    className: "rp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Source"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Amount"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Share"), /*#__PURE__*/React.createElement("th", null, "Treatment"))), /*#__PURE__*/React.createElement("tbody", null, inc.bySource.map(x => /*#__PURE__*/React.createElement("tr", {
    key: x.label
  }, /*#__PURE__*/React.createElement("td", null, x.label), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(x.amount)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, pct(x.amount / Math.max(1, A.grossIncome))), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, x.note))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Total income"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(A.grossIncome)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, "100.0%"), /*#__PURE__*/React.createElement("td", null))))), /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "Deductions"), /*#__PURE__*/React.createElement("table", {
    className: "rp-tbl"
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", {
    className: "sec"
  }, /*#__PURE__*/React.createElement("td", {
    colSpan: 2
  }, "Above the line")), A.seDeduction > 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Deductible half of self-employment tax"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(A.seDeduction))), A.retirementDeduction > 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Self-employed retirement plan"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(A.retirementDeduction))), A.sehiDeduction > 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Self-employed health insurance"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(A.sehiDeduction))), A.hsa > 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Health savings account"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(A.hsa))), A.iraDeduction > 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "IRA deduction"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(A.iraDeduction))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Adjusted gross income"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(A.agi))), /*#__PURE__*/React.createElement("tr", {
    className: "sec"
  }, /*#__PURE__*/React.createElement("td", {
    colSpan: 2
  }, "Below the line")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, A.deductionKind, " deduction"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(A.deductionUsed))), A.sched1ATotal > 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Schedule 1-A additional deductions"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(A.sched1ATotal))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Qualified business income deduction"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(A.qbi.deduction))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Taxable income"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(A.taxableIncome))))), A.qbi.component > A.qbi.deduction + 1 && /*#__PURE__*/React.createElement("p", {
    className: "rp-note"
  }, "The §199A deduction is limited by the 20%-of-taxable-income cap, forfeiting ", usd$(A.qbi.component - A.qbi.deduction), ".")), /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "Analysis by type of tax"), /*#__PURE__*/React.createElement("table", {
    className: "rp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Tax"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Amount"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Share"), /*#__PURE__*/React.createElement("th", null, "Driver"))), /*#__PURE__*/React.createElement("tbody", null, breakdown.filter(b => b.amount > 0).map(b => /*#__PURE__*/React.createElement("tr", {
    key: b.key
  }, /*#__PURE__*/React.createElement("td", null, b.label), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(b.amount)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, pct(b.share)), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, b.note))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Total tax"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(A.totalTax)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, "100.0%"), /*#__PURE__*/React.createElement("td", null))))), results.length > 1 && /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "Scenario comparison"), /*#__PURE__*/React.createElement("table", {
    className: "rp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Scenario"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "AGI"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Taxable income"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Total tax"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Effective"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "vs. base"))), /*#__PURE__*/React.createElement("tbody", null, results.map(({
    s,
    r
  }, i) => {
    const d = baseline ? r.totalTax - baseline.r.totalTax : 0;
    return /*#__PURE__*/React.createElement("tr", {
      key: s.id,
      className: s.id === focus.s.id ? "hl" : ""
    }, /*#__PURE__*/React.createElement("td", null, s.name), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(r.agi)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(r.taxableIncome)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(r.totalTax)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, pct(r.effectiveRate)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, i === 0 ? "—" : (d < 0 ? "−" : "+") + usd$(Math.abs(d))));
  })))), /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "Opportunities identified"), !findings.length ? /*#__PURE__*/React.createElement("p", {
    className: "rp-note"
  }, "No further material opportunities were identified on these inputs.") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
    className: "rp-note",
    style: {
      marginTop: 0
    }
  }, quantified.length, " quantified ", quantified.length === 1 ? "opportunity" : "opportunities", " totalling approximately", " ", /*#__PURE__*/React.createElement("strong", null, usd$(totalOpp)), " of annual tax reduction, plus ", flagged.length, " ", flagged.length === 1 ? "item" : "items", " requiring review."), findings.map((f, i) => /*#__PURE__*/React.createElement("div", {
    key: f.id,
    className: "rp-find"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rp-find-h"
  }, /*#__PURE__*/React.createElement("span", null, f.savings > 0 ? i + 1 + ". " : "", f.title), /*#__PURE__*/React.createElement("span", {
    className: "rp-find-amt"
  }, f.savings > 0 ? usd$(f.savings) + "/yr" : "Review")), /*#__PURE__*/React.createElement("div", {
    className: "rp-find-b"
  }, f.why), /*#__PURE__*/React.createElement("div", {
    className: "rp-find-a"
  }, /*#__PURE__*/React.createElement("strong", null, "Action:"), " ", f.action), /*#__PURE__*/React.createElement("div", {
    className: "rp-find-r"
  }, f.cat, " · ", RISK[f.risk].label, " · ", f.ref))))), /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "Recommendations"), /*#__PURE__*/React.createElement("ol", {
    className: "rp-recs"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "Adopt ", focus.s.name, " as the planning baseline."), " It produces ", usd$(A.totalTax), " of total tax at a ", pct(A.effectiveRate), " effective rate."), quantified.slice(0, 4).map(f => /*#__PURE__*/React.createElement("li", {
    key: f.id
  }, /*#__PURE__*/React.createElement("strong", null, f.title, "."), " Estimated at ", usd$(f.savings), " of annual tax reduction. ", f.action)), flagged.length > 0 && /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "Review ", flagged.length, " unquantified ", flagged.length === 1 ? "item" : "items"), " (", [...new Set(flagged.map(f => f.cat))].join(", "), "). These turn on facts the model does not hold — eligibility, basis and documentation — and must be confirmed before they can be sized."), br.headroom !== Infinity && br.headroom > 10000 && /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "Roughly ", usd$(br.headroom), " of headroom remains in the ", pct(br.marginalRate, 0), " bracket."), " If income is expected to rise, recognising income now converts future higher-rate income into current lower-rate income. Check the Medicare and ACA thresholds first, since they usually bind before the bracket ceiling does."), totalOpp > 0 && /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "Combined opportunity is approximately ", usd$(totalOpp), " annually"), " before interaction effects. These strategies overlap: each deduction lowers taxable income and therefore the 20%-of-taxable-income §199A limitation, so implementing all of them yields less than the arithmetic sum. Model them together in a single scenario before committing."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "Confirm documentation before implementation."), " Higher-scrutiny positions — reasonable compensation, bonus depreciation, cost segregation, family wages — are sustained on contemporaneous records: compensation studies, GVWR and mileage logs, timesheets and written plans."))), notes && notes.length > 0 && /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "Working notes"), /*#__PURE__*/React.createElement("table", {
    className: "rp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 130
    }
  }, "Recorded"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 130
    }
  }, "Scenario"), /*#__PURE__*/React.createElement("th", null, "Note"))), /*#__PURE__*/React.createElement("tbody", null, notes.map(n => /*#__PURE__*/React.createElement("tr", {
    key: n.id
  }, /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, n.tsLabel), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, n.scenarioName || "All"), /*#__PURE__*/React.createElement("td", null, n.text)))))), auditLog && auditLog.length > 0 && /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "Audit trail"), /*#__PURE__*/React.createElement("p", {
    className: "rp-note",
    style: {
      marginTop: 0
    }
  }, auditLog.length, " change", auditLog.length === 1 ? "" : "s", " recorded during preparation, with a net movement in total tax of ", usd$(auditLog.reduce((a, e) => a + (e.delta || 0), 0)), ". The full detail, including values before and after each change, is on the Audit Trail sheet of the Excel export."), /*#__PURE__*/React.createElement("table", {
    className: "rp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 130
    }
  }, "Time"), /*#__PURE__*/React.createElement("th", null, "Scenario"), /*#__PURE__*/React.createElement("th", null, "Change"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Tax impact"), /*#__PURE__*/React.createElement("th", null, "Memo"))), /*#__PURE__*/React.createElement("tbody", null, auditLog.slice(-25).reverse().map(e => /*#__PURE__*/React.createElement("tr", {
    key: e.id
  }, /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, e.tsLabel), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, e.scenarioName), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, e.label, e.from !== "" || e.to !== "" ? ": " + (e.from === "" ? "—" : e.from) + " → " + (e.to === "" ? "—" : e.to) : ""), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, e.delta == null ? "—" : (e.delta > 0 ? "+" : "") + usd$(e.delta)), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, e.memo || ""))))), auditLog.length > 25 && /*#__PURE__*/React.createElement("p", {
    className: "rp-note"
  }, "Showing the most recent 25 of ", auditLog.length, " entries.")), /*#__PURE__*/React.createElement("section", {
    className: "rp-disc"
  }, /*#__PURE__*/React.createElement("h3", null, "Basis of analysis and disclaimer"), /*#__PURE__*/React.createElement("p", null, "This report presents directional planning estimates prepared for discussion. It is not a tax return, a formal tax opinion, or legal advice, and no verification of source documents has been performed. Figures reflect federal law for ", TY[year].label, " as amended by the One Big Beautiful Bill Act."), /*#__PURE__*/React.createElement("p", null, "Opportunity amounts are calculated by re-running the full tax computation with a single change applied while holding all other inputs constant. They exclude state and local tax effects, implementation costs, and non-tax considerations. State treatment — including bonus depreciation add-backs and pass-through entity tax elections — is not modelled. The alternative minimum tax is not modelled."), /*#__PURE__*/React.createElement("p", null, "Confirm entity facts, tax basis, eligibility and documentation with the client's certified public accountant, and engage counsel where relevant, before implementing any strategy described here."), (preparer || firm) && /*#__PURE__*/React.createElement("p", {
    className: "rp-sig"
  }, "Prepared by ", preparer, preparer && firm ? ", " : "", firm, " · ", today)))));
}

/* ============================================================================
   APP SHELL
   ========================================================================== */
const TABS = [{
  id: "dashboard",
  label: "Dashboard",
  icon: I.grid,
  blurb: "Form 1040 walk, tax composition, marginal rate curve, and sized opportunities."
}, {
  id: "scenarios",
  label: "Scenarios",
  icon: I.layers,
  blurb: "Build and compare scenarios line by line. Click a highlighted row to open that schedule."
}, {
  id: "se",
  label: "SE & Retirement",
  icon: I.briefcase,
  blurb: "Schedule SE computation and a side-by-side maximum deductible contribution across plan designs."
}, {
  id: "magi",
  label: "MAGI Phase-Outs",
  icon: I.gauge,
  blurb: "Every threshold-sensitive provision by MAGI group, plus Medicare IRMAA and the ACA subsidy cliff."
}, {
  id: "qbi",
  label: "QBI Workbench",
  icon: I.scale,
  blurb: "Per-entity §199A with wage and UBIA limits, SSTB phase-in, aggregation, and loss carryforward."
}, {
  id: "health",
  label: "SEHI & IRA",
  icon: I.heart,
  blurb: "Self-employed health insurance under §162(l), IRA deductibility, Roth limits, and the HSA."
}, {
  id: "guide",
  label: "Planning Guide",
  icon: I.book,
  blurb: "Screening checklist by category with key figures, authorities, and audit-risk flags."
}, {
  id: "reference",
  label: "Reference",
  icon: I.library,
  blurb: "Every statutory figure the engine uses, both years side by side, with authorities and known gaps."
}, {
  id: "audit",
  label: "Audit Trail",
  icon: I.clock,
  blurb: "Every input change with a timestamp, the values before and after, and the resulting movement in total tax."
}, {
  id: "data",
  label: "Import / Export",
  icon: I.table,
  blurb: "Excel workbooks with live formulas throughout, a blank input template, and exact session save and restore."
}, {
  id: "report",
  label: "Report",
  icon: I.file,
  blurb: "Build a client-ready report, then print, save as PDF, or download."
}];
function App() {
  const [status, setStatus] = useState("mfj");
  const [year, setYear] = useState(2025);
  const [scenarios, setScenarios] = useState(seed);
  const [tab, setTab] = useState("dashboard");
  const [activeId, setActiveId] = useState(null);
  const [focusId, setFocusId] = useState(null);

  /* ---- Tools and records ---- */
  const [auditLog, setAuditLog] = useState([]);
  const [notes, setNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [showCalc, setShowCalc] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [zTop, setZTop] = useState({
    calc: 61,
    notes: 60
  });
  const raise = which => setZTop(z => z[which] >= Math.max(z.calc, z.notes) ? z : {
    ...z,
    [which]: Math.max(z.calc, z.notes) + 1
  });
  const results = useMemo(() => scenarios.map(s => ({
    s,
    r: computeScenario(s, status, year)
  })), [scenarios, status, year]);
  const bestId = useMemo(() => {
    if (!results.length) return null;
    return results.reduce((a, b) => b.r.totalTax < a.r.totalTax ? b : a).s.id;
  }, [results]);
  const baseline = results[0];
  const activeIdSafe = scenarios.find(s => s.id === activeId) ? activeId : scenarios[0].id;
  const activeIdx = scenarios.findIndex(s => s.id === activeIdSafe);
  const active = scenarios[activeIdx];
  const activeResult = results[activeIdx].r;
  const focusSafe = scenarios.find(s => s.id === focusId) ? focusId : bestId || scenarios[0].id;

  /* ------------------------------------------------------------------------
     AUDIT LOGGING
     Every scenario mutation is diffed field by field against the prior state
     and recorded with the movement in total tax it caused. Rapid edits to the
     same field inside a short window are folded into the existing entry, so
     the trail reads as decisions rather than keystrokes.
     ---------------------------------------------------------------------- */
  const COALESCE_MS = 90000;
  const logEvent = e => {
    const d = new Date();
    setAuditLog(l => [...l, {
      id: uid(),
      ts: d.getTime(),
      tsLabel: d.toLocaleString(),
      scenarioId: e.scenarioId || null,
      scenarioName: e.scenarioName || "Session",
      label: e.label,
      kind: e.kind || null,
      from: e.from == null ? "" : e.from,
      to: e.to == null ? "" : e.to,
      delta: e.delta == null ? null : e.delta,
      taxBefore: e.taxBefore,
      key: e.key || null,
      memo: ""
    }]);
  };
  const recordChange = (before, after) => {
    const flat = o => {
      const m = {};
      flattenScenario(o).forEach(p => {
        m[p.key] = p.value;
      });
      return m;
    };
    const ma = flat(before),
      mb = flat(after);
    const keys = Object.keys(ma).concat(Object.keys(mb).filter(k => !(k in ma)));
    const changed = keys.filter(k => String(ma[k] == null ? "" : ma[k]) !== String(mb[k] == null ? "" : mb[k]));
    if (!changed.length) return;
    const taxBefore = computeScenario(before, status, year).totalTax;
    const taxAfter = computeScenario(after, status, year).totalTax;
    const delta = taxAfter - taxBefore;
    const single = changed.length === 1 ? changed[0] : null;
    const label = single ? humanKey(single) : changed.length + " fields changed — " + changed.slice(0, 3).map(humanKey).join(", ") + (changed.length > 3 ? "…" : "");

    // Fold into the previous entry when the same field is still being edited
    const last = auditLog[auditLog.length - 1];
    const now = Date.now();
    if (single && last && last.key === single && last.scenarioId === before.id && now - last.ts < COALESCE_MS) {
      setAuditLog(l => l.map((x, i) => i !== l.length - 1 ? x : {
        ...x,
        to: mb[single] == null ? "" : mb[single],
        delta: taxAfter - x.taxBefore,
        ts: now,
        tsLabel: new Date(now).toLocaleString()
      }));
      return;
    }
    logEvent({
      scenarioId: before.id,
      scenarioName: after.name || before.name,
      label,
      key: single,
      from: single ? ma[single] == null ? "" : ma[single] : "",
      to: single ? mb[single] == null ? "" : mb[single] : "",
      delta,
      taxBefore
    });
  };
  const update = (id, field, value) => {
    const before = scenarios.find(s => s.id === id);
    if (!before) return;
    const after = {
      ...before,
      [field]: value
    };
    recordChange(before, after);
    setScenarios(sc => sc.map(s => s.id === id ? after : s));
  };
  const updateActive = (field, value) => update(activeIdSafe, field, value);
  const addScenario = () => {
    const c = deepClone(scenarios[scenarios.length - 1], "Scenario " + (scenarios.length + 1));
    logEvent({
      label: "Scenario added",
      kind: "structure",
      scenarioName: c.name,
      to: c.name
    });
    setScenarios(sc => [...sc, c]);
  };
  const duplicate = id => {
    const src = scenarios.find(s => s.id === id);
    const c = deepClone(src);
    logEvent({
      label: "Scenario duplicated",
      kind: "structure",
      scenarioName: c.name,
      from: src.name,
      to: c.name
    });
    setScenarios(sc => [...sc, c]);
  };
  const remove = id => {
    if (scenarios.length <= 1) return;
    const src = scenarios.find(s => s.id === id);
    logEvent({
      label: "Scenario deleted",
      kind: "structure",
      scenarioName: src.name,
      from: src.name,
      to: "removed"
    });
    setScenarios(sc => sc.filter(s => s.id !== id));
  };
  const reset = () => {
    logEvent({
      label: "Reset to example scenarios",
      kind: "structure",
      scenarioName: "Session"
    });
    setScenarios(seed());
  };
  const setYearLogged = y => {
    if (y === year) return;
    logEvent({
      label: "Tax year changed",
      kind: "basis",
      scenarioName: "Session",
      from: TY[year].label,
      to: TY[y].label
    });
    setYear(y);
  };
  const setStatusLogged = v => {
    if (v === status) return;
    logEvent({
      label: "Filing status changed",
      kind: "basis",
      scenarioName: "Session",
      from: STATUSES.find(s => s.v === status).l,
      to: STATUSES.find(s => s.v === v).l
    });
    setStatus(v);
  };
  const setScenariosLogged = fnOrArr => setScenarios(fnOrArr);
  const moduleTabs = ["se", "magi", "qbi", "health"];
  const t = TABS.find(x => x.id === tab);
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-root"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-shell"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "tp-side"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-brand"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-mark"
  }, "§"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, "Tax Advisory Pro"), /*#__PURE__*/React.createElement("p", null, "Individual planning workbench"))), /*#__PURE__*/React.createElement("nav", {
    className: "tp-nav"
  }, TABS.map(x => /*#__PURE__*/React.createElement("button", {
    key: x.id,
    className: "tp-navitem " + (tab === x.id ? "on" : ""),
    onClick: () => setTab(x.id)
  }, x.icon, " ", x.label))), /*#__PURE__*/React.createElement("div", {
    className: "tp-side-controls"
  }, /*#__PURE__*/React.createElement("label", {
    className: "tp-sidefield"
  }, /*#__PURE__*/React.createElement("span", null, "Tax year"), /*#__PURE__*/React.createElement(Seg, {
    small: true,
    value: year,
    onChange: setYearLogged,
    options: [{
      v: 2025,
      l: "2025"
    }, {
      v: 2026,
      l: "2026"
    }]
  })), /*#__PURE__*/React.createElement("label", {
    className: "tp-sidefield"
  }, /*#__PURE__*/React.createElement("span", null, "Filing status"), /*#__PURE__*/React.createElement("select", {
    value: status,
    onChange: e => setStatusLogged(e.target.value)
  }, STATUSES.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.v,
    value: s.v
  }, s.l))))), /*#__PURE__*/React.createElement("div", {
    className: "tp-side-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-sidestat"
  }, /*#__PURE__*/React.createElement("span", null, "Lowest tax scenario"), /*#__PURE__*/React.createElement("strong", null, results.find(x => x.s.id === bestId).s.name)), /*#__PURE__*/React.createElement("div", {
    className: "tp-sidestat"
  }, /*#__PURE__*/React.createElement("span", null, "Total tax"), /*#__PURE__*/React.createElement("strong", {
    className: "green"
  }, usd$(results.find(x => x.s.id === bestId).r.totalTax))))), /*#__PURE__*/React.createElement("main", {
    className: "tp-main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-topbar"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", null, t.label), /*#__PURE__*/React.createElement("p", null, t.blurb)), moduleTabs.includes(tab) && /*#__PURE__*/React.createElement("label", {
    className: "tp-sel compact"
  }, /*#__PURE__*/React.createElement("span", null, "Scenario"), /*#__PURE__*/React.createElement("select", {
    value: activeIdSafe,
    onChange: e => setActiveId(e.target.value)
  }, scenarios.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.id,
    value: s.id
  }, s.name))))), tab === "dashboard" && /*#__PURE__*/React.createElement(Dashboard, {
    results: results,
    bestId: bestId,
    baseline: baseline,
    status: status,
    year: year,
    focusId: focusSafe,
    setFocusId: setFocusId,
    goto: setTab
  }), tab === "scenarios" && /*#__PURE__*/React.createElement(ScenariosPage, {
    scenarios: scenarios,
    results: results,
    bestId: bestId,
    baseline: baseline,
    status: status,
    year: year,
    update: update,
    addScenario: addScenario,
    duplicate: duplicate,
    remove: remove,
    reset: reset
  }), tab === "se" && /*#__PURE__*/React.createElement(SEModule, {
    scenario: active,
    result: activeResult,
    status: status,
    year: year,
    update: updateActive
  }), tab === "magi" && /*#__PURE__*/React.createElement(MAGIModule, {
    scenario: active,
    result: activeResult,
    status: status,
    year: year,
    update: updateActive
  }), tab === "qbi" && /*#__PURE__*/React.createElement(QBIModule, {
    scenario: active,
    result: activeResult,
    status: status,
    year: year,
    update: updateActive
  }), tab === "health" && /*#__PURE__*/React.createElement(HealthModule, {
    scenario: active,
    result: activeResult,
    status: status,
    year: year,
    update: updateActive
  }), tab === "guide" && /*#__PURE__*/React.createElement(PlanningGuide, {
    year: year
  }), tab === "reference" && /*#__PURE__*/React.createElement(ReferenceTables, {
    year: year,
    status: status
  }), tab === "audit" && /*#__PURE__*/React.createElement(AuditPage, {
    auditLog: auditLog,
    setAuditLog: setAuditLog,
    scenarios: scenarios,
    results: results,
    year: year,
    status: status
  }), tab === "data" && /*#__PURE__*/React.createElement(DataPage, {
    scenarios: scenarios,
    setScenarios: setScenariosLogged,
    results: results,
    status: status,
    year: year,
    auditLog: auditLog,
    notes: notes,
    logEvent: logEvent,
    setYear: setYearLogged,
    setStatus: setStatusLogged
  }), tab === "report" && /*#__PURE__*/React.createElement(ReportPage, {
    results: results,
    bestId: bestId,
    baseline: baseline,
    status: status,
    year: year,
    notes: notes,
    auditLog: auditLog
  }))), /*#__PURE__*/React.createElement("div", {
    className: "tp-dock"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-dockbtn " + (showCalc ? "on" : ""),
    onClick: () => {
      setShowCalc(v => !v);
      raise("calc");
    },
    title: "Calculator"
  }, I.calc, /*#__PURE__*/React.createElement("span", null, "Calculator")), /*#__PURE__*/React.createElement("button", {
    className: "tp-dockbtn " + (showNotes ? "on" : ""),
    onClick: () => {
      setShowNotes(v => !v);
      raise("notes");
    },
    title: "Notes"
  }, I.note, /*#__PURE__*/React.createElement("span", null, "Notes", notes.length ? " (" + notes.length + ")" : ""))), showCalc && /*#__PURE__*/React.createElement(Calculator, {
    onClose: () => setShowCalc(false),
    result: activeResult,
    scenarioName: active.name,
    onFocus: () => raise("calc"),
    z: zTop.calc,
    onSendToNotes: text => {
      setNoteDraft(d => (d ? d + "\n\n" : "") + text);
      setShowNotes(true);
      raise("notes");
    }
  }), showNotes && /*#__PURE__*/React.createElement(Notepad, {
    onClose: () => setShowNotes(false),
    notes: notes,
    setNotes: setNotes,
    scenarioName: active.name,
    scenarioId: active.id,
    onFocus: () => raise("notes"),
    z: zTop.notes,
    draft: noteDraft,
    setDraft: setNoteDraft
  }));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
