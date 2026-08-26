/* ==== 02-engine ==== */
/* ============================================================================
   COMPUTATION ENGINE
   ========================================================================== */

/* ---- Rate application ---- */
function ordinaryTax(ti, status, C) {
  if (ti <= 0) return 0;
  const b = C.brackets[status];
  let tax = 0;
  for (let i = 0; i < b.length; i++) {
    const floor = b[i][0],
      rate = b[i][1];
    const ceil = i + 1 < b.length ? b[i + 1][0] : Infinity;
    if (ti > floor) tax += (Math.min(ti, ceil) - floor) * rate;else break;
  }
  return tax;
}
function marginalRate(ti, status, C) {
  const b = C.brackets[status];
  let r = b[0][1];
  for (let i = 0; i < b.length; i++) if (ti > b[i][0]) r = b[i][1];
  return r;
}

/* Preferential rates stack ON TOP of ordinary taxable income. */
function capitalGainsTax(ordinaryTaxable, pref, status, C) {
  if (pref <= 0) return 0;
  const b = C.ltcg[status];
  const start = clamp0(ordinaryTaxable),
    end = start + pref;
  let tax = 0;
  tax += clamp0(Math.min(end, b.fifteen) - Math.max(start, b.zero)) * 0.15;
  tax += clamp0(end - Math.max(start, b.fifteen)) * 0.20;
  return tax;
}
function bracketFill(ordinaryTaxable, status, C) {
  const b = C.brackets[status];
  const rows = [];
  for (let i = 0; i < b.length; i++) {
    const floor = b[i][0],
      rate = b[i][1];
    const ceil = i + 1 < b.length ? b[i + 1][0] : Infinity;
    const income = clamp0(Math.min(ordinaryTaxable, ceil) - floor);
    rows.push({
      rate,
      floor,
      ceil,
      income,
      tax: income * rate
    });
  }
  const marginalRow = [...rows].reverse().find(r => r.income > 0) || rows[0];
  const headroom = marginalRow.ceil === Infinity ? Infinity : marginalRow.ceil - ordinaryTaxable;
  return {
    rows,
    headroom,
    marginalRate: marginalRow.rate
  };
}

/* ============================================================================
   SELF-EMPLOYMENT TAX — Schedule SE
   Net earnings = Schedule C net x 92.35%. OASDI capped at the wage base
   reduced by W-2 Social Security wages already taxed. Medicare uncapped.
   Under $400 of net earnings, no SE tax at all.
   ========================================================================== */
function computeSETax(schedCNet, w2SocialSecurityWages, C) {
  const netSE = schedCNet > 0 ? schedCNet * 0.9235 : 0;
  if (netSE < 400) {
    return {
      netSE,
      ss: 0,
      medicare: 0,
      total: 0,
      halfDeduction: 0,
      ssBaseRemaining: 0,
      belowThreshold: true
    };
  }
  const ssBaseRemaining = clamp0(C.ssWageBase - clamp0(w2SocialSecurityWages));
  const ss = Math.min(netSE, ssBaseRemaining) * 0.124;
  const medicare = netSE * 0.029;
  const total = ss + medicare;
  return {
    netSE,
    ss,
    medicare,
    total,
    halfDeduction: total * 0.5,
    ssBaseRemaining,
    belowThreshold: false
  };
}

/* Additional Medicare Tax: the threshold is first reduced by wages (but not
   below zero), then applied to self-employment income. */
function computeAddlMedicare(wages, netSE, status, C) {
  const threshold = C.addlMedThreshold[status];
  const onWages = clamp0(wages - threshold) * 0.009;
  const reducedThreshold = clamp0(threshold - wages);
  const onSE = clamp0(netSE - reducedThreshold) * 0.009;
  return {
    onWages,
    onSE,
    total: onWages + onSE,
    reducedThreshold
  };
}

/* ============================================================================
   SELF-EMPLOYED RETIREMENT PLAN OPTIMIZER
   The circular calculation: the contribution reduces earned income, and the
   contribution limit is a percentage of earned income. Resolved by the
   r/(1+r) reduced rate, so a 25% plan yields an effective 20% of the base.
   Base = Schedule C net profit less one-half SE tax.
   ========================================================================== */
