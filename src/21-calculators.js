/* ==== 21-calculators ==== */
/* ============================================================================
   CONTEXTUAL CALCULATORS — open from the tools rail in a right-side drawer.
   Every calculator prefills from the active scenario, keeps its overrides in
   local state, and produces results only by running the deterministic engine
   (computeScenario / bracketFill) on a temporary clone. Nothing here writes
   to the live scenario; "Create test scenario" adds a clone through the
   ordinary scenario pipeline so the change is logged and recalculated.
   ========================================================================== */

const CALC_TITLES = {
  scorp: "S-Corp Salary Optimizer",
  qbi: "QBI Deduction — §199A",
  sstb: "SSTB Phase-Out — §199A(d)",
  brackets: "Tax Brackets & Headroom",
  charitable: "Charitable Planning",
  auditrisk: "Audit Risk Review",
  s163j: "§163(j) Interest Limitation",
  payroll: "Payroll Tax Breakdown",
  roth: "Roth Conversion",
  retirement: "Retirement Contribution"
};

/* Result hero panel: one highlighted metric plus supporting figures */
function HeroResults({ tone, items }) {
  return EL("div", {
    className: "tp-hero " + (tone || "")
  }, items.map((it, i) => EL("div", {
    key: i,
    className: "tp-hero-item" + (i === 0 ? " hi" : "")
  }, EL("strong", null, it.value == null ? "—" : it.value), EL("span", null, it.label))));
}
function FormulaBox({ lines }) {
  return EL("div", {
    className: "tp-formula"
  }, lines.map((l, i) => EL("div", { key: i }, l)));
}
function CalcField({ label, hint, value, onChange, pctOf, suffix }) {
  return EL("label", {
    className: "tp-field"
  }, EL("span", null, label, hint && EL("em", null, hint)), EL(Money, {
    value: value,
    onChange: onChange
  }), pctOf > 0 && EL("em", {
    className: "tp-hint"
  }, pct(num(value) / pctOf, 1), " ", suffix || "of profit"));
}
function CalcFoot({ onCreate, createLabel, onAskAI, askPrompt, onAddNote, noteText, disabled }) {
  return EL("div", {
    className: "tp-calc-actions"
  }, onCreate && EL("button", {
    className: "tp-btn solid sm",
    type: "button",
    disabled: disabled,
    onClick: onCreate
  }, createLabel || "Create test scenario"), onAskAI && EL("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => onAskAI(askPrompt)
  }, "Ask AI to review"), onAddNote && EL("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => onAddNote(noteText())
  }, "Add note"));
}

/* Strip calculator-managed income sources from a clone so a test entity can be
   substituted without double counting. Keeps every other input untouched. */
function stripBusinessIncome(c) {
  c.sCorps = { entities: [] };
  c.sCorpComp = 0;
  c.sCorpK1 = 0;
  c.schedC = { ...(c.schedC || {}), businesses: [] };
  const keep = (c.qbi && c.qbi.entities || []).filter(e => !e.link);
  c.qbi = { ...(c.qbi || {}), useManual: false, entities: keep };
  return c;
}

/* ---------------------------------------------------------------------------
   1. S-CORP SALARY OPTIMIZER
   ------------------------------------------------------------------------- */
