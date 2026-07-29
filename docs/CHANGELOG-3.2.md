# Changelog 3.2: Client Profiles & Goal-Driven Planning

**Release Date:** July 2026  
**Model:** Claude Fable 5  
**Status:** Beta

## Summary

Version 3.2 introduces **Client Profiles**—a comprehensive client management module that enables tax planning by tracking household facts, planning goals, and constraints. The module preserves the deterministic tax engine entirely and adds transparent goal alignment scoring that compares engine results to client objectives. All calculated values come from the engine, never hardcoded; scenarios are client-scoped with no mixing; and AI distinguishes facts, goals, constraints, and engine results.

---

## New Features

### 1. Client Profiles Module (`src/23-clients.js`)

**Foundational data model** for client-centric tax planning:

- **Client Object**: Unique identifier, name, filing status, tax year; contains a profiles array and scenarios array scoped to that client only
- **ClientProfile**: Captures household facts (taxpayer/spouse names, ages, dependents, filing status, state, employment, health coverage)
- **Income Tracking**: W-2 wages, bonuses, equity compensation, Schedule C, dividends, gains, pension, Social Security, passthrough income, rental, trust distributions
- **Asset Management**: 16 account types (checking, savings, brokerage, IRAs, 401k, Roth 401k, HSA, 529, real estate, vehicles, business equity, other debt); tracks basis, owner, liquidity
- **Business Entities**: For each business: entity type, ownership %, gross receipts, operating expenses, depreciation, amortization, interest expense, W-2 paid, UBIA, §163(j) carryforward, SSTB classification, material participation, compliance cost
- **Deductions**: Mortgage interest, charitable contributions, medical, taxes (SALT, estimated, real estate, sales), education (AOTC, Lifetime Learning), business (home office), investment fees, tax prep
- **Goals**: Transparent planning objectives drawn from 33-item GOAL_CATALOG (e.g., "min-tax", "max-after-tax", "scorp-eval", "roth-conversion", "qcd", "audit-defense"); ranked by priority; classified by type (structure, deduction, deferral, conversion, hedging, compliance)
- **Constraints**: Min spendable cash, max tax payment, max implementation cost, min reserve, audit risk tolerance, liquidity needs, charitable intent, retirement timing, deferral preference
- **Missing Facts**: Editable list of unconfirmed client facts (e.g., "HDHP eligibility", "reasonable-comp study", "state est payments") tracked separately so AI knows what to ask

**Key Functions:**
- `blankClient()`: Generates a new empty client object
- `blankClientProfile()`: Template for a new profile
- `profileToScenario(client, name)`: Deterministic one-way mapping of profile facts → engine scenario input; handles all income/deduction/business/retirement mappings
- `goalAlignment(client, scenarioResult)`: Transparent rule-based scoring of scenario against client goals; returns `{pct: 82%, rows: [{label, status, detail}]}` with status levels (strong/met/moderate/at-risk/review)
- `loadClients()`: Loads clients from localStorage or defaults to demoClients()
- `demoClients()`: Returns 4 fully-specified demo profiles

**Four Demo Profiles** (fully data-driven, no hardcoding):

1. **DEMO-001 Sarah & David Mitchell** (MFJ Virginia)
   - Taxpayer age 42, spouse 40; no dependents
   - Income: $260k Schedule C (consulting) + $85k W-2 = $345k total
   - Assets: $850k liquid, $1.2M retirement (IRAs + 401k), $800k home equity, $150k business equity
   - Business: Sole prop consulting, 100% ownership, evaluating S-corp election
   - Goals (6): Evaluate S-corp, optimize reasonable compensation, min tax, max after-tax, bracket headroom, audit defense
   - Constraints: $15k min spendable, $25k max tax increase, $5k max implementation cost

2. **DEMO-002 James & Elena Rodriguez** (MFJ California)
   - Taxpayer age 38, spouse 36; 1 dependent (age 12)
   - Income: $485k W-2 + $280k RSU + $50k dividends + $20k LTCG + $15k interest = $850k total
   - Assets: $2.1M brokerage, $1.8M retirement, $600k real estate, $200k debt (mortgage + car loans)
   - Goals (9): Manage equity compensation vesting, capital gains optimization, §199A (QBI), NIIT management, IRMAA, charitable giving, college funding (529), asset location strategy, state tax minimization
   - Constraints: $35k min spendable, $60k max tax increase, $8k max implementation cost