function reducedRate(r) {
  return r / (1 + r);
}
function computeRetirementOptions(schedCNet, halfSETax, age, C, opts) {
  opts = opts || {};
  const base = clamp0(schedCNet - halfSETax); // earned income before plan contribution
  const catchUp = age >= 50 ? C.catchup50 : 0;
  const superCatch = age >= 60 && age <= 63 ? C.superCatchup6063 : 0;
  // SECURE 2.0: the age 60-63 super catch-up replaces the age-50 catch-up, not additive
  const effCatchup = superCatch > 0 ? superCatch : catchUp;
  const simpleCatch = age >= 50 ? age >= 60 && age <= 63 ? C.simpleSuperCatchup : C.simpleCatchup : 0;
  const out = [];

  /* --- SEP IRA (25% plan -> effective 20%) --- */
  const sepUncapped = reducedRate(0.25) * base;
  const sep = Math.min(sepUncapped, 0.25 * C.compLimit401a17, C.limit415c, base);
  out.push({
    id: "sep",
    name: "SEP IRA",
    employer: sep,
    employee: 0,
    catchup: 0,
    total: sep,
    binding: sep >= C.limit415c - 0.5 ? "Sec. 415(c) annual additions limit" : sep >= 0.25 * C.compLimit401a17 - 0.5 ? "Sec. 401(a)(17) compensation limit" : "20% of net earnings after half SE tax",
    note: "Employer-only. Deduction limited to 25% of compensation, which resolves to 20% of the base after the circular adjustment.",
    cite: "IRC Sec. 404(h)(1)(C), Sec. 415(c) - Pub 560"
  });

  /* --- Solo 401(k): employee deferral + employer profit share ---
     This table answers "what is the MAXIMUM deductible contribution under each
     design", so an unspecified (or zero) election defaults to the full
     statutory deferral rather than to nothing. */
  const deferralRequested = num(opts.deferral) > 0 ? num(opts.deferral) : C.deferral402g;
  const employeeDeferral = Math.min(deferralRequested, C.deferral402g, base);
  const employeeCatchup = Math.min(effCatchup, clamp0(base - employeeDeferral));
  const employerRoom = Math.min(reducedRate(0.25) * base, 0.25 * C.compLimit401a17);
  // Annual additions cap is 415(c), with catch-up contributions sitting outside it
  const additionsRoom = clamp0(Math.min(C.limit415c, base) - employeeDeferral);
  const employerShare = Math.min(employerRoom, additionsRoom);
  // The total deduction can never exceed earned income (IRC Sec. 404(a)(8)(C)).
  // Trim the catch-up first, then the employer share, so the elective deferral survives longest.
  let soloCatch = employeeCatchup,
    soloEmployer = employerShare;
  let overshoot = clamp0(employeeDeferral + soloCatch + soloEmployer - base);
  const trimCatch = Math.min(soloCatch, overshoot);
  soloCatch -= trimCatch;
  overshoot -= trimCatch;
  soloEmployer = clamp0(soloEmployer - overshoot);
  const solo = employeeDeferral + soloCatch + soloEmployer;
  out.push({
    id: "solo401k",
    name: "Solo 401(k)",
    employer: soloEmployer,
    employee: employeeDeferral,
    catchup: soloCatch,
    total: solo,
    binding: solo >= base - 0.5 ? "Earned income ceiling, Sec. 404(a)(8)(C)" : employeeDeferral + soloEmployer >= C.limit415c - 0.5 ? "Sec. 415(c) annual additions limit" : soloEmployer >= employerRoom - 0.5 ? "20% employer profit-share ceiling" : "Elective deferral limit",
    note: "Employee elective deferral plus employer profit share. The deferral is a single per-person limit shared across every 401(k) and 403(b) the taxpayer participates in.",
    cite: "IRC Sec. 401(k), Sec. 402(g), Sec. 415(c)"
  });

  /* --- SIMPLE IRA, 3% match ---
     The Sec. 401(a)(17) compensation cap applies to the 2% nonelective
     contribution but NOT to the matching contribution. The match is limited to
     the lesser of 3% of compensation or the amount actually deferred, counting
     catch-up contributions. */
  const simpleDeferral = Math.min(C.simpleDeferral, base);
  const simpleCatchAmt = Math.min(simpleCatch, clamp0(base - simpleDeferral));
  const simpleMatch = Math.min(0.03 * base, simpleDeferral + simpleCatchAmt);
  const simple3Total = Math.min(simpleDeferral + simpleMatch + simpleCatchAmt, base);
  out.push({
    id: "simple3",
    name: "SIMPLE IRA (3% match)",
    employer: simpleMatch,
    employee: simpleDeferral,
    catchup: simpleCatchAmt,
    total: simple3Total,
    binding: simple3Total >= base - 0.5 ? "Earned income ceiling" : "Salary reduction limit plus 3% employer match",
    note: "Employer match is capped at the lesser of 3% of compensation or the amount actually deferred. The Sec. 401(a)(17) compensation cap does not apply to the match.",
    cite: "IRC Sec. 408(p)(2)(A)(iii), Sec. 404(m)(1)"
  });

  /* --- SIMPLE IRA, 2% nonelective --- */
  const simpleNonelective = 0.02 * Math.min(base, C.compLimit401a17);
  const simple2Total = Math.min(simpleDeferral + simpleNonelective + simpleCatchAmt, base);
  out.push({
    id: "simple2",
    name: "SIMPLE IRA (2% nonelective)",
    employer: simpleNonelective,
    employee: simpleDeferral,
    catchup: simpleCatchAmt,
    total: simple2Total,
    binding: simple2Total >= base - 0.5 ? "Earned income ceiling" : "Salary reduction limit plus 2% nonelective contribution",
    note: "The 2% nonelective contribution is made for every eligible employee whether or not they defer, and is capped by the Sec. 401(a)(17) compensation limit.",
    cite: "IRC Sec. 408(p)(2)(B)"
  });

  /* --- Profit sharing (25% plan, employer only) --- */
  const ps = Math.min(reducedRate(0.25) * base, 0.25 * C.compLimit401a17, C.limit415c, base);
  out.push({
    id: "profitshare",
    name: "Profit sharing plan",
    employer: ps,
    employee: 0,
    catchup: 0,
    total: ps,
    binding: ps >= C.limit415c - 0.5 ? "Sec. 415(c) annual additions limit" : "25% of compensation deduction limit",
    note: "Discretionary employer contribution. Same arithmetic as a SEP but with a qualified plan's vesting and Form 5500 obligations.",
    cite: "IRC Sec. 404(a)(3)(A), Sec. 415(c)"
  });

  /* --- Defined benefit: actuarially determined, shown for scale only --- */
  out.push({
    id: "db",
    name: "Defined benefit plan",
    employer: null,
    employee: 0,
    catchup: 0,
    total: null,
    binding: "Actuarially determined",
    note: "The deductible contribution is set by an actuary and can far exceed the defined contribution limits. The Sec. 415(b) annual benefit ceiling is " + usd$(C.limit415b) + " for " + C.year + ". Not modeled here - engage an actuary.",
    cite: "IRC Sec. 415(b), Sec. 404(o)",
    actuarial: true
  });
  return {
    base,
    options: out,
    catchUpApplied: effCatchup,
    isSuperCatchup: superCatch > 0
  };
}

