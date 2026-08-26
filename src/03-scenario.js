/* ==== 03-scenario ==== */
/* ============================================================================
   FULL SCENARIO COMPUTATION — Form 1040 walk
   ========================================================================== */

const businessNet = b => num(b.grossReceipts) - num(b.returns) - num(b.cogs) - (b.expenses || []).reduce((a, e) => a + num(e.amount), 0);
const schedCTotal = sc => (sc && sc.businesses || []).reduce((a, b) => a + businessNet(b), 0);
const ptTotal = pt => (pt && pt.entities || []).reduce((a, e) => a + num(e.ordinary) + num(e.rental), 0);
const s1IncomeTotal = s1 => num(s1.stateRefund) + num(s1.unemployment) + num(s1.gambling) + num(s1.cancellationDebt) + num(s1.otherIncome);
/* Student loan interest is handled by computeStudentLoanInterest (cap, MAGI
   phase-out, MFS disallowance) — it must NOT flow in here at face value. */
const s1OtherAdjTotal = s1 => num(s1.educatorExpenses) + num(s1.earlyWithdrawalPenalty) + num(s1.alimonyPaid) + num(s1.otherAdjustments);

/* ============================================================================
   S CORPORATIONS
   The K-1 is DERIVED, never entered directly:

     K-1 ordinary business income
       = profit before owner compensation
       − owner W-2 compensation
       − employer payroll tax on that compensation
       − other corporate expenses

   The employer half of FICA is the corporation's expense, so it reduces the
   K-1 before anything reaches the return. Missing that step is the classic way
   an S-corporation comparison overstates the benefit.
   ========================================================================== */
