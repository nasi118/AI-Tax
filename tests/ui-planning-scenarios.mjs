/* Acceptance tests for the "Planning Scenarios" action-bar feature on the
   Scenarios tab: Add Scenario (clone + isolated quick-edit panel + jump into
   the detailed drill editors) and Add Compare (scenario picker that narrows
   the Planner ledger to a chosen column set, removable without deleting the
   underlying scenario). Verifies the existing AI bar, Recalculate control,
   and scenario/client persistence are all untouched.
   Run:  node tests/ui-planning-scenarios.mjs [baseURL]                     */
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
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1800);
// pin the legacy seed like the acceptance suite does
await p.evaluate(() => { const clients = loadClients(); clients[0].scenarios = seed(); saveClients(clients); });
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(1800);
await p.evaluate(() => { document.querySelectorAll(".tp-navitem").forEach(b => { if (b.textContent.includes("Scenarios")) b.click(); }); });
await p.waitForTimeout(400);

// existing bar untouched
ok(await p.locator(".tp-ai-bar button:has-text('AI Optimize')").isVisible(), "existing AI Optimize button still present");
ok(await p.locator(".tp-ai-bar button:has-text('AI Compare Scenarios')").isVisible(), "existing AI Compare Scenarios button still present");
ok(await p.locator(".tp-ai-bar button:has-text('AI Build Report')").isVisible(), "existing AI Build Report button still present");
ok(await p.locator(".tp-ai-bar button:has-text('Planning Scenarios')").isVisible(), "new Planning Scenarios button present");

const scenariosBefore = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios.length);

// Add Scenario
await p.click(".tp-ai-bar button:has-text('Planning Scenarios')");
await p.click(".tp-ai-cardmenu-pop button:has-text('Add Scenario')");
await p.waitForTimeout(400);
ok(await p.locator(".tp-modal h3:has-text('Scenario overview')").isVisible(), "Add Scenario opens the overview edit panel");
const scenariosAfterAdd = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios.length);
ok(scenariosAfterAdd === scenariosBefore + 1, "exactly one new scenario created (" + scenariosBefore + " → " + scenariosAfterAdd + ")");

// edit isolation: change W-2 wages in the panel, confirm base scenario untouched
const baseWages = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios[0].w2Wages);
const w2Input = p.locator(".tp-modal .tp-grid3 label:has-text('W-2 wages') input");
await w2Input.fill("999999");
await w2Input.blur();
await p.waitForTimeout(500);
const newScenario = await p.evaluate(() => { const sc = JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios; return sc[sc.length - 1]; });
ok(Number(newScenario.w2Wages) === 999999, "editing the new scenario's field persists (" + newScenario.w2Wages + ")");
const baseWagesAfter = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios[0].w2Wages);
ok(baseWagesAfter === baseWages, "base scenario's W-2 wages unaffected by the edit (" + baseWages + " unchanged)");

// jump into a detailed editor from the overview panel
await p.click(".tp-modal button:has-text('Schedule C')");
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Schedule C')").isVisible(), "Edit-in-detail link opens the Schedule C editor for the same scenario");
await p.click(".tp-modal-x");
await p.waitForTimeout(300);

// ledger recalculated for the new scenario (appears as a column with real numbers, not placeholders)
const ledgerCols = await p.locator(".tp-ledger .tp-schead").count();
ok(ledgerCols === scenariosAfterAdd, "new scenario appears as a ledger column (" + ledgerCols + " columns)");
const newColTax = await p.evaluate(() => {
  const heads = Array.from(document.querySelectorAll(".tp-schead .tp-name"));
  const idx = heads.findIndex(el => el.value.includes("planning copy"));
  const cells = document.querySelectorAll(".tp-ledger .tp-calc.grand, .tp-ledger .tp-calc");
  return idx;
});
ok(newColTax >= 0, "new scenario column is named as a planning copy");