/* ============================================================================
   SELF-EMPLOYED HEALTH INSURANCE — IRC Sec. 162(l), Form 7206
   Limited to earned income from the business that established the plan,
   measured AFTER the half-SE-tax and retirement plan deductions.
   Long-term care premiums are separately capped by age.
   Not available for any month the taxpayer was eligible for a subsidized
   employer plan (their own, a spouse's, or a dependent's).
   ========================================================================== */
function ltcCapForAge(age, C) {
  for (const [maxAge, cap] of C.ltcPremiumCap) if (age <= maxAge) return cap;
  return 0;
}
function computeSEHI(input, schedCNet, halfSETax, retirementDeduction, C) {
  const medical = clamp0(num(input.medicalPremiums));
  const ltcPeople = input.ltcInsured || [];
  const ltcAllowed = ltcPeople.reduce((a, p) => a + Math.min(clamp0(num(p.premium)), ltcCapForAge(num(p.age), C)), 0);
  const ltcPaid = ltcPeople.reduce((a, p) => a + clamp0(num(p.premium)), 0);
  const ltcDisallowed = clamp0(ltcPaid - ltcAllowed);
  const earnedIncome = clamp0(schedCNet - halfSETax - retirementDeduction);
  const beforeCap = medical + ltcAllowed;
  const eligibleMonths = input.employerPlanEligible ? clamp0(12 - num(input.employerPlanMonths)) : 12;
  const monthFactor = eligibleMonths / 12;
  const afterMonths = beforeCap * monthFactor;
  const deduction = Math.min(afterMonths, earnedIncome);
  return {
    medical,
    ltcPaid,
    ltcAllowed,
    ltcDisallowed,
    earnedIncome,
    beforeCap,
    eligibleMonths,
    afterMonths,
    deduction,
    limitedByEarnedIncome: afterMonths > earnedIncome + 0.5,
    // Premiums that fail the Sec. 162(l) limit fall back to Schedule A medical
    schedAFallback: clamp0(medical + ltcAllowed - deduction) + ltcDisallowed
  };
}

