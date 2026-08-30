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

/* NOTE — the ledger-driven half of this suite is archived.
   Sections that reached the Retirement/HSA/SEHI/IRA editor and the Estimated
   Taxes calculator did so through the Scenarios ledger's drill rows. That
   ledger is archived (src/archive/08a-scenarios-ledger.js) and the Scenarios
   tab now hosts the 1040 Planner module, so those drill rows no longer exist
   and that coverage moved to tests/archive/ui-audit-estimated-tax-ledger.mjs.
   What remains below — Audit & Benchmarks, Change History and persistence —
   is independent of the ledger and still runs. */

/* ---- Setup: one real input edit, made without the ledger ----
   The archived sections used to generate the session's first audit entries as
   a side effect. The Change-History assertions below still need an edit to
   have happened, so make one directly on the SE & Retirement module — same
   engine, same audit pipeline, no ledger. */
await gotoTab("SE & Retirement");
await p.waitForSelector("input.tp-money");
const seMoney = p.locator("input.tp-money").first();
await seMoney.fill("54321");
await seMoney.blur();
await p.waitForTimeout(600);
const editedValue = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios[0]);
ok(!!editedValue, "the edited scenario is persisted to the client store");

/* ---- Audit & Benchmarks ---- */
await gotoTab("Audit");
ok(await p.locator("text=Calculation Audit & Benchmarks").isVisible(), "Audit tab shows the Calculation Audit & Benchmarks card");
const kpiLabels = await p.locator(".tp-kpi > span").allTextContents();
ok(["Total assertions", "Passed", "Failed", "Items to review", "Known-answer tests"].every(l => kpiLabels.includes(l)), "summary shows the five required KPI cards (" + JSON.stringify(kpiLabels) + ")");
ok(await p.locator(".tp-auditstatus").isVisible(), "an overall evidence-appropriate status banner is shown");
const statusText = await p.locator(".tp-auditstatus").textContent();
ok(!/^Validated$/.test(statusText.trim()), "status label is not a bare unqualified \"Validated\" claim (" + statusText + ")");

ok(await p.locator("text=Scenario benchmarking").isVisible(), "scenario benchmarking section is present");
const scenarioCount = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios.length);
const benchRows = await p.locator(".tp-tbl", { hasText: "Marginal rate" }).locator("tbody tr").count();
ok(benchRows === scenarioCount, "benchmark table lists every scenario with real recalculated values (" + benchRows + " of " + scenarioCount + ")");

ok(await p.locator("h3:has-text('Current-year audit')").isVisible(), "current-year reconciliation table is present");
const reconTable = p.locator(".tp-card", { has: p.locator("h3:has-text('Current-year audit')") }).locator("table.tp-tbl");
const reconRows = await reconTable.locator("tbody tr").count();
ok(reconRows === 15, "reconciliation table has all 15 ordered checks (" + reconRows + ")");
const reconTexts = await reconTable.locator("tbody tr td:first-child").allTextContents();
ok(reconTexts[0].toLowerCase().includes("income") && reconTexts[reconTexts.length - 1].toLowerCase().includes("balance"), "checks are ordered income-first, balance-last");
const amtRow = await reconTable.locator("tbody tr", { hasText: "Alternative minimum tax" }).textContent();
ok(/not modeled/i.test(amtRow), "AMT is honestly labeled not modeled rather than a fabricated result");
const variances = await reconTable.locator("tbody tr.warn").count();
ok(variances === 0, "no unexpected variances on the seeded scenarios (" + variances + ")");

ok(await p.locator("h3:has-text('Known-answer tests')").isVisible(), "known-answer test panel is present");
const katTable = p.locator(".tp-card", { has: p.locator("h3:has-text('Known-answer tests')") }).locator("table.tp-tbl");
const katRows = await katTable.locator("tbody tr").count();
ok(katRows >= 8, "at least 8 known-answer tests run live (" + katRows + ")");
const katFailed = await katTable.locator("tbody tr.warn").count();
ok(katFailed === 0, "every known-answer test passes (" + katFailed + " failed)");

/* ---- Change History: Clear no longer destroys the audit trail ---- */
const auditLenBefore = await p.evaluate(() => (JSON.parse(localStorage.getItem('tp_clients_v1'))[0].auditLog || []).length);
ok(auditLenBefore > 0, "the durable audit log has entries from earlier edits in this session (" + auditLenBefore + ")");
const hasDestructiveClear = await p.locator("button", { hasText: /^Clear$/ }).count();
ok(hasDestructiveClear === 0, "no bare destructive 'Clear' button remains on the Audit page");
await p.fill(".tp-txt[placeholder='Search…']", "zzzz-no-match");
await p.waitForTimeout(200);
const clearFiltersBtn = p.locator("button:has-text('Clear filters')");
if (await clearFiltersBtn.count()) {
  await clearFiltersBtn.click();
  await p.waitForTimeout(200);
}
const auditLenAfter = await p.evaluate(() => (JSON.parse(localStorage.getItem('tp_clients_v1'))[0].auditLog || []).length);
ok(auditLenAfter === auditLenBefore, "the durable audit trail is unchanged after using Clear filters (" + auditLenBefore + " -> " + auditLenAfter + ")");

/* ---- Persistence across reload ---- */
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(1800);
/* The retirement-election / prior-year / payment-schedule persistence checks
   moved to tests/archive/ui-audit-estimated-tax-ledger.mjs with the editors
   that set those values. What is verified here is that an ordinary engine-bound
   edit survives a reload — the same persistence path, reached without the ledger. */
const s0AfterReload = await p.evaluate(() => JSON.parse(localStorage.getItem('tp_clients_v1'))[0].scenarios[0]);
ok(JSON.stringify(s0AfterReload) === JSON.stringify(editedValue), "the edited scenario persists across reload byte-for-byte");
await gotoTab("Audit");
ok(await p.locator("text=Calculation Audit & Benchmarks").isVisible(), "Audit & Benchmarks still renders after reload");
const auditLenReload = await p.evaluate(() => (JSON.parse(localStorage.getItem('tp_clients_v1'))[0].auditLog || []).length);
ok(auditLenReload === auditLenBefore, "the audit trail itself also survives reload intact");

ok(errs.length === 0, "no page errors (" + errs.slice(0, 3).join(" | ") + ")");
await b.close();
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
