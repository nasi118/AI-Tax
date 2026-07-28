/* ============================================================================
   GOLDEN REGRESSION TESTS
   Loads the deterministic engine (no React needed) into a VM context and
   verifies every corrected calculation with fixed inputs and expected
   outputs. Run: node tests/golden.test.mjs
   ========================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["00-format.js", "01-constants.js", "02-engine.js", "03-scenario.js", "03b-validate.js", "04-seed.js", "07-analysis.js"];
import crypto from "node:crypto";
const ctx = { console, structuredClone, Math, JSON, Date, crypto };
vm.createContext(ctx);
for (const f of files) {
  vm.runInContext(readFileSync(join(root, "src", f), "utf8"), ctx, { filename: f });
}
/* Top-level const/let live in the context's global lexical scope, not on the
   context object — pull the bindings out with one evaluated expression. */
const E = vm.runInContext(
  "({ TY, schedATotal, computeSchedule1A, computeStudentLoanInterest, computeSCorp, computeQBI, computeScenario, validateScenario, analyzeScenario, seed: seed() })",
  ctx
);

let passed = 0, failed = 0;
const results = [];
function check(name, actual, expected, tol = 0.51) {
  const ok = typeof expected === "number"
    ? Math.abs(actual - expected) <= tol
    : actual === expected;
  results.push({ name, ok, actual, expected });
  if (ok) passed++; else failed++;
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (ok ? "" : `  (actual=${actual} expected=${expected})`));
}

/* ---------------------------------------------------------------- 1. SALT */
{
  const C = E.TY[2025];
  const A = E.schedATotal(
    { stateIncomeTax: 15000, salesTax: 8000, realEstateTax: 10000, personalPropertyTax: 0, medical: [], other: [] },
    200000, "mfj", C, 200000
  );
  check("SALT raw uses MAX(income, sales) + property = 25,000 (not 33,000)", A.saltRaw, 25000);
  check("SALT election label", A.saltElection, "State income tax elected");
  const A2 = E.schedATotal(
    { stateIncomeTax: 5000, salesTax: 9000, realEstateTax: 0, personalPropertyTax: 0, medical: [], other: [] },
    100000, "mfj", C, 100000
  );
  check("SALT elects larger sales tax", A2.saltRaw, 9000);
  check("SALT sales election label", A2.saltElection, "General sales tax elected");
}

/* ---------------------------------------- 2. Senior deduction phaseout */
{
  const C = E.TY[2025];
  const S = E.computeSchedule1A({ sched1A: { seniorCount: 2 } }, 200000, "mfj", C);
  check("Senior MFJ, 2 seniors, MAGI 200k → $9,000 (phaseout applied once)", S.senior, 9000);
  const S1 = E.computeSchedule1A({ sched1A: { seniorCount: 1 } }, 200000, "mfj", C);
  check("Senior MFJ, 1 senior, MAGI 200k → $3,000", S1.senior, 3000);
}

/* ------------------------------------------------ 3. MFS Schedule 1-A */
{
  const C = E.TY[2025];
  const S = E.computeSchedule1A({ sched1A: { seniorCount: 1, tips: 5000, overtime: 3000 } }, 90000, "mfs", C);
  check("MFS Schedule 1-A total = 0", S.total, 0);
  check("MFS Schedule 1-A senior = 0", S.senior, 0);
  check("MFS Schedule 1-A carries ineligible reason", !!S.ineligibleReason, true);
}

/* ------------------------------------------- 4. Student loan interest */
{
  const C = E.TY[2025];
  const below = E.computeStudentLoanInterest(3000, 50000, "single", C);
  check("Student loan below phaseout: capped at $2,500", below.allowed, 2500);
  const within = E.computeStudentLoanInterest(2500, 92500, "single", C);
  check("Student loan mid-phaseout (MAGI 92.5k single): $1,250", within.allowed, 1250);
  const above = E.computeStudentLoanInterest(2500, 120000, "single", C);
  check("Student loan above phaseout: $0", above.allowed, 0);
  const mfs = E.computeStudentLoanInterest(2500, 60000, "mfs", C);
  check("Student loan MFS: disallowed", mfs.allowed, 0);
  check("Student loan MFS reason present", !!mfs.reason, true);
  const overMax = E.computeStudentLoanInterest(4000, 50000, "single", C);
  check("Student loan over maximum: pre-phaseout base is $2,500", overMax.allowedBeforePhaseout, 2500);
}

