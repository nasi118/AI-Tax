/* ============================================================================
   CLIENT IDENTITY TESTS
   Covers: system-ID creation (UUID + fallbacks), sequential client numbers,
   migration of legacy stored profiles (missing IDs, duplicate IDs, duplicate
   numbers — never merged, always flagged), referential-integrity validation,
   and client isolation of scenarios. Run: node tests/client-identity.test.mjs
   ========================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

function makeContext(cryptoImpl) {
  const ctx = { console, structuredClone, Math, JSON, Date, crypto: cryptoImpl, localStorage };
  vm.createContext(ctx);
  for (const f of ["00-format.js", "01-constants.js", "02-engine.js", "03-scenario.js", "04-seed.js", "23-clients.js"]) {
    vm.runInContext(readFileSync(join(root, "src", f), "utf8"), ctx, { filename: f });
  }
  return vm.runInContext(
    "({ uid, blankClient, nextClientNumber, migrateClients, validateClientIntegrity, loadClients, saveClients, demoClients, profileToScenario, syncClientBaseScenario, CLIENTS_KEY })",
    ctx
  );
}

let passed = 0, failed = 0;
const ok = (cond, label) => {
  console.log((cond ? "PASS  " : "FAIL  ") + label);
  cond ? passed++ : failed++;
};

const E = makeContext(crypto);

/* ---- system-ID creation ---- */
{
  const ids = new Set(Array.from({ length: 10000 }, () => E.uid()));
  ok(ids.size === 10000, "uid: 10,000 IDs, zero collisions (crypto.randomUUID)");
  ok([...ids].every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)),
    "uid: RFC-4122 v4 format");
}
{
  const noUUID = { getRandomValues: crypto.getRandomValues.bind(crypto) };
  const E2 = makeContext(noUUID);
  const ids = new Set(Array.from({ length: 10000 }, () => E2.uid()));
  ok(ids.size === 10000, "uid fallback: getRandomValues path, 10,000 IDs, zero collisions");
  ok([...ids].every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)),
    "uid fallback: still RFC-4122 v4 format");
}
{
  const E3 = makeContext(undefined);
  const ids = new Set(Array.from({ length: 10000 }, () => E3.uid()));
  ok(ids.size === 10000, "uid last-resort (no crypto): counter guarantees session uniqueness");
}

/* ---- client numbers ---- */
{
  ok(E.nextClientNumber([]) === "CLIENT-001", "client number: first is CLIENT-001");
  const cs = [{ clientId: "CLIENT-001" }, { clientId: "CLIENT-007" }, { clientId: "DEMO-001" }];
  ok(E.nextClientNumber(cs) === "CLIENT-008", "client number: sequential after the highest");
  ok(E.nextClientNumber(cs, new Set(["CLIENT-008"])) === "CLIENT-009",
    "client number: respects extra reserved numbers");
  const c = E.blankClient("A", cs);
  ok(c.clientId === "CLIENT-008", "blankClient: assigns the next free number");
  ok(/^[0-9a-f-]{36}$/.test(c.id), "blankClient: system ID is a UUID");
}

/* ---- migration ---- */
{
  const legacy = [
    { id: "shared-legacy", clientId: "CLIENT-123", name: "Alpha", profile: {}, scenarios: [{ id: "s1" }] },
    { id: "shared-legacy", clientId: "CLIENT-123", name: "Beta", profile: {}, scenarios: [{ id: "s2" }] },
    { clientId: "", name: "Gamma", profile: {}, scenarios: [] },
  ];
  const m = E.migrateClients(legacy);
  ok(m.clients.length === 3, "migration: never merges records (3 in, 3 out)");
  ok(m.clients[0].id === "shared-legacy", "migration: first holder keeps its system ID");
  ok(m.clients[1].id !== "shared-legacy" && m.clients[1].legacySystemId === "shared-legacy",
    "migration: duplicate system ID reassigned with the legacy value recorded");
  ok(m.clients[1].reviewFlags.length > 0, "migration: duplicate system ID flagged for human review");
  ok(m.clients[0].clientId === "CLIENT-123" && m.clients[1].clientId !== "CLIENT-123",
    "migration: duplicate client number resolved, first holder keeps it");
  ok(m.clients[1].legacyClientId === "CLIENT-123", "migration: legacy client number recorded");
  ok(m.clients[2].id && m.clients[2].clientId, "migration: missing identifiers assigned");
  ok(m.changed === true && m.issues.length === 2, "migration: reports what changed");
  const again = E.migrateClients(m.clients);
  ok(again.changed === false, "migration: idempotent — second pass changes nothing");
}

