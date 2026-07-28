# Unsupported Tax Situations

The engine models a deliberately bounded federal 1040 scope. Everything below
is OUT of scope in `engine-0.1.0`. Where an unsupported situation is
detectable from inputs, the engine emits a blocking, review-forcing
diagnostic — it never silently approximates.

## Detected and blocked (diagnostic code)

- Self-employment income — SE tax, QBI deduction (`UNSUP-SE-001`, error)
- Net capital loss beyond the annual limit — carryforward not tracked
  (`ENG-CLCF-001`, warning + review)
- Cash charitable gifts above 60% of AGI — AGI limitation and carryover not
  modeled (`ENG-CHAR-001`, warning + review)
- IRA / 401(k) contributions above the limit — capped with an error
  diagnostic (`ENG-IRA-001`, `ENG-401K-001`)

## Not modeled (callers and the agent must not imply otherwise)

- State and local income tax returns (SALT is modeled only as an itemized
  deduction input)
- Alternative minimum tax (AMT)
- Additional Medicare tax (0.9%); NIIT **is** modeled
- Refundable additional child tax credit (CTC is nonrefundable here,
  `ENG-ACTC-001` info)
- OBBBA senior bonus deduction, tips/overtime deductions
- IRA deduction active-participant phaseouts; backdoor-Roth basis (Form 8606)
- Mortgage-interest acquisition-debt limits
- Education credits, energy credits, foreign tax credit, dependent care
- Estimated-tax penalties and safe harbors
- Trusts, estates, entities, K-1s; multi-state allocation; amended returns
- Tax-table lookup for taxable income under $100,000 (formula used;
  `ENG-TABLE-001` info)

## Planned specialist-agent boundaries (Phase 5)

Specialists (Roth conversion, capital gains, charitable giving, retirement
distribution, entity/compensation, state tax, document import, anomaly
review) must reuse this engine, these rulesets, this reconciliation layer,
and this review process. A specialist proposes structured scenario overrides
through the existing tools; a specialist that needs new tax math means the
ENGINE grows (with rulesets, golden tests, and reconciliation), never the
prompt.
