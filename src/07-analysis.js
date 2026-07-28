/* ==== 07-analysis ==== */
/* ============================================================================
   OPPORTUNITY ANALYSIS
   Each finding is sized by cloning the scenario, applying exactly one change,
   and re-running the whole engine. That keeps interaction effects honest
   instead of quoting a headline deduction times a marginal rate.
   ========================================================================== */
function probe(s, status, year, mutate) {
  const c = structuredClone(s);
  try {
    mutate(c);
  } catch (e) {
    return 0;
  }
  return computeScenario(s, status, year).totalTax - computeScenario(c, status, year).totalTax;
}
const RISK = {
  low: {
    label: "Low audit risk",
    c: "ok"
  },
  med: {
    label: "Moderate scrutiny",
    c: "warn"
  },
  high: {
    label: "Higher scrutiny",
    c: "bad"
  }
};
function analyzeScenario(s, status, year) {
  const r = computeScenario(s, status, year);
  const C = r.C;
  const P = s.planning || {};
  const out = [];
  const add = o => {
    if (o) out.push(o);
  };

  /* --- Retirement --- */
  if (r.schedC > 0) {
    const bestPlan = r.RET.options.filter(o => o.total != null).reduce((a, b) => b.total > a.total ? b : a);
    const saving = probe(s, status, year, c => {
      c.planning = {
        ...defaultPlanning(),
        ...c.planning,
        planType: bestPlan.id,
        employerMode: "auto",
        employeeDeferral: C.deferral402g
      };
    });
    if (saving > 50) {
      add({
        id: "retire",
        cat: "Retirement",
        risk: "low",
        savings: saving,
        title: P.planType === "none" || !P.planType ? "No qualified retirement plan in place" : "Retirement funding below the allowable maximum",
        why: "A " + bestPlan.name + " supports up to " + usd$(bestPlan.total) + " of deductible contributions against this " + usd$(r.schedC) + " of Schedule C profit. The binding constraint is the " + bestPlan.binding.toLowerCase() + ". Employer contributions also reduce qualified business income, so the measured saving below already nets that off.",
        action: "Open the SE & Retirement module and apply the " + bestPlan.name + " design, then confirm the deferral is not already used at a W-2 job.",
        ref: "IRC §401(k), §404(h), §415(c) · Pub 560"
      });
    }
  }

  /* --- HSA --- */
  const hsaSaving = probe(s, status, year, c => {
    c.planning = {
      ...defaultPlanning(),
      ...c.planning,
      hsaMode: "max"
    };
  });
  if (hsaSaving > 25) {
    add({
      id: "hsa",
      cat: "Health",
      risk: "low",
      savings: hsaSaving,
      title: P.hsaMode === "off" || !P.hsaMode ? "Health savings account not funded" : "HSA funded below the annual limit",
      why: "With HDHP coverage the " + C.label + " limit is " + usd$(C.hsa.self) + " self-only or " + usd$(C.hsa.family) + " family, plus " + usd$(C.hsa.catchup55) + " at 55 or older. Deductible in, tax-free growth, tax-free out for medical costs.",
      action: "Confirm HDHP eligibility and no disqualifying coverage, then fund to the limit.",
      ref: "IRC §223 · Pub 969 · Form 8889"
    });
  }

  /* --- Self-employed health insurance --- */
  if (r.schedC > 0 && r.sehiDeduction === 0 && num((s.sehi || {}).medicalPremiums) === 0) {
    add({
      id: "sehi",
      cat: "Health",
      risk: "med",
      savings: 0,
      unquantified: true,
      title: "No self-employed health insurance deduction claimed",
      why: "With positive self-employment income, medical, dental and qualified long-term care premiums for the taxpayer, " + "spouse, dependents and any child under 27 are generally deductible above the line, capped at earned income from the business.",
      action: "Enter premiums in the SEHI & IRA module. For an S corporation, confirm the premiums ran through W-2 box 1 first.",
      ref: "IRC §162(l) · Notice 2008-1 · Form 7206"
    });
  }
  if (r.SEHI.limitedByEarnedIncome) {
    add({
      id: "sehi-cap",
      cat: "Health",
      risk: "low",
      savings: 0,
      unquantified: true,
      title: "Health insurance deduction is capped by earned income",
      why: usd$(r.SEHI.afterMonths) + " of premiums exceeds earned income of " + usd$(r.SEHI.earnedIncome) + ", which is measured after the half-SE-tax and retirement deductions. The retirement contribution is crowding out the health deduction.",
      action: "Model a smaller retirement contribution and compare — the two deductions compete for the same earned income.",
      ref: "IRC §162(l)(2)(A) · Form 7206"
    });
  }

  /* --- Entity structure --- */
  const biz = largestBiz(s.schedC);
  if (biz && businessNet(biz) > 50000) {
    const scorpSaving = probe(s, status, year, c => {
      const b = largestBiz(c.schedC);
      if (!b) return;
      const net = businessNet(b),
        comp = Math.max(0, Math.round(net * 0.45 / 1000) * 1000),
        employerFICA = Math.min(comp, TY[year].ssWageBase) * 0.062 + comp * 0.0145,
        k1 = net - comp - employerFICA;
      c.sCorpComp = num(c.sCorpComp) + comp;
      c.sCorpK1 = num(c.sCorpK1) + k1;
      c.schedC.businesses = c.schedC.businesses.filter(x => x.id !== b.id);
      c.qbi = {
        ...c.qbi,
        entities: [...(c.qbi.entities || []), {
          id: "probe",
          name: b.name,
          income: k1,
          w2: comp,
          ubia: num(b.ubia),
          sstb: false,
          active: true
        }]
      };
    });
    if (scorpSaving > 500) {
      add({
        id: "scorp",
        cat: "Entity",
        risk: "high",
        savings: scorpSaving,
        title: "Schedule C profit is fully exposed to self-employment tax",
        why: biz.name + " nets " + usd$(businessNet(biz)) + " on Schedule C, all of it in the SE tax base. An S election would split " + "it into reasonable W-2 compensation, which carries FICA, and distributions, which do not. Wages reduce QBI, so the net gain is " + "smaller than the payroll saving alone — the figure here is measured after that offset.",
        action: "Model the conversion, then set compensation from a documented reasonable-compensation study before filing Form 2553.",
        ref: "IRC §1361, §1362 · Form 2553 · reasonable compensation is the leading S corporation audit issue"
      });
    }
  }

  /* --- QBI cap --- */
  if (r.qbi.component > r.qbi.deduction + 1) {
    add({
      id: "qbicap",
      cat: "QBI",
      risk: "high",
      savings: 0,
      unquantified: true,
      title: "QBI deduction limited by the taxable income cap — " + usd$(r.qbi.component - r.qbi.deduction) + " forfeited",
      why: "The tentative §199A component is " + usd$(r.qbi.component) + " but the deduction is capped at 20% of taxable income net of " + "capital gain, or " + usd$(r.qbi.cap) + ". Deductions that lower taxable income shrink this cap too, so stacking them has diminishing returns.",
      action: "Sequence deductions across years rather than concentrating them; consider electing out of bonus depreciation to preserve the cap.",
      ref: "IRC §199A(a) · Forms 8995 / 8995-A"
    });
  }

  /* --- Deduction method --- */
  if (s.deductionMode === "standard" && r.itemized > r.stdDed) {
    add({
      id: "ded",
      cat: "Deductions",
      risk: "low",
      savings: probe(s, status, year, c => {
        c.deductionMode = "itemized";
      }),
      title: "Taking the standard deduction while itemized deductions are larger",
      why: "Itemized deductions total " + usd$(r.itemized) + " against a " + usd$(r.stdDed) + " standard deduction.",
      action: "Switch the deduction method to Auto or Itemized.",
      ref: "IRC §63"
    });
  }

  /* --- SALT headroom --- */
  const saltUnused = clamp0(r.A.saltCap - r.A.salt);
  if (r.deductionKind === "Itemized" && saltUnused > 2000) {
    add({
      id: "salt",
      cat: "Deductions",
      risk: "low",
      savings: 0,
      unquantified: true,
      title: usd$(saltUnused) + " of SALT deduction capacity unused",
      why: "The cap for this filing status is " + usd$(r.A.saltCap) + " but only " + usd$(r.A.salt) + " of state and local tax is claimed. " + "Prepaying the fourth-quarter state estimate or property tax before year end can absorb the headroom in an itemizing year.",
      action: "Confirm all state income, real estate and personal property taxes are captured on Schedule A.",
      ref: "IRC §164(b)(6) · cap reverts to $10,000 in 2030"
    });
  }

  /* --- NIIT --- */
  if (r.niit > 0) {
    add({
      id: "niit",
      cat: "Investment",
      risk: "med",
      savings: 0,
      unquantified: true,
      title: "Net investment income tax of " + usd$(r.niit) + " is being incurred",
      why: "The 3.8% surtax applies once MAGI exceeds " + usd$(C.niitThreshold[status]) + ". That threshold is fixed by statute and has never been indexed, so exposure grows every year in real terms.",
      action: "Consider municipal bonds, asset location, installment sales, or loss harvesting to reduce net investment income.",
      ref: "IRC §1411 · Form 8960"
    });
  }

  /* --- IRMAA cliff --- */
  const irmaa = computeIRMAA(r.magi.irmaa, status);
  if (irmaa.headroom != null && irmaa.headroom < 25000 && irmaa.cliffCost > 0) {
    add({
      id: "irmaa",
      cat: "Medicare",
      risk: "low",
      savings: 0,
      unquantified: true,
      title: "Within " + usd$(irmaa.headroom) + " of the next Medicare IRMAA tier",
      why: "IRMAA is a cliff, not a phase-in. One dollar over the threshold raises the whole year's Part B and D premiums by " + usdc(irmaa.cliffCost) + " per person. On a two-year lookback, this year's MAGI sets premiums two years out.",
      action: "Check this headroom before any year-end Roth conversion, capital gain realization, or IRA distribution.",
      ref: "42 U.S.C. §1395r(i) · CMS 2026 premium tables"
    });
  }

  /* --- ACA cliff --- */
  const aca = computeACA(r.magi.aca, num(s.householdSize) || 1);
  if (aca.pct > 380 && aca.pct <= 400) {
    add({
      id: "aca",
      cat: "Health",
      risk: "low",
      savings: 0,
      unquantified: true,
      title: "Household income is at " + pctRaw(aca.pct) + " of the federal poverty level, just under the subsidy cliff",
      why: "The enhanced subsidies expired after 2025, restoring the hard 400% cliff. Crossing it forfeits the entire premium tax credit " + "for the year — often the single largest marginal cost in the code.",
      action: "Deductible retirement or HSA contributions that hold MAGI below " + usd$(aca.fpl * 4) + " are worth far more than their nominal rate here.",
      ref: "IRC §36B · Rev. Proc. 2025-25"
    });
  }
  if (aca.overCliff && r.grossIncome < 300000) {
    add({
      id: "aca2",
      cat: "Health",
      risk: "low",
      savings: 0,
      unquantified: true,
      title: "Above the 400% ACA subsidy cliff at " + pctRaw(aca.pct) + " of the federal poverty level",
      why: "No premium tax credit is available. Bringing MAGI down to " + usd$(aca.fpl * 4) + " would restore it in full.",
      action: "Model whether deductible contributions can close the gap — the payoff is the entire credit, not a marginal-rate saving.",
      ref: "IRC §36B"
    });
  }

  /* --- Roth conversion headroom --- */
  const br = bracketFill(r.ordinaryTaxable, status, C);
  if (br.headroom !== Infinity && br.headroom > 15000 && br.marginalRate <= 0.22) {
    add({
      id: "roth",
      cat: "Retirement",
      risk: "low",
      savings: 0,
      unquantified: true,
      title: usd$(br.headroom) + " of headroom remains in the " + pct(br.marginalRate) + " bracket",
      why: "Filling low brackets now with Roth conversions converts future higher-rate income into current lower-rate income, " + "and reduces the pre-tax balance that drives later required distributions and IRMAA.",
      action: "Model a conversion up to the top of the bracket, paying the tax from outside funds. Watch the IRMAA and ACA thresholds above, which bind before the bracket does.",
      ref: "IRC §408A · Form 8606"
    });
  }

  /* --- 2026 charitable floor --- */
  const charity = num((s.scheduleA || {}).charityCash) + num((s.scheduleA || {}).charityNonCash);
  if (charity > 0 && year === 2025 && C.charityAGIFloor === 0) {
    add({
      id: "charity26",
      cat: "Charitable",
      risk: "low",
      savings: 0,
      unquantified: true,
      title: "Charitable giving faces a new 0.5%-of-AGI floor starting in 2026",
      why: "From 2026, itemized charitable deductions count only above 0.5% of AGI, and top-bracket taxpayers lose 2/37ths of " + "total itemized deductions. Accelerating giving into 2025 avoids both, and bunching through a donor-advised fund clears the floor once instead of annually.",
      action: "Compare funding a donor-advised fund in 2025 against the same giving spread over 2026 and 2027.",
      ref: "IRC §170 as amended by OBBBA · Form 8283"
    });
  }
  if (charity > 0) {
    /* Bunching is a MULTI-YEAR strategy, so it is modeled over two full years
       rather than doubling one year and calling the change an annual benefit.
         Spread: the entered gift in year 1 and again in year 2.
         Bunch:  two years of gifts in year 1, none in year 2.
       Year 2 uses the following year's statutory parameters when they exist
       (TY2026 after TY2025); otherwise the same year's parameters are reused
       and the comparison is a same-law approximation. */
    const year2 = TY[year + 1] ? year + 1 : year;
    const withCharity = (amt, forceItemize) => {
      const c = structuredClone(s);
      c.scheduleA = {
        ...c.scheduleA,
        charityCash: amt
      };
      if (forceItemize) c.deductionMode = "itemized";else c.deductionMode = "auto";
      return c;
    };
    let bunchDetail = null;
    try {
      const spreadY1 = computeScenario(withCharity(charity, false), status, year).totalTax;
      const spreadY2 = computeScenario(withCharity(charity, false), status, year2).totalTax;
      const bunchY1 = computeScenario(withCharity(charity * 2, true), status, year).totalTax;
      const bunchY2 = computeScenario(withCharity(0, false), status, year2).totalTax;
      const spreadTotalTax = spreadY1 + spreadY2;
      const bunchTotalTax = bunchY1 + bunchY2;
      bunchDetail = {
        twoYearBenefit: spreadTotalTax - bunchTotalTax,
        annualizedBenefit: (spreadTotalTax - bunchTotalTax) / 2,
        bunchYearReduction: spreadY1 - bunchY1,
        offYearIncrease: bunchY2 - spreadY2,
        year2
      };
    } catch (e) {}
    if (bunchDetail && bunchDetail.twoYearBenefit > 500) {
      add({
        id: "bunch",
        cat: "Charitable",
        risk: "med",
        savings: bunchDetail.annualizedBenefit,
        title: "Charitable giving is spread evenly rather than bunched",
        why: "Modeled over the two-year window " + TY[year].label + "–" + TY[bunchDetail.year2].label + ": total two-year benefit " + usd$(bunchDetail.twoYearBenefit) + " (average " + usd$(bunchDetail.annualizedBenefit) + " per year). The bunch year's tax falls by " + usd$(bunchDetail.bunchYearReduction) + " while the off year's tax rises by " + usd$(bunchDetail.offYearIncrease) + " when the standard deduction replaces itemizing. Cash-flow timing: two years of gifts leave in year 1. The model includes the standard-vs-itemized switch, the AGI limits and floors of each year, and the QBI taxable-income interaction, because both years run through the full engine.",
        action: "Fund a donor-advised fund in the bunch year and grant out over time; take the standard deduction in the off year.",
        ref: "IRC §170 · Form 8283 · 60% AGI limit on cash"
      });
    }
  }

  /* --- Loss harvesting --- */
  const netGains = num(s.shortTermGains) + num(s.longTermGains);
  if (netGains > 0) {
    add({
      id: "tlh",
      cat: "Investment",
      risk: "med",
      savings: 0,
      unquantified: true,
      title: usd$(netGains) + " of capital gains realized with no harvested losses",
      why: "Harvesting losses offsets gains dollar for dollar, plus $3,000 against ordinary income, with the excess carried forward indefinitely.",
      action: "Review taxable accounts for loss positions; replace with a fund that is not substantially identical to keep the exposure.",
      ref: "IRC §1211, §1212 · the wash-sale window spans 61 days across every account including IRAs"
    });
  }

  /* --- Zero-rate capital gain harvesting --- */
  if (r.prefIncome === 0 && r.ordinaryTaxable < C.ltcg[status].zero) {
    add({
      id: "0lctg",
      cat: "Investment",
      risk: "low",
      savings: 0,
      unquantified: true,
      title: usd$(C.ltcg[status].zero - r.ordinaryTaxable) + " of long-term gain could be realized at a 0% federal rate",
      why: "Taxable income sits below the top of the 0% long-term capital gain bracket. Gains realized in that space are federally untaxed, " + "and repurchasing immediately steps up basis at no cost — the wash-sale rule does not apply to gains.",
      action: "Harvest gains up to the bracket ceiling and reacquire. Confirm state treatment separately.",
      ref: "IRC §1(h)"
    });
  }
  out.sort((a, b) => (b.savings || 0) - (a.savings || 0));
  return {
    r,
    findings: out
  };
}
const TAX_TYPES = [{
  key: "fedIncomeTax",
  label: "Federal income tax",
  note: "Progressive brackets, with preferential rates on long-term gain and qualified dividends"
}, {
  key: "seTax",
  label: "Self-employment tax",
  note: "15.3% on 92.35% of Schedule C net; the OASDI portion is capped at the wage base"
}, {
  key: "sCorpFICA",
  label: "S corporation payroll tax",
  note: "Employer and employee FICA on reasonable compensation"
}, {
  key: "addlMedicare",
  label: "Additional Medicare Tax",
  note: "0.9% above a statutory threshold that is never indexed"
}, {
  key: "niit",
  label: "Net investment income tax",
  note: "3.8% on investment income above a MAGI threshold that is never indexed"
}];
function taxTypeBreakdown(r) {
  const gross = r.fedIncomeTax + r.seTax + r.sCorpFICA + r.addlMedicare + r.niit;
  return TAX_TYPES.map(t => ({
    ...t,
    amount: r[t.key] || 0,
    share: gross > 0 ? (r[t.key] || 0) / gross : 0
  }));
}
function incomeAnalysis(r) {
  const p = r.incomeParts;
  const bySource = [{
    label: "Wages and S corporation compensation",
    amount: p.wages + p.sCorpComp,
    note: "Subject to FICA withholding"
  }, {
    label: "Schedule C business income",
    amount: p.schedC,
    note: "Subject to self-employment tax"
  }, {
    label: "Passthrough and K-1 income",
    amount: p.passthrough + p.sCorpK1,
    note: "Not subject to self-employment tax"
  }, {
    label: "Interest and dividends",
    amount: p.interest + p.ordDiv,
    note: "Ordinary rates; counts toward the NIIT base"
  }, {
    label: "Capital gains",
    amount: p.stGains + p.ltGains,
    note: "Long-term gain taxed at preferential rates"
  }, {
    label: "Retirement distributions and conversions",
    amount: p.iraDistributions + p.rothConversion,
    note: "Ordinary rates; inflates MAGI"
  }, {
    label: "Taxable Social Security",
    amount: p.socialSecurityTaxable,
    note: "Up to 85% may be taxable"
  }, {
    label: "Other income",
    amount: p.s1Income + p.other,
    note: "Ordinary rates"
  }].filter(x => x.amount !== 0);
  const pref = clamp0(p.ltGains) + clamp0(p.qualDiv);
  return {
    bySource,
    pref,
    investment: r.investmentIncome
  };
}
