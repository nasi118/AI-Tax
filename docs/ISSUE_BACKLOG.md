# Proposed Issue Backlog

Proposed GitHub issues, grouped by priority. **Not created remotely** —
create them on request. Each follows: problem, scope, non-goals,
dependencies, implementation notes, tests required, acceptance criteria,
risk if deferred.

---

## P0 — accuracy, client-data security, reconciliation, identity

### P0-1 · Release `us-federal-2026-v2` from the published Rev. Proc. 2025-32
- **Problem:** The Python TY2026 ruleset is a pre-publication inflation
  projection; the JS engine encodes the published figures. The cross-engine
  contract currently allows a documented ±$250 drift on parameter-sensitive
  metrics for 2026 because of this.
- **Scope:** New `us-federal-2026-v2.json` generated with cited Rev. Proc.
  2025-32 / Notice 2025-67 values, `legal_status: enacted`, governance entry
  with reviewer sign-off; supersede `-v1`; tighten
  `tests/test_cross_engine_contract.py` to strict tolerances for 2026.
- **Non-goals:** Editing `-v1` (immutable); changing 2027–2030 projections.
- **Dependencies:** Governance flow (done); a human reviewer.
- **Implementation notes:** Extend `scripts/build_rulesets.py` with an
  enacted-2026 block; every parameter needs its own citation line; the JS
  constants file's source notes (Rev. Proc. table traps, e.g. HOH bracket
  boundaries and the §199A threshold) are a checklist, not a source.
- **Tests:** New golden 2026 cases (hand-computed); contract strict for 2026;
  governance validation green.
- **Acceptance:** Contract passes at ±$5 for 2026; RULES-PROV-001 no longer
  fires for 2026; old calculations stay pinned to `-v1`.
- **Risk if deferred:** Every 2026 planning number carries projection drift
  (~$70–$100 on mid incomes) and a review burden that will be silently
  normalized.

### P0-2 · Formal review of the six `legacy-unreviewed` ruleset releases
- **Problem:** The initial releases predate governance; they are grandfathered
  as `legacy-unreviewed` with no reviewer/approval timestamp.
- **Scope:** A qualified reviewer verifies each parameter against its cited
  sources, fills `reviewer` / `approved_at`, flips `review_status` to
  `approved`.
- **Non-goals:** Changing parameters (that is P0-1 / new versions).
- **Dependencies:** None.
- **Tests:** Governance validation already enforces the rule for new
  releases; after review, remove the grandfather status from the entries.
- **Acceptance:** No entry carries `legacy-unreviewed`.
- **Risk if deferred:** The audit posture claims review discipline the
  original releases never actually received.

### P0-3 · Unify the AI proxy on the Anthropic port (key handling) — ✅ RESOLVED
> **Superseded 2026-09-01.** The provider changed again: the AI layer now runs
> on the OpenAI API (`api/_lib/openai-proxy.js`, `OPENAI_API_KEY`,
> `gpt-5.6-sol` by default). The unification this entry records still holds —
> one proxy, one provider, one env var — only the provider differs. The record
> below is left as written, describing the state at the time it was resolved.
> The Python agent runtime remains Anthropic-backed and is unaffected.

**Resolved 2026-08-30.** `api/_lib/claude-proxy.js` is back-ported verbatim
from AI-Tax-APP, so one implementation now serves both repositories.
`api/_lib/grok-proxy.js` is gone; every route requires `ANTHROPIC_API_KEY`
and defaults to `claude-opus-5`. The reviewer's route is `/api/ai/chat`, with
`/api/grok` retained as a deprecated alias so an older cached client build
still works. `src/15-ai-chat.js` sends `AI_ENDPOINT_MODEL` instead of a
`grok-4.5` literal and defaults the BYO-key provider to Claude; the BYO-key
surface itself is unchanged, so an xAI key still works if a user supplies one.
`vercel.json` gained the `functions.maxDuration` block the proxy's 50s budget
assumes — it was missing here, so long AI calls would have been killed by the
platform before the proxy could return a readable error. Handler unit tests
are in `tests/api-claude-proxy.test.mjs` (39 assertions, offline) and run in
`npm test`. README documents the env var and routes.

Original entry:

- **Problem:** This repo's `api/` still targets xAI (`XAI_API_KEY`) while the
  deployed AI-Tax-APP copy was ported to the Claude API
  (`ANTHROPIC_API_KEY`). Two proxies with different providers and env vars is
  a security/config hazard.
- **Scope:** Back-port the Claude proxy (it kept all controls: POST-only,
  size ceiling, per-IP rate limit, sanitized history, timeout, refusal
  handling); update `src/15-ai-chat.js` transport labels/model ids;
  README env-var docs.
- **Non-goals:** Changing the BYO-key fallback surface.
- **Dependencies:** None (the port exists in AI-Tax-APP `api/_lib/claude-proxy.js`).
- **Tests:** Handler unit tests (status probe, 501/400/405, upstream-error
  mapping) mirroring AI-Tax-APP's.
