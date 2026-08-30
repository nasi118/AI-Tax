/* =========================================================================
   Tax Planner — Individual 1040 (TY2026) · calculation engine
   Faithful port of the reference planner engine: all math runs on
   decimal.js (precision 40, ROUND_HALF_UP) and every computed line carries
   its controlling authority and a completeness status.
   Exposed as window.TaxEngine.
   ========================================================================= */
(function () {
  'use strict';

  var Decimal = window.Decimal;
  Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

  function deepFreeze(obj) {
    Object.freeze(obj);
    if (obj && typeof obj === 'object') {
      for (var k of Object.keys(obj)) {
        var v = obj[k];
        if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
      }
    }
    return obj;
  }

  var NIIT_THRESHOLD = { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000, qss: 250000 };

  var PARAMS = deepFreeze({
    year: 2026,
    ordinaryBrackets: {
      single: [
        { rate: 0.10, upTo: 12400 }, { rate: 0.12, upTo: 50400 }, { rate: 0.22, upTo: 105700 },
        { rate: 0.24, upTo: 201775 }, { rate: 0.32, upTo: 256225 }, { rate: 0.35, upTo: 640600 },
        { rate: 0.37, upTo: Infinity }],
      mfj: [
        { rate: 0.10, upTo: 24800 }, { rate: 0.12, upTo: 100800 }, { rate: 0.22, upTo: 211400 },
        { rate: 0.24, upTo: 403550 }, { rate: 0.32, upTo: 512450 }, { rate: 0.35, upTo: 768700 },
        { rate: 0.37, upTo: Infinity }],
      mfs: [
        { rate: 0.10, upTo: 12400 }, { rate: 0.12, upTo: 50400 }, { rate: 0.22, upTo: 105700 },
        { rate: 0.24, upTo: 201775 }, { rate: 0.32, upTo: 256225 }, { rate: 0.35, upTo: 384350 },
        { rate: 0.37, upTo: Infinity }],
      hoh: [
        { rate: 0.10, upTo: 17700 }, { rate: 0.12, upTo: 67450 }, { rate: 0.22, upTo: 105700 },
        { rate: 0.24, upTo: 201775 }, { rate: 0.32, upTo: 256200 }, { rate: 0.35, upTo: 640600 },
        { rate: 0.37, upTo: Infinity }],
      qss: [
        { rate: 0.10, upTo: 24800 }, { rate: 0.12, upTo: 100800 }, { rate: 0.22, upTo: 211400 },
        { rate: 0.24, upTo: 403550 }, { rate: 0.32, upTo: 512450 }, { rate: 0.35, upTo: 768700 },
        { rate: 0.37, upTo: Infinity }]
    },
    standardDeduction: { single: 16100, mfj: 32200, mfs: 16100, hoh: 24150, qss: 32200 },
    additionalStandardDeductionAged: { single: 2050, mfj: 1650, mfs: 1650, hoh: 2050, qss: 1650 },
    seniorBonusDeduction: {
      amount: 6000,
      phaseoutRate: 0.06,
      magiThreshold: { single: 75000, mfj: 150000, mfs: 75000, hoh: 75000, qss: 150000 }
    },
    capitalGainsBrackets: {
      single: { zeroUpTo: 49450, fifteenUpTo: 545500 },
      mfj: { zeroUpTo: 98900, fifteenUpTo: 613700 },
      mfs: { zeroUpTo: 49450, fifteenUpTo: 306850 },
      hoh: { zeroUpTo: 66200, fifteenUpTo: 579600 },
      qss: { zeroUpTo: 98900, fifteenUpTo: 613700 }
    },
    niitThreshold: NIIT_THRESHOLD,
    additionalMedicare: { threshold: Object.assign({}, NIIT_THRESHOLD), rate: 0.009 },
    socialSecurityWageBase: 184500,
    ssRateSE: 0.124,
    ssRateEmployee: 0.062,
    medicareRateSE: 0.029,
    medicareRateEmployee: 0.0145,
    seNetEarningsFactor: 0.9235,
    seTaxDeductionRate: 0.5,
    qbi: {
      deductionRate: 0.2,
      threshold: { single: 201775, mfj: 403550, mfs: 201775, hoh: 201775, qss: 403550 },
      phaseInRange: { single: 75000, mfj: 150000, mfs: 75000, hoh: 75000, qss: 150000 },
      minimumDeduction: 400,
      minimumDeductionQbiFloor: 1000
    },
    saltCap: { base: 40400, magiPhaseDownThreshold: 505000, phaseDownRate: 0.3, floor: 10000 },
    amt: {
      exemption: { single: 90100, mfj: 140200, mfs: 70100, hoh: 90100, qss: 140200 },
      phaseoutThreshold: { single: 500000, mfj: 1000000, mfs: 500000, hoh: 500000, qss: 1000000 },
      phaseoutRate: 0.25,
      rateLow: 0.26,
      rateHigh: 0.28,
      rateBreakpoint: 244500
    },
    charitableFloor: { agiFloorRate: 0.005, cashCeilingRate: 0.6, nonCashCeilingRate: 0.3 },
    itemizedDeductionLimitation: { haircutNumerator: 2, haircutDenominator: 37 },
    estimatedTaxSafeHarbor: {
      currentYearRate: 0.9,
      priorYearRate: 0.1,
      priorYearRateHighIncome: 1.1,
      highIncomeAgiThreshold: { single: 150000, mfj: 150000, mfs: 75000, hoh: 150000, qss: 150000 }
    },
    niitRate: 0.038,
    capitalLossLimit: { single: 3000, mfj: 3000, mfs: 1500, hoh: 3000, qss: 3000 },
    socialSecurityTaxability: {
      baseAmount: { single: 25000, mfj: 32000, mfs: 0, hoh: 25000, qss: 32000 },
      secondTier: { single: 34000, mfj: 44000, mfs: 0, hoh: 34000, qss: 44000 },
      firstTierRate: 0.5,
      secondTierRate: 0.85
    },
    childTaxCredit: {
      perChildUnder17: 2200,
      refundablePerChild: 1700,
      otherDependentCredit: 500,
      phaseoutThreshold: { single: 200000, mfj: 400000, mfs: 200000, hoh: 200000, qss: 400000 },
      phaseoutRatePer1000: 50
    }
  });

  var PARAM_AUTHORITIES = deepFreeze({
    ordinaryBrackets: 'Rev. Proc. 2025-32 §2.01 (IRC §1(j))',
    standardDeduction: 'Rev. Proc. 2025-32 §2.02; IRC §63(c), OBBBA P.L. 119-21 §70102',
    additionalStandardDeductionAged: 'IRC §63(f)',
    seniorBonusDeduction: 'OBBBA P.L. 119-21 §70103 (2025-2028)',
    capitalGainsBrackets: 'Rev. Proc. 2025-32 §2.03; IRC §1(h)',
    niitThreshold: 'IRC §1411',
    additionalMedicare: 'IRC §3101(b)(2)',
    socialSecurityWageBase: 'SSA 2026 wage base determination; IRC §1401',
    seNetEarningsFactor: 'IRC §1402(a)',
    seTaxDeduction: 'IRC §164(f)',
    qbi: 'IRC §199A; OBBBA P.L. 119-21 §70105 (expanded phase-in range)',
    saltCap: 'OBBBA P.L. 119-21 §70120; IRC §164(b)(6)',
    amt: 'Rev. Proc. 2025-32 §2.05; IRC §55',
    charitableFloor: 'OBBBA P.L. 119-21 (0.5% AGI floor); IRC §170',
    itemizedDeductionLimitation: 'OBBBA P.L. 119-21 (2/37 haircut, replaces Pease); IRC §68 (as amended)',
    estimatedTaxSafeHarbor: 'IRC §6654',
    capitalLossLimit: 'IRC §1211(b)',
    socialSecurityTaxability: 'IRC §86',
    childTaxCredit: 'IRC §24; OBBBA P.L. 119-21 §70104'
  });

  /* ---- status lattice --------------------------------------------------- */
  var STATUS_RANK = { error: 4, incomplete: 3, estimated: 2, complete: 1, 'not-applicable': 0 };

  function worstStatus() {
    var worst = 'not-applicable';
    for (var i = 0; i < arguments.length; i++) {
      if (STATUS_RANK[arguments[i]] > STATUS_RANK[worst]) worst = arguments[i];
    }
    return worst;
  }

  /* ---- decimal helpers -------------------------------------------------- */
  function dec(v) {
    if (v === null || v === undefined) return new Decimal(0);
    if (v instanceof Decimal) return v;
    if (typeof v === 'number' && !Number.isFinite(v)) return new Decimal(0);
    try {
      var d = new Decimal(v);
      return d.isNaN() ? new Decimal(0) : d;
    } catch (e) {
      return new Decimal(0);
    }
  }

  function round2d(d) {
    var n = d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    return n === 0 ? 0 : n;
  }

  function round2(v) { return round2d(dec(v)); }

  function sum(values) {
    return round2d(values.reduce(function (acc, v) { return acc.plus(dec(v)); }, new Decimal(0)));
  }

  function clampMin0(d) { return Decimal.max(d, 0); }

  /* ---- line / module constructors --------------------------------------- */
  function line(key, label, amount, opts) {
    opts = opts || {};
    var item = { key: key, label: label, amount: round2(amount), status: opts.status != null ? opts.status : 'complete' };
    if (opts.citation !== undefined) item.citation = opts.citation;
    if (opts.notes !== undefined) item.notes = opts.notes;
    if (opts.detail !== undefined) item.detail = opts.detail;
    return item;
  }

  function moduleResult(moduleKey, label, lines, opts) {
    opts = opts || {};
    var messages = opts.messages != null ? opts.messages : [];
    var derived = worstStatus.apply(null,
      lines.map(function (l) { return l.status; }).concat(
        messages.length
          ? messages.map(function (m) { return m.severity === 'error' ? 'error' : m.severity === 'warning' ? 'estimated' : 'complete'; })
          : []));
    return {
      moduleKey: moduleKey,
      label: label,
      status: opts.status != null ? opts.status : derived,
      lines: lines,
      total: opts.total != null ? opts.total : round2(lines.reduce(function (a, l) { return a + l.amount; }, 0)),
      messages: messages
    };
  }

  var msgCounter = 0;
  function msg(severity, message, opts) {
    opts = opts || {};
    msgCounter += 1;
    var m = { id: opts.id != null ? opts.id : 'msg-' + msgCounter, severity: severity, message: message };
    if (opts.moduleKey !== undefined) m.moduleKey = opts.moduleKey;
    if (opts.field !== undefined) m.field = opts.field;
    return m;
  }

  /* ---- module keys ------------------------------------------------------ */
  var MOD_WAGES = 'wages';
  var MOD_INTDIV = 'interestDividends';
  var MOD_BUSINESS = 'businessIncome';
  var MOD_RENTAL = 'rentalIncome';
  var MOD_OTHER = 'otherIncome';
  var MOD_SE = 'selfEmploymentTax';
  var MOD_PLANNING = 'planningDeductions';
  var MOD_DEDUCTIONS = 'deductions';
  var MOD_TAXCOMP = 'taxComputation';
  var MOD_ADDL = 'additionalTaxes';
  var MOD_PAYMENTS = 'payments';
  var MODULE_ORDER = [MOD_WAGES, MOD_INTDIV, MOD_BUSINESS, MOD_RENTAL, MOD_OTHER, MOD_SE,
    MOD_PLANNING, MOD_DEDUCTIONS, 'qbi', MOD_TAXCOMP, MOD_ADDL, MOD_PAYMENTS];

  var CONTRIBUTION_LIMITS = { traditionalIra: 8000, sepIra: 72000, solo401k: 78000, hsaFamily: 8750 };

  function errorModule(moduleKey, label, err) {
    var text = err instanceof Error ? err.message : String(err);
    var m = msg('error', label + ' failed to compute: ' + text, { moduleKey: moduleKey });
    return { moduleKey: moduleKey, label: label, status: 'error', lines: [], total: 0, messages: [m] };
  }

  /* ---- module computations ---------------------------------------------- */

  function computeWages(inputs) {
    var wages = inputs.wages;
    var totalWages = sum(wages.map(function (w) { return w.wages; }));
    var withholding = sum(wages.map(function (w) { return w.federalWithholding; }));
    var ssWages = sum(wages.map(function (w) { return w.socialSecurityWages; }));
    var medicareWages = sum(wages.map(function (w) { return w.medicareWages; }));
    var deferrals = sum(wages.map(function (w) { return w.retirementDeferral; }));
    var hsa = sum(wages.map(function (w) { return w.hsa; }));
    var messages = [];
    for (var w of wages) {
      if (w.wages < 0) {
        messages.push(msg('error', 'Wages for ' + (w.employer || 'unnamed employer') + ' cannot be negative.',
          { moduleKey: MOD_WAGES, field: 'wages' }));
      }
      if (w.socialSecurityWages > 0 && w.socialSecurityWages > w.wages + w.retirementDeferral + 1) {
        messages.push(msg('warning', 'Social Security wages exceed Box 1 wages plus deferrals for ' + (w.employer || 'unnamed employer') + '.',
          { moduleKey: MOD_WAGES, field: 'socialSecurityWages' }));
      }
    }
    return moduleResult(MOD_WAGES, 'Wages', [
      line('wages.total', 'Total wages (Form 1040 line 1a)', totalWages, { citation: 'IRC §61(a)(1); Form 1040 line 1a' }),
      line('wages.federalWithholding', 'Federal income tax withheld', withholding, { citation: 'IRC §31(a)' }),
      line('wages.socialSecurityWages', 'Social Security wages', ssWages, { citation: 'IRC §3121(a)' }),
      line('wages.medicareWages', 'Medicare wages', medicareWages, { citation: 'IRC §3121(a)' }),
      line('wages.retirementDeferral', 'Elective deferrals (401k/403b, informational)', deferrals, { citation: 'IRC §402(g)' }),
      line('wages.hsa', 'Employer/cafeteria HSA contributions (informational)', hsa, { citation: 'IRC §223' })
    ], { messages: messages, total: totalWages });
  }

  function computeInterestDividends(inputs) {
    var items = inputs.interestDividends;
    var taxableInterest = sum(items.filter(function (i) { return i.kind === 'interest'; }).map(function (i) { return i.amount; }));
    var taxExempt = sum(items.filter(function (i) { return i.kind === 'taxExemptInterest'; }).map(function (i) { return i.amount; }));
    var ordinaryDividends = sum(items.filter(function (i) { return i.kind === 'ordinaryDividend' || i.kind === 'qualifiedDividend'; }).map(function (i) { return i.amount; }));
    var qualifiedDividends = sum(items.filter(function (i) { return i.kind === 'qualifiedDividend'; }).map(function (i) { return i.amount; }));
    var withholding = sum(items.map(function (i) { return i.federalWithholding; }));
    return moduleResult(MOD_INTDIV, 'Interest & Dividends', [
      line('interest.taxable', 'Taxable interest (Form 1040 line 2b)', taxableInterest, { citation: 'IRC §61(a)(4)' }),
      line('interest.taxExempt', 'Tax-exempt interest (line 2a, informational)', taxExempt, {
        citation: 'IRC §103; IRC §86(b)(2)',
        notes: ['Excluded from taxable income; included in MAGI for NIIT/SS taxability tests.']
      }),
      line('dividends.ordinary', 'Ordinary dividends (Form 1040 line 3b)', ordinaryDividends, { citation: 'IRC §61(a)(7)' }),
      line('dividends.qualified', 'Qualified dividends (Form 1040 line 3a)', qualifiedDividends, {
        citation: 'IRC §1(h)(11)',
        notes: ['Taxed at preferential capital gains rates; included within ordinary dividends above.']
      }),
      line('interestDividends.federalWithholding', 'Federal withholding on interest/dividends', withholding, { citation: 'IRC §31(a)' })
    ], { total: taxableInterest + ordinaryDividends });
  }

  function computeBusinessIncome(inputs) {
    var perBusiness = inputs.businesses.map(function (b) {
      var net = b.netIncomeOverride !== undefined ? b.netIncomeOverride : round2(b.grossReceipts - b.expenses);
      return { business: b, net: net };
    });
    var totalNet = sum(perBusiness.map(function (e) { return e.net; }));
    var messages = [];
    for (var entry of perBusiness) {
      if (entry.net < 0) {
        messages.push(msg('warning', (entry.business.name || 'Unnamed business') + ' reports a net loss of ' + Math.abs(entry.net) + '.',
          { moduleKey: MOD_BUSINESS, field: 'netIncome' }));
      }
      if (entry.business.materialParticipation === false && entry.net < 0) {
        messages.push(msg('warning', (entry.business.name || 'Unnamed business') + ' loss may be subject to passive activity limitation (not fully modeled).',
          { moduleKey: MOD_BUSINESS, field: 'materialParticipation' }));
      }
    }
    return {
      result: moduleResult(MOD_BUSINESS, 'Business Income', [
        line('business.netProfit', 'Net profit or (loss) from business (Schedule C)', totalNet, {
          citation: 'IRC §61(a)(2); Schedule C',
          detail: perBusiness.map(function (e) { return { label: e.business.name || 'Unnamed business', value: e.net }; })
        })
      ], { messages: messages, total: totalNet }),
      extra: {
        qbiComponents: perBusiness.map(function (e) {
          return {
            id: e.business.id, name: e.business.name, netIncome: e.net, isSSTB: e.business.isSSTB,
            w2Wages: e.business.w2Wages, unadjustedBasis: e.business.unadjustedBasis,
            materialParticipation: e.business.materialParticipation
          };
        })
      }
    };
  }

  function computeRentals(inputs, ctx) {
    var perRental = inputs.rentals.map(function (r) {
      return { rental: r, net: round2(r.rents - r.expenses - r.depreciation) };
    });
    var netBeforeLimit = sum(perRental.map(function (e) { return e.net; }));
    var activeLosses = sum(perRental.filter(function (e) { return e.net < 0 && e.rental.activelyParticipates; }).map(function (e) { return e.net; }));
    var gains = sum(perRental.filter(function (e) { return e.net > 0; }).map(function (e) { return e.net; }));
    var passiveLosses = sum(perRental.filter(function (e) { return e.net < 0 && !e.rental.activelyParticipates; }).map(function (e) { return e.net; }));
    var magi = ctx.magi != null ? ctx.magi : (ctx.totalIncome != null ? ctx.totalIncome : 0);
    var allowance = 25000;
    var messages = [];
    if (magi > 100000) {
      var reduction = dec(magi).minus(100000).times(0.5);
      allowance = round2d(clampMin0(dec(25000).minus(reduction)));
      if (magi >= 150000) allowance = 0;
    }
    var activeLossAbs = Math.abs(activeLosses);
    var allowanceUsed = Math.min(activeLossAbs, allowance);
    var activeSuspended = round2(activeLossAbs - allowanceUsed);
    var suspended = round2(activeSuspended + Math.abs(passiveLosses));
    var netAllowed = round2(gains - allowanceUsed);
    if (suspended > 0) {
      messages.push(msg('warning', '$' + suspended.toLocaleString() + ' of rental losses suspended under the passive activity loss rules (IRC §469) and carried forward.',
        { moduleKey: MOD_RENTAL, field: 'expenses' }));
    }
    return {
      result: moduleResult(MOD_RENTAL, 'Rental Income', [
        line('rental.netBeforeLimit', 'Net rental income/(loss) before passive limitation', netBeforeLimit, {
          citation: 'IRC §61(a)(5); Schedule E',
          detail: perRental.map(function (e) { return { label: e.rental.property || 'Unnamed property', value: e.net }; })
        }),
        line('rental.activeParticipationAllowance', 'Active participation loss allowance used', allowanceUsed, {
          citation: 'IRC §469(i)',
          notes: ['Allowance phases out 50% of MAGI over $' + (100000).toLocaleString() + ', fully gone at $' + (150000).toLocaleString() + '.']
        }),
        line('rental.suspendedLosses', 'Suspended passive losses carried forward', suspended, {
          citation: 'IRC §469(b)',
          status: suspended > 0 ? 'estimated' : 'complete'
        }),
        line('rental.netAllowed', 'Net rental income/(loss) allowed this year', netAllowed, {
          citation: 'IRC §469(i); Schedule E'
        })
      ], { messages: messages, total: netAllowed }),
      extra: {
        qbiComponents: perRental.map(function (e) {
          return {
            id: e.rental.id, name: e.rental.property, netIncome: e.net,
            isQualifiedTradeOrBusiness: e.rental.isQualifiedTradeOrBusiness
          };
        }),
        suspendedLosses: suspended
      }
    };
  }

  function taxableSocialSecurity(filingStatus, grossSS, otherTaxableIncome, taxExemptInterest) {
    if (grossSS <= 0) return 0;
    var base = PARAMS.socialSecurityTaxability.baseAmount[filingStatus];
    var secondTier = PARAMS.socialSecurityTaxability.secondTier[filingStatus];
    var halfSS = dec(grossSS).times(0.5);
    var provisional = dec(otherTaxableIncome).plus(taxExemptInterest).plus(halfSS);
    if (provisional.lte(base)) return 0;
    var excessOverBase = Decimal.min(provisional.minus(base), dec(secondTier).minus(base));
    var taxable = Decimal.min(excessOverBase.times(0.5), halfSS);
    if (provisional.gt(secondTier)) {
      var overSecond = provisional.minus(secondTier).times(0.85);
      var tierOneCap = dec(secondTier).minus(base).times(0.5);
      taxable = Decimal.min(dec(grossSS).times(0.85), tierOneCap.plus(overSecond));
    }
    return round2d(clampMin0(Decimal.min(taxable, dec(grossSS).times(0.85))));
  }

  function computeOtherIncome(inputs, incomeBeforeOther, taxExemptInterest) {
    var items = inputs.otherIncome;
    var fs = inputs.profile.filingStatus;
    var retirement = sum(items.filter(function (i) { return i.kind === 'retirement'; }).map(function (i) { return i.amount; }));
    var unemployment = sum(items.filter(function (i) { return i.kind === 'unemployment'; }).map(function (i) { return i.amount; }));
    var k1Ordinary = sum(items.filter(function (i) { return i.kind === 'k1Ordinary'; }).map(function (i) { return i.amount; }));
    var other = sum(items.filter(function (i) { return i.kind === 'other'; }).map(function (i) { return i.amount; }));
    var grossSS = sum(items.filter(function (i) { return i.kind === 'socialSecurity'; }).map(function (i) { return i.amount; }));
    var taxableSS = taxableSocialSecurity(fs, grossSS,
      round2(incomeBeforeOther + retirement + unemployment + k1Ordinary + other), taxExemptInterest);
    var total = round2(retirement + unemployment + k1Ordinary + other + taxableSS);
    var detail = items.map(function (i) { return { label: i.description || i.kind, value: i.amount }; });
    return {
      result: moduleResult(MOD_OTHER, 'Other Income', [
        line('otherIncome.retirement', 'Taxable retirement/pension distributions', retirement, { citation: 'IRC §72' }),
        line('otherIncome.unemployment', 'Unemployment compensation', unemployment, { citation: 'IRC §85' }),
        line('otherIncome.k1Ordinary', 'K-1 ordinary business income', k1Ordinary, {
          citation: 'IRC §702; Schedule E Part II',
          detail: detail.length ? detail : undefined
        }),
        line('otherIncome.socialSecurityGross', 'Gross Social Security benefits (informational)', grossSS, { citation: 'IRC §86' }),
        line('otherIncome.socialSecurityTaxable', 'Taxable Social Security benefits', taxableSS, {
          citation: 'IRC §86(a); 50%/85% inclusion tiers',
          notes: ['Base amounts: $' + PARAMS.socialSecurityTaxability.baseAmount[fs].toLocaleString() +
            ' / $' + PARAMS.socialSecurityTaxability.secondTier[fs].toLocaleString() + '.']
        }),
        line('otherIncome.other', 'Other income', other, { citation: 'IRC §61(a)' })
      ], { total: total }),
      extra: {
        k1OrdinaryIncome: k1Ordinary,
        /* Per-entry K-1 facts so §199A can apply the SSTB test and the
           W-2 wage / UBIA limits to each passthrough separately, instead of
           treating the whole K-1 total as one non-SSTB component. */
        k1Entries: items.filter(function (i) { return i.kind === 'k1Ordinary'; }).map(function (i) {
          return {
            id: i.id, name: i.description || 'K-1 ordinary income', amount: i.amount,
            isSSTB: i.isSSTB === true,
            w2Wages: typeof i.w2Wages === 'number' ? i.w2Wages : 0,
            ubia: typeof i.ubia === 'number' ? i.ubia : 0,
            isQualifiedTradeOrBusiness: i.isQualifiedTradeOrBusiness !== false
          };
        }),
        taxableSocialSecurity: taxableSS
      }
    };
  }

  function computeSelfEmploymentTax(inputs, scheduleCNet, w2SocialSecurityWages) {
    var netProfit = clampMin0(dec(scheduleCNet));
    var netEarnings = netProfit.times(PARAMS.seNetEarningsFactor);
    var wageBase = dec(PARAMS.socialSecurityWageBase);
    var w2SS = clampMin0(dec(w2SocialSecurityWages));
    var remainingBase = clampMin0(wageBase.minus(w2SS));
    var ssPortion = Decimal.min(netEarnings, remainingBase).times(PARAMS.ssRateSE);
    var medicarePortion = netEarnings.times(PARAMS.medicareRateSE);
    var seTax = ssPortion.plus(medicarePortion);
    var deduction = seTax.times(PARAMS.seTaxDeductionRate);
    var messages = [];
    if (netProfit.gt(0) && netProfit.lt(400)) {
      messages.push(msg('info', 'Net SE earnings below the $400 filing threshold; SE tax not required.', { moduleKey: MOD_SE }));
    }
    if (w2SS.gte(wageBase)) {
      messages.push(msg('info', 'W-2 Social Security wages already meet or exceed the wage base; SE earnings owe Medicare-only SE tax.',
        { moduleKey: MOD_SE, field: 'socialSecurityWages' }));
    }
    var belowThreshold = netProfit.lt(400);
    var effectiveTax = belowThreshold ? new Decimal(0) : seTax;
    var effectiveDeduction = belowThreshold ? new Decimal(0) : deduction;
    return {
      result: moduleResult(MOD_SE, 'Self-Employment Tax', [
        line('se.netEarnings', 'Net earnings from self-employment (92.35%)', round2d(netEarnings), { citation: 'IRC §1402(a)' }),
        line('se.socialSecurityPortion', 'SE Social Security tax (12.4%, wage-base coordinated)',
          round2d(belowThreshold ? new Decimal(0) : ssPortion), {
            citation: 'IRC §1401(a)',
            notes: ['Remaining SS wage base after W-2 wages: $' + round2d(remainingBase).toLocaleString() +
              ' of $' + PARAMS.socialSecurityWageBase.toLocaleString() + '.']
          }),
        line('se.medicarePortion', 'SE Medicare tax (2.9%)', round2d(belowThreshold ? new Decimal(0) : medicarePortion), { citation: 'IRC §1401(b)(1)' }),
        line('se.totalSeTax', 'Total self-employment tax', round2d(effectiveTax), { citation: 'IRC §1401' }),
        line('se.deduction', 'Deductible portion of SE tax (50%)', round2d(effectiveDeduction), { citation: 'IRC §164(f)' })
      ], { messages: messages, total: round2d(effectiveTax) }),
      extra: {
        seTax: round2d(effectiveTax),
        seTaxDeduction: round2d(effectiveDeduction),
        seNetEarnings: round2d(netEarnings)
      }
    };
  }

  function computePlanningDeductions(inputs, seTaxDeduction) {
    var enabled = inputs.planningStrategies.filter(function (s) { return s.enabled; });
    var messages = [];
    function capped(field, amount, limit, label) {
      if (amount > limit) {
        messages.push(msg('warning', label + ' contribution of $' + amount.toLocaleString() +
          ' exceeds the 2026 limit of $' + limit.toLocaleString() + '; capped.',
          { moduleKey: MOD_PLANNING, field: field }));
        return limit;
      }
      return amount;
    }
    var ira = sum(enabled.filter(function (s) { return s.kind === 'traditionalIra'; })
      .map(function (s) { return capped('traditionalIra', s.amount, CONTRIBUTION_LIMITS.traditionalIra, 'Traditional IRA'); }));
    var sep = sum(enabled.filter(function (s) { return s.kind === 'sepIra'; })
      .map(function (s) { return capped('sepIra', s.amount, CONTRIBUTION_LIMITS.sepIra, 'SEP-IRA'); }));
    var solo = sum(enabled.filter(function (s) { return s.kind === 'solo401k'; })
      .map(function (s) { return capped('solo401k', s.amount, CONTRIBUTION_LIMITS.solo401k, 'Solo 401(k)'); }));
    var hsa = sum(enabled.filter(function (s) { return s.kind === 'hsa'; })
      .map(function (s) { return capped('hsa', s.amount, CONTRIBUTION_LIMITS.hsaFamily, 'HSA'); }));
    var total = round2(ira + sep + solo + hsa + seTaxDeduction);
    return {
      result: moduleResult(MOD_PLANNING, 'Planning Deductions / Adjustments', [
        line('planning.traditionalIra', 'Traditional IRA deduction', ira, { citation: 'IRC §219' }),
        line('planning.sepIra', 'SEP-IRA contribution deduction', sep, { citation: 'IRC §408(k)' }),
        line('planning.solo401k', 'Solo 401(k) contribution deduction', solo, { citation: 'IRC §401(k); §415(c)' }),
        line('planning.hsa', 'HSA contribution deduction', hsa, { citation: 'IRC §223' }),
        line('planning.seTaxDeduction', 'Deductible one-half of SE tax', seTaxDeduction, { citation: 'IRC §164(f)' }),
        line('planning.totalAdjustments', 'Total adjustments to income', total, { citation: 'Form 1040 Schedule 1, Part II' })
      ], { messages: messages, total: total }),
      extra: { totalAdjustments: total, seTaxDeductionApplied: seTaxDeduction }
    };
  }

  function computeDeductions(inputs, ctx, agi) {
    var profile = inputs.profile;
    var itemized = inputs.itemizedDeductions;
    var fs = profile.filingStatus;
    var baseStandard = PARAMS.standardDeduction[fs];
    var additionalPer = PARAMS.additionalStandardDeductionAged[fs];
    var additionalCount = 0;
    if (profile.taxpayerAge >= 65) additionalCount += 1;
    if (profile.blindTaxpayer) additionalCount += 1;
    if (profile.spouseAge !== null && profile.spouseAge >= 65 && (fs === 'mfj' || fs === 'qss')) additionalCount += 1;
    if (profile.blindSpouse && (fs === 'mfj' || fs === 'qss')) additionalCount += 1;
    var additionalStandard = round2(additionalCount * additionalPer);

    var magi = ctx.magi != null ? ctx.magi : agi;
    var seniorCount = 0;
    if (profile.taxpayerAge >= 65) seniorCount += 1;
    if (profile.spouseAge !== null && profile.spouseAge >= 65 && (fs === 'mfj' || fs === 'qss')) seniorCount += 1;
    var seniorThreshold = PARAMS.seniorBonusDeduction.magiThreshold[fs];
    var seniorBonus = 0;
    if (seniorCount > 0) {
      var gross = dec(PARAMS.seniorBonusDeduction.amount).times(seniorCount);
      var phaseout = clampMin0(dec(magi).minus(seniorThreshold)).times(PARAMS.seniorBonusDeduction.phaseoutRate);
      seniorBonus = round2d(clampMin0(gross.minus(phaseout)));
    }
    var standardTotal = round2(baseStandard + additionalStandard + seniorBonus);

    var medicalFloor = dec(agi).times(0.075);
    var medical = round2d(clampMin0(dec(itemized.medical).minus(medicalFloor)));
    var saltRaw = round2(itemized.stateLocalIncomeTax + itemized.realEstateTax + itemized.personalPropertyTax);
    var saltCap = PARAMS.saltCap.base;
    var messages = [];
    if (magi > PARAMS.saltCap.magiPhaseDownThreshold) {
      var phaseDown = dec(magi).minus(PARAMS.saltCap.magiPhaseDownThreshold).times(PARAMS.saltCap.phaseDownRate);
      saltCap = round2d(Decimal.max(dec(PARAMS.saltCap.base).minus(phaseDown), PARAMS.saltCap.floor));
      messages.push(msg('info', 'SALT cap phased down to $' + saltCap.toLocaleString() +
        ' due to MAGI over $' + PARAMS.saltCap.magiPhaseDownThreshold.toLocaleString() + '.', { moduleKey: MOD_DEDUCTIONS }));
    }
    var salt = Math.min(saltRaw, saltCap);
    var mortgage = round2(itemized.mortgageInterest);
    var investmentInterest = round2(itemized.investmentInterest);
    var charitableAgiFloor = dec(agi).times(PARAMS.charitableFloor.agiFloorRate);
    var cashCeiling = dec(agi).times(PARAMS.charitableFloor.cashCeilingRate);
    var nonCashCeiling = dec(agi).times(PARAMS.charitableFloor.nonCashCeilingRate);
    var cash = Decimal.min(dec(itemized.charitableCash), cashCeiling);
    var nonCash = Decimal.min(dec(itemized.charitableNonCash), nonCashCeiling);
    var charitable = round2d(clampMin0(cash.plus(nonCash).minus(charitableAgiFloor)));
    var otherItemized = round2(itemized.other);
    var itemizedGross = round2(medical + salt + mortgage + investmentInterest + charitable + otherItemized);

    var bracket35 = PARAMS.ordinaryBrackets[fs].find(function (b) { return b.rate === 0.35; });
    var top37Start = bracket35 != null ? bracket35.upTo : Infinity;
    var haircut = 0;
    if (Number.isFinite(top37Start) && agi > top37Start) {
      var excess = dec(agi).minus(top37Start);
      haircut = round2d(Decimal.min(dec(itemizedGross), excess)
        .times(PARAMS.itemizedDeductionLimitation.haircutNumerator)
        .dividedBy(PARAMS.itemizedDeductionLimitation.haircutDenominator));
      if (haircut > 0) {
        messages.push(msg('info', 'Itemized deductions reduced by $' + haircut.toLocaleString() + ' under the 2/37 haircut.',
          { moduleKey: MOD_DEDUCTIONS }));
      }
    }
    var itemizedTotal = round2(itemizedGross - haircut);
    var useItemized = itemizedTotal > standardTotal;
    var used = useItemized ? itemizedTotal : standardTotal;
    var deductionType = useItemized ? 'itemized' : 'standard';

    return {
      result: moduleResult(MOD_DEDUCTIONS, 'Deductions', [
        line('deductions.standardBase', 'Base standard deduction', baseStandard, { citation: 'IRC §63(c); Rev. Proc. 2025-32 §2.02' }),
        line('deductions.standardAdditional', 'Additional standard deduction (age/blind)', additionalStandard, { citation: 'IRC §63(f)' }),
        line('deductions.seniorBonus', 'Senior bonus deduction (age 65+)', seniorBonus, {
          citation: 'OBBBA P.L. 119-21 §70103', status: 'estimated'
        }),
        line('deductions.standardTotal', 'Total standard deduction (if elected)', standardTotal, { citation: 'IRC §63(c)' }),
        line('deductions.medical', 'Medical expenses over 7.5% AGI floor', medical, { citation: 'IRC §213' }),
        line('deductions.salt', 'State and local taxes (capped)', salt, {
          citation: 'OBBBA P.L. 119-21 §70120; IRC §164(b)(6)',
          notes: ['Raw SALT: $' + saltRaw.toLocaleString() + '; cap applied: $' + saltCap.toLocaleString() + '.']
        }),
        line('deductions.mortgageInterest', 'Home mortgage interest', mortgage, {
          citation: 'IRC §163(h)(3)',
          notes: ['Assumes acquisition indebtedness within IRC §163(h)(3) limits; not separately verified.']
        }),
        line('deductions.investmentInterest', 'Investment interest expense', investmentInterest, {
          citation: 'IRC §163(d)',
          notes: ['Limited to net investment income; full limitation not separately modeled.'],
          status: 'estimated'
        }),
        line('deductions.charitable', 'Charitable contributions (after 0.5% AGI floor)', charitable, {
          citation: 'IRC §170; OBBBA 0.5% AGI floor (2026)'
        }),
        line('deductions.other', 'Other itemized deductions', otherItemized, { citation: 'IRC §67' }),
        line('deductions.itemizedHaircut', '2/37 itemized deduction haircut', -haircut, {
          citation: 'OBBBA P.L. 119-21 (replaces Pease limitation)',
          status: haircut > 0 ? 'estimated' : 'not-applicable'
        }),
        line('deductions.itemizedTotal', 'Total itemized deductions (if elected)', itemizedTotal, { citation: 'Schedule A' }),
        line('deductions.used', 'Deduction used (' + deductionType + ')', used, { citation: 'IRC §63' })
      ], { messages: messages, total: used }),
      extra: {
        deductionUsed: used, deductionType: deductionType,
        standardDeductionTotal: standardTotal, itemizedTotal: itemizedTotal
      }
    };
  }

  function collectQbiComponents(businessComponents, rentalComponents, k1Ordinary, k1Entries) {
    var fromBusinesses = businessComponents.filter(function (c) { return c.materialParticipation; }).map(function (c) {
      return { id: c.id, name: c.name, qbi: c.netIncome, isSSTB: c.isSSTB, w2Wages: c.w2Wages, ubia: c.unadjustedBasis };
    });
    var fromRentals = rentalComponents.filter(function (c) { return c.isQualifiedTradeOrBusiness; }).map(function (c) {
      return { id: c.id, name: c.name, qbi: c.netIncome, isSSTB: false, w2Wages: 0, ubia: 0 };
    });
    /* One component per K-1 entry when the caller supplied them, so each
       passthrough carries its own SSTB status and W-2/UBIA limits. Falls back
       to the single lumped, non-SSTB component for callers that don't. */
    var fromK1;
    if (Array.isArray(k1Entries) && k1Entries.length) {
      fromK1 = k1Entries
        .filter(function (e) { return e.isQualifiedTradeOrBusiness !== false && e.amount !== 0; })
        .map(function (e, i) {
          return {
            id: e.id || ('k1-ordinary-' + i), name: e.name || 'K-1 ordinary income', qbi: e.amount,
            isSSTB: e.isSSTB === true, w2Wages: e.w2Wages || 0, ubia: e.ubia || 0
          };
        });
    } else {
      fromK1 = k1Ordinary !== 0
        ? [{ id: 'k1-ordinary', name: 'K-1 ordinary income', qbi: k1Ordinary, isSSTB: false, w2Wages: 0, ubia: 0 }]
        : [];
    }
    return fromBusinesses.concat(fromRentals, fromK1);
  }

  function computeQbi(inputs, components, taxableIncomeBeforeQbi, netCapitalGain) {
    var fs = inputs.profile.filingStatus;
    var threshold = PARAMS.qbi.threshold[fs];
    var phaseRange = PARAMS.qbi.phaseInRange[fs];
    var phaseTop = threshold + phaseRange;
    var messages = [];
    var ti = dec(taxableIncomeBeforeQbi);
    var excess = clampMin0(ti.minus(threshold));
    var phaseInFraction = new Decimal(0);
    if (ti.gt(threshold)) {
      phaseInFraction = phaseRange > 0 ? Decimal.min(excess.dividedBy(phaseRange), 1) : new Decimal(1);
    }
    var tentative = new Decimal(0);
    var includedQbi = new Decimal(0);
    var detail = [];
    for (var comp of components) {
      if (comp.qbi <= 0) { detail.push({ label: comp.name, value: 0 }); continue; }
      var includeFraction = new Decimal(1);
      if (comp.isSSTB) {
        includeFraction = new Decimal(1).minus(phaseInFraction);
        if (ti.gte(phaseTop)) includeFraction = new Decimal(0);
      }
      var effectiveQbi = dec(comp.qbi).times(includeFraction);
      var componentDeduction = effectiveQbi.times(PARAMS.qbi.deductionRate);
      if (includeFraction.eq(0)) { detail.push({ label: comp.name, value: 0 }); continue; }
      includedQbi = includedQbi.plus(effectiveQbi);
      var limited = componentDeduction;
      if (ti.gt(threshold)) {
        var effW2 = dec(comp.w2Wages).times(includeFraction);
        var effUbia = dec(comp.ubia).times(includeFraction);
        var wageLimit = (function (w2, ubia) {
          var half = dec(w2).times(0.5);
          var quarterPlus = dec(w2).times(0.25).plus(dec(ubia).times(0.025));
          return Decimal.max(half, quarterPlus);
        })(round2d(effW2), round2d(effUbia));
        if (ti.gte(phaseTop)) {
          limited = Decimal.min(componentDeduction, wageLimit);
        } else {
          var reduction = componentDeduction.minus(Decimal.min(componentDeduction, wageLimit)).times(phaseInFraction);
          limited = componentDeduction.minus(reduction);
        }
      }
      tentative = tentative.plus(limited);
      detail.push({ label: comp.name, value: round2d(limited) });
    }
    var totalQbi = components.reduce(function (acc, c) { return acc + Math.max(c.qbi, 0); }, 0);
    var includedQbiRounded = round2d(includedQbi);
    var netCapGain = clampMin0(dec(netCapitalGain));
    var overallLimit = clampMin0(ti.minus(netCapGain)).times(PARAMS.qbi.deductionRate);
    var deduction = Decimal.min(tentative, overallLimit);
    if (includedQbiRounded >= PARAMS.qbi.minimumDeductionQbiFloor && deduction.lt(PARAMS.qbi.minimumDeduction)) {
      deduction = Decimal.min(dec(PARAMS.qbi.minimumDeduction), overallLimit);
      messages.push(msg('info', 'QBI minimum deduction floor of $400 applied.', { moduleKey: 'qbi' }));
    }
    if (components.some(function (c) { return c.isSSTB; }) && ti.gt(threshold)) {
      messages.push(msg('warning', 'One or more SSTB components are subject to QBI phase-out.', { moduleKey: 'qbi' }));
    }
    var final = round2d(clampMin0(deduction));
    return {
      result: moduleResult('qbi', 'QBI Deduction', [
        line('qbi.totalQbi', 'Total qualified business income', totalQbi, { citation: 'IRC §199A(c)', detail: detail }),
        line('qbi.tentativeDeduction', 'Tentative QBI deduction (component-limited)', round2d(tentative), {
          citation: 'IRC §199A(b); W-2 wage/UBIA limitation phased in over threshold range'
        }),
        line('qbi.overallLimit', 'Overall limit: 20% of (taxable income - net capital gain)', round2d(overallLimit), {
          citation: 'IRC §199A(a)(1)(B)'
        }),
        line('qbi.deduction', 'Qualified business income deduction', final, {
          citation: 'IRC §199A',
          status: components.some(function (c) { return c.isSSTB; }) ? 'estimated' : 'complete'
        })
      ], { messages: messages, total: final }),
      extra: { qbiDeduction: final }
    };
  }

  function computeTaxOnOrdinaryIncome(brackets, amount) {
    var tax = new Decimal(0);
    var lower = new Decimal(0);
    for (var b of brackets) {
      var upper = new Decimal(b.upTo === Infinity ? Number.MAX_SAFE_INTEGER : b.upTo);
      if (amount.lte(lower)) break;
      var slice = clampMin0(Decimal.min(amount, upper).minus(lower));
      tax = tax.plus(slice.times(b.rate));
      lower = upper;
      if (amount.lte(upper)) break;
    }
    return tax;
  }

  function marginalRateFor(brackets, amount) {
    for (var b of brackets) {
      if (amount.lte(b.upTo)) return b.rate;
    }
    var last = brackets[brackets.length - 1];
    return last ? last.rate : 0;
  }

  function computeTax(inputs, taxableIncome, netCapitalGain, qualifiedDividends, collectiblesGain, section1250Gain) {
    var fs = inputs.profile.filingStatus;
    var brackets = PARAMS.ordinaryBrackets[fs];
    var cgBrackets = PARAMS.capitalGainsBrackets[fs];
    var ti = clampMin0(dec(taxableIncome));
    var preferentialRaw = clampMin0(dec(netCapitalGain).plus(qualifiedDividends));
    var preferential = Decimal.min(preferentialRaw, ti);
    var ordinaryPortion = clampMin0(ti.minus(preferential));
    var ordinaryTax = computeTaxOnOrdinaryIncome(brackets, ordinaryPortion);

    var zeroTop = new Decimal(cgBrackets.zeroUpTo);
    var fifteenTop = new Decimal(cgBrackets.fifteenUpTo);
    var stackTop = ordinaryPortion.plus(preferential);
    var zeroBand = clampMin0(Decimal.min(stackTop, zeroTop).minus(Decimal.max(ordinaryPortion, 0)));
    var fifteenCeil = Decimal.min(stackTop, fifteenTop);
    var fifteenFloor = Decimal.max(ordinaryPortion, zeroTop);
    var fifteenBand = clampMin0(fifteenCeil.minus(fifteenFloor));
    var twentyFloor = Decimal.max(ordinaryPortion, fifteenTop);
    var twentyBandTotal = clampMin0(stackTop.minus(twentyFloor));
    var collectiblesBand = Decimal.min(dec(collectiblesGain), twentyBandTotal);
    var sec1250Band = Decimal.min(dec(section1250Gain), clampMin0(twentyBandTotal.minus(collectiblesBand)));
    var twentyBand = clampMin0(twentyBandTotal.minus(collectiblesBand).minus(sec1250Band));
    var capitalGainsTax = zeroBand.times(0)
      .plus(fifteenBand.times(0.15))
      .plus(twentyBand.times(0.2))
      .plus(collectiblesBand.times(0.28))
      .plus(sec1250Band.times(0.25));
    var totalTax = ordinaryTax.plus(capitalGainsTax);
    var marginalRate = marginalRateFor(brackets, ti);
    var effectiveRate = ti.gt(0) ? round2d(totalTax.dividedBy(ti).times(10000)) / 10000 : 0;

    return {
      result: moduleResult(MOD_TAXCOMP, 'Tax Computation', [
        line('taxcomp.ordinaryPortion', 'Ordinary taxable income (non-preferential)', round2d(ordinaryPortion), { citation: 'IRC §1(j)' }),
        line('taxcomp.ordinaryTax', 'Tax on ordinary income (bracket table)', round2d(ordinaryTax), {
          citation: 'Rev. Proc. 2025-32 §2.01; IRC §1(j)'
        }),
        line('taxcomp.preferentialIncome', 'Net capital gain + qualified dividends', round2d(preferential), { citation: 'IRC §1(h)' }),
        line('taxcomp.capitalGainsTax', 'Tax on capital gains / qualified dividends (0/15/20%, 25%, 28%)', round2d(capitalGainsTax), {
          citation: 'IRC §1(h); Qualified Dividends and Capital Gain Tax Worksheet',
          detail: [
            { label: '0% band', value: round2d(zeroBand) },
            { label: '15% band', value: round2d(fifteenBand) },
            { label: '20% band', value: round2d(twentyBand) },
            { label: '25% §1250 band', value: round2d(sec1250Band) },
            { label: '28% collectibles band', value: round2d(collectiblesBand) }
          ]
        }),
        line('taxcomp.totalTax', 'Total tax before credits and other taxes', round2d(totalTax), { citation: 'Form 1040 line 16' })
      ], { total: round2d(totalTax) }),
      extra: {
        ordinaryTax: round2d(ordinaryTax),
        capitalGainsTax: round2d(capitalGainsTax),
        totalTaxBeforeCredits: round2d(totalTax),
        marginalRate: marginalRate,
        effectiveRate: effectiveRate
      }
    };
  }

  function computeAdditionalTaxes(inputs, ctx) {
    var fs = inputs.profile.filingStatus;
    var messages = [];
    var amti = clampMin0(dec(ctx.taxableIncome).plus(ctx.saltDeductionAdded));
    var exemption = PARAMS.amt.exemption[fs];
    var phaseoutThreshold = PARAMS.amt.phaseoutThreshold[fs];
    var exemptionReduction = clampMin0(amti.minus(phaseoutThreshold)).times(PARAMS.amt.phaseoutRate);
    var exemptionAfterPhaseout = clampMin0(dec(exemption).minus(exemptionReduction));
    var amtBase = clampMin0(amti.minus(exemptionAfterPhaseout));
    var breakpoint = new Decimal(PARAMS.amt.rateBreakpoint);
    var lowPortion = Decimal.min(amtBase, breakpoint);
    var highPortion = clampMin0(amtBase.minus(breakpoint));
    var tentativeMinimumTax = lowPortion.times(PARAMS.amt.rateLow).plus(highPortion.times(PARAMS.amt.rateHigh));
    var regularTax = dec(ctx.regularTax);
    var amt = clampMin0(tentativeMinimumTax.minus(regularTax));
    messages.push(msg('info', 'AMT is estimated: AMTI approximated from taxable income plus SALT addback; other preference items not modeled.',
      { moduleKey: MOD_ADDL }));

    var niitThreshold = PARAMS.niitThreshold[fs];
    var magiExcess = clampMin0(dec(ctx.magi).minus(niitThreshold));
    var nii = clampMin0(dec(ctx.netInvestmentIncome));
    var niit = Decimal.min(nii, magiExcess).times(PARAMS.niitRate);

    var medicareThreshold = PARAMS.additionalMedicare.threshold[fs];
    var additionalMedicare = clampMin0(dec(ctx.wageAndSeIncomeForMedicare).minus(medicareThreshold))
      .times(PARAMS.additionalMedicare.rate);

    var lines = [
      line('additionaltaxes.amti', 'Alternative Minimum Taxable Income (estimated)', round2d(amti), {
        citation: 'IRC §55(b)(2)', status: 'estimated'
      }),
      line('additionaltaxes.amtExemption', 'AMT exemption (after phaseout)', round2d(exemptionAfterPhaseout), {
        citation: 'Rev. Proc. 2025-32 §2.05; IRC §55(d)', status: 'estimated'
      }),
      line('additionaltaxes.tentativeMinimumTax', 'Tentative minimum tax', round2d(tentativeMinimumTax), {
        citation: 'IRC §55(b)(1)', status: 'estimated'
      }),
      line('additionaltaxes.amt', 'Alternative Minimum Tax', round2d(amt), { citation: 'IRC §55(a)', status: 'estimated' }),
      line('additionaltaxes.niit', 'Net Investment Income Tax (3.8%)', round2d(niit), { citation: 'IRC §1411' }),
      line('additionaltaxes.additionalMedicare', 'Additional Medicare Tax (0.9%)', round2d(additionalMedicare), {
        citation: 'IRC §3101(b)(2); IRC §1401(b)(2)'
      })
    ];
    return {
      result: moduleResult(MOD_ADDL, 'Additional Taxes', lines, {
        messages: messages,
        total: round2d(amt.plus(niit).plus(additionalMedicare))
      }),
      extra: { amt: round2d(amt), niit: round2d(niit), additionalMedicare: round2d(additionalMedicare) }
    };
  }

  function computePayments(inputs, ctx) {
    var fs = inputs.profile.filingStatus;
    var payments = inputs.payments;
    var profile = inputs.profile;
    var estimated = sum(payments.estimatedPayments);
    var withholding = round2(ctx.wageWithholding + ctx.otherWithholding + payments.federalWithholdingOther);
    var ctcThreshold = PARAMS.childTaxCredit.phaseoutThreshold[fs];
    var phaseout = clampMin0(dec(ctx.agi).minus(ctcThreshold)).dividedBy(1000).ceil().times(PARAMS.childTaxCredit.phaseoutRatePer1000);
    var ctcGross = dec(profile.dependentsUnder17).times(PARAMS.childTaxCredit.perChildUnder17);
    var odcGross = dec(profile.otherDependents).times(PARAMS.childTaxCredit.otherDependentCredit);
    var ctcNet = clampMin0(ctcGross.plus(odcGross).minus(phaseout));
    var refundableCap = dec(profile.dependentsUnder17).times(PARAMS.childTaxCredit.refundablePerChild);
    var ctcRefundable = Decimal.min(ctcNet, refundableCap);
    var totalPayments = round2(withholding + estimated + payments.priorYearOverpayment +
      payments.extensionPayment + payments.refundableCredits + round2d(ctcRefundable));
    var netPosition = dec(ctx.totalTaxAfterCredits).minus(totalPayments);
    var balanceDue = round2d(clampMin0(netPosition));
    var refund = round2d(clampMin0(netPosition.negated()));
    var currentYearHarbor = dec(ctx.totalTaxAfterCredits).times(PARAMS.estimatedTaxSafeHarbor.currentYearRate);
    var highIncomeThreshold = PARAMS.estimatedTaxSafeHarbor.highIncomeAgiThreshold[fs];
    var priorYearRate = payments.priorYearAgi > highIncomeThreshold
      ? PARAMS.estimatedTaxSafeHarbor.priorYearRateHighIncome
      : 1 + PARAMS.estimatedTaxSafeHarbor.priorYearRate;
    var priorYearHarbor = dec(payments.priorYearTax).times(priorYearRate);
    var safeHarborRequired = round2d(Decimal.min(currentYearHarbor, priorYearHarbor));
    var underpayment = round2d(clampMin0(dec(safeHarborRequired).minus(totalPayments)));
    var messages = [];
    if (underpayment > 0) {
      messages.push(msg('warning', 'Estimated payments and withholding fall short of the safe harbor by $' +
        underpayment.toLocaleString() + '; underpayment penalty may apply.', { moduleKey: MOD_PAYMENTS }));
    }
    return {
      result: moduleResult(MOD_PAYMENTS, 'Payments', [
        line('payments.withholding', 'Total federal withholding', withholding, { citation: 'IRC §31' }),
        line('payments.estimated', 'Estimated tax payments', estimated, { citation: 'IRC §6654' }),
        line('payments.priorYearOverpayment', 'Prior year overpayment applied', payments.priorYearOverpayment, { citation: 'IRC §6513' }),
        line('payments.extension', 'Extension payment', payments.extensionPayment, { citation: 'IRC §6081' }),
        line('payments.childTaxCredit', 'Child tax credit / credit for other dependents (net of phaseout)', round2d(ctcNet), {
          citation: 'IRC §24; OBBBA P.L. 119-21 §70104'
        }),
        line('payments.refundableCredits', 'Other refundable credits', payments.refundableCredits, { citation: 'Form 1040 line 31' }),
        line('payments.total', 'Total payments and refundable credits', totalPayments, { citation: 'Form 1040 line 33' }),
        line('payments.balanceDue', 'Balance due', balanceDue, { citation: 'Form 1040 line 37' }),
        line('payments.refund', 'Overpayment / refund', refund, { citation: 'Form 1040 line 34' }),
        line('payments.safeHarborRequired', 'Estimated tax safe harbor requirement', safeHarborRequired, { citation: 'IRC §6654(d)' }),
        line('payments.underpayment', 'Estimated underpayment vs. safe harbor', underpayment, {
          citation: 'IRC §6654',
          status: underpayment > 0 ? 'estimated' : 'complete'
        })
      ], { messages: messages, total: totalPayments }),
      extra: {
        totalPayments: totalPayments, balanceDue: balanceDue, refund: refund,
        safeHarborRequired: safeHarborRequired, underpayment: underpayment
      }
    };
  }

  /* ---- top-level projection --------------------------------------------- */
  function computeProjection(inputs) {
    var modules = {};
    var fs = inputs.profile.filingStatus;
    var allMessages = [];

    var wagesModule;
    try { wagesModule = computeWages(inputs); }
    catch (e) { wagesModule = errorModule(MOD_WAGES, 'Wages', e); }
    modules[MOD_WAGES] = wagesModule;

    var intDivModule;
    try { intDivModule = computeInterestDividends(inputs); }
    catch (e) { intDivModule = errorModule(MOD_INTDIV, 'Interest & Dividends', e); }
    modules[MOD_INTDIV] = intDivModule;

    var businessModule, businessQbiComponents = [];
    try {
      var biz = computeBusinessIncome(inputs);
      businessModule = biz.result;
      businessQbiComponents = biz.extra.qbiComponents;
    } catch (e) { businessModule = errorModule(MOD_BUSINESS, 'Business Income', e); }
    modules[MOD_BUSINESS] = businessModule;

    var incomeBeforeRentals = round2(wagesModule.total + intDivModule.total + businessModule.total);
    var rentalModule, rentalQbiComponents = [];
    try {
      var rentals = computeRentals(inputs, { filingStatus: fs, totalIncome: incomeBeforeRentals });
      rentalModule = rentals.result;
      rentalQbiComponents = rentals.extra.qbiComponents;
    } catch (e) { rentalModule = errorModule(MOD_RENTAL, 'Rental Income', e); }
    modules[MOD_RENTAL] = rentalModule;

    var taxExemptLine = intDivModule.lines.find(function (l) { return l.key === 'interest.taxExempt'; });
    var taxExemptInterest = taxExemptLine ? taxExemptLine.amount : 0;
    var incomeBeforeOther = round2(wagesModule.total + intDivModule.total + businessModule.total + rentalModule.total);

    var otherModule, k1Ordinary = 0, k1Entries = [];
    try {
      var other = computeOtherIncome(inputs, incomeBeforeOther, taxExemptInterest);
      otherModule = other.result;
      k1Ordinary = other.extra.k1OrdinaryIncome;
      k1Entries = other.extra.k1Entries || [];
    } catch (e) { otherModule = errorModule(MOD_OTHER, 'Other Income', e); }
    modules[MOD_OTHER] = otherModule;

    var totalIncome = round2(incomeBeforeOther + otherModule.total);
    var scheduleCNet = businessModule.total;
    var ssWagesLine = wagesModule.lines.find(function (l) { return l.key === 'wages.socialSecurityWages'; });
    var w2SocialSecurityWages = ssWagesLine != null ? ssWagesLine.amount : 0;

    var seModule, seTax = 0, seTaxDeduction = 0;
    try {
      var se = computeSelfEmploymentTax(inputs, scheduleCNet, w2SocialSecurityWages);
      seModule = se.result;
      seTax = se.extra.seTax;
      seTaxDeduction = se.extra.seTaxDeduction;
    } catch (e) { seModule = errorModule(MOD_SE, 'Self-Employment Tax', e); }
    modules[MOD_SE] = seModule;

    var planningModule, adjustments = 0;
    try {
      var planning = computePlanningDeductions(inputs, seTaxDeduction);
      planningModule = planning.result;
      adjustments = planning.extra.totalAdjustments;
    } catch (e) { planningModule = errorModule(MOD_PLANNING, 'Planning Deductions', e); }
    modules[MOD_PLANNING] = planningModule;

    var agi = round2(totalIncome - adjustments);
    var magi = round2(agi + taxExemptInterest);

    var deductionsModule, deductionUsed = 0, deductionType = 'standard';
    try {
      var deductions = computeDeductions(inputs, { filingStatus: fs, agi: agi, magi: magi }, agi);
      deductionsModule = deductions.result;
      deductionUsed = deductions.extra.deductionUsed;
      deductionType = deductions.extra.deductionType;
    } catch (e) { deductionsModule = errorModule(MOD_DEDUCTIONS, 'Deductions', e); }
    modules[MOD_DEDUCTIONS] = deductionsModule;

    var saltLine = deductionsModule.lines.find(function (l) { return l.key === 'deductions.salt'; });
    var saltDeductionAdded = saltLine ? saltLine.amount : 0;

    var gains = inputs.capitalGains;
    var longTerm = sum(gains.map(function (g) { return g.longTermGain; }));
    var shortTerm = sum(gains.map(function (g) { return g.shortTermGain; }));
    var section1250 = sum(gains.map(function (g) { return g.section1250Gain; }));
    var collectibles = sum(gains.map(function (g) { return g.collectiblesGain; }));
    var netCapitalGain = round2(longTerm + shortTerm);
    var qualifiedLine = intDivModule.lines.find(function (l) { return l.key === 'dividends.qualified'; });
    var qualifiedDividends = qualifiedLine ? qualifiedLine.amount : 0;
    var taxableIncomeBeforeQbi = round2(Math.max(agi - deductionUsed, 0));

    var qbiComponents = collectQbiComponents(businessQbiComponents, rentalQbiComponents, k1Ordinary, k1Entries);
    var qbiModule, qbiDeduction = 0;
    try {
      var qbi = computeQbi(inputs, qbiComponents, taxableIncomeBeforeQbi, netCapitalGain);
      qbiModule = qbi.result;
      qbiDeduction = qbi.extra.qbiDeduction;
    } catch (e) { qbiModule = errorModule('qbi', 'QBI Deduction', e); }
    modules.qbi = qbiModule;

    var taxableIncome = round2(Math.max(taxableIncomeBeforeQbi - qbiDeduction, 0));

    var taxModule, ordinaryTax = 0, capitalGainsTax = 0, totalTaxBeforeCredits = 0, marginalRate = 0, effectiveRate = 0;
    try {
      var tax = computeTax(inputs, taxableIncome, netCapitalGain, qualifiedDividends, collectibles, section1250);
      taxModule = tax.result;
      ordinaryTax = tax.extra.ordinaryTax;
      capitalGainsTax = tax.extra.capitalGainsTax;
      totalTaxBeforeCredits = tax.extra.totalTaxBeforeCredits;
      marginalRate = tax.extra.marginalRate;
      effectiveRate = tax.extra.effectiveRate;
    } catch (e) { taxModule = errorModule(MOD_TAXCOMP, 'Tax Computation', e); }
    modules[MOD_TAXCOMP] = taxModule;

    var taxableInterestLine = intDivModule.lines.find(function (l) { return l.key === 'interest.taxable'; });
    var ordinaryDividendsLine = intDivModule.lines.find(function (l) { return l.key === 'dividends.ordinary'; });
    var netInvestmentIncome = round2(Math.max(
      (taxableInterestLine != null ? taxableInterestLine.amount : 0) +
      (ordinaryDividendsLine != null ? ordinaryDividendsLine.amount : 0) +
      netCapitalGain + rentalModule.total, 0));
    var medicareWagesLine = wagesModule.lines.find(function (l) { return l.key === 'wages.medicareWages'; });
    var medicareWages = medicareWagesLine != null ? medicareWagesLine.amount : 0;
    var seNetEarningsLine = seModule.lines.find(function (l) { return l.key === 'se.netEarnings'; });
    var seNetEarnings = seNetEarningsLine != null ? seNetEarningsLine.amount : 0;

    var addlModule, amt = 0, niit = 0, additionalMedicare = 0;
    try {
      var addl = computeAdditionalTaxes(inputs, {
        taxableIncome: taxableIncome,
        regularTax: totalTaxBeforeCredits,
        saltDeductionAdded: saltDeductionAdded,
        magi: magi,
        netInvestmentIncome: netInvestmentIncome,
        wageAndSeIncomeForMedicare: round2(medicareWages + seNetEarnings),
        seTax: seTax
      });
      addlModule = addl.result;
      amt = addl.extra.amt;
      niit = addl.extra.niit;
      additionalMedicare = addl.extra.additionalMedicare;
    } catch (e) { addlModule = errorModule(MOD_ADDL, 'Additional Taxes', e); }
    modules[MOD_ADDL] = addlModule;

    var totalTaxWithOther = round2(totalTaxBeforeCredits + seTax + amt + niit + additionalMedicare);
    var wageWithholdingLine = wagesModule.lines.find(function (l) { return l.key === 'wages.federalWithholding'; });
    var wageWithholding = wageWithholdingLine != null ? wageWithholdingLine.amount : 0;
    var intDivWithholdingLine = intDivModule.lines.find(function (l) { return l.key === 'interestDividends.federalWithholding'; });
    var otherWithholding = round2(
      (intDivWithholdingLine != null ? intDivWithholdingLine.amount : 0) +
      sum(inputs.otherIncome.map(function (i) { return i.federalWithholding; })));

    var paymentsModule, totalPayments = 0, safeHarborRequired = 0, underpayment = 0;
    try {
      var pay = computePayments(inputs, {
        wageWithholding: wageWithholding,
        otherWithholding: otherWithholding,
        totalTaxAfterCredits: totalTaxWithOther,
        agi: agi
      });
      paymentsModule = pay.result;
      totalPayments = pay.extra.totalPayments;
      safeHarborRequired = pay.extra.safeHarborRequired;
      underpayment = pay.extra.underpayment;
    } catch (e) { paymentsModule = errorModule(MOD_PAYMENTS, 'Payments', e); }
    modules[MOD_PAYMENTS] = paymentsModule;

    var ctcLine = paymentsModule.lines.find(function (l) { return l.key === 'payments.childTaxCredit'; });
    var totalTax = round2(Math.max(totalTaxWithOther - (ctcLine ? ctcLine.amount : 0), 0));
    var netDue = round2(totalTax - totalPayments);
    var balanceDue = Math.max(netDue, 0);
    var refund = Math.max(-netDue, 0);

    for (var key of MODULE_ORDER) {
      var mod = modules[key];
      if (mod) allMessages.push.apply(allMessages, mod.messages);
    }
    var overallStatus = worstStatus.apply(null, MODULE_ORDER.map(function (k) {
      return modules[k] != null ? modules[k].status : 'not-applicable';
    }));

    return {
      modules: modules,
      moduleOrder: MODULE_ORDER,
      totalIncome: totalIncome,
      adjustments: adjustments,
      agi: agi,
      magi: magi,
      deductionUsed: deductionUsed,
      deductionType: deductionType,
      qbiDeduction: qbiDeduction,
      taxableIncome: taxableIncome,
      ordinaryTax: ordinaryTax,
      capitalGainsTax: capitalGainsTax,
      amt: amt,
      seTax: seTax,
      niit: niit,
      additionalMedicare: additionalMedicare,
      totalTax: totalTax,
      totalPayments: totalPayments,
      balanceDue: balanceDue,
      refund: refund,
      effectiveRate: effectiveRate,
      marginalRate: marginalRate,
      safeHarborRequired: safeHarborRequired,
      underpayment: underpayment,
      status: overallStatus,
      messages: allMessages
    };
  }

  /* ---- scenarios --------------------------------------------------------- */
  function makeId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function createScenario(name, inputs, opts) {
    opts = opts || {};
    var now = new Date().toISOString();
    return {
      id: makeId('scenario'),
      name: name,
      description: opts.description != null ? opts.description : '',
      inputs: inputs,
      createdAt: now,
      updatedAt: now,
      isBaseline: opts.isBaseline != null && opts.isBaseline,
      /* Set when the host application (the Scenarios tab) pushed this scenario
         in from its library. Scenarios created inside the planner leave it
         null, which is what keeps a host re-import from touching them. */
      hostId: opts.hostId != null ? String(opts.hostId) : null
    };
  }

  function duplicateScenario(scenario, opts) {
    opts = opts || {};
    var now = new Date().toISOString();
    return {
      id: makeId('scenario'),
      name: opts.name != null ? opts.name : scenario.name + ' (copy)',
      description: opts.description != null ? opts.description : scenario.description,
      inputs: JSON.parse(JSON.stringify(scenario.inputs)),
      createdAt: now,
      updatedAt: now,
      isBaseline: false,
      /* A duplicate is the user's own working copy, never a host mirror. */
      hostId: null
    };
  }

  var COMPARE_FIELDS = [
    { key: 'totalIncome', label: 'Total Income' },
    { key: 'adjustments', label: 'Adjustments' },
    { key: 'agi', label: 'AGI' },
    { key: 'magi', label: 'MAGI' },
    { key: 'deductionUsed', label: 'Deduction Used' },
    { key: 'qbiDeduction', label: 'QBI Deduction' },
    { key: 'taxableIncome', label: 'Taxable Income' },
    { key: 'ordinaryTax', label: 'Ordinary Tax' },
    { key: 'capitalGainsTax', label: 'Capital Gains Tax' },
    { key: 'amt', label: 'AMT' },
    { key: 'seTax', label: 'SE Tax' },
    { key: 'niit', label: 'NIIT' },
    { key: 'additionalMedicare', label: 'Additional Medicare Tax' },
    { key: 'totalTax', label: 'Total Tax' },
    { key: 'totalPayments', label: 'Total Payments' },
    { key: 'balanceDue', label: 'Balance Due' },
    { key: 'refund', label: 'Refund' },
    { key: 'effectiveRate', label: 'Effective Rate' },
    { key: 'marginalRate', label: 'Marginal Rate' }
  ];

  function compareScenarios() {
    var scenarios = Array.prototype.slice.call(arguments);
    if (scenarios.length < 2 || scenarios.length > 4) {
      throw new Error('compareScenarios requires between 2 and 4 scenarios.');
    }
    var results = scenarios.map(function (s) { return computeProjection(s.inputs); });
    var baseline = results[0];
    if (!baseline) throw new Error('compareScenarios: no baseline result computed.');
    var fields = {};
    for (var f of COMPARE_FIELDS) {
      var values = results.map(function (r) { return Number(r[f.key]); });
      var first = values[0] != null ? values[0] : 0;
      fields[f.key] = {
        label: f.label,
        values: values,
        deltaFromFirst: values.map(function (v) { return round2(v - first); })
      };
    }
    var last = results[results.length - 1] != null ? results[results.length - 1] : baseline;
    return {
      scenarioIds: scenarios.map(function (s) { return s.id; }),
      scenarioNames: scenarios.map(function (s) { return s.name; }),
      fields: fields,
      taxSavings: round2(baseline.totalTax - last.totalTax),
      marginalRateChange: round2(last.marginalRate - baseline.marginalRate)
    };
  }

  /* ---- coverage matrix --------------------------------------------------- */
  var COVERAGE = [
    { key: 'wages', label: 'Wages (Form 1040 line 1a)', formLine: '1040 line 1a', level: 'implemented' },
    { key: 'interestDividends', label: 'Interest & Dividends', formLine: '1040 lines 2a/2b/3a/3b', level: 'implemented' },
    {
      key: 'businessIncome', label: 'Schedule C business income', formLine: 'Schedule C / 1040 line 8', level: 'implemented',
      note: 'Passive activity loss rules for non-material-participation businesses are not fully modeled.'
    },
    {
      key: 'rentalIncome', label: 'Schedule E rental income & passive loss limitation', formLine: 'Schedule E / 1040 line 8', level: 'partial',
      note: 'Suspended loss carryforwards are computed per year but not persisted across years.'
    },
    { key: 'otherIncome', label: 'Other income, incl. Social Security taxability', formLine: '1040 lines 6b, 8', level: 'implemented' },
    { key: 'selfEmploymentTax', label: 'Self-employment tax', formLine: 'Schedule SE / Schedule 2 line 4', level: 'implemented' },
    {
      key: 'planningDeductions', label: 'Above-the-line planning deductions', formLine: 'Schedule 1 Part II', level: 'implemented',
      note: 'SE health insurance and student loan interest deductions are not yet modeled as distinct line items.'
    },
    { key: 'deductions', label: 'Standard vs. itemized deductions', formLine: 'Schedule A / 1040 line 12', level: 'implemented' },
    {
      key: 'qbi', label: 'Qualified Business Income deduction (§199A)', formLine: 'Form 8995-A / 1040 line 13', level: 'implemented',
      note: 'Aggregation elections across commonly controlled businesses are not modeled.'
    },
    { key: 'taxComputation', label: 'Tax computation incl. qualified dividends/LTCG worksheet', formLine: '1040 line 16 / Schedule D worksheet', level: 'implemented' },
    {
      key: 'amt', label: 'Alternative Minimum Tax', formLine: 'Form 6251', level: 'estimated',
      note: 'AMTI approximated from taxable income plus SALT addback; other AMT preference/adjustment items (e.g., ISO exercise, private activity bond interest) are not modeled.'
    },
    { key: 'niit', label: 'Net Investment Income Tax', formLine: 'Form 8960', level: 'implemented' },
    { key: 'additionalMedicare', label: 'Additional Medicare Tax', formLine: 'Form 8959', level: 'implemented' },
    { key: 'payments', label: 'Payments, safe harbor, and balance due/refund', formLine: '1040 lines 25-37', level: 'implemented' },
    {
      key: 'childTaxCredit', label: 'Child tax credit / credit for other dependents', formLine: 'Schedule 8812', level: 'partial',
      note: 'Refundable ACTC computation is simplified; earned-income phase-in formula not separately modeled.'
    },
    { key: 'stateTax', label: 'State income tax', formLine: 'N/A (state return)', level: 'not-supported' },
    { key: 'foreignTaxCredit', label: 'Foreign tax credit', formLine: 'Form 1116', level: 'not-supported' },
    { key: 'foreignEarnedIncome', label: 'Foreign earned income exclusion', formLine: 'Form 2555', level: 'not-supported' },
    { key: 'pfic', label: 'PFIC reporting', formLine: 'Form 8621', level: 'not-supported' },
    { key: 'trusts', label: 'Trust and estate income (fiduciary passthrough)', formLine: 'Schedule K-1 (1041)', level: 'not-supported' },
    { key: 'priorYearCarryforwards', label: 'Prior-year carryforwards (capital loss, passive loss, AMT credit, NOL)', formLine: 'Various', level: 'not-supported' }
  ];

  /* ---- default / demo data ---------------------------------------------- */
  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function emptyInputs() {
    return {
      profile: {
        filingStatus: 'single', taxpayerAge: 40, spouseAge: null,
        dependentsUnder17: 0, otherDependents: 0,
        blindTaxpayer: false, blindSpouse: false, state: ''
      },
      wages: [],
      interestDividends: [],
      businesses: [],
      rentals: [],
      capitalGains: [],
      otherIncome: [],
      itemizedDeductions: {
        medical: 0, stateLocalIncomeTax: 0, realEstateTax: 0, personalPropertyTax: 0,
        mortgageInterest: 0, investmentInterest: 0, charitableCash: 0, charitableNonCash: 0, other: 0
      },
      planningStrategies: [],
      payments: {
        federalWithholdingOther: 0, estimatedPayments: [0, 0, 0, 0],
        priorYearOverpayment: 0, priorYearTax: 0, priorYearAgi: 0,
        extensionPayment: 0, refundableCredits: 0
      }
    };
  }

  function demoScenario() {
    return createScenario('HNW Baseline', {
      profile: {
        filingStatus: 'mfj', taxpayerAge: 52, spouseAge: 50,
        dependentsUnder17: 2, otherDependents: 0,
        blindTaxpayer: false, blindSpouse: false, state: 'CA'
      },
      wages: [{
        id: uuid(), employer: 'Meridian Capital Partners', wages: 285000, federalWithholding: 58000,
        socialSecurityWages: 176100, medicareWages: 285000, socialSecurityWithheld: 10918.2,
        medicareWithheld: 4132.5, retirementDeferral: 23500, hsa: 4300
      }],
      interestDividends: [
        { id: uuid(), payer: 'Schwab Brokerage', kind: 'interest', amount: 18500, federalWithholding: 0 },
        { id: uuid(), payer: 'Muni Bond Fund', kind: 'taxExemptInterest', amount: 9200, federalWithholding: 0 },
        { id: uuid(), payer: 'Schwab Brokerage', kind: 'ordinaryDividend', amount: 40000, federalWithholding: 0 },
        { id: uuid(), payer: 'Schwab Brokerage', kind: 'qualifiedDividend', amount: 40000, federalWithholding: 0 }
      ],
      businesses: [{
        id: uuid(), name: 'Harborview Consulting LLC', grossReceipts: 340000, expenses: 92000,
        isSSTB: false, w2Wages: 60000, unadjustedBasis: 120000, materialParticipation: true
      }],
      rentals: [
        {
          id: uuid(), property: '1420 Oak St Duplex', rents: 42000, expenses: 15000, depreciation: 9500,
          activelyParticipates: true, isQualifiedTradeOrBusiness: true
        },
        {
          id: uuid(), property: '88 Sunset Condo', rents: 30000, expenses: 12500, depreciation: 7000,
          activelyParticipates: true, isQualifiedTradeOrBusiness: true
        }
      ],
      capitalGains: [{
        id: uuid(), description: 'Long-term brokerage gains', shortTermGain: 0, longTermGain: 180000,
        section1250Gain: 0, collectiblesGain: 0
      }],
      otherIncome: [],
      itemizedDeductions: {
        medical: 8000, stateLocalIncomeTax: 32000, realEstateTax: 14000, personalPropertyTax: 1200,
        mortgageInterest: 24000, investmentInterest: 0, charitableCash: 25000, charitableNonCash: 5000, other: 0
      },
      planningStrategies: [
        {
          id: uuid(), label: 'Solo 401(k) employer contribution', kind: 'solo401k', amount: 46000, enabled: true,
          note: 'Employer-side profit-sharing contribution from Harborview Consulting LLC.'
        },
        {
          id: uuid(), label: 'Backdoor Roth conversion', kind: 'rothConversion', amount: 14000, enabled: true,
          note: 'Nondeductible IRA contribution converted; modeled for tracking only.'
        },
        {
          id: uuid(), label: 'Donor-advised fund contribution', kind: 'dafContribution', amount: 10000, enabled: true,
          note: 'Bunched charitable giving via DAF; included in charitableCash above.'
        }
      ],
      payments: {
        federalWithholdingOther: 0, estimatedPayments: [15000, 15000, 15000, 15000],
        priorYearOverpayment: 0, priorYearTax: 118000, priorYearAgi: 610000,
        extensionPayment: 0, refundableCredits: 0
      }
    }, {
      description: 'Demo HNW household: W-2 + Schedule C + rentals + LTCG, full itemized deductions.',
      isBaseline: true
    });
  }

  function createDemoProject() {
    var now = new Date().toISOString();
    var scenario = demoScenario();
    return {
      version: 2,
      name: 'Demo HNW Tax Plan',
      client: 'Demo Client',
      preparedBy: 'Demo Preparer',
      taxYear: 2026,
      scenarios: [scenario],
      activeScenarioId: scenario.id,
      notes: 'Illustrative demo data for the tax planning engine.',
      createdAt: now,
      updatedAt: now
    };
  }

  /* ---- serialization & validation ---------------------------------------- */
  function ProjectValidationError(message) {
    var err = new Error(message);
    err.name = 'ProjectValidationError';
    return err;
  }

  function serializeProject(project) {
    return JSON.stringify(Object.assign({}, project, { version: 2 }), null, 2);
  }

  function isObject(v) { return typeof v === 'object' && v !== null; }

  function requireString(v, field) {
    if (typeof v !== 'string') throw ProjectValidationError('Expected string field "' + field + '".');
    return v;
  }

  function normalizePayments(raw) {
    if (!isObject(raw)) throw ProjectValidationError('Invalid payments object.');
    var est = Array.isArray(raw.estimatedPayments) ? raw.estimatedPayments : [0, 0, 0, 0];
    return {
      federalWithholdingOther: typeof raw.federalWithholdingOther === 'number' ? raw.federalWithholdingOther : 0,
      estimatedPayments: [
        typeof est[0] === 'number' ? est[0] : 0,
        typeof est[1] === 'number' ? est[1] : 0,
        typeof est[2] === 'number' ? est[2] : 0,
        typeof est[3] === 'number' ? est[3] : 0
      ],
      priorYearOverpayment: typeof raw.priorYearOverpayment === 'number' ? raw.priorYearOverpayment : 0,
      priorYearTax: typeof raw.priorYearTax === 'number' ? raw.priorYearTax : 0,
      priorYearAgi: typeof raw.priorYearAgi === 'number' ? raw.priorYearAgi : 0,
      extensionPayment: typeof raw.extensionPayment === 'number' ? raw.extensionPayment : 0,
      refundableCredits: typeof raw.refundableCredits === 'number' ? raw.refundableCredits : 0
    };
  }

  function normalizeInputs(raw) {
    if (!isObject(raw)) throw ProjectValidationError('Invalid inputs object.');
    var defaults = emptyInputs();
    var profile = isObject(raw.profile) ? raw.profile : {};
    var validStatuses = ['single', 'mfj', 'mfs', 'hoh', 'qss'];
    return {
      profile: {
        filingStatus: validStatuses.indexOf(profile.filingStatus) !== -1 ? profile.filingStatus : defaults.profile.filingStatus,
        taxpayerAge: typeof profile.taxpayerAge === 'number' ? profile.taxpayerAge : defaults.profile.taxpayerAge,
        spouseAge: typeof profile.spouseAge === 'number' ? profile.spouseAge : null,
        dependentsUnder17: typeof profile.dependentsUnder17 === 'number' ? profile.dependentsUnder17 : 0,
        otherDependents: typeof profile.otherDependents === 'number' ? profile.otherDependents : 0,
        blindTaxpayer: typeof profile.blindTaxpayer === 'boolean' && profile.blindTaxpayer,
        blindSpouse: typeof profile.blindSpouse === 'boolean' && profile.blindSpouse,
        state: typeof profile.state === 'string' ? profile.state : ''
      },
      wages: Array.isArray(raw.wages) ? raw.wages : [],
      interestDividends: Array.isArray(raw.interestDividends) ? raw.interestDividends : [],
      businesses: Array.isArray(raw.businesses) ? raw.businesses : [],
      rentals: Array.isArray(raw.rentals) ? raw.rentals : [],
      capitalGains: Array.isArray(raw.capitalGains) ? raw.capitalGains : [],
      otherIncome: Array.isArray(raw.otherIncome) ? raw.otherIncome : [],
      itemizedDeductions: isObject(raw.itemizedDeductions)
        ? Object.assign({}, defaults.itemizedDeductions, raw.itemizedDeductions)
        : defaults.itemizedDeductions,
      planningStrategies: Array.isArray(raw.planningStrategies) ? raw.planningStrategies : [],
      payments: normalizePayments(raw.payments)
    };
  }

  function normalizeScenario(raw) {
    if (!isObject(raw)) throw ProjectValidationError('Invalid scenario object.');
    return {
      id: requireString(raw.id, 'scenario.id'),
      name: requireString(raw.name, 'scenario.name'),
      description: typeof raw.description === 'string' ? raw.description : '',
      inputs: normalizeInputs(raw.inputs),
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      isBaseline: typeof raw.isBaseline === 'boolean' && raw.isBaseline,
      hostId: typeof raw.hostId === 'string' && raw.hostId ? raw.hostId : null
    };
  }

  function migrateProject(raw) {
    var version = typeof raw.version === 'number' ? raw.version : 0;
    var out = Object.assign({}, raw);
    if (version < 1) {
      if (!Array.isArray(out.scenarios) && isObject(out.scenario)) {
        out.scenarios = [out.scenario];
        delete out.scenario;
      }
      if (typeof out.activeScenarioId !== 'string') {
        var list = out.scenarios;
        var first = Array.isArray(list) && isObject(list[0]) ? list[0] : undefined;
        out.activeScenarioId = first && typeof first.id === 'string' ? first.id : '';
      }
      out.version = 1;
    }
    if ((typeof out.version === 'number' ? out.version : 0) < 2) {
      if (typeof out.notes !== 'string') out.notes = '';
      if (Array.isArray(out.scenarios)) {
        out.scenarios = out.scenarios.map(function (s) {
          if (!isObject(s)) return s;
          var inputs = isObject(s.inputs) ? s.inputs : {};
          var payments = Object.assign({
            federalWithholdingOther: 0, estimatedPayments: [0, 0, 0, 0],
            priorYearOverpayment: 0, priorYearTax: 0, priorYearAgi: 0,
            extensionPayment: 0, refundableCredits: 0
          }, isObject(inputs.payments) ? inputs.payments : {});
          return Object.assign({}, s, { inputs: Object.assign({}, inputs, { payments: payments }) });
        });
      }
      out.version = 2;
    }
    return out;
  }

  function parseProject(json) {
    var raw;
    try { raw = JSON.parse(json); }
    catch (e) { throw ProjectValidationError('Invalid JSON.'); }
    if (!isObject(raw)) throw ProjectValidationError('Project JSON must be an object.');
    var migrated = migrateProject(raw);
    if (!Array.isArray(migrated.scenarios) || migrated.scenarios.length === 0) {
      throw ProjectValidationError('Project must contain at least one scenario.');
    }
    var scenarios = migrated.scenarios.map(normalizeScenario);
    var first = scenarios[0];
    if (!first) throw ProjectValidationError('Project must contain at least one scenario.');
    var activeId = typeof migrated.activeScenarioId === 'string' &&
      scenarios.some(function (s) { return s.id === migrated.activeScenarioId; })
      ? migrated.activeScenarioId : first.id;
    var taxYear = migrated.taxYear != null ? migrated.taxYear : 2026;
    if (typeof taxYear !== 'number' || Number.isNaN(taxYear)) {
      throw ProjectValidationError('Expected numeric field "taxYear".');
    }
    return {
      version: 2,
      name: typeof migrated.name === 'string' ? migrated.name : 'Untitled Project',
      client: typeof migrated.client === 'string' ? migrated.client : '',
      preparedBy: typeof migrated.preparedBy === 'string' ? migrated.preparedBy : '',
      taxYear: taxYear,
      scenarios: scenarios,
      activeScenarioId: activeId,
      notes: typeof migrated.notes === 'string' ? migrated.notes : '',
      createdAt: typeof migrated.createdAt === 'string' ? migrated.createdAt : new Date().toISOString(),
      updatedAt: typeof migrated.updatedAt === 'string' ? migrated.updatedAt : new Date().toISOString()
    };
  }

  window.TaxEngine = {
    PARAMS: PARAMS,
    PARAM_AUTHORITIES: PARAM_AUTHORITIES,
    COVERAGE: COVERAGE,
    CONTRIBUTION_LIMITS: CONTRIBUTION_LIMITS,
    computeProjection: computeProjection,
    createScenario: createScenario,
    duplicateScenario: duplicateScenario,
    compareScenarios: compareScenarios,
    createDemoProject: createDemoProject,
    emptyInputs: emptyInputs,
    /* Validate/normalize a raw inputs object (fills defaults, rejects junk).
       Used by the host bridge to accept scenarios pushed in from outside. */
    parseInputs: normalizeInputs,
    serializeProject: serializeProject,
    parseProject: parseProject,
    uuid: uuid,
    round2: round2
  };
})();