function computeSCorp(e, C) {
  const profit = num(e.profitBeforeComp);
  const comp = clamp0(num(e.ownerComp));
  const otherExp = num(e.otherExpenses);
  const pct = (e.ownershipPct == null ? 100 : num(e.ownershipPct)) / 100;

  // Employer and employee halves are each 6.2% OASDI to the wage base plus 1.45% HI
  const oasdi = Math.min(comp, C.ssWageBase) * 0.062;
  const hi = comp * 0.0145;
  const employerFICA = comp > 0 ? oasdi + hi : 0;
  const employeeFICA = employerFICA;
  const k1Full = profit - comp - employerFICA - otherExp;
  const k1 = k1Full * pct;
  return {
    id: e.id,
    name: e.name,
    profit,
    comp,
    otherExp,
    pct,
    employerFICA,
    employeeFICA,
    totalFICA: employerFICA + employeeFICA,
    oasdi,
    hi,
    k1Full,
    k1,
    // Sec. 199A: owner compensation plus wages paid to non-owner employees
    qbiIncome: k1,
    qbiW2: (comp + num(e.nonOwnerW2)) * pct,
    qbiUbia: num(e.ubia) * pct,
    sstb: !!e.sstb,
    active: e.active !== false
  };
}
function scorpAll(s, C) {
  return (s.sCorps && s.sCorps.entities || []).map(e => computeSCorp(e, C));
}
function computeScenario(s, status, year) {
  const C = TY[year];

  /* ---- 1. Income ---- */
  /* S corporations first: their compensation and derived K-1 feed everything below. */
  const SCORPS = scorpAll(s, C);
  const scorpComp = SCORPS.reduce((a, x) => a + x.comp, 0);
  const scorpK1 = SCORPS.reduce((a, x) => a + x.k1, 0);
  const scorpEmployerFICA = SCORPS.reduce((a, x) => a + x.employerFICA, 0);
  const scorpEmployeeFICA = SCORPS.reduce((a, x) => a + x.employeeFICA, 0);
  const scorpProfitBeforeComp = SCORPS.reduce((a, x) => a + x.profit, 0);
  const wagesW2 = num(s.w2Wages);
  // Legacy scalar entries stay supported so older files and imports still load
  const sCorpComp = num(s.sCorpComp) + scorpComp;
  const interest = num(s.taxableInterest),
    ordDiv = num(s.ordinaryDividends),
    qualDiv = num(s.qualifiedDividends);
  const taxExemptInterest = num(s.taxExemptInterest);
  const stGains = num(s.shortTermGains),
    ltGains = num(s.longTermGains);
  const sCorpK1 = num(s.sCorpK1) + scorpK1;
  const rothConversion = num(s.rothConversion);
  const iraDistributions = num(s.iraDistributions);
  const socialSecurityTaxable = num(s.socialSecurityTaxable);
  const socialSecurityTotal = num(s.socialSecurityTotal);
  const schedC = schedCTotal(s.schedC),
    passthrough = ptTotal(s.passthrough);
  const s1Income = s1IncomeTotal(s.schedule1 || {}),
    other = num(s.otherIncome);

  /* Capital gains net against each other, and a net capital loss is deductible
     against ordinary income only up to $3,000 ($1,500 MFS) under Sec. 1211(b);
     the excess carries forward. */
  const capNetRaw = stGains + ltGains;
  const capLossLimit = status === "mfs" ? 1500 : 3000;
  const capitalIncluded = capNetRaw >= 0 ? capNetRaw : Math.max(capNetRaw, -capLossLimit);
  const capLossCarryforward = capNetRaw < -capLossLimit ? -capLossLimit - capNetRaw : 0;
  const grossIncome = wagesW2 + sCorpComp + interest + ordDiv + capitalIncluded + schedC + passthrough + sCorpK1 + s1Income + other + rothConversion + iraDistributions + socialSecurityTaxable;

  /* ---- 2. Employment taxes ---- */
  const w2SSWages = Math.min(wagesW2 + sCorpComp, C.ssWageBase);
  const SE = computeSETax(schedC, w2SSWages, C);
  /* Both halves are carried so an S election compares like for like against a
     sole proprietorship, where the owner bears all 15.3%. They are reported
     separately because only the employee half comes out of the owner's pay —
     the employer half already reduced the K-1. */
  const legacyComp = num(s.sCorpComp);
  const legacyEmployer = legacyComp > 0 ? Math.min(legacyComp, C.ssWageBase) * 0.062 + legacyComp * 0.0145 : 0;
  const employerFICA = scorpEmployerFICA + legacyEmployer;
  const employeeFICA = scorpEmployeeFICA + legacyEmployer;
  const sCorpFICA = employerFICA + employeeFICA;
  const AM = computeAddlMedicare(wagesW2 + sCorpComp, SE.netSE, status, C);

  /* Component breakdown of the modeled S-corp payroll taxes. The wage base is
     applied per entity (each employer withholds to the base independently);
     Social Security and Medicare are reported separately for each side. */
  const legacySS = legacyComp > 0 ? Math.min(legacyComp, C.ssWageBase) * 0.062 : 0;
  const legacyMed = legacyComp > 0 ? legacyComp * 0.0145 : 0;
  const payrollSS = SCORPS.reduce((a, x) => a + x.oasdi, 0) + legacySS;
  const payrollMed = SCORPS.reduce((a, x) => a + x.hi, 0) + legacyMed;
  const payroll = {
    employeeSS: payrollSS,
    employeeMedicare: payrollMed,
    employerSS: payrollSS,
    employerMedicare: payrollMed,
    additionalMedicare: AM.total,
    employeeTotal: employeeFICA,
    employerTotal: employerFICA,
    combined: sCorpFICA + AM.total
  };

  /* ---- 3-4. Retirement plan deduction ---- */
  const P = s.planning || {};
  const RET = computeRetirementOptions(schedC, SE.halfDeduction, num(P.age), C, {
    deferral: P.employeeDeferral
  });
  let retirementDeduction = 0,
    selectedPlan = null;
  if (P.planType && P.planType !== "none") {
    if (P.employerMode === "manual") {
      retirementDeduction = Math.min(num(P.employerManual) + num(P.employeeDeferral), RET.base);
      selectedPlan = {
        name: "Manual entry",
        total: retirementDeduction
      };
    } else {
      selectedPlan = RET.options.find(o => o.id === P.planType) || null;
      retirementDeduction = selectedPlan && selectedPlan.total != null ? selectedPlan.total : 0;
    }
  }
  /* NOTE: an S corporation's employer plan contribution is deducted by the
     corporation on Form 1120-S, not by the shareholder on Schedule 1. It is
     therefore already reflected in the K-1 the user enters, and must not be
     deducted again here. Only the shareholder's own elective deferral would
     appear on the W-2 as a reduction of box 1 wages. */
  const sCorpEmployerPlanCapacity = sCorpComp > 0 ? Math.min(0.25 * Math.min(sCorpComp, C.compLimit401a17), C.limit415c) : 0;

  /* ---- 5. Self-employed health insurance ---- */
  const SEHI = computeSEHI(s.sehi || {}, schedC, SE.halfDeduction, retirementDeduction, C);

  /* ---- 6. HSA ---- */
  const hsaAge = num(P.age);
  const hsaLimit = (P.hsaCoverage === "family" ? C.hsa.family : C.hsa.self) + (hsaAge >= 55 ? C.hsa.catchup55 : 0);
  let hsa = 0;
  if (P.hsaMode === "max") hsa = hsaLimit;else if (P.hsaMode === "manual") hsa = Math.min(num(P.hsaManual), hsaLimit);

  /* ---- 7-8. Remaining adjustments and the IRA deduction ---- */
  const s1AdjOther = s1OtherAdjTotal(s.schedule1 || {});
  const adjustmentsBeforeIRA = SE.halfDeduction + retirementDeduction + SEHI.deduction + hsa + s1AdjOther;
  const agiBeforeIRA = grossIncome - adjustmentsBeforeIRA;
  const compensationForIRA = wagesW2 + sCorpComp + clamp0(schedC - SE.halfDeduction - retirementDeduction);
  const IRA = computeIRA(s.ira || {}, agiBeforeIRA, compensationForIRA, status, C);
  const iraDeduction = s.ira && s.ira.enabled ? IRA.deductible : 0;

  /* Student loan interest: its own MAGI is AGI computed without this
     deduction, so it is applied last, after every other adjustment. */
  const foreignExclusionEarly = num(s.foreignExclusion);
  const magiBeforeStudentLoan = grossIncome - adjustmentsBeforeIRA - iraDeduction + foreignExclusionEarly;
  const SL = computeStudentLoanInterest((s.schedule1 || {}).studentLoanInterest, magiBeforeStudentLoan, status, C);
  const adjustments = adjustmentsBeforeIRA + iraDeduction + SL.allowed;
  const agi = grossIncome - adjustments;

  /* ---- 9. MAGI variants ---- */
  const foreignExclusion = num(s.foreignExclusion);
  /* Each provision's MAGI is AGI computed WITHOUT the deduction that provision
     governs, so the deduction is added back before testing its own phase-out. */
  const studentLoanDeduction = SL.allowed;
  const magi = {
    general: agi + foreignExclusion,
    niit: agi + foreignExclusion,
    roth: agi + foreignExclusion + iraDeduction + studentLoanDeduction - rothConversion,
    studentLoan: agi + foreignExclusion + studentLoanDeduction,
    ira: agiBeforeIRA + foreignExclusion,
    aca: agi + foreignExclusion + taxExemptInterest + clamp0(socialSecurityTotal - socialSecurityTaxable),
    irmaa: agi + foreignExclusion + taxExemptInterest
  };

  /* ---- 10. Schedule 1-A (below the line, does not touch AGI) ---- */
  const S1A = computeSchedule1A(s, magi.general, status, C);
  const seniorCount = Math.min(num((s.sched1A || {}).seniorCount), status === "mfj" ? 2 : 1);
  const blindCount = num((s.sched1A || {}).blindCount);
  const addlPer = status === "mfj" || status === "mfs" ? C.addlStdDedMarried : C.addlStdDedUnmarried;
  const addlStd = (seniorCount + blindCount) * addlPer;
  const stdDed = C.stdDeduction[status] + addlStd;

  // 2026 only: non-itemizers get an above-the-line-style charitable deduction
  const nonItemizerCharity = C.charityNonItemizer[status] > 0 ? Math.min(num((s.scheduleA || {}).charityCash), C.charityNonItemizer[status]) : 0;

  /* Only NET long-term gain gets preferential rates. A short-term loss absorbs
     long-term gain first, so it cannot both offset ordinary income and leave
     the gross long-term gain in the preferential bucket. */
  const netLTG = clamp0(clamp0(ltGains) - clamp0(-stGains));
  const netCapGain = netLTG + clamp0(qualDiv);

  /* ---- QBI entity resolution ----
     A linked entity derives its own figures instead of being typed twice:
       Schedule C  -> net profit less its share of the half-SE-tax, retirement
                      and self-employed health insurance deductions, which all
                      reduce qualified business income
       S corporation -> the derived K-1, with owner and non-owner W-2 wages
     Unlinked entities keep whatever was entered by hand. */
  const bizList = s.schedC && s.schedC.businesses || [];
  const positiveSchedC = bizList.reduce((a, b) => a + clamp0(businessNet(b)), 0);
  const seRelatedDeductions = SE.halfDeduction + retirementDeduction + SEHI.deduction;
  const qbiSrc = s.qbi || {
    entities: []
  };
  const qbiResolved = (qbiSrc.entities || []).map(e => {
    const link = e.link || "";
    if (link.indexOf("schedC:") === 0) {
      const b = bizList.find(x => x.id === link.slice(7));
      if (!b) return e;
      const net = businessNet(b);
      const share = positiveSchedC > 0 ? clamp0(net) / positiveSchedC : 0;
      /* Deductions attributable to self-employment reduce QBI. They are
         allocated across businesses in proportion to each business's share
         of positive Schedule C profit, and the allocation is carried on the
         entity so the methodology is visible, not inferred. */
      return {
        ...e,
        income: net - seRelatedDeductions * share,
        w2: num(b.w2wages),
        ubia: num(b.ubia),
        _derived: true,
        _alloc: {
          method: "Proportional to this business's share of positive Schedule C profit",
          share,
          seTaxHalf: SE.halfDeduction * share,
          retirement: retirementDeduction * share,
          sehi: SEHI.deduction * share,
          total: seRelatedDeductions * share
        }
      };
    }
    if (link.indexOf("scorp:") === 0) {
      const x = SCORPS.find(y => y.id === link.slice(6));
      if (!x) return e;
      return {
        ...e,
        income: x.qbiIncome,
        w2: x.qbiW2,
        ubia: x.qbiUbia,
        sstb: x.sstb,
        active: x.active,
        _derived: true
      };
    }
    return e;
  });
  const qbiInput = {
    ...qbiSrc,
    entities: qbiResolved
  };

  /* ---- 11-13. Itemized deductions, QBI and taxable income ----
     The 2026 overall limitation under Sec. 68 applies 2/37 to the lesser of
     total itemized deductions or the taxable income (before itemized
     deductions) in excess of the 37% bracket. That base is AGI reduced by the
     Schedule 1-A and Sec. 199A deductions — but Sec. 199A in turn depends on
     the itemized total, so the two are circular. Resolved with one iteration:
     pass 1 assumes no QBI deduction, pass 2 feeds the pass-1 result back in. */
  const solveDeductions = qbiGuess => {
    const A = schedATotal(s.scheduleA || {}, agi, status, C, clamp0(agi - S1A.total - qbiGuess));
    let deductionUsed, deductionKind;
    if (s.deductionMode === "standard") {
      deductionUsed = stdDed + nonItemizerCharity;
      deductionKind = "Standard";
    } else if (s.deductionMode === "itemized") {
      deductionUsed = A.total;
      deductionKind = "Itemized";
    } else if (A.total >= stdDed + nonItemizerCharity) {
      deductionUsed = A.total;
      deductionKind = "Itemized";
    } else {
      deductionUsed = stdDed + nonItemizerCharity;
      deductionKind = "Standard";
    }
    const tiBeforeQBI = clamp0(agi - deductionUsed - S1A.total);
    const Q = computeQBI(qbiInput, tiBeforeQBI, netCapGain, status, C);
    return {
      A,
      deductionUsed,
      deductionKind,
      tiBeforeQBI,
      Q
    };
  };
  let D = solveDeductions(0);
  if (C.itemizedCapApplies && D.Q.deduction > 0) D = solveDeductions(D.Q.deduction);
  const {
    A,
    deductionUsed,
    deductionKind,
    tiBeforeQBI,
    Q
  } = D;
  const taxableIncome = clamp0(tiBeforeQBI - Q.deduction);

  /* ---- 14. Income tax ---- */
  const pref = Math.min(taxableIncome, netCapGain);
  const ordinaryTaxable = clamp0(taxableIncome - pref);
  const ordTax = ordinaryTax(ordinaryTaxable, status, C);
  const cgTax = capitalGainsTax(ordinaryTaxable, pref, status, C);
  const fedIncomeTax = ordTax + cgTax;

  /* ---- 15. Surtaxes ---- */
  /* Net investment income: portfolio income plus net capital gain, plus
     passthrough income according to each activity's Sec. 1411 classification.
     A single passive checkbox is only the legacy fallback: an entity with no
     explicit classification keeps its old treatment (nonpassive excludes the
     ordinary income but the rental stays in NIIT) and is flagged for human
     review, because rental income should leave the base only after the
     activity has actually been classified. */
  const niitDetail = [];
  const niitReview = [];
  const passivePassthrough = (s.passthrough && s.passthrough.entities || []).reduce((a, e) => {
    const amt = num(e.ordinary) + num(e.rental);
    const cls = e.niitClass ? niitClassInfo(e.niitClass) : null;
    let included, label, review;
    if (cls) {
      included = cls.include ? amt : 0;
      label = cls.l;
      review = cls.review;
    } else {
      included = e.passive === false ? num(e.rental) : amt;
      label = e.passive === false ? "Legacy nonpassive checkbox — rental portion retained in NIIT" : "Legacy passive checkbox";
      review = e.passive === false && num(e.rental) !== 0;
    }
    niitDetail.push({
      name: e.name || "Passthrough entity",
      classification: label,
      amount: amt,
      included
    });
    if (review) niitReview.push((e.name || "Passthrough entity") + ": Sec. 1411 facts are insufficient — classify the activity (material participation, rental status, trade-or-business status) before relying on the NIIT result.");
    return a + included;
  }, 0);
  const passiveSCorp = SCORPS.filter(x => !x.active).reduce((a, x) => a + x.k1, 0);
  const investmentIncome = clamp0(interest + ordDiv + capitalIncluded + clamp0(passivePassthrough) + clamp0(passiveSCorp));
  const niit = 0.038 * Math.min(investmentIncome, clamp0(magi.niit - C.niitThreshold[status]));

  /* ---- 16. Credits ---- */
  const children = num(s.children);
  const ctcGross = children * C.ctc.amount;
  const ctcReduction = Math.ceil(clamp0(magi.general - C.ctc.threshold[status]) / 1000) * (C.ctc.rate * 1000);
  const ctc = clamp0(ctcGross - ctcReduction);
  const ctcAllowed = Math.min(ctc, fedIncomeTax);
  const otherCredits = num(s.otherCredits);
  const creditsApplied = Math.min(ctcAllowed + otherCredits, fedIncomeTax);

  /* ---- 17. Totals ---- */
  /* S corporation FICA is carried at the COMBINED employer and employee rate so
     that an S election can be compared like for like against a sole
     proprietorship, where the owner bears all 15.3%. The employer half is a
     corporate deduction, so a K-1 entered here should already be net of it.
     It is excluded from the Form 1040 balance due, which it does not belong to. */
  const totalTax = clamp0(fedIncomeTax - creditsApplied) + SE.total + sCorpFICA + AM.total + niit;
  const economicIncome = grossIncome + employerFICA;

  /* ---- Cash-flow view ----
     After-tax economic income treats taxes as the only outflow. Spendable
     cash then removes the money the plan itself consumes: retirement and HSA
     funding (still the client's assets, but not spendable this year) and
     charitable cash actually given. S-corporation employer plan contributions
     and administrative costs already reduced the K-1, so they must not be
     subtracted again here. */
  const charitableCashOutflow = num((s.scheduleA || {}).charityCash);
  const cashOutflows = {
    retirement: retirementDeduction,
    hsa,
    charitable: charitableCashOutflow,
    other: 0,
    total: retirementDeduction + hsa + charitableCashOutflow
  };
  const form1040Tax = clamp0(fedIncomeTax - creditsApplied) + SE.total + AM.total + niit;
  /* When the Estimated Taxes calculator's dated payment schedule is in use,
     it is the source of truth for estimated payments (the flat field is
     derived from it, never written independently — a single field write
     stays a single field write, with no second call racing the first). */
  const estimatedPaymentsResolved = (s.estimatedPaymentSchedule || []).length
    ? (s.estimatedPaymentSchedule || []).reduce((a, p) => a + num(p.amount), 0)
    : num(s.estimatedPayments);
  const payments = num(s.withholding) + estimatedPaymentsResolved;
  return {
    C,
    year,
    status,
    grossIncome,
    schedC,
    passthrough,
    s1Income,
    SE,
    sCorpFICA,
    AM,
    addlMedicare: AM.total,
    seTax: SE.total,
    seDeduction: SE.halfDeduction,
    netSE: SE.netSE,
    RET,
    retirementDeduction,
    selectedPlan,
    SEHI,
    sehiDeduction: SEHI.deduction,
    hsa,
    hsaLimit,
    IRA,
    iraDeduction,
    s1AdjOther,
    studentLoan: SL,
    adjustments,
    agi,
    agiBeforeIRA,
    magi,
    A,
    stdDed,
    addlStd,
    nonItemizerCharity,
    deductionUsed,
    deductionKind,
    itemized: A.total,
    S1A,
    sched1ATotal: S1A.total,
    seniorCountEntered: seniorCount,
    qbi: Q,
    tiBeforeQBI,
    taxableIncome,
    ordinaryTaxable,
    prefIncome: pref,
    ordTax,
    cgTax,
    fedIncomeTax,
    niit,
    niitDetail,
    niitReview,
    investmentIncome,
    ctc,
    ctcGross,
    ctcReduction,
    creditsApplied,
    otherCredits,
    totalTax,
    form1040Tax,
    payments,
    estimatedPaymentsResolved,
    balanceDue: form1040Tax - payments,
    sCorpEmployerPlanCapacity,
    capLossCarryforward,
    capitalIncluded,
    netLTG,
    SCORPS,
    scorpComp,
    scorpK1,
    scorpProfitBeforeComp,
    employerFICA,
    employeeFICA,
    payroll,
    /* Employer FICA is the corporation's expense and has already reduced the
       K-1, so adding it back restores the pre-tax business economics. That is
       the only base against which a sole proprietorship and an S corporation
       can be compared honestly. */
    economicIncome,
    afterTaxCash: economicIncome - totalTax,
    cashOutflows,
    spendableAfterTaxCash: economicIncome - totalTax - cashOutflows.total,
    effectiveRate: economicIncome > 0 ? totalTax / economicIncome : 0,
    effectiveRateOn1040: grossIncome > 0 ? totalTax / grossIncome : 0,
    afterTax: economicIncome - totalTax,
    marginal: marginalRate(ordinaryTaxable, status, C),
    ltcgMarginal: pref > 0 ? ordinaryTaxable + pref > C.ltcg[status].fifteen ? 0.20 : ordinaryTaxable + pref > C.ltcg[status].zero ? 0.15 : 0 : 0,
    incomeParts: {
      wages: wagesW2,
      sCorpComp,
      schedC,
      passthrough,
      sCorpK1,
      interest,
      ordDiv,
      qualDiv,
      taxExemptInterest,
      stGains,
      ltGains,
      s1Income,
      other,
      rothConversion,
      iraDistributions,
      socialSecurityTaxable
    }
  };
}

