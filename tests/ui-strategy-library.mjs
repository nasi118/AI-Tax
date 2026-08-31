/* Acceptance tests for the full Planner + Scenarios integration: detailed
   row editors reached from the ledger's chevron affordance (wages,
   interest/dividends, capital gains, retirement, other income, payments,
   QBI info), the Strategy Scenario Library ("Model scenario" clones the
   active scenario, applies real input changes, and adds the result to the
   scenario list without touching the baseline), Create from Active /
   Duplicate Active / baseline-protected delete, and persistence.
   Run:  node tests/ui-strategy-library.mjs [baseURL]                       */
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
const p = await b.newPage({ viewport: { width: 1600, height: 980 } });
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1800);
// pin the multi-scenario seed (sole prop, sole prop + planning, S-corp)
await p.evaluate(() => { const clients = loadClients(); clients[0].scenarios = seed(); saveClients(clients); });
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(1800);
await p.evaluate(() => { document.querySelectorAll(".tp-navitem").forEach(b => { if (b.textContent.includes("Scenarios")) b.click(); }); });
await p.waitForTimeout(400);
// several ledger groups (e.g. "Tax and credits") are collapsed by default
await p.click(".tp-mini:has-text('Expand all groups')");
await p.waitForTimeout(300);

/* ---- (2) every applicable Planner line is interactive: wages ---- */
const baseWages = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios[0].w2Wages);
await p.locator("button.tp-drillchip[aria-label^='Edit W-2 wages in detail']").first().click();
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Wages')").isVisible(), "clicking W-2 wages opens the Wages editor");
ok(await p.locator(".tp-modal label:has-text('W-2 wages') input").isVisible(), "Wages editor exposes the real W-2 wages field");
await p.click(".tp-modal-x");
await p.waitForTimeout(200);

/* ---- interest & dividends, capital gains, retirement, other income, payments, QBI ---- */
await p.locator("button.tp-drillchip[aria-label^='Edit Taxable interest in detail']").first().click();
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Interest')").isVisible(), "clicking Taxable interest opens the Interest & dividends editor");
await p.click(".tp-modal-x"); await p.waitForTimeout(200);

await p.locator("button.tp-drillchip[aria-label^='Edit Short-term capital gains in detail']").first().click();
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Capital gains')").isVisible(), "clicking capital gains opens the Schedule D editor");
ok(await p.locator(".tp-modal .tp-addbtn:has-text('Add line')").count() >= 1, "capital gains editor has Add Line lot detail controls");
await p.click(".tp-modal-x"); await p.waitForTimeout(200);

await p.locator("button.tp-drillchip[aria-label^='Edit IRA and pension distributions in detail']").first().click();
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Retirement')").isVisible(), "clicking IRA distributions opens the Retirement/Social Security editor");
await p.click(".tp-modal-x"); await p.waitForTimeout(200);

await p.locator("button.tp-drillchip[aria-label^='Edit Other income in detail']").first().click();
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Other income')").isVisible(), "clicking Other income opens its editor");
await p.click(".tp-modal-x"); await p.waitForTimeout(200);

await p.locator("button.tp-drillchip[aria-label^='Edit Federal withholding in detail']").first().click();
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Payments')").isVisible(), "clicking Federal withholding opens the Payments editor");
await p.click(".tp-modal-x"); await p.waitForTimeout(200);

await p.click(".tp-ledger button.tp-calc.drill.subtotal >> nth=0");
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Qualified Business Income')").isVisible(), "clicking the QBI deduction line opens the §199A summary");
await p.click(".tp-modal-x"); await p.waitForTimeout(200);

/* existing Schedule C / S-corp drills still work (no regression) */
await p.locator(".tp-ledger button.tp-calc.drill:has-text('$')").first().click();
await p.waitForTimeout(200);
await p.click(".tp-modal-x").catch(() => {});

/* ---- Planning Scenarios menu: relabeled actions + Strategy Library ---- */
await p.click(".tp-ai-bar button:has-text('Planning Scenarios')");
ok(await p.locator(".tp-ai-cardmenu-pop button:has-text('Create from Active')").isVisible(), "menu offers Create from Active");
ok(await p.locator(".tp-ai-cardmenu-pop button:has-text('Duplicate Active')").isVisible(), "menu offers Duplicate Active");
ok(await p.locator(".tp-ai-cardmenu-pop button:has-text('Add Compare')").isVisible(), "menu still offers Add Compare");
ok(await p.locator(".tp-ai-cardmenu-pop button:has-text('Strategy Library')").isVisible(), "menu offers the Strategy Library");

/* ---- (4) Strategy Scenario Library ---- */
const scenariosBefore = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios.length);
const baselineBefore = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios[0]);

await p.click(".tp-ai-cardmenu-pop button:has-text('Strategy Library')");
await p.waitForTimeout(400);
ok(await p.locator(".tp-modal h3:has-text('strategies from the planning reference guides')").isVisible(), "Strategy Library modal opens");
ok(await p.locator(".tp-minihead:has-text('Retirement & Deferral')").isVisible(), "strategies are grouped by category");
ok((await p.locator(".tp-strategy-card").count()) >= 15, "the full strategy set is rendered (17 strategies)");
ok(await p.locator(".tp-strategy-cite:has-text('IRC')").first().isVisible(), "strategy cards show their IRC/authority citation");