3. **DEMO-003 Linda Park** (Single, Florida, Age 68)
   - No spouse; 1 dependent (adult child, age 40, non-claiming)
   - Income: $145k pension + $35k Social Security + $65k IRA distributions + $30k dividends + $21k LTCG = $296k total
   - Assets: $2.5M brokerage (50% appreciated), $1.2M IRAs (traditional), $400k home, $150k cash
   - Goals (9): Minimize IRMAA (Medicare premiums), optimize Roth conversions, maximize QCD (qualified charitable distributions), manage MAGI, NII tax planning, charitable giving strategy, RMD optimization, tax-loss harvesting, legacy planning
   - Constraints: $20k min spendable, $18k max tax increase (conservative), $3k max implementation cost, charitable intent $25k annual

4. **DEMO-004 Daniel & Priya Shah** (MFJ Texas)
   - Taxpayer age 55, spouse 53; no dependents
   - Income: $2.6M S-corp revenue, $450k owner W-2 comp, $680k K-1 distribution, $120k spouse W-2, $55k dividends = $1.305M total income to return
   - Business: S-corp (100% ownership), SSTB, active participation, $1.8M depreciation, $340k interest expense, $280k other W-2, §163(j) interest limitation active
   - Assets: $5.2M business equity, $2.8M brokerage, $1.5M retirement, $2.2M real estate (investment properties), $800k debt (business + personal loans)
   - Goals (10): Optimize reasonable S-corp compensation, manage §163(j) interest deduction limitation, evaluate C-corp vs S-corp, depreciation acceleration (bonus), charitable remainder trust, cost segregation study, qualified opportunity zone reinvestment, retirement readiness at 65, succession planning, SSTB investment strategy
   - Constraints: $50k min spendable, $85k max tax increase, $25k max implementation cost, audit risk conservative

### 2. Client Profiles Page UI (`src/24-clients-page.js`)

**Complete client management interface**:

- **Roster Grid**: ClientCard components showing all active clients; cards display:
  - Client name, ID, tax year, filing status, state
  - Tags: "Demo" chip for sample profiles; entity type chip (sole prop, S-corp, etc.)
  - KPI cards: Net business income, estimated tax, entity type, profile completeness %
  - Action buttons: Set Active, Copy (duplicate), Archive, Export (JSON/CSV)
  - Highlighted border when client is active

- **10 Subtabs** for comprehensive profile editing:
  1. **Overview**: KPI dashboard showing total income, AGI, taxable income, modeled federal tax, liquid assets, retirement assets, net worth, primary goal; collapsed goals panel; missing facts card with "Resolve" link
  2. **Household**: Taxpayer/spouse names, ages, dependents (name, age, relationship), filing status selector, state selector, employment status (employed/self-employed/retired), health insurance coverage type, risk tolerance (conservative/moderate/aggressive)
  3. **Income**: Editable rows for W-2 wages, bonus, RSU vesting, equity options, Schedule C (description + net profit breakdown), ordinary dividends, qualified dividends, LTCG, STCG, interest, pension, Roth conversions, Social Security, rental, passthrough, trust distributions, other
  4. **Assets**: Editable table with account type (16 types), description, value, basis, owner (taxpayer/spouse/joint), liquidity (high/medium/low), notes; auto-calculated net worth, liquid assets sum, retirement assets sum
  5. **Business**: For each business: entity name, entity type dropdown, ownership %, gross receipts, operating expenses, owner W-2, other W-2, depreciation, amortization, interest expense, UBIA, compliance cost, SSTB checkbox, material participation dropdown; add/remove business buttons
  6. **Deductions**: Mortgage interest, charitable (cash + property + carryforward), medical (medicine, insurance, OOP, HSA contrib/distrib), taxes (estimated, SALT, real estate, sales), education (AOTC, Lifetime Learning), business (home office SqFt), other (investment fees, tax prep, IRA premium)
  7. **Goals**: Display GOAL_CATALOG selector to add new goals; editable rows showing priority (1-10), goal name (from catalog), reason (free text), classification (structure/deduction/deferral/conversion/hedging/compliance), target amount, detail; buttons: "Create test scenario", "Ask AI", "Remove"
  8. **Constraints**: Min/max spendable cash, max tax payment, max implementation cost, min reserve, audit risk tolerance, liquidity needs (near/medium/extended), deferral preference, charitable intent (committed/planned amounts, vehicle), retirement timing (year + notes), other constraints (free text)
  9. **Missing Facts**: Editable list of unconfirmed facts; each row shows description, category (income/deduction/entity/timing/basis/other), priority (high/medium/low), estimated impact, "Asked about" checkbox; add/remove buttons
  10. **Notes**: Free-text area for engagement notes, document inventory, follow-ups

