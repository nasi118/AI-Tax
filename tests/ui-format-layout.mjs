/* Formatting & layout acceptance tests (mandatory interface requirements).
   Run:  node tests/ui-format-layout.mjs [baseURL]
   Same harness conventions as ui-acceptance.mjs. */
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
let passed = 0, failed = 0;
const ok = (cond, label) => {
  console.log((cond ? "PASS  " : "FAIL  ") + label);
  cond ? passed++ : failed++;
};

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);

const rowBtn = (row, text) => page.click(`.tp-ap-row:has-text("${row}") button:has-text("${text}")`).then(() => page.waitForTimeout(200));
const bodyFont = () => page.evaluate(() => getComputedStyle(document.querySelector(".tp-root")).fontFamily);
const numFont = () => page.evaluate(() => getComputedStyle(document.querySelector(".tp-kpi strong")).fontFamily);

/* ---- fonts ---- */
await page.click('button:has-text("Customize")');
await page.waitForTimeout(400);
ok(await page.$('.tp-ap-row:has-text("Font family") button:has-text("Calibri")'), "Calibri appears as a font option");
await rowBtn("Font family", "Calibri");
const bf = await bodyFont();
ok(bf.includes("Calibri") && bf.includes("Carlito"), "Calibri applies with the Carlito/Segoe UI fallback stack");
const kpiBefore = await page.textContent(".tp-kpi strong");
await rowBtn("Number font", "Georgia Serif");
ok((await numFont()).includes("Georgia"), "number font can differ from the text font");
ok((await bodyFont()).includes("Calibri"), "text font unchanged by the number-font choice");
ok(await page.textContent(".tp-kpi strong") === kpiBefore, "changing fonts does not alter the underlying numbers");
await rowBtn("Number weight", "Bold");
ok(await page.$eval(".tp-root", el => el.className.includes("ap-numw-bold")), "number weight applies separately from text");

/* ---- number formats (presentation-only; one shared service) ---- */
const fmt = expr => page.evaluate(expr);
ok(await fmt('usd$(-1234)') === "($1,234)", "default negative currency is accounting parentheses");
await rowBtn("Negative numbers", "-$1,234");
ok(await fmt('usd$(-1234)') === "-$1,234", "negative style: leading minus renders");
await rowBtn("Currency", "$1,234.00");
ok(await fmt('usd$(-1234.5)') === "-$1,234.50", "currency decimals render");
await rowBtn("Zero currency", "—");
ok(await fmt('usd$(0)') === "—", "zero-currency dash renders");
await rowBtn("Percent precision", "12.34%");
ok(await fmt('pct(0.12345)') === "12.35%", "percent precision applies");
const kpiAfterFmt = await page.textContent(".tp-kpi strong");
ok(/\$[\d,]+\.\d{2}$/.test(kpiAfterFmt), "KPI values render through the shared formatter (decimals visible)");
ok(await fmt('TP_ACTIVE_CLIENT.scenarios[0].w2Wages !== undefined') === true, "stored numeric inputs untouched by formatting");

/* ---- persistence + reset ---- */
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
ok((await bodyFont()).includes("Calibri"), "formatting persists after reload");
ok(await fmt('usd$(-1234)') === "-$1,234.00", "number-format choices persist after reload");

/* per-tab override does not leak */
await page.click('button.tp-navitem:has-text("Scenarios")');
await page.waitForTimeout(300);
await page.click('button:has-text("Customize")');
await page.waitForTimeout(300);
await page.click('.tp-ap-row:has-text("Apply to") button:has-text("This tab")');
await page.waitForTimeout(200);
await rowBtn("Font family", "Monospace");
ok((await bodyFont()).includes("Menlo") || (await bodyFont()).includes("monospace"), "tab-scoped font applies on that tab");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.click('button.tp-navitem:has-text("Dashboard")');
await page.waitForTimeout(300);
ok((await bodyFont()).includes("Calibri"), "per-tab formatting does not alter other tabs");
await page.click('button:has-text("Customize")');
await page.waitForTimeout(300);
await page.click('button:has-text("Reset application defaults")');
await page.waitForTimeout(300);
ok(!(await bodyFont()).includes("Calibri"), "reset restores the default text font");
ok(await fmt('usd$(-1234)') === "($1,234)", "reset restores default number formatting");
await page.keyboard.press("Escape");

