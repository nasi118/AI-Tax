/* ==== 23-clients ==== */
/* ============================================================================
   CLIENT PROFILES — data model, demo profiles, profile→scenario mapping,
   goal-alignment scoring, and persistence.

   Principles:
   - A client owns its profile facts, goals, constraints and its own scenario
     list. Scenarios of different clients never mix.
   - Profiles hold FACTS only. Every tax figure shown for a profile is
     computed by the deterministic engine from the profile's base scenario —
     nothing here stores a tax result.
   - Demo profiles are ordinary editable records, not fixtures wired into
     the engine.
   - Client data persists separately from UI preferences.
   ========================================================================== */

let TP_ACTIVE_CLIENT = null; // set by App each render; read by the AI package builder

const CLIENTS_KEY = "tp_clients_v1";

/* ---- Goal catalog (key, label) — the supported planning goals ---- */
const GOAL_CATALOG = [
  ["min-tax", "Minimize current-year federal tax"],
  ["max-after-tax", "Maximize after-tax economic income"],
  ["max-spendable", "Maximize spendable cash"],
  ["retirement", "Optimize retirement contributions"],
  ["roth", "Optimize Roth conversions"],
  ["niit", "Reduce NIIT"],
  ["irmaa", "Manage IRMAA"],
  ["qbi", "Optimize QBI"],
  ["scorp-eval", "Evaluate S-corporation election"],
  ["reasonable-comp", "Optimize reasonable compensation"],
  ["cap-gains", "Manage capital gains"],
  ["loss-harvest", "Harvest capital losses"],
  ["zero-bracket", "Use the 0% capital-gain bracket"],
  ["charitable", "Optimize charitable giving"],
  ["daf", "Evaluate donor-advised fund"],
  ["qcd", "Evaluate qualified charitable distributions"],
  ["est-payments", "Manage estimated payments"],
  ["underpayment", "Avoid underpayment penalties"],
  ["smoothing", "Smooth taxable income across years"],
  ["aca", "Manage ACA premium-credit exposure"],
  ["bonus-depr", "Evaluate bonus depreciation"],
  ["sec179", "Evaluate Section 179"],
  ["sec163j", "Evaluate Section 163(j)"],
  ["business-sale", "Plan for a business sale"],
  ["retirement-plan", "Plan for retirement"],
  ["relocation", "Plan for a move between states"],
  ["estate", "Plan for estate and trust exposure"],
  ["audit-risk", "Reduce audit and documentation risk"],
  ["liquidity", "Preserve liquidity"],
  ["se-tax", "Reduce self-employment / employment tax"],
  ["hsa", "Fund HSA to the permitted limit"],
  ["equity-comp", "Manage equity-compensation timing"],
  ["rmd", "Plan required minimum distributions"]
];
const goalLabel = key => {
  const g = GOAL_CATALOG.find(x => x[0] === key);
  return g ? g[1] : key;
};
const GOAL_CLASSES = ["Primary", "Secondary", "Future", "Completed", "Not applicable"];

const mkGoal = (key, priority, cls, extra) => ({
  id: uid(),
  key,
  label: goalLabel(key),
  priority,
  classification: cls || "Primary",
  targetAmount: null,
  targetYear: null,
  status: "Open",
  reason: "",
  notes: "",
  ...(extra || {})
});
const mkAsset = (type, label, value, extra) => ({
  id: uid(),
  type,
  label,
  value: value || 0,
  basis: null,
  owner: "Joint",
  incomeGenerated: 0,
  liquidity: "Liquid",
  taxCharacter: "",
  rmdStatus: "",
  notes: "",
  ...(extra || {})
});