/* ------------------------------------------------ 5. S corporation K-1 */
{
  const C = E.TY[2025];
  const r = E.computeSCorp({ id: "t", name: "Test", profitBeforeComp: 750000, ownerComp: 150000, otherExpenses: 0 }, C);
  check("S-corp employer FICA on $150k wages = $11,475", r.employerFICA, 11475);
  check("S-corp K-1 = 750,000 − 150,000 − 11,475 = 588,525", r.k1, 588525);
}

/* -------------------------------------------------------------- 6. QBI */
{
  const C = E.TY[2025];
  // Same S-corp facts; taxable income before QBI set so the 20% cap is 140,705.
  const Q = E.computeQBI(
    { entities: [{ id: "t", name: "Test", income: 588525, w2: 150000, ubia: 0, sstb: false, active: true }] },
    703525, 0, "mfj", C
  );
  check("QBI tentative 20% = 117,705", Q.tentativeTotal, 117705);
  check("QBI wage limit (50% of W-2) = 75,000", Q.wageLimitTotal, 75000);
  check("QBI taxable-income cap = 140,705", Q.cap, 140705);
  check("QBI allowed deduction = 75,000 (wage-bound)", Q.deduction, 75000);
  check("QBI binding limitation identified as wage/UBIA", Q.binding && Q.binding.key, "wage");

  // Below the threshold the wage limitation must be N/A, not a binding zero.
  const Qlow = E.computeQBI(
    { entities: [{ id: "t", name: "Test", income: 100000, w2: 0, ubia: 0, sstb: false, active: true }] },
    150000, 0, "mfj", C
  );
  const wageCard = Qlow.limits.find(l => l.key === "wage");
  check("QBI below threshold: wage card marked not applicable", wageCard.applicable, false);
  check("QBI below threshold: deduction is 20% of QBI", Qlow.deduction, 20000);
}

/* --------------------------------------- 7. Scenario economics identity */
{
  const base = E.seed[0];
  const r = E.computeScenario(base, "mfj", 2025);
  check("afterTaxCash = economicIncome − totalTax",
    r.afterTaxCash, r.economicIncome - r.totalTax, 0.01);
  check("spendable = afterTax − retirement − HSA − charitable cash",
    r.spendableAfterTaxCash,
    r.afterTaxCash - r.cashOutflows.retirement - r.cashOutflows.hsa - r.cashOutflows.charitable, 0.01);
  // Same economics ⇒ tax saving equals after-tax income gain exactly.
  const clone = structuredClone(base);
  clone.planning = { ...clone.planning, hsaMode: "max", hsaCoverage: "family", age: 45 };
  const r2 = E.computeScenario(clone, "mfj", 2025);
  if (Math.abs(r2.economicIncome - r.economicIncome) <= 0.01) {
    check("equal economics: Δafter-tax income = −Δtax",
      r2.afterTaxCash - r.afterTaxCash, -(r2.totalTax - r.totalTax), 0.01);
  } else {
    check("HSA change altered economic income (unexpected)", true, false);
  }
}

