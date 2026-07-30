/* ==== 09-reference ==== */
/* ============================================================================
   PLANNING GUIDE — screening checklist
   ========================================================================== */
const OBBBA = [{
  when: "2025",
  t: "Standard deduction raised and made permanent",
  d: "$15,750 single / $31,500 MFJ / $23,625 HOH for 2025, rising to $16,100 / $32,200 / $24,150 in 2026. These supersede the amounts published in Rev. Proc. 2024-40, which are now obsolete."
}, {
  when: "2025",
  t: "SALT cap raised to $40,000",
  d: "Up from $10,000. Phases down 30 cents per dollar of MAGI above $500,000 to a $10,000 floor. Rises 1% per year through 2029, then reverts to $10,000 in 2030."
}, {
  when: "2025",
  t: "100% bonus depreciation restored permanently",
  d: "For qualified property both acquired and placed in service after January 19, 2025. Property under a binding contract on or before that date does not qualify, even if placed in service later."
}, {
  when: "2025",
  t: "Section 179 raised to $2.5 million",
  d: "Phase-out threshold $4 million, indexed from 2026. Again, this supersedes Rev. Proc. 2024-40."
}, {
  when: "2025-28",
  t: "Four new below-the-line deductions",
  d: "Senior ($6,000), tips ($25,000), overtime ($12,500 / $25,000 MFJ) and car loan interest ($10,000), all on new Schedule 1-A. They reduce taxable income but not AGI."
}, {
  when: "2026",
  t: "Section 199A made permanent, phase-in widened",
  d: "The 20% deduction no longer sunsets. The phase-in range widens from $50,000/$100,000 to $75,000/$150,000, and a $400 minimum deduction arrives for taxpayers with at least $1,000 of QBI from an active business."
}, {
  when: "2026",
  t: "Charitable floor and the 2/37 haircut",
  d: "Itemized charitable contributions count only above 0.5% of AGI. Separately, top-bracket taxpayers lose 2/37ths of total itemized deductions, capping the benefit at 35 cents on the dollar. Non-itemizers gain a $1,000 / $2,000 above-the-line charitable deduction."
}, {
  when: "2026",
  t: "Estate exclusion set at $15 million",
  d: "Permanent and indexed from a reset base, removing the scheduled 2026 reversion. The use-it-or-lose-it pressure of the last several years is gone."
}, {
  when: "2026",
  t: "ACA enhanced subsidies expired",
  d: "The 400% federal poverty level subsidy cliff is restored for 2026 coverage. Crossing it forfeits the entire premium tax credit, which is frequently the single largest marginal cost in the code."
}];
const GUIDE = [{
  cat: "Entity structure and employment tax",
  items: [{
    n: "S corporation election versus sole proprietorship",
    risk: "high",
    b: "Splits profit into reasonable W-2 compensation, which carries FICA, and distributions, which do not. Usually worth modelling once profit clears roughly $60,000. Wages reduce QBI, so model both effects together rather than quoting the payroll saving alone.",
    meta: "IRC §1362 · Forms 2553 / 1120-S · salary reasonableness is the dominant S corporation audit issue"
  }, {
    n: "Reasonable compensation study",
    risk: "high",
    b: "Document the salary with role, hours and market compensation surveys. Service businesses commonly justify 45-55% of profit as wages. Too low a salary is the fastest way to lose the whole structure on exam.",
    meta: "IRS reasonable compensation guidance · retain the study and board minutes"
  }, {
    n: "Accountable plan and the Augusta rule",
    risk: "med",
    b: "Reimburse home office, mileage and connectivity tax-free through the entity. Renting a residence to the business for 14 days or fewer a year is deductible to the entity and excluded to the owner.",
    meta: "IRC §280A(g) · Reg. §1.62-2 · written plan plus comparables required"
  }, {
    n: "Family employment",
    risk: "med",
    b: "Wages paid to a child under 18 by a sole proprietorship are exempt from FICA and FUTA, deductible to the business, and largely sheltered by the child's own standard deduction. The exemption does not extend to S corporation wages.",
    meta: "IRC §3121(b)(3)(A) · needs genuine work, timesheets and real payroll"
  }, {
    n: "Pass-through entity tax election",
    risk: "low",
    b: "The entity pays state tax and deducts it federally, bypassing the individual SALT cap. Materially less compelling now the cap is $40,000, unless K-1 state tax already pushes total SALT over it.",
    meta: "Notice 2020-75 · state PTE statutes vary widely"
  }]
}, {
  cat: "Retirement and deferral",
  items: [{
    n: "Plan design for the self-employed",
    risk: "low",
    b: "The employer profit share is 20% of net earnings after the half-SE-tax deduction, not 25% — the circular calculation reduces the rate. A Solo 401(k) adds the elective deferral on top, which is why it beats a SEP at most income levels below the additions limit.",
    meta: "IRC §401(k), §404(h), §415(c) · Pub 560 · employer contributions due by the extended filing deadline"
  }, {
    n: "Defined benefit and cash balance plans",
    risk: "med",
    b: "For an older owner with consistently high profit and few employees, an actuarially determined contribution can far exceed the defined contribution limits. Costly to administer and hard to unwind, so it needs a durable income forecast.",
    meta: "IRC §415(b), §404(o) · requires an enrolled actuary"
  }, {
    n: "Roth conversions in low-bracket years",
    risk: "low",
    b: "Fill low brackets with conversions and pay the tax from outside funds. Reduces future required distributions and the IRMAA they drive. Check IRMAA and ACA thresholds first — they usually bind before the bracket ceiling.",
    meta: "IRC §408A · Form 8606 · conversions can no longer be recharacterized"
  }, {
    n: "Backdoor and mega-backdoor Roth",
    risk: "med",
    b: "Routes around the Roth income limits. The pro-rata rule aggregates every traditional, SEP and SIMPLE IRA balance at year end, so a pre-existing pre-tax balance makes the conversion partly taxable. Check balances before recommending.",
    meta: "IRC §408A, §408(d)(2) · Form 8606"
  }, {
    n: "Health savings account",
    risk: "low",
    b: "The only triple-advantaged account in the code. Requires HDHP coverage and no disqualifying other coverage. Funding through an employer's payroll also avoids FICA, which the self-employed cannot replicate.",
    meta: "IRC §223 · Form 8889 · Pub 969"
  }]
}, {
  cat: "Section 199A",
  items: [{
    n: "Threshold management",
    risk: "high",
    b: "Below the threshold there is no wage or UBIA limit and even a specified service business qualifies in full. Holding taxable income under it is often worth more than any single deduction, and the 2026 widening of the phase-in range makes the zone more forgiving.",
    meta: "IRC §199A(b)(3), (d)(3) · Forms 8995 / 8995-A"
  }, {
    n: "The taxable income cap",
    risk: "high",
    b: "The deduction cannot exceed 20% of taxable income net of capital gain. Because other deductions lower taxable income, they shrink this cap too — stacking retirement, charitable and depreciation deductions into one year yields less than the sum of the parts.",
    meta: "IRC §199A(a)"
  }, {
    n: "Aggregation",
    risk: "med",
    b: "Combining commonly controlled businesses pools income, wages and UBIA before the limit, which usually helps a wage-light entity paired with a wage-heavy one. Specified service businesses may never be aggregated, and a statement must be attached every year.",
    meta: "Reg. §1.199A-4 · the IRS may disaggregate if the statement is missing"
  }, {
    n: "Negative QBI carryforward",
    risk: "med",
    b: "A net negative QBI year still requires Form 8995 to memorialize the loss, which offsets future positive QBI before any deduction resumes. Skipping the filing is a common and expensive error.",
    meta: "IRC §199A(c)(2)"
  }, {
    n: "Depreciation interaction",
    risk: "med",
    b: "Aggressive bonus depreciation in a low-bracket year can create QBI capacity that cannot be monetized. Electing out of bonus, or using §179 or MACRS instead, sometimes preserves more value.",
    meta: "coordinate depreciation elections with §199A each year"
  }]
}, {
  cat: "Threshold and cliff management",
  items: [{
    n: "Medicare IRMAA",
    risk: "low",
    b: "A cliff, not a phase-in, on a two-year lookback. One dollar over a threshold raises the whole year's Part B and D premiums for each covered spouse. Effective marginal rates at the boundary run into the thousands of percent.",
    meta: "42 U.S.C. §1395r(i) · Form SSA-44 for a life-changing event appeal"
  }, {
    n: "ACA premium tax credit cliff",
    risk: "low",
    b: "The enhanced subsidies expired after 2025, restoring the hard 400% federal poverty level cliff for 2026. Crossing it forfeits the entire credit, so a deductible contribution that holds MAGI beneath it can be worth many times its nominal rate.",
    meta: "IRC §36B · Rev. Proc. 2025-25"
  }, {
    n: "Net investment income tax",
    risk: "med",
    b: "3.8% once MAGI tops $200,000 single or $250,000 joint. Those thresholds are fixed by statute and have never been indexed, so real exposure grows every year.",
    meta: "IRC §1411 · Form 8960"
  }, {
    n: "Schedule 1-A deductions do not reduce AGI",
    risk: "med",
    b: "The senior, tips, overtime and car loan deductions sit below the line. They cut taxable income but leave AGI untouched, so they provide no relief from IRMAA, NIIT, the SALT phase-down, or the 0.5% charitable floor. Easy to model wrongly.",
    meta: "Form 1040 line 13b · Schedule 1-A"
  }]
}, {
  cat: "Deductions and depreciation",
  items: [{
    n: "100% bonus depreciation",
    risk: "high",
    b: "Permanent for property acquired and placed in service after January 19, 2025. Can create a loss, unlike §179. The acquisition date generally means the binding contract date, which catches out taxpayers who contracted earlier.",
    meta: "IRC §168(k) · Form 4562 · several states require an add-back"
  }, {
    n: "Section 179 expensing",
    risk: "med",
    b: "Up to $2.5 million for 2025, cannot create a loss. A heavy SUV over 6,000 pounds GVWR carries its own sub-limit before bonus picks up the balance.",
    meta: "IRC §179 · over 50% business use · recapture if use drops to 50% or below"
  }, {
    n: "Vehicle: mileage versus actual",
    risk: "med",
    b: "For a heavy vehicle used more than half for business, actual expense plus bonus usually beats the standard mileage rate in year one. A contemporaneous mileage log is not optional — large first-year vehicle deductions draw attention.",
    meta: "IRC §274(d), §280F · Pub 463"
  }, {
    n: "Home office",
    risk: "med",
    b: "Exclusive and regular business use. Either actual expense on Form 8829 or the simplified $5 per square foot up to 300 square feet. Depreciation on the office portion faces recapture on sale.",
    meta: "IRC §280A(c) · Rev. Proc. 2013-13 · Form 8829"
  }, {
    n: "Cost segregation",
    risk: "high",
    b: "Reclassifies building components into 5, 7 and 15-year lives to accelerate depreciation and bonus. Best on higher-basis real estate; scrutiny rises sharply when a large share is allocated to short-life property.",
    meta: "Form 3115 · Rev. Proc. 2011-14 · retain the study permanently"
  }]
}, {
  cat: "Charitable and timing",
  items: [{
    n: "Bunching through a donor-advised fund",
    risk: "med",
    b: "Concentrate several years of giving into one itemizing year and take the standard deduction in the off years. From 2026 this also clears the new 0.5% floor once rather than annually, which strengthens the case considerably.",
    meta: "IRC §170 · Form 8283 over $500 non-cash · appraisal over $5,000"
  }, {
    n: "Gifting appreciated securities",
    risk: "med",
    b: "Deduct fair market value, subject to the 30% AGI limit, and permanently avoid the embedded gain. Nearly always better than selling and donating the proceeds. Digital assets over $5,000 need a qualified appraisal.",
    meta: "IRC §170(e) · Pub 561"
  }, {
    n: "Qualified charitable distribution",
    risk: "low",
    b: "From age 70 and a half, a direct IRA-to-charity transfer satisfies required distributions and stays out of AGI entirely. Better than a deduction because it lowers every AGI-driven threshold, including IRMAA.",
    meta: "IRC §408(d)(8) · Pub 590-B"
  }, {
    n: "Accelerating gifts into 2025",
    risk: "low",
    b: "The 0.5% floor and the 2/37 reduction both begin in 2026. A 2025 gift avoids both. For a top-bracket taxpayer the difference is 37 cents on the dollar versus 35 cents, before the floor.",
    meta: "OBBBA amendments to IRC §170 and §68"
  }]
}];
/* ============================================================================
   PLANNING GUIDE — progressive disclosure: category bubbles, search and
   filters, compact accordions. Only the selected category renders; law-change
   cards live in their own subtab instead of dominating the first screen.
   ========================================================================== */