function blankClientProfile() {
  return {
    taxYear: 2025,
    filingStatus: "mfj",
    state: "",
    riskTolerance: "Moderate",
    auditRiskTolerance: "Moderate",
    household: {
      taxpayer: "",
      spouse: "",
      taxpayerAge: null,
      spouseAge: null,
      dependents: 0,
      dependentAges: "",
      collegeStatus: "",
      disabilityStatus: "",
      employmentStatus: "",
      retired: false,
      medicare: false,
      healthCoverage: "",
      residencyNotes: ""
    },
    income: {
      w2Wages: 0,
      bonus: 0,
      equityComp: 0,
      spouseW2: 0,
      schedCGross: 0,
      schedCExpenses: 0,
      taxableInterest: 0,
      taxExemptInterest: 0,
      ordinaryDividends: 0,
      qualifiedDividends: 0,
      shortTermGains: 0,
      longTermGains: 0,
      pensionAndIRA: 0,
      rothConversion: 0,
      socialSecurityTotal: 0,
      socialSecurityTaxable: 0,
      rentalIncome: 0,
      passthroughOrdinary: 0,
      trustDistributions: 0,
      foreignIncome: 0,
      otherIncome: 0
    },
    deductions: {
      mortgageInterest: 0,
      stateIncomeTax: 0,
      realEstateTax: 0,
      charitableCash: 0,
      charitableNonCash: 0,
      medicalExpenses: 0,
      investmentInterest: 0,
      sehiPremiums: 0,
      retirementContribution: 0,
      hsaMode: "off",
      hsaCoverage: "family",
      capitalLossCarryforward: 0,
      investmentInterestCarryforward: 0
    },
    payments: {
      withholding: 0,
      estimatedPayments: 0
    },
    assets: [],
    businesses: []
  };
}
function blankClient(name) {
  return {
    id: uid(),
    clientId: "CLIENT-" + String(Math.floor(Math.random() * 900) + 100),
    name: name || "New client",
    archived: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    profile: blankClientProfile(),
    goals: [],
    constraints: {
      minSpendableCash: null,
      maxCurrentTaxPayment: null,
      maxImplementationCost: null,
      minCashReserve: null,
      liquidityNeeds: "",
      charitableIntent: "",
      retirementTiming: "",
      incomeOutlook: "",
      relocation: "",
      businessSaleTiming: "",
      simplicityPreference: "",
      deferralVsPermanent: "",
      other: ""
    },
    missingFacts: [],
    notes: "",
    scenarios: []
  };
}

/* ----------------------------------------------------------------------------
   PROFILE → SCENARIO. Deterministic mapping of profile facts onto the engine's
   scenario shape. The engine computes everything downstream. Facts the engine
   does not model (asset values, carryforwards without an input, state tax)
   stay on the profile and are surfaced as notes/missing facts — never faked.
   -------------------------------------------------------------------------- */
function profileToScenario(client, name) {
  const p = client.profile;
  const inc = p.income,
    ded = p.deductions;
  const s = blankScenario(name || "Base — from profile");
  s.w2Wages = num(inc.w2Wages) + num(inc.bonus) + num(inc.equityComp) + num(inc.spouseW2);
  s.taxableInterest = num(inc.taxableInterest);
  s.taxExemptInterest = num(inc.taxExemptInterest);
  s.ordinaryDividends = num(inc.ordinaryDividends);
  s.qualifiedDividends = num(inc.qualifiedDividends);
  s.shortTermGains = num(inc.shortTermGains);
  s.longTermGains = num(inc.longTermGains);
  s.iraDistributions = num(inc.pensionAndIRA);
  s.rothConversion = num(inc.rothConversion);
  s.socialSecurityTotal = num(inc.socialSecurityTotal);
  s.socialSecurityTaxable = num(inc.socialSecurityTaxable);
  s.otherIncome = num(inc.otherIncome) + num(inc.trustDistributions) + num(inc.foreignIncome);
  s.withholding = num(p.payments.withholding);
  s.estimatedPayments = num(p.payments.estimatedPayments);
  const deps = num(p.household.dependents);
  const under17 = String(p.household.dependentAges || "").split(/[,;\s]+/).filter(x => x !== "" && num(x) < 17).length;
  s.children = under17;
  s.householdSize = deps + (p.filingStatus === "mfj" ? 2 : 1);
  /* Schedule A */
  s.scheduleA.mortgageInterest = num(ded.mortgageInterest);
  s.scheduleA.stateIncomeTax = num(ded.stateIncomeTax);
  s.scheduleA.realEstateTax = num(ded.realEstateTax);
  s.scheduleA.charityCash = num(ded.charitableCash);
  s.scheduleA.charityNonCash = num(ded.charitableNonCash);
  s.scheduleA.investmentInterest = num(ded.investmentInterest);
  if (num(ded.medicalExpenses) > 0) s.scheduleA.medical = [{
    id: uid(),
    label: "Medical expenses",
    amount: num(ded.medicalExpenses)
  }];
  /* SEHI, retirement, HSA */
  s.sehi.medicalPremiums = num(ded.sehiPremiums);
  const age = num(p.household.taxpayerAge) || 45;
  s.planning.age = age;
  if (num(ded.retirementContribution) > 0) {
    s.planning.planType = "solo401k";
    s.planning.employeeDeferral = num(ded.retirementContribution);
    s.planning.employerMode = "none";
  }
  s.planning.hsaCoverage = ded.hsaCoverage || "family";
  s.planning.hsaMode = ded.hsaMode || "off";
  s.ira.age = age;
  /* Senior additional deduction */
  if (p.filingStatus !== "mfj") {
    s.sched1A.seniorCount = age >= 65 ? 1 : 0;
  } else {
    s.sched1A.seniorCount = (age >= 65 ? 1 : 0) + (num(p.household.spouseAge) >= 65 ? 1 : 0);
  }
  /* Rental and passthrough income (Schedule E) */
  if (num(inc.rentalIncome) !== 0 || num(inc.passthroughOrdinary) !== 0) {
    s.passthrough.entities = [];
    if (num(inc.rentalIncome) !== 0) s.passthrough.entities.push({
      id: uid(),
      name: "Rental activity",
      ordinary: 0,
      rental: num(inc.rentalIncome),
      w2: 0,
      ubia: 0,
      niitClass: "rental-passive"
    });
    if (num(inc.passthroughOrdinary) !== 0) s.passthrough.entities.push({
      id: uid(),
      name: "Passthrough interests",
      ordinary: num(inc.passthroughOrdinary),
      rental: 0,
      w2: 0,
      ubia: 0,
      niitClass: null
    });
  }
  /* Businesses */
  (p.businesses || []).forEach(b => {
    if (b.entityType === "scorp") {
      const profitBeforeComp = num(b.grossReceipts) - num(b.operatingExpenses) - num(b.depreciation) - num(b.amortization) - num(b.interestExpense);
      const ent = {
        ...defaultSCorp(b.name),
        profitBeforeComp,
        ownerComp: num(b.ownerComp),
        nonOwnerW2: num(b.otherW2),
        ubia: num(b.ubia),
        ownershipPct: b.ownershipPct == null ? 100 : num(b.ownershipPct),
        sstb: !!b.sstb,
        active: b.materialParticipation !== false
      };
      s.sCorps.entities.push(ent);
      s.qbi.entities.push({
        id: uid(),
        name: b.name,
        link: "scorp:" + ent.id,
        income: 0,
        w2: 0,
        ubia: 0,
        sstb: !!b.sstb,
        active: true
      });
    } else {
      const biz = {
        id: uid(),
        name: b.name,
        grossReceipts: num(b.grossReceipts),
        returns: 0,
        cogs: 0,
        w2wages: num(b.otherW2),
        ubia: num(b.ubia),
        expenses: num(b.operatingExpenses) > 0 ? [{
          id: uid(),
          label: "Operating expenses",
          amount: num(b.operatingExpenses)
        }] : []
      };
      s.schedC.businesses.push(biz);
      s.qbi.entities.push({
        id: uid(),
        name: b.name,
        link: "schedC:" + biz.id,
        income: 0,
        w2: 0,
        ubia: 0,
        sstb: !!b.sstb,
        active: true
      });
    }
  });
  /* Legacy simple Schedule C entered at the income level (no business record) */
  if (!(p.businesses || []).length && num(inc.schedCGross) > 0) {
    const biz = {
      id: uid(),
      name: "Business",
      grossReceipts: num(inc.schedCGross),
      returns: 0,
      cogs: 0,
      w2wages: 0,
      ubia: 0,
      expenses: num(inc.schedCExpenses) > 0 ? [{
        id: uid(),
        label: "Operating expenses",
        amount: num(inc.schedCExpenses)
      }] : []
    };
    s.schedC.businesses.push(biz);
    s.qbi.entities.push({
      id: uid(),
      name: "Business",
      link: "schedC:" + biz.id,
      income: 0,
      w2: 0,
      ubia: 0,
      sstb: false,
      active: true
    });
  }
  return s;
}

