/* Acceptance tests for the 1040 Planner's scenario comparison matrix and its
   multi-year engine.

   These check the twelve things the planner has to be able to do:

     1  it opens with no client profile in existence
     2  a tax year can be picked from a five-year architecture
     3  the baseline and two scenarios are side by side on arrival
     4  more columns can be added
     5  editing one scenario moves that scenario and no other
     6  the delta against the baseline appears immediately
     7  Expand All / Collapse All drive every group in the table
     8  the schedules drill down to their own editors
     9  a strategy from the library arrives as a new column
    10  the planner stays independent of client profiles unless imported
    11  everything the planner already did still works
    12  a projected year is never presented as published law

   Run:  node tests/ui-planner-matrix.mjs [baseURL]                          */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require(process.env.PLAYWRIGHT_HOME || "/opt/node22/lib/node_modules/playwright"));
}
const EXEC = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const BASE = process.argv[2] || "http://localhost:8321";

const b = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "  ✓ " : "  ✗ FAIL ") + n); };

const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.goto(BASE + "/planner/", { waitUntil: "networkidle" });
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(1500);

const scenarios = async () => { await p.click('button[role="tab"]:has-text("Scenarios")'); await p.waitForTimeout(600); };
const headerTotals = () => p.$$eval("table.matrix-table thead .matrix-col-total", els => els.map(e => e.textContent.trim()));
const headerNames = () => p.$$eval("table.matrix-table thead .matrix-col-head input", els => els.map(e => e.value));
const bodyRows = () => p.locator("table.matrix-table tbody tr").count();
const rowInputs = label => p.locator("table.matrix-table tr", { has: p.locator(`th:has-text("${label}")`) })
  .first().locator("input.num");

/* ---- 1 · it opens with nothing set up first ---- */
ok((await p.locator("#app > *").count()) > 0, "the planner renders with no prior setup");
ok(await p.evaluate(() => typeof window.TaxEngine === "object"), "it carries its own engine");
ok(await p.evaluate(() => window.TaxEngine.computeProjection(
  window.TaxEngine.createDemoProject().scenarios[0].inputs).totalTax > 0),
  "it computes a total tax straight away");

/* ---- 10 · and nothing pulls a client in behind the scenes ---- */
ok(await p.evaluate(() => window.TaxPlannerHost === undefined),
  "the old always-listening host bridge is gone");
ok(await p.evaluate(() => typeof window.TaxPlanner.importScenarios === "function"),
  "importing a return is available as a deliberate call");
const beforeMsg = await p.evaluate(() => window.TaxPlanner.scenarioCount());
await p.evaluate(() => window.postMessage({
  source: "tax-planner-host", type: "import-scenarios", scenarios: [{ name: "Injected", inputs: {} }]
}, "*"));
await p.waitForTimeout(600);
ok(await p.evaluate(() => window.TaxPlanner.scenarioCount()) === beforeMsg,
  "a postMessage cannot import a scenario — there is no listener to accept one");

/* ---- 2 · five tax years, and the engine really is versioned ---- */
await scenarios();
const years = await p.$$eval("#taxyear option", o => o.map(x => x.value));
ok(years.join(",") === "2024,2025,2026,2027,2028", "the year selector offers five years");
ok(await p.inputValue("#taxyear") === "2026", "it opens on TY2026");
ok(await p.evaluate(() => {
  const E = window.TaxEngine;
  const seen = new Set();
  for (const y of E.SUPPORTED_YEARS) seen.add(JSON.stringify(E.paramsFor(y).standardDeduction));
  return seen.size === E.SUPPORTED_YEARS.length;
}), "no two years share a standard deduction — none is a copy of another");
ok(await p.evaluate(() => {
  const E = window.TaxEngine;
  return E.paramsFor(2024).socialSecurityWageBase === 168600 &&
    E.paramsFor(2025).socialSecurityWageBase === 176100 &&
    E.paramsFor(2026).socialSecurityWageBase === 184500;
}), "the published years carry their own published wage bases");
ok(await p.evaluate(() => window.TaxEngine.paramsFor(2024).saltCap.base === 10000 &&
  window.TaxEngine.paramsFor(2025).saltCap.base === 40000 &&
  window.TaxEngine.paramsFor(2026).saltCap.base === 40400),
  "the SALT cap follows the law of each year, not one year's figure");
ok(await p.evaluate(() => {
  try { window.TaxEngine.parseProject(JSON.stringify(
    Object.assign(window.TaxEngine.createDemoProject(), { taxYear: 2031 }))); return false; }
  catch (e) { return /not supported/.test(e.message); }
}), "a year the engine has no parameters for is rejected, not silently substituted");