/* ============================================================================
   IRA DEDUCTIBILITY — IRC Sec. 219(g)
   ========================================================================== */
function phaseOutFraction(magi, range) {
  const [lo, hi] = range;
  if (magi <= lo) return 1;
  if (magi >= hi) return 0;
  return (hi - magi) / (hi - lo);
}
function computeIRA(input, magi, compensation, status, C) {
  const age = num(input.age);
  const limit = C.iraLimit + (age >= 50 ? C.iraCatchup : 0);
  const contributed = num(input.contribution);
  // Contributions are capped by taxable compensation
  const contributionCeiling = Math.min(limit, clamp0(compensation));
  let range = null,
    coverageLabel = "Neither spouse covered by a workplace plan";
  if (input.coverage === "self") {
    range = C.iraCovered[status];
    coverageLabel = "Covered by a workplace plan";
  } else if (input.coverage === "spouse") {
    range = C.iraSpouseCovered[status] || null;
    coverageLabel = "Not covered, but spouse is covered";
  }
  let deductibleCeiling = contributionCeiling;
  let fraction = 1;
  if (range) {
    fraction = phaseOutFraction(magi, range);
    // Sec. 219(g)(2)(B): the phased amount is rounded up to the next $10, with a
    // $200 floor if any deduction survives at all.
    let phased = contributionCeiling * fraction;
    if (fraction > 0) phased = Math.max(200, Math.ceil(phased / 10) * 10);
    deductibleCeiling = Math.min(contributionCeiling, phased);
  }
  const deductible = Math.min(clamp0(contributed), deductibleCeiling);
  const nondeductible = clamp0(Math.min(contributed, contributionCeiling) - deductible);
  const rothRange = C.rothPhaseout[status];
  const rothFraction = phaseOutFraction(magi, rothRange);
  let rothCeiling = contributionCeiling * rothFraction;
  if (rothFraction > 0 && rothFraction < 1) rothCeiling = Math.max(200, Math.ceil(rothCeiling / 10) * 10);
  return {
    limit,
    contributionCeiling,
    deductible,
    nondeductible,
    range,
    rothRange,
    fraction,
    rothFraction,
    rothCeiling: Math.min(contributionCeiling, rothCeiling),
    coverageLabel,
    excess: clamp0(contributed - contributionCeiling),
    backdoorIndicated: rothFraction === 0 && contributionCeiling > 0
  };
}

/* ============================================================================
   QBI DEDUCTION — IRC Sec. 199A
   Per entity: the deductible amount is the lesser of 20% of QBI or the
   greater of (a) 50% of W-2 wages or (b) 25% of wages plus 2.5% of UBIA.
   Both the wage/capital limit and the SSTB exclusion phase in ratably across
   the threshold range.
   ========================================================================== */
