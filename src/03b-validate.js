/* ==== 03b-validate ==== */
/* ============================================================================
   SCENARIO VALIDATION
   Three levels:
     error — blocking: the scenario cannot carry a recommended designation
     warn  — material: the result is computable but a fact needs confirmation
     info  — informational review point
   Validation never mutates inputs; it only reports.
   ========================================================================== */
function validateScenario(s, r, status, year) {
  const C = TY[year];
  const out = [];
  const push = (level, code, msg) => out.push({
    level,
    code,
    msg
  });

  /* Dividends: qualified is a subset of ordinary */
  if (num(s.qualifiedDividends) > num(s.ordinaryDividends) + 0.5) {
    push("error", "qual-div", "Qualified dividends (" + usd$(num(s.qualifiedDividends)) + ") exceed ordinary dividends (" + usd$(num(s.ordinaryDividends)) + "). Qualified dividends are a subset of ordinary dividends and cannot be larger.");
  }

  /* Social Security: taxable portion cannot exceed benefits, or 85% of them */
  const ssTot = num(s.socialSecurityTotal),
    ssTax = num(s.socialSecurityTaxable);
  if (ssTot > 0 && ssTax > ssTot + 0.5) {
    push("error", "ss-taxable", "Taxable Social Security (" + usd$(ssTax) + ") exceeds total benefits received (" + usd$(ssTot) + ").");
  } else if (ssTot > 0 && ssTax > 0.85 * ssTot + 0.5) {
    push("warn", "ss-85", "Taxable Social Security exceeds 85% of benefits — the statutory maximum inclusion is 85%.");
  }

  /* Senior / blind counts limited by filing status */
  const maxPersons = status === "mfj" ? 2 : 1;
  if (num((s.sched1A || {}).seniorCount) > maxPersons) {
    push("error", "senior-count", "Eligible senior count (" + num(s.sched1A.seniorCount) + ") exceeds the " + maxPersons + " taxpayer(s) permitted by this filing status. The engine caps the count at " + maxPersons + ".");
  }
  if (num((s.sched1A || {}).blindCount) > maxPersons) {
    push("error", "blind-count", "Blind-taxpayer count exceeds the " + maxPersons + " taxpayer(s) permitted by this filing status.");
  }

  /* HSA consistency */
  const P = s.planning || {};
  if (P.hsaMode === "manual" && num(P.hsaManual) > r.hsaLimit + 0.5) {
    push("warn", "hsa-limit", "HSA entry of " + usd$(num(P.hsaManual)) + " exceeds the applicable limit of " + usd$(r.hsaLimit) + " — the engine deducts only the limit.");
  }
  if (P.hsaMode && P.hsaMode !== "off" && num(P.age) > 0 && num(P.age) < 55 && P.hsaCatchup) {
    push("error", "hsa-catchup", "HSA catch-up contributions require age 55 or older.");
  }

  /* Roth conversions vs. retirement distributions */
  if (num(s.rothConversion) > 0 && num(s.iraDistributions) === 0 && num(s.rothConversionSource) !== 1) {
    push("info", "roth-src", "A Roth conversion is modeled with no IRA distribution entered. Conversions are reported separately here, but confirm the converted amount is not double-counted in distributions.");
  }

  /* S corporation: compensation cannot exceed available business economics */
  (s.sCorps && s.sCorps.entities || []).forEach(e => {
    const profit = num(e.profitBeforeComp);
    const comp = num(e.ownerComp);
    if (comp > 0 && profit > 0 && comp + Math.min(comp, C.ssWageBase) * 0.062 + comp * 0.0145 + num(e.otherExpenses) > profit + 0.5) {
      push("error", "scorp-comp", (e.name || "S corporation") + ": owner compensation plus employer payroll tax and other expenses (" + usd$(comp + Math.min(comp, C.ssWageBase) * 0.062 + comp * 0.0145 + num(e.otherExpenses)) + ") exceeds profit before compensation (" + usd$(profit) + "), driving the K-1 negative. Confirm the business economics support this wage.");
    }
  });

  /* Legacy manual K-1 entries cannot be reconciled to entity economics */
  if (num(s.sCorpComp) > 0 || num(s.sCorpK1) > 0) {
    push("warn", "scorp-legacy", "Legacy manual S-corporation compensation/K-1 entries are in use. They cannot be reconciled to entity-level economics (profit, employer payroll tax, expenses) — move them into an S-corporation entity for a derived, auditable K-1.");
  }

  /* QBI entities */
  (s.qbi && s.qbi.entities || []).forEach(e => {
    if (num(e.ubia) < 0) {
      push("error", "ubia-neg", (e.name || "QBI entity") + ": UBIA cannot be negative.");
    }
    if (!e.link && num(e.w2) > 0) {
      push("info", "qbi-w2-link", (e.name || "QBI entity") + ": W-2 wages are entered by hand. Confirm the wages belong to this same qualified trade or business — only that business's wages count for its §199A limitation.");
    }
  });

  /* Itemized entries must not be negative */
  const a = s.scheduleA || {};
  ["stateIncomeTax", "salesTax", "realEstateTax", "personalPropertyTax", "mortgageInterest", "points", "investmentInterest", "charityCash", "charityNonCash", "charityCarryover"].forEach(k => {
    if (num(a[k]) < 0) push("error", "schedA-neg", "Schedule A entry \"" + k + "\" is negative. Itemized deduction entries must not be negative.");
  });

  /* Capital losses: engine enforces the Sec. 1211(b) limit; surface it */
  const capNet = num(s.shortTermGains) + num(s.longTermGains);
  const capLimit = status === "mfs" ? 1500 : 3000;
  if (capNet < -capLimit) {
    push("info", "cap-loss", "Net capital loss of " + usd$(Math.abs(capNet)) + " exceeds the " + usd$(capLimit) + " annual deduction limit — " + usd$(Math.abs(capNet) - capLimit) + " carries forward. The engine already applies the limit.");
  }

  /* Tax-exempt interest reaches the ACA and IRMAA MAGIs */
  if (num(s.taxExemptInterest) > 0) {
    push("info", "texempt-magi", "Tax-exempt interest of " + usd$(num(s.taxExemptInterest)) + " is included in the ACA and IRMAAs MAGI measures, as required — it does not affect taxable income.");
  }

  /* Credits floor at zero */
  if (r.creditsApplied > r.fedIncomeTax + 0.5) {
    push("error", "credit-floor", "Credits applied exceed the income tax — nonrefundable credits cannot reduce tax below zero.");
  }

  /* NIIT classifications needing human review */
  (r.niitReview || []).forEach(w => push("warn", "niit-review", w));

  /* Schedule 1-A blocked for MFS */
  if (status === "mfs" && r.S1A && r.S1A.ineligibleReason) {
    const entered = num((s.sched1A || {}).seniorCount) > 0 || num((s.sched1A || {}).tips) > 0 || num((s.sched1A || {}).overtime) > 0 || num((s.sched1A || {}).autoLoanInterest) > 0;
    if (entered) push("warn", "mfs-1a", "Schedule 1-A amounts are entered but the deductions are not available when married filing separately. The allowed amount is $0.");
  }

  /* Student loan interest */
  if (r.studentLoan && r.studentLoan.entered > 0) {
    if (r.studentLoan.reason) push("warn", "sl-limited", "Student loan interest: " + r.studentLoan.reason + " Allowed deduction " + usd$(r.studentLoan.allowed) + ".");
    else if (r.studentLoan.entered > r.studentLoan.max) push("info", "sl-cap", "Student loan interest entered (" + usd$(r.studentLoan.entered) + ") exceeds the statutory maximum — the deduction is capped at " + usd$(r.studentLoan.max) + " before the MAGI phase-out.");
  }

  return {
    all: out,
    errors: out.filter(v => v.level === "error"),
    warnings: out.filter(v => v.level === "warn"),
    infos: out.filter(v => v.level === "info"),
    blocking: out.some(v => v.level === "error")
  };
}
