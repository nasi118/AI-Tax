/* ==== 01-constants ==== */
/* ============================================================================
   TAX ADVISORY PRO — STATUTORY CONSTANTS
   TY2025 and TY2026 federal individual income tax figures.

   Sources: Rev. Proc. 2025-32 (2026 inflation adjustments), Rev. Proc. 2024-40
   (2025), Notice 2025-67 (2026 retirement COLAs), Rev. Proc. 2025-19 / 2024-25
   (HSA), Rev. Proc. 2025-25 (Sec. 36B), SSA wage base, CMS 2026 premium fact
   sheet, and P.L. 119-21 (OBBBA).

   TRAPS ENCODED HERE DELIBERATELY:
   1. The 2025 standard deduction and Sec. 179 limits printed in Rev. Proc.
      2024-40 are OBSOLETE. OBBBA superseded them. We use the OBBBA amounts.
   2. For 2026 the HOH bracket boundaries ($201,750 / $256,200) are NOT the same
      as Single/MFS ($201,775 / $256,225). Several secondary sources get this
      wrong. Rev. Proc. 2025-32 Table 2 governs.
   3. For 2026 the Sec. 199A threshold is $201,750 for Single/HOH but $201,775
      for MFS. They are genuinely different numbers.
   4. The four Schedule 1-A deductions (senior, tips, overtime, car loan
      interest) do NOT reduce AGI. They sit below the line at Form 1040 line
      13b, so they never cascade into AGI-based phase-outs.
   ========================================================================== */

