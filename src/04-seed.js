/* ==== 04-seed ==== */
/* ============================================================================
   SEED SCENARIOS
   Scenario 1 reproduces the sole-proprietor case in the uploaded income
   projection scenarios exactly, so the engine can be tied out on sight:
   $120,000 Schedule C, MFJ, standard deduction, no retirement plan
     -> SE tax $16,955, half $8,478, AGI $111,522, QBI $16,004,
        taxable income $64,018, total tax $24,161.
   ========================================================================== */

const defaultPlanning = () => ({
  age: 45,
  planType: "none",
  employerMode: "auto",
  employerManual: 0,
  employeeDeferral: 0,
  hsaCoverage: "self",
  hsaMode: "off",
  hsaManual: 0
});
const defaultSEHI = () => ({
  medicalPremiums: 0,
  ltcInsured: [],
  employerPlanEligible: false,
  employerPlanMonths: 0
});
const defaultSCorp = name => ({
  id: uid(),
  name: name || "S corporation",
  profitBeforeComp: 0,
  // profit after all other expenses, before owner compensation
  ownerComp: 0,
  // reasonable compensation reported on the owner's W-2
  otherExpenses: 0,
  // further corporate expenses not already in profit
  nonOwnerW2: 0,
  // wages to non-owner employees, for the Sec. 199A limit
  ubia: 0,
  ownershipPct: 100,
  sstb: false,
  active: true // material participation, so the K-1 stays outside NII
});
const defaultIRA = () => ({
  enabled: false,
  age: 45,
  contribution: 0,
  coverage: "none"
});
const emptyScheduleA = () => ({
  medical: [],
  stateIncomeTax: 0,
  realEstateTax: 0,
  personalPropertyTax: 0,
  salesTax: 0,
  mortgageInterest: 0,
  points: 0,
  investmentInterest: 0,
  charityCash: 0,
  charityNonCash: 0,
  charityCarryover: 0,
  other: []
});
const emptySchedule1 = () => ({
  studentLoanInterest: 0,
  educatorExpenses: 0,
  earlyWithdrawalPenalty: 0,
  alimonyPaid: 0,
  otherAdjustments: 0,
  stateRefund: 0,
  unemployment: 0,
  gambling: 0,
  cancellationDebt: 0,
  otherIncome: 0
});
const emptySched1A = () => ({
  seniorCount: 0,
  blindCount: 0,
  tips: 0,
  overtime: 0,
  autoLoanInterest: 0
});
function blankScenario(name) {
  return {
    id: uid(),
    name: name || "New scenario",
    w2Wages: 0,
    sCorpComp: 0,
    taxableInterest: 0,
    ordinaryDividends: 0,
    qualifiedDividends: 0,
    taxExemptInterest: 0,
    shortTermGains: 0,
    longTermGains: 0,
    sCorpK1: 0,
    otherIncome: 0,
    rothConversion: 0,
    iraDistributions: 0,
    socialSecurityTaxable: 0,
    socialSecurityTotal: 0,
    foreignExclusion: 0,
    children: 0,
    otherCredits: 0,
    withholding: 0,
    estimatedPayments: 0,
    householdSize: 2,
    schedC: {
      businesses: []
    },
    passthrough: {
      entities: []
    },
    sCorps: {
      entities: []
    },
    schedule1: emptySchedule1(),
    scheduleA: emptyScheduleA(),
    sched1A: emptySched1A(),
    sehi: defaultSEHI(),
    ira: defaultIRA(),
    deductionMode: "auto",
    planning: defaultPlanning(),
    qbi: {
      aggregate: false,
      useManual: false,
      manualAmount: 0,
      priorNegativeCarryforward: 0,
      entities: []
    },
    /* Audit trail of Strategy Scenario Library strategies modeled into this
       scenario (see 08-pages.js STRATEGY_LIBRARY). Display-only — every tax
       effect lives in the ordinary fields above; this never feeds the engine. */
    appliedStrategies: []
  };
}
function seed() {
  /* --- 1. Sole proprietor, no planning: the tie-out case --- */
  const s1 = blankScenario("Sole prop — status quo");
  s1.householdSize = 2;
  s1.schedC.businesses = [{
    id: uid(),
    name: "Consulting practice",
    grossReceipts: 120000,
    returns: 0,
    cogs: 0,
    w2wages: 0,
    ubia: 0,
    expenses: []
  }];
  s1.qbi.entities = [{
    id: uid(),
    name: "Consulting practice",
    income: 111522,
    w2: 0,
    ubia: 0,
    sstb: false,
    active: true
  }];
  s1.deductionMode = "standard";

  /* --- 2. Same business with the retirement and health stack turned on --- */
  const s2 = structuredClone(s1);
  s2.id = uid();
  s2.name = "Sole prop + Solo 401(k) + HSA";
  s2.schedC.businesses[0].id = uid();
  s2.qbi.entities[0].id = uid();
  s2.planning = {
    ...defaultPlanning(),
    planType: "solo401k",
    employerMode: "auto",
    employeeDeferral: 24500,
    hsaMode: "max",
    hsaCoverage: "family"
  };
  s2.sehi = {
    ...defaultSEHI(),
    medicalPremiums: 14000
  };
  s2.deductionMode = "auto";

  /* --- 3. S corporation election on the same $120,000 of profit --- */
  const s3 = blankScenario("S-Corp election");
  s3.householdSize = 2;
  const sc3 = {
    ...defaultSCorp("Consulting practice, Inc."),
    profitBeforeComp: 120000,
    ownerComp: 55000,
    sstb: false,
    active: true
  };
  s3.sCorps.entities = [sc3];
  s3.deductionMode = "standard";
  s3.qbi.entities = [{
    id: uid(),
    name: "Consulting practice, Inc.",
    link: "scorp:" + sc3.id,
    income: 0,
    w2: 0,
    ubia: 0,
    sstb: false,
    active: true
  }];
  s3.planning = {
    ...defaultPlanning(),
    planType: "none"
  };
  return [s1, s2, s3];
}