/* ---- 3 · three columns on arrival ---- */
ok((await headerTotals()).length === 3, "the baseline and two scenarios are side by side on arrival");
ok((await headerNames()).join(" | ") === "Current / Base | Scenario 1 | Scenario 2",
  "they are named Current / Base, Scenario 1 and Scenario 2");
ok((await p.locator('table.matrix-table thead th:has-text("Base")').count()) >= 1,
  "the baseline column is marked");

/* the table is rows-of-lines, not rows-of-scenarios */
ok((await p.locator('table.matrix-table th', { hasText: /^W-2 wages1040 line 1a$/ }).count()) === 1,
  "rows are Form 1040 line items");
for (const line of ["Adjusted gross income", "Taxable income", "Total tax", "Effective rate"]) {
  ok((await p.locator(`table.matrix-table th:has-text("${line}")`).count()) >= 1,
    `the return's own subtotal "${line}" is a row`);
}

/* ---- 4 · add a column ---- */
await p.fill('input[aria-label="Name for a new scenario"]', "Scenario 3");
await p.click('button:has-text("+ Add scenario")');
await p.waitForTimeout(800);
ok((await headerTotals()).length === 4, "+ Add scenario adds a column");
ok((await headerNames()).includes("Scenario 3"), "the new column carries the name it was given");

/* ---- 5 & 6 · editing one column moves only that column, and the delta shows ---- */
const wages = rowInputs("W-2 wages");
const before = await headerTotals();
await wages.nth(3).fill("900,000");
await wages.nth(3).press("Enter");
await p.waitForTimeout(900);
const after = await headerTotals();
ok(after[0] === before[0] && after[1] === before[1] && after[2] === before[2],
  "editing Scenario 3 leaves every other column's total tax exactly where it was");
ok(after[3] !== before[3], "the edited scenario's total tax moves");
ok((await wages.evaluateAll(e => e.map(x => x.value)))[1] === (await wages.evaluateAll(e => e.map(x => x.value)))[0],
  "the other columns' inputs are untouched");
ok((await p.locator("table.matrix-table thead").textContent()).includes("higher tax"),
  "the delta against the baseline appears immediately, named as a direction");
ok((await p.locator("td.matrix-changed").count()) === 1,
  "the one input that differs from the baseline is marked");

/* baseline is declared, not computed: the lowest-tax column is not crowned */
ok(!/\bbest\b/i.test(await p.locator("table.matrix-table thead").textContent()),
  'no column is labelled "best"');
await p.locator('button:has-text("Set base")').nth(2).click();
await p.waitForTimeout(700);
ok((await p.locator("table.matrix-table thead").textContent()).includes("the baseline"),
  "the baseline can be moved to another column deliberately");

/* ---- 7 · Expand All / Collapse All over the whole table ---- */
const groups = await p.locator(".matrix-group-toggle").count();
ok(groups === 13, "every planning group has its own expandable header (" + groups + ")");
const expanded = await bodyRows();
await p.click('button:has-text("Collapse all")');
await p.waitForTimeout(500);
const collapsed = await bodyRows();
ok(collapsed < expanded, "Collapse all closes the groups");
ok((await p.locator(".matrix-group-toggle[aria-expanded='true']").count()) === 0,
  "it closes every one of them, not only the visible ones");
ok((await p.locator('table.matrix-table th:has-text("Adjusted gross income")').count()) >= 1,
  "the return's subtotals stay visible while the groups are closed");
await p.click('button:has-text("Expand all")');
await p.waitForTimeout(500);
ok((await bodyRows()) === expanded, "Expand all opens them again");
ok((await p.locator(".matrix-group-toggle[aria-expanded='false']").count()) === 0,
  "it opens every one of them");
/* individual chevrons still work, and the state survives a recompute */
await p.locator(".matrix-group-toggle").first().click();
await p.waitForTimeout(400);
ok((await p.locator(".matrix-group-toggle[aria-expanded='false']").count()) === 1,
  "an individual group still collapses on its own");
await wages.nth(1).fill("300,000");
await wages.nth(1).press("Enter");
await p.waitForTimeout(800);
ok((await p.locator(".matrix-group-toggle[aria-expanded='false']").count()) === 1,
  "a recalculation does not reopen what was collapsed");
await p.locator(".matrix-group-toggle").first().click();
await p.waitForTimeout(400);