const STATUSES = [{
  v: "single",
  l: "Single"
}, {
  v: "mfj",
  l: "Married filing jointly"
}, {
  v: "mfs",
  l: "Married filing separately"
}, {
  v: "hoh",
  l: "Head of household"
}];
const TY = {
  2025: {
    year: 2025,
    label: "TY2025",
    brackets: {
      single: [[0, .10], [11925, .12], [48475, .22], [103350, .24], [197300, .32], [250525, .35], [626350, .37]],
      mfj: [[0, .10], [23850, .12], [96950, .22], [206700, .24], [394600, .32], [501050, .35], [751600, .37]],
      mfs: [[0, .10], [11925, .12], [48475, .22], [103350, .24], [197300, .32], [250525, .35], [375800, .37]],
      hoh: [[0, .10], [17000, .12], [64850, .22], [103350, .24], [197300, .32], [250500, .35], [626350, .37]]
    },
    // OBBBA amounts, NOT the Rev. Proc. 2024-40 figures
    stdDeduction: {
      single: 15750,
      mfj: 31500,
      mfs: 15750,
      hoh: 23625
    },
    addlStdDedMarried: 1600,
    addlStdDedUnmarried: 2000,
    ltcg: {
      single: {
        zero: 48350,
        fifteen: 533400
      },
      mfj: {
        zero: 96700,
        fifteen: 600050
      },
      mfs: {
        zero: 48350,
        fifteen: 300000
      },
      hoh: {
        zero: 64750,
        fifteen: 566700
      }
    },
    ssWageBase: 176100,
    /* Sec. 221 student loan interest — statutory maximum and MAGI phase-out
       range by filing status; MFS is disallowed entirely (range: null). */
    studentLoan: {
      max: 2500,
      range: {
        single: [85000, 100000],
        hoh: [85000, 100000],
        mfj: [170000, 200000],
        mfs: null
      }
    },
    // Retirement
    deferral402g: 23500,
    catchup50: 7500,
    superCatchup6063: 11250,
    limit415c: 70000,
    limit415b: 280000,
    compLimit401a17: 350000,
    simpleDeferral: 16500,
    simpleDeferralHigher: 17600,
    simpleCatchup: 3500,
    simpleCatchupHigher: 3850,
    simpleSuperCatchup: 5250,
    iraLimit: 7000,
    iraCatchup: 1000,
    // Health
    hsa: {
      self: 4300,
      family: 8550,
      catchup55: 1000
    },
    hdhp: {
      minDedSelf: 1650,
      minDedFamily: 3300,
      oopSelf: 8300,
      oopFamily: 16600
    },
    ltcPremiumCap: [[40, 480], [50, 900], [60, 1800], [70, 4810], [999, 6020]],
    // QBI
    qbiThreshold: {
      single: 197300,
      mfj: 394600,
      mfs: 197300,
      hoh: 197300
    },
    qbiPhaseInWidth: {
      single: 50000,
      mfj: 100000,
      mfs: 50000,
      hoh: 50000
    },
    qbiMinDeduction: 0,
    qbiMinQBIFloor: 0,
    // SALT
    saltCap: {
      single: 40000,
      mfj: 40000,
      mfs: 20000,
      hoh: 40000
    },
    saltThreshold: {
      single: 500000,
      mfj: 500000,
      mfs: 250000,
      hoh: 500000
    },
    saltFloor: {
      single: 10000,
      mfj: 10000,
      mfs: 5000,
      hoh: 10000
    },
    saltPhaseRate: 0.30,
    // Statutory, never indexed
    niitThreshold: {
      single: 200000,
      mfj: 250000,
      mfs: 125000,
      hoh: 200000
    },
    addlMedThreshold: {
      single: 200000,
      mfj: 250000,
      mfs: 125000,
      hoh: 200000
    },
    // IRA phase-outs
    iraCovered: {
      single: [79000, 89000],
      hoh: [79000, 89000],
      mfj: [126000, 146000],
      mfs: [0, 10000]
    },
    iraSpouseCovered: {
      mfj: [236000, 246000],
      mfs: [0, 10000]
    },
    rothPhaseout: {
      single: [150000, 165000],
      hoh: [150000, 165000],
      mfj: [236000, 246000],
      mfs: [0, 10000]
    },
    // OBBBA below-the-line (Schedule 1-A) deductions
    seniorDeduction: {
      amount: 6000,
      threshold: {
        single: 75000,
        mfj: 150000,
        mfs: 75000,
        hoh: 75000
      },
      rate: 0.06
    },
    tips: {
      cap: 25000,
      threshold: {
        single: 150000,
        mfj: 300000,
        mfs: 150000,
        hoh: 150000
      },
      rate: 0.10
    },
    overtime: {
      cap: {
        single: 12500,
        mfj: 25000,
        mfs: 12500,
        hoh: 12500
      },
      threshold: {
        single: 150000,
        mfj: 300000,
        mfs: 150000,
        hoh: 150000
      },
      rate: 0.10
    },
    autoLoan: {
      cap: 10000,
      threshold: {
        single: 100000,
        mfj: 200000,
        mfs: 100000,
        hoh: 100000
      },
      rate: 0.20
    },
    // Charitable
    charityAGIFloor: 0,
    charityNonItemizer: {
      single: 0,
      mfj: 0,
      mfs: 0,
      hoh: 0
    },
    itemizedCapApplies: false,
    charityCashAGILimit: 0.60,
    // Credits
    ctc: {
      amount: 2200,
      refundable: 1700,
      threshold: {
        single: 200000,
        mfj: 400000,
        mfs: 200000,
        hoh: 200000
      },
      rate: 0.05
    },
    // Business
    sec179: {
      limit: 2500000,
      phaseout: 4000000
    },
    estate: {
      exclusion: 13990000,
      annualGift: 19000
    },
    // Estimated tax / underpayment safe harbor — IRC §6654; Form 1040-ES
    estimatedTax: {
      currentYearPct: 0.90,
      priorYearPctBelowThreshold: 1.00,
      priorYearPctAboveThreshold: 1.10,
      priorAGIThreshold: { single: 150000, mfj: 150000, mfs: 75000, hoh: 150000 },
      dueDates: ["2025-04-15", "2025-06-15", "2025-09-15", "2026-01-15"]
    }
  },
  2026: {
    year: 2026,
    label: "TY2026",
    brackets: {
      single: [[0, .10], [12400, .12], [50400, .22], [105700, .24], [201775, .32], [256225, .35], [640600, .37]],
      mfj: [[0, .10], [24800, .12], [100800, .22], [211400, .24], [403550, .32], [512450, .35], [768700, .37]],
      mfs: [[0, .10], [12400, .12], [50400, .22], [105700, .24], [201775, .32], [256225, .35], [384350, .37]],
      // NOTE: HOH diverges from Single at the 24/32 and 32/35 boundaries.
      hoh: [[0, .10], [17700, .12], [67450, .22], [105700, .24], [201750, .32], [256200, .35], [640600, .37]]
    },
    stdDeduction: {
      single: 16100,
      mfj: 32200,
      mfs: 16100,
      hoh: 24150
    },
    addlStdDedMarried: 1650,
    addlStdDedUnmarried: 2050,
    ltcg: {
      single: {
        zero: 49450,
        fifteen: 545500
      },
      mfj: {
        zero: 98900,
        fifteen: 613700
      },
      mfs: {
        zero: 49450,
        fifteen: 306850
      },
      hoh: {
        zero: 66200,
        fifteen: 579600
      }
    },
    ssWageBase: 184500,
    /* Sec. 221 student loan interest — statutory maximum and MAGI phase-out
       range by filing status; MFS is disallowed entirely (range: null). */
    studentLoan: {
      max: 2500,
      range: {
        single: [85000, 100000],
        hoh: [85000, 100000],
        mfj: [170000, 200000],
        mfs: null
      }
    },
    deferral402g: 24500,
    catchup50: 8000,
    superCatchup6063: 11250,
    limit415c: 72000,
    limit415b: 290000,
    compLimit401a17: 360000,
    simpleDeferral: 17000,
    simpleDeferralHigher: 18100,
    simpleCatchup: 4000,
    simpleCatchupHigher: 3850,
    simpleSuperCatchup: 5250,
    iraLimit: 7500,
    iraCatchup: 1100,
    hsa: {
      self: 4400,
      family: 8750,
      catchup55: 1000
    },
    hdhp: {
      minDedSelf: 1700,
      minDedFamily: 3400,
      oopSelf: 8500,
      oopFamily: 17000
    },
    // 2026 LTC premium caps were not confirmed to a primary source; 2025 values
    // are carried forward and flagged in the app's assumptions panel.
    ltcPremiumCap: [[40, 480], [50, 900], [60, 1800], [70, 4810], [999, 6020]],
    ltcCapUnverified: true,
    // Sec. 199A: Single and HOH use $201,750; MFS uses $201,775. Not a typo.
    qbiThreshold: {
      single: 201750,
      mfj: 403500,
      mfs: 201775,
      hoh: 201750
    },
    qbiPhaseInWidth: {
      single: 75000,
      mfj: 150000,
      mfs: 75000,
      hoh: 75000
    },
    qbiMinDeduction: 400,
    qbiMinQBIFloor: 1000,
    saltCap: {
      single: 40400,
      mfj: 40400,
      mfs: 20200,
      hoh: 40400
    },
    saltThreshold: {
      single: 505000,
      mfj: 505000,
      mfs: 252500,
      hoh: 505000
    },
    saltFloor: {
      single: 10000,
      mfj: 10000,
      mfs: 5000,
      hoh: 10000
    },
    saltPhaseRate: 0.30,
    saltMFSUnverified: true,
    niitThreshold: {
      single: 200000,
      mfj: 250000,
      mfs: 125000,
      hoh: 200000
    },
    addlMedThreshold: {
      single: 200000,
      mfj: 250000,
      mfs: 125000,
      hoh: 200000
    },
    iraCovered: {
      single: [81000, 91000],
      hoh: [81000, 91000],
      mfj: [129000, 149000],
      mfs: [0, 10000]
    },
    iraSpouseCovered: {
      mfj: [242000, 252000],
      mfs: [0, 10000]
    },
    rothPhaseout: {
      single: [153000, 168000],
      hoh: [153000, 168000],
      mfj: [242000, 252000],
      mfs: [0, 10000]
    },
    seniorDeduction: {
      amount: 6000,
      threshold: {
        single: 75000,
        mfj: 150000,
        mfs: 75000,
        hoh: 75000
      },
      rate: 0.06
    },
    tips: {
      cap: 25000,
      threshold: {
        single: 150000,
        mfj: 300000,
        mfs: 150000,
        hoh: 150000
      },
      rate: 0.10
    },
    overtime: {
      cap: {
        single: 12500,
        mfj: 25000,
        mfs: 12500,
        hoh: 12500
      },
      threshold: {
        single: 150000,
        mfj: 300000,
        mfs: 150000,
        hoh: 150000
      },
      rate: 0.10
    },
    autoLoan: {
      cap: 10000,
      threshold: {
        single: 100000,
        mfj: 200000,
        mfs: 100000,
        hoh: 100000
      },
      rate: 0.20
    },
    sched1AUnverified: true,
    // New for 2026
    charityAGIFloor: 0.005,
    charityNonItemizer: {
      single: 1000,
      mfj: 2000,
      mfs: 1000,
      hoh: 1000
    },
    itemizedCapApplies: true,
    charityCashAGILimit: 0.60,
    ctc: {
      amount: 2200,
      refundable: 1700,
      threshold: {
        single: 200000,
        mfj: 400000,
        mfs: 200000,
        hoh: 200000
      },
      rate: 0.05
    },
    sec179: {
      limit: 2560000,
      phaseout: 4090000
    },
    estate: {
      exclusion: 15000000,
      annualGift: 19000
    },
    // Estimated tax / underpayment safe harbor — IRC §6654; Form 1040-ES
    estimatedTax: {
      currentYearPct: 0.90,
      priorYearPctBelowThreshold: 1.00,
      priorYearPctAboveThreshold: 1.10,
      priorAGIThreshold: { single: 150000, mfj: 150000, mfs: 75000, hoh: 150000 },
      dueDates: ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"]
    }
  }
};