/* Profile completion: share of the key fact groups that are filled in */
function profileCompletion(client) {
  const p = client.profile;
  const checks = [!!client.name, !!p.state, !!p.household.taxpayer, p.household.taxpayerAge != null, p.filingStatus === "mfj" ? !!p.household.spouse : true, Object.values(p.income).some(v => num(v) !== 0), Object.values(p.deductions).some(v => num(v) !== 0 && v !== "off" && v !== "family"), num(p.payments.withholding) + num(p.payments.estimatedPayments) !== 0, (p.assets || []).length > 0, (client.goals || []).length > 0, Object.values(client.constraints || {}).some(v => v != null && v !== ""), !!p.riskTolerance];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}
function clientAssetTotals(client) {
  const a = client.profile.assets || [];
  const sum = f => a.filter(f).reduce((t, x) => t + num(x.value), 0);
  const debt = sum(x => x.type === "debt");
  return {
    total: sum(x => x.type !== "debt") - debt,
    liquid: sum(x => x.liquidity === "Liquid" && x.type !== "debt"),
    retirement: sum(x => ["ira", "roth", "401k", "sep", "simple", "hsa"].includes(x.type)),
    debt
  };
}

/* ----------------------------------------------------------------------------
   GOAL ALIGNMENT — a transparent, rule-based comparison of one scenario's
   engine results against the client's stated goals and constraints. Every row
   carries the reason; the percentage is a simple average of scored rows.
   Statuses: strong (1.0) · met (1.0) · moderate (0.6) · at-risk (0.2) ·
   review (unscored, informational)
   -------------------------------------------------------------------------- */
