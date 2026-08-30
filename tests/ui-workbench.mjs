/* UI acceptance tests for the professional-workbench polish: three-state
   navigation, always-visible copyright, command bar, calculation trace,
   persistent desk calculator, copy-for-Excel, undo/redo, pinned calculators,
   report section selection, pop-out view routing — desktop AND mobile.
   Run:  node tests/ui-workbench.mjs [baseURL]  */
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

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name); }
};

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ["--no-sandbox"]
});

// ---------- desktop ----------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(BASE + "/");
  await page.waitForSelector(".tp-root");

  ok(await page.locator(".tp-main-copyright").isVisible(), "desktop: copyright footer visible");
  ok((await page.locator(".tp-main-copyright").textContent()).includes("© 2026 AI Tax Strategy Advisors"), "desktop: copyright text");

  // nav 3 states
  await page.click(".tp-navcollapse");
  ok(await page.locator(".tp-shell.nav-collapsed").count() === 1, "nav: icon rail state");
  await page.click(".tp-navcollapse");
  await page.click(".tp-navhide");
  ok(await page.locator(".tp-shell.nav-hidden").count() === 1, "nav: hidden state");
  ok(await page.locator(".tp-navrestore").isVisible(), "nav: restore button appears");
  await page.reload();
  await page.waitForSelector(".tp-root");
  ok(await page.locator(".tp-shell.nav-hidden").count() === 1, "nav: hidden state persists");
  await page.click(".tp-navrestore");
  ok(await page.locator(".tp-shell.nav-hidden").count() === 0, "nav: restored");

  // command bar
  await page.keyboard.press("Control+k");
  ok(await page.locator(".tp-cmdbar").isVisible(), "command bar opens on Ctrl+K");
  await page.fill(".tp-cmdbar-input", "audit");
  await page.keyboard.press("Enter");
  ok(await page.locator("h2:has-text('Audit Trail')").isVisible(), "command bar navigates to Audit Trail");

  // search button
  await page.click(".tp-searchbtn");
  ok(await page.locator(".tp-cmdbar").isVisible(), "search button opens command bar");
  await page.keyboard.press("Escape");

  // dashboard trace
  await page.evaluate(() => { document.querySelectorAll(".tp-navitem").forEach(b => { if (b.textContent.includes("Dashboard")) b.click(); }); });
  await page.waitForSelector(".tp-kpis");
  await page.click(".tp-kpi .tp-tracebtn >> nth=0");
  ok(await page.locator(".tp-drawer:has-text('Where did this come from?')").isVisible(), "trace drawer opens from KPI");
  ok(await page.locator(".tp-trace-row").first().isVisible(), "trace rows render");
  const prov = await page.locator(".tp-trace-prov").textContent();
  ok(prov.includes("Engine") && prov.includes("rules"), "trace shows engine + rules identity");
  await page.keyboard.press("Escape");

  // walk copy for excel button exists
  ok(await page.locator(".tp-copyxl").count() > 0, "copy-for-Excel button on dashboard walk");

  // calculator dock, tape persistence across tabs
  await page.click(".tp-dockbtn:has-text('Calculator')");
  ok(await page.locator(".tp-win:has-text('Calculator')").isVisible(), "desk calculator opens from dock");
  await page.click(".tp-calcbtn:has-text('7') >> nth=0");
  await page.click(".tp-calc-pad .tp-calcbtn.op:has-text('+')");
  await page.click(".tp-calc-pad .tp-calcbtn:has-text('3')");
  await page.click(".tp-calc-pad .tp-calcbtn.eq");
  const tapeTxt = await page.locator(".tp-win .tp-tape").textContent();
  ok(tapeTxt.includes("= 10"), "calculator computes 7+3=10 on tape");
  /* Navigate to Scenarios — now the embedded 1040 Planner module, not the
     archived ledger — and confirm the floating calculator's tape survives. */
  await page.evaluate(() => { document.querySelectorAll(".tp-navitem").forEach(b => { if (b.textContent.includes("Scenarios")) b.click(); }); });
  await page.waitForSelector("iframe.tp-planner-frame");
  ok((await page.locator(".tp-win .tp-tape").textContent()).includes("= 10"), "tape survives page navigation");

  /* Copy-for-Excel moved with the ledger; the Dashboard still carries it, so
     the control itself is verified there. */
  await page.evaluate(() => { document.querySelectorAll(".tp-navitem").forEach(b => { if (b.textContent.includes("Dashboard")) b.click(); }); });
  await page.waitForSelector(".tp-main");
  ok(await page.locator(".tp-copyxl").count() >= 1, "copy-for-Excel control present");

  /* Undo/redo needs an engine-bound money input. The ledger's inputs are
     archived, so this drives the SE & Retirement module instead — the same
     undo stack, a different page. */
  await page.evaluate(() => { document.querySelectorAll(".tp-navitem").forEach(b => { if (b.textContent.includes("SE & Retirement")) b.click(); }); });
  await page.waitForSelector("input.tp-money");
  const firstMoney = page.locator("input.tp-money").first();
  const before = await firstMoney.inputValue();
  await firstMoney.fill("123456");
  await firstMoney.blur();
  await page.click(".tp-undoredo button >> nth=0");
  const afterUndo = await firstMoney.inputValue();
  ok(afterUndo.replace(/,/g, "") === before.replace(/,/g, ""), "undo restores edited input (" + before + " ← " + afterUndo + ")");
  await page.click(".tp-undoredo button >> nth=1");
  ok((await firstMoney.inputValue()).replace(/,/g, "") === "123456", "redo re-applies the edit");

  // pop-out buttons present
  ok(await page.locator(".tp-popout-tab").isVisible(), "open-in-new-tab control present");
  ok(await page.locator(".tp-popout-win").isVisible(), "pop-out control present");

  // pinned calculators
  await page.click(".tp-pinbtn >> nth=2");
  const firstLabel = await page.locator(".tp-launchrow >> nth=0").textContent();
  ok(await page.locator(".tp-launchrow.pinned").count() === 1, "calculator pinned");
  ok((await page.locator(".tp-launchrow >> nth=0").getAttribute("class")).includes("pinned"), "pinned calculator floats to top (" + firstLabel.trim() + ")");

  // report section toggles
  await page.evaluate(() => { document.querySelectorAll(".tp-navitem").forEach(b => { if (b.textContent.includes("Report")) b.click(); }); });
  await page.waitForSelector(".tp-rp-sections");
  ok(await page.locator(".tp-rp-secchk").count() >= 10, "report section checkboxes render");

  // URL param routing (duplicate view)
  const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page2.goto(BASE + "/?tab=audit");
  await page2.waitForSelector(".tp-root");
  ok(await page2.locator("h2:has-text('Audit Trail')").isVisible(), "?tab=audit opens Audit Trail view");
  await page2.close();

  ok(errors.length === 0, "no page errors on desktop (" + errors.slice(0, 2).join(" | ") + ")");
  await page.close();
}