/* Client relevance: fact-based rules that mark a strategy as relevant to the
   ACTIVE client, each with the reason. Strategies with no matching facts are
   deliberately left unmarked. */
function guideClientRelevance(client, r) {
  const map = {};
  if (!client || !r) return map;
  const p = client.profile;
  const goals = new Set((client.goals || []).map(g => g.key));
  const schedC = r.incomeParts ? r.incomeParts.schedC : 0;
  const hasSCorp = (p.businesses || []).some(b => b.entityType === "scorp") || (r.SCORPS || []).length > 0;
  const charity = num(p.deductions.charitableCash) + num(p.deductions.charitableNonCash);
  const age = num(p.household.taxpayerAge);
  const mark = (name, reason) => {
    map[name] = reason;
  };
  if (schedC > 60000 || goals.has("scorp-eval")) mark("S corporation election versus sole proprietorship", usd$(schedC) + " of Schedule C profit" + (goals.has("scorp-eval") ? " and a stated goal to evaluate an S election" : ""));
  if (hasSCorp || goals.has("reasonable-comp")) mark("Reasonable compensation study", hasSCorp ? "The profile carries an S corporation with owner compensation" : "Stated reasonable-compensation goal");
  if (schedC > 0 || hasSCorp) mark("Plan design for the self-employed", "Self-employment or owner compensation supports a plan; current deduction " + usd$(r.retirementDeduction));
  if (goals.has("roth") || p.household.retired) mark("Roth conversions in low-bracket years", goals.has("roth") ? "Stated Roth-conversion goal; current bracket " + pct(r.marginal, 0) : "Retired with pre-tax balances");
  if (r.magi && r.magi.roth > r.C.niitThreshold[p.filingStatus]) mark("Backdoor and mega-backdoor Roth", "MAGI is above the direct Roth contribution range");
  if (/HDHP/i.test(p.household.healthCoverage || "") || goals.has("hsa")) mark("Health savings account", (p.household.healthCoverage || "HDHP coverage") + (goals.has("hsa") ? " and a stated HSA goal" : ""));
  if (r.qbi && r.qbi.totalQBI > 0) {
    const dist = r.tiBeforeQBI - r.C.qbiThreshold[p.filingStatus];
    if (Math.abs(dist) < 200000) mark("Threshold management", "Taxable income before QBI is " + usd$(Math.abs(dist)) + (dist < 0 ? " under" : " over") + " the \u00a7199A threshold");
    mark("The taxable income cap", "QBI deduction of " + usd$(r.qbi.deduction) + " is in the model");
    if ((r.qbi.entities || []).length > 1) mark("Aggregation", (r.qbi.entities || []).length + " QBI entities could be aggregated");
  }
  if (p.household.medicare || age >= 63) mark("Medicare IRMAA", age >= 63 ? "Age " + age + " \u2014 IRMAA lookback window is live" : "Medicare enrolled");
  if (r.niit > 0 || goals.has("niit")) mark("Net investment income tax", r.niit > 0 ? usd$(r.niit) + " of NIIT in the current model" : "Stated NIIT goal");
  if (charity > 10000 || goals.has("daf") || goals.has("charitable")) mark("Bunching through a donor-advised fund", usd$(charity) + " of annual giving");
  const apprec = (p.assets || []).find(a => a.type === "brokerage" && a.basis != null && num(a.value) > num(a.basis));
  if (apprec && charity > 0) mark("Gifting appreciated securities", usd$(num(apprec.value) - num(apprec.basis)) + " of unrealized gain in the brokerage account");
  if (age >= 70 || goals.has("qcd")) mark("Qualified charitable distribution", age >= 70 ? "Age " + age + " \u2014 QCD-eligible" : "Stated QCD goal");
  if (schedC > 0 && String(p.household.dependentAges || "").split(/[,;\s]+/).some(x => x !== "" && num(x) < 18)) mark("Family employment", "Sole proprietorship with dependents under 18");
  if (num(p.deductions.stateIncomeTax) > 10000 && (schedC > 0 || hasSCorp)) mark("Pass-through entity tax election", usd$(num(p.deductions.stateIncomeTax)) + " of state income tax with passthrough income");
  if ((p.businesses || []).some(b => num(b.depreciation) > 0) || goals.has("bonus-depr")) mark("100% bonus depreciation", "Business depreciation is in the profile");
  if (goals.has("sec179")) mark("Section 179 expensing", "Stated \u00a7179 goal");
  if ((p.assets || []).some(a => a.type === "real-estate" && num(a.value) > 1000000)) mark("Cost segregation", "Real estate above $1M in the profile");
  return map;
}
function guideFirstSentence(text) {
  const i = text.indexOf(". ");
  return i > 0 && i < 130 ? text.slice(0, i + 1) : text.slice(0, 120) + (text.length > 120 ? "\u2026" : "");
}
function PlanningGuide({ year, client, baseResult, onAskAI, onAddNote }) {
  const relevance = useMemo(() => guideClientRelevance(client, baseResult), [client, baseResult]);
  const [onlyRelevant, setOnlyRelevant] = useState(false);
  const [cat, setCat] = useUIPref("guide:cat", GUIDE[0].cat);
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState("all");
  const [openItems, setOpenItems] = useState({});
  const ql = q.trim().toLowerCase();
  const searching = ql.length > 0;
  const matches = it => (!ql || (it.n + " " + it.b + " " + it.meta).toLowerCase().includes(ql)) && (risk === "all" || it.risk === risk) && (!onlyRelevant || relevance[it.n]);
  const visible = searching
    ? GUIDE.map(g => ({ cat: g.cat, items: g.items.filter(matches) })).filter(g => g.items.length)
    : GUIDE.filter(g => g.cat === cat).map(g => ({ cat: g.cat, items: g.items.filter(matches) }));
  const shownIds = visible.flatMap(g => g.items.map(it => g.cat + "::" + it.n));
  const setAll = v => {
    const m = { ...openItems };
    shownIds.forEach(id => { m[id] = v; });
    setOpenItems(m);
  };
  const lawSelected = !searching && cat === "__law";
  return EL("div", {
    className: "tp-stack"
  }, EL("div", {
    className: "tp-bubbles",
    role: "tablist",
    "aria-label": "Planning categories"
  }, EL("button", {
    type: "button",
    role: "tab",
    className: "tp-bubble" + (lawSelected ? " on" : ""),
    "aria-selected": lawSelected,
    onClick: () => { setCat("__law"); setQ(""); }
  }, "Law Changes", EL("em", null, OBBBA.length)), GUIDE.map(g => EL("button", {
    key: g.cat,
    type: "button",
    role: "tab",
    className: "tp-bubble" + (!searching && cat === g.cat ? " on" : ""),
    "aria-selected": !searching && cat === g.cat,
    onClick: () => setCat(g.cat)
  }, g.cat, EL("em", null, g.items.length)))), EL("div", {
    className: "tp-guide-filters"
  }, EL("input", {
    className: "tp-search",
    placeholder: "Search strategies across every category\u2026",
    value: q,
    onChange: e => setQ(e.target.value),
    "aria-label": "Search strategies"
  }), EL(Seg, {
    small: true,
    value: risk,
    onChange: setRisk,
    options: [{ v: "all", l: "All risk" }, { v: "low", l: "Lower" }, { v: "med", l: "Moderate" }, { v: "high", l: "Higher" }]
  }), client && EL("label", {
    className: "tp-check"
  }, EL("input", {
    type: "checkbox",
    checked: onlyRelevant,
    onChange: e => setOnlyRelevant(e.target.checked)
  }), " Applicable to " + (client.name || "current client")), EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => setAll(true)
  }, "Expand all"), EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => setAll(false)
  }, "Collapse all"), onAskAI && !lawSelected && EL("button", {
    className: "tp-mini ai",
    type: "button",
    onClick: () => onAskAI({
      question: "Review the planning-guide category \"" + (searching ? "search: " + q : cat) + "\" against the active scenario. Which of these strategies are applicable on the modeled facts, which are not, and what facts must be confirmed?",
      autoRun: true
    })
  }, I.chat, " Ask AI about this category")), lawSelected ? EL(Card, {
    title: "What changed under OBBBA",
    sub: TY[year].label
  }, EL("div", {
    className: "tp-lawgrid"
  }, OBBBA.map(h => EL("div", {
    key: h.t,
    className: "tp-lawcard"
  }, EL("div", {
    className: "tp-lawwhen"
  }, h.when), EL("div", {
    className: "tp-lawt"
  }, h.t), EL("div", {
    className: "tp-lawd"
  }, h.d), onAskAI && EL("button", {
    className: "tp-mini",
    type: "button",
    style: { marginTop: 8 },
    onClick: () => onAskAI({
      question: "Explain the planning significance of this law change for the active scenario: " + h.t + " \u2014 " + h.d,
      autoRun: true
    })
  }, "Open analysis"))))) : !visible.length ? EL("div", {
    className: "tp-guide-empty"
  }, "No strategies match", ql ? " \u201c" + q + "\u201d" : "", risk !== "all" ? " at that risk level" : "", ".") : visible.map(g => EL("div", {
    key: g.cat
  }, searching && EL("div", {
    className: "tp-minihead"
  }, g.cat), g.items.map(it => {
    const id = g.cat + "::" + it.n;
    const openIt = !!openItems[id];
    return EL("div", {
      key: it.n,
      className: "tp-acc"
    }, EL("button", {
      type: "button",
      className: "tp-acc-head",
      onClick: () => setOpenItems(m => ({ ...m, [id]: !m[id] })),
      "aria-expanded": openIt
    }, EL("span", {
      className: "tp-sec-chev" + (openIt ? " open" : "")
    }, I.chevR), EL("span", {
      className: "tp-acc-name"
    }, it.n), !openIt && EL("span", {
      className: "tp-acc-blurb"
    }, guideFirstSentence(it.b)), relevance[it.n] && EL("span", {
      className: "tp-pill ok",
      title: relevance[it.n]
    }, "Relevant"), EL("span", {
      className: "tp-pill " + RISK[it.risk].c
    }, RISK[it.risk].label)), openIt && EL("div", {
      className: "tp-acc-body"
    }, relevance[it.n] && EL("div", {
      className: "tp-subline",
      style: { marginBottom: 8 }
    }, EL("span", null, "Relevant to ", client ? client.name : "this client"), EL("strong", null, relevance[it.n])), it.b, EL("div", {
      className: "tp-consid-meta"
    }, it.meta), EL("div", {
      className: "tp-acc-actions"
    }, onAskAI && EL("button", {
      className: "tp-mini ai",
      type: "button",
      onClick: () => onAskAI({
        question: "Assess this strategy for the active scenario and, if applicable, propose the input changes to model it: " + it.n + ". " + it.b,
        autoRun: true
      })
    }, I.chat, " Model with AI"), onAddNote && EL("button", {
      className: "tp-mini",
      type: "button",
      onClick: () => onAddNote("Planning guide \u2014 " + it.n + ": " + it.b + " [" + it.meta + "]")
    }, "Save to workpapers"))));
  }))), EL("div", {
    className: "tp-disclaimer"
  }, EL("strong", null, "Advisory disclaimer."), " This tool produces directional modelling to support planning conversations. It is not a filed return, a formal tax opinion, or legal advice, and it performs no verification of source documents. Figures reflect federal law as amended by the One Big Beautiful Bill Act. State treatment, including bonus depreciation add-backs and pass-through entity taxes, is not modelled at all. Several strategies described here sit in higher-scrutiny territory and are sustained or lost on contemporaneous documentation. Confirm entity facts, basis, eligibility and records before acting."));
}