function qbiEntityAmount(e, status, taxableIncomeBeforeQBI, C) {
  const threshold = C.qbiThreshold[status];
  const width = C.qbiPhaseInWidth[status];
  const excess = clamp0(taxableIncomeBeforeQBI - threshold);
  const phaseRatio = width > 0 ? Math.min(1, excess / width) : excess > 0 ? 1 : 0;
  const inPhaseIn = excess > 0 && phaseRatio < 1;
  const fullyLimited = phaseRatio >= 1;
  let income = num(e.income),
    w2 = num(e.w2),
    ubia = num(e.ubia);

  // SSTB: below the threshold it is treated as any other business; inside the
  // range only an applicable percentage of its items counts; above, nothing does.
  let applicablePct = 1;
  if (e.sstb) {
    applicablePct = 1 - phaseRatio;
    income *= applicablePct;
    w2 *= applicablePct;
    ubia *= applicablePct;
    if (fullyLimited) return {
      component: 0,
      tentative: 0,
      wageLimit: 0,
      applicablePct: 0,
      phaseRatio,
      sstbExcluded: true,
      income: 0
    };
  }
  const tentative = 0.20 * income;
  const wageLimit = Math.max(0.5 * w2, 0.25 * w2 + 0.025 * ubia);
  let component;
  if (excess <= 0) {
    component = tentative; // below the threshold, no wage limit
  } else if (fullyLimited) {
    component = income > 0 ? Math.min(tentative, wageLimit) : tentative;
  } else {
    // Ratable phase-in of the wage/capital limit
    const excessAmount = clamp0(tentative - wageLimit);
    component = tentative - excessAmount * phaseRatio;
  }
  return {
    component,
    tentative,
    wageLimit,
    applicablePct,
    phaseRatio,
    sstbExcluded: false,
    income
  };
}
function computeQBI(qbi, taxableIncomeBeforeQBI, netCapGain, status, C) {
  const cap = 0.20 * clamp0(taxableIncomeBeforeQBI - netCapGain);
  if (qbi.useManual) {
    const d = Math.min(num(qbi.manualAmount), cap);
    return {
      deduction: clamp0(d),
      component: num(qbi.manualAmount),
      cap,
      entities: [],
      manual: true,
      tentativeTotal: num(qbi.manualAmount),
      wageLimitTotal: null,
      limits: [],
      binding: null
    };
  }
  const rawEnts = qbi.entities || [];
  const totalRawQBI = rawEnts.reduce((a, e) => a + num(e.income), 0);
  const carryforward = clamp0(num(qbi.priorNegativeCarryforward));

  /* A prior-year negative QBI carryover reduces QBI itself, and the wage/UBIA
     limit is then applied to the REDUCED amount (Reg. Sec. 1.199A-1(d)(2)(iii)(B)).
     Netting it against the post-limit component understates the deduction.
     The loss is allocated across entities in proportion to positive QBI. */
  const ents = carryforward > 0 && totalRawQBI > 0 ? rawEnts.map(e => ({
    ...e,
    income: num(e.income) - carryforward * (clamp0(num(e.income)) / Math.max(1, rawEnts.reduce((a, x) => a + clamp0(num(x.income)), 0)))
  })) : rawEnts;
  const detail = ents.map((e, i) => ({
    e: rawEnts[i],
    r: qbiEntityAmount(e, status, taxableIncomeBeforeQBI, C)
  }));

  /* The three limitations are computed independently and reported separately so
     the binding one is visible, rather than inferring it from the result:
       1. 20% of qualified business income
       2. the applicable W-2 wage / UBIA limitation
       3. 20% of taxable income net of capital gain
     The allowed deduction is the least of the three. */
  const tentativeTotal = detail.reduce((a, d) => a + d.r.tentative, 0);
  const wageLimitTotal = detail.reduce((a, d) => a + d.r.wageLimit, 0);
  let component;
  if (qbi.aggregate) {
    // Aggregation combines income, wages and UBIA before applying the limit.
    // SSTBs may not be aggregated, so they are computed separately.
    const nonSSTB = ents.filter(e => !e.sstb);
    const agg = {
      income: nonSSTB.reduce((a, e) => a + num(e.income), 0),
      w2: nonSSTB.reduce((a, e) => a + num(e.w2), 0),
      ubia: nonSSTB.reduce((a, e) => a + num(e.ubia), 0),
      sstb: false
    };
    const aggR = qbiEntityAmount(agg, status, taxableIncomeBeforeQBI, C);
    const sstbSum = detail.filter(d => d.e.sstb).reduce((a, d) => a + d.r.component, 0);
    component = aggR.component + sstbSum;
  } else {
    component = detail.reduce((a, d) => a + d.r.component, 0);
  }
  const totalQBI = totalRawQBI;
  const netQBI = totalQBI - carryforward;

  // Net negative QBI produces no deduction and carries forward again
  if (netQBI < 0) {
    return {
      deduction: 0,
      component: 0,
      cap,
      entities: detail,
      negative: true,
      carryforwardOut: Math.abs(netQBI),
      totalQBI,
      netQBI,
      carryforward,
      tentativeTotal,
      wageLimitTotal,
      limits: [],
      binding: null
    };
  }
  component = clamp0(component);
  let deduction = Math.min(component, cap);

  /* OBBBA minimum deduction, first effective 2026. Above the threshold an SSTB
     is not a qualified trade or business at all, so its income cannot support
     the floor — only the portion counted under the applicable percentage does. */
  let minApplied = false;
  const activeQBI = detail.filter(d => d.e.active).reduce((a, d) => a + num(d.e.income) * (d.e.sstb ? d.r.applicablePct : 1), 0);
  if (C.qbiMinDeduction > 0 && activeQBI >= C.qbiMinQBIFloor && deduction < C.qbiMinDeduction) {
    deduction = Math.min(C.qbiMinDeduction, cap);
    minApplied = true;
  }
  const wageLimitApplicable = taxableIncomeBeforeQBI > C.qbiThreshold[status];
  const limits = [{
    key: "tentative",
    label: "20% of net qualified business income",
    amount: tentativeTotal,
    applicable: true
  }, {
    key: "wage",
    label: "W-2 wage and UBIA amount",
    amount: wageLimitTotal,
    applicable: wageLimitApplicable
  }, {
    key: "cap",
    label: "20% taxable-income cap, net of capital gain",
    amount: cap,
    applicable: true
  }];
  /* During the phase-in, the wage rule is blended into the entity component;
     it is not always a stand-alone minimum. Mark a card as binding only when
     it actually equals the allowed deduction. */
  const binding = limits.find(l => l.applicable !== false && Math.abs(l.amount - deduction) < 0.5) || null;
  return {
    deduction,
    component,
    cap,
    entities: detail,
    totalQBI,
    netQBI,
    carryforward,
    carryforwardOut: 0,
    minApplied,
    activeQBI,
    tentativeTotal,
    wageLimitTotal,
    limits,
    binding
  };
}