/* ---- layout: move, resize, hide, persist, undo, reset ---- */
await page.click('button:has-text("Edit layout")');
await page.waitForTimeout(300);
ok(await page.$(".tp-layout-editing"), "Edit Layout mode activates");
const firstOrder = await page.$$eval(".tp-layout-cell .tp-layout-grip", els => els.map(e => e.textContent.trim()));
await page.click('.tp-layout-chrome:has-text("chart") button[aria-label="Move chart later"]');
await page.waitForTimeout(200);
const movedOrder = await page.$$eval(".tp-layout-cell .tp-layout-grip", els => els.map(e => e.textContent.trim()));
ok(firstOrder.join() !== movedOrder.join(), "a card can be moved (keyboard-accessible controls)");
await page.click('.tp-layout-chrome:has-text("chart") button:has-text("Full width")');
await page.waitForTimeout(200);
ok(await page.$('.tp-layout-cell.tp-w-half .tp-layout-chrome:has-text("chart")'), "a card can be resized (grid span)");
ok(await page.$(".tp-layout-cell.tp-w-half svg, .tp-layout-cell.tp-w-half canvas, .tp-layout-cell.tp-w-half .tp-sec"), "resized card still renders its content (charts rerender in the new container)");
await page.click('button:has-text("Undo")');
await page.waitForTimeout(200);
ok(!(await page.$('.tp-layout-cell.tp-w-half .tp-layout-chrome:has-text("chart")')), "undo restores the previous layout");
await page.click('.tp-layout-chrome:has-text("curve") button:has-text("Hide")');
await page.click('button:has-text("Save layout")');
await page.waitForTimeout(300);
const kpiPreReload = await page.textContent(".tp-kpi strong");
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
const gripsAfter = await page.$$eval(".tp-layout-cell .tp-layout-grip", els => els.map(e => e.textContent.trim())).catch(() => []);
ok(await page.$('button:has-text("1 hidden")'), "layout (hidden widget) persists after reload with a Manage Hidden entry");
ok(await page.textContent(".tp-kpi strong") === kpiPreReload, "layout changes do not alter calculation outputs");
ok(await page.$(".tp-calcid"), "critical status strip stays visible under a customized layout");

/* mobile stays usable */
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
ok(await page.$eval(".tp-layout-grid", el => getComputedStyle(el).display === "block"), "mobile collapses the custom grid to a single column");
await page.setViewportSize({ width: 1600, height: 1000 });
await page.waitForTimeout(300);

/* removed/unknown widgets never corrupt startup */
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("tp_layout_v1"));
  raw.tabs.dashboard.order.unshift("widget-that-no-longer-exists");
  raw.tabs.dashboard.span["ghost"] = "half";
  localStorage.setItem("tp_layout_v1", JSON.stringify(raw));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
ok(await page.$(".tp-kpi strong"), "unknown or removed widget ids do not break application startup");

/* recalculate still works after formatting + layout changes */
await page.click('button:has-text("Recalculate")');
await page.waitForTimeout(600);
ok((await page.textContent(".tp-calcid")).includes("Recalculated ✓"), "Recalculate works after layout and formatting changes");

/* layout edit never enters tax-data audit trail */
await page.click('button.tp-navitem:has-text("Audit Trail")');
await page.waitForTimeout(400);
const audit = await page.textContent(".tp-main");
ok(!audit.includes("layout"), "layout changes are not recorded as tax-data audit events");

ok(errors.length === 0, "no page errors during the run" + (errors.length ? " — " + errors[0] : ""));
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
if (failed) process.exit(1);
