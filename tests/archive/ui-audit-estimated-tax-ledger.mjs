/* ARCHIVED — the ledger-driven half of tests/ui-audit-estimated-tax.mjs.

   These sections drive the Scenarios ledger's drill rows (".tp-lab.drill")
   to reach the combined Retirement / HSA / SEHI / IRA editor and the
   Estimated Taxes calculator. Both editors are archived with the ledger in
   src/archive/08a-scenarios-ledger.js, so the selectors below no longer
   resolve in the running app. Retained verbatim; not part of any test run.

   The remaining, ledger-independent assertions still live and run in
   tests/ui-audit-estimated-tax.mjs. */

/* Acceptance tests for: the retirement/HSA/SEHI/IRA row editor, the
   Estimated Taxes calculator (IRC §6654 safe harbor, scenario-aware), and
   the Audit & Benchmarks redesign (summary cards, scenario benchmarking,
   the current-year reconciliation table, known-answer tests, and the
   non-destructive "Clear filters" control replacing the old Clear-audit-log
   button). Run:  node tests/ui-audit-estimated-tax.mjs [baseURL]           */
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
await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1800);
await p.evaluate(() => { const clients = loadClients(); clients[0].scenarios = seed(); saveClients(clients); });
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(1800);
const gotoTab = async name => {
  await p.evaluate(t => { document.querySelectorAll(".tp-navitem").forEach(b => { if (b.textContent.includes(t)) b.click(); }); }, name);
  await p.waitForTimeout(500);
};

/* ---- Retirement / HSA / SEHI / IRA row editor ---- */
await gotoTab("Scenarios");
await p.click(".tp-mini:has-text('Expand all groups')");
await p.waitForTimeout(300);
const openDrill = async labelText => p.evaluate(t => {
  const row = Array.from(document.querySelectorAll(".tp-lab.drill")).find(l => l.textContent.includes(t));
  row.nextElementSibling.click();
}, labelText);
await openDrill("Self-employed retirement plan");
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Retirement plan')").isVisible(), "clicking the retirement-plan row opens the combined Retirement/HSA/SEHI/IRA editor");
ok(await p.locator(".tp-modal .tp-minihead:has-text('Health savings account')").isVisible(), "editor includes an HSA section");
ok(await p.locator(".tp-modal .tp-minihead:has-text('Self-employed health insurance')").isVisible(), "editor includes a SEHI section");
ok(await p.locator(".tp-modal .tp-minihead:has-text('Traditional IRA')").isVisible(), "editor includes an IRA section");
await p.locator(".tp-modal select").first().selectOption("solo401k");
await p.waitForTimeout(300);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios[0].planning.planType)) === "solo401k", "selecting a retirement plan persists to the scenario");
await p.click(".tp-modal-x");
await p.waitForTimeout(300);
await openDrill("Health savings account");
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Retirement plan')").isVisible(), "the HSA row is its own click target into the same combined editor");
await p.click(".tp-modal-x");
await p.waitForTimeout(300);

/* ---- Estimated Taxes calculator ---- */
await openDrill("Estimated tax safe harbor");
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Estimated taxes')").isVisible(), "clicking the estimated-tax row opens the calculator");
ok(await p.locator(".tp-modal table.tp-tbl", { hasText: "Current-year projected total tax" }).isVisible(), "calculator shows the source figures from the active scenario");
const priorInput = p.locator(".tp-modal label:has-text('Prior-year total tax') input");
await priorInput.fill("15000");
await priorInput.blur();
await p.waitForTimeout(300);
const agiInput = p.locator(".tp-modal label:has-text('Prior-year AGI') input");
await agiInput.fill("90000");
await agiInput.blur();
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal .tp-tag.green:has-text('Controls')").isVisible(), "one safe-harbor candidate is marked as controlling");
ok(await p.locator(".tp-modal table.tp-tbl", { hasText: "Due" }).isVisible(), "quarterly installment table renders");
await p.click(".tp-modal .tp-addbtn:has-text('Add line')");
await p.waitForTimeout(300);
const dateInput = p.locator(".tp-modal .tp-linerow input.tp-txt").first();
await dateInput.fill("2026-04-15");
const amtInput = p.locator(".tp-modal .tp-linerow .tp-money").first();
await amtInput.fill("4000");
await amtInput.blur();
await p.waitForTimeout(400);
const afterPayment = await p.evaluate(() => { const sc = JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios[0]; return sc.estimatedPaymentSchedule; });
ok(Array.isArray(afterPayment) && afterPayment.length === 1 && Number(afterPayment[0].amount) === 4000, "a dated payment persists to the scenario's payment schedule (" + JSON.stringify(afterPayment) + ")");
await p.click(".tp-modal-x");
await p.waitForTimeout(300);

/* the flat estimatedPayments field is derived, never double-written */
const flatField = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios[0].estimatedPayments);
ok(flatField === 0, "the flat estimatedPayments field stays untouched — the schedule is the source of truth (" + flatField + ")");

/* the ledger's Estimated payments cell now shows the schedule-derived total and is disabled */
const estCellDisabled = await p.evaluate(() => {
  const labs = Array.from(document.querySelectorAll(".tp-lab"));
  const row = labs.find(l => l.textContent.includes("Estimated payments"));
  const cell = row.nextElementSibling;
  const input = cell.querySelector("input");
  return { disabled: input.disabled, value: input.value };
});
ok(estCellDisabled.disabled === true, "the ledger's Estimated payments cell is disabled once a schedule exists, to avoid a second edit surface");

/* reach the calculator from the Payments editor's jump link too */
await p.locator("button.tp-drillchip[aria-label^='Edit Federal withholding in detail']").first().click();
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal button:has-text('Manage estimated payments')").isVisible(), "Payments editor links to the estimated-tax calculator");
await p.click(".tp-modal button:has-text('Manage estimated payments')");
await p.waitForTimeout(300);
ok(await p.locator(".tp-modal h3:has-text('Estimated taxes')").isVisible(), "the jump link opens the same calculator for the same scenario");
await p.click(".tp-modal-x");
await p.waitForTimeout(300);

/* ---- switching scenario recalculates the estimated-tax figures ---- */
const scenarioNames = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios.map(s => s.name));
await p.evaluate(t => {
  const row = Array.from(document.querySelectorAll(".tp-lab.drill")).find(l => l.textContent.includes(t));
  row.nextElementSibling.nextElementSibling.click(); // second scenario column
}, "Estimated tax safe harbor");
await p.waitForTimeout(300);
const secondScenarioEyebrow = await p.locator(".tp-modal .tp-eyebrow").textContent();
ok(secondScenarioEyebrow.trim() === scenarioNames[1], "opening the row on a different column opens the calculator for that scenario (" + secondScenarioEyebrow + ")");
await p.click(".tp-modal-x");
await p.waitForTimeout(300);