function goalAlignment(client, entry, results) {
  if (!client) return null;
  const r = entry.r,
    v = entry.v;
  const base = results[0];
  const rows = [];
  const push = (label, status, detail) => rows.push({
    label,
    status,
    detail
  });
  const rank = get => results.slice().sort((a, b) => get(a.r) - get(b.r)).findIndex(x => x.s.id === entry.s.id);
  const goals = (client.goals || []).filter(g => g.classification === "Primary" || g.classification === "Secondary").sort((a, b) => a.priority - b.priority).slice(0, 6);
  goals.forEach(g => {
    switch (g.key) {
      case "min-tax": {
        const i = rank(x => x.totalTax);
        push(g.label, i === 0 ? "strong" : i === 1 ? "moderate" : "at-risk", "Ranked " + (i + 1) + " of " + results.length + " on total modeled tax (" + usd$(r.totalTax) + ")");
        break;
      }
      case "max-after-tax": {
        const i = rank(x => -x.afterTaxCash);
        push(g.label, i === 0 ? "strong" : i === 1 ? "moderate" : "at-risk", "Ranked " + (i + 1) + " of " + results.length + " on after-tax economic income (" + usd$(r.afterTaxCash) + ")");
        break;
      }
      case "max-spendable": {
        const i = rank(x => -x.spendableAfterTaxCash);
        push(g.label, i === 0 ? "strong" : i === 1 ? "moderate" : "at-risk", "Ranked " + (i + 1) + " of " + results.length + " on spendable cash (" + usd$(r.spendableAfterTaxCash) + ")");
        break;
      }
      case "se-tax": {
        const mine = r.seTax + r.sCorpFICA,
          b = base.r.seTax + base.r.sCorpFICA;
        push(g.label, mine < b - 500 ? "strong" : mine <= b + 1 ? "moderate" : "at-risk", "Employment tax " + usd$(mine) + " vs " + usd$(b) + " in the base scenario");
        break;
      }
      case "scorp-eval":
        push(g.label, (entry.s.sCorps && entry.s.sCorps.entities || []).length ? "strong" : "review", (entry.s.sCorps && entry.s.sCorps.entities || []).length ? "S-corporation structure modeled in this scenario" : "Not modeled in this scenario — compare against an S-corp scenario");
        break;
      case "retirement": {
        const funded = r.retirementDeduction;
        const target = num(g.targetAmount);
        if (target > 0) push(g.label, funded >= target ? "met" : funded > 0 ? "moderate" : "at-risk", usd$(funded) + " funded of " + usd$(target) + " target (" + pct(Math.min(1, funded / target), 0) + ")");
        else push(g.label, funded > num(base.r.retirementDeduction) ? "strong" : funded > 0 ? "moderate" : "at-risk", usd$(funded) + " of deductible retirement funding (base: " + usd$(base.r.retirementDeduction) + ")");
        break;
      }
      case "hsa": {
        const cap = r.C.hsa[entry.s.planning && entry.s.planning.hsaCoverage === "family" ? "family" : "self"];
        push(g.label, r.hsa >= cap - 1 ? "met" : r.hsa > 0 ? "moderate" : "at-risk", usd$(r.hsa) + " funded of the " + usd$(cap) + " limit");
        break;
      }
      case "niit":
        push(g.label, r.niit < base.r.niit - 100 ? "strong" : r.niit <= base.r.niit + 1 ? "moderate" : "at-risk", "NIIT " + usd$(r.niit) + " vs " + usd$(base.r.niit) + " in the base scenario");
        break;
      case "irmaa":
        push(g.label, r.magi.irmaa <= base.r.magi.irmaa + 1 ? "moderate" : "at-risk", "IRMAA MAGI " + usd$(r.magi.irmaa) + " (two-year lookback applies)");
        break;
      case "qbi":
        push(g.label, r.qbi.deduction >= base.r.qbi.deduction - 1 ? "strong" : "at-risk", "QBI deduction " + usd$(r.qbi.deduction) + " vs " + usd$(base.r.qbi.deduction) + " base");
        break;
      case "roth":
        push(g.label, num(entry.s.rothConversion) > 0 ? "strong" : "review", num(entry.s.rothConversion) > 0 ? usd$(num(entry.s.rothConversion)) + " conversion modeled at " + pct(r.marginal, 0) + " marginal" : "No conversion modeled in this scenario");
        break;
      case "zero-bracket": {
        const room = clamp0(r.C.ltcg[client.profile.filingStatus].zero - r.taxableIncome);
        push(g.label, room > 0 ? "review" : "at-risk", room > 0 ? usd$(room) + " of 0% capital-gain capacity remains" : "No 0% capital-gain capacity at this income");
        break;
      }
      case "audit-risk":
        push(g.label, v && v.blocking ? "at-risk" : v && v.warnings.length ? "moderate" : "met", v && v.blocking ? "Blocking validation errors" : (v ? v.warnings.length : 0) + " validation warning(s)");
        break;
      case "est-payments":
      case "underpayment": {
        const short = r.balanceDue;
        push(g.label, short <= 1000 ? "met" : short <= 5000 ? "moderate" : "at-risk", short >= 0 ? usd$(short) + " modeled balance due" : usd$(-short) + " modeled overpayment");
        break;
      }
      default:
        push(g.label, "review", "Reviewed against this scenario's facts — see AI analysis for detail");
    }
  });
  /* Constraints */
  const c = client.constraints || {};
  if (num(c.minSpendableCash) > 0) push("Minimum spendable cash " + usd$(num(c.minSpendableCash)), r.spendableAfterTaxCash >= num(c.minSpendableCash) ? "met" : "at-risk", usd$(r.spendableAfterTaxCash) + " modeled spendable after-tax cash");
  if (num(c.maxCurrentTaxPayment) > 0) push("Maximum voluntary tax payment " + usd$(num(c.maxCurrentTaxPayment)), r.totalTax - base.r.totalTax <= num(c.maxCurrentTaxPayment) ? "met" : "at-risk", "Tax above base: " + usd$(clamp0(r.totalTax - base.r.totalTax)));
  const scored = rows.filter(x => x.status !== "review");
  const scoreOf = st => st === "strong" || st === "met" ? 1 : st === "moderate" ? 0.6 : 0.2;
  const pctScore = scored.length ? Math.round(scored.reduce((a, x) => a + scoreOf(x.status), 0) / scored.length * 100) : null;
  return {
    pct: pctScore,
    rows
  };
}

