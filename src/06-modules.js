/* ==== 06-modules ==== */
/* ============================================================================
   MODULE 1 — SELF-EMPLOYMENT TAX & RETIREMENT PLAN OPTIMIZER
   ========================================================================== */
function SEModule({
  scenario,
  result,
  status,
  year,
  update
}) {
  const C = result.C,
    SE = result.SE,
    RET = result.RET,
    P = scenario.planning;
  const setP = patch => update("planning", {
    ...P,
    ...patch
  });
  const schedC = result.schedC;
  const best = RET.options.filter(o => o.total != null).reduce((a, b) => b.total > a.total ? b : a, RET.options[0]);
  const selectedId = P.planType && P.planType !== "none" ? P.planType : null;

  // Marginal value of a dollar of retirement contribution, measured by re-running the engine
  const marginalValue = useMemo(() => {
    if (schedC <= 0) return null;
    const a = computeScenario({
      ...scenario,
      planning: {
        ...P,
        planType: "none"
      }
    }, status, year);
    const b = computeScenario({
      ...scenario,
      planning: {
        ...P,
        planType: "sep",
        employerMode: "auto"
      }
    }, status, year);
    const contrib = b.retirementDeduction;
    if (contrib <= 0) return null;
    return {
      taxSaved: a.totalTax - b.totalTax,
      contrib,
      rate: (a.totalTax - b.totalTax) / contrib
    };
  }, [scenario, status, year]);
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Schedule SE — self-employment tax",
    sub: C.label
  }, schedC <= 0 ? /*#__PURE__*/React.createElement(Note, null, "No Schedule C net profit in this scenario. Add a business under ", /*#__PURE__*/React.createElement("strong", null, "Scenarios"), " to populate the self-employment computation.") : /*#__PURE__*/React.createElement("div", {
    className: "tp-splitgrid"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Net profit from Schedule C"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(schedC))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "ind"
  }, "× 92.35%"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(SE.netSE))), /*#__PURE__*/React.createElement("tr", {
    className: "sep"
  }, /*#__PURE__*/React.createElement("td", null, "Net earnings from self-employment"), /*#__PURE__*/React.createElement("td", {
    className: "num strong"
  }, usd$(SE.netSE))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Social Security portion, 12.4%", /*#__PURE__*/React.createElement("em", null, "wage base ", usd$(C.ssWageBase), result.incomeParts.wages + result.incomeParts.sCorpComp > 0 ? ", reduced to " + usd$(SE.ssBaseRemaining) + " by W-2 wages" : "")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(SE.ss))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Medicare portion, 2.9%", /*#__PURE__*/React.createElement("em", null, "no cap")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(SE.medicare))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Self-employment tax"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(SE.total))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Deductible half", /*#__PURE__*/React.createElement("em", null, "above the line, Schedule 1 line 15")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(SE.halfDeduction))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Additional Medicare Tax"), /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Statutory threshold"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(C.addlMedThreshold[status]))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Less: wages", /*#__PURE__*/React.createElement("em", null, "threshold reduced by wages, but not below zero")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(result.incomeParts.wages + result.incomeParts.sCorpComp))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Reduced SE threshold"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(result.AM.reducedThreshold))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "0.9% on wages above the threshold"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(result.AM.onWages))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "0.9% on SE income above the reduced threshold"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(result.AM.onSE))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Additional Medicare Tax"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(result.AM.total))))), SE.belowThreshold && schedC > 0 && /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, "Net earnings are under $400, so no self-employment tax is due."), /*#__PURE__*/React.createElement(Note, null, "These thresholds are fixed by statute and have never been indexed, so exposure grows every year in real terms.")))), /*#__PURE__*/React.createElement(Card, {
    title: "Retirement plan design — maximum deductible contribution",
    sub: "Base: net profit less half SE tax = " + usd$(RET.base)
  }, /*#__PURE__*/React.createElement(Note, null, "The deduction and the base are mutually dependent, so the statutory 25% contribution rate resolves to an effective ", /*#__PURE__*/React.createElement("strong", null, "20%"), " of net earnings after the half-SE-tax deduction — the rate reduction is r ÷ (1 + r). Owner contributions go above the line on Schedule 1 line 16; contributions for", /*#__PURE__*/React.createElement("em", null, " employees"), " are a Schedule C expense instead. Each row below shows the ", /*#__PURE__*/React.createElement("strong", null, "maximum"), " deductible contribution available under that design; enter a smaller elective deferral to model a partial funding."), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Owner age at year end",
    hint: "drives catch-up",
    value: P.age,
    onChange: v => setP({
      age: v
    })
  }), /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Elective deferral elected", /*#__PURE__*/React.createElement("em", null, "blank = full ", usd$(C.deferral402g))), /*#__PURE__*/React.createElement(Money, {
    value: P.employeeDeferral,
    onChange: v => setP({
      employeeDeferral: v
    }),
    placeholder: String(C.deferral402g)
  })), /*#__PURE__*/React.createElement("div", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Catch-up applied"), /*#__PURE__*/React.createElement("div", {
    className: "tp-static"
  }, RET.catchUpApplied > 0 ? usd$(RET.catchUpApplied) + (RET.isSuperCatchup ? " (age 60-63)" : " (age 50+)") : "None"))), /*#__PURE__*/React.createElement("div", {
    className: "tp-tblwrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl compare"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Plan design"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Employee"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Catch-up"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Employer"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Total deductible"), /*#__PURE__*/React.createElement("th", null, "Binding limit"), /*#__PURE__*/React.createElement("th", {
    className: "ctr"
  }, "Select"))), /*#__PURE__*/React.createElement("tbody", null, RET.options.map(o => /*#__PURE__*/React.createElement("tr", {
    key: o.id,
    className: (o.id === best.id ? "best " : "") + (o.id === selectedId ? "sel" : "")
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, o.name), o.id === best.id && /*#__PURE__*/React.createElement("span", {
    className: "tp-tag green"
  }, "largest"), /*#__PURE__*/React.createElement("em", {
    className: "tp-rownote"
  }, o.note), /*#__PURE__*/React.createElement("em", {
    className: "tp-cite"
  }, o.cite)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, o.employee ? usd$(o.employee) : "—"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, o.catchup ? usd$(o.catchup) : "—"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, o.actuarial ? "actuarial" : o.employer ? usd$(o.employer) : "—"), /*#__PURE__*/React.createElement("td", {
    className: "num strong"
  }, o.total == null ? "—" : usd$(o.total)), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, o.binding), /*#__PURE__*/React.createElement("td", {
    className: "ctr"
  }, !o.actuarial && /*#__PURE__*/React.createElement("button", {
    className: "tp-mini " + (o.id === selectedId ? "on" : ""),
    onClick: () => setP({
      planType: o.id === selectedId ? "none" : o.id,
      employerMode: "auto"
    })
  }, o.id === selectedId ? "Applied" : "Apply"))))))), marginalValue && /*#__PURE__*/React.createElement("div", {
    className: "tp-callout"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Tax saved per dollar contributed"), /*#__PURE__*/React.createElement("strong", null, pct(marginalValue.rate))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "On a SEP contribution of"), /*#__PURE__*/React.createElement("strong", null, usd$(marginalValue.contrib))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Total tax reduction"), /*#__PURE__*/React.createElement("strong", {
    className: "green"
  }, usd$(marginalValue.taxSaved))), /*#__PURE__*/React.createElement("p", null, "Employer contributions also reduce qualified business income, so the net benefit runs below the headline marginal rate. That interaction is why the measured rate above is the number to plan against.")), /*#__PURE__*/React.createElement("div", {
    className: "tp-refbox"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, C.label, " plan limits"), /*#__PURE__*/React.createElement("div", {
    className: "tp-refgrid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Elective deferral, §402(g)"), /*#__PURE__*/React.createElement("b", null, usd$(C.deferral402g))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Catch-up, age 50+"), /*#__PURE__*/React.createElement("b", null, usd$(C.catchup50))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Super catch-up, age 60-63"), /*#__PURE__*/React.createElement("b", null, usd$(C.superCatchup6063))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Annual additions, §415(c)"), /*#__PURE__*/React.createElement("b", null, usd$(C.limit415c))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Compensation limit, §401(a)(17)"), /*#__PURE__*/React.createElement("b", null, usd$(C.compLimit401a17))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "DB annual benefit, §415(b)"), /*#__PURE__*/React.createElement("b", null, usd$(C.limit415b))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "SIMPLE deferral"), /*#__PURE__*/React.createElement("b", null, usd$(C.simpleDeferral))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "SIMPLE deferral, small plans"), /*#__PURE__*/React.createElement("b", null, usd$(C.simpleDeferralHigher))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "SIMPLE catch-up"), /*#__PURE__*/React.createElement("b", null, usd$(C.simpleCatchup)))))));
}

