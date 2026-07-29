/* UI interaction acceptance tests for the 3.0 interface redesign.
   Run:  node tests/ui-acceptance.mjs [baseURL]
   Requires playwright (NODE_PATH may need to point at a global install) and
   a static server hosting the repo root (default http://localhost:8321). */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require(process.env.PLAYWRIGHT_HOME || "/opt/node22/lib/node_modules/playwright"));
}

const BASE = process.argv[2] || "http://localhost:8321";
const EXEC = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
let passed = 0,
  failed = 0;
const ok = (cond, label) => {
  console.log((cond ? "PASS  " : "FAIL  ") + label);
  cond ? passed++ : failed++;
};

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const nav = label => page.click(`button.tp-navitem:has-text("${label}")`).then(() => page.waitForTimeout(350));

/* ---- shell ---- */
ok(await page.$(".tp-shell"), "shell renders");
ok((await page.$$(".tp-navgroup")).length === 3, "navigation has 3 groups (Planning / Calculations / Administration)");
await page.click(".tp-navcollapse");
await page.waitForTimeout(250);
ok(await page.$(".tp-shell.nav-collapsed"), "left navigation collapses");
ok(await page.$(".tp-topbar-controls .tp-seg"), "tax year moves to the top toolbar when nav is collapsed");
await page.click(".tp-navcollapse");
await page.waitForTimeout(250);
ok(!(await page.$(".tp-shell.nav-collapsed")), "left navigation expands again");
await page.click(".tp-navgroup-label >> nth=0");
await page.waitForTimeout(150);
ok((await page.$$(".tp-navgroup >> nth=0 >> .tp-navitem")).length === 0, "a navigation group collapses");
await page.click(".tp-navgroup-label >> nth=0");
await page.waitForTimeout(150);

/* ---- tools panel ---- */
ok((await page.$$(".tp-toolsec")).length >= 4, "tools panel shows snapshot, headroom, validation, calculators");
const snapTax = await page.$$eval(".tp-statline", els => els.length);
ok(snapTax > 5, "active-scenario snapshot and bracket headroom populate");
await page.click(".tp-toolshead-btn >> nth=1"); // collapse to icons
await page.waitForTimeout(250);
ok(await page.$(".tp-shell.tools-collapsed"), "tools panel collapses to an icon rail");
ok((await page.$$(".tp-railbtn")).length >= 5, "icon rail exposes calculator shortcuts");
await page.click(".tp-toolshead-btn");
await page.waitForTimeout(250);
ok(!(await page.$(".tp-shell.tools-collapsed")), "tools panel expands again");

/* ---- dashboard ---- */
ok((await page.$$(".tp-kpi")).length === 6, "dashboard shows six KPI cards");
await page.click('.tp-chart-tools .tp-seg button:has-text("Spendable cash")');
await page.waitForTimeout(250);
ok((await page.textContent(".tp-svg-lab")) !== null, "chart metric switches without error");
await page.click('.tp-chart-tools .tp-seg button:has-text("Total modeled tax")');
const walkRows0 = (await page.$$(".tp-sec >> nth=1 >> table tr")).length;
await page.click('button.tp-mini:has-text("Show detailed lines")');
await page.waitForTimeout(250);
const walkRows1 = (await page.$$(".tp-sec >> nth=1 >> table tr")).length;
ok(walkRows1 > walkRows0, "Form 1040 walk expands from key totals to detailed lines");
await page.click('button.tp-mini:has-text("Key totals only")');
// section collapse + persistence
const chartToggle = '.tp-sec >> nth=0 >> .tp-sec-toggle';
await page.click(chartToggle);
await page.waitForTimeout(200);
ok(!(await page.$(".tp-sec >> nth=0 >> .tp-svg")), "a section collapses (chart unmounts lazily)");
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
ok(!(await page.$(".tp-sec >> nth=0 >> .tp-svg")), "collapse state persists across reload");
await page.click('button.tp-mini:has-text("Default view")');
await page.waitForTimeout(300);
ok(await page.$(".tp-sec >> nth=0 >> .tp-svg"), "Restore default view reopens sections");
await page.click('button.tp-mini:has-text("Collapse all")');
await page.waitForTimeout(250);
ok(!(await page.$(".tp-sec .tp-svg")), "Collapse all closes every section");
await page.click('button.tp-mini:has-text("Expand all")');
await page.waitForTimeout(250);