/* ---- Persistence (client data — separate from UI preferences) ---- */
function saveClients(clients) {
  try {
    localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
  } catch (e) {/* storage full or blocked: session continues in memory */}
}
function loadClients() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLIENTS_KEY));
    if (Array.isArray(raw) && raw.length && raw[0].profile) return raw;
  } catch (e) {}
  return demoClients();
}

/* ============================================================================
   DEMO PROFILES — fictional sample data (facts and goals only; every tax
   number displayed for them is computed live by the engine).
   ========================================================================== */
function demoClients() {
  /* ---- DEMO-001 · Sarah and David Mitchell ---- */
  const m = blankClient("Sarah and David Mitchell");
  m.clientId = "DEMO-001";
  m.profile.taxYear = 2025;
  m.profile.filingStatus = "mfj";
  m.profile.state = "Virginia";
  m.profile.riskTolerance = "Moderate";
  m.profile.auditRiskTolerance = "Moderate";
  m.profile.household = {
    ...m.profile.household,
    taxpayer: "Sarah Mitchell",
    spouse: "David Mitchell",
    taxpayerAge: 42,
    spouseAge: 44,
    dependents: 2,
    dependentAges: "9, 12",
    healthCoverage: "Family HDHP",
    employmentStatus: "Sarah self-employed; David W-2"
  };
  m.profile.income = {
    ...m.profile.income,
    w2Wages: 85000,
    schedCGross: 260000,
    schedCExpenses: 70000,
    taxableInterest: 6000,
    ordinaryDividends: 12000,
    qualifiedDividends: 9000,
    longTermGains: 18000
  };
  m.profile.businesses = [{
    id: uid(),
    name: "Sarah Mitchell Consulting",
    entityType: "sole-prop",
    ownershipPct: 100,
    sstb: false,
    materialParticipation: true,
    grossReceipts: 260000,
    operatingExpenses: 70000,
    ownerComp: 0,
    otherW2: 0,
    ubia: 0,
    depreciation: 0,
    amortization: 0,
    interestExpense: 0,
    interestCarryforward: 0,
    complianceCost: 0,
    notes: "Net profit before planning: $190,000. S-corporation election under evaluation with a defensible salary between $80,000 and $110,000."
  }];
  m.profile.deductions = {
    ...m.profile.deductions,
    mortgageInterest: 18000,
    stateIncomeTax: 15000,
    realEstateTax: 9000,
    charitableCash: 8000,
    sehiPremiums: 14400,
    retirementContribution: 20000,
    hsaMode: "off",
    hsaCoverage: "family"
  };
  m.profile.payments = {
    withholding: 12000,
    estimatedPayments: 38000
  };
  m.profile.assets = [mkAsset("cash", "Cash and equivalents", 180000, {
    liquidity: "Liquid"
  }), mkAsset("brokerage", "Taxable brokerage", 420000, {
    basis: 355000,
    liquidity: "Liquid",
    taxCharacter: "Capital"
  }), mkAsset("ira", "Traditional IRAs", 240000, {
    liquidity: "Retirement",
    taxCharacter: "Pre-tax"
  }), mkAsset("roth", "Roth IRAs", 55000, {
    liquidity: "Retirement",
    taxCharacter: "Roth"
  }), mkAsset("401k", "401(k) accounts", 310000, {
    liquidity: "Retirement",
    taxCharacter: "Pre-tax"
  }), mkAsset("hsa", "HSA", 9000, {
    liquidity: "Restricted",
    taxCharacter: "Triple-advantaged"
  }), mkAsset("real-estate", "Primary residence", 825000, {
    liquidity: "Illiquid"
  }), mkAsset("debt", "Mortgage balance", 410000, {
    liquidity: "—"
  })];
  m.goals = [mkGoal("scorp-eval", 1, "Primary", {
    reason: "Evaluate an S-corporation election on ~$190,000 of Schedule C profit."
  }), mkGoal("reasonable-comp", 2, "Primary", {
    reason: "Determine a defensible owner salary between $80,000 and $110,000.",
    notes: "Client-defined review range: $80,000–$110,000."
  }), mkGoal("retirement", 3, "Primary", {
    reason: "Maximize available self-employed retirement contributions."
  }), mkGoal("hsa", 4, "Secondary", {
    reason: "Fund the family HSA to the permitted limit."
  }), mkGoal("se-tax", 5, "Secondary", {
    reason: "Reduce self-employment tax without an aggressive audit position."
  }), mkGoal("est-payments", 5, "Secondary", {
    reason: "Improve quarterly estimated-tax planning."
  })];
  m.constraints = {
    ...m.constraints,
    minSpendableCash: 90000,
    maxImplementationCost: 6000,
    minCashReserve: 100000,
    other: "No strategy requiring more than $60,000 of additional current-year cash funding. Preference: balanced tax savings and documentation risk. Compare savings against payroll and S-corp compliance costs."
  };
  m.missingFacts = ["HDHP eligibility all 12 months (family HSA limit)", "Reasonable-compensation study — role, hours, market data", "Spouse retirement-plan coverage at David's employer", "Virginia estimated-payment position (state not modeled)"];
  m.scenarios = [profileToScenario(m)];

  /* ---- DEMO-002 · James and Elena Rodriguez ---- */
  const r = blankClient("James and Elena Rodriguez");
  r.clientId = "DEMO-002";
  r.profile.taxYear = 2025;
  r.profile.filingStatus = "mfj";
  r.profile.state = "California";
  r.profile.riskTolerance = "Moderate to high";
  r.profile.auditRiskTolerance = "Low";
  r.profile.household = {
    ...r.profile.household,
    taxpayer: "James Rodriguez",
    spouse: "Elena Rodriguez",
    taxpayerAge: 51,
    spouseAge: 49,
    dependents: 2,
    dependentAges: "16, 19",
    collegeStatus: "One dependent attending college",
    employmentStatus: "Both W-2"
  };
  r.profile.income = {
    ...r.profile.income,
    w2Wages: 425000,
    bonus: 100000,
    equityComp: 180000,
    spouseW2: 95000,
    taxableInterest: 18000,
    taxExemptInterest: 22000,
    ordinaryDividends: 34000,
    qualifiedDividends: 26000,
    longTermGains: 95000,
    rentalIncome: -35000,
    passthroughOrdinary: 40000
  };
  r.profile.deductions = {
    ...r.profile.deductions,
    mortgageInterest: 22000,
    stateIncomeTax: 38000,
    realEstateTax: 8000,
    charitableCash: 40000,
    capitalLossCarryforward: 70000,
    investmentInterestCarryforward: 25000
  };
  r.profile.payments = {
    withholding: 205000,
    estimatedPayments: 25000
  };
  r.profile.assets = [mkAsset("cash", "Cash", 450000, {
    liquidity: "Liquid"
  }), mkAsset("brokerage", "Taxable brokerage", 3800000, {
    liquidity: "Liquid",
    taxCharacter: "Capital"
  }), mkAsset("ira", "Traditional IRAs", 1200000, {
    liquidity: "Retirement",
    taxCharacter: "Pre-tax"
  }), mkAsset("roth", "Roth IRAs", 280000, {
    liquidity: "Retirement",
    taxCharacter: "Roth"
  }), mkAsset("401k", "Employer retirement accounts", 2100000, {
    liquidity: "Retirement",
    taxCharacter: "Pre-tax"
  }), mkAsset("equity-comp", "Restricted stock (unvested)", 1400000, {
    liquidity: "Restricted",
    notes: "Not yet vested — timing under study"
  }), mkAsset("real-estate", "Rental property", 1100000, {
    liquidity: "Illiquid",
    incomeGenerated: -35000
  }), mkAsset("debt", "Rental-property debt", 620000), mkAsset("529", "529 plans", 340000, {
    liquidity: "Restricted"
  })];
  r.goals = [mkGoal("equity-comp", 1, "Primary", {
    reason: "Manage the tax effect of restricted-stock vesting ($180,000 this year, $1.4M unvested)."
  }), mkGoal("loss-harvest", 2, "Primary", {
    reason: "Coordinate planned $95,000 of gains with the $70,000 capital-loss carryforward.",
    notes: "Carryforward is a profile fact; apply it by adjusting the modeled gains, since the engine has no carryforward input."
  }), mkGoal("daf", 3, "Primary", {
    reason: "Evaluate contributing appreciated securities to a donor-advised fund; compare 2025 giving versus bunching 2025–2027."
  }), mkGoal("niit", 4, "Secondary", {
    reason: "Reduce NIIT exposure where economically reasonable."
  }), mkGoal("est-payments", 5, "Secondary", {
    reason: "Improve estimated-tax and safe-harbor planning."
  }), mkGoal("roth", 5, "Future", {
    reason: "Evaluate whether Roth conversions become attractive after retirement."
  })];
  r.constraints = {
    ...r.constraints,
    minSpendableCash: 350000,
    other: "Maximum charitable cash and property contribution: $250,000. No need to minimize current tax at the expense of long-term investment value. Strong preference for low audit risk. California state tax must be shown as NOT MODELED until a state module exists."
  };
  r.missingFacts = ["Restricted-stock vesting schedule and 83(b) history", "Rental passive-loss carryforward and §469 grouping", "Investment-interest carryforward usage (no engine input — track manually)", "California estimated payments (state not modeled)"];
  r.scenarios = [profileToScenario(r)];

  /* ---- DEMO-003 · Linda Park ---- */
  const l = blankClient("Linda Park");
  l.clientId = "DEMO-003";
  l.profile.taxYear = 2025;
  l.profile.filingStatus = "single";
  l.profile.state = "Florida";
  l.profile.riskTolerance = "Conservative";
  l.profile.auditRiskTolerance = "Low";
  l.profile.household = {
    ...l.profile.household,
    taxpayer: "Linda Park",
    taxpayerAge: 68,
    dependents: 0,
    retired: true,
    medicare: true,
    employmentStatus: "Retired"
  };
  l.profile.income = {
    ...l.profile.income,
    pensionAndIRA: 204000,
    // $84,000 pension + $120,000 traditional IRA distributions
    socialSecurityTotal: 42000,
    socialSecurityTaxable: 35700,
    // 85% assumed — worksheet is an engine input, flagged below
    taxableInterest: 12000,
    taxExemptInterest: 8000,
    ordinaryDividends: 34000,
    qualifiedDividends: 24000,
    longTermGains: 60000,
    rentalIncome: 18000
  };
  l.profile.deductions = {
    ...l.profile.deductions,
    realEstateTax: 9000,
    charitableCash: 30000,
    medicalExpenses: 22000
  };
  l.profile.payments = {
    withholding: 52000,
    estimatedPayments: 20000
  };
  l.profile.assets = [mkAsset("cash", "Cash", 350000, {
    owner: "Linda",
    liquidity: "Liquid"
  }), mkAsset("brokerage", "Taxable brokerage", 2700000, {
    owner: "Linda",
    basis: 1950000,
    liquidity: "Liquid",
    taxCharacter: "Capital"
  }), mkAsset("ira", "Traditional IRA", 2100000, {
    owner: "Linda",
    liquidity: "Retirement",
    taxCharacter: "Pre-tax",
    rmdStatus: "RMDs begin at 73 — planning window open"
  }), mkAsset("roth", "Roth IRA", 400000, {
    owner: "Linda",
    liquidity: "Retirement",
    taxCharacter: "Roth"
  }), mkAsset("real-estate", "Primary residence (no mortgage)", 950000, {
    owner: "Linda",
    liquidity: "Illiquid"
  }), mkAsset("insurance", "Life insurance cash value", 120000, {
    owner: "Linda",
    liquidity: "Restricted"
  })];
  l.goals = [mkGoal("roth", 1, "Primary", {
    reason: "Determine an appropriate annual Roth-conversion amount; compare filling the 22% and 24% brackets.",
    targetYear: 2025
  }), mkGoal("irmaa", 2, "Primary", {
    reason: "Manage Medicare IRMAA exposure (two-year lookback)."
  }), mkGoal("qcd", 3, "Primary", {
    reason: "Evaluate qualified charitable distributions ($15,000 potential) and coordinate giving with future RMDs."
  }), mkGoal("rmd", 4, "Secondary", {
    reason: "Plan future RMDs on the $2.1M IRA before they become materially larger."
  }), mkGoal("cap-gains", 5, "Secondary", {
    reason: "Determine how much gain can be realized without entering a higher capital-gain rate."
  }), mkGoal("liquidity", 5, "Secondary", {
    reason: "Preserve liquidity for future medical and long-term-care needs."
  })];
  l.constraints = {
    ...l.constraints,
    minSpendableCash: 120000,
    maxCurrentTaxPayment: 100000,
    minCashReserve: 250000,
    other: "Avoid aggressive positions. Preference for predictable annual income and taxes. Do not recommend a strategy solely because it lowers current-year tax."
  };
  l.missingFacts = ["Taxable Social Security portion — engine input assumed at 85%; confirm the provisional-income worksheet", "QCD custodian process (age 70½ satisfied)", "Long-term-care coverage in force", "Rental activity classification for §1411"];
  l.scenarios = [profileToScenario(l)];

  /* ---- DEMO-004 · Daniel and Priya Shah ---- */
  const sh = blankClient("Daniel and Priya Shah");
  sh.clientId = "DEMO-004";
  sh.profile.taxYear = 2026;
  sh.profile.filingStatus = "mfj";
  sh.profile.state = "Texas";
  sh.profile.riskTolerance = "Moderate";
  sh.profile.auditRiskTolerance = "Low to moderate";
  sh.profile.household = {
    ...sh.profile.household,
    taxpayer: "Daniel Shah",
    spouse: "Priya Shah",
    taxpayerAge: 46,
    spouseAge: 45,
    dependents: 3,
    dependentAges: "8, 11, 14",
    employmentStatus: "Owner-operators of Shah Manufacturing Group"
  };
  sh.profile.income = {
    ...sh.profile.income,
    taxableInterest: 20000,
    ordinaryDividends: 28000,
    qualifiedDividends: 20000,
    longTermGains: 75000,
    rentalIncome: 45000
  };
  sh.profile.businesses = [{
    id: uid(),
    name: "Shah Manufacturing Group, Inc.",
    entityType: "scorp",
    ownershipPct: 100,
    // Daniel 60% / Priya 40% — both returns combine on the joint filing
    sstb: false,
    materialParticipation: true,
    grossReceipts: 2600000,
    operatingExpenses: 1550000,
    // excludes owner compensation, depreciation, amortization and interest; includes $520,000 of non-owner W-2 wages
    ownerComp: 300000,
    // Daniel $180,000 + Priya $120,000
    otherW2: 520000,
    ubia: 2400000,
    depreciation: 180000,
    amortization: 25000,
    interestExpense: 310000,
    interestCarryforward: 90000,
    complianceCost: 18000,
    notes: "Ownership Daniel 60% / Priya 40%. §163(j): $310,000 current business interest plus a $90,000 prior-year carryforward — run the §163(j) calculator; the engine deducts entered interest without the limitation."
  }];
  sh.profile.payments = {
    withholding: 0,
    estimatedPayments: 0
  };
  sh.profile.assets = [mkAsset("cash", "Cash", 700000, {
    liquidity: "Liquid"
  }), mkAsset("brokerage", "Taxable brokerage", 1800000, {
    liquidity: "Liquid"
  }), mkAsset("401k", "Retirement accounts", 2300000, {
    liquidity: "Retirement"
  }), mkAsset("business", "Shah Manufacturing Group (estimated value)", 7500000, {
    liquidity: "Illiquid"
  }), mkAsset("real-estate", "Commercial real estate", 4200000, {
    liquidity: "Illiquid"
  }), mkAsset("debt", "Business debt", 2100000, {
    notes: "Debt covenants require minimum liquidity"
  })];
  sh.goals = [mkGoal("reasonable-comp", 1, "Primary", {
    reason: "Evaluate owner reasonable compensation ($300,000 combined) against QBI and payroll cost.",
    notes: "Optimize QBI without an unsupported salary position; model W-2 / UBIA interaction."
  }), mkGoal("qbi", 2, "Primary", {
    reason: "Model the interaction among W-2 wages ($820,000 incl. owners), UBIA ($2.4M) and the §199A limitation."
  }), mkGoal("sec163j", 3, "Primary", {
    reason: "Evaluate the §163(j) current-year limitation on $310,000 of interest and use of the $90,000 carryforward."
  }), mkGoal("bonus-depr", 4, "Secondary", {
    reason: "Compare bonus depreciation, §179 and regular MACRS; test whether accelerating up to $750,000 of equipment produces real economic value."
  }), mkGoal("retirement", 5, "Secondary", {
    reason: "Maximize retirement-plan contributions for owners and employees, subject to cash and employee cost."
  }), mkGoal("business-sale", 5, "Future", {
    reason: "Prepare for a potential partial business sale within five years."
  })];
  sh.constraints = {
    ...sh.constraints,
    minCashReserve: 500000,
    maxImplementationCost: 750000,
    other: "Minimum business cash reserve $500,000. Maximum additional equipment expenditure $750,000. Preference for a defensible, lower-risk compensation position. Do not recommend savings that violate debt covenants or reduce required liquidity."
  };
  sh.missingFacts = ["Reasonable-compensation documentation for both owners", "Debt-covenant liquidity ratios", "Equipment purchase timing and in-service dates", "Employee census for retirement-plan design", "§163(j) small-business gross-receipts test"];
  sh.scenarios = [profileToScenario(sh)];

  return [m, r, l, sh];
}