/* ============================================================================
   MODULE 2 — MAGI PHASE-OUT DASHBOARD
   ========================================================================== */
function MAGIModule({
  scenario,
  result,
  status,
  year,
  update
}) {
  const groups = useMemo(() => buildMAGIDashboard(result, status, year), [result, status, year]);
  const aca = computeACA(result.magi.aca, num(scenario.householdSize) || 1);
  const irmaa = computeIRMAA(result.magi.irmaa, status);
  const C = result.C;
  const active = groups.flatMap(g => g.items).filter(i => i.status !== "under");
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-kpis"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-kpi"
  }, /*#__PURE__*/React.createElement("span", null, "MAGI (general)"), /*#__PURE__*/React.createElement("strong", null, usd$(result.magi.general)), /*#__PURE__*/React.createElement("em", null, "AGI plus excluded foreign income")), /*#__PURE__*/React.createElement("div", {
    className: "tp-kpi"
  }, /*#__PURE__*/React.createElement("span", null, "MAGI (ACA / Medicare)"), /*#__PURE__*/React.createElement("strong", null, usd$(result.magi.aca)), /*#__PURE__*/React.createElement("em", null, "plus tax-exempt interest and untaxed SS")), /*#__PURE__*/React.createElement("div", {
    className: "tp-kpi " + (active.length ? "warn" : "good")
  }, /*#__PURE__*/React.createElement("span", null, "Provisions affected"), /*#__PURE__*/React.createElement("strong", null, active.length), /*#__PURE__*/React.createElement("em", null, active.filter(i => i.status === "phaseout").length, " phasing out · ", active.filter(i => i.status === "above").length, " lost")), /*#__PURE__*/React.createElement("div", {
    className: "tp-kpi"
  }, /*#__PURE__*/React.createElement("span", null, "Medicare IRMAA surcharge"), /*#__PURE__*/React.createElement("strong", null, usdc(irmaa.partB + irmaa.partD)), /*#__PURE__*/React.createElement("em", null, "per month, ", usdc(irmaa.annualCost), " per year"))), /*#__PURE__*/React.createElement(Note, null, "MAGI is not one number. Each provision defines it slightly differently, so the groups below use separate bases — a Roth conversion inflates general MAGI but is stripped back out for the Roth contribution limit, and the ACA and Medicare figures add back tax-exempt interest. The four OBBBA Schedule 1-A deductions reduce taxable income but ", /*#__PURE__*/React.createElement("strong", null, "not"), " AGI, so they never relieve any of these phase-outs."), groups.filter(g => !g.special).map(g => /*#__PURE__*/React.createElement(Card, {
    key: g.n,
    title: g.label,
    sub: usd$(g.value)
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-groupdef"
  }, g.def), /*#__PURE__*/React.createElement("div", {
    className: "tp-tblwrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl magi"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Provision"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Phase-out begins"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Fully phased out"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 130
    }
  }, "Position"), /*#__PURE__*/React.createElement("th", {
    className: "ctr"
  }, "Status"))), /*#__PURE__*/React.createElement("tbody", null, g.items.map(it => /*#__PURE__*/React.createElement("tr", {
    key: it.name,
    className: it.status === "above" ? "muted" : ""
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, it.name), it.note && /*#__PURE__*/React.createElement("em", {
    className: "tp-rownote"
  }, it.note), it.cite && /*#__PURE__*/React.createElement("em", {
    className: "tp-cite"
  }, it.cite)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, it.lo === Infinity ? "n/a" : usd$(it.lo)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, it.hi == null ? "hard limit" : usd$(it.hi)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(RangeBar, {
    value: it.value,
    lo: it.lo,
    hi: it.hi
  })), /*#__PURE__*/React.createElement("td", {
    className: "ctr"
  }, /*#__PURE__*/React.createElement(StatusPill, {
    status: it.status
  }))))))))), /*#__PURE__*/React.createElement(Card, {
    title: "MAGI Group 6 — ACA premium tax credit",
    sub: usd$(result.magi.aca)
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-groupdef"
  }, "AGI plus tax-exempt interest, the untaxed portion of Social Security benefits, and excluded foreign income."), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Household size",
    value: scenario.householdSize,
    onChange: v => update("householdSize", v)
  }), /*#__PURE__*/React.createElement("div", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "100% of federal poverty level"), /*#__PURE__*/React.createElement("div", {
    className: "tp-static"
  }, usd$(aca.fpl))), /*#__PURE__*/React.createElement("div", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Household income as % of FPL"), /*#__PURE__*/React.createElement("div", {
    className: "tp-static"
  }, pctRaw(aca.pct)))), aca.overCliff ? /*#__PURE__*/React.createElement(Note, {
    kind: "bad"
  }, "Household income is ", /*#__PURE__*/React.createElement("strong", null, pctRaw(aca.pct)), " of the federal poverty level, above 400%. The enhanced subsidies expired after 2025, so the subsidy cliff is back — no premium tax credit is available at all. Reducing MAGI below ", usd$(aca.fpl * 4), " restores the full credit, which makes deductible retirement contributions unusually valuable here.") : aca.band ? /*#__PURE__*/React.createElement(Note, {
    kind: "ok"
  }, "At ", pctRaw(aca.pct), " of the federal poverty level, the expected contribution toward the benchmark plan is ", /*#__PURE__*/React.createElement("strong", null, pctRaw(aca.applicablePct, 2)), " of household income, roughly ", usd$(aca.expectedContribution), " per year. The 400% cliff sits at ", usd$(aca.fpl * 4), " of MAGI — ", usd$(Math.max(0, aca.fpl * 4 - result.magi.aca)), " of headroom.") : null, /*#__PURE__*/React.createElement("div", {
    className: "tp-tblwrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Household income (% FPL)"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Initial %"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Final %"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Income range"))), /*#__PURE__*/React.createElement("tbody", null, APPLICABLE_PCT_2026.map(b => /*#__PURE__*/React.createElement("tr", {
    key: b.lo,
    className: aca.band && aca.band.lo === b.lo ? "best" : ""
  }, /*#__PURE__*/React.createElement("td", null, b.lo, "% – ", b.hi, "%"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, b.initial.toFixed(2), "%"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, b.final.toFixed(2), "%"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(aca.fpl * b.lo / 100), " – ", usd$(aca.fpl * b.hi / 100)))), /*#__PURE__*/React.createElement("tr", {
    className: aca.overCliff ? "bad" : "muted"
  }, /*#__PURE__*/React.createElement("td", null, "Over 400%"), /*#__PURE__*/React.createElement("td", {
    className: "num",
    colSpan: 2
  }, "No credit — cliff restored for 2026"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, "above ", usd$(aca.fpl * 4))))))), /*#__PURE__*/React.createElement(Card, {
    title: "Medicare IRMAA",
    sub: "2026 brackets, based on " + IRMAA_2026.lookbackYear + " MAGI"
  }, /*#__PURE__*/React.createElement(Note, null, "IRMAA runs on a two-year lookback, so 2026 premiums are set by the MAGI reported on the ", IRMAA_2026.lookbackYear, " return. It is a cliff, not a phase-in — one dollar over a threshold moves the whole year's premium up a full tier. The standard 2026 Part B premium is ", usdc(IRMAA_2026.standardPartB), " per month."), /*#__PURE__*/React.createElement("div", {
    className: "tp-tblwrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, IRMAA_2026.lookbackYear, " MAGI up to"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Part B surcharge"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Part D surcharge"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Total Part B"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Annual cost of the tier"))), /*#__PURE__*/React.createElement("tbody", null, IRMAA_2026.tiers.map((t, i) => {
    const key = status === "mfj" ? "mfj" : status === "mfs" ? "mfs" : "single";
    if (t[key] == null) return null;
    return /*#__PURE__*/React.createElement("tr", {
      key: i,
      className: irmaa.idx === i ? "best" : ""
    }, /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, t[key] === Infinity ? "above" : usd$(t[key])), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usdc(t.partB)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usdc(t.partD)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usdc(IRMAA_2026.standardPartB + t.partB)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usdc((t.partB + t.partD) * 12)));
  })))), irmaa.headroom != null && irmaa.cliffCost > 0 && /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, /*#__PURE__*/React.createElement("strong", null, usd$(irmaa.headroom)), " of MAGI headroom before the next IRMAA tier. Crossing it costs an additional ", /*#__PURE__*/React.createElement("strong", null, usdc(irmaa.cliffCost)), " per person for the year — an effective marginal rate of well over 100% on the dollar that crosses. Worth checking before any year-end Roth conversion or capital gain realization.")));
}