- **Actions on Cards**:
  - Set Active: Switches global TP_ACTIVE_CLIENT and updates sidebar selector
  - Copy: Duplicates profile to new client (can edit name/ID)
  - Archive: Soft-deletes from active roster (can restore)
  - Export: Saves profile as JSON or CSV data file

### 3. Client-Scoped Scenarios (`src/10-app.js`)

**Complete app state refactor** for client-centric workflows:

- **Global State**: `clients` array persisted to localStorage; `activeClientId` tracks current client; `clientSafe` fallback to first non-archived client
- **TP_ACTIVE_CLIENT Global**: Exposes current client to all modules (AI packages, calculators, reference guide)
- **updateClient(id, fn)**: Helper function to update specific client, re-persist to localStorage
- **setScenarios()**: Now updates `client.scenarios` via `updateClient()`, not global state
- **status/year/setStatus/setYear**: Read/write to current client profile, not global state
- **Sidebar Client Selector**: Dropdown of active clients + "Manage clients" button to open ClientProfilesPage
- **Topbar Compact Select**: Quick client selector for collapsed navigation
- **Tab Navigation**: `tab === "clients"` renders ClientProfilesPage; other tabs read client context
- **Reset Button**: Rebuilds base scenario from client profile via `profileToScenario()`
- **Audit Trail**: All events logged with `clientId` tag for traceability

### 4. Goal Alignment & Dashboard Integration (`src/08-pages.js`)

**Goal-driven scenario comparison**:

- **ScenariosPage**: Accepts `client` and `alignments` props (computed per scenario)
- **GoalAlignmentBlock Component**: Displays alignment percentage with expandable detail rows showing goal status (Strong/Met/Moderate/At-risk/Review) and reasoning
- **Per-Scenario Card**: Alignment block rendered below "Spendable cash" row; badge "Best aligned with goals" on highest-scoring scenario
- **ScenarioAIPanel**: Shows client context in header ("Sarah and David Mitchell · TY2025 · Primary objective: Maximize after-tax income while maintaining moderate risk")
- **AI Quick Analysis**: "Compare to client goals" option to analyze scenarios against client objectives

- **Dashboard**: 
  - Added goal progress card (visible when `client.goals.length > 0`)
  - Table showing: goal label | detail | status (Strong/Met/Moderate/At-risk/Needs review) with color-coded rows
  - Scrollable if more than 6 goals

### 5. Tools Panel Goal Monitor (`src/20-tools-panel.js`)

**Client-aware right rail**:

- **ToolsPanel**: Accepts `client` and `alignment` props (in addition to existing result, validation, etc.)
- **Client Snapshot Section**: Replaces "Active scenario" with client name, clientId, tax year, filing status, scenario name, primary goal
- **Goal Monitor Section**: Visible when `client && alignment && alignment.rows.length > 0`
  - Shows alignment percentage with color-coded label (good/warn/bad)
  - Expandable rows showing up to 6 goals with status labels (Strong/Met/Moderate/At-risk/Needs review) and detail text

### 6. AI Integration (`src/15-ai-chat.js`, `src/17-ai-optimize.js`)

**Client facts and goals in all AI packages**:

- **Data Package**: Now includes `clientProfile` section with:
  - householdSummary: taxpayerAge, spouseAge, dependents, dependentAges, retired, medicare, healthCoverage
  - riskTolerance, auditRiskTolerance
  - goalsRanked: sorted by priority, includes priority/goal/classification/targetAmount/reason
  - constraints: minSpendableCash, maxCurrentTaxPayment, maxImplementationCost, minCashReserve, other
  - assetSummary: netWorthModeled, liquidAssets, retirementAssets, debt
  - businesses: array with name, entityType, sstb, grossReceipts, ownerCompensation, otherW2, ubia, businessInterestExpense, sec163jCarryforward, notes
  - unresolvedClientFacts: array of missing facts (what AI must ask about)