/* ---- 8 · the schedules are all there and drill down ---- */
for (const g of ["Schedule B", "Schedule C", "Schedule D", "Schedule E", "Itemized Deductions",
                 "Qualified Business Income", "Retirement & HSA", "Credits", "Other Taxes", "Payments"]) {
  ok((await p.locator(`.matrix-group-toggle:has-text("${g}")`).count()) === 1, `the table has a ${g} group`);
}
ok((await p.locator('table.matrix-table th:has-text("Net profit or (loss)")').count()) === 1,
  "Schedule C drills down to its own net profit");
ok((await p.locator('table.matrix-table th:has-text("Suspended passive losses carried forward")').count()) === 1,
  "Schedule E drills down to the §469 suspended losses");
ok((await p.locator('table.matrix-table th:has-text("Unrecaptured")').count()) === 1,
  "Schedule D drills down to the preference bands");
/* the Planner tab's per-module editors are still the way to edit many records */
await p.click('button[role="tab"]:has-text("Planner")');
await p.waitForTimeout(600);
ok((await p.locator('button:has-text("Edit")').count()) > 5,
  "the Planner tab still offers a detail editor for every module");
await p.locator('button[aria-label="Edit Business Income inputs"]').click();
await p.waitForTimeout(500);
ok((await p.locator(".fixed").count()) > 0, "the Schedule C editor opens from the Planner tab");
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
await scenarios();

/* ---- 9 · a strategy becomes a column ---- */
const cols = (await headerTotals()).length;
await p.locator('button:has-text("+ Add as column")').first().click();
await p.waitForTimeout(1200);
ok((await headerTotals()).length === cols + 1, "modelling a strategy adds a column");
ok((await p.locator('strong:has-text("Added:")').count()) === 1,
  "the tab reports what the strategy column did");
ok((await p.locator(".matrix-group-toggle[aria-expanded='false']").count()) === 0,
  "the lines it moved are opened so they can be seen");

/* ---- 12 · a projected year says so, everywhere ---- */
await p.selectOption("#taxyear", "2027");
await p.waitForTimeout(900);
ok((await p.locator("text=is projected, not published").count()) === 1,
  "TY2027 carries a banner saying it is projected");
ok((await p.locator('span:has-text("Projected / Estimated")').count()) >= 1,
  "the header marks the year Projected / Estimated");
ok(await p.evaluate(() => {
  const E = window.TaxEngine;
  const inp = E.createDemoProject().scenarios[0].inputs;
  return E.computeProjection(inp, { taxYear: 2027 }).paramProvenance === "projected" &&
    E.computeProjection(inp, { taxYear: 2026 }).paramProvenance === "authoritative";
}), "the provenance travels on the computed result itself, not just the chrome");
ok(await p.evaluate(() => {
  const E = window.TaxEngine;
  return /Projected/.test(E.paramsFor(2027).basis) && /Rev\. Proc/.test(E.paramsFor(2026).basis);
}), "each year states the basis it was built from");
ok(await p.evaluate(() => {
  const E = window.TaxEngine;
  return E.paramsFor(2027).standardDeduction.mfj !== E.paramsFor(2026).standardDeduction.mfj;
}), "a projected year does not reuse the published year's amounts");
await p.selectOption("#taxyear", "2026");
await p.waitForTimeout(800);
ok((await p.locator("text=is projected, not published").count()) === 0,
  "the banner is gone on a published year");

/* ---- 11 · everything the planner already did still works ---- */
for (const tab of ["Planner", "Report", "Coverage", "Scenarios"]) {
  await p.click(`button[role="tab"]:has-text("${tab}")`);
  await p.waitForTimeout(500);
  ok((await p.locator("#app").textContent()).length > 400, `the ${tab} tab still renders`);
}
await scenarios();
ok((await p.locator('button:has-text("Comparison report")').count()) === 1, "the comparison report is still reachable");
ok((await p.locator("text=Strategy Scenario Library").count()) === 1, "the strategy library is still on the tab");
ok(await p.evaluate(() => localStorage.getItem("tax-planner-project-v1") !== null),
  "the project is still persisted locally");
ok(await p.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem("tax-planner-project-v1"));
  return saved.taxYear === 2026 && Array.isArray(saved.scenarios) && saved.scenarios.length >= 4;
}), "the saved project carries its tax year and every column");
ok((await p.locator('button:has-text("Export JSON")').count()) === 1, "JSON export is still there");
ok((await p.locator('button:has-text("Export Excel")').count()) === 1, "Excel export is still there");
ok((await p.locator('button:has-text("Import")').count()) === 1, "import is still there");

/* it survives a reload with everything intact */
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await scenarios();
ok((await headerTotals()).length >= 4, "the columns come back after a reload");

ok(errs.length === 0, "no page errors during the run (" + errs.slice(0, 3).join(" | ") + ")");
await b.close();
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