/* ============================================================================
   MODULE 3 — QBI / SEC. 199A WORKBENCH
   ========================================================================== */
function QBIModule({
  scenario,
  result,
  status,
  year,
  update
}) {
  const C = result.C,
    Q = result.qbi,
    qbi = scenario.qbi;
  const setQ = patch => update("qbi", {
    ...qbi,
    ...patch
  });
  const setEnt = (id, key, val) => setQ({
    entities: qbi.entities.map(e => e.id === id ? {
      ...e,
      [key]: val
    } : e)
  });
  const add = () => setQ({
    entities: [...qbi.entities, {
      id: uid(),
      name: "New entity",
      income: 0,
      w2: 0,
      ubia: 0,
      sstb: false,
      active: true
    }]
  });
  const del = id => setQ({
    entities: qbi.entities.filter(e => e.id !== id)
  });

  /* A linked entity derives its figures from the underlying business, so the
     half-SE-tax, retirement and health deductions that reduce QBI are picked up
     automatically instead of being netted by hand. */
  const sources = [].concat((scenario.schedC && scenario.schedC.businesses || []).map(b => ({
    v: "schedC:" + b.id,
    l: "Schedule C — " + (b.name || "business")
  })), (scenario.sCorps && scenario.sCorps.entities || []).map(x => ({
    v: "scorp:" + x.id,
    l: "S corp — " + (x.name || "entity")
  })));
  const threshold = C.qbiThreshold[status],
    width = C.qbiPhaseInWidth[status];
  const ceiling = threshold + width;
  const ti = result.tiBeforeQBI;
  const zone = ti <= threshold ? "below" : ti >= ceiling ? "above" : "phasein";
  const ratio = width > 0 ? Math.min(1, clamp0(ti - threshold) / width) : 0;
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-kpis"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-kpi"
  }, /*#__PURE__*/React.createElement("span", null, "Taxable income before QBI"), /*#__PURE__*/React.createElement("strong", null, usd$(ti)), /*#__PURE__*/React.createElement("em", null, "threshold ", usd$(threshold), " · ceiling ", usd$(ceiling))), /*#__PURE__*/React.createElement("div", {
    className: "tp-kpi"
  }, /*#__PURE__*/React.createElement("span", null, "Tentative §199A component"), /*#__PURE__*/React.createElement("strong", null, usd$(Q.component)), /*#__PURE__*/React.createElement("em", null, "sum across entities")), /*#__PURE__*/React.createElement("div", {
    className: "tp-kpi"
  }, /*#__PURE__*/React.createElement("span", null, "20% taxable income cap"), /*#__PURE__*/React.createElement("strong", null, usd$(Q.cap)), /*#__PURE__*/React.createElement("em", null, "net of capital gain")), /*#__PURE__*/React.createElement("div", {
    className: "tp-kpi good"
  }, /*#__PURE__*/React.createElement("span", null, "QBI deduction allowed"), /*#__PURE__*/React.createElement("strong", null, usd$(Q.deduction)), /*#__PURE__*/React.createElement("em", null, Q.component > Q.deduction + 1 ? usd$(Q.component - Q.deduction) + " forfeited to the cap" : "not limited by the cap"))), /*#__PURE__*/React.createElement(Card, {
    title: "Threshold position"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-zone"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-zonebox " + (zone === "below" ? "on ok" : "")
  }, /*#__PURE__*/React.createElement("b", null, "Below the threshold"), /*#__PURE__*/React.createElement("span", null, "No wage or UBIA limit. An SSTB qualifies in full."), /*#__PURE__*/React.createElement("i", null, "up to ", usd$(threshold))), /*#__PURE__*/React.createElement("div", {
    className: "tp-zonebox " + (zone === "phasein" ? "on warn" : "")
  }, /*#__PURE__*/React.createElement("b", null, "Phase-in range"), /*#__PURE__*/React.createElement("span", null, "The wage/UBIA limit and the SSTB exclusion phase in ratably."), /*#__PURE__*/React.createElement("i", null, usd$(threshold), " – ", usd$(ceiling), zone === "phasein" ? " · " + pct(ratio) + " phased in" : "")), /*#__PURE__*/React.createElement("div", {
    className: "tp-zonebox " + (zone === "above" ? "on bad" : "")
  }, /*#__PURE__*/React.createElement("b", null, "Above the ceiling"), /*#__PURE__*/React.createElement("span", null, "Wage/UBIA limit applies in full. SSTB income is excluded entirely."), /*#__PURE__*/React.createElement("i", null, "above ", usd$(ceiling)))), year === 2026 && /*#__PURE__*/React.createElement(Note, {
    kind: "ok"
  }, "OBBBA made §199A permanent and widened the phase-in range from $50,000/$100,000 to", /*#__PURE__*/React.createElement("strong", null, " ", usd$(width)), " for this filing status, which materially softens the cliff for service businesses. It also added a minimum deduction of ", usd$(C.qbiMinDeduction), " for taxpayers with at least", " " + usd$(C.qbiMinQBIFloor), " of QBI from an active business in which they materially participate.")), /*#__PURE__*/React.createElement(Card, {
    title: "Entities",
    right: /*#__PURE__*/React.createElement("div", {
      className: "tp-inline"
    }, /*#__PURE__*/React.createElement("label", {
      className: "tp-check"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: !!qbi.aggregate,
      onChange: e => setQ({
        aggregate: e.target.checked
      })
    }), " Aggregate (§1.199A-4)"), /*#__PURE__*/React.createElement("label", {
      className: "tp-check"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: !!qbi.useManual,
      onChange: e => setQ({
        useManual: e.target.checked
      })
    }), " Use workpaper amount"))
  }, qbi.useManual ? /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "QBI deduction from workpaper",
    value: qbi.manualAmount,
    onChange: v => setQ({
      manualAmount: v
    })
  }), /*#__PURE__*/React.createElement("div", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "After the taxable income cap"), /*#__PURE__*/React.createElement("div", {
    className: "tp-static"
  }, usd$(Q.deduction)))) : /*#__PURE__*/React.createElement(React.Fragment, null, qbi.aggregate && /*#__PURE__*/React.createElement(Note, null, "Aggregation combines income, W-2 wages and UBIA before the limit is applied, which usually helps a wage-light entity paired with a wage-heavy one. Specified service businesses may never be aggregated, so they are computed separately below. Aggregation requires a statement attached to the return each year."), /*#__PURE__*/React.createElement("div", {
    className: "tp-tblwrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl qbi"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Entity"), /*#__PURE__*/React.createElement("th", null, "Source"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "QBI"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "W-2 wages"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "UBIA"), /*#__PURE__*/React.createElement("th", {
    className: "ctr"
  }, "SSTB"), /*#__PURE__*/React.createElement("th", {
    className: "ctr"
  }, "Active"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "20% of QBI"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Wage/UBIA limit"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Component"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, (qbi.entities || []).map(e => {
    const d = (Q.entities || []).find(x => x.e.id === e.id);
    const r = d ? d.r : null;
    const res = d ? d.e : null; // resolved: derived when linked
    const linked = !!(e.link && res && res._derived);
    return /*#__PURE__*/React.createElement("tr", {
      key: e.id
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
      className: "tp-txt",
      value: e.name,
      onChange: ev => setEnt(e.id, "name", ev.target.value)
    })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("select", {
      className: "tp-mini-sel",
      value: e.link || "",
      onChange: ev => setEnt(e.id, "link", ev.target.value)
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "Entered by hand"), sources.map(x => /*#__PURE__*/React.createElement("option", {
      key: x.v,
      value: x.v
    }, x.l)))), /*#__PURE__*/React.createElement("td", null, linked ? /*#__PURE__*/React.createElement("div", {
      className: "tp-derived"
    }, usd$(res ? res.income : 0)) : /*#__PURE__*/React.createElement(Money, {
      value: e.income,
      onChange: v => setEnt(e.id, "income", v)
    })), /*#__PURE__*/React.createElement("td", null, linked ? /*#__PURE__*/React.createElement("div", {
      className: "tp-derived"
    }, usd$(res ? res.w2 : 0)) : /*#__PURE__*/React.createElement(Money, {
      value: e.w2,
      onChange: v => setEnt(e.id, "w2", v)
    })), /*#__PURE__*/React.createElement("td", null, linked ? /*#__PURE__*/React.createElement("div", {
      className: "tp-derived"
    }, usd$(res ? res.ubia : 0)) : /*#__PURE__*/React.createElement(Money, {
      value: e.ubia,
      onChange: v => setEnt(e.id, "ubia", v)
    })), /*#__PURE__*/React.createElement("td", {
      className: "ctr"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: !!e.sstb,
      onChange: ev => setEnt(e.id, "sstb", ev.target.checked)
    })), /*#__PURE__*/React.createElement("td", {
      className: "ctr"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: !!e.active,
      onChange: ev => setEnt(e.id, "active", ev.target.checked)
    })), /*#__PURE__*/React.createElement("td", {
      className: "num sm"
    }, r ? usd$(r.tentative) : "—"), /*#__PURE__*/React.createElement("td", {
      className: "num sm"
    }, r ? usd$(r.wageLimit) : "—"), /*#__PURE__*/React.createElement("td", {
      className: "num strong"
    }, r ? usd$(r.component) : "—", r && r.sstbExcluded && /*#__PURE__*/React.createElement("span", {
      className: "tp-tag red"
    }, "SSTB excluded"), r && e.sstb && !r.sstbExcluded && r.applicablePct < 1 && /*#__PURE__*/React.createElement("span", {
      className: "tp-tag amber"
    }, pct(r.applicablePct), " counted")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
      className: "tp-iconbtn",
      onClick: () => del(e.id),
      title: "Remove"
    }, I.trash)));
  }), !(qbi.entities || []).length && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 11,
    className: "tp-empty"
  }, "No entities. Add one to compute the deduction."))))), /*#__PURE__*/React.createElement("button", {
    className: "tp-addbtn",
    onClick: add
  }, I.plus, " Add entity"), (Q.entities || []).filter(d => d.e._alloc && d.e._alloc.total > 0).map(d => /*#__PURE__*/React.createElement(Note, {
    key: "alloc-" + d.e.id
  }, /*#__PURE__*/React.createElement("strong", null, d.e.name, " — deductions allocated against QBI: "), "half SE tax ", usd$(d.e._alloc.seTaxHalf), ", retirement ", usd$(d.e._alloc.retirement), ", SEHI ", usd$(d.e._alloc.sehi), " (total ", usd$(d.e._alloc.total), "). Method: ", d.e._alloc.method.toLowerCase(), " (", pct(d.e._alloc.share, 1), "))."))), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3",
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Prior-year negative QBI carryforward",
    hint: "reduces this year",
    value: qbi.priorNegativeCarryforward,
    onChange: v => setQ({
      priorNegativeCarryforward: v
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead",
    style: {
      marginTop: 16
    }
  }, "QBI diagnostic amounts and applicable cap"), /*#__PURE__*/React.createElement("div", {
    className: "tp-limits"
  }, (Q.limits || []).map(l => {
    const isBinding = Q.binding && l.key === Q.binding.key;
    return /*#__PURE__*/React.createElement("div", {
      key: l.key,
      className: "tp-limit" + (isBinding ? " on" : "")
    }, /*#__PURE__*/React.createElement("span", null, l.label), /*#__PURE__*/React.createElement("strong", null, l.applicable === false ? "N/A" : usd$(l.amount)), /*#__PURE__*/React.createElement("em", null, l.applicable === false ? "not applicable below the threshold" : isBinding ? "matches the allowed deduction" : "diagnostic amount"));
  })), /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl",
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Tentative component after the phase-in", /*#__PURE__*/React.createElement("em", {
    className: "tp-rownote"
  }, "per entity, wage limit phased in ratably")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(Q.component))), qbi.priorNegativeCarryforward > 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "ind"
  }, "Prior-year negative QBI carryforward applied to QBI first"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, "(", usd(num(qbi.priorNegativeCarryforward)), ")")), Q.minApplied && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "ind"
  }, "OBBBA minimum deduction applied"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(C.qbiMinDeduction))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "QBI deduction allowed after entity-level rules and taxable-income cap"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(Q.deduction))))), /*#__PURE__*/React.createElement(Note, null, "The allowed deduction is ", /*#__PURE__*/React.createElement("code", {
    className: "tp-code"
  }, "MIN(entity-level QBI component after applicable wage/UBIA and SSTB rules, 20% taxable-income cap)"), ". The wage and UBIA rule is applied by entity and phased in above the threshold; below the threshold it is not applicable. A business with no W-2 wages and no UBIA can lose the deduction only after taxable income moves through the phase-in range — that interaction is the single largest reason an S election changes the answer."), Q.negative && /*#__PURE__*/React.createElement(Note, {
    kind: "bad"
  }, "Net QBI is negative. No deduction is allowed this year, and ", usd$(Q.carryforwardOut), " carries forward to offset future positive QBI. File Form 8995 anyway to memorialize the carryforward — omitting it is a common and expensive error."), Q.component > Q.deduction + 1 && !Q.negative && /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, "The deduction is capped by taxable income, forfeiting ", /*#__PURE__*/React.createElement("strong", null, usd$(Q.component - Q.deduction)), ". Every additional deduction lowers taxable income and therefore shrinks this cap further, so stacking retirement contributions, charitable gifts and depreciation into a single year produces less benefit than the sum of the parts. Sequencing them across years is usually worth modelling.")));
}