/* ============================================================================
   SCHEDULE A — itemized deductions
   2026 adds a 0.5%-of-AGI charitable floor and the 2/37 overall reduction.
   Ordering: SALT cap, then the charitable floor, then the 2/37 reduction last.
   ========================================================================== */
function schedATotal(a, agi, status, C, taxableIncomeBeforeItemized) {
  const medItems = (a.medical || []).reduce((x, i) => x + num(i.amount), 0);
  const medical = clamp0(medItems - 0.075 * agi);
  /* Schedule A permits either state/local income tax or general sales tax,
     not both. In the absence of an explicit election input, elect the larger
     entered amount and surface which election was used. */
  const electedIncomeOrSalesTax = Math.max(num(a.stateIncomeTax), num(a.salesTax));
  const saltElection = num(a.salesTax) > num(a.stateIncomeTax) ? "General sales tax elected" : "State income tax elected";
  const saltRaw = electedIncomeOrSalesTax + num(a.realEstateTax) + num(a.personalPropertyTax);
  let cap = C.saltCap[status];
  cap = Math.max(C.saltFloor[status], cap - C.saltPhaseRate * clamp0(agi - C.saltThreshold[status]));
  const salt = Math.min(saltRaw, cap);
  const interest = num(a.mortgageInterest) + num(a.points) + num(a.investmentInterest);
  const charityRaw = Math.min(num(a.charityCash) + num(a.charityNonCash) + num(a.charityCarryover), C.charityCashAGILimit * clamp0(agi));
  const charityFloor = C.charityAGIFloor * clamp0(agi);
  const charity = clamp0(charityRaw - charityFloor);
  const other = (a.other || []).reduce((x, i) => x + num(i.amount), 0);
  const beforeCap = medical + salt + interest + charity + other;

  // The 2/37 limitation: disallow (2/37) x lesser of (total itemized) or
  // (taxable income before itemized deductions in excess of the 37% bracket).
  let reduction = 0;
  if (C.itemizedCapApplies) {
    const b = C.brackets[status];
    const topBracketStart = b[b.length - 1][0];
    const excessOver37 = clamp0(taxableIncomeBeforeItemized - topBracketStart);
    reduction = 2 / 37 * Math.min(beforeCap, excessOver37);
  }
  return {
    total: clamp0(beforeCap - reduction),
    medical,
    salt,
    saltCap: cap,
    saltRaw,
    saltElection,
    electedIncomeOrSalesTax,
    interest,
    charity,
    charityRaw,
    charityFloor,
    other,
    beforeCap,
    reduction
  };
}

/* ============================================================================
   SEC. 221 — STUDENT LOAN INTEREST
   Capped at the statutory maximum, phased out over the applicable MAGI range,
   and disallowed entirely for married filing separately. MAGI here is AGI
   computed WITHOUT this deduction, so the caller passes that figure in.
   ========================================================================== */
