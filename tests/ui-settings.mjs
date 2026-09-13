/* Acceptance tests for the application Settings panel (src/28-settings.js).

   Settings are behaviour, not presentation, and not tax data. These tests
   check that each one is actually wired to something — a setting that stores
   a value but changes nothing would pass a naive test and fail a user — and
   that none of them can reach a client scenario or a calculated figure.

   Run:  node tests/ui-settings.mjs [baseURL]                               */
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
await p.waitForTimeout(2000);

const open = async () => { await p.click(".tp-settings-btn"); await p.waitForSelector(".tp-drawer"); await p.waitForTimeout(300); };
const close = async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(300); };
const setting = k => p.evaluate(key => readSetting(key), k);
const gotoTab = async name => {
  await p.evaluate(t => { document.querySelectorAll(".tp-navitem").forEach(x => { if (x.textContent.includes(t)) x.click(); }); }, name);
  await p.waitForTimeout(400);
};

/* ---- opening ---- */
ok(await p.locator(".tp-settings-btn").count() === 1, "a Settings control is in the tab header");
await open();
ok(await p.locator(".tp-drawer").isVisible(), "the Settings panel opens");
const panelText = await p.locator(".tp-drawer").textContent();
for (const h of ["Startup", "Calculation", "AI advisory layer", "Appearance", "Stored on this device"]) {
  ok(panelText.includes(h), "the panel has a " + h + " section");
}
ok(/never mixed with client data/i.test(panelText), "the panel states that settings are not client data");
await close();
ok(!(await p.locator(".tp-drawer").count()), "Escape closes the panel");

/* the command bar reaches it too */
await p.keyboard.press("Control+k");
await p.waitForTimeout(500);
ok(await p.locator(".tp-cmdbar").count() === 1, "the command bar opens");
await p.fill(".tp-cmdbar-input", "settings");
await p.waitForTimeout(400);
ok((await p.locator(".tp-cmdbar-list").textContent()).toLowerCase().includes("open settings"), "the command bar offers Open settings");
/* Run it from the command bar — that also closes the bar. */
await p.click('.tp-cmdbar-item:has-text("Open settings")');
await p.waitForTimeout(600);
ok(await p.locator(".tp-drawer").count() === 1, "the command-bar entry opens the Settings panel");
ok(await p.locator(".tp-cmdbar").count() === 0, "the command bar closes behind it");
await close();

/* ---- defaults ---- */
ok(await setting("startTab") === "last", "startTab defaults to the last-visited tab");
ok(await setting("recalcScope") === "affected", "recalcScope defaults to affected");
ok(await setting("aiEnabled") === true, "the AI layer is enabled by default");
ok(await setting("aiModel") === "gpt-5.6-sol", "the AI model defaults to GPT-5.6 Sol");

/* ---- a corrupt stored value falls back rather than breaking the app ---- */
ok(await p.evaluate(() => {
  const prev = getUIPref("settings", {});
  setUIPref("settings", { recalcScope: "../../etc", aiModel: "claude-opus-5", startTab: "no-such-tab" });
  const out = [readSetting("recalcScope"), readSetting("aiModel"), readSetting("startTab")].join("|");
  setUIPref("settings", prev);
  return out === "affected|gpt-5.6-sol|last";
}), "an out-of-range stored value falls back to its default");

/* ---- AI master switch actually removes the affordances ---- */
await gotoTab("Dashboard");
const aiBefore = await p.locator('.tp-dockbtn:has-text("Ask AI")').count();
ok(aiBefore === 1, "the Ask AI dock button is present while AI is enabled");
await open();
await p.getByRole("button", { name: "Disabled" }).first().click();
await p.waitForTimeout(500);
await close();
ok(await setting("aiEnabled") === false, "the AI layer can be turned off");
ok((await p.locator('.tp-dockbtn:has-text("Ask AI")').count()) === 0, "turning AI off removes the Ask AI dock button");
await gotoTab("SE & Retirement");
ok((await p.locator(".tp-ai-ctx").count()) === 0, "turning AI off removes the module tabs' Ask AI control");
ok((await p.locator(".tp-main").textContent()).length > 200, "the module still renders and computes with AI off");
await gotoTab("Dashboard");
await open();
await p.getByRole("button", { name: "Enabled" }).first().click();
await p.waitForTimeout(500);
await close();
ok((await p.locator('.tp-dockbtn:has-text("Ask AI")').count()) === 1, "turning AI back on restores the dock button");