/* ---- migration runs on load, persists once ---- */
{
  store.clear();
  const legacy = [
    { id: "dup", clientId: "CLIENT-500", name: "One", profile: { x: 1 }, scenarios: [] },
    { id: "dup", clientId: "CLIENT-500", name: "Two", profile: { x: 2 }, scenarios: [] },
  ];
  localStorage.setItem(E.CLIENTS_KEY, JSON.stringify(legacy));
  const loaded = E.loadClients();
  ok(loaded.length === 2 && loaded[0].id !== loaded[1].id,
    "loadClients: migrates stored duplicates without merging");
  const persisted = JSON.parse(localStorage.getItem(E.CLIENTS_KEY));
  ok(persisted[1].legacySystemId === "dup", "loadClients: migrated records persisted");
  store.clear();
}

/* ---- referential integrity ---- */
{
  const clients = [
    { id: "a", clientId: "CLIENT-001", name: "A", scenarios: [{ id: "s1" }, { id: "s2" }] },
    { id: "b", clientId: "CLIENT-002", name: "B", scenarios: [{ id: "s3" }] },
  ];
  ok(E.validateClientIntegrity(clients, []).length === 0, "integrity: clean data has no issues");
  const bad = [
    { id: "a", clientId: "CLIENT-001", name: "A", scenarios: [{ id: "s1" }] },
    { id: "a", clientId: "CLIENT-001", name: "B", scenarios: [{ id: "s1" }] },
  ];
  const issues = E.validateClientIntegrity(bad, [{ id: "e1", clientId: "ghost" }]);
  const kinds = issues.map(i => i.kind).sort();
  ok(kinds.includes("duplicate-system-id"), "integrity: duplicate system IDs detected");
  ok(kinds.includes("duplicate-client-number"), "integrity: duplicate client numbers detected");
  ok(kinds.includes("duplicate-scenario-id"), "integrity: cross-client scenario ID collisions detected");
  ok(kinds.includes("orphaned-audit-entry"), "integrity: audit entries referencing unknown clients detected");
}

/* ---- client isolation ---- */
{
  const demos = E.demoClients();
  const allIds = new Set(demos.map(c => c.id));
  ok(allIds.size === demos.length, "demo clients: unique system IDs");
  const scenarioOwners = new Map();
  for (const c of demos) for (const s of c.scenarios) {
    ok(!scenarioOwners.has(s.id), `isolation: scenario ${s.id.slice(0, 8)}… belongs to exactly one client`);
    scenarioOwners.set(s.id, c.id);
  }
  ok(E.validateClientIntegrity(demos, []).length === 0, "demo clients: pass integrity validation");
}

/* ---- profile flow and client-owned records ---- */
{
  const c = E.blankClient("Flow test", []);
  c.profile.businesses = [{
    name: "Consulting", entityType: "soleprop", grossReceipts: 200000,
    operatingExpenses: 25000, depreciation: 7000, amortization: 3000,
    interestExpense: 5000, otherW2: 0, ubia: 0, sstb: false
  }];
  c.scenarios = [E.profileToScenario(c), { id: "planning", name: "Planning" }];
  const baseId = c.scenarios[0].id;
  c.profile.income.w2Wages = 123456;
  const synced = E.syncClientBaseScenario(c);
  ok(synced.scenarios[0].id === baseId, "profile sync: preserves base scenario identity");
  ok(synced.scenarios[0].w2Wages === 123456, "profile sync: refreshes base facts immediately");
  ok(synced.scenarios[1].id === "planning", "profile sync: preserves planning scenarios");
  const expenses = synced.scenarios[0].schedC.businesses[0].expenses;
  ok(expenses.reduce((n, x) => n + x.amount, 0) === 40000,
    "profile mapping: sole-prop operating, depreciation, amortization and interest all flow");
  ok(Array.isArray(c.workingNotes) && Array.isArray(c.auditLog) && Array.isArray(c.aiHistory) && Array.isArray(c.reportInbox),
    "client isolation: notes, audit, AI history and report inbox are client-owned");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