/* ---- Medicare IRMAA, 2026 (CMS). Based on MAGI from the 2024 return. ---- */
const IRMAA_2026 = {
  standardPartB: 202.90,
  partBDeductible: 283,
  lookbackYear: 2024,
  tiers: [{
    single: 109000,
    mfj: 218000,
    mfs: 109000,
    partB: 0.00,
    partD: 0.00
  },
  // thresholds are inclusive upper bounds
  {
    single: 137000,
    mfj: 274000,
    mfs: null,
    partB: 81.20,
    partD: 14.50
  }, {
    single: 171000,
    mfj: 342000,
    mfs: null,
    partB: 202.90,
    partD: 37.50
  }, {
    single: 205000,
    mfj: 410000,
    mfs: null,
    partB: 324.60,
    partD: 60.40
  }, {
    single: 500000,
    mfj: 750000,
    mfs: 391000,
    partB: 446.30,
    partD: 83.30
  }, {
    single: Infinity,
    mfj: Infinity,
    mfs: Infinity,
    partB: 487.00,
    partD: 91.00
  }]
};

/* ---- Federal poverty level, 2025 HHS guidelines (48 states + DC).
   Used for 2026 ACA coverage-year premium tax credits. ---- */
const FPL_2025 = {
  base: 15650,
  increment: 5500
};