function computeStudentLoanInterest(interestPaid, magiBefore, status, C) {
  const p = C.studentLoan;
  const entered = num(interestPaid);
  const out = {
    entered,
    max: p.max,
    magi: magiBefore,
    range: p.range[status],
    allowedBeforePhaseout: 0,
    phaseoutFraction: 0,
    allowed: 0,
    reason: null
  };
  if (entered <= 0) return out;
  if (!p.range[status]) {
    out.phaseoutFraction = 1;
    out.reason = "Not available when married filing separately.";
    return out;
  }
  out.allowedBeforePhaseout = Math.min(entered, p.max);
  const [lo, hi] = p.range[status];
  const keep = magiBefore <= lo ? 1 : magiBefore >= hi ? 0 : (hi - magiBefore) / (hi - lo);
  out.phaseoutFraction = 1 - keep;
  out.allowed = Math.round(out.allowedBeforePhaseout * keep);
  if (keep === 0) out.reason = "Fully phased out — MAGI is at or above " + hi.toLocaleString() + ".";
  return out;
}

/* ============================================================================
   SCHEDULE 1-A — OBBBA below-the-line deductions (2025-2028)
   These reduce TAXABLE INCOME but not AGI, so they never cascade into
   AGI-based phase-outs.
   ========================================================================== */
function computeSchedule1A(s, magi, status, C) {
  const P = s.sched1A || {};
  const out = {
    senior: 0,
    tips: 0,
    overtime: 0,
    autoLoan: 0,
    total: 0,
    detail: [],
    ineligibleReason: null
  };

  /* Married taxpayers must file jointly to claim the Schedule 1-A
     deductions — block them up front rather than computing and hiding. */
  if (status === "mfs") {
    out.ineligibleReason = "Not available when married filing separately.";
    return out;
  }

  /* All three statutes read "for each $1,000 (or fraction thereof)", so a
     partial thousand of excess MAGI still costs a full step. */
  const step = (label, raw, cap, threshold, rate) => {
    if (raw <= 0) return 0;
    const eligible = Math.min(raw, cap);
    const excess = clamp0(magi - threshold);
    const units = Math.ceil(excess / 1000);
    const reduction = units * (rate * 1000);
    const allowed = clamp0(eligible - reduction);
    out.detail.push({
      label,
      raw,
      cap,
      eligible,
      threshold,
      excess,
      reduction,
      allowed
    });
    return allowed;
  };

  /* The maximum deduction is $6,000 per qualifying individual, but the
     joint-return phaseout is 6% of excess MAGI applied once — not 6%
     separately for each spouse. */
  const sd = C.seniorDeduction;
  const seniorCount = Math.min(num(P.seniorCount), status === "mfj" ? 2 : 1);
  if (seniorCount > 0) {
    const eligible = sd.amount * seniorCount;
    const excess = clamp0(magi - sd.threshold[status]);
    const reduction = sd.rate * excess;
    out.senior = clamp0(eligible - reduction);
    out.detail.push({
      label: "Senior deduction (age 65+)",
      raw: eligible,
      cap: eligible,
      eligible,
      threshold: sd.threshold[status],
      excess,
      reduction,
      allowed: out.senior
    });
  }
  out.tips = step("Qualified tips", num(P.tips), C.tips.cap, C.tips.threshold[status], C.tips.rate);
  out.overtime = step("Qualified overtime premium", num(P.overtime), C.overtime.cap[status], C.overtime.threshold[status], C.overtime.rate);
  out.autoLoan = step("Car loan interest", num(P.autoLoanInterest), C.autoLoan.cap, C.autoLoan.threshold[status], C.autoLoan.rate);
  out.total = out.senior + out.tips + out.overtime + out.autoLoan;
  return out;
}

/* ============================================================================
   ESTIMATED TAX / UNDERPAYMENT SAFE HARBOR — IRC §6654; Form 1040-ES.
   Standard (non-annualized) required-installment method only: the required
   annual payment is spread in four EQUAL installments. The annualized-income
   installment method (Form 2210, Schedule AI, for income that arrives
   unevenly through the year) is NOT implemented — callers must say so rather
   than silently assuming equal quarterly income. Every threshold, percentage
   and due date comes from C.estimatedTax (versioned per tax year), never
   hard-coded here or in the UI. */