/* ============================================================================
   RECONCILIATION — Audit & Benchmarks tab, current-year check.
   Ordered top-to-bottom exactly as the Form 1040 walk: income, adjustments,
   AGI, deductions, QBI, taxable income, regular tax, capital-gain tax, AMT,
   SE/payroll taxes, NIIT/Additional Medicare, credits, total tax,
   withholding/payments, balance due. Every "Expected" is either an
   independent recomputation (a pure engine function called a second time
   from the reported inputs, e.g. ordinaryTax/capitalGainsTax/NIIT), a
   component-sum tie-out (the reported subtotal's own parts re-added), or a
   statutory bound check — never a copy of "Actual". AMT is honestly labeled
   not modeled: this engine does not compute Form 6251. */
function computeReconciliation(s, r, status, year) {
  const C = TY[year];
  const rows = [];
  const push = (key, section, label, expected, actual, authority, notes, kind) => {
    const numeric = typeof expected === "number" && typeof actual === "number";
    const variance = numeric ? actual - expected : null;
    const pass = kind === "bound" ? actual <= expected + 1
      : kind === "info" ? true
      : numeric ? Math.abs(variance) <= 1 : expected === actual;
    rows.push({
      key, section, check: label, expected, actual, variance,
      result: kind === "info" ? "Human review required" : pass ? "Reconciled" : "Variance",
      authority, notes: notes || "", kind: kind || "tie"
    });
  };

  // 1. Income — component sum ties to the reported gross income
  const ip = r.incomeParts;
  const incomeSum = ip.wages + ip.sCorpComp + r.schedC + r.passthrough + ip.sCorpK1 + ip.interest + ip.ordDiv +
    r.capitalIncluded + ip.s1Income + ip.other + ip.rothConversion + ip.iraDistributions + ip.socialSecurityTaxable;
  push("income", "Income", "Component sum ties to gross income", incomeSum, r.grossIncome,
    "Form 1040, lines 1–9", "Wages + S-corp comp + Schedule C + passthrough + S-corp K-1 + interest + dividends + net capital gain (loss-limited) + Schedule 1 income + other + Roth conversion + IRA distributions + taxable Social Security.");

  // 2. Adjustments to income — component sum
  const adjSum = r.seDeduction + r.retirementDeduction + r.sehiDeduction + r.hsa + r.s1AdjOther + r.iraDeduction + r.studentLoan.allowed;
  push("adjustments", "Adjustments", "Component sum ties to total adjustments", adjSum, r.adjustments,
    "Schedule 1, Part II", "Half of SE tax + retirement plan + SEHI + HSA + other Schedule 1 adjustments + IRA deduction + student loan interest.");

  // 3. AGI — independent recomputation from the two reported totals above
  push("agi", "AGI", "AGI = gross income − adjustments", r.grossIncome - r.adjustments, r.agi,
    "Form 1040, line 11");

  // 4. Deductions — recomputed from the scenario's own deduction-mode election
  const stdOrNonItemizer = r.stdDed + r.nonItemizerCharity;
  const expectedDeduction = s.deductionMode === "standard" ? stdOrNonItemizer
    : s.deductionMode === "itemized" ? r.itemized
    : Math.max(stdOrNonItemizer, r.itemized);
  push("deductions", "Deductions", "Deduction taken matches the " + (s.deductionMode === "auto" ? "larger of standard/itemized (auto)" : s.deductionMode + " election"),
    expectedDeduction, r.deductionUsed, "Form 1040, line 12");

  // 5. QBI — statutory 20%-of-taxable-income-before-QBI ceiling (Sec. 199A(a))
  push("qbi", "QBI", "QBI deduction within the 20%-of-taxable-income ceiling", 0.20 * r.tiBeforeQBI, r.qbi.deduction,
    "IRC §199A(a)", "Bound check, not an exact tie-out — the wage/UBIA and SSTB limits can bind below this ceiling.", "bound");

  // 6. Taxable income — independent recomputation
  push("taxable", "Taxable income", "Taxable income = AGI − deduction − Sched. 1-A − QBI",
    clamp0(r.agi - r.deductionUsed - r.sched1ATotal - r.qbi.deduction), r.taxableIncome, "Form 1040, line 15");

  // 7. Regular tax — independently recomputed by calling the bracket function again
  push("ordinary", "Tax", "Ordinary-rate tax independently recomputed from taxable income",
    ordinaryTax(r.ordinaryTaxable, status, C), r.ordTax, "IRC §1(j)");

  // 8. Capital-gain tax — independently recomputed
  push("capgain", "Tax", "Preferential-rate tax independently recomputed",
    capitalGainsTax(r.ordinaryTaxable, r.prefIncome, status, C), r.cgTax, "IRC §1(h)");

  // 9. AMT — honestly not modeled
  push("amt", "AMT", "Alternative minimum tax", null, "Not modeled", "Form 6251",
    "This engine does not compute Form 6251. If the client has large AMT preference items (ISO exercises, private-activity bond interest, or historically large SALT add-backs), compute AMT separately before relying on total tax.", "info");

  // 10. SE and payroll taxes — component breakdown (ties by construction)
  push("se-payroll", "Other taxes", "Self-employment + S-corp payroll tax component sum",
    r.SE.total + r.sCorpFICA, r.seTax + r.sCorpFICA, "Schedule SE; IRC §3121",
    "Reported as a breakdown of the components already inside total tax; not an independent recomputation.");

  // 11. NIIT + Additional Medicare Tax — independently recomputed
  const niitRecomputed = 0.038 * Math.min(r.investmentIncome, clamp0(r.magi.niit - C.niitThreshold[status]));
  const amRecomputed = computeAddlMedicare(ip.wages + ip.sCorpComp, r.SE.netSE, status, C).total;
  push("niit-addl", "Other taxes", "NIIT + Additional Medicare Tax independently recomputed",
    niitRecomputed + amRecomputed, r.niit + r.addlMedicare, "Form 8960 · Form 8959 · IRC §1411, §3101(b)(2)");

  // 12. Credits — independently recomputed from raw scenario fields
  const children = num(s.children);
  const ctcGross = children * C.ctc.amount;
  const ctcReduction = Math.ceil(clamp0(r.magi.general - C.ctc.threshold[status]) / 1000) * (C.ctc.rate * 1000);
  const ctcAllowed = Math.min(clamp0(ctcGross - ctcReduction), r.fedIncomeTax);
  const creditsRecomputed = Math.min(ctcAllowed + num(s.otherCredits), r.fedIncomeTax);
  push("credits", "Credits", "Nonrefundable credits independently recomputed", creditsRecomputed, r.creditsApplied,
    "IRC §24");

  // 13. Total tax — reconstructed from the reported components (final cross-foot)
  push("total-tax", "Total tax", "Total tax reconstructed from its own reported components",
    clamp0(r.fedIncomeTax - r.creditsApplied) + r.seTax + r.sCorpFICA + r.addlMedicare + r.niit, r.totalTax,
    "Form 1040, line 24");

  // 14. Withholding and estimated payments — matches raw scenario entries,
  // preferring the dated payment schedule over the flat field exactly as
  // the engine itself resolves it (see estimatedPaymentsResolved above).
  push("payments", "Payments", "Payments = withholding + estimated payments",
    num(s.withholding) + r.estimatedPaymentsResolved, r.payments, "Form 1040, lines 25–26");

  // 15. Balance due or refund
  push("balance", "Balance", "Balance = Form 1040 tax − payments", r.form1040Tax - r.payments, r.balanceDue,
    "Form 1040, lines 34–37");

  const reconciled = rows.filter(x => x.kind !== "info" && x.result === "Reconciled").length;
  const variances = rows.filter(x => x.result === "Variance").length;
  const review = rows.filter(x => x.kind === "info").length;
  return { rows, reconciled, variances, review, total: rows.length };
}

