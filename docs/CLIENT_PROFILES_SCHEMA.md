# Client Profiles Data Schema

## Overview

The Client Profiles module enables tax planning by tracking household facts, planning goals, and constraints for each client. All client data is stored deterministically in the `Client` object structure and never mixed with calculated tax results from the engine.

## Client Object Structure

```javascript
{
  id: string,                    // Unique client identifier (e.g., "DEMO-001")
  name: string,                  // Display name (e.g., "Sarah & David Mitchell")
  clientId: string,              // Human-readable ID for filing (e.g., "SM-2025-001")
  isDemo: boolean,               // True if this is a demo/sample profile
  archived: boolean,             // False for active clients, true for archived
  
  profile: ClientProfile,        // All household facts, income, assets, businesses
  
  scenarios: Scenario[],         // Array of tax scenarios for this client
                                 // Each scenario contains engine-calculated results
  
  metadata: {
    created: number,             // Unix timestamp of profile creation
    modified: number,            // Unix timestamp of last modification
    engagement: string,          // Engagement name or notes
    taxYear: number              // Primary tax year (2025 or 2026)
  }
}
```

## ClientProfile Object Structure

The ClientProfile contains all facts about the client—income sources, assets, household composition, goals, and constraints. None of these fields contain calculated tax values.

### Household Section
```javascript
{
  household: {
    taxpayerName: string,
    taxpayerAge: number,
    spouseName: string | null,
    spouseAge: number | null,
    filingStatus: "single" | "mfj" | "mfs" | "hoh" | "qw",
    dependents: Array<{
      name: string,
      age: number,
      relationship: "child" | "parent" | "other"
    }>,
    state: string,               // Two-letter state code
    
    employment: {
      taxpayerEmployment: "employed" | "self-employed" | "retired" | "unemployed",
      spouseEmployment: "employed" | "self-employed" | "retired" | "unemployed" | null
    },
    
    healthCoverage: {
      taxpayerCoverage: "employer" | "aca" | "medicare" | "uninsured" | "hdhp",
      spouseCoverage: "employer" | "aca" | "medicare" | "uninsured" | "hdhp" | null,
      dependentCoverage: "employer" | "aca" | "medicare" | "uninsured" | "hdhp"
    },
    
    riskTolerance: "conservative" | "moderate" | "aggressive",
    auditRiskTolerance: "very-conservative" | "conservative" | "moderate" | "aggressive"
  }
}
```

### Income Section
```javascript
{
  income: {
    w2Wages: number,             // Total W-2 wages (all jobs combined)
    w2Bonus: number,             // Bonus/discretionary compensation
    
    equityComp: {
      rsu: number,               // Restricted stock unit vesting
      options: number,           // Exercised options gains
      other: number
    },
    
    scheduleC: {
      description: string,       // Business description (e.g., "Consulting")
      grossReceipts: number,
      operatingExpenses: number,
      netProfit: number          // Gross receipts − operating expenses
    },
    
    investments: {
      ordinaryDividends: number,
      qualifiedDividends: number,
      ltcg: number,              // Long-term capital gains
      stcg: number,              // Short-term capital gains
      interestIncome: number,
      otherIncome: number
    },
    
    retirement: {
      iraDistributions: number,
      rothConversions: number,   // Non-deductible → Roth conversions
      pensionIncome: number,
      socialSecurity: number,
      irdIncome: number          // Income in Respect of Decedent
    },
    
    passthrough: {
      s1231Gains: number,        // Section 1231 gains from business assets
      passthroughIncome: number, // K-1 partnership/S-corp net income
      sstbIncome: number         // Specified Specified Taxable Business Income
    },
    
    other: {
      rentalIncome: number,
      farmIncome: number,
      trustDistributions: number,
      gambling: number
    }
  }
}
```

### Assets Section
```javascript
{
  assets: Array<{
    id: string,                  // Unique ID for this asset row
    type: "checking" | "savings" | "money-market" | "brokerage" | 
          "ira-trad" | "ira-roth" | "401k" | "roth401k" | "sep-ira" | "simple" |
          "529" | "hsa" | "real-estate" | "vehicle" | "business-equity" | "other-debt",
    description: string,         // Name of account or asset
    value: number,               // Current market value
    basis: number,               // Cost basis (for investments)
    owner: "taxpayer" | "spouse" | "joint" | "dependent",
    liquidity: "high" | "medium" | "low",  // How quickly convertible to cash
    notes: string                // Optional notes (e.g., "Held > 1 year")
  }>,
  
  netWorth: number,              // Sum of all asset values (for reference)
  liquidAssets: number,          // Sum of high-liquidity assets
  retirementAssets: number       // Sum of IRA/401k/HSA/529 accounts
}
```