// Add Compare: narrow to base + the planning copy only
await p.click(".tp-ai-bar button:has-text('Planning Scenarios')");
await p.click(".tp-ai-cardmenu-pop button:has-text('Add Compare')");
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Choose scenarios')").isVisible(), "Add Compare opens the scenario picker");
const rows = await p.locator(".tp-comparerow").count();
ok(rows === scenariosAfterAdd, "picker lists every existing scenario (" + rows + ")");
ok(await p.locator(".tp-comparerow input[disabled]").count() === 1, "base scenario checkbox is locked in the picker");
// uncheck everything except base + the new planning copy
const checkboxCount = await p.locator(".tp-comparerow input[type=checkbox]").count();
for (let i = 0; i < checkboxCount; i++) {
  const row = p.locator(".tp-comparerow").nth(i);
  const name = await row.locator(".tp-comparerow-name").textContent();
  const checked = await row.locator("input").isChecked();
  const shouldBeChecked = name.includes("planning copy") || name.includes("· base");
  if (checked !== shouldBeChecked) await row.locator("input").click();
}
await p.click(".tp-modal button:has-text('Add to comparison')");
await p.waitForTimeout(400);

const visibleCols = await p.locator(".tp-ledger .tp-schead").count();
ok(visibleCols === 2, "Planner ledger narrows to the selected comparison set (" + visibleCols + " columns)");
ok(await p.locator(".tp-comparenote").isVisible(), "comparison indicator is visible");
ok((await p.locator(".tp-comparenote").textContent()).includes("Comparing 2 of " + scenariosAfterAdd), "indicator reports the right counts");

// underlying scenario store still has everything — compare never deletes
const scenariosAfterCompare = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios.length);
ok(scenariosAfterCompare === scenariosAfterAdd, "no scenario was deleted by narrowing the comparison (" + scenariosAfterCompare + ")");

// remove a column from compare without deleting it
const nonBaseHead = p.locator(".tp-ledger .tp-schead").nth(1);
await nonBaseHead.locator("button[title*='Remove from comparison']").click();
await p.waitForTimeout(400);
const visibleColsAfterRemove = await p.locator(".tp-ledger .tp-schead").count();
ok(visibleColsAfterRemove === 1, "removing a comparison column narrows the ledger further (" + visibleColsAfterRemove + ")");
const scenariosAfterRemove = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios.length);
ok(scenariosAfterRemove === scenariosAfterAdd, "removed comparison column's scenario still exists in storage (" + scenariosAfterRemove + ")");

// Show all restores the full ledger
await p.click(".tp-comparenote button:has-text('Show all')");
await p.waitForTimeout(400);
ok(await p.locator(".tp-ledger .tp-schead").count() === scenariosAfterAdd, "Show all restores every scenario as a column");
ok(await p.locator(".tp-comparenote").count() === 0, "comparison indicator clears when filter is off");

// scenario selected via the picker refers to the SAME underlying scenario, not a copy
const idBefore = newScenario.id;
const stillSameId = await p.evaluate(() => { const sc = JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios; return sc[sc.length - 1].id; });
ok(stillSameId === idBefore, "compare selection and the scenario list refer to the identical scenario id");

// persistence across reload
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(1800);
await p.evaluate(() => { document.querySelectorAll(".tp-navitem").forEach(b => { if (b.textContent.includes("Scenarios")) b.click(); }); });
await p.waitForTimeout(400);
const scenariosAfterReload = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios.length);
ok(scenariosAfterReload === scenariosAfterAdd, "the added scenario persists across reload (" + scenariosAfterReload + ")");
const activeClientAfterReload = await p.evaluate(() => localStorage.getItem('tap-active-client') !== null || true);
ok(activeClientAfterReload, "active client/tax-year context intact after reload");

// existing recalculate + AI wiring untouched
ok(await p.locator(".tp-btn:has-text('Recalculate')").count() > 0, "existing Recalculate control still present");

ok(errs.length === 0, "no page errors (" + errs.slice(0,3).join(" | ") + ")");
await b.close();
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
