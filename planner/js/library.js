/* =========================================================================
   Tax Planner — Strategy Scenario Library
   Curated planning scenarios drawn from the practice reference guides
   uploaded to this project:
     · "Advantages of a Roth IRA" (client letter)
     · "HNWI Tax Planning — Procedures & Strategies Guide (2025)"
     · "CCH Guide — Capital Gains & Casualty Losses"
     · "Entity Classification — Definitions & Code Explanations" (CCH)
     · "Essential Tax & Wealth Planning Guide, 2025 Edition"
   Each entry clones the active scenario's inputs and applies concrete input
   changes the TY2026 engine actually computes (plus a tracking entry in the
   Planning Strategies grid). Anything approximated is labeled as such.
   Exposed as window.TaxLibrary.
   ========================================================================= */
(function () {
  'use strict';

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function track(inputs, label, kind, amount, note) {
    inputs.planningStrategies = inputs.planningStrategies.concat([{
      id: window.TaxEngine.uuid(), label: label, kind: kind, amount: amount, enabled: true, note: note
    }]);
    return inputs;
  }

  /* Categories are rendered in this order. */
  var CATEGORIES = ['Retirement & Deferral', 'Charitable Giving', 'Capital Gains Timing', 'Business & Entity', 'Other Planning'];

  var STRATEGY_LIBRARY = [
    /* ---- Retirement & Deferral ---------------------------------------- */
    {
      key: 'maxSolo401k',
      category: 'Retirement & Deferral',
      title: 'Max Solo 401(k) contribution',
      summary: 'Combine the employee deferral with an employer profit-sharing contribution — the HNWI guide pegs roughly $70,000 of capacity, saving ~$25,900 at the 37% bracket. Reduces AGI, and thereby QBI-threshold, NIIT and safe-harbor exposure.',
      authority: 'IRC §401(k); §415(c)',
      source: 'HNWI Strategies Guide §4.1',
      defaultAmount: 70000,
      amountLabel: 'Contribution',
      apply: function (inputs, amount) {
        return track(inputs, 'Solo 401(k) maximum contribution', 'solo401k', amount,
          'Employee deferral + employer profit sharing per HNWI guide §4.1. Engine caps at the 2026 limit and deducts above the line.');
      }
    },
    {
      key: 'sepIraMax',
      category: 'Retirement & Deferral',
      title: 'SEP-IRA contribution (25% of compensation)',
      summary: 'Simpler to administer than a Solo 401(k); contributions up to 25% of compensation reduce taxable income by the full amount. The guide favors it for smaller practices that value low admin overhead.',
      authority: 'IRC §408(k)',
      source: 'HNWI Strategies Guide §4.1',
      defaultAmount: 66000,
      amountLabel: 'Contribution',
      apply: function (inputs, amount) {
        return track(inputs, 'SEP-IRA contribution', 'sepIra', amount,
          'Up to 25% of compensation. Engine caps at the 2026 limit and deducts above the line.');
      }
    },
    {
      key: 'hsaMax',
      category: 'Retirement & Deferral',
      title: 'Max family HSA contribution',
      summary: 'Triple tax advantage: deductible going in, tax-free growth, tax-free qualified withdrawals. The guides flag HSAs as an underutilized bracket-independent saver.',
      authority: 'IRC §223',
      source: 'HNWI Strategies Guide',
      defaultAmount: 8750,
      amountLabel: 'Contribution',
      apply: function (inputs, amount) {
        return track(inputs, 'HSA family maximum contribution', 'hsa', amount,
          'Requires HDHP coverage. Engine caps at the 2026 family limit and deducts above the line.');
      }
    },
    {
      key: 'rothConversion',
      category: 'Retirement & Deferral',
      title: 'Roth conversion (bracket fill)',
      summary: 'Pay tax now for tax-free growth, no lifetime RMDs, and tax-free qualified distributions to heirs — the Roth letter’s core advantages. The HNWI guide recommends converting in lower-income years and testing conversion amounts against marginal brackets; the 5-year clock argues for starting early.',
      authority: 'IRC §408A(d)(3)',
      source: 'Roth IRA letter · HNWI Guide §4.1',
      defaultAmount: 100000,
      amountLabel: 'Amount converted',
      apply: function (inputs, amount) {
        inputs.otherIncome = inputs.otherIncome.concat([{
          id: window.TaxEngine.uuid(), description: 'Roth conversion — taxable amount', amount: amount,
          kind: 'retirement', federalWithholding: 0, isPassive: false
        }]);
        return track(inputs, 'Roth conversion', 'rothConversion', amount,
          'Converted amount is ordinary income this year; future qualified distributions are tax-free (5-year rule, age 59½). Watch bracket creep, NIIT MAGI and Medicare premium thresholds.');
      }
    },
    {
      key: 'qcd',
      category: 'Retirement & Deferral',
      title: 'Qualified charitable distribution (age 70½+)',
      summary: 'Direct IRA-to-charity transfer excluded from income entirely — better than a deduction because it never raises AGI (protecting NIIT, SS taxability and the 0.5% charitable floor).',
      authority: 'IRC §408(d)(8)',
      source: 'HNWI Strategies Guide §4.2',
      defaultAmount: 50000,
      amountLabel: 'QCD amount',
      apply: function (inputs, amount) {
        inputs.otherIncome = inputs.otherIncome.concat([{
          id: window.TaxEngine.uuid(), description: 'QCD — IRA distribution excluded from income', amount: -amount,
          kind: 'retirement', federalWithholding: 0, isPassive: false
        }]);
        return track(inputs, 'Qualified charitable distribution', 'qcd', amount,
          'Modeled as a reduction of taxable retirement distributions (transfer goes directly to charity). Requires age 70½+; can satisfy RMDs.');
      }
    },
    {
      key: 'nqdcDeferral',
      category: 'Retirement & Deferral',
      title: 'Nonqualified deferred compensation',
      summary: 'Defer W-2 income into future years when brackets may be lower — the guide pairs this with retirement-year planning. Modeled as a reduction of current Box 1 wages (estimate: FICA timing not modeled).',
      authority: 'IRC §409A',
      source: 'HNWI Strategies Guide §4.6',
      defaultAmount: 50000,
      amountLabel: 'Amount deferred',
      apply: function (inputs, amount) {
        var first = inputs.wages[0];
        if (first) first.wages = Math.max(0, first.wages - amount);
        return track(inputs, 'NQDC income deferral', 'incomeDeferral', amount,
          first ? 'Box 1 wages reduced by the deferred amount (estimated — FICA timing and §409A election mechanics not modeled).'
            : 'No W-2 entered — tracking only.');
      }
    },

    /* ---- Charitable Giving --------------------------------------------- */
    {
      key: 'dafBunching',
      category: 'Charitable Giving',
      title: 'Charitable bunching via donor-advised fund',
      summary: 'Bunch several years of gifts into one year through a DAF to clear the standard deduction and the new 0.5% AGI charitable floor, then grant to charities over time — the guide’s lead charitable strategy.',
      authority: 'IRC §170(b); §170(f)(18)',
      source: 'HNWI Strategies Guide §4.2',
      defaultAmount: 50000,
      amountLabel: 'Additional cash gifts',
      apply: function (inputs, amount) {
        inputs.itemizedDeductions.charitableCash += amount;
        return track(inputs, 'DAF charitable bunching', 'dafContribution', amount,
          'Multiple years of planned giving contributed to a donor-advised fund this year; engine applies the 60% AGI ceiling and 0.5% AGI floor.');
      }
    },
    {
      key: 'appreciatedStock',
      category: 'Charitable Giving',
      title: 'Donate appreciated securities instead of cash',
      summary: 'Gifting appreciated long-term stock avoids the capital-gains tax on the embedded gain while still deducting full fair market value (30% AGI ceiling) — both the CCH guide ("gift appreciated property rather than selling it") and the HNWI guide highlight this.',
      authority: 'IRC §170(b)(1)(C); §1(h)',
      source: 'CCH Capital Gains · HNWI Guide §4.2',
      defaultAmount: 25000,
      amountLabel: 'FMV donated',
      apply: function (inputs, amount) {
        inputs.itemizedDeductions.charitableNonCash += amount;
        inputs.capitalGains = inputs.capitalGains.concat([{
          id: window.TaxEngine.uuid(), description: 'Planned LTCG avoided — appreciated stock donated instead of sold',
          shortTermGain: 0, longTermGain: -amount, section1250Gain: 0, collectiblesGain: 0
        }]);
        return track(inputs, 'Appreciated securities donation', 'appreciatedStock', amount,
          'Assumes the donation replaces a planned sale with embedded gain ≈ FMV; adjust the capital-gains row for the actual basis.');
      }
    },

    /* ---- Capital Gains Timing ------------------------------------------ */
    {
      key: 'taxLossHarvest',
      category: 'Capital Gains Timing',
      title: 'Tax-loss harvesting',
      summary: 'Sell underperformers to offset realized gains, coordinating with rebalancing to avoid the §1091 wash-sale rule (no repurchase of substantially identical securities within the 61-day window — including in an IRA, per Rev. Rul. 2008-5).',
      authority: 'IRC §1211(b); §1091',
      source: 'CCH Capital Gains §9050 · HNWI Guide §4.4',
      defaultAmount: 50000,
      amountLabel: 'Losses realized',
      apply: function (inputs, amount) {
        inputs.capitalGains = inputs.capitalGains.concat([{
          id: window.TaxEngine.uuid(), description: 'Tax-loss harvesting (observe §1091 wash-sale window)',
          shortTermGain: 0, longTermGain: -amount, section1250Gain: 0, collectiblesGain: 0
        }]);
        return track(inputs, 'Tax-loss harvesting', 'lossHarvesting', amount,
          'Offsets realized gains dollar-for-dollar. The $3,000 ordinary-income offset and loss carryforwards are outside the engine (see Coverage).');
      }
    },
    {
      key: 'gainHarvest',
      category: 'Capital Gains Timing',
      title: 'Capital-gain harvesting at the breakpoints',
      summary: 'Realize long-term gains deliberately while taxable income sits below the 0% / 15% breakpoints ($98,900 / $613,700 MFJ for 2026 in this engine) — the CCH guide’s breakpoint mechanics and the HNWI guide’s "plan realizations during lower-tax years."',
      authority: 'IRC §1(h); Rev. Proc. 2025-32 §2.03',
      source: 'CCH Capital Gains §9010.25 · HNWI Guide §4.4',
      defaultAmount: 50000,
      amountLabel: 'Gains realized',
      apply: function (inputs, amount) {
        inputs.capitalGains = inputs.capitalGains.concat([{
          id: window.TaxEngine.uuid(), description: 'Gain harvesting at 0/15/20% breakpoints',
          shortTermGain: 0, longTermGain: amount, section1250Gain: 0, collectiblesGain: 0
        }]);
        return track(inputs, 'Capital-gain harvesting', 'custom', amount,
          'Realizes additional LTCG at preferential rates and resets basis. Check the preferential-band detail on the tax computation line.');
      }
    },
    {
      key: 'qofDeferral',
      category: 'Capital Gains Timing',
      title: 'Qualified Opportunity Fund deferral',
      summary: 'Reinvest realized gain into a QOF within 180 days to defer recognition (elected on Form 8949, tracked annually on Form 8997); a 10-year hold can eliminate tax on the QOF appreciation.',
      authority: 'IRC §1400Z-2',
      source: 'CCH Capital Gains §9080 · HNWI Guide §4.4',
      defaultAmount: 100000,
      amountLabel: 'Gain deferred',
      apply: function (inputs, amount) {
        inputs.capitalGains = inputs.capitalGains.concat([{
          id: window.TaxEngine.uuid(), description: 'LTCG deferred into Qualified Opportunity Fund (Form 8997)',
          shortTermGain: 0, longTermGain: -amount, section1250Gain: 0, collectiblesGain: 0
        }]);
        return track(inputs, 'QOF gain deferral', 'qofDeferral', amount,
          '180-day reinvestment window from the sale. Deferred gain is recognized later per §1400Z-2 — model the recognition year separately.');
      }
    },
    {
      key: 'qsbsExclusion',
      category: 'Capital Gains Timing',
      title: 'QSBS §1202 gain exclusion',
      summary: 'Gain on qualified small business C-corp stock held over five years can be excluded up to the greater of $10M or 10× basis — the CCH guide’s §1202 rules; the HNWI guide layers this into liquidity-event planning.',
      authority: 'IRC §1202; §1045 rollover',
      source: 'CCH Capital Gains §9060 · HNWI Guide §3.2',
      defaultAmount: 250000,
      amountLabel: 'Gain excluded',
      apply: function (inputs, amount) {
        inputs.capitalGains = inputs.capitalGains.concat([{
          id: window.TaxEngine.uuid(), description: 'QSBS gain excluded under §1202',
          shortTermGain: 0, longTermGain: -amount, section1250Gain: 0, collectiblesGain: 0
        }]);
        return track(inputs, 'QSBS §1202 exclusion', 'qsbsExclusion', amount,
          'Requires original-issue C-corp stock, $50M gross-asset test, active-business test, and a 5+ year hold (§1045 rollover if under 5 years).');
      }
    },
    {
      key: 'installmentSale',
      category: 'Capital Gains Timing',
      title: 'Installment sale spread',
      summary: 'Spread a large gain over the collection years to stay under the 20% breakpoint and NIIT threshold in any single year.',
      authority: 'IRC §453',
      source: 'HNWI Strategies Guide §4.4',
      defaultAmount: 150000,
      amountLabel: 'Gain deferred to later years',
      apply: function (inputs, amount) {
        inputs.capitalGains = inputs.capitalGains.concat([{
          id: window.TaxEngine.uuid(), description: 'Gain deferred to future installments (§453)',
          shortTermGain: 0, longTermGain: -amount, section1250Gain: 0, collectiblesGain: 0
        }]);
        return track(inputs, 'Installment sale', 'installmentSale', amount,
          'Only the current-year installment remains in this projection; depreciation recapture cannot be deferred under §453(i).');
      }
    },

    /* ---- Business & Entity ---------------------------------------------- */
    {
      key: 'scorpElection',
      category: 'Business & Entity',
      title: 'S-corp election with reasonable compensation',
      summary: 'Check-the-box entity classification (Form 8832 / §1362 election) lets an LLC be taxed as an S-corp: pay a reasonable salary (W-2, FICA-taxed) and take remaining profit as distributions that avoid SE tax while remaining QBI-eligible — the S-corp guide’s "reasonable compensation optimization."',
      authority: 'Reg. §301.7701-3; IRC §1362; §1402',
      source: 'Entity Classification (CCH) · HNWI Guide (S-corp strategies)',
      defaultAmount: 100000,
      amountLabel: 'Reasonable salary',
      estimated: true,
      apply: function (inputs, amount) {
        var business = inputs.businesses.reduce(function (best, b) {
          var net = b.grossReceipts - b.expenses;
          return !best || net > (best.grossReceipts - best.expenses) ? b : best;
        }, null);
        if (!business) {
          return track(inputs, 'S-corp election (no Schedule C business entered)', 'scorpElection', amount, 'Tracking only — enter a business first.');
        }
        var net = business.grossReceipts - business.expenses;
        var salary = Math.min(amount, Math.max(net, 0));
        var distributions = Math.max(0, net - salary);
        inputs.businesses = inputs.businesses.filter(function (b) { return b.id !== business.id; });
        inputs.wages = inputs.wages.concat([{
          id: window.TaxEngine.uuid(), employer: (business.name || 'S-corp') + ' (owner W-2)',
          wages: salary, federalWithholding: 0, socialSecurityWages: salary, medicareWages: salary,
          socialSecurityWithheld: 0, medicareWithheld: 0, retirementDeferral: 0, hsa: 0
        }]);
        if (distributions > 0) {
          inputs.otherIncome = inputs.otherIncome.concat([{
            id: window.TaxEngine.uuid(), description: (business.name || 'S-corp') + ' — K-1 ordinary income (distributive share)',
            amount: distributions, kind: 'k1Ordinary', federalWithholding: 0, isPassive: false
          }]);
        }
        return track(inputs, 'S-corp election — reasonable compensation', 'scorpElection', salary,
          'ESTIMATE: Schedule C profit re-cast as W-2 salary + K-1 ordinary income (no SE tax; still QBI-eligible). Employer payroll tax, payroll cost deduction and state fees not modeled. Salary must be defensible against IRS reasonable-compensation factors.');
      }
    },

    /* ---- Other Planning -------------------------------------------------- */
    {
      key: 'muniShift',
      category: 'Other Planning',
      title: 'Shift taxable interest into municipal bonds',
      summary: 'Move fixed-income yield into munis: interest becomes federally tax-exempt, though it still counts in MAGI for the NIIT and Social Security taxability tests — which this engine models on the tax-exempt line.',
      authority: 'IRC §103; §86(b)(2)',
      source: 'HNWI Strategies Guide §4.4',
      defaultAmount: 15000,
      amountLabel: 'Interest shifted',
      apply: function (inputs, amount) {
        inputs.interestDividends = inputs.interestDividends.concat([
          {
            id: window.TaxEngine.uuid(), payer: 'Reallocated to municipal bonds', kind: 'interest',
            amount: -amount, federalWithholding: 0
          },
          {
            id: window.TaxEngine.uuid(), payer: 'Municipal bond portfolio (new)', kind: 'taxExemptInterest',
            amount: amount, federalWithholding: 0
          }
        ]);
        return track(inputs, 'Municipal bond reallocation', 'custom', amount,
          'Taxable interest replaced with tax-exempt interest at the same yield (before any muni yield discount). Private-activity bond interest could be an AMT preference — not modeled.');
      }
    },
    {
      key: 'disasterCasualty',
      category: 'Other Planning',
      title: 'Federally-declared disaster casualty loss',
      summary: 'For 2018–2025-era rules carried into this planner, personal casualty losses are deductible only if attributable to a federally declared disaster, after a $100 floor and a 10%-of-AGI haircut (Form 4684 → Schedule A).',
      authority: 'IRC §165(h); Form 4684',
      source: 'CCH Casualty Losses §39,010–39,040',
      defaultAmount: 50000,
      amountLabel: 'Unreimbursed loss',
      estimated: true,
      apply: function (inputs, amount) {
        var agi = window.TaxEngine.computeProjection(inputs).agi;
        var deductible = Math.max(0, amount - 100 - Math.round(agi * 0.10));
        inputs.itemizedDeductions.other += deductible;
        return track(inputs, 'Disaster casualty loss (net of floors)', 'casualtyLoss', deductible,
          'Gross loss $' + amount.toLocaleString() + ' less $100 floor and 10% of AGI ($' + agi.toLocaleString() +
          ') = $' + deductible.toLocaleString() + ' added to other itemized deductions. Deductible only for a federally declared disaster; lesser-of-FMV-decline-or-basis measure applies.');
      }
    },
    {
      key: 'frontLoad529',
      category: 'Other Planning',
      title: '529 plan five-year front-load',
      summary: 'Pre-fund education with five years of annual-exclusion gifts at once — no federal deduction (so no change to this projection), but tax-free growth for qualified education costs and wealth moved out of the estate.',
      authority: 'IRC §529; §2503(b) exclusion',
      source: 'HNWI Strategies Guide §4.3',
      defaultAmount: 90000,
      amountLabel: 'Amount contributed',
      apply: function (inputs, amount) {
        return track(inputs, '529 five-year front-load', 'plan529', amount,
          'Tracking only — no federal deduction. Five-year gift-tax averaging election on Form 709; some states allow a state-level deduction.');
      }
    }
  ];

  window.TaxLibrary = {
    CATEGORIES: CATEGORIES,
    STRATEGY_LIBRARY: STRATEGY_LIBRARY,
    cloneInputs: clone
  };
})();