/* ============================================================================
   GOLDEN REGRESSION CASE — sole proprietor versus S corporation
   TY2025, married filing jointly, active non-SSTB online retail business.
   $750,000 of profit before owner compensation, $35,000 of itemized
   deductions, no other income, no UBIA, no non-owner wages.

   This case exercises, in one pass: the S-corporation conversion, the
   payroll-tax reconciliation (employer FICA reducing the K-1), the Additional
   Medicare Tax, and the full Sec. 199A W-2 wage limitation — including the
   case where the sole proprietor's deduction is zero because there are no
   wages to support it.

   Expected results are asserted in the test suite; see GOLDEN_EXPECTED below.
   ========================================================================== */
function goldenScenarios() {
  /* --- A. Sole proprietor --- */
  const a = blankScenario("A. Sole proprietor");
  a.householdSize = 2;
  a.schedC.businesses = [{
    id: uid(),
    name: "Online retail",
    grossReceipts: 750000,
    returns: 0,
    cogs: 0,
    w2wages: 0,
    ubia: 0,
    expenses: []
  }];
  a.scheduleA.mortgageInterest = 35000; // stands in for the given $35,000 of itemized deductions
  a.deductionMode = "itemized";
  a.qbi.entities = [{
    id: uid(),
    name: "Online retail",
    link: "schedC:" + a.schedC.businesses[0].id,
    income: 0,
    w2: 0,
    ubia: 0,
    sstb: false,
    active: true
  }];

  /* --- B. S corporation, $150,000 of reasonable compensation --- */
  const b = blankScenario("B. S corporation");
  b.householdSize = 2;
  const sc = {
    ...defaultSCorp("Online retail, Inc."),
    profitBeforeComp: 750000,
    ownerComp: 150000,
    otherExpenses: 0,
    nonOwnerW2: 0,
    ubia: 0,
    ownershipPct: 100,
    sstb: false,
    active: true
  };
  b.sCorps.entities = [sc];
  b.scheduleA.mortgageInterest = 35000;
  b.deductionMode = "itemized";
  b.qbi.entities = [{
    id: uid(),
    name: "Online retail, Inc.",
    link: "scorp:" + sc.id,
    income: 0,
    w2: 0,
    ubia: 0,
    sstb: false,
    active: true
  }];
  return [a, b];
}

/* Expected values, kept beside the scenarios so the app and the test agree. */
const GOLDEN_EXPECTED = {
  soleProp: {
    net_se_income: 692625,
    se_tax: 41923,
    half_se_tax_deduction: 20961,
    agi: 729039,
    taxable_income_before_qbi: 694039,
    qbi_deduction: 0,
    taxable_income: 694039,
    federal_income_tax: 182008,
    additional_medicare_tax: 3984,
    total_tax: 227914,
    after_tax_cash: 522086,
    effective_rate: 0.3039
  },
  sCorp: {
    employer_fica: 11475,
    employee_fica: 11475,
    k1_income: 588525,
    total_income: 738525,
    agi: 738525,
    taxable_income_before_qbi: 703525,
    qbi_tentative: 117705,
    qbi_wage_limit: 75000,
    qbi_taxable_income_limit: 140705,
    qbi_deduction: 75000,
    taxable_income: 628525,
    federal_income_tax: 159078,
    additional_medicare_tax: 0,
    total_tax: 182028,
    after_tax_cash: 567972,
    effective_rate: 0.2427
  },
  comparison: {
    tax_savings: 45886,
    after_tax_cash_increase: 45886
  }
};
function deepClone(scn, name) {
  const c = structuredClone(scn);
  c.id = uid();
  c.name = name != null ? name : scn.name + " (copy)";

  /* Regenerating ids breaks any QBI entity that points at a Schedule C business
     or an S corporation, so record the old-to-new mapping and rewrite the links. */
  const map = {};
  const regen = o => {
    if (o && o.id) {
      const old = o.id;
      o.id = uid();
      map[old] = o.id;
    }
  };
  (c.schedC.businesses || []).forEach(b => {
    regen(b);
    (b.expenses || []).forEach(regen);
  });
  (c.passthrough.entities || []).forEach(regen);
  (c.sCorps && c.sCorps.entities || []).forEach(regen);
  (c.scheduleA.medical || []).forEach(regen);
  (c.scheduleA.other || []).forEach(regen);
  (c.qbi.entities || []).forEach(regen);
  (c.sehi.ltcInsured || []).forEach(regen);
  (c.qbi.entities || []).forEach(e => {
    if (!e.link) return;
    const idx = e.link.indexOf(":");
    if (idx < 0) return;
    const kind = e.link.slice(0, idx),
      target = e.link.slice(idx + 1);
    if (map[target]) e.link = kind + ":" + map[target];
  });
  return c;
}
const largestBiz = sc => {
  let best = null,
    bestNet = -Infinity;
  (sc && sc.businesses || []).forEach(b => {
    const n = businessNet(b);
    if (n > bestNet) {
      bestNet = n;
      best = b;
    }
  });
  return bestNet > 0 ? best : null;
};