/* ============================================================================
   MAGI PHASE-OUT DASHBOARD
   Mirrors the MAGI Group 1-6 layout used in the projection scenarios, with a
   status flag for every threshold-sensitive provision.
   ========================================================================== */

function buildMAGIDashboard(r, status, year) {
  const C = TY[year];
  const M = r.magi;
  const groups = [];
  const flag = (value, lo, hi) => {
    if (hi == null) return value <= lo ? "under" : "above"; // hard limit
    if (value < lo) return "under";
    if (value >= hi) return "above";
    return "phaseout";
  };
  const item = (name, value, lo, hi, note, cite) => ({
    name,
    value,
    lo,
    hi,
    status: flag(value, lo, hi),
    note,
    cite
  });

  /* --- Group 1: general MAGI, credits and OBBBA deductions --- */
  const g1 = [];
  const mfj = status === "mfj";
  const kids = num(r.ctcGross) > 0 ? r.ctcGross / C.ctc.amount : 0;
  g1.push(item("Child Tax Credit", M.general, C.ctc.threshold[status], kids > 0 ? C.ctc.threshold[status] + kids * C.ctc.amount / C.ctc.rate : null, "$" + C.ctc.amount.toLocaleString() + " per qualifying child; reduced $50 per $1,000 of MAGI over the threshold" + (kids > 0 ? "" : " (no children entered, so the upper end is undefined)"), "IRC Sec. 24"));
  g1.push(item("Lifetime Learning Credit", M.general, mfj ? 160000 : 80000, mfj ? 180000 : 90000, "Up to $2,000 per return", "IRC Sec. 25A(d)"));
  g1.push(item("American Opportunity Credit", M.general, mfj ? 160000 : 80000, mfj ? 180000 : 90000, "Up to $2,500 per student, 40% refundable", "IRC Sec. 25A(i)"));
  g1.push(item("Coverdell ESA contribution", M.general, mfj ? 190000 : 95000, mfj ? 220000 : 110000, "$2,000 annual contribution limit", "IRC Sec. 530(c)"));
  const saverLimit = status === "mfj" ? year === 2026 ? 80500 : 79000 : status === "hoh" ? year === 2026 ? 60375 : 59250 : year === 2026 ? 40250 : 39500;
  g1.push(item("Saver's Credit", M.general, saverLimit, null, "Credit of 10-50% of retirement contributions; a hard AGI cutoff, not a phase-out", "IRC Sec. 25B"));
  g1.push(item("Clean Vehicle Credit (new)", M.general, mfj ? 300000 : 150000, null, "Hard MAGI limit, no phase-out; may use the prior year's MAGI", "IRC Sec. 30D(f)(10)"));
  g1.push(item("Clean Vehicle Credit (used)", M.general, mfj ? 150000 : 75000, null, "Hard MAGI limit", "IRC Sec. 25E(b)"));
  if (C.seniorDeduction) {
    // The upper end depends on how many qualifying individuals there are, so it
    // tracks the actual entry rather than assuming two on a joint return.
    const seniorCount = Math.max(1, Math.min(r.seniorCountEntered || 1, mfj ? 2 : 1));
    g1.push(item("Senior deduction ($6,000)", M.general, C.seniorDeduction.threshold[status], C.seniorDeduction.threshold[status] + C.seniorDeduction.amount * seniorCount / C.seniorDeduction.rate, "OBBBA 2025-2028; reduced 6% of MAGI over the threshold. Range shown for " + seniorCount + " qualifying individual" + (seniorCount > 1 ? "s" : ""), "OBBBA Sec. 70103"));
  }
  g1.push(item("SALT deduction cap", M.general, C.saltThreshold[status], C.saltThreshold[status] + (C.saltCap[status] - C.saltFloor[status]) / C.saltPhaseRate, "Cap of " + usd$(C.saltCap[status]) + " reduced 30% of MAGI over the threshold, floor " + usd$(C.saltFloor[status]), "IRC Sec. 164(b)(6)"));
  g1.push(item("Qualified tips deduction", M.general, C.tips.threshold[status], C.tips.threshold[status] + C.tips.cap / C.tips.rate, "OBBBA 2025-2028; up to " + usd$(C.tips.cap), "OBBBA Sec. 70201"));
  g1.push(item("Qualified overtime deduction", M.general, C.overtime.threshold[status], C.overtime.threshold[status] + C.overtime.cap[status] / C.overtime.rate, "OBBBA 2025-2028; up to " + usd$(C.overtime.cap[status]), "OBBBA Sec. 70202"));
  g1.push(item("Car loan interest deduction", M.general, C.autoLoan.threshold[status], C.autoLoan.threshold[status] + C.autoLoan.cap / C.autoLoan.rate, "OBBBA 2025-2028; up to " + usd$(C.autoLoan.cap) + " on a US-assembled new vehicle", "OBBBA Sec. 70203"));
  groups.push({
    n: 1,
    label: "MAGI Group 1 — credits and OBBBA deductions",
    value: M.general,
    items: g1,
    def: "AGI increased by any foreign earned income exclusion and US possession exclusions."
  });

  /* --- Group 2: NIIT --- */
  groups.push({
    n: 2,
    label: "MAGI Group 2 — net investment income tax",
    value: M.niit,
    def: "AGI increased by the foreign earned income exclusion. Threshold fixed by statute and never indexed.",
    items: [item("Net Investment Income Tax (3.8%)", M.niit, C.niitThreshold[status], null, "Applies to the lesser of net investment income or the MAGI excess", "IRC Sec. 1411"), item("Additional Medicare Tax (0.9%)", M.niit, C.addlMedThreshold[status], null, "On wages plus self-employment income above the threshold", "IRC Sec. 3101(b)(2)")]
  });

  /* --- Group 3: Roth --- */
  groups.push({
    n: 3,
    label: "MAGI Group 3 — Roth IRA contribution",
    value: M.roth,
    def: "AGI less any income from a Roth conversion, plus certain exclusions.",
    items: [item("Roth IRA contribution", M.roth, C.rothPhaseout[status][0], C.rothPhaseout[status][1], "Contribution limit " + usd$(C.iraLimit) + " plus " + usd$(C.iraCatchup) + " catch-up at 50+", "IRC Sec. 408A(c)(3)")]
  });

  /* --- Group 4: student loan interest --- */
  const slRange = status === "mfj" ? year === 2026 ? [170000, 200000] : [170000, 200000] : year === 2026 ? [85000, 100000] : [85000, 100000];
  groups.push({
    n: 4,
    label: "MAGI Group 4 — student loan interest",
    value: M.studentLoan,
    def: "AGI before the student loan interest deduction and certain exclusions.",
    items: [item("Student loan interest deduction", M.studentLoan, slRange[0], slRange[1], "Maximum $2,500; not available to married filing separately", "IRC Sec. 221(b)(2)")]
  });

  /* --- Group 5: IRA deductibility --- */
  const g5 = [];
  if (C.iraCovered[status]) {
    g5.push(item("IRA deduction — covered by a workplace plan", M.ira, C.iraCovered[status][0], C.iraCovered[status][1], "Phased amount rounds up to the next $10 with a $200 floor", "IRC Sec. 219(g)(3)"));
  }
  if (C.iraSpouseCovered[status]) {
    g5.push(item("IRA deduction — spouse covered only", M.ira, C.iraSpouseCovered[status][0], C.iraSpouseCovered[status][1], "Applies when the contributing spouse is not covered", "IRC Sec. 219(g)(7)"));
  }
  if (!g5.length) g5.push(item("IRA deduction — neither spouse covered", M.ira, Infinity, null, "No MAGI limitation applies", "IRC Sec. 219(g)"));
  groups.push({
    n: 5,
    label: "MAGI Group 5 — traditional IRA deductibility",
    value: M.ira,
    items: g5,
    def: "AGI computed before the IRA deduction itself, plus certain exclusions."
  });

  /* --- Group 6: ACA and Medicare --- */
  groups.push({
    n: 6,
    label: "MAGI Group 6 — ACA premium credit and Medicare",
    value: M.aca,
    def: "AGI plus tax-exempt interest, untaxed Social Security benefits, and excluded foreign income.",
    items: [],
    special: "aca"
  });
  return groups;
}