/* ---- scenarios ---- */
await nav("Scenarios");
ok((await page.$$(".tp-vcard")).length >= 3, "scenario cards render");
ok(await page.$('.tp-vcard >> nth=0 >> .tp-tag:has-text("Base")'), "base scenario is badged");
ok(await page.$('.tp-badge:has-text("Lowest modeled tax")'), "lowest-tax badge present");
ok((await page.textContent(".tp-vcard >> nth=0")).includes("Spendable after-tax cash"), "cards show economic outcomes, not just tax");
await page.click('.tp-vcard >> nth=0 >> button:has-text("Analyze with AI")');
await page.waitForTimeout(250);
ok(await page.$(".tp-scai"), "scenario AI panel expands inline");
ok((await page.textContent(".tp-scai-ctx")).includes("TY2025"), "AI panel states its context (year and status)");
const inputsBefore = await page.$$eval(".tp-in input", els => els.map(e => e.value).join("|"));
ok((await page.$$(".tp-scai-quick .tp-mini")).length >= 6, "AI panel offers the quick analyses");
const inputsAfter = await page.$$eval(".tp-in input", els => els.map(e => e.value).join("|"));
ok(inputsBefore === inputsAfter, "opening the AI panel changes no inputs");
await page.click('.tp-scai button:has-text("Close")');
// density + groups
await page.click('button:has-text("Compact")');
await page.waitForTimeout(150);
ok(await page.$(".tp-ledger-wrap.density-compact"), "ledger density switches to compact");
await page.click('button:has-text("Standard")');
await page.click('button:has-text("Collapse all groups")');
await page.waitForTimeout(200);
const cellsCollapsed = (await page.$$(".tp-cell")).length;
await page.click('button:has-text("Expand all groups")');
await page.waitForTimeout(200);
ok((await page.$$(".tp-cell")).length > cellsCollapsed, "ledger groups collapse and expand together");
ok(await page.$eval(".tp-schead", el => getComputedStyle(el).position === "sticky"), "scenario headers are sticky");
ok(await page.$eval(".tp-lab", el => getComputedStyle(el).position === "sticky"), "line-item column is sticky");

/* ---- calculators ---- */
const scount = (await page.$$(".tp-vcard")).length;
await page.click('.tp-launchbtn:has-text("S-Corp Salary")');
await page.waitForTimeout(1500);
ok(await page.$(".tp-drawer"), "S-Corp Salary calculator opens in a drawer");
ok((await page.textContent(".tp-drawer-head em")).includes("Sole prop"), "calculator names its source scenario");
ok((await page.$$(".tp-drawer table tbody tr")).length >= 6, "salary levels table computed through the engine");
ok((await page.textContent(".tp-drawer")).includes("not automatically the optimal salary"), "no automatic-optimal claim");
await page.click('.tp-drawer button:has-text("Create test scenario")');
await page.waitForTimeout(600);
ok(!(await page.$(".tp-drawer")), "Create test scenario closes the calculator");
ok((await page.$$(".tp-vcard")).length === scount + 1, "a new scenario was created through the engine pipeline");
await nav("Audit Trail");
ok((await page.textContent(".tp-main")).includes("Scenario created from calculator"), "calculator scenario creation is in the audit trail");
await nav("Scenarios");
// delete the created scenario to restore state
await page.click(".tp-schead >> nth=3 >> button[title=Delete]");
await page.waitForTimeout(300);
// audit risk calculator is qualitative
await page.click('.tp-launchbtn:has-text("Audit Risk")');
await page.waitForTimeout(500);
const auditText = await page.textContent(".tp-drawer");
ok(/Lower|Moderate|Elevated|Higher/.test(auditText) && auditText.includes("Not estimated"), "audit risk stays qualitative — no numeric probability");
await page.keyboard.press("Escape");
await page.waitForTimeout(250);
ok(!(await page.$(".tp-drawer")), "Escape closes the calculator drawer");

/* ---- planning guide ---- */
await nav("Planning Guide");
ok((await page.$$(".tp-bubble")).length === 7, "guide categories render as bubbles (6 + Law Changes)");
ok((await page.$$(".tp-acc")).length > 0 && (await page.$$(".tp-acc-body")).length === 0, "only collapsed accordions of one category render");
await page.click(".tp-acc-head >> nth=0");
await page.waitForTimeout(150);
ok(await page.$(".tp-acc-body"), "a strategy accordion expands");
await page.fill(".tp-search", "roth");
await page.waitForTimeout(200);
ok((await page.textContent(".tp-main")).toLowerCase().includes("roth conversions"), "search finds strategies across categories");
await page.fill(".tp-search", "");
await page.click('.tp-bubble:has-text("Law Changes")');
await page.waitForTimeout(200);
ok((await page.$$(".tp-lawcard")).length === 9, "law changes live in their own subtab");