### Business Entities Section
```javascript
{
  businesses: Array<{
    id: string,                  // Unique entity ID
    name: string,                // Legal entity name
    entityType: "sole-prop" | "scorp" | "llc-taxed-corp" | "llc-taxed-partnership" | "partnership" | "other",
    ownership: number,           // Ownership percentage (0-100)
    
    revenue: {
      grossReceipts: number,     // Total business receipts
      salesReturns: number,      // Returns and allowances
      netSales: number           // Gross receipts − returns
    },
    
    expenses: {
      operatingExpenses: number, // Rent, utilities, supplies, etc.
      depreciation: number,      // MACRS depreciation
      amortization: number,      // Section 197 amortization
      interestExpense: number,   // Business loan interest
      ownerCompensation: number, // W-2 paid to owner (S-corp only)
      otherW2: number            // W-2 paid to other employees
    },
    
    assets: {
      ubia: number,              // Unadjusted basis of business property (for QBI W-2 wage limit)
      costOfGoodsSold: number,   // Direct labor, materials, manufacturing overhead
      capitalGains: number,      // Section 1231 gains from business asset sales
    },
    
    taxTreatment: {
      sstb: boolean,             // Specified Taxable Business Income (for QBI)
      materialParticipation: "active" | "passive",
      profitMotive: boolean,
      sec163jCarryforward: number,  // Interest deduction carryforward from prior years
      sec163jInterestExpense: number // Interest deductible in current year
    },
    
    compliance: {
      estimatedTaxPayments: number,
      liabilityInsurance: number,
      complianceCost: number,    // Accounting, bookkeeping
      notes: string
    }
  }]
}
```

### Deductions Section
```javascript
{
  deductions: {
    mortgageInterest: number,    // Home mortgage interest
    studentLoanInterest: number, // Student loan interest (capped at $2,500)
    charitableCash: number,      // Cash charitable contributions
    charitableProperty: number,  // FMV of appreciated property donated
    charitableCarryforward: number, // Prior-year charitable carryforward
    
    medical: {
      medicineAndDrugs: number,
      insurancePremiums: number,
      oopCosts: number,          // Out-of-pocket medical expenses
      hsaContributions: number,  // Health Savings Account contributions
      hsaDistributions: number   // HSA distributions (non-medical tracked separately)
    },
    
    taxes: {
      estimatedTax: number,      // Quarterly estimated tax payments
      saltDeduction: number,     // State and local tax deduction
      realEstateProperty: number,
      salesTax: number           // When electing sales tax over income tax
    },
    
    education: {
      aotcCourses: number,       // American Opportunity Tax Credit course expenses
      lifetimeExpenses: number,  // Lifetime Learning Credit expenses
      studentInterestDeduction: number
    },
    
    business: {
      homeOffice: boolean,       // Takes home office deduction
      homeOfficeSqFt: number,
      homeOfficeTotalSqFt: number
    },
    
    other: {
      investmentFees: number,
      taxPreparation: number,
      iraPremium: number         // Self-employed premium calculation
    }
  }
}
```

### Payments Section
```javascript
{
  payments: {
    estimatedTaxes: number,      // Total of 4 quarterly ES payments
    ownAccountSEHI: number,      // Self-employed health insurance deduction
    sep401kContribution: number, // SEP-IRA or Solo 401(k) contributions
    notes: string
  }
}
```

### Goals Section
```javascript
{
  goals: Array<{
    id: string,                  // Unique goal ID
    goalId: string,              // Reference to GOAL_CATALOG entry (e.g., "min-tax", "scorp-eval")
    priority: number,            // 1-10 priority ranking (1 = highest)
    label: string,               // Display label (e.g., "Evaluate S-corp election")
    reason: string,              // Why this goal matters to the client
    classification: "structure" | "deduction" | "deferral" | "conversion" | "hedging" | "compliance",
    targetAmount: number | null, // Dollar target if applicable
    detail: string               // Additional context or acceptance criteria
  }]
}
```

