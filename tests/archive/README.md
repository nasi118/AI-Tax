# Archived UI tests — the Scenarios ledger

These suites are retained, not deleted, and are **not part of any test run**.

They cover the line-by-line scenario comparison ledger that used to be the
Scenarios tab. That tab now hosts the self-contained 1040 Planner module
(`planner/`, mounted by `src/27-scenarios-planner.js`), and the ledger itself
is archived at `src/archive/08a-scenarios-ledger.js`.

| Suite | Covers |
|---|---|
| `ui-planning-scenarios.mjs` | The ledger's "Planning Scenarios" action bar — Add Scenario, Add Compare, the column picker |
| `ui-strategy-library.mjs` | The ledger's row editors, the Strategy Scenario Library, and Create/Duplicate/delete on the ledger |

Both suites drive selectors that no longer exist in the running app
(`.tp-ledger`, `.tp-vcard`, the drill editors), so they fail by construction
until the ledger is re-linked. If it ever is — load
`src/archive/08a-scenarios-ledger.js` from `index.html` and restore the
`tab === "scenarios"` mount — move these back to `tests/` and they should
apply again unchanged.

Live coverage of the replacement module is in `tests/ui-scenarios-planner.mjs`.