/* ---- ACA premium tax credit position ---- */
function computeACA(magiACA, householdSize) {
  const fpl = FPL_2025.base + FPL_2025.increment * clamp0(householdSize - 1);
  const pct = fpl > 0 ? magiACA / fpl * 100 : 0;
  let band = null;
  for (const b of APPLICABLE_PCT_2026) {
    if (pct >= b.lo && pct < b.hi) {
      band = b;
      break;
    }
  }
  let applicablePct = null;
  if (band) {
    const span = band.hi - band.lo;
    applicablePct = span > 0 ? band.initial + (band.final - band.initial) * ((pct - band.lo) / span) : band.initial;
  }
  const overCliff = pct > 400;
  return {
    fpl,
    pct,
    band,
    applicablePct,
    overCliff,
    expectedContribution: applicablePct != null ? magiACA * (applicablePct / 100) : null
  };
}

/* ---- Medicare IRMAA position ---- */
function computeIRMAA(magi, status) {
  const key = status === "mfj" ? "mfj" : status === "mfs" ? "mfs" : "single";
  const T = IRMAA_2026.tiers;
  let tier = T[T.length - 1],
    idx = T.length - 1;
  for (let i = 0; i < T.length; i++) {
    const lim = T[i][key];
    if (lim != null && magi <= lim) {
      tier = T[i];
      idx = i;
      break;
    }
  }
  const nextTier = T[idx + 1] || null;
  const nextThreshold = idx < T.length - 1 ? T[idx][key] : null;
  return {
    tier,
    idx,
    nextTier,
    nextThreshold,
    partB: tier.partB,
    partD: tier.partD,
    annualCost: (tier.partB + tier.partD) * 12,
    totalPartB: IRMAA_2026.standardPartB + tier.partB,
    headroom: nextThreshold != null && nextThreshold !== Infinity ? nextThreshold - magi : null,
    cliffCost: nextTier ? (nextTier.partB - tier.partB + (nextTier.partD - tier.partD)) * 12 : 0
  };
}