/* ---- Runs the golden case and returns one row per assertion. Shared by the
   node test suite and the in-app self-test panel so they can never diverge. ---- */
function runGoldenTest() {
  const [sa, sb] = goldenScenarios();
  const A = computeScenario(sa, "mfj", 2025);
  const B = computeScenario(sb, "mfj", 2025);
  const X = GOLDEN_EXPECTED;
  const sc = B.SCORPS[0] || {};
  const rows = [];
  const a = (group, label, actual, expected, tol) => {
    const t = tol == null ? 0.5 : tol;
    rows.push({
      group,
      label,
      actual,
      expected,
      ok: Math.abs(actual - expected) <= t
    });
  };
  a("A. Sole proprietor", "net_se_income", A.SE.netSE, X.soleProp.net_se_income);
  a("A. Sole proprietor", "se_tax", Math.round(A.seTax), X.soleProp.se_tax);
  a("A. Sole proprietor", "half_se_tax_deduction", Math.round(A.seDeduction), X.soleProp.half_se_tax_deduction);
  a("A. Sole proprietor", "agi", Math.round(A.agi), X.soleProp.agi);
  a("A. Sole proprietor", "taxable_income_before_qbi", Math.round(A.tiBeforeQBI), X.soleProp.taxable_income_before_qbi);
  a("A. Sole proprietor", "qbi_deduction", Math.round(A.qbi.deduction), X.soleProp.qbi_deduction);
  a("A. Sole proprietor", "taxable_income", Math.round(A.taxableIncome), X.soleProp.taxable_income);
  a("A. Sole proprietor", "federal_income_tax", Math.round(A.fedIncomeTax), X.soleProp.federal_income_tax);
  a("A. Sole proprietor", "additional_medicare_tax", Math.round(A.addlMedicare), X.soleProp.additional_medicare_tax);
  a("A. Sole proprietor", "total_tax", Math.round(A.totalTax), X.soleProp.total_tax, 1);
  a("A. Sole proprietor", "after_tax_cash", Math.round(A.afterTaxCash), X.soleProp.after_tax_cash, 1);
  a("B. S corporation", "employer_fica", Math.round(sc.employerFICA), X.sCorp.employer_fica);
  a("B. S corporation", "employee_fica", Math.round(sc.employeeFICA), X.sCorp.employee_fica);
  a("B. S corporation", "k1_income", Math.round(sc.k1), X.sCorp.k1_income);
  a("B. S corporation", "total_income", Math.round(B.grossIncome), X.sCorp.total_income);
  a("B. S corporation", "qbi_tentative", Math.round(B.qbi.tentativeTotal), X.sCorp.qbi_tentative);
  a("B. S corporation", "qbi_wage_limit", Math.round(B.qbi.wageLimitTotal), X.sCorp.qbi_wage_limit);
  a("B. S corporation", "qbi_taxable_income_limit", Math.round(B.qbi.cap), X.sCorp.qbi_taxable_income_limit);
  a("B. S corporation", "qbi_deduction", Math.round(B.qbi.deduction), X.sCorp.qbi_deduction);
  a("B. S corporation", "taxable_income", Math.round(B.taxableIncome), X.sCorp.taxable_income);
  a("B. S corporation", "federal_income_tax", Math.round(B.fedIncomeTax), X.sCorp.federal_income_tax);
  a("B. S corporation", "total_tax", Math.round(B.totalTax), X.sCorp.total_tax, 1);
  a("B. S corporation", "after_tax_cash", Math.round(B.afterTaxCash), X.sCorp.after_tax_cash, 1);
  a("Comparison", "scenario_tax_savings", Math.round(A.totalTax - B.totalTax), X.comparison.tax_savings, 1);
  a("Comparison", "scenario_after_tax_cash_increase", Math.round(B.afterTaxCash - A.afterTaxCash), X.comparison.after_tax_cash_increase, 1);
  return {
    rows,
    A,
    B,
    passed: rows.filter(r => r.ok).length,
    failed: rows.filter(r => !r.ok).length
  };
}