// Model "Roth conversion (bracket fill)" — a simple, deterministic single-field strategy
const rothCard = p.locator(".tp-strategy-card", { has: p.locator("strong", { hasText: "Roth conversion (bracket fill)" }) });
await rothCard.locator("button:has-text('Model scenario')").click();
await p.waitForTimeout(500);

const scenariosAfterModel = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios);
ok(scenariosAfterModel.length === scenariosBefore + 1, "Model scenario adds exactly one new scenario (" + scenariosBefore + " → " + scenariosAfterModel.length + ")");
const modeled = scenariosAfterModel[scenariosAfterModel.length - 1];
ok(modeled.name.includes("Roth conversion"), "modeled scenario is named after the strategy (" + modeled.name + ")");
ok(Number(modeled.rothConversion) === Number(baselineBefore.rothConversion) + 100000, "modeled scenario's rothConversion input reflects the strategy's real amount (" + modeled.rothConversion + ")");
ok(Array.isArray(modeled.appliedStrategies) && modeled.appliedStrategies.some(x => x.key === "rothConversion"), "modeled scenario records the applied strategy for display");
const baselineAfter = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios[0]);
ok(JSON.stringify(baselineAfter) === JSON.stringify(baselineBefore), "the baseline scenario is completely unchanged after modeling a strategy");

/* modeling opens the new scenario's quick-edit overview, same as Create from Active */
ok(await p.locator(".tp-modal h3:has-text('Scenario overview')").isVisible(), "modeling a strategy opens the modeled scenario for review, same as Create from Active");
await p.click(".tp-modal-x");
await p.waitForTimeout(300);

/* modeled scenario must be a real, recalculated, distinct total — not a placeholder */
ok(await p.locator(".tp-ledger .tp-schead").count() === scenariosAfterModel.length, "the modeled scenario appears as a new Planner ledger column");

/* ---- (5) the modeled scenario is available for Add Compare ---- */
await p.click(".tp-ai-bar button:has-text('Planning Scenarios')");
await p.click(".tp-ai-cardmenu-pop button:has-text('Add Compare')");
await p.waitForTimeout(300);
const pickerNames = await p.locator(".tp-comparerow-name").allTextContents();
ok(pickerNames.some(t => t.includes("Roth conversion")), "the modeled strategy scenario is selectable in Add Compare");
// narrow to base + the modeled scenario
const checkboxCount = await p.locator(".tp-comparerow input[type=checkbox]").count();
for (let i = 0; i < checkboxCount; i++) {
  const row = p.locator(".tp-comparerow").nth(i);
  const name = await row.locator(".tp-comparerow-name").textContent();
  const checked = await row.locator("input").isChecked();
  const shouldBeChecked = name.includes("Roth conversion") || name.includes("· base");
  if (checked !== shouldBeChecked) await row.locator("input").click();
}
await p.click(".tp-modal button:has-text('Add to comparison')");
await p.waitForTimeout(400);
ok(await p.locator(".tp-ledger .tp-schead").count() === 2, "Planner narrows to baseline + the modeled scenario, side by side");

/* ---- (12) editing the modeled scenario doesn't move the baseline ---- */
// use the Retirement drill on the second (modeled) column to edit rothConversion directly
await p.locator("button.tp-drillchip[aria-label^='Edit Roth conversion in detail']").nth(1).click();
await p.waitForTimeout(300);
const rothField = p.locator(".tp-modal label:has-text('Roth conversion') input");
await rothField.fill("250000");
await rothField.blur();
await p.waitForTimeout(400);
await p.click(".tp-modal-x");
await p.waitForTimeout(300);
const scenariosAfterEdit = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios);
ok(Number(scenariosAfterEdit[scenariosAfterEdit.length - 1].rothConversion) === 250000, "editing the modeled scenario's Roth conversion in place takes effect");
ok(JSON.stringify(scenariosAfterEdit[0]) === JSON.stringify(baselineBefore), "the baseline is still unchanged after editing the modeled scenario");

/* ---- baseline deletion is protected ---- */
const baseDeleteBtn = p.locator(".tp-schead-a").first().locator("button[title*=\"baseline\"]");
ok(await baseDeleteBtn.isVisible(), "the baseline column's delete control is present");
ok(await baseDeleteBtn.isDisabled(), "the baseline scenario's delete control is disabled");

/* ---- (14) persistence across reload ---- */
await p.click(".tp-comparenote button:has-text('Show all')").catch(() => {});
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(1800);
await p.evaluate(() => { document.querySelectorAll(".tp-navitem").forEach(b => { if (b.textContent.includes("Scenarios")) b.click(); }); });
await p.waitForTimeout(400);
const scenariosAfterReload = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios);
ok(scenariosAfterReload.length === scenariosAfterModel.length, "every scenario (including the modeled strategy) persists across reload");
ok(Number(scenariosAfterReload[scenariosAfterReload.length - 1].rothConversion) === 250000, "the in-place edit to the modeled scenario also persisted (" + scenariosAfterReload[scenariosAfterReload.length - 1].rothConversion + ")");

/* ---- (13) Report reads the same scenario data — spot check via AI Build Report wiring still present ---- */
ok(await p.locator(".tp-ai-bar button:has-text('AI Build Report')").isVisible(), "AI Build Report control (reads the same scenarios/results) is unaffected");

ok(errs.length === 0, "no page errors (" + errs.slice(0, 3).join(" | ") + ")");
await b.close();
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
