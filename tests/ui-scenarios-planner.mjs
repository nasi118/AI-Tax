/* Acceptance tests for the Scenarios tab after the 1040 Planner module
   replaced the comparison ledger:

     · the module mounts, loads and runs its own TY2026 engine in the frame
     · the archived ledger is gone from the running app
     · the tab is UNLINKED from the workbench engine — driving the planner
       moves no workbench scenario, logs no audit entry, and every other tab
       still computes off the workbench engine exactly as before
     · the tab's own controls (height toggle, reload, full-screen) behave
     · the planner still works standalone at /planner/

   Run:  node tests/ui-scenarios-planner.mjs [baseURL]                      */
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
  await p.evaluate(t => { document.querySelectorAll(".tp-navitem").forEach(x => { if (x.textContent.includes(t)) x.click(); }); }, name);
  await p.waitForTimeout(500);
};
const frame = async () => (await (await p.$("iframe.tp-planner-frame")).contentFrame());

/* ---- the module mounts ---- */
await gotoTab("Scenarios");
await p.waitForSelector("iframe.tp-planner-frame", { timeout: 15000 });
ok(await p.locator("iframe.tp-planner-frame").isVisible(), "the Scenarios tab mounts the 1040 Planner frame");
ok((await p.getAttribute("iframe.tp-planner-frame", "src")) === "planner/", "the frame uses the directory URL, so the module's relative assets resolve");
ok((await p.getAttribute("iframe.tp-planner-frame", "title")) === "1040 Planner (TY2026)", "the frame is titled for screen readers");

const f = await frame();
await f.waitForSelector("#app > *", { timeout: 20000 });
ok((await f.locator("#app > *").count()) > 0, "the planner renders its own UI inside the frame");
ok(await f.evaluate(() => typeof window.TaxEngine === "object"), "the planner carries its own TY2026 engine");
ok(await f.evaluate(() => typeof window.TaxEngine.PARAMS.socialSecurityWageBase === "number"), "the planner's engine exposes its TY2026 parameters");

/* ---- the archived ledger is gone ---- */
ok((await p.locator(".tp-ledger").count()) === 0, "the archived comparison ledger does not render");
ok((await p.locator(".tp-vcard").count()) === 0, "the archived scenario verdict cards do not render");
ok((await p.locator(".tp-lab.drill").count()) === 0, "the archived ledger drill rows do not render");
ok(await p.evaluate(() => typeof ScenariosPage === "undefined"), "ScenariosPage is not part of the loaded bundle");
ok(await p.evaluate(() => typeof STRATEGY_LIBRARY === "undefined"), "the ledger's strategy library is not part of the loaded bundle");

/* ---- full-bleed layout ---- */
ok(await p.$eval("main.tp-main", el => el.classList.contains("bleed")), "the padded content wrapper collapses for the module");
await gotoTab("Dashboard");
ok(!(await p.$eval("main.tp-main", el => el.classList.contains("bleed"))), "the padded wrapper returns on every other tab");
await gotoTab("Scenarios");
await p.waitForSelector("iframe.tp-planner-frame");

/* ---- UNLINKED: the planner moves nothing in the workbench ---- */
const before = await p.evaluate(() => ({
  scenarios: JSON.stringify(TP_ACTIVE_CLIENT.scenarios),
  audit: (JSON.parse(localStorage.getItem("tp_clients_v1"))[0].auditLog || []).length
}));
/* Drive a real input inside the planner and let its engine recompute. The
   planner opens on a read-only summary, so open an editor first. */
