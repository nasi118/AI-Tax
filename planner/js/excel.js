/* =========================================================================
   Tax Planner — Excel workbook export/import (ExcelJS, lazy-loaded from CDN)
   The workbook layout is round-trippable: parseProjectWorkbook reads the
   same SECTION-tagged sheets that buildProjectWorkbook writes.
   Exposed as window.TaxExcel.
   ========================================================================= */
(function () {
  'use strict';

  var EXCELJS_SRC = 'vendor/exceljs.min.js';
  var excelJsPromise = null;

  function loadExcelJs() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!excelJsPromise) {
      excelJsPromise = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = EXCELJS_SRC;
        script.onload = function () {
          window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS failed to initialize.'));
        };
        script.onerror = function () {
          excelJsPromise = null;
          reject(new Error('Could not load the Excel library. JSON export still works.'));
        };
        document.head.appendChild(script);
      });
    }
    return excelJsPromise;
  }

  var PERCENT_FMT = '0.00%';
  var HEADER_NAVY = 'FF0F1F38';
  var TITLE_NAVY = 'FF0A1628';

  function headerRow(sheet, values, argb) {
    argb = argb || HEADER_NAVY;
    var row = sheet.addRow(values);
    row.eachCell(function (cell) {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    });
    row.height = 20;
    return row;
  }

  function titleRow(sheet, title, span) {
    var row = sheet.addRow([title]);
    row.font = { bold: true, size: 13, color: { argb: TITLE_NAVY } };
    row.height = 22;
    if (span > 1) sheet.mergeCells(row.number, 1, row.number, span);
  }

  function sectionRow(sheet, name) {
    sheet.addRow(['SECTION', name]).font = { bold: true, size: 10, color: { argb: TITLE_NAVY } };
  }

  function dataRow(sheet, values, currencyCols, opts) {
    opts = opts || {};
    var row = sheet.addRow(values);
    for (var col of currencyCols) {
      var cell = row.getCell(col);
      cell.numFmt = '#,##0;(#,##0)';
      cell.alignment = { horizontal: 'right' };
    }
    if (opts.bold) row.font = { bold: true };
    if (opts.topRule) {
      row.eachCell(function (cell) {
        cell.border = { top: { style: 'thin', color: { argb: HEADER_NAVY } } };
      });
    }
  }

  function setWidths(sheet, widths) {
    widths.forEach(function (w, i) { sheet.getColumn(i + 1).width = w; });
  }

  function freeze(sheet, rows) {
    sheet.views = [{ state: 'frozen', ySplit: rows }];
  }

  function addModuleSheet(workbook, name, title, modules) {
    var sheet = workbook.addWorksheet(name);
    setWidths(sheet, [48, 34, 18, 16]);
    titleRow(sheet, title, 4);
    sheet.addRow([]);
    for (var mod of modules) {
      headerRow(sheet, [mod.label, 'Authority', 'Amount', 'Status']);
      for (var l of mod.lines) {
        dataRow(sheet, [l.label, l.citation != null ? l.citation : '', l.amount, l.status], [3]);
      }
      dataRow(sheet, ['Module total', '', mod.total, mod.status], [3], { bold: true, topRule: true });
      sheet.addRow([]);
    }
    freeze(sheet, 2);
  }

  async function buildProjectWorkbook(project) {
    var ExcelJS = await loadExcelJs();
    var engine = window.TaxEngine;
    var scenario = project.scenarios.find(function (s) { return s.id === project.activeScenarioId; }) || project.scenarios[0];
    if (!scenario) throw new Error('Project contains no scenarios');
    var result = engine.computeProjection(scenario.inputs);
    var mods = function (key) {
      var m = result.modules[key];
      return m ? [m] : [];
    };
    var workbook = new ExcelJS.Workbook();
    workbook.creator = 'Tax Planner 2026';
    workbook.created = new Date();

    /* Summary sheet */
    var summary = workbook.addWorksheet('Summary');
    setWidths(summary, [42, 26, 20, 20]);
    titleRow(summary, 'Individual Income Tax Planning Projection — 2026', 4);
    summary.addRow(['Client: ' + project.client, 'Prepared by: ' + project.preparedBy]);
    summary.addRow(['Project: ' + project.name, 'Scenario: ' + scenario.name]);
    summary.addRow(['Generated: ' + new Date().toISOString().slice(0, 10), 'Engine status: ' + result.status]);
    summary.addRow([]);
    sectionRow(summary, 'PROFILE');
    headerRow(summary, ['Profile field', 'Value']);
    var profile = scenario.inputs.profile;
    for (var pair of [
      ['filingStatus', profile.filingStatus], ['taxpayerAge', profile.taxpayerAge],
      ['spouseAge', profile.spouseAge], ['dependentsUnder17', profile.dependentsUnder17],
      ['otherDependents', profile.otherDependents], ['blindTaxpayer', profile.blindTaxpayer],
      ['blindSpouse', profile.blindSpouse], ['state', profile.state]
    ]) summary.addRow(pair);
    summary.addRow([]);
    headerRow(summary, ['Summary line', 'Reference', 'Amount']);
    for (var s of [
      ['Total income', '1040 line 9', result.totalIncome],
      ['Adjustments to income', 'Schedule 1 Part II', result.adjustments],
      ['Adjusted gross income', '1040 line 11', result.agi],
      ['Modified AGI', 'IRC §1411(d)', result.magi],
      ['Deduction (' + result.deductionType + ')', '1040 line 12', result.deductionUsed],
      ['QBI deduction', '1040 line 13', result.qbiDeduction],
      ['Taxable income', '1040 line 15', result.taxableIncome],
      ['Ordinary income tax', 'IRC §1(j)', result.ordinaryTax],
      ['Preference-rate tax', 'IRC §1(h)', result.capitalGainsTax],
      ['Alternative minimum tax', 'Form 6251', result.amt],
      ['Self-employment tax', 'Schedule SE', result.seTax],
      ['Net investment income tax', 'Form 8960', result.niit],
      ['Additional Medicare tax', 'Form 8959', result.additionalMedicare],
      ['Total tax', '1040 line 24', result.totalTax],
      ['Total payments', '1040 line 33', result.totalPayments],
      ['Balance due', '1040 line 37', result.balanceDue],
      ['Refund', '1040 line 34', result.refund],
      ['Safe harbor required', 'IRC §6654(d)', result.safeHarborRequired],
      ['Underpayment', 'Form 2210', result.underpayment]
    ]) dataRow(summary, s, [3], { bold: s[0] === 'Total tax' });
    summary.addRow(['Effective rate', 'Tax before credits ÷ taxable income', result.effectiveRate]).getCell(3).numFmt = PERCENT_FMT;
    summary.addRow(['Marginal rate', 'Top applicable bracket', result.marginalRate]).getCell(3).numFmt = PERCENT_FMT;
    freeze(summary, 5);

    /* Income Detail sheet — round-trippable input entries */
    var inputs = scenario.inputs;
    var income = workbook.addWorksheet('Income Detail');
    setWidths(income, [34, 20, 18, 18, 18, 18, 18, 18, 18]);
    titleRow(income, 'Income Detail — round-trippable input entries', 9);
    income.addRow([]);
    sectionRow(income, 'WAGES');
    headerRow(income, ['Employer', 'Box 1 wages', 'Fed withholding', 'SS wages', 'Medicare wages', 'SS withheld', 'Medicare withheld', 'Retirement deferral', 'HSA']);
    for (var w of inputs.wages) {
      dataRow(income, [w.employer, w.wages, w.federalWithholding, w.socialSecurityWages, w.medicareWages,
        w.socialSecurityWithheld, w.medicareWithheld, w.retirementDeferral, w.hsa], [2, 3, 4, 5, 6, 7, 8, 9]);
    }
    income.addRow([]);
    sectionRow(income, 'INTEREST_DIVIDENDS');
    headerRow(income, ['Payer', 'Kind', 'Amount', 'Fed withholding']);
    for (var i of inputs.interestDividends) {
      dataRow(income, [i.payer, i.kind, i.amount, i.federalWithholding], [3, 4]);
    }
    income.addRow([]);
    sectionRow(income, 'BUSINESSES');
    headerRow(income, ['Business', 'Gross receipts', 'Expenses', 'SSTB', 'W-2 wages', 'UBIA', 'Material participation']);
    for (var b of inputs.businesses) {
      dataRow(income, [b.name, b.grossReceipts, b.expenses, b.isSSTB, b.w2Wages, b.unadjustedBasis, b.materialParticipation], [2, 3, 5, 6]);
    }
    income.addRow([]);
    sectionRow(income, 'RENTALS');
    headerRow(income, ['Property', 'Rents', 'Expenses', 'Depreciation', 'Active participation', '§199A trade or business']);
    for (var r of inputs.rentals) {
      dataRow(income, [r.property, r.rents, r.expenses, r.depreciation, r.activelyParticipates, r.isQualifiedTradeOrBusiness], [2, 3, 4]);
    }
    income.addRow([]);
    sectionRow(income, 'CAPITAL_GAINS');
    headerRow(income, ['Description', 'Short-term', 'Long-term', 'Unrecaptured §1250', 'Collectibles']);
    for (var g of inputs.capitalGains) {
      dataRow(income, [g.description, g.shortTermGain, g.longTermGain, g.section1250Gain, g.collectiblesGain], [2, 3, 4, 5]);
    }
    income.addRow([]);
    sectionRow(income, 'OTHER_INCOME');
    headerRow(income, ['Description', 'Kind', 'Amount', 'Fed withholding', 'Passive']);
    for (var o of inputs.otherIncome) {
      dataRow(income, [o.description, o.kind, o.amount, o.federalWithholding, o.isPassive], [3, 4]);
    }
    freeze(income, 2);

    /* Deductions sheet */
    var deductions = workbook.addWorksheet('Deductions');
    setWidths(deductions, [44, 22, 18, 34]);
    titleRow(deductions, 'Deductions, Itemized Schedule & Planning Strategies', 4);
    deductions.addRow([]);
    sectionRow(deductions, 'ITEMIZED');
    headerRow(deductions, ['Itemized field', 'Amount']);
    for (var entry of Object.entries(inputs.itemizedDeductions)) {
      dataRow(deductions, [entry[0], entry[1]], [2]);
    }
    deductions.addRow([]);
    sectionRow(deductions, 'STRATEGIES');
    headerRow(deductions, ['Label', 'Kind', 'Amount', 'Enabled', 'Note']);
    for (var st of inputs.planningStrategies) {
      dataRow(deductions, [st.label, st.kind, st.amount, st.enabled, st.note], [3]);
    }
    deductions.addRow([]);
    headerRow(deductions, ['Computed line', 'Authority', 'Amount', 'Status']);
    for (var mod of [result.modules.deductions, result.modules.planningDeductions]) {
      if (!mod) continue;
      for (var l of mod.lines) {
        dataRow(deductions, [l.label, l.citation != null ? l.citation : '', l.amount, l.status], [3]);
      }
    }
    freeze(deductions, 2);

    addModuleSheet(workbook, 'QBI', 'Qualified Business Income Deduction — IRC §199A', mods('qbi'));
    addModuleSheet(workbook, 'Tax Computation', 'Tax Computation & Additional Taxes',
      mods('taxComputation').concat(mods('additionalTaxes'), mods('selfEmploymentTax')));

    /* Payments sheet */
    var paymentsSheet = workbook.addWorksheet('Payments');
    setWidths(paymentsSheet, [44, 22, 18, 34]);
    titleRow(paymentsSheet, 'Payments, Credits & Estimated Tax', 4);
    paymentsSheet.addRow([]);
    sectionRow(paymentsSheet, 'PAYMENTS');
    headerRow(paymentsSheet, ['Payments field', 'Amount']);
    var pay = inputs.payments;
    for (var p of [
      ['federalWithholdingOther', pay.federalWithholdingOther],
      ['estimatedPaymentsQ1', pay.estimatedPayments[0]],
      ['estimatedPaymentsQ2', pay.estimatedPayments[1]],
      ['estimatedPaymentsQ3', pay.estimatedPayments[2]],
      ['estimatedPaymentsQ4', pay.estimatedPayments[3]],
      ['priorYearOverpayment', pay.priorYearOverpayment],
      ['priorYearTax', pay.priorYearTax],
      ['priorYearAgi', pay.priorYearAgi],
      ['extensionPayment', pay.extensionPayment],
      ['refundableCredits', pay.refundableCredits]
    ]) dataRow(paymentsSheet, p, [2]);
    paymentsSheet.addRow([]);
    headerRow(paymentsSheet, ['Computed line', 'Authority', 'Amount', 'Status']);
    var payModule = result.modules.payments;
    if (payModule) {
      for (var pl of payModule.lines) {
        dataRow(paymentsSheet, [pl.label, pl.citation != null ? pl.citation : '', pl.amount, pl.status], [3]);
      }
    }
    freeze(paymentsSheet, 2);

    /* Scenario comparison sheet */
    var compareSheet = workbook.addWorksheet('Scenario Comparison');
    titleRow(compareSheet, 'Scenario Comparison', 6);
    compareSheet.addRow([]);
    var compareScenariosList = project.scenarios.slice(0, 4);
    setWidths(compareSheet, [40].concat(compareScenariosList.map(function () { return 20; })));
    if (compareScenariosList.length < 2) {
      compareSheet.addRow(['Only one scenario in this project — nothing to compare.']);
    } else {
      var comparison = engine.compareScenarios.apply(null, compareScenariosList);
      headerRow(compareSheet, ['Metric'].concat(comparison.scenarioNames));
      for (var field of Object.values(comparison.fields)) {
        dataRow(compareSheet, [field.label].concat(field.values),
          field.values.map(function (v, idx) { return idx + 2; }));
      }
      compareSheet.addRow([]);
      dataRow(compareSheet, ['Tax savings vs. first scenario', comparison.taxSavings], [2], { bold: true });
      compareSheet.addRow(['Marginal rate change', comparison.marginalRateChange]).getCell(2).numFmt = PERCENT_FMT;
      freeze(compareSheet, 3);
    }

    /* Assumptions sheet */
    var assumptions = workbook.addWorksheet('Assumptions & Citations');
    setWidths(assumptions, [40, 70]);
    titleRow(assumptions, 'Assumptions, Parameters & Authority', 2);
    assumptions.addRow([]);
    headerRow(assumptions, ['Parameter group', 'Authority']);
    for (var authority of Object.entries(engine.PARAM_AUTHORITIES)) assumptions.addRow(authority);
    assumptions.addRow([]);
    headerRow(assumptions, ['Assumption', 'Detail']);
    for (var a of [
      ['Tax year', '2026, per Rev. Proc. 2025-32 and P.L. 119-21 (OBBBA)'],
      ['Standard deduction (MFJ)', String(engine.PARAMS.standardDeduction.mfj)],
      ['SALT cap (before phase-down)', String(engine.PARAMS.saltCap.base)],
      ['State income tax', 'Not modeled — federal only'],
      ['Carryforwards', 'Prior-year capital, passive and charitable carryovers not applied'],
      ['AMT', 'Estimated: limited preference items modeled'],
      ['Foreign reporting', 'Forms 1116 / 2555 / 8621 not supported'],
      ['Notes', project.notes || '—'],
      ['Disclaimer', 'Planning estimate for discussion only. Not a filed return; not tax, legal or investment advice.']
    ]) assumptions.addRow(a);
    freeze(assumptions, 2);

    var buffer = await workbook.xlsx.writeBuffer();
    return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  }

  function safeClientFilename(project) {
    return project.client.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'client';
  }

  /* ---- workbook import --------------------------------------------------- */

  function cellText(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if (typeof value.text === 'string') return value.text.trim();
      if (Array.isArray(value.richText)) {
        return value.richText.map(function (part) {
          return part && typeof part === 'object' && typeof part.text === 'string' ? part.text : '';
        }).join('').trim();
      }
      if (typeof value.result === 'number') return String(value.result);
      if (typeof value.result === 'string') return value.result.trim();
    }
    return '';
  }

  function cellNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    var text = cellText(value);
    if (text === '') return 0;
    var negative = /^\(.*\)$/.test(text);
    var parsed = Number(text.replace(/[()$,\s]/g, ''));
    return Number.isFinite(parsed) ? (negative ? -Math.abs(parsed) : parsed) : 0;
  }

  function cellBool(value) {
    if (typeof value === 'boolean') return value;
    var text = cellText(value).toLowerCase();
    return text === 'true' || text === 'yes' || text === 'y' || text === '1';
  }

  function importId(prefix, index) {
    return prefix + '-import-' + index + '-' + Math.random().toString(36).slice(2, 8);
  }

  function readSections(sheet) {
    var sections = new Map();
    var current = null;
    var skipHeader = false;
    sheet.eachRow({ includeEmpty: true }, function (row) {
      var first = cellText(row.getCell(1).value);
      if (first.toUpperCase() === 'SECTION') {
        var name = cellText(row.getCell(2).value).toUpperCase();
        current = { name: name, rows: [] };
        sections.set(name, current);
        skipHeader = true;
        return;
      }
      if (!current) return;
      if (skipHeader) { skipHeader = false; return; }
      if (first === '') { current = null; return; }
      var cells = [];
      for (var col = 1; col <= 12; col += 1) cells.push(row.getCell(col).value);
      current.rows.push(cells);
    });
    return sections;
  }

  function cellAt(row, index) {
    var v = row[index];
    return v === undefined ? null : v;
  }

  var FILING_STATUSES = ['single', 'mfj', 'mfs', 'hoh', 'qss'];
  var INTDIV_KINDS = ['interest', 'taxExemptInterest', 'ordinaryDividend', 'qualifiedDividend'];
  var OTHER_KINDS = ['retirement', 'socialSecurity', 'unemployment', 'k1Ordinary', 'other'];
  var STRATEGY_KINDS = ['traditionalIra', 'sepIra', 'solo401k', 'hsa', 'charitableBunching', 'dafContribution',
    'lossHarvesting', 'incomeDeferral', 'rothConversion', 'installmentSale', 'qcd',
    'appreciatedStock', 'qofDeferral', 'qsbsExclusion', 'nua', 'scorpElection', 'plan529', 'casualtyLoss', 'custom'];

  async function parseProjectWorkbook(arrayBuffer) {
    var ExcelJS = await loadExcelJs();
    var warnings = [];
    var workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    var inputs = window.TaxEngine.emptyInputs();

    var summary = workbook.getWorksheet('Summary');
    if (summary) {
      var profileSection = readSections(summary).get('PROFILE');
      if (profileSection) {
        for (var row of profileSection.rows) {
          var field = cellText(cellAt(row, 0));
          var value = cellAt(row, 1);
          switch (field) {
            case 'filingStatus': {
              var fsText = cellText(value).toLowerCase();
              var fs = FILING_STATUSES.find(function (s) { return s === fsText; });
              if (fs) inputs.profile.filingStatus = fs;
              else warnings.push('Unrecognized filing status "' + fsText + '" — kept single.');
              break;
            }
            case 'taxpayerAge': inputs.profile.taxpayerAge = cellNumber(value); break;
            case 'spouseAge': {
              var text = cellText(value);
              inputs.profile.spouseAge = text === '' ? null : cellNumber(value);
              break;
            }
            case 'dependentsUnder17': inputs.profile.dependentsUnder17 = cellNumber(value); break;
            case 'otherDependents': inputs.profile.otherDependents = cellNumber(value); break;
            case 'blindTaxpayer': inputs.profile.blindTaxpayer = cellBool(value); break;
            case 'blindSpouse': inputs.profile.blindSpouse = cellBool(value); break;
            case 'state': inputs.profile.state = cellText(value); break;
            default: warnings.push('Ignored unknown profile field "' + field + '".');
          }
        }
      } else {
        warnings.push('Summary sheet has no PROFILE section — profile defaults were used.');
      }
    } else {
      warnings.push("Sheet 'Summary' is missing — taxpayer profile defaults were used.");
    }

    var incomeSheet = workbook.getWorksheet('Income Detail');
    if (incomeSheet) {
      var sections = readSections(incomeSheet);
      var wagesSection = sections.get('WAGES');
      if (wagesSection) {
        inputs.wages = wagesSection.rows.map(function (row, idx) {
          return {
            id: importId('wage', idx),
            employer: cellText(cellAt(row, 0)),
            wages: cellNumber(cellAt(row, 1)),
            federalWithholding: cellNumber(cellAt(row, 2)),
            socialSecurityWages: cellNumber(cellAt(row, 3)),
            medicareWages: cellNumber(cellAt(row, 4)),
            socialSecurityWithheld: cellNumber(cellAt(row, 5)),
            medicareWithheld: cellNumber(cellAt(row, 6)),
            retirementDeferral: cellNumber(cellAt(row, 7)),
            hsa: cellNumber(cellAt(row, 8))
          };
        });
      } else warnings.push('No WAGES section found on Income Detail.');
      var intDivSection = sections.get('INTEREST_DIVIDENDS');
      if (intDivSection) {
        inputs.interestDividends = intDivSection.rows.map(function (row, idx) {
          var kindText = cellText(cellAt(row, 1));
          var kind = INTDIV_KINDS.find(function (k) { return k === kindText; });
          if (!kind) {
            warnings.push('Interest/dividend row ' + (idx + 1) + ': unrecognized kind "' + kindText + '" — treated as taxable interest.');
          }
          return {
            id: importId('intdiv', idx),
            payer: cellText(cellAt(row, 0)),
            kind: kind != null ? kind : 'interest',
            amount: cellNumber(cellAt(row, 2)),
            federalWithholding: cellNumber(cellAt(row, 3))
          };
        });
      } else warnings.push('No INTEREST_DIVIDENDS section found on Income Detail.');
      var bizSection = sections.get('BUSINESSES');
      if (bizSection) {
        inputs.businesses = bizSection.rows.map(function (row, idx) {
          return {
            id: importId('biz', idx),
            name: cellText(cellAt(row, 0)),
            grossReceipts: cellNumber(cellAt(row, 1)),
            expenses: cellNumber(cellAt(row, 2)),
            isSSTB: cellBool(cellAt(row, 3)),
            w2Wages: cellNumber(cellAt(row, 4)),
            unadjustedBasis: cellNumber(cellAt(row, 5)),
            materialParticipation: cellBool(cellAt(row, 6))
          };
        });
      }
      var rentalSection = sections.get('RENTALS');
      if (rentalSection) {
        inputs.rentals = rentalSection.rows.map(function (row, idx) {
          return {
            id: importId('rental', idx),
            property: cellText(cellAt(row, 0)),
            rents: cellNumber(cellAt(row, 1)),
            expenses: cellNumber(cellAt(row, 2)),
            depreciation: cellNumber(cellAt(row, 3)),
            activelyParticipates: cellBool(cellAt(row, 4)),
            isQualifiedTradeOrBusiness: cellBool(cellAt(row, 5))
          };
        });
      }
      var gainsSection = sections.get('CAPITAL_GAINS');
      if (gainsSection) {
        inputs.capitalGains = gainsSection.rows.map(function (row, idx) {
          return {
            id: importId('gain', idx),
            description: cellText(cellAt(row, 0)),
            shortTermGain: cellNumber(cellAt(row, 1)),
            longTermGain: cellNumber(cellAt(row, 2)),
            section1250Gain: cellNumber(cellAt(row, 3)),
            collectiblesGain: cellNumber(cellAt(row, 4))
          };
        });
      }
      var otherSection = sections.get('OTHER_INCOME');
      if (otherSection) {
        inputs.otherIncome = otherSection.rows.map(function (row, idx) {
          var kindText = cellText(cellAt(row, 1));
          var kind = OTHER_KINDS.find(function (k) { return k === kindText; });
          if (!kind) {
            warnings.push('Other income row ' + (idx + 1) + ': unrecognized kind "' + kindText + '" — treated as other.');
          }
          return {
            id: importId('other', idx),
            description: cellText(cellAt(row, 0)),
            amount: cellNumber(cellAt(row, 2)),
            kind: kind != null ? kind : 'other',
            federalWithholding: cellNumber(cellAt(row, 3)),
            isPassive: cellBool(cellAt(row, 4))
          };
        });
      }
    } else {
      warnings.push("Sheet 'Income Detail' is missing — no income entries were imported.");
    }

    var deductionsSheet = workbook.getWorksheet('Deductions');
    if (deductionsSheet) {
      var dedSections = readSections(deductionsSheet);
      var itemizedSection = dedSections.get('ITEMIZED');
      if (itemizedSection) {
        var itemized = inputs.itemizedDeductions;
        var validKeys = Object.keys(itemized);
        for (var iRow of itemizedSection.rows) {
          var iField = cellText(cellAt(iRow, 0));
          var key = validKeys.find(function (k) { return k === iField; });
          if (key) itemized[key] = cellNumber(cellAt(iRow, 1));
          else warnings.push('Ignored unknown itemized deduction field "' + iField + '".');
        }
      } else warnings.push('No ITEMIZED section found on Deductions.');
      var strategiesSection = dedSections.get('STRATEGIES');
      if (strategiesSection) {
        inputs.planningStrategies = strategiesSection.rows.map(function (row, idx) {
          return {
            id: importId('strategy', idx),
            label: cellText(cellAt(row, 0)),
            kind: 'custom',
            amount: cellNumber(cellAt(row, 2)),
            enabled: cellBool(cellAt(row, 3)),
            note: cellText(cellAt(row, 4))
          };
        });
        strategiesSection.rows.forEach(function (row, idx) {
          var kindText = cellText(cellAt(row, 1));
          var strategy = inputs.planningStrategies[idx];
          if (!strategy) return;
          var kind = STRATEGY_KINDS.find(function (k) { return k === kindText; });
          if (kind) strategy.kind = kind;
          else if (kindText !== '') {
            warnings.push('Strategy "' + strategy.label + '": unknown kind "' + kindText + '" — imported as custom.');
          }
        });
      }
    } else {
      warnings.push("Sheet 'Deductions' is missing — itemized deductions and strategies were not imported.");
    }

    var paymentsSheetIn = workbook.getWorksheet('Payments');
    if (paymentsSheetIn) {
      var paymentsSection = readSections(paymentsSheetIn).get('PAYMENTS');
      if (paymentsSection) {
        for (var pRow of paymentsSection.rows) {
          var pField = cellText(cellAt(pRow, 0));
          var pValue = cellNumber(cellAt(pRow, 1));
          switch (pField) {
            case 'federalWithholdingOther': inputs.payments.federalWithholdingOther = pValue; break;
            case 'estimatedPaymentsQ1': inputs.payments.estimatedPayments[0] = pValue; break;
            case 'estimatedPaymentsQ2': inputs.payments.estimatedPayments[1] = pValue; break;
            case 'estimatedPaymentsQ3': inputs.payments.estimatedPayments[2] = pValue; break;
            case 'estimatedPaymentsQ4': inputs.payments.estimatedPayments[3] = pValue; break;
            case 'priorYearOverpayment': inputs.payments.priorYearOverpayment = pValue; break;
            case 'priorYearTax': inputs.payments.priorYearTax = pValue; break;
            case 'priorYearAgi': inputs.payments.priorYearAgi = pValue; break;
            case 'extensionPayment': inputs.payments.extensionPayment = pValue; break;
            case 'refundableCredits': inputs.payments.refundableCredits = pValue; break;
            default: warnings.push('Ignored unknown payments field "' + pField + '".');
          }
        }
      } else warnings.push('No PAYMENTS section found on Payments.');
    } else {
      warnings.push("Sheet 'Payments' is missing — payment defaults were used.");
    }

    return { inputs: inputs, warnings: warnings };
  }

  window.TaxExcel = {
    buildProjectWorkbook: buildProjectWorkbook,
    parseProjectWorkbook: parseProjectWorkbook,
    safeClientFilename: safeClientFilename
  };
})();