const SALARY_LEVELS = [{
  k: "aggressive",
  l: "Aggressive",
  p: 0.30,
  risk: ["Higher documentation risk", "bad"]
}, {
  k: "minimum",
  l: "Minimum supported",
  p: 0.40,
  risk: ["Documentation required", "warn"]
}, {
  k: "standard",
  l: "Standard",
  p: 0.50,
  risk: ["Balanced result", "ok"]
}, {
  k: "conservative",
  l: "Conservative",
  p: 0.60,
  risk: ["Lower documentation risk", "ok"]
}, {
  k: "all",
  l: "All salary",
  p: 1.00,
  risk: ["Lower documentation risk", "ok"]
}];
function salaryRiskWord(ratio) {
  if (ratio >= 0.995) return ["Lower documentation risk", "ok"];
  if (ratio >= 0.55) return ["Lower documentation risk", "ok"];
  if (ratio >= 0.45) return ["Balanced result", "ok"];
  if (ratio >= 0.35) return ["Documentation required", "warn"];
  return ["Higher documentation risk", "bad"];
}
function SCorpSalaryCalc({ scenario, result, status, year, onCreateScenario, onAskAI, onAddNote }) {
  const firstScorp = (scenario.sCorps && scenario.sCorps.entities || [])[0];
  const defProfit = firstScorp ? num(firstScorp.profitBeforeComp) : result.incomeParts.schedC > 0 ? result.incomeParts.schedC : 120000;
  const [profit, setProfit] = useState(defProfit);
  const [salary, setSalary] = useState(firstScorp ? num(firstScorp.ownerComp) : Math.round(defProfit * 0.5));
  const [sstb, setSstb] = useState(!!(firstScorp && firstScorp.sstb));
  const [compliance, setCompliance] = useState(0);
  const P = num(profit);

  const makeSCorp = sal => {
    const c = stripBusinessIncome(structuredClone(scenario));
    c.sCorps = {
      entities: [{
        id: "calc-scorp",
        name: "Calculator test entity",
        profitBeforeComp: P,
        ownerComp: Math.min(sal, P),
        otherExpenses: 0,
        nonOwnerW2: 0,
        ubia: 0,
        ownershipPct: 100,
        sstb: sstb,
        active: true
      }]
    };
    c.qbi.entities = [...c.qbi.entities, {
      id: "calc-qbi",
      name: "Calculator test entity",
      link: "scorp:calc-scorp",
      income: 0,
      w2: 0,
      ubia: 0,
      sstb: sstb,
      active: true
    }];
    return c;
  };
  const makeSoleProp = () => {
    const c = stripBusinessIncome(structuredClone(scenario));
    c.schedC = {
      ...(c.schedC || {}),
      businesses: [{
        id: "calc-biz",
        name: "Calculator test business",
        grossReceipts: P,
        returns: 0,
        cogs: 0,
        w2wages: 0,
        ubia: 0,
        expenses: []
      }]
    };
    c.qbi.entities = [...c.qbi.entities, {
      id: "calc-qbi",
      name: "Calculator test business",
      link: "schedC:calc-biz",
      income: 0,
      w2: 0,
      ubia: 0,
      sstb: sstb,
      active: true
    }];
    return c;
  };

  const rows = useMemo(() => {
    if (P <= 0) return [];
    const out = [];
    const sp = computeScenario(makeSoleProp(), status, year);
    out.push({
      key: "sole",
      label: "Sole proprietorship",
      salary: null,
      r: sp,
      risk: ["No payroll filings", "ok"]
    });
    SALARY_LEVELS.forEach(L => {
      const sal = Math.round(P * L.p);
      const r = computeScenario(makeSCorp(sal), status, year);
      out.push({
        key: L.k,
        label: L.l + " — " + pct(L.p, 0),
        salary: sal,
        r,
        risk: L.risk
      });
    });
    const salC = Math.min(num(salary), P);
    const rC = computeScenario(makeSCorp(salC), status, year);
    out.push({
      key: "custom",
      label: "Custom — " + pct(P > 0 ? salC / P : 0, 0),
      salary: salC,
      r: rC,
      risk: salaryRiskWord(P > 0 ? salC / P : 0)
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [P, salary, sstb, scenario, status, year]);

  if (P <= 0) return EL(Note, null, "Enter a business profit above to model the comparison.");
  const custom = rows.find(x => x.key === "custom");
  const lowestTax = rows.reduce((a, b) => b.r.totalTax < a.r.totalTax ? b : a);
  const bestCash = rows.reduce((a, b) => b.r.spendableAfterTaxCash > a.r.spendableAfterTaxCash ? b : a);
  const scorpRow = custom;
  const testEnt = (scorpRow.r.SCORPS || [])[0] || {};
  return EL("div", {
    className: "tp-stack"
  }, EL("div", {
    className: "tp-grid3"
  }, EL(CalcField, {
    label: "Business profit before owner compensation",
    value: profit,
    onChange: setProfit
  }), EL(CalcField, {
    label: "Test salary",
    value: salary,
    onChange: setSalary,
    pctOf: P
  }), EL(CalcField, {
    label: "Annual compliance cost",
    hint: "payroll service, extra returns",
    value: compliance,
    onChange: setCompliance
  })), EL("div", {
    className: "tp-inline"
  }, EL("input", {
    type: "range",
    className: "tp-slider",
    min: 0,
    max: 100,
    value: Math.round(P > 0 ? Math.min(num(salary), P) / P * 100 : 0),
    onChange: e => setSalary(Math.round(P * num(e.target.value) / 100)),
    "aria-label": "Salary as a percentage of profit"
  }), EL("label", {
    className: "tp-check"
  }, EL("input", {
    type: "checkbox",
    checked: sstb,
    onChange: e => setSstb(e.target.checked)
  }), " Specified service business"), EL("div", {
    className: "tp-chiprow"
  }, SALARY_LEVELS.map(L => EL("button", {
    key: L.k,
    type: "button",
    className: "tp-mini",
    onClick: () => setSalary(Math.round(P * L.p))
  }, L.l)))), EL(HeroResults, {
    items: [{
      label: "Total modeled tax at the test salary",
      value: usd$(custom.r.totalTax)
    }, {
      label: "K-1 distribution",
      value: usd$(testEnt.k1)
    }, {
      label: "Payroll tax (both halves)",
      value: usd$(testEnt.totalFICA)
    }, {
      label: "QBI deduction",
      value: usd$(custom.r.qbi.deduction)
    }]
  }), num(compliance) > 0 && EL(StatLine, {
    label: "After-tax economic income less compliance cost",
    value: usd$(custom.r.afterTaxCash - num(compliance)),
    cls: "strong"
  }), EL("div", {
    className: "tp-tblwrap"
  }, EL("table", {
    className: "tp-tbl"
  }, EL("thead", null, EL("tr", null, EL("th", null, "Test level"), EL("th", {
    className: "num"
  }, "Salary"), EL("th", {
    className: "num"
  }, "K-1"), EL("th", {
    className: "num"
  }, "Payroll / SE tax"), EL("th", {
    className: "num"
  }, "QBI ded."), EL("th", {
    className: "num"
  }, "Total tax"), EL("th", {
    className: "num"
  }, "After-tax income"), EL("th", null, "Documentation"))), EL("tbody", null, rows.map(row => {
    const ent = (row.r.SCORPS || [])[0];
    return EL("tr", {
      key: row.key,
      className: row.key === lowestTax.key ? "best" : row.key === "custom" ? "sel" : ""
    }, EL("td", null, row.label, row.key === lowestTax.key && EL("span", {
      className: "tp-tag green"
    }, "Lowest modeled tax"), row.key === bestCash.key && EL("span", {
      className: "tp-tag"
    }, "Highest spendable cash")), EL("td", {
      className: "num"
    }, row.salary == null ? "—" : usd$(row.salary)), EL("td", {
      className: "num"
    }, ent ? usd$(ent.k1) : "—"), EL("td", {
      className: "num"
    }, ent ? usd$(ent.totalFICA) : usd$(row.r.seTax)), EL("td", {
      className: "num"
    }, usd$(row.r.qbi.deduction)), EL("td", {
      className: "num strong"
    }, usd$(row.r.totalTax)), EL("td", {
      className: "num"
    }, usd$(row.r.afterTaxCash)), EL("td", null, EL("span", {
      className: "tp-pill " + row.risk[1]
    }, row.risk[0])));
  })))), EL(Note, {
    kind: "warn"
  }, "The lowest modeled tax is not automatically the optimal salary. Reasonable compensation is fact-dependent and is the leading S-corporation audit issue — support the chosen salary with a documented study of role, hours and market rates. K-1 amounts are net of the employer payroll tax, and QBI interacts with the salary in both directions."), EL(FormulaBox, {
    lines: ["K-1 = profit − owner compensation − employer payroll tax − other expenses", "Employer payroll tax = 6.2% of salary to the wage base + 1.45% of all salary", "§199A wage limit = 50% of W-2 wages (or 25% + 2.5% of UBIA)"]
  }), EL(CalcFoot, {
    onCreate: () => onCreateScenario("S-corp test — salary " + usd$(Math.min(num(salary), P)), makeSCorp(Math.min(num(salary), P)), "S-Corp Salary calculator: profit " + usd$(P) + ", salary " + usd$(Math.min(num(salary), P))),
    onAskAI: onAskAI,
    askPrompt: "Review this S-corporation salary test: profit before owner compensation " + usd$(P) + ", test salary " + usd$(Math.min(num(salary), P)) + " (" + pct(P > 0 ? Math.min(num(salary), P) / P : 0, 0) + " of profit). Total modeled tax " + usd$(custom.r.totalTax) + " versus " + usd$(rows[0].r.totalTax) + " as a sole proprietorship. Assess the reasonable-compensation documentation risk and the QBI interaction.",
    onAddNote: onAddNote,
    noteText: () => "S-Corp salary test: profit " + usd$(P) + ", salary " + usd$(Math.min(num(salary), P)) + " → total tax " + usd$(custom.r.totalTax) + ", after-tax " + usd$(custom.r.afterTaxCash) + " (sole prop: " + usd$(rows[0].r.totalTax) + " / " + usd$(rows[0].r.afterTaxCash) + ")"
  }));
}

/* ---------------------------------------------------------------------------
   2. QBI — the limitation waterfall for the ACTIVE scenario
   ------------------------------------------------------------------------- */
function QBICalc({ result, status, onAskAI, onAddNote }) {
  const Q = result.qbi;
  const C = result.C;
  return EL("div", {
    className: "tp-stack"
  }, EL(HeroResults, {
    items: [{
      label: "Allowed QBI deduction",
      value: usd$(Q.deduction)
    }, {
      label: "20% tentative amount",
      value: usd$(Q.tentativeTotal)
    }, {
      label: "Binding limitation",
      value: Q.binding ? Q.binding.label.split(",")[0] : Q.minApplied ? "Minimum deduction" : "None"
    }, {
      label: "Taxable income before QBI",
      value: usd$(result.tiBeforeQBI)
    }]
  }), EL("div", {
    className: "tp-limits"
  }, (Q.limits || []).map(l => EL("div", {
    key: l.key,
    className: "tp-limit" + (Q.binding && Q.binding.key === l.key ? " on" : ""),
    title: l.applicable === false ? "Not applicable — taxable income is below the §199A threshold" : ""
  }, EL("span", null, l.label), EL("strong", null, l.applicable === false ? "n/a" : usd$(l.amount)), Q.binding && Q.binding.key === l.key && EL("em", null, "BINDING")))), (Q.entities || []).length > 0 && EL("div", {
    className: "tp-tblwrap"
  }, EL("table", {
    className: "tp-tbl"
  }, EL("thead", null, EL("tr", null, EL("th", null, "Entity"), EL("th", {
    className: "num"
  }, "QBI"), EL("th", {
    className: "num"
  }, "W-2 wages"), EL("th", {
    className: "num"
  }, "UBIA"), EL("th", {
    className: "num"
  }, "Component"))), EL("tbody", null, Q.entities.map((d, i) => EL("tr", {
    key: i
  }, EL("td", null, d.e.name || "Entity " + (i + 1), d.e.sstb && EL("span", {
    className: "tp-tag amber"
  }, "SSTB")), EL("td", {
    className: "num"
  }, usd$(num(d.e.income))), EL("td", {
    className: "num"
  }, usd$(num(d.e.w2))), EL("td", {
    className: "num"
  }, usd$(num(d.e.ubia))), EL("td", {
    className: "num strong"
  }, usd$(d.r.component))))))), EL(FormulaBox, {
    lines: ["Deduction = least of:", "  1. 20% × net qualified business income", "  2. greater of 50% × W-2 wages, or 25% × W-2 wages + 2.5% × UBIA  (above the threshold)", "  3. 20% × (taxable income before QBI − net capital gain)", "Threshold (" + STATUSES.find(s => s.v === status).l + "): " + usd$(C.qbiThreshold[status]) + " · phase-in width " + usd$(C.qbiPhaseInWidth[status])]
  }), Q.minApplied && EL(Note, null, "The OBBBA minimum deduction of ", usd$(C.qbiMinDeduction), " applied — active-business QBI cleared the floor while the computed deduction fell below the minimum."), Q.carryforward > 0 && EL(Note, {
    kind: "warn"
  }, "A prior-year negative QBI carryforward of ", usd$(Q.carryforward), " reduced qualified business income before the limits."), EL(CalcFoot, {
    onAskAI: onAskAI,
    askPrompt: "Review the §199A computation for the active scenario. Allowed deduction " + usd$(Q.deduction) + "; binding limitation: " + (Q.binding ? Q.binding.label : "none") + ". Identify ways to increase the allowed deduction and any missing facts.",
    onAddNote: onAddNote,
    noteText: () => "QBI: deduction " + usd$(Q.deduction) + ", tentative " + usd$(Q.tentativeTotal) + ", wage limit " + usd$(Q.wageLimitTotal) + ", cap " + usd$(Q.cap) + ", binding: " + (Q.binding ? Q.binding.label : "none")
  }));
}

/* ---------------------------------------------------------------------------
   3. SSTB PHASE-OUT — sensitivity sweep around the threshold
   ------------------------------------------------------------------------- */
function SSTBCalc({ scenario, result, status, year, onAskAI, onAddNote }) {
  const C = result.C;
  const threshold = C.qbiThreshold[status];
  const width = C.qbiPhaseInWidth[status];
  const ti = result.tiBeforeQBI;
  const excess = clamp0(ti - threshold);
  const frac = width > 0 ? Math.min(1, excess / width) : excess > 0 ? 1 : 0;
  const hasSSTB = (result.qbi.entities || []).some(d => d.e.sstb);
  const sweep = useMemo(() => {
    const targets = [threshold - 50000, threshold - 25000, threshold, threshold + Math.round(width / 2), threshold + width, threshold + width + 50000];
    return targets.map(t => {
      const delta = t - ti;
      const c = structuredClone(scenario);
      c.w2Wages = num(c.w2Wages) + delta;
      const r = computeScenario(c, status, year);
      return {
        target: t,
        delta,
        r
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, status, year, threshold, width, ti]);
  return EL("div", {
    className: "tp-stack"
  }, !hasSSTB && EL(Note, null, "No entity in this scenario is flagged as a specified service trade or business. The sweep below still shows how the §199A deduction responds to taxable income around the threshold."), EL(HeroResults, {
    tone: frac >= 1 && hasSSTB ? "red" : frac > 0 ? "amber" : "green",
    items: [{
      label: "Phase-out position",
      value: frac <= 0 ? "Below threshold" : frac >= 1 ? "Fully phased out" : pct(frac, 0) + " phased"
    }, {
      label: "Taxable income before QBI",
      value: usd$(ti)
    }, {
      label: "Threshold",
      value: usd$(threshold)
    }, {
      label: "Range ends at",
      value: usd$(threshold + width)
    }]
  }), frac > 0 && frac < 1 && EL(StatLine, {
    label: "Income reduction to fully restore the deduction",
    value: usd$(excess),
    cls: "warn"
  }), frac >= 1 && EL(StatLine, {
    label: "Income reduction to re-enter the phase-in range",
    value: usd$(ti - (threshold + width) + 1),
    cls: "warn"
  }), EL("div", {
    className: "tp-tblwrap"
  }, EL("table", {
    className: "tp-tbl"
  }, EL("thead", null, EL("tr", null, EL("th", null, "Ordinary income change"), EL("th", {
    className: "num"
  }, "Taxable income before QBI"), EL("th", {
    className: "num"
  }, "Phase position"), EL("th", {
    className: "num"
  }, "QBI deduction"), EL("th", {
    className: "num"
  }, "Total modeled tax"))), EL("tbody", null, sweep.map((p, i) => {
    const ex2 = clamp0(p.r.tiBeforeQBI - threshold);
    const f2 = width > 0 ? Math.min(1, ex2 / width) : ex2 > 0 ? 1 : 0;
    const isCur = Math.abs(p.delta) < 1;
    return EL("tr", {
      key: i,
      className: isCur ? "sel" : ""
    }, EL("td", null, isCur ? "Current" : (p.delta > 0 ? "+" : "−") + usd$(Math.abs(p.delta))), EL("td", {
      className: "num"
    }, usd$(p.r.tiBeforeQBI)), EL("td", {
      className: "num " + (f2 >= 1 ? "down" : f2 > 0 ? "" : "up")
    }, f2 <= 0 ? "below" : f2 >= 1 ? "above" : pct(f2, 0)), EL("td", {
      className: "num strong"
    }, usd$(p.r.qbi.deduction)), EL("td", {
      className: "num"
    }, usd$(p.r.totalTax)));
  })))), EL(Note, null, "The sweep varies W-2 wages on an engine clone and recomputes everything — bracket, NIIT and cap effects are all included, so the deduction column reflects the real, not the nominal, phase-out. For an SSTB inside the range, income, wages and UBIA all count only at the applicable percentage."), EL(CalcFoot, {
    onAskAI: onAskAI,
    askPrompt: "Review the SSTB phase-out position: taxable income before QBI " + usd$(ti) + " against a threshold of " + usd$(threshold) + " (phase position " + pct(frac, 0) + "). What income-timing or deduction strategies could restore the §199A deduction, and what facts must be confirmed?",
    onAddNote: onAddNote,
    noteText: () => "SSTB phase-out: TI before QBI " + usd$(ti) + ", threshold " + usd$(threshold) + ", position " + (frac <= 0 ? "below" : frac >= 1 ? "fully phased out" : pct(frac, 0))
  }));
}

/* ---------------------------------------------------------------------------
   4. TAX BRACKETS & HEADROOM
   ------------------------------------------------------------------------- */
function BracketsCalc({ result, status, onAskAI, onAddNote }) {
  const r = result,
    C = r.C;
  const br = bracketFill(r.ordinaryTaxable, status, C);
  const zeroCap = clamp0(C.ltcg[status].zero - r.taxableIncome);
  const fifteenCap = clamp0(C.ltcg[status].fifteen - r.taxableIncome);
  const niitDist = C.niitThreshold[status] - r.magi.niit;
  return EL("div", {
    className: "tp-stack"
  }, EL(HeroResults, {
    items: [{
      label: "Current ordinary bracket",
      value: pct(br.marginalRate, 0)
    }, {
      label: "Effective economic rate",
      value: pct(r.effectiveRate)
    }, {
      label: "Room left in bracket",
      value: br.headroom === Infinity ? "top bracket" : usd$(br.headroom)
    }, {
      label: "Roth-conversion capacity",
      value: br.headroom === Infinity ? "—" : usd$(br.headroom)
    }]
  }), EL("div", {
    className: "tp-tblwrap"
  }, EL("table", {
    className: "tp-tbl"
  }, EL("thead", null, EL("tr", null, EL("th", null, "Rate"), EL("th", {
    className: "num"
  }, "Bracket"), EL("th", {
    className: "num"
  }, "Income in bracket"), EL("th", {
    className: "num"
  }, "Tax"))), EL("tbody", null, br.rows.map(row => {
    const isM = row.rate === br.marginalRate && row.income > 0;
    return EL("tr", {
      key: row.rate,
      className: row.income === 0 ? "muted" : isM ? "best" : ""
    }, EL("td", null, pct(row.rate, 0), isM && " ← current"), EL("td", {
      className: "num sm"
    }, usd$(row.floor), row.ceil === Infinity ? "+" : " – " + usd$(row.ceil)), EL("td", {
      className: "num strong"
    }, usd$(row.income)), EL("td", {
      className: "num"
    }, usd$(row.tax)));
  })))), EL("div", {
    className: "tp-statstack"
  }, EL(StatLine, {
    label: "0% capital-gain capacity",
    value: zeroCap > 0 ? usd$(zeroCap) : "none",
    cls: zeroCap > 0 ? "good" : ""
  }), EL(StatLine, {
    label: "15% capital-gain capacity",
    value: fifteenCap > 0 ? usd$(fifteenCap) : "none"
  }), EL(StatLine, {
    label: "NIIT threshold distance",
    value: niitDist > 0 ? usd$(niitDist) + " under" : usd$(-niitDist) + " over",
    cls: niitDist > 0 ? "good" : "bad"
  })), EL(Note, null, "Bracket headroom is the working space for Roth conversions and gain harvesting — but check the MAGI phase-outs first: IRMAA tiers, the ACA cliff and the NIIT threshold usually bind before the bracket ceiling does."), EL(CalcFoot, {
    onAskAI: onAskAI,
    askPrompt: "Review bracket positioning: ordinary taxable income " + usd$(r.ordinaryTaxable) + " in the " + pct(br.marginalRate, 0) + " bracket with " + (br.headroom === Infinity ? "no ceiling" : usd$(br.headroom) + " of headroom") + ". What income-recognition or deferral moves does this position support, and which thresholds bind first?",
    onAddNote: onAddNote,
    noteText: () => "Brackets: " + pct(br.marginalRate, 0) + " marginal, headroom " + (br.headroom === Infinity ? "n/a" : usd$(br.headroom)) + ", 0% LTCG capacity " + usd$(zeroCap)
  }));
}

/* ---------------------------------------------------------------------------
   5. CHARITABLE PLANNING
   ------------------------------------------------------------------------- */
function CharitableCalc({ scenario, result, status, year, onCreateScenario, onAskAI, onAddNote }) {
  const a = scenario.scheduleA || {};
  const currentGift = num(a.charityCash) + num(a.charityNonCash);
  const [gift, setGift] = useState(10000);
  const [appreciated, setAppreciated] = useState(false);
  const [basis, setBasis] = useState(0);
  const G = num(gift);
  const withGift = useMemo(() => {
    const c = structuredClone(scenario);
    c.scheduleA = { ...(c.scheduleA || {}), charityCash: num((c.scheduleA || {}).charityCash) + G };
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, G]);
  const rGift = useMemo(() => computeScenario(withGift, status, year), [withGift, status, year]);
  const benefit = result.totalTax - rGift.totalTax;
  const afterTaxCost = G - benefit;
  const gain = appreciated ? clamp0(G - num(basis)) : 0;
  const cgRate = result.ltcgMarginal + (result.magi.niit > result.C.niitThreshold[status] ? 0.038 : 0);
  const cgAvoided = gain * (cgRate || 0.15);
  /* Two-year bunching: give 2×G now and nothing next year, versus G each year */
  const otherYear = year === 2025 ? 2026 : null;
  const bunch = useMemo(() => {
    if (!otherYear) return null;
    const mk = amt => {
      const c = structuredClone(scenario);
      c.scheduleA = { ...(c.scheduleA || {}), charityCash: num((c.scheduleA || {}).charityCash) + amt };
      return c;
    };
    const y1Spread = computeScenario(mk(G), status, year).totalTax;
    const y2Spread = computeScenario(mk(G), status, otherYear).totalTax;
    const y1Bunch = computeScenario(mk(2 * G), status, year).totalTax;
    const y2Bunch = computeScenario(mk(0), status, otherYear).totalTax;
    return {
      spread: y1Spread + y2Spread,
      bunched: y1Bunch + y2Bunch,
      benefit: y1Spread + y2Spread - (y1Bunch + y2Bunch)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, G, status, year, otherYear]);
  return EL("div", {
    className: "tp-stack"
  }, EL("div", {
    className: "tp-grid3"
  }, EL(CalcField, {
    label: "Additional gift to test",
    hint: "on top of " + usd$(currentGift) + " already entered",
    value: gift,
    onChange: setGift
  }), appreciated && EL(CalcField, {
    label: "Cost basis of the property",
    value: basis,
    onChange: setBasis
  })), EL("label", {
    className: "tp-check"
  }, EL("input", {
    type: "checkbox",
    checked: appreciated,
    onChange: e => setAppreciated(e.target.checked)
  }), " Appreciated long-term property rather than cash"), EL(HeroResults, {
    tone: benefit > 0 ? "green" : "",
    items: [{
      label: "Incremental tax benefit",
      value: usd$(benefit)
    }, {
      label: "After-tax cost of the gift",
      value: usd$(afterTaxCost)
    }, {
      label: "Effective subsidy rate",
      value: G > 0 ? pct(benefit / G) : "—"
    }, {
      label: appreciated ? "Capital-gain tax avoided (est.)" : "Deduction method after gift",
      value: appreciated ? usd$(cgAvoided) : rGift.deductionKind
    }]
  }), benefit <= 0 && G > 0 && EL(Note, {
    kind: "warn"
  }, "This gift produces no incremental federal benefit — the scenario stays on the ", result.deductionKind.toLowerCase(), " deduction", year === 2026 ? " or the 0.5%-of-AGI floor absorbs it" : "", ". Consider bunching several years of giving into one itemizing year."), bunch && EL("div", {
    className: "tp-tblwrap"
  }, EL("table", {
    className: "tp-tbl"
  }, EL("thead", null, EL("tr", null, EL("th", null, "Two-year strategy (" + usd$(G) + "/yr giving intent)"), EL("th", {
    className: "num"
  }, "Two-year total tax"), EL("th", {
    className: "num"
  }, "Saving vs spreading"))), EL("tbody", null, EL("tr", null, EL("td", null, "Spread — give ", usd$(G), " each year"), EL("td", {
    className: "num"
  }, usd$(bunch.spread)), EL("td", {
    className: "num"
  }, "—")), EL("tr", {
    className: bunch.benefit > 0 ? "best" : ""
  }, EL("td", null, "Bunch — give ", usd$(2 * G), " in ", TY[year].label, ", nothing in ", TY[otherYear].label), EL("td", {
    className: "num"
  }, usd$(bunch.bunched)), EL("td", {
    className: "num " + (bunch.benefit > 0 ? "up" : "")
  }, bunch.benefit > 0 ? usd$(bunch.benefit) : "no benefit"))))), appreciated && EL(Note, null, "Gifting appreciated long-term property deducts fair market value (30%-of-AGI limit) and permanently avoids roughly ", usd$(cgAvoided), " of tax on the embedded ", usd$(gain), " gain at your ", pct(cgRate || 0.15, 1), " capital-gain rate — nearly always better than selling and giving proceeds. The engine models the deduction; the gain avoidance shown here is an estimate outside the scenario."), EL(FormulaBox, {
    lines: ["Incremental benefit = engine tax without gift − engine tax with gift", year === 2026 ? "2026: itemized charitable counts only above 0.5% of AGI; top-bracket itemized deductions face the 2/37 reduction" : "2025: no charitable floor — gifts accelerated into 2025 avoid the 2026 floor and 2/37 haircut", "Carryforward: amounts over the AGI percentage limits carry forward five years"]
  }), EL(CalcFoot, {
    onCreate: () => onCreateScenario("Charitable test — +" + usd$(G), withGift, "Charitable calculator: additional " + usd$(G) + " cash gift"),
    onAskAI: onAskAI,
    askPrompt: "Review this charitable plan: an additional " + usd$(G) + " gift produces " + usd$(benefit) + " of modeled federal benefit (after-tax cost " + usd$(afterTaxCost) + "). " + (bunch ? "Two-year bunching saves " + usd$(bunch.benefit) + " versus spreading. " : "") + "Assess AGI-limit, floor and documentation considerations.",
    onAddNote: onAddNote,
    noteText: () => "Charitable: +" + usd$(G) + " gift → benefit " + usd$(benefit) + ", after-tax cost " + usd$(afterTaxCost) + (bunch ? ", bunching saves " + usd$(bunch.benefit) : "")
  }));
}

/* ---------------------------------------------------------------------------
   6. AUDIT RISK REVIEW — qualitative, never a numeric probability
   ------------------------------------------------------------------------- */
function auditRiskDrivers(scenario, result) {
  const d = [];
  const scorps = result.SCORPS || [];
  const comp = scorps.reduce((a, x) => a + x.comp, 0);
  const k1 = scorps.reduce((a, x) => a + x.k1, 0);
  if (scorps.length) {
    const ratio = comp + k1 > 0 ? comp / (comp + k1) : 1;
    d.push({
      key: "comp",
      label: "S-corp reasonable compensation",
      active: ratio < 0.4 && k1 > 0,
      weight: ratio < 0.25 ? 3 : 2,
      detail: "Owner compensation is " + pct(ratio, 0) + " of compensation plus K-1.",
      fix: "Commission a documented compensation study covering role, hours and market rates; keep board minutes."
    });
  }
  const schedC = result.incomeParts.schedC;
  d.push({
    key: "closs",
    label: "Schedule C loss",
    active: schedC < 0,
    weight: 2,
    detail: schedC < 0 ? "Net Schedule C loss of " + usd$(Math.abs(schedC)) + "." : "No Schedule C loss.",
    fix: "Document profit motive under §183: business plan, separate accounts, time records."
  });
  const agi = result.agi;
  const charity = num((scenario.scheduleA || {}).charityCash) + num((scenario.scheduleA || {}).charityNonCash);
  d.push({
    key: "charity",
    label: "Charitable gifts above 30% of AGI",
    active: agi > 0 && charity > 0.3 * agi,
    weight: 2,
    detail: agi > 0 ? "Gifts are " + pct(charity / Math.max(1, agi), 0) + " of AGI." : "",
    fix: "Contemporaneous acknowledgments; Form 8283 over $500 non-cash; qualified appraisal over $5,000."
  });
  d.push({
    key: "income",
    label: "Income above $1 million",
    active: result.grossIncome > 1000000,
    weight: 2,
    detail: "Examination coverage rises with total positive income.",
    fix: "No action — structural. Keep workpapers supporting every material position."
  });
  d.push({
    key: "cash",
    label: "Substantial Schedule C with no payroll",
    active: schedC > 100000 && !(scenario.schedC.businesses || []).some(b => num(b.w2wages) > 0),
    weight: 1,
    detail: schedC > 0 ? "Schedule C profit " + usd$(schedC) + " with no reported W-2 wages." : "",
    fix: "Confirm worker classification; contemporaneous 1099 records."
  });
  const rental = (scenario.passthrough && scenario.passthrough.entities || []).reduce((a, e) => a + num(e.rental), 0);
  d.push({
    key: "rental",
    label: "Rental losses",
    active: rental < 0,
    weight: 1,
    detail: rental < 0 ? "Net rental loss of " + usd$(Math.abs(rental)) + "." : "No rental losses.",
    fix: "Document active participation or real-estate-professional hours; §469 limits apply."
  });
  d.push({
    key: "unmodeled",
    label: "Home office, vehicle and meals substantiation",
    active: false,
    weight: 0,
    detail: "Not modeled by this workbench — review outside the tool.",
    fix: "Mileage logs, square-footage records, receipts under §274(d)."
  });
  return d;
}
function AuditRiskCalc({ scenario, result, onAskAI, onAddNote }) {
  const drivers = auditRiskDrivers(scenario, result);
  const score = drivers.filter(x => x.active).reduce((a, x) => a + x.weight, 0);
  const level = score >= 5 ? ["Higher", "red"] : score >= 3 ? ["Elevated", "amber"] : score >= 1 ? ["Moderate", ""] : ["Lower", "green"];
  return EL("div", {
    className: "tp-stack"
  }, EL(HeroResults, {
    tone: level[1],
    items: [{
      label: "Qualitative review level",
      value: level[0]
    }, {
      label: "Active risk drivers",
      value: String(drivers.filter(x => x.active).length)
    }, {
      label: "Human review",
      value: "Required"
    }, {
      label: "Numeric probability",
      value: "Not estimated"
    }]
  }), EL(Note, {
    kind: "warn"
  }, "This is a qualitative screening of positions that draw scrutiny, not an audit probability — no reliable per-return probability exists, and none is presented. Every flagged item is sustained or lost on contemporaneous documentation."), EL("div", {
    className: "tp-tblwrap"
  }, EL("table", {
    className: "tp-tbl"
  }, EL("thead", null, EL("tr", null, EL("th", null, "Driver"), EL("th", null, "Status"), EL("th", null, "Documentation control"))), EL("tbody", null, drivers.map(x => EL("tr", {
    key: x.key,
    className: x.active ? "" : "muted",
    style: x.active ? undefined : { opacity: 0.55 }
  }, EL("td", null, EL("strong", null, x.label), x.detail && EL("em", {
    className: "tp-rownote"
  }, x.detail)), EL("td", null, x.weight === 0 ? EL("span", {
    className: "tp-pill"
  }, "not modeled") : x.active ? EL("span", {
    className: "tp-pill " + (x.weight >= 2 ? "bad" : "warn")
  }, "active") : EL("span", {
    className: "tp-pill ok"
  }, "clear")), EL("td", {
    className: "sm"
  }, x.fix)))))), EL(CalcFoot, {
    onAskAI: onAskAI,
    askPrompt: "Review the audit-risk posture of the active scenario. Active drivers: " + (drivers.filter(x => x.active).map(x => x.label).join("; ") || "none") + ". Qualitative level: " + level[0] + ". What documentation should be assembled before filing, and are any positions worth restructuring?",
    onAddNote: onAddNote,
    noteText: () => "Audit risk review: " + level[0] + " — active drivers: " + (drivers.filter(x => x.active).map(x => x.label).join("; ") || "none")
  }));
}

/* ---------------------------------------------------------------------------
   7. §163(j) BUSINESS INTEREST LIMITATION — standalone planning estimate
   ------------------------------------------------------------------------- */
function S163jCalc({ onAskAI, onAddNote }) {
  /* Prefill from the active client's first business with interest expense */
  const cl = typeof TP_ACTIVE_CLIENT !== "undefined" ? TP_ACTIVE_CLIENT : null;
  const biz = cl && (cl.profile.businesses || []).find(b => num(b.interestExpense) > 0 || num(b.grossReceipts) > 0);
  const [rev, setRev] = useState(biz ? num(biz.grossReceipts) : 2000000);
  const [opex, setOpex] = useState(biz ? num(biz.operatingExpenses) + num(biz.ownerComp) : 1400000);
  const [dep, setDep] = useState(biz ? num(biz.depreciation) : 150000);
  const [amort, setAmort] = useState(biz ? num(biz.amortization) : 0);
  const [intExp, setIntExp] = useState(biz ? num(biz.interestExpense) : 120000);
  const [intInc, setIntInc] = useState(0);
  const [carry, setCarry] = useState(biz ? num(biz.interestCarryforward) : 0);
  const ebit = num(rev) - num(opex) - num(dep) - num(amort) - num(intExp) + num(intInc);
  const ati = ebit + num(intExp) - num(intInc) + num(dep) + num(amort); // OBBBA restores the EBITDA add-back from 2025
  const limit = clamp0(0.30 * ati) + num(intInc);
  const totalExp = num(intExp) + num(carry);
  const allowed = Math.min(totalExp, limit);
  const disallowed = clamp0(totalExp - limit);
  const excess = clamp0(limit - totalExp);
  const schedule = [0, 1, 2].map(i => {
    let cf = disallowed;
    // steady-state projection at the same inputs: same limit each year
    const cap = clamp0(limit - num(intExp));
    for (let y = 0; y < i; y++) cf = clamp0(cf - cap);
    return {
      year: "Year +" + (i + 1),
      opening: cf,
      absorbed: Math.min(cf, cap),
      closing: clamp0(cf - cap)
    };
  });
  return EL("div", {
    className: "tp-stack"
  }, EL(Note, null, "Standalone planning estimate at the entity level — this calculator is not connected to the scenario. From 2025, OBBBA restores the EBITDA-based ATI (depreciation and amortization are added back). Businesses meeting the gross-receipts test (roughly $31M average) are exempt."), EL("div", {
    className: "tp-grid3"
  }, EL(CalcField, {
    label: "Revenue",
    value: rev,
    onChange: setRev
  }), EL(CalcField, {
    label: "Operating expenses",
    hint: "excluding interest, depreciation",
    value: opex,
    onChange: setOpex
  }), EL(CalcField, {
    label: "Depreciation",
    value: dep,
    onChange: setDep
  }), EL(CalcField, {
    label: "Amortization",
    value: amort,
    onChange: setAmort
  }), EL(CalcField, {
    label: "Business interest expense",
    value: intExp,
    onChange: setIntExp
  }), EL(CalcField, {
    label: "Business interest income",
    value: intInc,
    onChange: setIntInc
  }), EL(CalcField, {
    label: "Prior disallowed carryforward",
    value: carry,
    onChange: setCarry
  })), EL(HeroResults, {
    tone: disallowed > 0 ? "amber" : "green",
    items: [{
      label: "Interest allowed this year",
      value: usd$(allowed)
    }, {
      label: "Adjusted taxable income (EBITDA basis)",
      value: usd$(ati)
    }, {
      label: "30% limitation",
      value: usd$(limit)
    }, {
      label: disallowed > 0 ? "Disallowed — carries forward" : "Excess capacity",
      value: usd$(disallowed > 0 ? disallowed : excess)
    }]
  }), disallowed > 0 && EL("div", {
    className: "tp-tblwrap"
  }, EL("table", {
    className: "tp-tbl"
  }, EL("thead", null, EL("tr", null, EL("th", null, "Carryforward schedule (steady-state)"), EL("th", {
    className: "num"
  }, "Opening"), EL("th", {
    className: "num"
  }, "Absorbed"), EL("th", {
    className: "num"
  }, "Closing"))), EL("tbody", null, schedule.map(s => EL("tr", {
    key: s.year
  }, EL("td", null, s.year), EL("td", {
    className: "num"
  }, usd$(s.opening)), EL("td", {
    className: "num"
  }, usd$(s.absorbed)), EL("td", {
    className: "num"
  }, usd$(s.closing))))))), EL(FormulaBox, {
    lines: ["ATI = taxable income + interest expense − interest income + depreciation + amortization (OBBBA, 2025+)", "Limitation = 30% × ATI + business interest income (+ floor-plan financing interest)", "Disallowed interest carries forward indefinitely under §163(j)(2)"]
  }), EL(CalcFoot, {
    onAskAI: onAskAI,
    askPrompt: "Review this §163(j) estimate: interest expense " + usd$(num(intExp)) + " against a limitation of " + usd$(limit) + " on ATI of " + usd$(ati) + " → " + (disallowed > 0 ? usd$(disallowed) + " disallowed" : usd$(excess) + " of excess capacity") + ". Consider the small-business exemption, electing real-property-trade status, and capitalization strategies.",
    onAddNote: onAddNote,
    noteText: () => "§163(j): ATI " + usd$(ati) + ", limit " + usd$(limit) + ", allowed " + usd$(allowed) + (disallowed > 0 ? ", disallowed " + usd$(disallowed) : "")
  }));
}

/* ---------------------------------------------------------------------------
   8. PAYROLL TAX BREAKDOWN
   ------------------------------------------------------------------------- */
function PayrollCalc({ result, onAddNote }) {
  const p = result.payroll || {};
  return EL("div", {
    className: "tp-stack"
  }, EL(HeroResults, {
    items: [{
      label: "Combined payroll & SE tax",
      value: usd$((p.combined || 0) + result.seTax)
    }, {
      label: "Self-employment tax",
      value: usd$(result.seTax)
    }, {
      label: "Additional Medicare",
      value: usd$(result.addlMedicare)
    }, {
      label: "S-corp payroll (both halves)",
      value: usd$(result.sCorpFICA)
    }]
  }), EL("table", {
    className: "tp-tbl"
  }, EL("tbody", null, [["Employee Social Security", p.employeeSS], ["Employee Medicare", p.employeeMedicare], ["Employer Social Security", p.employerSS], ["Employer Medicare", p.employerMedicare], ["Additional Medicare Tax (0.9%)", p.additionalMedicare]].map(row => EL("tr", {
    key: row[0]
  }, EL("td", null, row[0]), EL("td", {
    className: "num"
  }, usd$(row[1] || 0)))), EL("tr", {
    className: "tot"
  }, EL("td", null, "Combined"), EL("td", {
    className: "num"
  }, usd$(p.combined || 0))))), EL(Note, null, "The employer half is the corporation's expense — it has already reduced the K-1 and never appears on the Form 1040 balance due, but it is a real economic cost and is included in total modeled federal tax."), EL(CalcFoot, {
    onAddNote: onAddNote,
    noteText: () => "Payroll: combined " + usd$(p.combined || 0) + ", SE tax " + usd$(result.seTax) + ", Add'l Medicare " + usd$(result.addlMedicare)
  }));
}

/* ---------------------------------------------------------------------------
   9. ROTH CONVERSION
   ------------------------------------------------------------------------- */
function RothCalc({ scenario, result, status, year, onCreateScenario, onAskAI, onAddNote }) {
  const br = bracketFill(result.ordinaryTaxable, status, result.C);
  const [amt, setAmt] = useState(br.headroom === Infinity ? 50000 : Math.max(0, Math.round(br.headroom / 1000) * 1000));
  const A = num(amt);
  const withConv = useMemo(() => {
    const c = structuredClone(scenario);
    c.rothConversion = num(c.rothConversion) + A;
    c.iraDistributions = num(c.iraDistributions) + A;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, A]);
  const rC = useMemo(() => computeScenario(withConv, status, year), [withConv, status, year]);
  const cost = rC.totalTax - result.totalTax;
  const effRate = A > 0 ? cost / A : 0;
  const crossNIIT = result.magi.niit <= result.C.niitThreshold[status] && rC.magi.niit > result.C.niitThreshold[status];
  return EL("div", {
    className: "tp-stack"
  }, EL(CalcField, {
    label: "Conversion amount to test",
    hint: "bracket headroom " + (br.headroom === Infinity ? "n/a" : usd$(br.headroom)),
    value: amt,
    onChange: setAmt
  }), EL(HeroResults, {
    items: [{
      label: "Tax cost of the conversion",
      value: usd$(cost)
    }, {
      label: "Effective rate on converted dollars",
      value: pct(effRate)
    }, {
      label: "Bracket after conversion",
      value: pct(rC.marginal, 0)
    }, {
      label: "NIIT threshold",
      value: crossNIIT ? "CROSSED" : rC.magi.niit > rC.C.niitThreshold[status] ? "over" : "under"
    }]
  }), crossNIIT && EL(Note, {
    kind: "warn"
  }, "This conversion pushes MAGI across the NIIT threshold, exposing investment income to the 3.8% surtax. Conversion income itself is not net investment income, but it raises the MAGI test."), EL(Note, null, "Modeled by adding the conversion to IRA distributions on an engine clone — bracket fill, credits, QBI cap and surtaxes all respond. Conversions cannot be recharacterized; pay the tax from outside funds to keep the full amount growing."), EL(CalcFoot, {
    onCreate: () => onCreateScenario("Roth conversion — " + usd$(A), withConv, "Roth calculator: convert " + usd$(A)),
    onAskAI: onAskAI,
    askPrompt: "Review a Roth conversion of " + usd$(A) + ": modeled cost " + usd$(cost) + " (" + pct(effRate) + " effective on converted dollars). Weigh current versus expected future brackets, IRMAA lookback, and the NIIT interaction.",
    onAddNote: onAddNote,
    noteText: () => "Roth conversion " + usd$(A) + " → tax cost " + usd$(cost) + " (" + pct(effRate) + ")"
  }));
}

/* ---------------------------------------------------------------------------
   10. RETIREMENT CONTRIBUTION — plan-design comparison
   ------------------------------------------------------------------------- */
function RetirementCalc({ scenario, result, status, year, onCreateScenario, onAskAI, onAddNote }) {
  const plans = [{
    v: "none",
    l: "No plan"
  }, {
    v: "solo401k",
    l: "Solo 401(k)"
  }, {
    v: "sep",
    l: "SEP IRA"
  }, {
    v: "simple",
    l: "SIMPLE IRA"
  }];
  const rows = useMemo(() => plans.map(p => {
    const c = structuredClone(scenario);
    c.planning = { ...(c.planning || {}), planType: p.v };
    const r = computeScenario(c, status, year);
    return { ...p, r, clone: c };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [scenario, status, year]);
  const cur = scenario.planning && scenario.planning.planType || "none";
  const best = rows.reduce((a, b) => b.r.totalTax < a.r.totalTax ? b : a);
  return EL("div", {
    className: "tp-stack"
  }, EL(HeroResults, {
    items: [{
      label: "Current plan deduction",
      value: usd$(result.retirementDeduction)
    }, {
      label: "Current plan",
      value: (plans.find(p => p.v === cur) || plans[0]).l
    }, {
      label: "Lowest-tax design",
      value: best.l
    }, {
      label: "Saving vs current",
      value: usd$(clamp0(result.totalTax - best.r.totalTax))
    }]
  }), EL("div", {
    className: "tp-tblwrap"
  }, EL("table", {
    className: "tp-tbl"
  }, EL("thead", null, EL("tr", null, EL("th", null, "Plan design"), EL("th", {
    className: "num"
  }, "Deduction"), EL("th", {
    className: "num"
  }, "Total modeled tax"), EL("th", {
    className: "num"
  }, "Spendable cash"), EL("th", null, ""))), EL("tbody", null, rows.map(p => EL("tr", {
    key: p.v,
    className: p.v === best.v ? "best" : p.v === cur ? "sel" : ""
  }, EL("td", null, p.l, p.v === cur && EL("span", {
    className: "tp-tag"
  }, "current")), EL("td", {
    className: "num"
  }, usd$(p.r.retirementDeduction)), EL("td", {
    className: "num strong"
  }, usd$(p.r.totalTax)), EL("td", {
    className: "num"
  }, usd$(p.r.spendableAfterTaxCash)), EL("td", null, p.v !== cur && EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => onCreateScenario("Plan test — " + p.l, p.clone, "Retirement calculator: plan design " + p.l)
  }, "Model"))))))), EL(Note, null, "A lower tax with a higher contribution also means less spendable cash this year — the deduction defers tax, it does not eliminate it. Compare the spendable-cash column, not just the tax column. Full plan detail, catch-ups and employer-percentage math live in the SE & Retirement module."), EL(CalcFoot, {
    onAskAI: onAskAI,
    askPrompt: "Compare retirement plan designs for the active scenario. Current: " + cur + " with a " + usd$(result.retirementDeduction) + " deduction; lowest-tax design: " + best.l + ". Weigh contribution capacity, cash-flow cost, and administration.",
    onAddNote: onAddNote,
    noteText: () => "Retirement designs: best " + best.l + " → tax " + usd$(best.r.totalTax) + " (current " + usd$(result.totalTax) + ")"
  }));
}

/* ---------------------------------------------------------------------------
   Drawer host — mounts one calculator at a time (lazy)
   ------------------------------------------------------------------------- */
function CalculatorDrawer({ type, scenario, result, status, year, onClose, onCreateScenario, onAskAI, onAddNote }) {
  const common = {
    scenario,
    result,
    status,
    year,
    onCreateScenario,
    onAskAI,
    onAddNote
  };
  const body = type === "scorp" ? EL(SCorpSalaryCalc, common) : type === "qbi" ? EL(QBICalc, common) : type === "sstb" ? EL(SSTBCalc, common) : type === "brackets" ? EL(BracketsCalc, common) : type === "charitable" ? EL(CharitableCalc, common) : type === "auditrisk" ? EL(AuditRiskCalc, common) : type === "s163j" ? EL(S163jCalc, common) : type === "payroll" ? EL(PayrollCalc, common) : type === "roth" ? EL(RothCalc, common) : type === "retirement" ? EL(RetirementCalc, common) : null;
  return EL(Drawer, {
    title: CALC_TITLES[type] || "Calculator",
    sub: "Source: " + scenario.name + " · " + TY[year].label + " · overrides are temporary and never modify the scenario",
    width: "min(560px, 100vw)",
    onClose: onClose
  }, body);
}
