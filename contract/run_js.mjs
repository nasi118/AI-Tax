/* ============================================================================
   Cross-engine contract harness — JavaScript side.

   Loads the Tax Advisory Pro engine (src/00…04) into a VM context exactly the
   way tests/golden.test.mjs does, maps each canonical case from
   contract/cases.json onto a blank scenario, runs computeScenario, and prints
   one normalized JSON document to stdout:

     { "engine": ..., "rules": ..., "results": { case_id: {metric: value} } }

   The normalized metrics are defined identically in contract/run_py.py; the
   comparison itself lives in tests/test_cross_engine_contract.py. This file
   must never hardcode expected values — it only reports what the engine
   computes.
   ========================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["00-format.js", "01-constants.js", "02-engine.js", "03-scenario.js", "03b-validate.js", "04-seed.js"];
const ctx = { console, structuredClone, Math, JSON, Date, crypto };
vm.createContext(ctx);
for (const f of files) {
  vm.runInContext(readFileSync(join(root, "src", f), "utf8"), ctx, { filename: f });
}
const E = vm.runInContext(
  "({ TY, ENGINE_VERSION, RULES_VERSION, computeScenario, blankScenario })",
  ctx
);

const FS_MAP = {
  single: "single",
  married_filing_jointly: "mfj",
  married_filing_separately: "mfs",
  head_of_household: "hoh",
};

function runCase(c) {
  const s = E.blankScenario(c.id);
  const inc = c.income || {};
  s.w2Wages = inc.wages || 0;
  s.taxableInterest = inc.taxable_interest || 0;
  s.ordinaryDividends = inc.ordinary_dividends || 0;
  s.qualifiedDividends = inc.qualified_dividends || 0;
  s.shortTermGains = inc.short_term_capital_gain || 0;
  s.longTermGains = inc.long_term_capital_gain || 0;
  s.iraDistributions = inc.ira_distribution || 0;
  s.rothConversion = inc.ira_conversion || 0;
  s.otherIncome = inc.other_income || 0;
  s.children = c.ctc_children || 0;
  s.withholding = (c.payments || {}).federal_withholding || 0;
  s.estimatedPayments = (c.payments || {}).estimated_payments || 0;
  const it = c.itemized || {};
  s.scheduleA.stateIncomeTax = it.state_local_taxes_paid || 0;
  s.scheduleA.mortgageInterest = it.mortgage_interest || 0;
  s.scheduleA.charityCash = it.charitable_cash || 0;
  if (it.medical_expenses) s.scheduleA.medical = [{ id: "m1", label: "medical", amount: it.medical_expenses }];
  s.deductionMode = c.itemize ? "itemized" : "standard";
  s.planning.age = c.taxpayer_age || 45;

  const status = FS_MAP[c.filing_status];
  const r = E.computeScenario(s, status, c.year);

  const totalPayments = s.withholding + s.estimatedPayments;
  const balance = r.totalTax - totalPayments;
  return {
    total_income: r.grossIncome,
    agi: r.agi,
    deduction_used: r.deductionUsed,
    taxable_income: r.taxableIncome,
    ordinary_taxable: r.ordinaryTaxable,
    preferential_income: r.prefIncome,
    ordinary_tax: r.ordTax,
    regular_tax: r.fedIncomeTax,
    credits_applied: r.creditsApplied,
    niit: r.niit,
    total_federal_tax: r.totalTax,
    total_payments: totalPayments,
    balance_due: Math.max(0, balance),
    refund: Math.max(0, -balance),
    effective_rate: r.agi > 0 ? r.totalTax / r.agi : 0,
    marginal_ordinary_rate: r.marginal,
  };
}

const casesPath = process.argv[2] || join(root, "contract", "cases.json");
const spec = JSON.parse(readFileSync(casesPath, "utf8"));
const results = {};
for (const c of spec.cases) results[c.id] = runCase(c);
process.stdout.write(JSON.stringify(
  { engine: "tax-advisory-pro " + E.ENGINE_VERSION, rules: E.RULES_VERSION, results },
  null, 2));