- **System Objective**: Changed from blank to: "DEFAULT OBJECTIVE: maximize after-tax economic value while respecting the client's liquidity needs, stated tax goals, risk preferences and implementation constraints. Never optimize for tax minimization alone."

- **Optimizer Integration** (`src/17-ai-optimize.js`):
  - Step === "objective" now includes `clientPriorities` (top goals from profile, sorted by priority) and `clientConstraints` (min spendable, max payment, max cost, audit risk tolerance, other)
  - Step 1 UI displays client priorities note: "Client priorities — Sarah and David Mitchell: 1. Evaluate S-corporation election · 2. Optimize reasonable compensation · ..."
  - Optimizer reads these goals and constraints; does not simply pick the lowest-tax scenario

### 7. Calculator Prefill from Client Profile (`src/21-calculators.js`)

**Contextual prefill without altering scenarios**:

- **S163j Calculator**: Prefills from `TP_ACTIVE_CLIENT.profile.businesses[0]` with:
  - rev (gross receipts), opex (operating expenses + owner comp), dep (depreciation), amort (amortization), intExp (interest expense), carry (interest carryforward)
  - Note: "Prefilled from [business name] on the active client profile. Standalone planning estimate..."
- **Pattern**: Prefill reads from profile, changes don't alter scenario until user clicks "Create test scenario"

### 8. Planning Guide Client Relevance (`src/09-reference.js`)

**Facts-based strategy selection**:

- **guideClientRelevance(client, result)**: Returns map of `{strategyName: reasonString}` for client-specific relevance
- **Relevance Rules**:
  - Schedule C > $60k → S-corp election
  - S-corp or goal → reasonable compensation
  - HDHP coverage → HSA contributions/strategy
  - Business depreciation → bonus depreciation
  - Age 70+ → §199A (QBI) optimization
  - Age 68+ → IRMAA management
  - Medicare → IRMAA/NII planning
  - NIIT income > 0 → NIIT strategy
  - Charity + appreciated securities → charitable gifting
  - Multiple businesses → cost allocation
  - Passive losses → passive activity limitations
  - IRA distributions + income → Roth conversion

- **PlanningGuide Component**: Accepts `client` and `baseResult` props
  - Computes relevance useMemo
  - Added "onlyRelevant" checkbox filter: Filters strategies to only those in relevance map
  - Collapsed accordion rows show "Relevant" chip (green pill) when in relevance map
  - Expanded body shows relevance reason: "Relevant to [client name]: [reason]" before strategy body

### 9. Report Objectives Section (`src/18-ai-report.js`)

**Client goals and constraints transparency**:

- Added "Objectives & Context" section to AI-generated reports
- Displays:
  - Client name and filing status
  - Client priorities (top 3 goals with priority ranking)
  - Key constraints (min/max cash, max tax payment, max implementation cost, audit risk)
  - Comparison table: Goal label | Detail | Result from scenario | Status
- Helps reviewers understand how the AI recommendation aligns with client-stated objectives

---

## Files Modified

### New Files
- **`src/23-clients.js`** (1100+ lines): Client data model, profile structure, 4 demo profiles, profileToScenario(), goalAlignment()
- **`src/24-clients-page.js`** (1000+ lines): Client Profiles UI with 10 subtabs, client roster, profile editing
- **`docs/CLIENT_PROFILES_SCHEMA.md`** (400+ lines): Comprehensive data schema documentation
- **`docs/CHANGELOG-3.2.md`**: This file