/* ---- guide bubble persistence + quick calculator ---- */
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
ok(await page.$(".tp-bubble.on >> text=Law Changes"), "selected guide category persists");
await page.click(".tp-toolsec-head >> nth=4"); // quick calculator
await page.waitForTimeout(200);
await page.click('.tp-calcbtn:has-text("7")');
await page.click('.tp-qcalc-pad .tp-calcbtn:has-text("+")');
await page.click('.tp-calcbtn:has-text("5")');
await page.click(".tp-calcbtn.eq");
ok((await page.textContent(".tp-qcalc-disp strong")) === "12", "quick calculator computes with a tape");

/* ---- mobile ---- */
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
ok(await page.$(".tp-navtoggle"), "mobile shows the hamburger");
ok(!(await page.$eval(".tp-tools", el => el.offsetParent !== null).catch(() => false)), "tools panel hidden on mobile until opened");
await page.click(".tools-dockbtn");
await page.waitForTimeout(300);
ok(await page.$(".tp-tools.open"), "tools open as a mobile drawer");

/* ---- appearance customization ---- */
await page.setViewportSize({ width: 1600, height: 1000 });
await page.click(".tools-overlay").catch(() => {});
await page.waitForTimeout(300);
await page.click('button.tp-navitem:has-text("Dashboard")');
await page.waitForTimeout(300);
await page.click('button:has-text("Customize")');
await page.waitForTimeout(300);
ok(await page.$(".tp-drawer"), "Customize panel opens");
await page.click('.tp-ap-theme:has-text("Emerald")');
await page.waitForTimeout(200);
const accent = await page.$eval(".tp-root", el => getComputedStyle(el).getPropertyValue("--indigo").trim());
ok(accent === "#059669", "color theme changes the accent variables");
await page.click('.tp-ap-swatch[title="Linen"]');
await page.waitForTimeout(200);
ok((await page.$eval(".tp-root", el => getComputedStyle(el).backgroundColor)) === "rgb(244, 239, 230)", "background swatch repaints the page");
await page.click('button:has-text("Extra large")');
await page.waitForTimeout(150);
ok(await page.$(".tp-root.ap-fs-xl"), "text size scales the application");
await page.click('.tp-drawer button:has-text("Bold")');
await page.click('.tp-drawer button:has-text("Square")');
await page.waitForTimeout(150);
ok(await page.$(".tp-root.ap-bw-2.ap-rad-square"), "border width and corner style apply");
await page.click('.tp-drawer input[type="checkbox"]');
await page.waitForTimeout(150);
ok(await page.$(".tp-root.ap-gridv"), "table gridlines toggle applies");
await page.click('button:has-text("Reset application defaults")');
await page.waitForTimeout(200);
ok(!(await page.$(".tp-root.ap-fs-xl")) && (accentReset => true)(), "reset restores the defaults");
// per-tab scope: dark on Dashboard only
await page.click('.tp-drawer button:has-text("This tab")');
await page.click('.tp-ap-theme:has-text("Dark")');
await page.waitForTimeout(200);
ok(await page.$(".tp-root.ap-dark"), "per-tab override applies on this tab");
await page.keyboard.press("Escape");
await page.click('button.tp-navitem:has-text("Scenarios")');
await page.waitForTimeout(300);
ok(!(await page.$(".tp-root.ap-dark")), "other tabs keep the application theme");
await page.click('button.tp-navitem:has-text("Dashboard")');
await page.waitForTimeout(300);
ok(await page.$(".tp-root.ap-dark"), "the tab override persists when returning");
await page.click('button:has-text("Customize")');
await page.waitForTimeout(250);
await page.click('.tp-drawer button:has-text("This tab")');
await page.click('button:has-text("Clear this tab")');
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
ok(!(await page.$(".tp-root.ap-dark")), "clearing the tab override restores the global theme");
// ledger column resize
await page.click('button.tp-navitem:has-text("Scenarios")');
await page.waitForTimeout(300);
const grid0 = await page.$eval(".tp-ledger", el => el.style.gridTemplateColumns);
await page.$eval('.tp-colsize input[aria-label="Scenario column width"]', el => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, "250");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(250);
const grid1 = await page.$eval(".tp-ledger", el => el.style.gridTemplateColumns);
ok(grid0 !== grid1 && grid1.includes("250px"), "scenario columns resize within limits and rerender");

ok(errors.length === 0, "no page errors during the run" + (errors.length ? " — " + errors[0] : ""));
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