/* ============================================================================
   MODULE 4 — SELF-EMPLOYED HEALTH INSURANCE & IRA
   ========================================================================== */
function HealthModule({
  scenario,
  result,
  status,
  year,
  update
}) {
  const C = result.C,
    H = result.SEHI,
    IRAr = result.IRA;
  const sehi = scenario.sehi || defaultSEHI();
  const ira = scenario.ira || defaultIRA();
  const setH = patch => update("sehi", {
    ...sehi,
    ...patch
  });
  const setI = patch => update("ira", {
    ...ira,
    ...patch
  });
  const addLTC = () => setH({
    ltcInsured: [...(sehi.ltcInsured || []), {
      id: uid(),
      name: "Insured",
      age: 55,
      premium: 0
    }]
  });
  const setLTC = (id, k, v) => setH({
    ltcInsured: sehi.ltcInsured.map(p => p.id === id ? {
      ...p,
      [k]: v
    } : p)
  });
  const delLTC = id => setH({
    ltcInsured: sehi.ltcInsured.filter(p => p.id !== id)
  });
  const P = scenario.planning;
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Self-employed health insurance — §162(l)",
    sub: "Schedule 1 line 17, Form 7206"
  }, /*#__PURE__*/React.createElement(Note, null, "The deduction is capped at earned income from the business that established the plan, measured", /*#__PURE__*/React.createElement("strong", null, " after"), " the half-SE-tax and retirement plan deductions. That ordering matters: a large retirement contribution can crowd out the health insurance deduction entirely. Premiums that fail the cap fall back to Schedule A medical, where the 7.5%-of-AGI floor usually swallows them."), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Medical and dental premiums",
    hint: "fully deductible",
    value: sehi.medicalPremiums,
    onChange: v => setH({
      medicalPremiums: v
    })
  }), /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Eligible for a subsidized employer plan?"), /*#__PURE__*/React.createElement(Seg, {
    small: true,
    value: sehi.employerPlanEligible ? "y" : "n",
    onChange: v => setH({
      employerPlanEligible: v === "y"
    }),
    options: [{
      v: "n",
      l: "No"
    }, {
      v: "y",
      l: "Yes"
    }]
  })), sehi.employerPlanEligible && /*#__PURE__*/React.createElement(Field, {
    label: "Months eligible for that plan",
    hint: "deduction disallowed for those months",
    value: sehi.employerPlanMonths,
    onChange: v => setH({
      employerPlanMonths: v
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead",
    style: {
      marginTop: 14
    }
  }, "Qualified long-term care premiums — capped by age at year end"), /*#__PURE__*/React.createElement("div", {
    className: "tp-tblwrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Insured"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Age"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Premium paid"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Age cap"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Allowed"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, (sehi.ltcInsured || []).map(p => {
    const cap = ltcCapForAge(num(p.age), C);
    return /*#__PURE__*/React.createElement("tr", {
      key: p.id
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
      className: "tp-txt",
      value: p.name,
      onChange: e => setLTC(p.id, "name", e.target.value)
    })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Money, {
      value: p.age,
      onChange: v => setLTC(p.id, "age", v)
    })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Money, {
      value: p.premium,
      onChange: v => setLTC(p.id, "premium", v)
    })), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(cap)), /*#__PURE__*/React.createElement("td", {
      className: "num strong"
    }, usd$(Math.min(num(p.premium), cap))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
      className: "tp-iconbtn",
      onClick: () => delLTC(p.id)
    }, I.trash)));
  }), !(sehi.ltcInsured || []).length && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 6,
    className: "tp-empty"
  }, "No long-term care policies entered."))))), /*#__PURE__*/React.createElement("button", {
    className: "tp-addbtn",
    onClick: addLTC
  }, I.plus, " Add insured person"), /*#__PURE__*/React.createElement("div", {
    className: "tp-splitgrid",
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Medical and dental premiums"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(H.medical))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Long-term care premiums allowed"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(H.ltcAllowed))), H.ltcDisallowed > 0 && /*#__PURE__*/React.createElement("tr", {
    className: "muted"
  }, /*#__PURE__*/React.createElement("td", {
    className: "ind"
  }, "Disallowed by the age cap"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(H.ltcDisallowed))), H.eligibleMonths < 12 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "ind"
  }, "× ", H.eligibleMonths, " of 12 eligible months"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(H.afterMonths))), /*#__PURE__*/React.createElement("tr", {
    className: "sep"
  }, /*#__PURE__*/React.createElement("td", null, "Earned income limit"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(H.earnedIncome))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Deduction allowed"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(H.deduction))), H.schedAFallback > 0 && /*#__PURE__*/React.createElement("tr", {
    className: "muted"
  }, /*#__PURE__*/React.createElement("td", null, "Falls back to Schedule A medical"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(H.schedAFallback))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Earned income limit, built up"), /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Schedule C net profit"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(result.schedC))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "ind"
  }, "Less half of SE tax"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, "(", usd(result.SE.halfDeduction), ")")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "ind"
  }, "Less retirement plan deduction"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, "(", usd(result.retirementDeduction), ")")), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Earned income for §162(l)"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(H.earnedIncome))))), H.limitedByEarnedIncome && /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, "Premiums of ", usd$(H.afterMonths), " exceed earned income of ", usd$(H.earnedIncome), ". Reducing the retirement contribution would free up room for the health insurance deduction — compare the two, since the retirement deduction also shrinks QBI while this one does too but the trade is rarely equal."), /*#__PURE__*/React.createElement(Note, null, "A more-than-2% S corporation shareholder must run premiums through W-2 box 1 first, or the deduction is lost entirely. A sole proprietor must pay Medicare premiums directly. Premiums deducted here may not also be claimed on Schedule A.")))), /*#__PURE__*/React.createElement(Card, {
    title: "Individual retirement arrangements",
    sub: "Schedule 1 line 20 · Form 8606"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Model an IRA contribution"), /*#__PURE__*/React.createElement(Seg, {
    small: true,
    value: ira.enabled ? "y" : "n",
    onChange: v => setI({
      enabled: v === "y"
    }),
    options: [{
      v: "n",
      l: "Off"
    }, {
      v: "y",
      l: "On"
    }]
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Age at year end",
    value: ira.age,
    onChange: v => setI({
      age: v
    })
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Contribution",
    hint: "≤ " + usd$(IRAr.limit),
    value: ira.contribution,
    onChange: v => setI({
      contribution: v
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Workplace plan coverage"), /*#__PURE__*/React.createElement(Seg, {
    small: true,
    value: ira.coverage,
    onChange: v => setI({
      coverage: v
    }),
    options: [{
      v: "none",
      l: "Neither"
    }, {
      v: "self",
      l: "Taxpayer"
    }, {
      v: "spouse",
      l: "Spouse only"
    }]
  }))), /*#__PURE__*/React.createElement("div", {
    className: "tp-splitgrid"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Contribution limit", /*#__PURE__*/React.createElement("em", null, usd$(C.iraLimit), " plus ", usd$(C.iraCatchup), " catch-up at 50+")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(IRAr.limit))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Limited by taxable compensation"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(IRAr.contributionCeiling))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Coverage status"), /*#__PURE__*/React.createElement("td", {
    className: "num sm"
  }, IRAr.coverageLabel)), IRAr.range && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "MAGI phase-out range", /*#__PURE__*/React.createElement("em", null, "MAGI ", usd$(result.magi.ira))), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(IRAr.range[0]), " – ", usd$(IRAr.range[1]))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Deductible contribution"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(IRAr.deductible))), IRAr.nondeductible > 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Nondeductible — track on Form 8606"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(IRAr.nondeductible))), IRAr.excess > 0 && /*#__PURE__*/React.createElement("tr", {
    className: "bad"
  }, /*#__PURE__*/React.createElement("td", null, "Excess contribution — 6% excise tax"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(IRAr.excess))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Roth IRA"), /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "MAGI for Roth purposes", /*#__PURE__*/React.createElement("em", null, "AGI less any conversion income")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(result.magi.roth))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Phase-out range"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(IRAr.rothRange[0]), " – ", usd$(IRAr.rothRange[1]))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Maximum Roth contribution"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(IRAr.rothCeiling))))), IRAr.backdoorIndicated && /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, "MAGI is above the Roth range, so a direct contribution is barred. A nondeductible traditional contribution followed by a conversion reaches the same place — but the pro-rata rule under §408(d)(2) aggregates ", /*#__PURE__*/React.createElement("em", null, "every"), " traditional, SEP and SIMPLE IRA balance at year end, so any pre-tax balance makes the conversion partly taxable. Check for existing balances before recommending this."), /*#__PURE__*/React.createElement(Note, null, "The phased deduction rounds up to the next $10 and never falls below $200 while any deduction survives. For married filing separately the range is $0–$10,000, which strands almost every such filer.")))), /*#__PURE__*/React.createElement(Card, {
    title: "Health savings account",
    sub: "§223 · Form 8889 · " + C.label
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Funding"), /*#__PURE__*/React.createElement(Seg, {
    small: true,
    value: P.hsaMode,
    onChange: v => update("planning", {
      ...P,
      hsaMode: v
    }),
    options: [{
      v: "off",
      l: "None"
    }, {
      v: "max",
      l: "Maximum"
    }, {
      v: "manual",
      l: "Amount"
    }]
  })), /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Coverage"), /*#__PURE__*/React.createElement(Seg, {
    small: true,
    value: P.hsaCoverage,
    onChange: v => update("planning", {
      ...P,
      hsaCoverage: v
    }),
    options: [{
      v: "self",
      l: "Self-only"
    }, {
      v: "family",
      l: "Family"
    }]
  })), P.hsaMode === "manual" && /*#__PURE__*/React.createElement(Field, {
    label: "Contribution",
    hint: "≤ " + usd$(result.hsaLimit),
    value: P.hsaManual,
    onChange: v => update("planning", {
      ...P,
      hsaManual: v
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "tp-refgrid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Self-only limit"), /*#__PURE__*/React.createElement("b", null, usd$(C.hsa.self))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Family limit"), /*#__PURE__*/React.createElement("b", null, usd$(C.hsa.family))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Catch-up at 55+"), /*#__PURE__*/React.createElement("b", null, usd$(C.hsa.catchup55))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "HDHP minimum deductible, self"), /*#__PURE__*/React.createElement("b", null, usd$(C.hdhp.minDedSelf))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "HDHP minimum deductible, family"), /*#__PURE__*/React.createElement("b", null, usd$(C.hdhp.minDedFamily))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "HDHP out-of-pocket maximum, self"), /*#__PURE__*/React.createElement("b", null, usd$(C.hdhp.oopSelf))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Applied this scenario"), /*#__PURE__*/React.createElement("b", {
    className: "green"
  }, usd$(result.hsa)))), /*#__PURE__*/React.createElement(Note, null, "Deductible going in, tax-free growth, tax-free out for qualified medical costs — the only triple-advantaged account in the code. Requires HDHP coverage and no disqualifying other coverage. Funding through payroll at an employer also avoids FICA, which a self-employed taxpayer cannot replicate.")));
}