### Constraints Section
```javascript
{
  constraints: {
    minSpendableCash: number,    // Minimum after-tax cash needed
    maxCurrentTaxPayment: number,   // Won't accept scenarios with tax higher than this
    maxImplementationCost: number,  // Won't implement strategies costing more than this
    minCashReserve: number,      // Emergency fund minimum
    maxAuditRisk: string,        // "very-conservative" | "conservative" | "moderate" | "aggressive"
    
    liquidityNeeds: {
      near: number,              // Cash needed within 6 months
      medium: number,            // Within 1-2 years
      extended: number           // 2-5 years
    },
    
    deferralPreference: "aggressive" | "moderate" | "conservative",
    
    charitableIntent: {
      committed: number,         // Annual charitable giving commitment
      planned: number,           // One-time/major gifts
      vehicle: "cash" | "appreciated-securities" | "clf" | "donor-advised" | "combination"
    },
    
    retirementTiming: {
      plannedRetirement: number, // Year of retirement (or null)
      militaryServicePension: boolean,
      notes: string
    },
    
    other: string                // Free-text additional constraints
  }
}
```

### Missing Facts Section
```javascript
{
  missingFacts: Array<{
    id: string,
    description: string,        // E.g., "HDHP eligibility confirmation"
    category: "income" | "deduction" | "entity" | "timing" | "basis" | "other",
    priority: "high" | "medium" | "low",
    estimatedImpact: string,    // "High tax impact" or "Nice to know"
    askedAbout: boolean         // True if AI has asked about this
  }]
}
```

## Goal Alignment Scoring

When a scenario is computed, `goalAlignment(client, scenario)` returns:

```javascript
{
  pct: number,                 // Overall alignment percentage (0-100)
  rows: Array<{
    label: string,             // Goal label (e.g., "Evaluate S-corp election")
    status: "strong" | "met" | "moderate" | "at-risk" | "review",
    detail: string,            // Specific reason (e.g., "S-corp saves $8,200 in SE tax")
    targetAmount: number | null,
    achieved: number | null
  }>
}
```

Status meanings:
- **strong**: Goal fully achieved with notable benefit
- **met**: Goal achieved as targeted
- **moderate**: Partial progress or moderate benefit
- **at-risk**: Goal not yet addressed or negative progress
- **review**: Insufficient information to assess

## Key Principles

1. **Profile = Facts Only**: A ClientProfile contains only household facts, income sources, assets, businesses, deductions, goals, and constraints. It never contains calculated tax values.

2. **Engine Results = Scenario**: All tax calculations (income, deductions, tax liability, effective rates) live in the `Scenario` object and come from the deterministic engine.

3. **No Mixing**: A client's scenarios array is never mixed with other clients' scenarios. Each scenario is scoped to exactly one client.

4. **Transparent Mapping**: `profileToScenario(client, name)` deterministically maps profile facts → engine scenario input. The mapping is one-way and stateless.

5. **No Hardcoding**: All displayed numbers come from the engine result, never from hardcoded values in the profile.

6. **AI Integration**: The AI package includes:
   - Full profile facts (household, income, assets, businesses, deductions)
   - Goals ranked by priority
   - Constraints (min/max cash, max payment, max cost)
   - Missing facts (what AI must ask about)
   - UnresolvedClientFacts array for transparency

## Data Persistence

- Client profiles are loaded via `loadClients()` → localStorage or `demoClients()`
- Changes are persisted via `saveClients(clients)` → localStorage
- Demo profiles are hardcoded in `src/23-clients.js` and cannot be accidentally deleted
- Each client's scenarios are persisted with the client

## Demo Profiles

Four fully-specified demo profiles ship with the app:

1. **DEMO-001 Sarah & David Mitchell** (MFJ Virginia)
   - $260k Schedule C + $85k W-2 income
   - Evaluating S-corp election
   - 6 planning goals

2. **DEMO-002 James & Elena Rodriguez** (MFJ California)
   - $700k+ W-2 + RSU income
   - Managing equity comp and capital gains
   - 9 planning goals

3. **DEMO-003 Linda Park** (Single, Florida, Age 68)
   - $296k income (pension, SS, IRA, investments)
   - Focused on Roth conversions and IRMAA management
   - 9 planning goals

4. **DEMO-004 Daniel & Priya Shah** (MFJ Texas)
   - S-corp manufacturer, $2.6M revenue
   - Managing reasonable compensation and §163(j)
   - 10 planning goals

## Validation and UI Constraints

- All money fields are validated as non-negative numbers
- Age fields must be 0-120
- Ownership percentages must be 0-100
- Goals must reference existing GOAL_CATALOG entries
- Filing status determines spouse field requirements
- Entity type determines available expense and asset fields