- **Acceptance:** One proxy implementation in both repos; deploys need only
  `ANTHROPIC_API_KEY`.
- **Risk if deferred:** Key confusion across deployments; drift between the
  copies (already happened once).

### P0-4 · Surface client-identity integrity issues in the UI
- **Problem:** `validateClientIntegrity()` exists but only tests call it;
  migration flags render as a badge, yet a corrupted store (duplicate ids
  injected by imports/sync) isn't checked at load.
- **Scope:** Run validation on app load + after import; show issues on the
  Clients page; block nothing (report-only).
- **Tests:** UI acceptance case with a seeded-duplicate store.
- **Acceptance:** A seeded integrity issue is visible without opening dev
  tools.
- **Risk if deferred:** Cross-client attribution errors stay invisible —
  the exact failure class Phase 4 exists to prevent.

## P1 — production readiness & operational controls

### P1-1 · Database backend implementing `PersistenceBackend`
Postgres per `docs/PERSISTENCE.md` (jsonb documents + revision CAS,
insert-only immutable tables, append-only stream, retired-documents table);
`tests/test_persistence.py` is the executable contract; add backup/restore
runbook. **Risk:** JSON store has no row-level security or concurrent-writer
story beyond CAS.

### P1-2 · Real document extractors + malware scanning behind existing hooks
PDF/OCR (and optionally LLM-assisted) extractors implementing the
`TextW2Extractor` interface; a real scanner on the `malware_scan` hook; every
output still lands in the review queue. **Non-goal:** auto-approval of
anything. **Risk:** import pipeline stays demo-grade.

### P1-3 · Facts → base-version bridge
Service that builds a new `BaseCaseVersion` from approved `ClientFact`s
(provenance carried through, `facts_as_overrides` today stops at override
shape), then runs validate → calculate → reconcile. **Risk:** the last
import-lifecycle step (recalculation) stays manual.

### P1-4 · Import review-queue UI
Workbench page over `review_queue()` / `preview()` / `decide()` with the
correct-value flow. **Risk:** pipeline unusable by non-developers.

### P1-5 · Enable branch protection on `main`
Apply `docs/CI.md` recommendations (requires repo admin — manual). **Risk:**
red builds can merge; deploys aren't gated.

### P1-6 · Tenant enforcement pass
`tenant_id` is recorded but only the agent toolkit enforces isolation;
add store-level scoping (list/read by tenant) ahead of P1-1. **Risk:**
a future multi-tenant deployment could read across tenants via direct
store calls.

### P1-7 · Complete the remaining interface-mandate items
The canonical recalculation service (scoped Recalculate on every tab, identity
strip, fault isolation, audit logging), the shared number-format service with
Customize controls, Calibri + separate text/number fonts, and the Edit Layout
mode (move/resize/hide with versioned persistence) are implemented and tested
(`tests/ui-format-layout.mjs`). Remaining, in scope order: named layout views
+ "set as my default"/firm default, per-KPI-card granularity and an optional
freeform mode, accounting column alignment + date-format + compact-threshold
controls, prefs export/import with preview, an end-to-end AI test matrix
against a live provider covering every entry point (the context/staleness
plumbing is in place), and executing the duplicate-tab removals per
`docs/UI_CONSOLIDATION.md` once their gates are met. **Risk:** the mandate's
final acceptance list stays partially open.

## P2 — maintainability & planned feature work

### P2-1 · Execute the consolidation plan (`docs/CONSOLIDATION.md`)
Trusts & Estates engine-first; quarterly payments + Sec. 6654 module;
deadlines; report presentation; then archive AI-Tax-APP per its acceptance
criteria.

### P2-2 · UI acceptance coverage for the multi-client feature
The suite pins the legacy seed; add client-switching, profile→scenario sync,
archive/copy/import flows. **Risk:** the newest surface has the least
coverage (root cause of the baseline's stale-fixture failures).

### P2-3 · Workbench engine numeric-drift guard
Either move the JS engine's money math to integer-cents/Decimal or add a
property test asserting float error stays under the contract tolerance on
randomized inputs. **Risk:** silent float drift lands on client reports.

### P2-4 · Per-schedule CSV exports
Documented small follow-up on the existing line-item data.

### P2-5 · Import-pipeline listing efficiency
`approved_facts`/`review_queue` scan whole collections; fine for JSON-file
scale, wrong for a DB — add indexed queries to the backend interface when
P1-1 lands.

## P3 — optional enhancements

- **P3-1** Specialist agents (Roth conversion, capital gains, charitable)
  through the existing toolkit only (ARCHITECTURE "later phases").
- **P3-2** SHA-pin GitHub Action dependencies (org policy permitting).
- **P3-3** Per-tenant client-number prefixes (CLIENT-ACME-001).
- **P3-4** Workbench: surface the capability matrix in the Reference pages
  so users see engine boundaries in-app.