/* ============================================================================
   GOLDEN REGRESSION TEST — run live, in the app
   ========================================================================== */
function GoldenTestPanel() {
  const [open, setOpen] = useState(false);
  const t = useMemo(() => runGoldenTest(), []);
  const groups = [...new Set(t.rows.map(r => r.group))];
  const clean = t.failed === 0;
  return /*#__PURE__*/React.createElement(Card, {
    title: "Engine self-test",
    sub: clean ? t.passed + " of " + t.rows.length + " passing" : t.failed + " FAILING",
    right: /*#__PURE__*/React.createElement("button", {
      className: "tp-btn ghost sm",
      onClick: () => setOpen(v => !v)
    }, open ? "Hide detail" : "Show detail")
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-selftest " + (clean ? "ok" : "bad")
  }, clean ? I.check : I.alert, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, clean ? "All golden assertions pass." : t.failed + " assertion" + (t.failed === 1 ? "" : "s") + " failing — do not rely on output until resolved."), /*#__PURE__*/React.createElement("span", null, "The golden case is a sole proprietor versus an S corporation on $750,000 of profit before owner compensation, TY2025, married filing jointly, active non-SSTB, $35,000 itemized. It exercises the S-corporation conversion, the payroll-tax reconciliation, the Additional Medicare Tax and the full §199A W-2 wage limitation in a single pass. It runs every time this tab opens."))), /*#__PURE__*/React.createElement("div", {
    className: "tp-splitgrid",
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Result"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Sole proprietor"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "S corporation"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Change"))), /*#__PURE__*/React.createElement("tbody", null, [["Profit before owner compensation", t.A.economicIncome, t.B.economicIncome], ["Form 1040 total income", t.A.grossIncome, t.B.grossIncome], ["Adjusted gross income", t.A.agi, t.B.agi], ["QBI deduction", t.A.qbi.deduction, t.B.qbi.deduction], ["Taxable income", t.A.taxableIncome, t.B.taxableIncome], ["Federal income tax", t.A.fedIncomeTax, t.B.fedIncomeTax], ["Self-employment tax", t.A.seTax, t.B.seTax], ["Employee FICA", t.A.employeeFICA, t.B.employeeFICA], ["Employer FICA", t.A.employerFICA, t.B.employerFICA], ["Additional Medicare Tax", t.A.addlMedicare, t.B.addlMedicare]].map(r => /*#__PURE__*/React.createElement("tr", {
    key: r[0]
  }, /*#__PURE__*/React.createElement("td", null, r[0]), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(r[1])), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(r[2])), /*#__PURE__*/React.createElement("td", {
    className: "num sm " + (r[2] - r[1] < 0 ? "up" : r[2] - r[1] > 0 ? "down" : "")
  }, Math.abs(r[2] - r[1]) < 1 ? "—" : (r[2] - r[1] > 0 ? "+" : "") + usd(r[2] - r[1])))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Total federal economic tax"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(t.A.totalTax)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(t.B.totalTax)), /*#__PURE__*/React.createElement("td", {
    className: "num up"
  }, usd(t.B.totalTax - t.A.totalTax))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "After-tax cash"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(t.A.afterTaxCash)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(t.B.afterTaxCash)), /*#__PURE__*/React.createElement("td", {
    className: "num up"
  }, "+", usd(t.B.afterTaxCash - t.A.afterTaxCash))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Effective economic rate"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, pct(t.A.effectiveRate)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, pct(t.B.effectiveRate)), /*#__PURE__*/React.createElement("td", {
    className: "num sm up"
  }, pct(t.B.effectiveRate - t.A.effectiveRate))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Why the sole proprietor's §199A deduction is zero"), /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "20% of qualified business income"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(t.A.qbi.tentativeTotal))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "W-2 wage and UBIA limitation", /*#__PURE__*/React.createElement("em", {
    className: "tp-rownote"
  }, "no wages, no UBIA")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(t.A.qbi.wageLimitTotal))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "20% of taxable income net of capital gain"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(t.A.qbi.cap))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Least of the three"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(t.A.qbi.deduction))))), /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "S corporation — the wage limitation now binds"), /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "20% of qualified business income"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(t.B.qbi.tentativeTotal))), /*#__PURE__*/React.createElement("tr", {
    className: "best"
  }, /*#__PURE__*/React.createElement("td", null, "W-2 wage and UBIA limitation", /*#__PURE__*/React.createElement("em", {
    className: "tp-rownote"
  }, "50% of $150,000 of owner compensation")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(t.B.qbi.wageLimitTotal))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "20% of taxable income net of capital gain"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(t.B.qbi.cap))), /*#__PURE__*/React.createElement("tr", {
    className: "tot"
  }, /*#__PURE__*/React.createElement("td", null, "Least of the three"), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(t.B.qbi.deduction))))), /*#__PURE__*/React.createElement(Note, null, "Paying reasonable compensation is what creates the W-2 wages that support the deduction. With no wages the limitation is zero and the entire §199A benefit is lost, which is most of the $45,886 swing."))), open && /*#__PURE__*/React.createElement("div", {
    className: "tp-tblwrap",
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Assertion"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Computed"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Expected"), /*#__PURE__*/React.createElement("th", {
    className: "ctr"
  }, "Result"))), /*#__PURE__*/React.createElement("tbody", null, groups.map(g => /*#__PURE__*/React.createElement(Fragment, {
    key: g
  }, /*#__PURE__*/React.createElement("tr", {
    className: "sec"
  }, /*#__PURE__*/React.createElement("td", {
    colSpan: 4
  }, g)), t.rows.filter(r => r.group === g).map(r => /*#__PURE__*/React.createElement("tr", {
    key: g + r.label,
    className: r.ok ? "" : "bad"
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("code", {
    className: "tp-code"
  }, r.label)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(r.actual)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, usd$(r.expected)), /*#__PURE__*/React.createElement("td", {
    className: "ctr"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tp-pill " + (r.ok ? "ok" : "bad")
  }, r.ok ? "PASS" : "FAIL"))))))))));
}