function computeEstimatedTax(opts) {
  const {
    currentYearTax, priorYearTax, priorYearAGI, status, C,
    withholding, paymentsMade, asOfDate, annualizedIncomeSupported
  } = opts;
  const E = C.estimatedTax;
  const currentYearSafeHarbor = Math.round(num(currentYearTax) * E.currentYearPct);
  let priorYearSafeHarbor = null;
  if (priorYearTax != null && priorYearTax !== "" ) {
    const threshold = E.priorAGIThreshold[status] != null ? E.priorAGIThreshold[status] : E.priorAGIThreshold.single;
    const overThreshold = num(priorYearAGI) > threshold;
    priorYearSafeHarbor = Math.round(num(priorYearTax) * (overThreshold ? E.priorYearPctAboveThreshold : E.priorYearPctBelowThreshold));
  }
  const candidates = [{ method: "currentYear", amount: currentYearSafeHarbor, label: "90% of the current-year projected tax" }];
  if (priorYearSafeHarbor != null) {
    const overThreshold = num(priorYearAGI) > (E.priorAGIThreshold[status] != null ? E.priorAGIThreshold[status] : E.priorAGIThreshold.single);
    candidates.push({
      method: "priorYear", amount: priorYearSafeHarbor,
      label: (overThreshold ? Math.round(E.priorYearPctAboveThreshold * 100) : Math.round(E.priorYearPctBelowThreshold * 100)) + "% of the prior-year tax" +
        (overThreshold ? " (AGI exceeded the " + usd$(E.priorAGIThreshold[status] != null ? E.priorAGIThreshold[status] : E.priorAGIThreshold.single) + " threshold)" : "")
    });
  }
  const controlling = candidates.reduce((a, b) => b.amount < a.amount ? b : a);
  const requiredAnnualPayment = controlling.amount;

  const withheld = num(withholding);
  const paid = (paymentsMade || []).reduce((a, p) => a + num(p.amount), 0);
  const totalApplied = withheld + paid;
  const remainingRequired = clamp0(requiredAnnualPayment - totalApplied);

  /* Withholding is deemed paid evenly through the year, so it always covers
     every installment already due; only actual estimated payments are
     matched against the installment schedule by due date. */
  const asOf = asOfDate ? new Date(asOfDate + "T00:00:00") : null;
  const dueDates = E.dueDates;
  const perInstallmentRequired = requiredAnnualPayment / dueDates.length;
  let paidRunning = 0;
  const installments = dueDates.map((due, i) => {
    const dueRequired = perInstallmentRequired; // equal installments — standard method only
    const withheldShare = withheld / dueDates.length;
    const paymentsForThis = (paymentsMade || []).filter(p => p.date === due).reduce((a, p) => a + num(p.amount), 0);
    paidRunning += paymentsForThis;
    const appliedByNow = withheldShare * (i + 1) + paidRunning;
    const isPast = asOf ? new Date(due + "T00:00:00") < asOf : false;
    return {
      due, required: dueRequired, paidThisInstallment: paymentsForThis,
      cumulativeRequired: dueRequired * (i + 1), cumulativeApplied: appliedByNow,
      shortfall: isPast ? clamp0(dueRequired * (i + 1) - appliedByNow) : null,
      status: !isPast ? "upcoming" : appliedByNow + 0.5 >= dueRequired * (i + 1) ? "met" : "shortfall"
    };
  });
  const remainingInstallments = installments.filter(x => x.status === "upcoming");
  const perRemainingInstallment = remainingInstallments.length ? remainingRequired / remainingInstallments.length : 0;

  const meetsSafeHarbor = totalApplied + 0.5 >= requiredAnnualPayment;
  const warnings = [];
  if (priorYearSafeHarbor == null) warnings.push("No prior-year tax entered — only the current-year 90% test is available; the (often lower) prior-year safe harbor can't be checked.");
  if (!annualizedIncomeSupported) warnings.push("Equal-quarterly-installment method only. If income arrived unevenly through the year, the annualized-income installment method (Form 2210, Schedule AI) may produce a lower required payment in an early quarter — not calculated here; human review required.");

  return {
    currentYearSafeHarbor, priorYearSafeHarbor, candidates, controllingMethod: controlling.method, controllingLabel: controlling.label,
    requiredAnnualPayment, withholding: withheld, paymentsMade: paid, totalApplied, remainingRequired,
    installments, perRemainingInstallment, meetsSafeHarbor,
    // Balance at filing: actual current-year tax less everything actually applied
    // (withholding + estimated payments made) — independent of the safe-harbor test.
    projectedBalance: num(currentYearTax) - totalApplied,
    warnings
  };
}