/* ---- the model choice reaches the request builder ---- */
await open();
await p.getByRole("button", { name: "Luna" }).click();
await p.waitForTimeout(400);
ok(await setting("aiModel") === "gpt-5.6-luna", "the model choice is stored");
ok(await p.evaluate(() => aiRequestModel()) === "gpt-5.6-luna", "the stored model is what the request builder sends");
await p.getByRole("button", { name: "Sol" }).click();
await p.waitForTimeout(400);
ok(await p.evaluate(() => aiRequestModel()) === "gpt-5.6-sol", "switching back takes effect without a reload");
await close();

/* ---- recalculation scope seeds the header control ---- */
await open();
await p.locator('.tp-set-row:has-text("Default recalculation scope") button:has-text("This tab")').click();
await p.waitForTimeout(400);
await close();
ok(await setting("recalcScope") === "tab", "the default recalculation scope is stored");
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
ok(await p.inputValue('select[aria-label="Recalculation scope"]') === "tab", "the header's Recalculate scope opens on the stored default");

/* ---- confirm-before-all-clients ---- */
let dialogs = 0;
p.on("dialog", async d => { dialogs++; await d.dismiss(); });
await p.selectOption('select[aria-label="Recalculation scope"]', "all");
await p.waitForTimeout(200);
await p.click('button:has-text("Recalculate")');
await p.waitForTimeout(600);
ok(dialogs === 1, "an all-client recalculation asks first by default");
await open();
await p.locator('.tp-set-row:has-text("Confirm an all-client") button:has-text("Run straight away")').click();
await p.waitForTimeout(400);
await close();
const before = dialogs;
await p.selectOption('select[aria-label="Recalculation scope"]', "all");
await p.click('button:has-text("Recalculate")');
await p.waitForTimeout(800);
ok(dialogs === before, "with the confirmation turned off it runs straight away");

/* ---- startup tab ---- */
await open();
await p.selectOption('select[aria-label="Tab to open on startup"]', "reference");
await p.waitForTimeout(400);
await close();
await gotoTab("Dashboard");
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
ok((await p.locator(".tp-topbar h2").textContent()).includes("Reference"), "the app opens on the chosen startup tab, not the last-visited one");
await open();
await p.selectOption('select[aria-label="Tab to open on startup"]', "last");
await p.waitForTimeout(400);
await close();
await gotoTab("Planning Guide");
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
ok((await p.locator(".tp-topbar h2").textContent()).includes("Planning Guide"), "'Where I left off' restores the last-visited tab");

/* ---- settings never touch tax data ---- */
const scenariosBefore = await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("tp_clients_v1"))[0].scenarios));
const auditBefore = await p.evaluate(() => (JSON.parse(localStorage.getItem("tp_clients_v1"))[0].auditLog || []).length);
await open();
await p.getByRole("button", { name: "Disabled" }).first().click();
await p.waitForTimeout(300);
await p.getByRole("button", { name: "Enabled" }).first().click();
await p.waitForTimeout(300);
await close();
ok(await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("tp_clients_v1"))[0].scenarios)) === scenariosBefore,
  "changing settings moves no scenario data");
ok(await p.evaluate(() => (JSON.parse(localStorage.getItem("tp_clients_v1"))[0].auditLog || []).length) === auditBefore,
  "changing settings writes no audit entry — they are not tax-data events");

/* ---- reset ---- */
await open();
await p.click('.tp-set-row:has-text("Interface preferences") button:has-text("Reset to defaults")');
await p.waitForTimeout(300);
ok(await p.locator('button:has-text("Reset settings")').count() === 1, "reset asks for confirmation first");
await p.click('button:has-text("Reset settings")');
await p.waitForTimeout(500);
ok(await setting("recalcScope") === "affected" && await setting("aiModel") === "gpt-5.6-sol" && await setting("startTab") === "last",
  "reset restores every setting to its default");
ok(await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("tp_clients_v1"))[0].scenarios)) === scenariosBefore,
  "reset leaves client data untouched");
await close();

ok(errs.length === 0, "no page errors during the run (" + errs.slice(0, 3).join(" | ") + ")");
await b.close();
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
