/* ==== 13-export ==== */
/* ============================================================================
   WORKBOOK EXPORT
   Every computed cell is a live Excel formula pointing at either a named
   statutory constant on the Constants sheet or a raw figure on the Inputs
   sheet. Nothing in the computational sheets is a dead number.

   Each computational sheet ends with a tie-out block: the formula result, the
   value this engine computed, the variance, and a pass/review flag. If a
   formula and the engine ever disagree, the workbook says so on its face.
   ========================================================================== */

/* ---- Flatten a scenario to key/value pairs for round-tripping ---- */
function flattenScenario(obj, prefix, out) {
  out = out || [];
  prefix = prefix || "";
  Object.keys(obj).forEach(k => {
    const v = obj[k];
    const key = prefix ? prefix + "." + k : k;
    if (v == null) return;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === "object") flattenScenario(item, key + "." + i, out);else out.push({
          key: key + "." + i,
          value: item
        });
      });
      out.push({
        key: key + ".__count",
        value: v.length
      });
    } else if (typeof v === "object") {
      flattenScenario(v, key, out);
    } else if (typeof v === "boolean") {
      out.push({
        key,
        value: v ? "TRUE" : "FALSE"
      });
    } else {
      out.push({
        key,
        value: v
      });
    }
  });
  return out;
}
function unflattenScenario(pairs) {
  const root = {};
  pairs.forEach(({
    key,
    value
  }) => {
    if (/\.__count$/.test(key)) return;
    const parts = key.split(".");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      const nextIsIndex = /^\d+$/.test(parts[i + 1]);
      if (cur[p] == null) cur[p] = nextIsIndex ? [] : {};
      cur = cur[p];
    }
    let v = value;
    if (v === "TRUE") v = true;else if (v === "FALSE") v = false;else if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) v = Number(v);
    cur[parts[parts.length - 1]] = v;
  });
  return root;
}
const humanKey = k => k.replace(/\./g, " › ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\b\w/, c => c.toUpperCase());

/* ---- Formula helpers ---- */
const N = v => {
  const n = Number(v) || 0;
  return String(Math.round(n * 1e6) / 1e6);
};
const SC = i => colLetter(3 + i); // A = label, B = authority, C.. = scenarios

/* ============================================================================
   MAIN EXPORT
   ========================================================================== */
function buildTaxWorkbook(opts) {
  const {
    scenarios,
    results,
    status,
    year,
    auditLog,
    notes,
    meta
  } = opts;
  const C = TY[year];
  const nS = scenarios.length;
  const statusLabel = STATUSES.find(s => s.v === status).l;
  const sheets = [];
  const definedNames = [];

  /* ---------------------------------------------------------------- COVER */
  const cover = Sheet("Cover", {
    cols: [30, 62, 20]
  });
  cover.add({
    cells: [{
      t: "s",
      v: "Tax Advisory Pro — planning workbook",
      s: ST.title
    }]
  });
  cover.blank();
  const coverRow = (l, v) => cover.add({
    cells: [{
      t: "s",
      v: l,
      s: ST.label
    }, {
      t: "s",
      v: v,
      s: ST.label
    }]
  });
  coverRow("Client", meta.client || "—");
  coverRow("Prepared by", meta.preparer || "—");
  coverRow("Firm", meta.firm || "—");
  coverRow("Date exported", meta.exportedAt);
  coverRow("Tax year", C.label);
  coverRow("Filing status", statusLabel);
  coverRow("Scenarios", scenarios.map(s => s.name).join(" | "));
  cover.blank();
  cover.add({
    cells: [{
      t: "s",
      v: "How to audit this workbook",
      s: ST.sectionHdr
    }]
  });
  ["Constants holds every statutory figure, each with its authority. Excel defined names point at these cells, so a formula reads MIN(net_earnings, TX_SSWageBase) rather than hiding a magic number.", "Inputs holds every raw figure keyed for round-tripping. Change a value here and the whole workbook recalculates. This is also the sheet the app reads back on import.", "Every computational sheet is formula-driven off Constants and Inputs. Select any figure and trace its precedents.", "Each sheet ends with a tie-out: the formula result against the value the application computed, with a variance and a flag. Anything other than OK means the formula and the engine disagree and should be investigated.", "Audit Trail records every input change with a timestamp, the before and after values, and the resulting movement in total tax."].forEach(t => cover.add({
    cells: [null, {
      t: "s",
      v: t,
      s: ST.wrap
    }],
    height: 30
  }));
  cover.blank();
  cover.add({
    cells: [{
      t: "s",
      v: "Disclaimer",
      s: ST.sectionHdr
    }]
  });
  cover.add({
    cells: [null, {
      t: "s",
      v: "Directional planning estimates for discussion. Not a tax return, formal opinion, or legal advice. No source documents were verified. State and local tax and the alternative minimum tax are not modelled. Confirm entity facts, basis, eligibility and documentation before acting.",
      s: ST.wrap
    }],
    height: 46
  });
  sheets.push(cover);

  /* ------------------------------------------------------------ CONSTANTS */
  const K = Sheet("Constants", {
    cols: [30, 16, 52, 40],
    freeze: 2
  });
  K.add({
    cells: [{
      t: "s",
      v: "Statutory constants — " + C.label + ", " + statusLabel,
      s: ST.title
    }]
  });
  K.add({
    cells: [{
      t: "s",
      v: "Defined name",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Value",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Description",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Authority",
      s: ST.colHdr
    }]
  });
  const kref = {};
  const K_ = (name, value, desc, auth, style) => {
    K.add({
      id: "k_" + name,
      cells: [{
        t: "s",
        v: name,
        s: ST.key
      }, {
        v: value,
        s: style == null ? ST.money : style
      }, {
        t: "s",
        v: desc,
        s: ST.small
      }, {
        t: "s",
        v: auth,
        s: ST.cite
      }]
    });
    const row = K.rowOf("k_" + name);
    kref[name] = "Constants!$B$" + row;
    definedNames.push({
      name,
      ref: "Constants!$B$" + row
    });
    return kref[name];
  };
  const $ = n => kref[n];
  K.add({
    cells: [{
      t: "s",
      v: "Rates and brackets",
      s: ST.sectionHdr
    }]
  });
  const br = C.brackets[status];
  const bracketFirst = [];
  br.forEach((b, i) => {
    const prev = i === 0 ? 0 : br[i - 1][1];
    K.add({
      id: "br" + i,
      cells: [{
        t: "s",
        v: "Bracket " + (b[1] * 100).toFixed(0) + "% floor",
        s: ST.label
      }, {
        v: b[0],
        s: ST.money
      }, {
        v: b[1],
        s: ST.pctF
      }, {
        t: "s",
        v: "Marginal step over the band below",
        s: ST.cite
      }, {
        v: b[1] - prev,
        s: ST.pctF
      }]
    });
    bracketFirst.push(K.rowOf("br" + i));
  });
  const brLo = bracketFirst[0],
    brHi = bracketFirst[bracketFirst.length - 1];
  const BR_FLOOR = "Constants!$B$" + brLo + ":$B$" + brHi;
  const BR_STEP = "Constants!$E$" + brLo + ":$E$" + brHi;
  definedNames.push({
    name: "TX_BracketFloors",
    ref: BR_FLOOR
  });
  definedNames.push({
    name: "TX_BracketSteps",
    ref: BR_STEP
  });
  K_("TX_StdDeduction", C.stdDeduction[status], "Standard deduction", "IRC 63 as amended by OBBBA");
  K_("TX_AddlStdPer", status === "mfj" || status === "mfs" ? C.addlStdDedMarried : C.addlStdDedUnmarried, "Additional standard deduction per age-65 or blindness condition", "IRC 63(f)");
  K_("TX_LTCG_Zero", C.ltcg[status].zero, "Top of the 0% capital gain rate", "IRC 1(h)");
  K_("TX_LTCG_Fifteen", C.ltcg[status].fifteen, "Top of the 15% capital gain rate", "IRC 1(h)");
  K.add({
    cells: [{
      t: "s",
      v: "Employment tax",
      s: ST.sectionHdr
    }]
  });
  K_("TX_SSWageBase", C.ssWageBase, "Social Security wage base", "SSA contribution and benefit base");
  K_("TX_SEFactor", 0.9235, "Net earnings factor", "IRC 1402(a)(12)", ST.pctF);
  K_("TX_OASDIRate", 0.124, "Social Security rate on self-employment income", "IRC 1401(a)", ST.pctF);
  K_("TX_MedicareRate", 0.029, "Medicare rate on self-employment income", "IRC 1401(b)", ST.pctF);
  K_("TX_AddlMedRate", 0.009, "Additional Medicare Tax rate", "IRC 3101(b)(2)", ST.pctF);
  K_("TX_AddlMedThreshold", C.addlMedThreshold[status], "Additional Medicare Tax threshold — never indexed", "IRC 3101(b)(2)");
  K_("TX_NIITRate", 0.038, "Net investment income tax rate", "IRC 1411", ST.pctF);
  K_("TX_NIITThreshold", C.niitThreshold[status], "Net investment income tax threshold — never indexed", "IRC 1411");
  K.add({
    cells: [{
      t: "s",
      v: "Retirement",
      s: ST.sectionHdr
    }]
  });
  K_("TX_Deferral402g", C.deferral402g, "Elective deferral limit", "IRC 402(g)");
  K_("TX_Catchup50", C.catchup50, "Catch-up contribution, age 50 or older", "IRC 414(v)");
  K_("TX_SuperCatchup", C.superCatchup6063, "Catch-up contribution, ages 60 to 63", "SECURE 2.0 sec. 109");
  K_("TX_Limit415c", C.limit415c, "Annual additions limit", "IRC 415(c)");
  K_("TX_Limit415b", C.limit415b, "Defined benefit annual benefit limit", "IRC 415(b)");
  K_("TX_CompLimit", C.compLimit401a17, "Compensation limit", "IRC 401(a)(17)");
  K_("TX_SimpleDeferral", C.simpleDeferral, "SIMPLE salary reduction limit", "IRC 408(p)(2)(E)");
  K_("TX_SimpleCatchup", C.simpleCatchup, "SIMPLE catch-up", "IRC 414(v)(2)(B)(ii)");
  K_("TX_IRALimit", C.iraLimit, "IRA contribution limit", "IRC 219(b)(5)");
  K_("TX_IRACatchup", C.iraCatchup, "IRA catch-up", "IRC 219(b)(5)(B)");
  K_("TX_SEPRate", 0.25, "Statutory contribution rate for a SEP or profit-sharing plan", "IRC 404(h)(1)(C)", ST.pctF);
  K_("TX_SEPReduced", 0.20, "Reduced rate for a self-employed owner — r divided by 1 plus r", "Pub 560 rate table", ST.pctF);
  K.add({
    cells: [{
      t: "s",
      v: "Health",
      s: ST.sectionHdr
    }]
  });
  K_("TX_HSASelf", C.hsa.self, "HSA limit, self-only coverage", "IRC 223(b)");
  K_("TX_HSAFamily", C.hsa.family, "HSA limit, family coverage", "IRC 223(b)");
  K_("TX_HSACatchup", C.hsa.catchup55, "HSA catch-up, age 55 or older", "IRC 223(b)(3)(B)");
  K_("TX_MedicalFloor", 0.075, "Medical expense floor as a share of AGI", "IRC 213(a)", ST.pctF);
  C.ltcPremiumCap.forEach((band, i) => {
    K_("TX_LTCCap" + (i + 1), band[1], "Long-term care premium cap, through age " + (band[0] === 999 ? "and over 71" : band[0]), "IRC 213(d)(10)");
  });
  K.add({
    cells: [{
      t: "s",
      v: "Section 199A",
      s: ST.sectionHdr
    }]
  });
  K_("TX_QBIThreshold", C.qbiThreshold[status], "Threshold amount", "IRC 199A(e)(2)");
  K_("TX_QBIPhaseWidth", C.qbiPhaseInWidth[status], "Phase-in range width", "IRC 199A(b)(3)");
  K_("TX_QBIRate", 0.20, "Deduction percentage", "IRC 199A(a)", ST.pctF);
  K_("TX_QBIMinDeduction", C.qbiMinDeduction, "Minimum deduction for an active business", "OBBBA, first effective 2026");
  K_("TX_QBIMinFloor", C.qbiMinQBIFloor, "QBI required to reach the minimum deduction", "OBBBA");
  K.add({
    cells: [{
      t: "s",
      v: "Itemized deductions",
      s: ST.sectionHdr
    }]
  });
  K_("TX_SALTCap", C.saltCap[status], "State and local tax cap", "IRC 164(b)(6) as amended by OBBBA");
  K_("TX_SALTThreshold", C.saltThreshold[status], "MAGI at which the cap begins to phase down", "IRC 164(b)(6)");
  K_("TX_SALTFloor", C.saltFloor[status], "Floor below which the cap cannot fall", "IRC 164(b)(6)");
  K_("TX_SALTRate", C.saltPhaseRate, "Cap reduction per dollar of excess MAGI", "IRC 164(b)(6)", ST.pctF);
  K_("TX_CharityAGILimit", C.charityCashAGILimit, "AGI limit on cash contributions", "IRC 170(b)(1)(G)", ST.pctF);
  K_("TX_CharityFloor", C.charityAGIFloor, "Charitable floor as a share of AGI — 2026 onward", "IRC 170 as amended by OBBBA", ST.pctF);
  K_("TX_CharityNonItemizer", C.charityNonItemizer[status], "Charitable deduction for non-itemizers — 2026 onward", "IRC 170(p)");
  K_("TX_ItemizedHaircut", C.itemizedCapApplies ? 2 / 37 : 0, "Overall reduction of itemized deductions — 2026 onward", "IRC 68 as amended by OBBBA", ST.pctF);
  K_("TX_TopBracketStart", br[br.length - 1][0], "Start of the top bracket, used by the overall reduction", "Rev. Proc.");
  K.add({
    cells: [{
      t: "s",
      v: "Schedule 1-A — OBBBA 2025 to 2028",
      s: ST.sectionHdr
    }]
  });
  K_("TX_SeniorAmount", C.seniorDeduction.amount, "Senior deduction per qualifying individual", "OBBBA sec. 70103");
  K_("TX_SeniorThreshold", C.seniorDeduction.threshold[status], "Senior deduction MAGI threshold", "OBBBA sec. 70103");
  K_("TX_SeniorRate", C.seniorDeduction.rate, "Senior deduction phase-out rate per qualifying individual", "OBBBA sec. 70103", ST.pctF);
  K_("TX_TipsCap", C.tips.cap, "Qualified tips cap", "OBBBA sec. 70201");
  K_("TX_TipsThreshold", C.tips.threshold[status], "Qualified tips MAGI threshold", "OBBBA sec. 70201");
  K_("TX_OvertimeCap", C.overtime.cap[status], "Qualified overtime cap", "OBBBA sec. 70202");
  K_("TX_OvertimeThreshold", C.overtime.threshold[status], "Qualified overtime MAGI threshold", "OBBBA sec. 70202");
  K_("TX_AutoLoanCap", C.autoLoan.cap, "Car loan interest cap", "OBBBA sec. 70203");
  K_("TX_AutoLoanThreshold", C.autoLoan.threshold[status], "Car loan interest MAGI threshold", "OBBBA sec. 70203");
  K_("TX_S1AStepTips", 100, "Reduction per $1,000 or fraction of excess MAGI — tips and overtime", "OBBBA");
  K_("TX_S1AStepAuto", 200, "Reduction per $1,000 or fraction of excess MAGI — car loan interest", "OBBBA");
  K.add({
    cells: [{
      t: "s",
      v: "Credits",
      s: ST.sectionHdr
    }]
  });
  K_("TX_CTCAmount", C.ctc.amount, "Child tax credit per qualifying child", "IRC 24 as amended by OBBBA");
  K_("TX_CTCThreshold", C.ctc.threshold[status], "Child tax credit MAGI threshold — not indexed", "IRC 24(b)(1)");
  K_("TX_CTCStep", 50, "Reduction per $1,000 or fraction over the threshold", "IRC 24(b)(1)");
  sheets.push(K);

  /* --------------------------------------------------------------- INPUTS */
  const flat = scenarios.map(s => flattenScenario(s));
  const allKeys = [];
  const seen = {};
  flat.forEach(list => list.forEach(p => {
    if (!seen[p.key]) {
      seen[p.key] = 1;
      allKeys.push(p.key);
    }
  }));
  const IN = Sheet("Inputs", {
    cols: [46, 34].concat(scenarios.map(() => 17)),
    freeze: 3
  });
  IN.add({
    cells: [{
      t: "s",
      v: "Inputs — every raw figure, keyed for round-trip",
      s: ST.title
    }]
  });
  IN.add({
    cells: [{
      t: "s",
      v: "Edit any value in the scenario columns and the whole workbook recalculates. The app reads this sheet back on import; keep column B intact.",
      s: ST.small
    }]
  });
  IN.add({
    cells: [{
      t: "s",
      v: "Description",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Key (do not edit)",
      s: ST.colHdr
    }].concat(scenarios.map(s => ({
      t: "s",
      v: s.name,
      s: ST.colHdr
    })))
  });
  const inRow = {};
  allKeys.forEach(key => {
    const id = "in_" + key;
    IN.add({
      id,
      cells: [{
        t: "s",
        v: humanKey(key),
        s: ST.label
      }, {
        t: "s",
        v: key,
        s: ST.cite
      }].concat(flat.map(list => {
        const hit = list.find(p => p.key === key);
        if (!hit) return {
          v: "",
          s: ST.input
        };
        const v = hit.value;
        const isNum = typeof v === "number" || typeof v === "string" && v.trim() !== "" && isFinite(Number(v));
        return isNum ? {
          v: Number(v),
          s: ST.input
        } : {
          t: "s",
          v: String(v),
          s: ST.input
        };
      }))
    });
    inRow[key] = IN.rowOf(id);
  });
  sheets.push(IN);

  /* Cell reference to an input for scenario i; falls back to 0 when absent. */
  const IX = (key, i) => inRow[key] ? "Inputs!$" + SC(i) + "$" + inRow[key] : "0";
  const IXn = (key, i) => inRow[key] ? "N(" + IX(key, i) + ")" : "0";

  /* ----------------------------------------------------------- SCHEDULE C */
  const scC = Sheet("Schedule C", {
    cols: [46, 34].concat(scenarios.map(() => 17)),
    freeze: 3
  });
  scC.add({
    cells: [{
      t: "s",
      v: "Schedule C — profit or loss from business",
      s: ST.title
    }]
  });
  scC.add({
    cells: [{
      t: "s",
      v: "Line",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Authority",
      s: ST.colHdr
    }].concat(scenarios.map(s => ({
      t: "s",
      v: s.name,
      s: ST.colHdr
    })))
  });
  const maxBiz = Math.max(1, ...scenarios.map(s => (s.schedC.businesses || []).length));
  const bizNetIds = [];
  for (let b = 0; b < maxBiz; b++) {
    scC.add({
      cells: [{
        t: "s",
        v: "Business " + (b + 1),
        s: ST.sectionHdr
      }]
    });
    const g = "schedC.businesses." + b + ".";
    scC.add({
      cells: [{
        t: "s",
        v: "Gross receipts",
        s: ST.labelInd
      }, {
        t: "s",
        v: "Sch C line 1",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=" + IXn(g + "grossReceipts", i),
        v: num(((s.schedC.businesses || [])[b] || {}).grossReceipts),
        s: ST.moneyF
      })))
    });
    scC.add({
      cells: [{
        t: "s",
        v: "Returns and allowances",
        s: ST.labelInd
      }, {
        t: "s",
        v: "Sch C line 2",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=" + IXn(g + "returns", i),
        v: num(((s.schedC.businesses || [])[b] || {}).returns),
        s: ST.moneyF
      })))
    });
    scC.add({
      cells: [{
        t: "s",
        v: "Cost of goods sold",
        s: ST.labelInd
      }, {
        t: "s",
        v: "Sch C line 4",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=" + IXn(g + "cogs", i),
        v: num(((s.schedC.businesses || [])[b] || {}).cogs),
        s: ST.moneyF
      })))
    });
    const maxExp = Math.max(0, ...scenarios.map(s => (((s.schedC.businesses || [])[b] || {}).expenses || []).length));
    const expIds = [];
    for (let e = 0; e < maxExp; e++) {
      const id = "exp_" + b + "_" + e;
      const label = (() => {
        for (const s of scenarios) {
          const x = (((s.schedC.businesses || [])[b] || {}).expenses || [])[e];
          if (x && x.label) return x.label;
        }
        return "Expense " + (e + 1);
      })();
      scC.add({
        id,
        cells: [{
          t: "s",
          v: "  " + label,
          s: ST.labelInd
        }, {
          t: "s",
          v: "Sch C Part II",
          s: ST.cite
        }].concat(scenarios.map((s, i) => ({
          f: "=" + IXn(g + "expenses." + e + ".amount", i),
          v: num(((((s.schedC.businesses || [])[b] || {}).expenses || [])[e] || {}).amount),
          s: ST.moneyF
        })))
      });
      expIds.push(id);
    }
    const expTotId = "expt_" + b;
    scC.add({
      id: expTotId,
      cells: ref => [{
        t: "s",
        v: "Total expenses",
        s: ST.label
      }, {
        t: "s",
        v: "Sch C line 28",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: expIds.length ? "=" + expIds.map(x => ref(x, 3 + i)).join("+") : "=0",
        v: (((s.schedC.businesses || [])[b] || {}).expenses || []).reduce((a, x) => a + num(x.amount), 0),
        s: ST.moneyF
      })))
    });
    const netId = "biznet_" + b;
    scC.add({
      id: netId,
      cells: (ref, rn) => [{
        t: "s",
        v: "Net profit or loss — business " + (b + 1),
        s: ST.label
      }, {
        t: "s",
        v: "Sch C line 31",
        s: ST.cite
      }].concat(scenarios.map((s, i) => {
        const col = SC(i);
        return {
          f: "=" + col + (rn - 5 - maxExp) + "-" + col + (rn - 4 - maxExp) + "-" + col + (rn - 3 - maxExp) + "-" + ref(expTotId, 3 + i),
          v: businessNet((s.schedC.businesses || [])[b] || {
            grossReceipts: 0,
            returns: 0,
            cogs: 0,
            expenses: []
          }),
          s: ST.moneyBold
        };
      }))
    });
    bizNetIds.push(netId);
  }
  scC.blank();
  scC.add({
    id: "schedCTotal",
    cells: ref => [{
      t: "s",
      v: "Total Schedule C net profit",
      s: ST.label
    }, {
      t: "s",
      v: "Carries to Form 1040 and Schedule SE",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + bizNetIds.map(x => ref(x, 3 + i)).join("+"),
      v: results[i].r.schedC,
      s: ST.moneyGrand
    })))
  });
  addTieOut(scC, scenarios, results, r => r.schedC, "schedCTotal");
  sheets.push(scC);
  const SCHEDC = i => "'Schedule C'!$" + SC(i) + "$" + scC.rowOf("schedCTotal");

  /* ------------------------------------------------------- S CORPORATIONS */
  const maxSC = Math.max(0, ...scenarios.map(s => (s.sCorps && s.sCorps.entities || []).length));
  let SCK1 = null,
    SCCOMP = null,
    SCEMPFICA = null;
  if (maxSC > 0) {
    const sh = Sheet("S Corporations", {
      cols: [46, 34].concat(scenarios.map(() => 17)),
      freeze: 3
    });
    sh.add({
      cells: [{
        t: "s",
        v: "S corporations — compensation, derived K-1 and payroll tax",
        s: ST.title
      }]
    });
    sh.add({
      cells: [{
        t: "s",
        v: "The K-1 is derived, never entered: profit before owner compensation, less owner compensation, less the employer half of payroll tax, less other corporate expenses. The employer half is the corporation's expense and reduces the K-1 before anything reaches the return.",
        s: ST.small
      }]
    });
    sh.add({
      cells: [{
        t: "s",
        v: "Line",
        s: ST.colHdr
      }, {
        t: "s",
        v: "Authority",
        s: ST.colHdr
      }].concat(scenarios.map(s => ({
        t: "s",
        v: s.name,
        s: ST.colHdr
      })))
    });
    const k1Ids = [],
      compIds = [],
      empIds = [];
    for (let e = 0; e < maxSC; e++) {
      const nm = (() => {
        for (const s of scenarios) {
          const x = (s.sCorps && s.sCorps.entities || [])[e];
          if (x && x.name) return x.name;
        }
        return "S corporation " + (e + 1);
      })();
      sh.add({
        cells: [{
          t: "s",
          v: nm,
          s: ST.sectionHdr
        }]
      });
      const g = "sCorps.entities." + e + ".";
      const R = i => (scenarios[i].sCorps && scenarios[i].sCorps.entities || [])[e] || {};
      const D = i => (results[i].r.SCORPS || [])[e] || {};
      sh.add({
        id: "sc_p_" + e,
        cells: [{
          t: "s",
          v: "Profit before owner compensation",
          s: ST.labelInd
        }, {
          t: "s",
          v: "Form 1120-S, before officer compensation",
          s: ST.cite
        }].concat(scenarios.map((s, i) => ({
          f: "=" + IXn(g + "profitBeforeComp", i),
          v: num(R(i).profitBeforeComp),
          s: ST.moneyF
        })))
      });
      sh.add({
        id: "sc_c_" + e,
        cells: [{
          t: "s",
          v: "Owner reasonable compensation",
          s: ST.labelInd
        }, {
          t: "s",
          v: "W-2 box 1; leading S corporation audit issue",
          s: ST.cite
        }].concat(scenarios.map((s, i) => ({
          f: "=" + IXn(g + "ownerComp", i),
          v: num(R(i).ownerComp),
          s: ST.moneyF
        })))
      });
      sh.add({
        id: "sc_ef_" + e,
        cells: ref => [{
          t: "s",
          v: "Employer payroll tax",
          s: ST.labelInd
        }, {
          t: "s",
          v: "6.2% OASDI to the wage base plus 1.45% Medicare",
          s: ST.cite
        }].concat(scenarios.map((s, i) => ({
          f: "=IF(" + ref("sc_c_" + e, 3 + i) + ">0,MIN(" + ref("sc_c_" + e, 3 + i) + ",TX_SSWageBase)*0.062+" + ref("sc_c_" + e, 3 + i) + "*0.0145,0)",
          v: D(i).employerFICA,
          s: ST.moneyF
        })))
      });
      sh.add({
        id: "sc_oe_" + e,
        cells: [{
          t: "s",
          v: "Other corporate expenses",
          s: ST.labelInd
        }, {
          t: "s",
          v: "",
          s: ST.cite
        }].concat(scenarios.map((s, i) => ({
          f: "=" + IXn(g + "otherExpenses", i),
          v: num(R(i).otherExpenses),
          s: ST.moneyF
        })))
      });
      sh.add({
        id: "sc_k1_" + e,
        cells: ref => [{
          t: "s",
          v: "K-1 ordinary business income",
          s: ST.label
        }, {
          t: "s",
          v: "Schedule K-1 box 1, allocated by ownership",
          s: ST.cite
        }].concat(scenarios.map((s, i) => ({
          f: "=(" + ref("sc_p_" + e, 3 + i) + "-" + ref("sc_c_" + e, 3 + i) + "-" + ref("sc_ef_" + e, 3 + i) + "-" + ref("sc_oe_" + e, 3 + i) + ")*" + "(" + (R(i).ownershipPct == null ? 100 : num(R(i).ownershipPct)) + "/100)",
          v: D(i).k1,
          s: ST.moneyBold
        })))
      });
      sh.add({
        id: "sc_w2_" + e,
        cells: ref => [{
          t: "s",
          v: "§199A W-2 wages",
          s: ST.labelInd
        }, {
          t: "s",
          v: "Owner compensation plus non-owner wages",
          s: ST.cite
        }].concat(scenarios.map((s, i) => ({
          f: "=(" + ref("sc_c_" + e, 3 + i) + "+" + IXn(g + "nonOwnerW2", i) + ")*(" + (R(i).ownershipPct == null ? 100 : num(R(i).ownershipPct)) + "/100)",
          v: D(i).qbiW2,
          s: ST.moneyF
        })))
      });
      k1Ids.push("sc_k1_" + e);
      compIds.push("sc_c_" + e);
      empIds.push("sc_ef_" + e);
    }
    sh.blank();
    sh.add({
      id: "sc_totcomp",
      cells: ref => [{
        t: "s",
        v: "Total owner compensation",
        s: ST.label
      }, {
        t: "s",
        v: "To Form 1040 line 1z",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=" + compIds.map(x => ref(x, 3 + i)).join("+"),
        v: results[i].r.scorpComp,
        s: ST.moneyGrand
      })))
    });
    sh.add({
      id: "sc_totk1",
      cells: ref => [{
        t: "s",
        v: "Total K-1 ordinary business income",
        s: ST.label
      }, {
        t: "s",
        v: "To Schedule E and Form 1040",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=" + k1Ids.map(x => ref(x, 3 + i)).join("+"),
        v: results[i].r.scorpK1,
        s: ST.moneyGrand
      })))
    });
    sh.add({
      id: "sc_totemp",
      cells: ref => [{
        t: "s",
        v: "Total employer payroll tax",
        s: ST.label
      }, {
        t: "s",
        v: "Corporate expense; already deducted in the K-1 above",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=" + empIds.map(x => ref(x, 3 + i)).join("+"),
        v: results[i].r.employerFICA,
        s: ST.moneyBold
      })))
    });
    sh.add({
      id: "sc_totee",
      cells: ref => [{
        t: "s",
        v: "Total employee payroll tax",
        s: ST.label
      }, {
        t: "s",
        v: "Withheld from the owner's wages",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=" + ref("sc_totemp", 3 + i),
        v: results[i].r.employeeFICA,
        s: ST.moneyBold
      })))
    });
    addTieOut(sh, scenarios, results, r => r.scorpK1, "sc_totk1");
    sheets.push(sh);
    SCK1 = i => "'S Corporations'!$" + SC(i) + "$" + sh.rowOf("sc_totk1");
    SCCOMP = i => "'S Corporations'!$" + SC(i) + "$" + sh.rowOf("sc_totcomp");
    SCEMPFICA = i => "'S Corporations'!$" + SC(i) + "$" + sh.rowOf("sc_totemp");
  }

  /* ---------------------------------------------------------- SCHEDULE SE */
  const se = Sheet("Schedule SE", {
    cols: [46, 34].concat(scenarios.map(() => 17)),
    freeze: 3
  });
  se.add({
    cells: [{
      t: "s",
      v: "Schedule SE — self-employment tax",
      s: ST.title
    }]
  });
  se.add({
    cells: [{
      t: "s",
      v: "Line",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Authority",
      s: ST.colHdr
    }].concat(scenarios.map(s => ({
      t: "s",
      v: s.name,
      s: ST.colHdr
    })))
  });
  se.add({
    id: "se_net",
    cells: [{
      t: "s",
      v: "Net profit from Schedule C",
      s: ST.label
    }, {
      t: "s",
      v: "Sch SE line 2",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + SCHEDC(i),
      v: results[i].r.schedC,
      s: ST.moneyF
    })))
  });
  se.add({
    id: "se_netearn",
    cells: ref => [{
      t: "s",
      v: "Net earnings from self-employment",
      s: ST.label
    }, {
      t: "s",
      v: "Sch SE line 4a — 92.35%",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0," + ref("se_net", 3 + i) + ")*TX_SEFactor",
      v: results[i].r.SE.netSE,
      s: ST.moneyF
    })))
  });
  se.add({
    id: "se_wages",
    cells: [{
      t: "s",
      v: "W-2 Social Security wages already taxed",
      s: ST.label
    }, {
      t: "s",
      v: "Sch SE line 8a",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MIN(" + IXn("w2Wages", i) + "+" + IXn("sCorpComp", i) + ",TX_SSWageBase)",
      v: Math.min(num(s.w2Wages) + num(s.sCorpComp), C.ssWageBase),
      s: ST.moneyF
    })))
  });
  se.add({
    id: "se_baseleft",
    cells: ref => [{
      t: "s",
      v: "Wage base remaining",
      s: ST.label
    }, {
      t: "s",
      v: "Sch SE line 9",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0,TX_SSWageBase-" + ref("se_wages", 3 + i) + ")",
      v: results[i].r.SE.ssBaseRemaining,
      s: ST.moneyF
    })))
  });
  se.add({
    id: "se_ss",
    cells: ref => [{
      t: "s",
      v: "Social Security portion",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 1401(a) — 12.4%",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=IF(" + ref("se_netearn", 3 + i) + "<400,0,MIN(" + ref("se_netearn", 3 + i) + "," + ref("se_baseleft", 3 + i) + ")*TX_OASDIRate)",
      v: results[i].r.SE.ss,
      s: ST.moneyF
    })))
  });
  se.add({
    id: "se_med",
    cells: ref => [{
      t: "s",
      v: "Medicare portion",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 1401(b) — 2.9%, uncapped",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=IF(" + ref("se_netearn", 3 + i) + "<400,0," + ref("se_netearn", 3 + i) + "*TX_MedicareRate)",
      v: results[i].r.SE.medicare,
      s: ST.moneyF
    })))
  });
  se.add({
    id: "se_total",
    cells: ref => [{
      t: "s",
      v: "Self-employment tax",
      s: ST.label
    }, {
      t: "s",
      v: "Sch SE line 12",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + ref("se_ss", 3 + i) + "+" + ref("se_med", 3 + i),
      v: results[i].r.SE.total,
      s: ST.moneyBold
    })))
  });
  se.add({
    id: "se_half",
    cells: ref => [{
      t: "s",
      v: "Deductible half of self-employment tax",
      s: ST.label
    }, {
      t: "s",
      v: "Sch SE line 13, IRC 164(f)",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + ref("se_total", 3 + i) + "*0.5",
      v: results[i].r.SE.halfDeduction,
      s: ST.moneyF
    })))
  });
  se.blank();
  se.add({
    cells: [{
      t: "s",
      v: "Additional Medicare Tax",
      s: ST.sectionHdr
    }]
  });
  se.add({
    id: "am_redthr",
    cells: [{
      t: "s",
      v: "Threshold reduced by wages, not below zero",
      s: ST.labelInd
    }, {
      t: "s",
      v: "IRC 1401(b)(2)(B)",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0,TX_AddlMedThreshold-(" + IXn("w2Wages", i) + "+" + IXn("sCorpComp", i) + "))",
      v: results[i].r.AM.reducedThreshold,
      s: ST.moneyF
    })))
  });
  se.add({
    id: "am_total",
    cells: ref => [{
      t: "s",
      v: "Additional Medicare Tax",
      s: ST.label
    }, {
      t: "s",
      v: "Form 8959 — 0.9%",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0,(" + IXn("w2Wages", i) + "+" + IXn("sCorpComp", i) + ")-TX_AddlMedThreshold)*TX_AddlMedRate+MAX(0," + ref("se_netearn", 3 + i) + "-" + ref("am_redthr", 3 + i) + ")*TX_AddlMedRate",
      v: results[i].r.AM.total,
      s: ST.moneyBold
    })))
  });
  addTieOut(se, scenarios, results, r => r.SE.total + r.AM.total, "se_total", "se_total + Additional Medicare");
  sheets.push(se);
  const SEHALF = i => "'Schedule SE'!$" + SC(i) + "$" + se.rowOf("se_half");
  const SENET = i => "'Schedule SE'!$" + SC(i) + "$" + se.rowOf("se_netearn");

  /* ----------------------------------------------------------- RETIREMENT */
  const ret = Sheet("Retirement", {
    cols: [46, 34].concat(scenarios.map(() => 17)),
    freeze: 3
  });
  ret.add({
    cells: [{
      t: "s",
      v: "Self-employed retirement plan — maximum deductible contribution",
      s: ST.title
    }]
  });
  ret.add({
    cells: [{
      t: "s",
      v: "The 25% statutory rate resolves to 20% of the base because the contribution reduces the compensation it is measured against. The base is net profit less half the self-employment tax.",
      s: ST.small
    }]
  });
  ret.add({
    cells: [{
      t: "s",
      v: "Line",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Authority",
      s: ST.colHdr
    }].concat(scenarios.map(s => ({
      t: "s",
      v: s.name,
      s: ST.colHdr
    })))
  });
  ret.add({
    id: "rt_base",
    cells: [{
      t: "s",
      v: "Base — net profit less half SE tax",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 404(a)(8)(C), Pub 560",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0," + SCHEDC(i) + "-" + SEHALF(i) + ")",
      v: results[i].r.RET.base,
      s: ST.moneyBold
    })))
  });
  ret.add({
    id: "rt_age",
    cells: [{
      t: "s",
      v: "Owner age at year end",
      s: ST.label
    }, {
      t: "s",
      v: "Drives the catch-up",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + IXn("planning.age", i),
      v: num(s.planning.age),
      s: ST.money
    })))
  });
  ret.add({
    id: "rt_catch",
    cells: ref => [{
      t: "s",
      v: "Catch-up available",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 414(v); ages 60-63 replace, not add",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=IF(AND(" + ref("rt_age", 3 + i) + ">=60," + ref("rt_age", 3 + i) + "<=63),TX_SuperCatchup,IF(" + ref("rt_age", 3 + i) + ">=50,TX_Catchup50,0))",
      v: results[i].r.RET.catchUpApplied,
      s: ST.moneyF
    })))
  });
  ret.blank();
  ret.add({
    cells: [{
      t: "s",
      v: "Maximum deductible contribution by plan design",
      s: ST.sectionHdr
    }]
  });
  ret.add({
    id: "rt_sep",
    cells: ref => [{
      t: "s",
      v: "SEP IRA",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 404(h)(1)(C), 415(c)",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MIN(" + ref("rt_base", 3 + i) + "*TX_SEPReduced,TX_SEPRate*TX_CompLimit,TX_Limit415c," + ref("rt_base", 3 + i) + ")",
      v: (results[i].r.RET.options.find(o => o.id === "sep") || {}).total,
      s: ST.moneyF
    })))
  });
  ret.add({
    id: "rt_solo_def",
    cells: ref => [{
      t: "s",
      v: "Solo 401(k) — elective deferral",
      s: ST.labelInd
    }, {
      t: "s",
      v: "IRC 402(g)",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MIN(TX_Deferral402g," + ref("rt_base", 3 + i) + ")",
      v: (results[i].r.RET.options.find(o => o.id === "solo401k") || {}).employee,
      s: ST.moneyF
    })))
  });
  ret.add({
    id: "rt_solo_emp",
    cells: ref => [{
      t: "s",
      v: "Solo 401(k) — employer profit share",
      s: ST.labelInd
    }, {
      t: "s",
      v: "IRC 415(c); catch-up sits outside the limit",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MIN(" + ref("rt_base", 3 + i) + "*TX_SEPReduced,TX_SEPRate*TX_CompLimit,MAX(0,MIN(TX_Limit415c," + ref("rt_base", 3 + i) + ")-" + ref("rt_solo_def", 3 + i) + "))",
      v: (results[i].r.RET.options.find(o => o.id === "solo401k") || {}).employer,
      s: ST.moneyF
    })))
  });
  ret.add({
    id: "rt_solo",
    cells: ref => [{
      t: "s",
      v: "Solo 401(k) — total",
      s: ST.label
    }, {
      t: "s",
      v: "Capped at earned income",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MIN(" + ref("rt_solo_def", 3 + i) + "+" + ref("rt_solo_emp", 3 + i) + "+" + ref("rt_catch", 3 + i) + "," + ref("rt_base", 3 + i) + ")",
      v: (results[i].r.RET.options.find(o => o.id === "solo401k") || {}).total,
      s: ST.moneyBold
    })))
  });
  ret.add({
    id: "rt_simple3",
    cells: ref => [{
      t: "s",
      v: "SIMPLE IRA — 3% match",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 408(p)(2)(A)(iii); no 401(a)(17) cap on the match",
      s: ST.cite
    }].concat(scenarios.map((s, i) => {
      const b = ref("rt_base", 3 + i);
      const def = "MIN(TX_SimpleDeferral," + b + ")";
      const cu = "MIN(IF(" + ref("rt_age", 3 + i) + ">=50,TX_SimpleCatchup,0),MAX(0," + b + "-" + def + "))";
      return {
        f: "=MIN(" + def + "+MIN(0.03*" + b + "," + def + "+" + cu + ")+" + cu + "," + b + ")",
        v: (results[i].r.RET.options.find(o => o.id === "simple3") || {}).total,
        s: ST.moneyF
      };
    }))
  });
  ret.add({
    id: "rt_simple2",
    cells: ref => [{
      t: "s",
      v: "SIMPLE IRA — 2% nonelective",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 408(p)(2)(B); 401(a)(17) cap applies",
      s: ST.cite
    }].concat(scenarios.map((s, i) => {
      const b = ref("rt_base", 3 + i);
      const def = "MIN(TX_SimpleDeferral," + b + ")";
      const cu = "MIN(IF(" + ref("rt_age", 3 + i) + ">=50,TX_SimpleCatchup,0),MAX(0," + b + "-" + def + "))";
      return {
        f: "=MIN(" + def + "+0.02*MIN(" + b + ",TX_CompLimit)+" + cu + "," + b + ")",
        v: (results[i].r.RET.options.find(o => o.id === "simple2") || {}).total,
        s: ST.moneyF
      };
    }))
  });
  ret.blank();
  ret.add({
    id: "rt_applied",
    cells: [{
      t: "s",
      v: "Contribution applied in this scenario",
      s: ST.label
    }, {
      t: "s",
      v: "Schedule 1 line 16",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      v: results[i].r.retirementDeduction,
      s: ST.moneyGrand
    })))
  });
  ret.add({
    cells: [{
      t: "s",
      v: "Plan selected",
      s: ST.labelInd
    }, {
      t: "s",
      v: "",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      t: "s",
      v: results[i].r.selectedPlan ? results[i].r.selectedPlan.name : "None",
      s: ST.label
    })))
  });
  sheets.push(ret);
  const RETAPP = i => "Retirement!$" + SC(i) + "$" + ret.rowOf("rt_applied");

  /* ----------------------------------------------- SEHI, HSA, IRA, SCH 1-A */
  const adj = Sheet("Adjustments", {
    cols: [46, 34].concat(scenarios.map(() => 17)),
    freeze: 3
  });
  adj.add({
    cells: [{
      t: "s",
      v: "Above-the-line adjustments and Schedule 1-A",
      s: ST.title
    }]
  });
  adj.add({
    cells: [{
      t: "s",
      v: "Line",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Authority",
      s: ST.colHdr
    }].concat(scenarios.map(s => ({
      t: "s",
      v: s.name,
      s: ST.colHdr
    })))
  });
  adj.add({
    cells: [{
      t: "s",
      v: "Self-employed health insurance — IRC 162(l)",
      s: ST.sectionHdr
    }]
  });
  adj.add({
    id: "ad_prem",
    cells: [{
      t: "s",
      v: "Medical and dental premiums",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Form 7206",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + IXn("sehi.medicalPremiums", i),
      v: num(s.sehi.medicalPremiums),
      s: ST.moneyF
    })))
  });
  adj.add({
    id: "ad_ltc",
    cells: [{
      t: "s",
      v: "Long-term care premiums allowed after age caps",
      s: ST.labelInd
    }, {
      t: "s",
      v: "IRC 213(d)(10)",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      v: results[i].r.SEHI.ltcAllowed,
      s: ST.money
    })))
  });
  adj.add({
    id: "ad_earn",
    cells: [{
      t: "s",
      v: "Earned income limit",
      s: ST.labelInd
    }, {
      t: "s",
      v: "IRC 162(l)(2)(A) — after half SE tax and the retirement deduction",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0," + SCHEDC(i) + "-" + SEHALF(i) + "-" + RETAPP(i) + ")",
      v: results[i].r.SEHI.earnedIncome,
      s: ST.moneyF
    })))
  });
  adj.add({
    id: "ad_sehi",
    cells: ref => [{
      t: "s",
      v: "Deduction allowed",
      s: ST.label
    }, {
      t: "s",
      v: "Schedule 1 line 17",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MIN((" + ref("ad_prem", 3 + i) + "+" + ref("ad_ltc", 3 + i) + ")*" + N(results[i].r.SEHI.eligibleMonths / 12) + "," + ref("ad_earn", 3 + i) + ")",
      v: results[i].r.sehiDeduction,
      s: ST.moneyBold
    })))
  });
  adj.add({
    cells: [{
      t: "s",
      v: "Health savings account — IRC 223",
      s: ST.sectionHdr
    }]
  });
  adj.add({
    id: "ad_hsa",
    cells: [{
      t: "s",
      v: "HSA contribution",
      s: ST.label
    }, {
      t: "s",
      v: "Form 8889, Schedule 1 line 13",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MIN(" + N(results[i].r.hsa) + ",IF(" + IXn("planning.hsaCoverage", i) + "=\"family\",TX_HSAFamily,TX_HSASelf)+IF(" + IXn("planning.age", i) + ">=55,TX_HSACatchup,0))",
      v: results[i].r.hsa,
      s: ST.moneyF
    })))
  });
  adj.add({
    id: "ad_ira",
    cells: [{
      t: "s",
      v: "IRA deduction",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 219(g), Schedule 1 line 20",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      v: results[i].r.iraDeduction,
      s: ST.money
    })))
  });
  adj.add({
    id: "ad_other",
    cells: [{
      t: "s",
      v: "Other Schedule 1 adjustments",
      s: ST.label
    }, {
      t: "s",
      v: "Student loan, educator, alimony",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + IXn("schedule1.studentLoanInterest", i) + "+" + IXn("schedule1.educatorExpenses", i) + "+" + IXn("schedule1.earlyWithdrawalPenalty", i) + "+" + IXn("schedule1.alimonyPaid", i) + "+" + IXn("schedule1.otherAdjustments", i),
      v: results[i].r.s1AdjOther,
      s: ST.moneyF
    })))
  });
  adj.add({
    id: "ad_total",
    cells: ref => [{
      t: "s",
      v: "Total adjustments to income",
      s: ST.label
    }, {
      t: "s",
      v: "Schedule 1 line 26",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + SEHALF(i) + "+" + RETAPP(i) + "+" + ref("ad_sehi", 3 + i) + "+" + ref("ad_hsa", 3 + i) + "+" + ref("ad_ira", 3 + i) + "+" + ref("ad_other", 3 + i),
      v: results[i].r.adjustments,
      s: ST.moneyGrand
    })))
  });
  adj.add({
    cells: [{
      t: "s",
      v: "Schedule 1-A — below the line, does not reduce AGI",
      s: ST.sectionHdr
    }]
  });
  adj.add({
    id: "s1a_senior",
    cells: [{
      t: "s",
      v: "Senior deduction",
      s: ST.labelInd
    }, {
      t: "s",
      v: "OBBBA sec. 70103 — 6% per qualifying individual",
      s: ST.cite
    }].concat(scenarios.map((s, i) => {
      const cnt = Math.min(num(s.sched1A.seniorCount), status === "mfj" ? 2 : 1);
      return {
        f: "=MAX(0,TX_SeniorAmount*" + cnt + "-TX_SeniorRate*MAX(0,'Form 1040'!$" + SC(i) + "$" + "AGIROW" + "-TX_SeniorThreshold)*" + cnt + ")",
        v: results[i].r.S1A.senior,
        s: ST.moneyF,
        _needsAGI: true
      };
    }))
  });
  adj.add({
    id: "s1a_tips",
    cells: [{
      t: "s",
      v: "Qualified tips",
      s: ST.labelInd
    }, {
      t: "s",
      v: "OBBBA sec. 70201 — $100 per $1,000 or fraction",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      v: results[i].r.S1A.tips,
      s: ST.money
    })))
  });
  adj.add({
    id: "s1a_ot",
    cells: [{
      t: "s",
      v: "Qualified overtime premium",
      s: ST.labelInd
    }, {
      t: "s",
      v: "OBBBA sec. 70202",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      v: results[i].r.S1A.overtime,
      s: ST.money
    })))
  });
  adj.add({
    id: "s1a_auto",
    cells: [{
      t: "s",
      v: "Car loan interest",
      s: ST.labelInd
    }, {
      t: "s",
      v: "OBBBA sec. 70203 — $200 per $1,000 or fraction",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      v: results[i].r.S1A.autoLoan,
      s: ST.money
    })))
  });
  adj.add({
    id: "s1a_total",
    cells: ref => [{
      t: "s",
      v: "Total Schedule 1-A",
      s: ST.label
    }, {
      t: "s",
      v: "Form 1040 line 13b",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + ref("s1a_senior", 3 + i) + "+" + ref("s1a_tips", 3 + i) + "+" + ref("s1a_ot", 3 + i) + "+" + ref("s1a_auto", 3 + i),
      v: results[i].r.sched1ATotal,
      s: ST.moneyBold
    })))
  });
  sheets.push(adj);
  const ADJTOT = i => "Adjustments!$" + SC(i) + "$" + adj.rowOf("ad_total");
  const S1ATOT = i => "Adjustments!$" + SC(i) + "$" + adj.rowOf("s1a_total");

  /* ----------------------------------------------------------- SCHEDULE A */
  const schA = Sheet("Schedule A", {
    cols: [46, 34].concat(scenarios.map(() => 17)),
    freeze: 3
  });
  schA.add({
    cells: [{
      t: "s",
      v: "Schedule A — itemized deductions",
      s: ST.title
    }]
  });
  schA.add({
    cells: [{
      t: "s",
      v: "Line",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Authority",
      s: ST.colHdr
    }].concat(scenarios.map(s => ({
      t: "s",
      v: s.name,
      s: ST.colHdr
    })))
  });
  const AGIREF = i => "'Form 1040'!$" + SC(i) + "$AGI"; // patched after Form 1040 is built

  schA.add({
    id: "sa_medraw",
    cells: [{
      t: "s",
      v: "Medical and dental expenses",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Sch A line 1",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      v: (s.scheduleA.medical || []).reduce((a, x) => a + num(x.amount), 0),
      s: ST.money
    })))
  });
  schA.add({
    id: "sa_med",
    cells: ref => [{
      t: "s",
      v: "Medical after the 7.5% AGI floor",
      s: ST.label
    }, {
      t: "s",
      v: "Sch A line 4, IRC 213(a)",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0," + ref("sa_medraw", 3 + i) + "-TX_MedicalFloor*" + AGIREF(i) + ")",
      v: results[i].r.A.medical,
      s: ST.moneyF
    })))
  });
  schA.add({
    id: "sa_saltraw",
    cells: [{
      t: "s",
      v: "State and local taxes paid",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Sch A lines 5a-5d",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + IXn("scheduleA.stateIncomeTax", i) + "+" + IXn("scheduleA.realEstateTax", i) + "+" + IXn("scheduleA.personalPropertyTax", i) + "+" + IXn("scheduleA.salesTax", i),
      v: results[i].r.A.saltRaw,
      s: ST.moneyF
    })))
  });
  schA.add({
    id: "sa_saltcap",
    cells: [{
      t: "s",
      v: "SALT cap after the MAGI phase-down",
      s: ST.labelInd
    }, {
      t: "s",
      v: "IRC 164(b)(6) — 30 cents per dollar, floored",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(TX_SALTFloor,TX_SALTCap-TX_SALTRate*MAX(0," + AGIREF(i) + "-TX_SALTThreshold))",
      v: results[i].r.A.saltCap,
      s: ST.moneyF
    })))
  });
  schA.add({
    id: "sa_salt",
    cells: ref => [{
      t: "s",
      v: "SALT allowed",
      s: ST.label
    }, {
      t: "s",
      v: "Sch A line 5e",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MIN(" + ref("sa_saltraw", 3 + i) + "," + ref("sa_saltcap", 3 + i) + ")",
      v: results[i].r.A.salt,
      s: ST.moneyF
    })))
  });
  schA.add({
    id: "sa_int",
    cells: [{
      t: "s",
      v: "Interest paid",
      s: ST.label
    }, {
      t: "s",
      v: "Sch A lines 8-9",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + IXn("scheduleA.mortgageInterest", i) + "+" + IXn("scheduleA.points", i) + "+" + IXn("scheduleA.investmentInterest", i),
      v: results[i].r.A.interest,
      s: ST.moneyF
    })))
  });
  schA.add({
    id: "sa_charraw",
    cells: [{
      t: "s",
      v: "Charitable contributions before limits",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Sch A line 11-13",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + IXn("scheduleA.charityCash", i) + "+" + IXn("scheduleA.charityNonCash", i) + "+" + IXn("scheduleA.charityCarryover", i),
      v: num(s.scheduleA.charityCash) + num(s.scheduleA.charityNonCash) + num(s.scheduleA.charityCarryover),
      s: ST.moneyF
    })))
  });
  schA.add({
    id: "sa_char",
    cells: ref => [{
      t: "s",
      v: "Charitable after the AGI limit and the 0.5% floor",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 170 as amended by OBBBA",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0,MIN(" + ref("sa_charraw", 3 + i) + ",TX_CharityAGILimit*MAX(0," + AGIREF(i) + "))-TX_CharityFloor*MAX(0," + AGIREF(i) + "))",
      v: results[i].r.A.charity,
      s: ST.moneyF
    })))
  });
  schA.add({
    id: "sa_other",
    cells: [{
      t: "s",
      v: "Other itemized deductions",
      s: ST.label
    }, {
      t: "s",
      v: "Sch A line 16",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      v: results[i].r.A.other,
      s: ST.money
    })))
  });
  schA.add({
    id: "sa_before",
    cells: ref => [{
      t: "s",
      v: "Itemized deductions before the overall limit",
      s: ST.label
    }, {
      t: "s",
      v: "",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + ["sa_med", "sa_salt", "sa_int", "sa_char", "sa_other"].map(x => ref(x, 3 + i)).join("+"),
      v: results[i].r.A.beforeCap,
      s: ST.moneyBold
    })))
  });
  schA.add({
    id: "sa_haircut",
    cells: ref => [{
      t: "s",
      v: "Less the overall reduction — 2 divided by 37",
      s: ST.labelInd
    }, {
      t: "s",
      v: "IRC 68 as amended by OBBBA",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=TX_ItemizedHaircut*MIN(" + ref("sa_before", 3 + i) + ",MAX(0," + AGIREF(i) + "-" + S1ATOT(i) + "-'Form 1040'!$" + SC(i) + "$QBI-TX_TopBracketStart))",
      v: results[i].r.A.reduction,
      s: ST.moneyF
    })))
  });
  schA.add({
    id: "sa_total",
    cells: ref => [{
      t: "s",
      v: "Total itemized deductions",
      s: ST.label
    }, {
      t: "s",
      v: "Sch A line 17",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0," + ref("sa_before", 3 + i) + "-" + ref("sa_haircut", 3 + i) + ")",
      v: results[i].r.A.total,
      s: ST.moneyGrand
    })))
  });
  addTieOut(schA, scenarios, results, r => r.A.total, "sa_total");
  sheets.push(schA);
  const SATOT = i => "'Schedule A'!$" + SC(i) + "$" + schA.rowOf("sa_total");

  /* ------------------------------------------------------------------ QBI */
  const qb = Sheet("QBI 199A", {
    cols: [46, 34].concat(scenarios.map(() => 17)),
    freeze: 3
  });
  qb.add({
    cells: [{
      t: "s",
      v: "Qualified business income deduction — IRC 199A",
      s: ST.title
    }]
  });
  qb.add({
    cells: [{
      t: "s",
      v: "Line",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Authority",
      s: ST.colHdr
    }].concat(scenarios.map(s => ({
      t: "s",
      v: s.name,
      s: ST.colHdr
    })))
  });
  qb.add({
    id: "qb_ti",
    cells: [{
      t: "s",
      v: "Taxable income before the 199A deduction",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 199A(e)(1)",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "='Form 1040'!$" + SC(i) + "$TIBQ",
      v: results[i].r.tiBeforeQBI,
      s: ST.moneyF
    })))
  });
  qb.add({
    id: "qb_ratio",
    cells: ref => [{
      t: "s",
      v: "Phase-in ratio",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 199A(b)(3)(B)",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MIN(1,MAX(0," + ref("qb_ti", 3 + i) + "-TX_QBIThreshold)/TX_QBIPhaseWidth)",
      v: Math.min(1, clamp0(results[i].r.tiBeforeQBI - C.qbiThreshold[status]) / C.qbiPhaseInWidth[status]),
      s: ST.pctF
    })))
  });
  const maxEnt = Math.max(1, ...scenarios.map(s => (s.qbi.entities || []).length));
  const entComp = [];
  for (let e = 0; e < maxEnt; e++) {
    const nm = (() => {
      for (const s of scenarios) {
        const x = (s.qbi.entities || [])[e];
        if (x && x.name) return x.name;
      }
      return "Entity " + (e + 1);
    })();
    qb.add({
      cells: [{
        t: "s",
        v: "Entity " + (e + 1) + " — " + nm,
        s: ST.sectionHdr
      }]
    });
    const g = "qbi.entities." + e + ".";
    qb.add({
      id: "qe_inc_" + e,
      cells: [{
        t: "s",
        v: "Qualified business income",
        s: ST.labelInd
      }, {
        t: "s",
        v: "IRC 199A(c)",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=" + IXn(g + "income", i),
        v: num(((s.qbi.entities || [])[e] || {}).income),
        s: ST.moneyF
      })))
    });
    qb.add({
      id: "qe_w2_" + e,
      cells: [{
        t: "s",
        v: "W-2 wages",
        s: ST.labelInd
      }, {
        t: "s",
        v: "IRC 199A(b)(4)",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=" + IXn(g + "w2", i),
        v: num(((s.qbi.entities || [])[e] || {}).w2),
        s: ST.moneyF
      })))
    });
    qb.add({
      id: "qe_ub_" + e,
      cells: [{
        t: "s",
        v: "UBIA of qualified property",
        s: ST.labelInd
      }, {
        t: "s",
        v: "IRC 199A(b)(6)",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=" + IXn(g + "ubia", i),
        v: num(((s.qbi.entities || [])[e] || {}).ubia),
        s: ST.moneyF
      })))
    });
    qb.add({
      id: "qe_pct_" + e,
      cells: ref => [{
        t: "s",
        v: "SSTB applicable percentage",
        s: ST.labelInd
      }, {
        t: "s",
        v: "IRC 199A(d)(3)",
        s: ST.cite
      }].concat(scenarios.map((s, i) => {
        const isS = !!((s.qbi.entities || [])[e] || {}).sstb;
        return {
          f: isS ? "=1-" + ref("qb_ratio", 3 + i) : "=1",
          v: isS ? 1 - Math.min(1, clamp0(results[i].r.tiBeforeQBI - C.qbiThreshold[status]) / C.qbiPhaseInWidth[status]) : 1,
          s: ST.pctF
        };
      }))
    });
    qb.add({
      id: "qe_tent_" + e,
      cells: ref => [{
        t: "s",
        v: "20% of QBI",
        s: ST.labelInd
      }, {
        t: "s",
        v: "IRC 199A(b)(2)(A)",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=TX_QBIRate*" + ref("qe_inc_" + e, 3 + i) + "*" + ref("qe_pct_" + e, 3 + i),
        v: null,
        s: ST.moneyF
      })))
    });
    qb.add({
      id: "qe_wl_" + e,
      cells: ref => [{
        t: "s",
        v: "Wage and UBIA limit",
        s: ST.labelInd
      }, {
        t: "s",
        v: "IRC 199A(b)(2)(B) — greater of 50% wages or 25% wages plus 2.5% UBIA",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=MAX(0.5*" + ref("qe_w2_" + e, 3 + i) + "*" + ref("qe_pct_" + e, 3 + i) + ",0.25*" + ref("qe_w2_" + e, 3 + i) + "*" + ref("qe_pct_" + e, 3 + i) + "+0.025*" + ref("qe_ub_" + e, 3 + i) + "*" + ref("qe_pct_" + e, 3 + i) + ")",
        v: null,
        s: ST.moneyF
      })))
    });
    qb.add({
      id: "qe_comp_" + e,
      cells: ref => [{
        t: "s",
        v: "Component after the ratable phase-in",
        s: ST.label
      }, {
        t: "s",
        v: "IRC 199A(b)(3)(B) steps 1 to 5",
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=MAX(0," + ref("qe_tent_" + e, 3 + i) + "-MAX(0," + ref("qe_tent_" + e, 3 + i) + "-" + ref("qe_wl_" + e, 3 + i) + ")*" + ref("qb_ratio", 3 + i) + ")",
        v: ((results[i].r.qbi.entities || [])[e] || {}).r ? results[i].r.qbi.entities[e].r.component : 0,
        s: ST.moneyBold
      })))
    });
    entComp.push("qe_comp_" + e);
  }
  qb.blank();
  qb.add({
    id: "qb_comp",
    cells: ref => [{
      t: "s",
      v: "Combined 199A component",
      s: ST.label
    }, {
      t: "s",
      v: "",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + entComp.map(x => ref(x, 3 + i)).join("+"),
      v: results[i].r.qbi.component,
      s: ST.moneyF
    })))
  });
  qb.add({
    id: "qb_cap",
    cells: ref => [{
      t: "s",
      v: "20% of taxable income net of capital gain",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 199A(a)(1)(B)",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=TX_QBIRate*MAX(0," + ref("qb_ti", 3 + i) + "-" + N(clamp0(num(s.longTermGains)) + clamp0(num(s.qualifiedDividends))) + ")",
      v: results[i].r.qbi.cap,
      s: ST.moneyF
    })))
  });
  qb.add({
    id: "qb_ded",
    cells: ref => [{
      t: "s",
      v: "QBI deduction allowed",
      s: ST.label
    }, {
      t: "s",
      v: "Form 8995 / 8995-A",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MIN(" + ref("qb_comp", 3 + i) + "," + ref("qb_cap", 3 + i) + ")",
      v: results[i].r.qbi.deduction,
      s: ST.moneyGrand
    })))
  });
  addTieOut(qb, scenarios, results, r => r.qbi.deduction, "qb_ded");
  sheets.push(qb);
  const QBIDED = i => "'QBI 199A'!$" + SC(i) + "$" + qb.rowOf("qb_ded");

  /* ------------------------------------------------------------ FORM 1040 */
  const f40 = Sheet("Form 1040", {
    cols: [46, 34].concat(scenarios.map(() => 17)),
    freeze: 3
  });
  f40.add({
    cells: [{
      t: "s",
      v: "Form 1040 — " + C.label + ", " + statusLabel,
      s: ST.title
    }]
  });
  f40.add({
    cells: [{
      t: "s",
      v: "Line",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Authority",
      s: ST.colHdr
    }].concat(scenarios.map(s => ({
      t: "s",
      v: s.name,
      s: ST.colHdr
    })))
  });
  f40.add({
    cells: [{
      t: "s",
      v: "Income",
      s: ST.sectionHdr
    }]
  });
  const incLine = (id, label, cite, keys, get) => {
    f40.add({
      id,
      cells: [{
        t: "s",
        v: label,
        s: ST.labelInd
      }, {
        t: "s",
        v: cite,
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: "=" + keys.map(k => IXn(k, i)).join("+"),
        v: get(s),
        s: ST.moneyF
      })))
    });
  };
  f40.add({
    id: "f_wages",
    cells: [{
      t: "s",
      v: "Wages, salaries and tips",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Line 1z, incl. S corporation compensation",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + IXn("w2Wages", i) + "+" + IXn("sCorpComp", i) + (SCCOMP ? "+" + SCCOMP(i) : ""),
      v: results[i].r.incomeParts.wages + results[i].r.incomeParts.sCorpComp,
      s: ST.moneyF
    })))
  });
  incLine("f_int", "Taxable interest", "Line 2b", ["taxableInterest"], s => num(s.taxableInterest));
  incLine("f_div", "Ordinary dividends", "Line 3b", ["ordinaryDividends"], s => num(s.ordinaryDividends));
  incLine("f_ira", "IRA and pension distributions", "Lines 4b, 5b", ["iraDistributions", "rothConversion"], s => num(s.iraDistributions) + num(s.rothConversion));
  incLine("f_ss", "Taxable Social Security", "Line 6b", ["socialSecurityTaxable"], s => num(s.socialSecurityTaxable));
  f40.add({
    id: "f_cap",
    cells: [{
      t: "s",
      v: "Capital gain or loss",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Line 7, Sch D — loss limited to $3,000 by IRC 1211(b)",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=IF(" + IXn("shortTermGains", i) + "+" + IXn("longTermGains", i) + ">=0," + IXn("shortTermGains", i) + "+" + IXn("longTermGains", i) + ",MAX(" + IXn("shortTermGains", i) + "+" + IXn("longTermGains", i) + ",-" + (status === "mfs" ? 1500 : 3000) + "))",
      v: results[i].r.capitalIncluded,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_schedc",
    cells: [{
      t: "s",
      v: "Business income — Schedule C",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Sch 1 line 3",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + SCHEDC(i),
      v: results[i].r.schedC,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_pass",
    cells: [{
      t: "s",
      v: "Rental, partnership and S corporation income",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Sch 1 line 5, Sch E",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + N(results[i].r.passthrough) + "+" + IXn("sCorpK1", i) + (SCK1 ? "+" + SCK1(i) : ""),
      v: results[i].r.passthrough + results[i].r.incomeParts.sCorpK1,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_other",
    cells: [{
      t: "s",
      v: "Other income",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Sch 1 line 10",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      v: results[i].r.s1Income + num(s.otherIncome),
      s: ST.money
    })))
  });
  f40.add({
    id: "f_total",
    cells: ref => [{
      t: "s",
      v: "Total income",
      s: ST.label
    }, {
      t: "s",
      v: "Line 9",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + ["f_wages", "f_int", "f_div", "f_ira", "f_ss", "f_cap", "f_schedc", "f_pass", "f_other"].map(x => ref(x, 3 + i)).join("+"),
      v: results[i].r.grossIncome,
      s: ST.moneyBold
    })))
  });
  f40.add({
    id: "f_adj",
    cells: [{
      t: "s",
      v: "Adjustments to income",
      s: ST.label
    }, {
      t: "s",
      v: "Line 10, Schedule 1 Part II",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + ADJTOT(i),
      v: results[i].r.adjustments,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_agi",
    cells: ref => [{
      t: "s",
      v: "Adjusted gross income",
      s: ST.label
    }, {
      t: "s",
      v: "Line 11",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + ref("f_total", 3 + i) + "-" + ref("f_adj", 3 + i),
      v: results[i].r.agi,
      s: ST.moneyGrand
    })))
  });
  f40.add({
    cells: [{
      t: "s",
      v: "Deductions",
      s: ST.sectionHdr
    }]
  });
  f40.add({
    id: "f_std",
    cells: [{
      t: "s",
      v: "Standard deduction",
      s: ST.labelInd
    }, {
      t: "s",
      v: "IRC 63 as amended by OBBBA",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=TX_StdDeduction+TX_AddlStdPer*(" + Math.min(num(s.sched1A.seniorCount), status === "mfj" ? 2 : 1) + "+" + num(s.sched1A.blindCount) + ")+MIN(" + IXn("scheduleA.charityCash", i) + ",TX_CharityNonItemizer)",
      v: results[i].r.stdDed + results[i].r.nonItemizerCharity,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_item",
    cells: [{
      t: "s",
      v: "Itemized deductions",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Schedule A",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + SATOT(i),
      v: results[i].r.itemized,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_ded",
    cells: ref => [{
      t: "s",
      v: "Deduction applied",
      s: ST.label
    }, {
      t: "s",
      v: "Line 12",
      s: ST.cite
    }].concat(scenarios.map((s, i) => {
      const mode = s.deductionMode;
      const f = mode === "standard" ? "=" + ref("f_std", 3 + i) : mode === "itemized" ? "=" + ref("f_item", 3 + i) : "=MAX(" + ref("f_std", 3 + i) + "," + ref("f_item", 3 + i) + ")";
      return {
        f,
        v: results[i].r.deductionUsed,
        s: ST.moneyF
      };
    }))
  });
  f40.add({
    id: "f_s1a",
    cells: [{
      t: "s",
      v: "Schedule 1-A additional deductions",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Line 13b — reduces taxable income but not AGI",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + S1ATOT(i),
      v: results[i].r.sched1ATotal,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_tibq",
    cells: ref => [{
      t: "s",
      v: "Taxable income before the 199A deduction",
      s: ST.label
    }, {
      t: "s",
      v: "Basis for the 199A cap",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0," + ref("f_agi", 3 + i) + "-" + ref("f_ded", 3 + i) + "-" + ref("f_s1a", 3 + i) + ")",
      v: results[i].r.tiBeforeQBI,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_qbi",
    cells: [{
      t: "s",
      v: "Qualified business income deduction",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Line 13a",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + QBIDED(i),
      v: results[i].r.qbi.deduction,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_ti",
    cells: ref => [{
      t: "s",
      v: "Taxable income",
      s: ST.label
    }, {
      t: "s",
      v: "Line 15",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0," + ref("f_tibq", 3 + i) + "-" + ref("f_qbi", 3 + i) + ")",
      v: results[i].r.taxableIncome,
      s: ST.moneyGrand
    })))
  });
  f40.add({
    cells: [{
      t: "s",
      v: "Tax",
      s: ST.sectionHdr
    }]
  });
  f40.add({
    id: "f_pref",
    cells: ref => [{
      t: "s",
      v: "Preferential income — net long-term gain and qualified dividends",
      s: ST.labelInd
    }, {
      t: "s",
      v: "IRC 1(h)",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MIN(" + ref("f_ti", 3 + i) + "," + N(results[i].r.prefIncome > 0 ? clamp0(clamp0(num(s.longTermGains)) - clamp0(-num(s.shortTermGains))) + clamp0(num(s.qualifiedDividends)) : 0) + ")",
      v: results[i].r.prefIncome,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_ord",
    cells: ref => [{
      t: "s",
      v: "Ordinary taxable income",
      s: ST.labelInd
    }, {
      t: "s",
      v: "",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0," + ref("f_ti", 3 + i) + "-" + ref("f_pref", 3 + i) + ")",
      v: results[i].r.ordinaryTaxable,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_ordtax",
    cells: ref => [{
      t: "s",
      v: "Tax on ordinary income",
      s: ST.label
    }, {
      t: "s",
      v: "Bracket table on Constants, applied as a marginal-step sumproduct",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=SUMPRODUCT((" + ref("f_ord", 3 + i) + ">TX_BracketFloors)*(" + ref("f_ord", 3 + i) + "-TX_BracketFloors)*TX_BracketSteps)",
      v: results[i].r.ordTax,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_cgtax",
    cells: ref => [{
      t: "s",
      v: "Tax on preferential income",
      s: ST.label
    }, {
      t: "s",
      v: "IRC 1(h) — stacked on top of ordinary income",
      s: ST.cite
    }].concat(scenarios.map((s, i) => {
      const st = ref("f_ord", 3 + i),
        en = "(" + ref("f_ord", 3 + i) + "+" + ref("f_pref", 3 + i) + ")";
      return {
        f: "=MAX(0,MIN(" + en + ",TX_LTCG_Fifteen)-MAX(" + st + ",TX_LTCG_Zero))*0.15+MAX(0," + en + "-MAX(" + st + ",TX_LTCG_Fifteen))*0.2",
        v: results[i].r.cgTax,
        s: ST.moneyF
      };
    }))
  });
  f40.add({
    id: "f_ctc",
    cells: ref => [{
      t: "s",
      v: "Child tax credit",
      s: ST.labelInd
    }, {
      t: "s",
      v: "IRC 24 — $50 per $1,000 or fraction over the threshold",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0,TX_CTCAmount*" + IXn("children", i) + "-TX_CTCStep*ROUNDUP(MAX(0," + ref("f_agi", 3 + i) + "-TX_CTCThreshold)/1000,0))",
      v: results[i].r.ctc,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_credits",
    cells: ref => [{
      t: "s",
      v: "Nonrefundable credits applied",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Limited to income tax",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MIN(" + ref("f_ctc", 3 + i) + "+" + IXn("otherCredits", i) + "," + ref("f_ordtax", 3 + i) + "+" + ref("f_cgtax", 3 + i) + ")",
      v: results[i].r.creditsApplied,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_setax",
    cells: [{
      t: "s",
      v: "Self-employment tax",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Schedule SE",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "='Schedule SE'!$" + SC(i) + "$" + se.rowOf("se_total"),
      v: results[i].r.seTax,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_amed",
    cells: [{
      t: "s",
      v: "Additional Medicare Tax",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Form 8959",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "='Schedule SE'!$" + SC(i) + "$" + se.rowOf("am_total"),
      v: results[i].r.addlMedicare,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_fica",
    cells: [{
      t: "s",
      v: "S corporation payroll tax",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Employer and employee halves; the employer half is the corporation's deduction",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: SCEMPFICA ? "=" + SCEMPFICA(i) + "*2" : "=IF(" + IXn("sCorpComp", i) + ">0,MIN(" + IXn("sCorpComp", i) + ",TX_SSWageBase)*0.124+" + IXn("sCorpComp", i) + "*0.029,0)",
      v: results[i].r.sCorpFICA,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_niit",
    cells: ref => [{
      t: "s",
      v: "Net investment income tax",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Form 8960 — 3.8% of the lesser of NII or the MAGI excess",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=TX_NIITRate*MIN(" + N(results[i].r.investmentIncome) + ",MAX(0," + ref("f_agi", 3 + i) + "-TX_NIITThreshold))",
      v: results[i].r.niit,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_tax",
    cells: ref => [{
      t: "s",
      v: "Total modeled federal tax",
      s: ST.label
    }, {
      t: "s",
      v: "Income tax net of credits plus employment taxes and NIIT",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=MAX(0," + ref("f_ordtax", 3 + i) + "+" + ref("f_cgtax", 3 + i) + "-" + ref("f_credits", 3 + i) + ")+" + ref("f_setax", 3 + i) + "+" + ref("f_fica", 3 + i) + "+" + ref("f_amed", 3 + i) + "+" + ref("f_niit", 3 + i),
      v: results[i].r.totalTax,
      s: ST.moneyGrand
    })))
  });
  f40.add({
    id: "f_eff",
    cells: ref => [{
      t: "s",
      v: "Effective economic rate",
      s: ST.labelInd
    }, {
      t: "s",
      v: "",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=IF(" + ref("f_total", 3 + i) + ">0," + ref("f_tax", 3 + i) + "/" + ref("f_total", 3 + i) + ",0)",
      v: results[i].r.effectiveRate,
      s: ST.pctF
    })))
  });
  f40.add({
    id: "f_econ",
    cells: ref => [{
      t: "s",
      v: "Economic income",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Total income plus employer payroll tax, which already reduced the K-1",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + ref("f_total", 3 + i) + (SCEMPFICA ? "+" + SCEMPFICA(i) : ""),
      v: results[i].r.economicIncome,
      s: ST.moneyF
    })))
  });
  f40.add({
    id: "f_after",
    cells: ref => [{
      t: "s",
      v: "After-tax cash",
      s: ST.label
    }, {
      t: "s",
      v: "Measured against the pre-tax business economics, so an S election compares like for like",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + ref("f_econ", 3 + i) + "-" + ref("f_tax", 3 + i),
      v: results[i].r.afterTaxCash,
      s: ST.moneyGrand
    })))
  });
  addTieOut(f40, scenarios, results, r => r.totalTax, "f_tax");
  sheets.push(f40);

  /* ---- Patch the placeholder AGI / QBI / TIBQ references now that rows are known ---- */
  const agiRow = f40.rowOf("f_agi"),
    qbiRow = f40.rowOf("f_qbi"),
    tibqRow = f40.rowOf("f_tibq");
  const patch = sheet => {
    const orig = sheet.build;
    sheet.build = function () {
      return orig.call(sheet).replace(/\$AGIROW/g, "$" + agiRow).replace(/\$AGI\b/g, "$" + agiRow).replace(/\$QBI\b/g, "$" + qbiRow).replace(/\$TIBQ\b/g, "$" + tibqRow);
    };
  };
  patch(schA);
  patch(qb);
  patch(adj);

  /* ------------------------------------------------------------ MAGI TAB */
  const mg = Sheet("MAGI Thresholds", {
    cols: [46, 34].concat(scenarios.map(() => 17)),
    freeze: 3
  });
  mg.add({
    cells: [{
      t: "s",
      v: "MAGI-sensitive provisions",
      s: ST.title
    }]
  });
  mg.add({
    cells: [{
      t: "s",
      v: "Provision",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Range",
      s: ST.colHdr
    }].concat(scenarios.map(s => ({
      t: "s",
      v: s.name,
      s: ST.colHdr
    })))
  });
  mg.add({
    id: "mg_agi",
    cells: [{
      t: "s",
      v: "Adjusted gross income",
      s: ST.label
    }, {
      t: "s",
      v: "Form 1040 line 11",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "='Form 1040'!$" + SC(i) + "$" + agiRow,
      v: results[i].r.agi,
      s: ST.moneyF
    })))
  });
  const mgRow = (label, lo, hi, cite) => {
    mg.add({
      cells: ref => [{
        t: "s",
        v: label,
        s: ST.labelInd
      }, {
        t: "s",
        v: cite,
        s: ST.cite
      }].concat(scenarios.map((s, i) => ({
        f: hi == null ? "=IF(" + ref("mg_agi", 3 + i) + ">" + N(lo) + ",\"ABOVE\",\"Under\")" : "=IF(" + ref("mg_agi", 3 + i) + ">=" + N(hi) + ",\"ABOVE\",IF(" + ref("mg_agi", 3 + i) + ">" + N(lo) + ",\"PHASE-OUT\",\"Under\"))",
        v: null,
        t: "s",
        s: ST.label
      })))
    });
  };
  const dash = buildMAGIDashboard(results[0].r, status, year);
  dash.filter(g => !g.special).forEach(g => {
    mg.add({
      cells: [{
        t: "s",
        v: g.label,
        s: ST.sectionHdr
      }]
    });
    g.items.forEach(it => mgRow(it.name, it.lo, it.hi, it.cite || ""));
  });
  sheets.push(mg);

  /* ----------------------------------------------------------- AUDIT TRAIL */
  /* ------------------------------------------------- ECONOMICS & VALIDATION */
  const ec = Sheet("Economics & Validation", {
    cols: [44].concat(scenarios.map(() => 18)),
    freeze: 3
  });
  ec.add({
    cells: [{
      t: "s",
      v: "Economic-income and cash-flow reconciliation \u00b7 validation results",
      s: ST.title
    }]
  });
  ec.add({
    cells: [{
      t: "s",
      v: "Values in this sheet are engine outputs (not formulas). After-tax economic income = gross economic income \u2212 total modeled federal tax. Spendable after-tax cash further removes retirement, HSA and charitable cash outflows. Employer payroll tax already reduced the K-1, so it is never subtracted twice.",
      s: ST.small
    }]
  });
  ec.add({
    cells: [{
      t: "s",
      v: "Line",
      s: ST.colHdr
    }].concat(scenarios.map(sc => ({
      t: "s",
      v: sc.name,
      s: ST.colHdr
    })))
  });
  const ecRow = (label, get) => ec.add({
    cells: [{
      t: "s",
      v: label,
      s: ST.label
    }].concat(results.map(x => ({
      v: Math.round(get(x.r)),
      s: ST.money
    })))
  });
  ecRow("Gross economic income", r => r.economicIncome);
  ecRow("Form 1040 total income", r => r.grossIncome);
  ecRow("Adjusted gross income", r => r.agi);
  ecRow("Taxable income", r => r.taxableIncome);
  ecRow("Federal income tax less credits", r => Math.max(0, r.fedIncomeTax - r.creditsApplied));
  ecRow("Self-employment tax", r => r.seTax);
  ecRow("Employee payroll tax (S corp)", r => r.employeeFICA);
  ecRow("Employer payroll tax (S corp)", r => r.employerFICA);
  ecRow("Additional Medicare Tax", r => r.addlMedicare);
  ecRow("Net investment income tax", r => r.niit);
  ecRow("Form 1040 tax liability", r => r.form1040Tax);
  ecRow("Total modeled federal tax", r => r.totalTax);
  ecRow("Payments and withholding", r => r.payments);
  ecRow("Estimated balance due / (refund)", r => r.balanceDue);
  ecRow("Retirement contributions", r => r.cashOutflows.retirement);
  ecRow("HSA contributions", r => r.cashOutflows.hsa);
  ecRow("Charitable cash outflow", r => r.cashOutflows.charitable);
  ecRow("After-tax economic income", r => r.afterTaxCash);
  ecRow("Spendable after-tax cash", r => r.spendableAfterTaxCash);
  ec.add({
    cells: []
  });
  ec.add({
    cells: [{
      t: "s",
      v: "Validation results \u2014 blocking errors, material warnings, informational review points",
      s: ST.sectionHdr
    }]
  });
  results.forEach(x => {
    const list = x.v && x.v.all || [];
    ec.add({
      cells: [{
        t: "s",
        v: x.s.name + (list.length ? "" : " \u2014 no findings"),
        s: ST.label
      }]
    });
    list.forEach(vv => ec.add({
      cells: [{
        t: "s",
        v: "  [" + vv.level.toUpperCase() + "] " + vv.msg,
        s: ST.small
      }]
    }));
  });
  ec.add({
    cells: []
  });
  ec.add({
    cells: [{
      t: "s",
      v: "Engine version",
      s: ST.label
    }, {
      t: "s",
      v: ENGINE_VERSION,
      s: ST.small
    }]
  });
  ec.add({
    cells: [{
      t: "s",
      v: "Rules version",
      s: ST.label
    }, {
      t: "s",
      v: RULES_VERSION,
      s: ST.small
    }]
  });
  sheets.push(ec);

  const au = Sheet("Audit Trail", {
    cols: [19, 26, 34, 17, 17, 17, 40],
    freeze: 3
  });
  au.add({
    cells: [{
      t: "s",
      v: "Audit trail — every change recorded",
      s: ST.title
    }]
  });
  au.add({
    cells: [{
      t: "s",
      v: "Entries are recorded in the order they were made. Tax impact is the movement in total tax for that scenario caused by the change.",
      s: ST.small
    }]
  });
  au.add({
    cells: [{
      t: "s",
      v: "Timestamp",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Scenario",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Field",
      s: ST.colHdr
    }, {
      t: "s",
      v: "From",
      s: ST.colHdr
    }, {
      t: "s",
      v: "To",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Tax impact",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Memo",
      s: ST.colHdr
    }]
  });
  if (!auditLog.length) {
    au.add({
      cells: [{
        t: "s",
        v: "No changes recorded in this session.",
        s: ST.small
      }]
    });
  } else {
    auditLog.forEach(e => {
      au.add({
        cells: [{
          t: "s",
          v: e.tsLabel,
          s: ST.label
        }, {
          t: "s",
          v: e.scenarioName,
          s: ST.label
        }, {
          t: "s",
          v: e.label,
          s: ST.label
        }, {
          t: "s",
          v: e.from === "" || e.from == null ? "—" : String(e.from),
          s: ST.label
        }, {
          t: "s",
          v: e.to === "" || e.to == null ? "—" : String(e.to),
          s: ST.label
        }, e.delta == null ? {
          t: "s",
          v: "—",
          s: ST.label
        } : {
          v: e.delta,
          s: ST.money
        }, {
          t: "s",
          v: e.memo || "",
          s: ST.wrap
        }]
      });
    });
  }
  sheets.push(au);

  /* ------------------------------------------------------------------ NOTES */
  const nt = Sheet("Notes", {
    cols: [19, 26, 100],
    freeze: 3
  });
  nt.add({
    cells: [{
      t: "s",
      v: "Working notes",
      s: ST.title
    }]
  });
  nt.add({
    cells: [{
      t: "s",
      v: "Timestamp",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Scenario",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Note",
      s: ST.colHdr
    }]
  });
  if (!notes.length) nt.add({
    cells: [{
      t: "s",
      v: "No notes recorded.",
      s: ST.small
    }]
  });
  notes.forEach(n => nt.add({
    cells: [{
      t: "s",
      v: n.tsLabel,
      s: ST.label
    }, {
      t: "s",
      v: n.scenarioName || "All scenarios",
      s: ST.label
    }, {
      t: "s",
      v: n.text,
      s: ST.wrap
    }],
    height: Math.min(120, 16 + Math.ceil(String(n.text).length / 90) * 14)
  }));
  sheets.push(nt);
  return buildWorkbook(sheets, definedNames, {
    title: (meta.client || "Tax planning") + " — " + C.label,
    creator: meta.preparer || "Tax Advisory Pro",
    created: meta.createdISO
  });
}

/* ---- Tie-out block: formula result vs the engine, with a variance flag ---- */
function addTieOut(sheet, scenarios, results, get, formulaRowId, note) {
  sheet.blank();
  sheet.add({
    cells: [{
      t: "s",
      v: "Tie-out check",
      s: ST.sectionHdr
    }]
  });
  sheet.add({
    id: "tie_formula",
    cells: ref => [{
      t: "s",
      v: "Computed by formula above",
      s: ST.labelInd
    }, {
      t: "s",
      v: note || "",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + ref(formulaRowId, 3 + i),
      v: get(results[i].r),
      s: ST.moneyF
    })))
  });
  sheet.add({
    id: "tie_engine",
    cells: [{
      t: "s",
      v: "Computed by the application engine",
      s: ST.labelInd
    }, {
      t: "s",
      v: "Hard value at export",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      v: get(results[i].r),
      s: ST.money
    })))
  });
  sheet.add({
    id: "tie_var",
    cells: ref => [{
      t: "s",
      v: "Variance",
      s: ST.labelInd
    }, {
      t: "s",
      v: "",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=" + ref("tie_formula", 3 + i) + "-" + ref("tie_engine", 3 + i),
      v: 0,
      s: ST.moneyF
    })))
  });
  sheet.add({
    cells: ref => [{
      t: "s",
      v: "Status",
      s: ST.label
    }, {
      t: "s",
      v: "Anything other than OK means the formula and the engine disagree",
      s: ST.cite
    }].concat(scenarios.map((s, i) => ({
      f: "=IF(ABS(" + ref("tie_var", 3 + i) + ")<1,\"OK\",\"REVIEW\")",
      t: "s",
      v: null,
      s: ST.key
    })))
  });
}

/* ============================================================================
   BLANK TEMPLATE — for collecting client data before it is loaded back in
   ========================================================================== */
function buildTemplateWorkbook(year, status) {
  const C = TY[year];
  const blank = blankScenario("Scenario 1");
  const flat = flattenScenario(blank);
  const sh = Sheet("Inputs", {
    cols: [46, 34, 18, 18, 18],
    freeze: 3
  });
  sh.add({
    cells: [{
      t: "s",
      v: "Tax Advisory Pro — input template (" + C.label + ", " + STATUSES.find(s => s.v === status).l + ")",
      s: ST.title
    }]
  });
  sh.add({
    cells: [{
      t: "s",
      v: "Fill the scenario columns and import this file back into the app. Do not edit or reorder column B — the keys are how the app reads the file. Blank cells are treated as zero. Add more scenario columns to the right if needed.",
      s: ST.small
    }]
  });
  sh.add({
    cells: [{
      t: "s",
      v: "Description",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Key (do not edit)",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Scenario 1",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Scenario 2",
      s: ST.colHdr
    }, {
      t: "s",
      v: "Scenario 3",
      s: ST.colHdr
    }]
  });
  flat.forEach(p => {
    sh.add({
      cells: [{
        t: "s",
        v: humanKey(p.key),
        s: ST.label
      }, {
        t: "s",
        v: p.key,
        s: ST.cite
      }, {
        v: typeof p.value === "number" ? p.value : "",
        t: typeof p.value === "number" ? undefined : "s",
        s: ST.input
      }]
    });
  });
  const guide = Sheet("How to use", {
    cols: [100]
  });
  guide.add({
    cells: [{
      t: "s",
      v: "How to use this template",
      s: ST.title
    }]
  });
  ["1. Enter the client's figures in the Scenario columns. Every row is one input the engine understands.", "2. Rows ending in __count tell the app how many businesses, expense lines, entities or insured people to create. Increase the count and add matching numbered rows to add more.", "3. Boolean rows take TRUE or FALSE. Text rows such as names take free text.", "4. Save the file, then use Import in the app's Data tab. Existing scenarios can be replaced or added to.", "5. A full export from the app can also be re-imported — it carries the same Inputs sheet plus all the computed schedules."].forEach(t => guide.add({
    cells: [{
      t: "s",
      v: t,
      s: ST.wrap
    }],
    height: 28
  }));
  return buildWorkbook([sh, guide], [], {
    title: "Tax Advisory Pro input template"
  });
}

/* ---- Read scenarios back out of an Inputs sheet ---- */
function scenariosFromSheet(cells) {
  // Find the header row by locating the cell in column B labelled with the key header
  let headerRow = null;
  for (let r = 1; r <= 40; r++) {
    const v = cells["B" + r];
    if (typeof v === "string" && /key/i.test(v)) {
      headerRow = r;
      break;
    }
  }
  if (headerRow == null) throw new Error("Could not find the key column header. Use a template or export produced by this app.");

  // Scenario columns are every populated header cell from C onward
  const cols = [];
  for (let c = 3; c <= 40; c++) {
    const L = colLetter(c);
    const h = cells[L + headerRow];
    if (h != null && String(h).trim() !== "") cols.push({
      letter: L,
      name: String(h)
    });
  }
  if (!cols.length) throw new Error("No scenario columns found to the right of the key column.");

  // Collect key/value pairs per column
  const out = cols.map(c => ({
    name: c.name,
    pairs: []
  }));
  for (let r = headerRow + 1; r <= headerRow + 4000; r++) {
    const key = cells["B" + r];
    if (key == null || String(key).trim() === "") continue;
    cols.forEach((c, ci) => {
      const v = cells[c.letter + r];
      if (v == null || v === "") return;
      out[ci].pairs.push({
        key: String(key).trim(),
        value: v
      });
    });
  }
  return out.filter(o => o.pairs.length).map(o => {
    const s = Object.assign(blankScenario(o.name), unflattenScenario(o.pairs));
    s.id = uid(); // scenario ids must be unique in the session
    s.name = o.name;
    /* Entity ids are PRESERVED when the file carries them, because QBI
       entities reference a Schedule C business or an S corporation by id.
       Only fill in an id where the file has none. */
    const keep = e => {
      if (e && !e.id) e.id = uid();
    };
    (s.schedC && s.schedC.businesses || []).forEach(b => {
      keep(b);
      (b.expenses || []).forEach(keep);
    });
    (s.passthrough && s.passthrough.entities || []).forEach(keep);
    (s.sCorps && s.sCorps.entities || []).forEach(keep);
    (s.qbi && s.qbi.entities || []).forEach(keep);
    (s.scheduleA && s.scheduleA.medical || []).forEach(keep);
    (s.scheduleA && s.scheduleA.other || []).forEach(keep);
    (s.sehi && s.sehi.ltcInsured || []).forEach(keep);
    return s;
  });
}
