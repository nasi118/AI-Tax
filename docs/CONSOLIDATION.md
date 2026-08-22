# Repository & Product Consolidation Plan

`AI-Tax` (this repository) is the canonical repository. This plan classifies
the capabilities of the older `AI-Tax-APP` repository, defines what must be
true before `AI-Tax-APP` can be archived, and recommends dispositions for
the other repositories. **No repository is deleted or archived by this
branch — recommendations only.**

## Context

`AI-Tax-APP` is the currently deployed platform shell
(ai-tax-app-ivory.vercel.app). As of its PR #9 it *embeds a copy of this
repository's workbench* (`workbench/`, iframe-embedded) and carries this
repository's `api/` AI proxy **ported to the Anthropic Claude API with
`ANTHROPIC_API_KEY`** — while this repository's `api/` still targets xAI
Grok. That fork must be resolved during consolidation (see backlog P0-3).

## Capability classification

| Capability (in AI-Tax-APP) | Classification | Rationale / acceptance requirements |
|---|---|---|
| Individual Planning Workbench (embedded `workbench/`) | **Already present** — it *is* this repo's app | Consolidation direction: deploy from this repo, embed elsewhere by reference, or keep the copy sync-scripted. Never let the two copies drift silently. |
| AI proxy (`api/`, Claude-ported) | **Migrate** (back-port) | Bring the Anthropic port into this repo verbatim (it preserved all controls); one proxy implementation, two deployments. |
| Trusts & Estates module (Form 1041 workbench, GST planning, trust classification, fiduciary reference) | **Migrate, engine-first** | Highest-value missing scope. Its tax math must NOT be copied as-is: implement 1041/GST parameters as governed rulesets + engine scope (or a sibling engine) with golden tests and reconciliation before any UI migrates. Until then it remains out of scope per `docs/UNSUPPORTED.md`. |
| 1040 Planner (TY2026, `planner/`) | **Redesign** | Overlaps this workbench but carries features this repo lacks (Sec. 6654 safe harbor, AMT estimate, Social Security taxability, OBBBA 2/37 haircut, strategy scenario library). Migrate those as engine modules + golden tests into the workbench engine rather than importing a third parallel app. |
| Client reports (main-app client report) | **Redesign** | This repo's Report + AI build-report cover the core; port the missing presentation pieces onto the existing report pipeline. |
| State-tax views | **Defer** | Real state calculation is a large governed-ruleset effort; the display-only view without an engine invites false confidence. Revisit after 1041/2026-v2 work. |
| Quarterly payments / estimated-tax planning | **Migrate** | Small, high-value; pairs with a Sec. 6654 safe-harbor engine module (see 1040 Planner row) and belongs in the workbench Calculations group. |
| Document status tracking | **Redesign** | Supersede with this repo's import pipeline (`ai_tax/imports.py`) + a review-queue UI; the APP's status list duplicates what SourceDocument/ExtractedFact records already model. |
| Deadline tracking | **Migrate** | Static deadline data + per-client checklists; no tax math. Straightforward workbench page. |
| UI customization (tab appearance, themes) | **Already present** | `src/22-appearance.js` covers themes/per-tab overrides; port any specific missing toggle on demand. |
| AI Tax Strategist chat (main app) | **Reject** | Duplicates the workbench's AI Analysis/Ask AI over a weaker context model (hardcoded profile); the workbench version is grounded in engine snapshots. |
| Dashboard/client profiles (main app) | **Already present** | The workbench multi-client feature supersedes it. |

**Rule for every migration:** no tax formula is copied from `AI-Tax-APP`
without independent validation against authoritative sources, new golden
tests, and (where both engines will support it) cross-engine contract
coverage. UI/workflow code may be ported directly.

## Archival acceptance criteria for AI-Tax-APP

1. The deployed platform serves this repository's workbench (by deployment
   or by verified-sync copy) and the shared Claude AI proxy.
2. Trusts & Estates either migrated engine-first with golden tests + rulesets
   + reconciliation, or explicitly deferred by a recorded decision.
3. Quarterly payments + deadlines + report presentation ported; each with
   acceptance tests in this repo's suites.
4. Cross-engine contract remains green through every migration.
5. A final export of any client data stored against the old app.

## Other repositories (recommendations only — contents not audited from this
session; scope limits prevented reading them)

| Repository | Recommendation |
|---|---|
| `ai-sdk-internal-knowledge-base` | Keep separate. Knowledge-base/SDK experiments don't belong in a tax platform's audit surface; link from docs if used. |
| `Tax-Guru` | Review then likely archive: if any prompt/strategy content is still useful, migrate it into the workbench Planning Guide (content, not code); tax math, if any, is superseded by the governed engines here. |
| `nextjs-boilerplate` | Archive candidate: a stock template with no tax IP. Keep only if it actively serves another deployment. |