const f2 = await frame();
await f2.locator('button:has-text("Edit")').first().click();
await f2.locator("input.input-num").first().waitFor({ timeout: 15000 });
const plannerInput = f2.locator("input.input-num").first();
await plannerInput.fill("123456");
await plannerInput.blur();
await p.waitForTimeout(1200);
ok((await plannerInput.inputValue()).replace(/[^0-9]/g, "") === "123456", "the planner accepts an edit and formats it with its own engine");
const after = await p.evaluate(() => ({
  scenarios: JSON.stringify(TP_ACTIVE_CLIENT.scenarios),
  audit: (JSON.parse(localStorage.getItem("tp_clients_v1"))[0].auditLog || []).length
}));
ok(before.scenarios === after.scenarios, "editing inside the planner moves no workbench scenario");
ok(before.audit === after.audit, "editing inside the planner writes no workbench audit entry");

/* ...and the workbench engine still drives every other tab. */
await gotoTab("Dashboard");
/* Dashboard sections are collapsed by default, so assert on the engine
   itself and on a badge that is rendered from its output. */
ok(await p.evaluate(() => {
  const r = computeScenario(TP_ACTIVE_CLIENT.scenarios[0], "single", 2025);
  return r && typeof r.totalTax === "number" && r.totalTax > 0;
}), "the workbench engine still computes a total tax for the active client");
ok((await p.locator(".tp-main").textContent()).includes("lowest modeled tax"), "the Dashboard still renders an engine-derived verdict");
await gotoTab("SE & Retirement");
ok((await p.locator("input.tp-money").count()) > 0, "the SE & Retirement module still renders its engine-bound inputs");
await gotoTab("QBI Workbench");
ok((await p.locator(".tp-main").textContent()).length > 200, "the QBI workbench still renders");

/* ---- the tab's own controls ---- */
await gotoTab("Scenarios");
await p.waitForSelector("iframe.tp-planner-frame");
ok(!(await p.$eval(".tp-planner-wrap", el => el.classList.contains("tall"))), "the planner starts at fitted height");
await p.click('.tp-planner-btns button:has-text("Taller")');
await p.waitForTimeout(250);
ok(await p.$eval(".tp-planner-wrap", el => el.classList.contains("tall")), "the height toggle applies");
await gotoTab("Dashboard");
await gotoTab("Scenarios");
await p.waitForSelector("iframe.tp-planner-frame");
ok(await p.$eval(".tp-planner-wrap", el => el.classList.contains("tall")), "the height preference persists across navigation");
await p.click('.tp-planner-btns button:has-text("Fit height")');
await p.waitForTimeout(200);

ok((await p.getAttribute('.tp-planner-btns a:has-text("Open full screen")', "href")) === "planner/", "full-screen opens the module's own URL");
ok((await p.getAttribute('.tp-planner-btns a:has-text("Open full screen")', "target")) === "_blank", "full-screen opens in a new tab");

/* Reload rebuilds the frame from scratch. */
const edited = await (await frame()).locator("input.input-num").first().inputValue().catch(() => "");
await p.click('.tp-planner-btns button:has-text("Reload")');
await p.waitForTimeout(2500);
const f3 = await frame();
await f3.waitForSelector("#app > *", { timeout: 20000 });
ok(await f3.evaluate(() => typeof window.TaxEngine === "object"), "the frame comes back up after Reload");
ok(await f3.evaluate(() => document.querySelectorAll("input.input-num").length === 0), "Reload returns the planner to its own initial view");

/* ---- the module still works standalone ---- */
const standalone = await b.newPage();
const sErrs = []; standalone.on("pageerror", e => sErrs.push(String(e)));
await standalone.goto(BASE + "/planner/", { waitUntil: "networkidle" });
await standalone.waitForTimeout(2000);
ok(await standalone.evaluate(() => typeof window.TaxEngine === "object"), "the planner still loads and computes at /planner/");
ok((await standalone.locator("#app > *").count()) > 0, "the standalone planner renders its UI");
ok(sErrs.length === 0, "no page errors on the standalone planner (" + sErrs.slice(0, 2).join(" | ") + ")");
await standalone.close();

ok(errs.length === 0, "no page errors during the run (" + errs.slice(0, 3).join(" | ") + ")");
await b.close();
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