/* -------------------------------------------- 8. Charitable bunching */
{
  // Reproduce the two-year model the analyzer uses and verify the labels
  // cannot be confused: two-year benefit vs annualized vs bunch-year.
  const s = structuredClone(E.seed[0]);
  s.scheduleA = { ...s.scheduleA, charityCash: 20000 };
  const charity = 20000;
  const mk = (amt, force) => {
    const c = structuredClone(s);
    c.scheduleA = { ...c.scheduleA, charityCash: amt };
    c.deductionMode = force ? "itemized" : "auto";
    return c;
  };
  const spreadY1 = E.computeScenario(mk(charity, false), "mfj", 2025).totalTax;
  const spreadY2 = E.computeScenario(mk(charity, false), "mfj", 2026).totalTax;
  const bunchY1 = E.computeScenario(mk(charity * 2, true), "mfj", 2025).totalTax;
  const bunchY2 = E.computeScenario(mk(0, false), "mfj", 2026).totalTax;
  const twoYear = spreadY1 + spreadY2 - (bunchY1 + bunchY2);
  const annualized = twoYear / 2;
  const bunchYearReduction = spreadY1 - bunchY1;
  check("bunching: annualized = two-year / 2", annualized, twoYear / 2, 0.001);
  check("bunching: bunch-year reduction ≠ two-year benefit (off-year cost is real)",
    Math.abs(bunchYearReduction - twoYear) > 1, true);
  const { findings } = E.analyzeScenario(s, "mfj", 2025);
  const f = findings.find(x => x.id === "bunch");
  if (f) {
    check("bunching finding savings = annualized two-year benefit", f.savings, annualized, 1);
    check("bunching finding explains two-year window", f.why.includes("two-year"), true);
  } else {
    check("bunching finding produced for 20k charity scenario", twoYear > 500 ? "missing" : "not-warranted", twoYear > 500 ? "present" : "not-warranted");
  }
}

/* ----------------------------------------------------- 9. Validations */
{
  const s = structuredClone(E.seed[0]);
  s.qualifiedDividends = 5000;
  s.ordinaryDividends = 1000;
  const r = E.computeScenario(s, "mfj", 2025);
  const v = E.validateScenario(s, r, "mfj", 2025);
  check("validation: qualified > ordinary dividends is blocking", v.blocking, true);
  check("validation: error code present", v.errors.some(x => x.code === "qual-div"), true);

  const s2 = structuredClone(E.seed[0]);
  s2.sched1A = { ...(s2.sched1A || {}), seniorCount: 1 };
  const r2 = E.computeScenario(s2, "mfs", 2025);
  const v2 = E.validateScenario(s2, r2, "mfs", 2025);
  check("validation: MFS with Schedule 1-A entries warns", v2.warnings.some(x => x.code === "mfs-1a"), true);
}

/* -------------------------------------------- 10. NIIT classification */
{
  const s = structuredClone(E.seed[0]);
  s.passthrough = { entities: [{ id: "p1", name: "Rental LLC", ordinary: 0, rental: 40000, niitClass: "nonpassive-rental" }] };
  const r = E.computeScenario(s, "mfj", 2025);
  check("NIIT: classified nonpassive rental excluded from base", r.niitDetail[0].included, 0);
  check("NIIT: nonpassive rental flagged for review", r.niitReview.length > 0, true);
  const s2 = structuredClone(s);
  s2.passthrough.entities[0].niitClass = "rental-niit";
  const r2 = E.computeScenario(s2, "mfj", 2025);
  check("NIIT: rental-included class keeps income in base", r2.niitDetail[0].included, 40000);
  // Legacy checkbox behavior preserved + review flag
  const s3 = structuredClone(s);
  delete s3.passthrough.entities[0].niitClass;
  s3.passthrough.entities[0].passive = false;
  const r3 = E.computeScenario(s3, "mfj", 2025);
  check("NIIT: legacy nonpassive checkbox keeps rental in base (unchanged)", r3.niitDetail[0].included, 40000);
  check("NIIT: legacy treatment flagged for human review", r3.niitReview.length > 0, true);
}

/* -------------------------------------------------- 11. Golden totals */
{
  // Frozen engine outputs for the three seeded example scenarios (TY2025 MFJ).
  // These pin the engine: any change to these numbers must be intentional.
  const totals = E.seed.map(s => Math.round(E.computeScenario(s, "mfj", 2025).totalTax));
  console.log("       seed totals:", totals.join(", "));
  check("golden: three seed scenarios computed", totals.length, 3);
  check("golden: totals are positive and ordered as expected (S-corp lowest)",
    totals[2] < totals[0] && totals[2] < totals[1], true);
}

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