// ---------- mobile ----------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(BASE + "/");
  await page.waitForSelector(".tp-root");

  ok(await page.locator(".tp-main-copyright").isVisible(), "mobile: copyright footer visible without menus");

  // drawer: open, close via X, close via outside tap, close on navigate
  await page.click(".tp-navtoggle");
  ok(await page.locator(".tp-side.open").count() === 1, "mobile: drawer opens");
  await page.click(".tp-navhide");
  ok(await page.locator(".tp-side.open").count() === 0, "mobile: drawer closes via X");
  await page.click(".tp-navtoggle");
  await page.click(".tp-navoverlay", { position: { x: 380, y: 400 }, force: true });
  ok(await page.locator(".tp-side.open").count() === 0, "mobile: drawer closes on outside tap");
  await page.click(".tp-navtoggle");
  await page.evaluate(() => { document.querySelectorAll(".tp-navitem").forEach(b => { if (b.textContent.includes("Audit")) b.click(); }); });
  ok(await page.locator(".tp-side.open").count() === 0, "mobile: drawer closes on navigate");
  ok(await page.locator("h2:has-text('Audit Trail')").isVisible(), "mobile: navigation works");

  // search visible on mobile topbar
  ok(await page.locator(".tp-searchbtn").isVisible(), "mobile: search control visible");
  await page.click(".tp-searchbtn");
  ok(await page.locator(".tp-cmdbar").isVisible(), "mobile: command bar opens");
  await page.keyboard.press("Escape");

  // tools overlay open/close
  await page.click(".tools-dockbtn");
  ok(await page.locator(".tp-tools.open").count() === 1, "mobile: tools overlay opens");
  await page.click(".tools-overlay", { position: { x: 5, y: 400 }, force: true });
  ok(await page.locator(".tp-tools.open").count() === 0, "mobile: tools overlay closes");

  // pop-out window button hidden on mobile, new-tab still available
  ok(!(await page.locator(".tp-popout-win").isVisible()), "mobile: pop-out window control hidden");

  ok(errors.length === 0, "no page errors on mobile (" + errors.slice(0, 2).join(" | ") + ")");
  await page.close();
}

await browser.close();
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