### Modified Files
- **`css/styles.css`**: Added .tp-side-client, .tp-clientgrid, .tp-clientcard, .tp-goalrow, .tp-goalalign classes for client UI
- **`index.html`**: Added src/23-clients.js and src/24-clients-page.js script tags
- **`src/08-pages.js`**: ScenariosPage accepts client/alignments props; added GoalAlignmentBlock; Dashboard shows goal progress card
- **`src/09-reference.js`**: Added guideClientRelevance() function; PlanningGuide accepts client prop; added onlyRelevant filter; relevance chips
- **`src/10-app.js`**: Complete refactor for client-scoped scenarios; clients state; activeClientId; updateClient() helper; TP_ACTIVE_CLIENT global; client selector in sidebar/topbar
- **`src/15-ai-chat.js`**: buildAIDataPackage() includes full clientProfile section; updated system objective
- **`src/17-ai-optimize.js`**: step === "objective" includes clientPriorities and clientConstraints; Step 1 UI displays priorities
- **`src/20-tools-panel.js`**: ToolsPanel accepts client/alignment props; Client snapshot section; Goal monitor section
- **`src/21-calculators.js`**: S163jCalc prefills from TP_ACTIVE_CLIENT.profile.businesses[0]

---

## Acceptance Criteria Met

✅ **Preserve Tax Engine**: All 41 golden regression tests pass; no logic changes to calculations  
✅ **Engine-Computed Values**: All tax numbers come from engine results, never hardcoded in profiles  
✅ **Client-Scoped Scenarios**: Each client owns scenarios array; no mixing across clients  
✅ **AI Distinction**: AI packages include separate sections for facts, goals, constraints, and engine results  
✅ **No Invented Facts**: unresolvedClientFacts array shows what AI must ask about  
✅ **Transparent Alignment**: goalAlignment() function is rules-based, not ML/magic; scores explained in detail rows  
✅ **Demo Profiles**: 4 fully-specified profiles with exact numbers matching specification  
✅ **Profile Completeness**: Overview tab shows % complete; missing facts tracked separately  
✅ **Editable Everything**: All profile fields editable; changes auto-persist to localStorage  
✅ **Calculators Prefill**: S163j reads from active client without altering scenario  
✅ **Planning Guide Relevance**: Strategies marked relevant to specific client based on facts-based rules  
✅ **Goal Progress**: Dashboard and tools panel show scenario alignment vs client goals  
✅ **Report Objectives**: AI reports show objectives section with priorities and constraints

---

## Testing

- **Golden Tests**: 41/41 passed (tax engine untouched)
- **Client Creation**: Demo profiles load correctly on app start
- **Goal Editing**: Goals editable, persist to localStorage
- **Profile Completeness**: % tracking accurate
- **Scenario Alignment**: Alignment % calculated correctly per goal
- **AI Context**: Client profile visible in AI packages via inspector
- **Relevance Filtering**: Planning guide filters by client facts accurately
- **Prefill**: S163j calculator prefills from active client business entity
- **No Cross-Contamination**: Switching clients updates all references; scenarios never mixed

---

## Breaking Changes

None. This is a purely additive feature. Existing scenarios and engine behavior are unchanged.

---

## Future Enhancements

- Multi-client scenario comparison (e.g., "Compare S-corp vs C-corp across 3-year plan")
- Goal templates for common client profiles (e.g., "Tech executive", "Retiree", "Business owner")
- Scenario recommendation engine based on goal weighting
- Client archive/restore with historical tracking
- Bulk profile import from tax software or prior-year data
- Team collaboration (engagement notes, document sharing)
- Goal tracking over time (historical % alignment)
- Integration with estate planning and retirement projections

---

## Notes for Developers

- **ProfileToScenario**: The mapping from ClientProfile to engine Scenario input is deterministic and one-way. It can be called multiple times with the same input to produce identical scenarios. Do not modify this function without coordinating with AI and reporting modules.

- **Goal Alignment**: The alignment scoring is intentionally transparent and rule-based. It is not an ML model, and scores are always explainable. Alignment detail rows must always include a specific reason.

- **Client Globals**: TP_ACTIVE_CLIENT is a global reference to the current active client. Modules that read it (AI packages, calculators, reference guide) must handle the case where TP_ACTIVE_CLIENT is null (no active client).

- **Scenario Ownership**: A Scenario object is always owned by exactly one Client. Never move scenarios between clients without re-computing the profileToScenario() baseline.

- **Data Persistence**: Clients are persisted to localStorage as a single JSON array. Edits to a client field trigger saveClients(). Large profile arrays (100+ clients) may have performance implications; consider database storage for production deployments.

---

## Credits

Client Profiles module designed and implemented with goal-driven tax planning in mind. Specification driven by requirements to preserve engine integrity, embed client context in AI analysis, and provide transparent goal alignment scoring.