/* ---- Sec. 36B applicable percentage table for 2026 (Rev. Proc. 2025-25).
   The ARPA/IRA enhanced subsidies expired after 2025, so the 400% FPL
   subsidy cliff is restored. ---- */
const APPLICABLE_PCT_2026 = [{
  lo: 0,
  hi: 133,
  initial: 2.10,
  final: 2.10
}, {
  lo: 133,
  hi: 150,
  initial: 3.14,
  final: 4.19
}, {
  lo: 150,
  hi: 200,
  initial: 4.19,
  final: 6.60
}, {
  lo: 200,
  hi: 250,
  initial: 6.60,
  final: 8.44
}, {
  lo: 250,
  hi: 300,
  initial: 8.44,
  final: 9.96
}, {
  lo: 300,
  hi: 400,
  initial: 9.96,
  final: 9.96
}];
const num = v => v === "" || v === "-" || v == null || isNaN(v) ? 0 : Number(v);
const clamp0 = v => Math.max(0, v);

/* ============================================================================
   NIIT ACTIVITY CLASSIFICATIONS — Sec. 1411
   One passive/nonpassive checkbox cannot carry Sec. 1411 treatment. Each
   passthrough activity gets a controlled classification; "include" drives the
   net investment income base and "review" forces a human-review warning.
   ========================================================================== */
const NIIT_CLASSES = [{
  v: "portfolio",
  l: "Portfolio income",
  include: true,
  review: false
}, {
  v: "passive",
  l: "Passive trade or business",
  include: true,
  review: false
}, {
  v: "nonpassive",
  l: "Nonpassive trade or business — excluded under §1411",
  include: false,
  review: false
}, {
  v: "nonpassive-rental",
  l: "Nonpassive rental — potentially excluded under §1411",
  include: false,
  review: true
}, {
  v: "rental-niit",
  l: "Rental included in NIIT",
  include: true,
  review: false
}, {
  v: "trader",
  l: "Trader activity subject to NIIT",
  include: true,
  review: false
}, {
  v: "self-rental",
  l: "Self-rental",
  include: false,
  review: true
}, {
  v: "working-capital",
  l: "Working-capital investment income",
  include: true,
  review: false
}, {
  v: "excluded",
  l: "Excluded from NIIT",
  include: false,
  review: false
}, {
  v: "review",
  l: "Human review required",
  include: true,
  review: true
}];
const niitClassInfo = v => NIIT_CLASSES.find(c => c.v === v) || null;

/* Version identifiers — carried on exports, reports and AI snapshots so any
   number can be traced to the engine build and rules vintage that made it. */
const ENGINE_VERSION = "2.0.0";
const RULES_VERSION = "OBBBA-TY2025/TY2026-2026-07";