/* ============================================================================
   REFERENCE TABLES — the statutory figures the engine actually uses
   ========================================================================== */
function ReferenceTables({
  year,
  status
}) {
  const C = TY[year],
    O = TY[year === 2025 ? 2026 : 2025];
  const [q, setQ] = useState("");
  const rows = [["Rates and brackets", "Standard deduction", C.stdDeduction[status], O.stdDeduction[status], "IRC §63 as amended by OBBBA"], ["Rates and brackets", "Additional standard deduction, age 65 or blind", status === "mfj" || status === "mfs" ? C.addlStdDedMarried : C.addlStdDedUnmarried, status === "mfj" || status === "mfs" ? O.addlStdDedMarried : O.addlStdDedUnmarried, "IRC §63(f)"], ["Rates and brackets", "Top of the 22% bracket", C.brackets[status][3][0], O.brackets[status][3][0], "Rev. Proc."], ["Rates and brackets", "Start of the 37% bracket", C.brackets[status][6][0], O.brackets[status][6][0], "Rev. Proc."], ["Rates and brackets", "Top of the 0% capital gain rate", C.ltcg[status].zero, O.ltcg[status].zero, "IRC §1(h)"], ["Rates and brackets", "Top of the 15% capital gain rate", C.ltcg[status].fifteen, O.ltcg[status].fifteen, "IRC §1(h)"], ["Employment tax", "Social Security wage base", C.ssWageBase, O.ssWageBase, "SSA contribution and benefit base"], ["Employment tax", "Additional Medicare Tax threshold", C.addlMedThreshold[status], O.addlMedThreshold[status], "IRC §3101(b)(2) — never indexed"], ["Employment tax", "Net investment income tax threshold", C.niitThreshold[status], O.niitThreshold[status], "IRC §1411 — never indexed"], ["Retirement", "Elective deferral, §402(g)", C.deferral402g, O.deferral402g, "Notice"], ["Retirement", "Catch-up, age 50 or older", C.catchup50, O.catchup50, "IRC §414(v)"], ["Retirement", "Super catch-up, ages 60 to 63", C.superCatchup6063, O.superCatchup6063, "SECURE 2.0 §109"], ["Retirement", "Annual additions, §415(c)", C.limit415c, O.limit415c, "IRC §415(c)"], ["Retirement", "Annual benefit, §415(b)", C.limit415b, O.limit415b, "IRC §415(b)"], ["Retirement", "Compensation limit, §401(a)(17)", C.compLimit401a17, O.compLimit401a17, "IRC §401(a)(17)"], ["Retirement", "SIMPLE deferral", C.simpleDeferral, O.simpleDeferral, "IRC §408(p)(2)(E)"], ["Retirement", "SIMPLE deferral, small plans", C.simpleDeferralHigher, O.simpleDeferralHigher, "SECURE 2.0 §117"], ["Retirement", "SIMPLE catch-up", C.simpleCatchup, O.simpleCatchup, "IRC §414(v)(2)(B)(ii)"], ["Retirement", "IRA contribution limit", C.iraLimit, O.iraLimit, "IRC §219(b)(5)"], ["Retirement", "IRA catch-up", C.iraCatchup, O.iraCatchup, "IRC §219(b)(5)(B) — indexed from 2026"], ["Health", "HSA limit, self-only", C.hsa.self, O.hsa.self, "IRC §223(b)"], ["Health", "HSA limit, family", C.hsa.family, O.hsa.family, "IRC §223(b)"], ["Health", "HSA catch-up, age 55 or older", C.hsa.catchup55, O.hsa.catchup55, "IRC §223(b)(3)(B) — statutory, not indexed"], ["Health", "HDHP minimum deductible, self-only", C.hdhp.minDedSelf, O.hdhp.minDedSelf, "IRC §223(c)(2)"], ["Health", "HDHP out-of-pocket maximum, self-only", C.hdhp.oopSelf, O.hdhp.oopSelf, "IRC §223(c)(2)"], ["Deductions", "SALT cap", C.saltCap[status], O.saltCap[status], "IRC §164(b)(6) as amended by OBBBA"], ["Deductions", "SALT phase-down threshold", C.saltThreshold[status], O.saltThreshold[status], "IRC §164(b)(6)"], ["Deductions", "SALT floor", C.saltFloor[status], O.saltFloor[status], "IRC §164(b)(6)"], ["Section 199A", "Threshold amount", C.qbiThreshold[status], O.qbiThreshold[status], "IRC §199A(e)(2)"], ["Section 199A", "Phase-in range width", C.qbiPhaseInWidth[status], O.qbiPhaseInWidth[status], "IRC §199A(b)(3) as widened by OBBBA"], ["Section 199A", "Minimum deduction for active businesses", C.qbiMinDeduction, O.qbiMinDeduction, "OBBBA — first effective 2026"], ["OBBBA temporary", "Senior deduction", C.seniorDeduction.amount, O.seniorDeduction.amount, "2025 through 2028"], ["OBBBA temporary", "Qualified tips cap", C.tips.cap, O.tips.cap, "2025 through 2028"], ["OBBBA temporary", "Qualified overtime cap", C.overtime.cap[status], O.overtime.cap[status], "2025 through 2028"], ["OBBBA temporary", "Car loan interest cap", C.autoLoan.cap, O.autoLoan.cap, "2025 through 2028"], ["Credits", "Child tax credit per child", C.ctc.amount, O.ctc.amount, "IRC §24 as amended by OBBBA"], ["Credits", "Child tax credit phase-out threshold", C.ctc.threshold[status], O.ctc.threshold[status], "IRC §24(b)(1) — not indexed"], ["Business", "Section 179 limit", C.sec179.limit, O.sec179.limit, "IRC §179 as amended by OBBBA"], ["Business", "Section 179 phase-out threshold", C.sec179.phaseout, O.sec179.phaseout, "IRC §179(b)(2)"], ["Transfer tax", "Basic exclusion amount", C.estate.exclusion, O.estate.exclusion, "IRC §2010(c)(3)"], ["Transfer tax", "Annual gift exclusion", C.estate.annualGift, O.estate.annualGift, "IRC §2503(b)"]];
  const ql = q.trim().toLowerCase();
  const filtered = rows.filter(r => !ql || (r[0] + " " + r[1] + " " + r[4]).toLowerCase().includes(ql));
  const cats = [...new Set(filtered.map(r => r[0]))];
  const otherYear = year === 2025 ? 2026 : 2025;
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-stack"
  }, /*#__PURE__*/React.createElement(GoldenTestPanel, null), /*#__PURE__*/React.createElement(Note, null, "Every figure the engine uses, side by side across both years, for the currently selected filing status (", STATUSES.find(s => s.v === status).l, "). Three of these are worth committing to memory because secondary sources routinely get them wrong: the 2025 standard deduction and §179 limits published in Rev. Proc. 2024-40 were superseded by OBBBA; the 2026 head-of-household bracket boundaries are $25 below the single filer's; and the 2026 §199A threshold is $201,750 for single and head of household but $201,775 for married filing separately."), /*#__PURE__*/React.createElement("input", {
    className: "tp-search",
    placeholder: "Search figures, code sections, topics…",
    value: q,
    onChange: e => setQ(e.target.value)
  }), cats.map(c => /*#__PURE__*/React.createElement(Card, {
    key: c,
    title: c
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Item"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, TY[year].label), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, TY[otherYear].label), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Change"), /*#__PURE__*/React.createElement("th", null, "Authority"))), /*#__PURE__*/React.createElement("tbody", null, filtered.filter(r => r[0] === c).map(r => {
    const d = (r[3] || 0) - (r[2] || 0);
    const shown = year === 2025 ? d : -d;
    return /*#__PURE__*/React.createElement("tr", {
      key: r[1]
    }, /*#__PURE__*/React.createElement("td", null, r[1]), /*#__PURE__*/React.createElement("td", {
      className: "num strong"
    }, usd$(r[2])), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(r[3])), /*#__PURE__*/React.createElement("td", {
      className: "num sm " + (shown > 0 ? "up" : shown < 0 ? "down" : "")
    }, d === 0 ? "—" : year === 2025 ? (d > 0 ? "+" : "") + usd(d) + " in 2026" : (d < 0 ? "+" : "") + usd(-d) + " from 2025"), /*#__PURE__*/React.createElement("td", {
      className: "sm"
    }, r[4]));
  }))))), !filtered.length && /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    className: "tp-empty"
  }, "Nothing matches “", q, "”.")), /*#__PURE__*/React.createElement(Card, {
    title: "Assumptions and known gaps"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "Long-term care premium cap, ages 41-50")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "Set to $900 for 2025 per Rev. Proc. 2024-40. The uploaded CCH guide prints $990, which breaks the roughly 2.3% year-over-year progression every other age band follows ($880 in 2024). Worth confirming against your CCH source, since the two conflict.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "2026 long-term care premium caps")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "The 2025 age-band caps are carried forward. The 2026 figures were not confirmed to a primary source.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "2026 SIMPLE catch-up for small plans")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "Sourced at $3,850, unchanged from 2025, but that is now below the $4,000 regular SIMPLE catch-up — which cannot be right for a limit defined as 110% of it. Not used by the engine; shown in the tables above for reference only. Confirm before relying on it.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "S corporation payroll tax")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "Carried at the combined employer and employee rate so an S election compares like for like against a sole proprietorship, where the owner bears all 15.3%. The employer half is the corporation's deduction, so a K-1 entered here should already be net of it. It is excluded from the Form 1040 balance due.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "S corporation retirement plan contributions")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "An employer plan contribution is deducted by the corporation on Form 1120-S, not by the shareholder, so it is not taken as a Schedule 1 adjustment here. Enter the K-1 net of it.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "Net investment income")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "Portfolio income plus net capital gain plus passthrough entities you flag as passive. Non-passive trade or business income is excluded under §1411(c)(2)(A). Net investment income is not reduced by allocable deductions such as investment interest or allocable state tax.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "Capital losses")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "Netted, with the excess loss limited to $3,000 ($1,500 MFS) against ordinary income and the remainder reported as a carryforward. The carryforward is not automatically applied to a later year.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "Refundable credits")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "The child tax credit is applied only against income tax. The additional child tax credit, the $500 credit for other dependents, and the earned income credit are not modelled.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "General partner K-1 income")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "Passthrough income is never subjected to self-employment tax. A general partner's distributive share of trade or business income is in fact SE income and would need to be entered on Schedule C to be captured.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "Charitable percentage limits")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "Cash, non-cash and carryover are collapsed into a single 60%-of-AGI bucket. Appreciated capital gain property is subject to a 30% limit. The treatment of amounts disallowed by the new 0.5% floor as carryovers is unsettled.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "ACA credit below 100% of FPL")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "The applicable percentage is shown across the whole range. §36B(c)(1)(A) generally denies the credit below 100% of the federal poverty level.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "2026 SALT cap for married filing separately")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "Derived as one half of the $40,400 joint cap. The $40,400 cap and $505,000 threshold are sourced; the MFS split is inferred from the 2025 statutory treatment.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "2026 Schedule 1-A caps and thresholds")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "Rev. Proc. 2025-32 contains no inflation adjustment for the senior, tips, overtime or car loan deductions, so the 2025 amounts are carried forward. Confirm against the 2026 Schedule 1-A when released.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "Alternative minimum tax")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "Not modelled. A scenario with large private activity bond interest, incentive stock option exercises, or heavy depreciation add-backs needs a separate Form 6251 analysis.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "State and local tax")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "Not modelled at all, including pass-through entity taxes and state depreciation non-conformity.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "Social Security taxability")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "Entered directly rather than computed. The provisional income worksheet is not implemented.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "QBI cap ordering")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "The 20%-of-taxable-income cap is computed after the Schedule 1-A deductions reduce taxable income, matching the Form 1040 line sequence.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "The 2/37 itemized reduction and §199A are circular")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "The §68 base depends on the §199A deduction, which depends on itemized deductions. Resolved with a single iteration, which converges to within a few dollars. Only relevant for 2026 taxable income above the 37% bracket.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, "IRMAA lookback")), /*#__PURE__*/React.createElement("td", {
    className: "sm"
  }, "The module is fed the current scenario's MAGI so the thresholds can be planned against. Actual 2026 premiums are set by the 2024 return."))))));
}
