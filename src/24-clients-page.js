/* ==== 24-clients-page ==== */
/* ============================================================================
   CLIENT PROFILES PAGE — client cards with Set Active, add/copy/archive/
   import/export, and the full profile editor: household, income, assets,
   businesses, deductions, goals, constraints, missing facts, notes.
   Every tax figure shown is computed by the engine from the profile's base
   scenario; the profile stores facts only.
   ========================================================================== */

I.userIcon = /*#__PURE__*/React.createElement(Icon, {
  d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "7",
    r: "4"
  }))
});

const CLIENT_TABS = [["overview", "Overview"], ["household", "Household"], ["income", "Income"], ["assets", "Assets & Accounts"], ["business", "Business Interests"], ["deductions", "Deductions & Payments"], ["goals", "Planning Goals"], ["constraints", "Constraints"], ["missing", "Missing Facts"], ["notes", "Notes"]];
const ASSET_TYPES = [["cash", "Cash"], ["brokerage", "Taxable brokerage"], ["ira", "Traditional IRA"], ["roth", "Roth IRA"], ["401k", "401(k)/403(b)"], ["sep", "SEP IRA"], ["simple", "SIMPLE IRA"], ["hsa", "HSA"], ["529", "529 plan"], ["real-estate", "Real estate"], ["business", "Business interest"], ["equity-comp", "Equity compensation"], ["insurance", "Life insurance"], ["trust", "Trust interest"], ["alt", "Alternative/crypto"], ["debt", "Debt / mortgage"]];
const LIQUIDITY_LEVELS = ["Liquid", "Restricted", "Retirement", "Illiquid", "—"];

function ClientField({ label, hint, value, onChange, type, options }) {
  if (type === "select") return EL("label", {
    className: "tp-field"
  }, EL("span", null, label, hint && EL("em", null, hint)), EL("select", {
    className: "tp-txt",
    value: value == null ? "" : value,
    onChange: e => onChange(e.target.value)
  }, options.map(o => EL("option", {
    key: o[0],
    value: o[0]
  }, o[1]))));
  if (type === "check") return EL("label", {
    className: "tp-check",
    style: { marginTop: 20 }
  }, EL("input", {
    type: "checkbox",
    checked: !!value,
    onChange: e => onChange(e.target.checked)
  }), " ", label);
  if (type === "text") return EL("label", {
    className: "tp-field"
  }, EL("span", null, label, hint && EL("em", null, hint)), EL("input", {
    className: "tp-txt",
    value: value == null ? "" : value,
    onChange: e => onChange(e.target.value)
  }));
  return EL(Field, { label, hint, value: value == null ? 0 : value, onChange });
}

/* ---- one client card in the roster ---- */
function ClientCard({ c, active, tax, onSetActive, onCopy, onArchive, onExport }) {
  const p = c.profile;
  const bizIncome = (p.businesses || []).reduce((a, b) => a + num(b.grossReceipts) - num(b.operatingExpenses), 0) + num(p.income.schedCGross) - num(p.income.schedCExpenses);
  const entity = (p.businesses || []).length ? p.businesses.map(b => b.entityType === "scorp" ? "S-Corporation" : "Sole Proprietor").join(", ") : num(p.income.schedCGross) > 0 ? "Sole Proprietor" : "Individual";
  return EL("div", {
    className: "tp-clientcard" + (active ? " on" : "")
  }, EL("div", {
    className: "tp-clientcard-top"
  }, EL("div", null, EL("strong", null, c.name), EL("em", null, c.clientId, " · TY", p.taxYear)), active && EL("span", {
    className: "tp-tag green"
  }, "Active")), EL("div", {
    className: "tp-vtags"
  }, EL("span", {
    className: "tp-tag"
  }, (STATUSES.find(x => x.v === p.filingStatus) || {}).l || p.filingStatus), p.state && EL("span", {
    className: "tp-tag"
  }, p.state), p.household.taxpayerAge != null && EL("span", {
    className: "tp-tag"
  }, "Age ", p.household.taxpayerAge), String(c.clientId).indexOf("DEMO") === 0 && EL("span", {
    className: "tp-tag amber"
  }, "Demo"), (c.reviewFlags || []).length > 0 && EL("span", {
    className: "tp-tag amber",
    title: c.reviewFlags.join("\n")
  }, "Identity review")), EL("div", {
    className: "tp-statstack"
  }, EL(StatLine, {
    label: "Net business income",
    value: bizIncome !== 0 ? usd$(bizIncome) : "—"
  }), EL(StatLine, {
    label: "Est. total tax (engine)",
    value: tax == null ? "—" : usd$(tax),
    cls: "bad"
  }), EL(StatLine, {
    label: "Entity",
    value: entity
  }), EL(StatLine, {
    label: "Profile complete",
    value: profileCompletion(c) + "%"
  })), EL("div", {
    className: "tp-clientcard-actions"
  }, !active && EL("button", {
    className: "tp-btn solid sm",
    type: "button",
    onClick: onSetActive
  }, "Set Active"), EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: onCopy
  }, "Copy"), EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: onExport
  }, "Export"), EL("button", {
    className: "tp-mini",
    type: "button",
    onClick: onArchive,
    title: "Archive removes the client from the roster; data is kept and can be restored by import"
  }, "Archive")));
}

function ClientProfilesPage({
  clients,
  activeId,
  setActiveClient,
  updateClient,
  setClients,
  results,
  status,
  year,
  logEvent,
  alignments,
  onCreateScenario,
  onAskAI,
  onBuildReport,
  goto
}) {
  const [ctab, setCtab] = useUIPref("clients:tab", "overview");
  const [confirmArchive, setConfirmArchive] = useState(null);
  const fileRef = useRef(null);
  const client = clients.find(c => c.id === activeId) || clients[0];
  const p = client.profile;
  const base = results[0];
  const A = base.r;
  const totals = clientAssetTotals(client);

  /* Roster taxes: every card's figure comes from the engine on that client's
     own base scenario — nothing is stored or hardcoded. */
  const rosterTax = useMemo(() => {
    const m = {};
    clients.forEach(c => {
      try {
        const y = TY[c.profile.taxYear] ? c.profile.taxYear : 2025;
        m[c.id] = c.scenarios[0] ? computeScenario(c.scenarios[0], c.profile.filingStatus, y).totalTax : null;
      } catch (e) {
        m[c.id] = null;
      }
    });
    return m;
  }, [clients]);

  const upC = fn => updateClient(client.id, fn);
  const upProfile = patch => upC(c => ({ ...c, profile: { ...c.profile, ...patch } }));
  const upSub = (key, patch) => upC(c => ({
    ...c,
    profile: { ...c.profile, [key]: { ...c.profile[key], ...patch } }
  }));

  const addClient = () => {
    const nc = blankClient("New client", clients);
    nc.scenarios = [profileToScenario(nc)];
    setClients(cs => [...cs, nc]);
    setActiveClient(nc.id);
    setCtab("household");
    logEvent({ clientId: nc.id, label: "Client added", kind: "structure", scenarioName: nc.name });
  };
  const copyClient = src => {
    const nc = structuredClone(src);
    nc.id = uid();
    /* Copies get their own unique client number; the source is recorded. */
    nc.clientId = nextClientNumber(clients);
    nc.legacyClientId = src.clientId;
    nc.reviewFlags = [];
    nc.name = src.name + " (copy)";
    nc.archived = false;
    nc.scenarios = nc.scenarios.map(s => ({ ...s, id: uid() }));
    setClients(cs => [...cs, nc]);
    logEvent({ clientId: nc.id, label: "Client copied", kind: "structure", scenarioName: nc.name, from: src.name });
  };
  const archiveClient = c => {
    updateClient(c.id, x => ({ ...x, archived: true }));
    logEvent({ clientId: c.id, label: "Client archived", kind: "structure", scenarioName: c.name });
    if (c.id === activeId) {
      const next = clients.find(x => x.id !== c.id && !x.archived);
      if (next) setActiveClient(next.id);
    }
    setConfirmArchive(null);
  };
  const exportClient = c => {
    const blob = new Blob([JSON.stringify({ kind: "tp-client", version: 1, client: c }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (c.clientId || c.name).replace(/[^\w-]+/g, "_") + ".client.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 800);
  };
  const importClient = file => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const j = JSON.parse(reader.result);
        const c = j && j.kind === "tp-client" ? j.client : j;
        if (!c || !c.profile || !Array.isArray(c.scenarios)) throw new Error("Not a client file");
        c.id = uid();
        c.archived = false;
        /* An imported file may carry a client number already in use here —
           keep both records, give the import a fresh number, flag it. */
        if (clients.some(x => String(x.clientId) === String(c.clientId))) {
          c.legacyClientId = c.clientId;
          c.clientId = nextClientNumber(clients);
          c.reviewFlags = (c.reviewFlags || []).concat("Imported with client number " + c.legacyClientId + " already used by another client; now shown as " + c.clientId + ".");
        }
        c.scenarios = c.scenarios.map(s => ({ ...s, id: uid() }));
        setClients(cs => [...cs, c]);
        setActiveClient(c.id);
        logEvent({ clientId: c.id, label: "Client imported", kind: "structure", scenarioName: c.name });
      } catch (e) {
        alert("Import failed: " + e.message);
      }
    };
    reader.readAsText(file);
  };
  const rebuildBase = () => {
    upC(c => ({ ...c, scenarios: [profileToScenario(c), ...c.scenarios.slice(1)] }));
    logEvent({ label: "Base scenario rebuilt from profile facts", kind: "structure", scenarioName: client.name });
  };

  /* ---- goals helpers ---- */
  const setGoals = fn => upC(c => ({ ...c, goals: fn(c.goals || []) }));
  const goalRow = g => EL("div", {
    key: g.id,
    className: "tp-goalrow"
  }, EL("select", {
    className: "tp-mini-sel",
    style: { width: 52 },
    value: g.priority,
    onChange: e => setGoals(gs => gs.map(x => x.id === g.id ? { ...x, priority: num(e.target.value) } : x)),
    "aria-label": "Priority"
  }, [1, 2, 3, 4, 5].map(n => EL("option", { key: n, value: n }, n))), EL("div", {
    className: "tp-goalrow-main"
  }, EL("strong", null, g.label), g.reason && EL("em", null, g.reason)), EL("select", {
    className: "tp-mini-sel",
    style: { width: 120 },
    value: g.classification,
    onChange: e => setGoals(gs => gs.map(x => x.id === g.id ? { ...x, classification: e.target.value } : x))
  }, GOAL_CLASSES.map(cl => EL("option", { key: cl, value: cl }, cl))), EL(Money, {
    value: g.targetAmount || 0,
    onChange: v => setGoals(gs => gs.map(x => x.id === g.id ? { ...x, targetAmount: v } : x)),
    placeholder: "target",
    className: "tp-goal-target"
  }), EL("div", {
    className: "tp-goalrow-acts"
  }, EL("button", {
    className: "tp-mini",
    type: "button",
    title: "Copy the base scenario as a working scenario for this goal",
    onClick: () => onCreateScenario("Goal — " + g.label, structuredClone(base.s))
  }, "Scenario"), EL("button", {
    className: "tp-mini ai",
    type: "button",
    onClick: () => onAskAI({
      question: "Analyze the goal \"" + g.label + "\" for " + client.name + " (priority " + g.priority + ", " + g.classification + "). " + (g.reason || "") + " Assess the current position, quantify what the engine shows, propose scenario changes to test, and list the facts to confirm.",
      autoRun: true
    })
  }, "Ask AI"), EL("button", {
    className: "tp-iconbtn",
    type: "button",
    "aria-label": "Remove goal",
    onClick: () => setGoals(gs => gs.filter(x => x.id !== g.id))
  }, I.trash)));

  const grid = kids => EL("div", { className: "tp-grid3" }, kids);
  const inc = p.income,
    ded = p.deductions;

  return EL("div", {
    className: "tp-stack"
  },
  /* ---------------- roster ---------------- */
  EL("div", {
    className: "tp-inline",
    style: { justifyContent: "space-between" }
  }, EL("p", {
    className: "tp-groupdef",
    style: { padding: 0 }
  }, "Manage client profiles — the active client drives every calculation, scenario, calculator, report and AI analysis. Scenarios never mix across clients."), EL("div", {
    className: "tp-inline"
  }, EL("button", {
    className: "tp-btn solid sm",
    type: "button",
    onClick: addClient
  }, I.plus, " Add client"), EL("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => fileRef.current && fileRef.current.click()
  }, "Import client"), EL("input", {
    ref: fileRef,
    type: "file",
    accept: ".json",
    style: { display: "none" },
    onChange: e => {
      if (e.target.files[0]) importClient(e.target.files[0]);
      e.target.value = "";
    }
  }))), EL("div", {
    className: "tp-clientgrid"
  }, clients.filter(c => !c.archived).map(c => EL(ClientCard, {
    key: c.id,
    c,
    active: c.id === client.id,
    tax: rosterTax[c.id],
    onSetActive: () => setActiveClient(c.id),
    onCopy: () => copyClient(c),
    onArchive: () => setConfirmArchive(c.id),
    onExport: () => exportClient(c)
  }))), confirmArchive && (() => {
    const c = clients.find(x => x.id === confirmArchive);
    return c ? EL("div", {
      className: "tp-validbar"
    }, EL("strong", null, "Archive ", c.name, "?"), " The client is removed from the roster; export first to keep a file copy.", EL("button", {
      className: "tp-btn solid sm",
      type: "button",
      onClick: () => archiveClient(c)
    }, "Archive"), EL("button", {
      className: "tp-btn ghost sm",
      type: "button",
      onClick: () => setConfirmArchive(null)
    }, "Cancel")) : null;
  })(),

  /* ---------------- active client detail ---------------- */
  EL("div", {
    className: "tp-client-head"
  }, EL("div", null, EL("h3", null, client.name), EL("em", null, client.clientId, " · TY", p.taxYear, " · ", (STATUSES.find(x => x.v === p.filingStatus) || {}).l, p.state ? " · " + p.state : "", " · Profile ", profileCompletion(client), "% complete · ", (client.missingFacts || []).length, " missing fact", (client.missingFacts || []).length === 1 ? "" : "s", " · Updated ", new Date(client.updatedAt).toLocaleDateString())), EL("div", {
    className: "tp-inline"
  }, EL("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => setCtab("household")
  }, "Edit profile"), EL("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => onAskAI({
      question: "Provide a full advisory analysis for " + client.name + ": current position, most relevant strategies given the stated goals and constraints, strategies rejected because of the constraints, and the facts that must be confirmed.",
      autoRun: true
    })
  }, I.chat, " Analyze with AI"), EL("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => onCreateScenario("Planning scenario " + (client.scenarios.length + 1), structuredClone(base.s))
  }, "Create scenario"), EL("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: onBuildReport
  }, "Build report"), EL("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => exportClient(client)
  }, "Export profile"))),
  EL("div", {
    className: "tp-bubbles"
  }, CLIENT_TABS.map(t => EL("button", {
    key: t[0],
    type: "button",
    className: "tp-bubble" + (ctab === t[0] ? " on" : ""),
    "aria-selected": ctab === t[0],
    onClick: () => setCtab(t[0])
  }, t[1], t[0] === "goals" && EL("em", null, (client.goals || []).length), t[0] === "missing" && (client.missingFacts || []).length > 0 && EL("em", null, (client.missingFacts || []).length)))),

  /* ---- Overview ---- */
  ctab === "overview" && EL(React.Fragment, null, EL("div", {
    className: "tp-kpis"
  }, [
    ["Modeled total income", usd$(A.grossIncome), "engine · base scenario"],
    ["Adjusted gross income", usd$(A.agi), "engine · base scenario"],
    ["Taxable income", usd$(A.taxableIncome), A.deductionKind.toLowerCase() + " deduction"],
    ["Estimated federal tax", usd$(A.totalTax), pct(A.effectiveRate) + " effective · " + pct(A.marginal, 0) + " bracket"],
    ["Net worth modeled", usd$(totals.total), "assets less debt (profile facts)"],
    ["Liquid assets", usd$(totals.liquid), "retirement " + usd$(totals.retirement)],
    ["Payments credited", usd$(num(p.payments.withholding) + num(p.payments.estimatedPayments)), "withholding + estimates"],
    ["Top planning goal", (client.goals || []).slice().sort((a, b) => a.priority - b.priority)[0] ? client.goals.slice().sort((a, b) => a.priority - b.priority)[0].label : "—", "see Planning Goals"]
  ].map(k => EL("div", {
    key: k[0],
    className: "tp-kpi"
  }, EL("span", null, k[0]), EL("strong", null, k[1]), EL("em", null, k[2])))), EL("div", {
    className: "tp-2col"
  }, EL(Card, {
    title: "Current tax goals",
    right: EL("button", {
      className: "tp-mini",
      type: "button",
      onClick: () => setCtab("goals")
    }, "Manage")
  }, !(client.goals || []).length ? EL("div", {
    className: "tp-empty"
  }, "No goals recorded yet.") : EL("table", {
    className: "tp-tbl"
  }, EL("tbody", null, client.goals.slice().sort((a, b) => a.priority - b.priority).slice(0, 6).map(g => EL("tr", {
    key: g.id
  }, EL("td", null, g.priority, ". ", g.label), EL("td", {
    className: "num"
  }, EL("span", {
    className: "tp-tag " + (g.classification === "Primary" ? "green" : "")
  }, g.classification))))))), EL(Card, {
    title: "Facts requiring confirmation",
    sub: (client.missingFacts || []).length + " open"
  }, !(client.missingFacts || []).length ? EL("div", {
    className: "tp-clean"
  }, I.check, " No unconfirmed facts recorded.") : EL("div", {
    className: "tp-stack"
  }, client.missingFacts.map((f, i) => EL("div", {
    key: i,
    className: "tp-vchip warn",
    style: { maxWidth: "100%" }
  }, f)), EL(Note, null, "These facts are passed to the AI as unresolved — the AI must ask about them, never invent them.")))), EL("div", {
    className: "tp-inline"
  }, EL("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: rebuildBase,
    title: "Replace the base scenario with a fresh deterministic mapping of the profile facts (logged)"
  }, "Rebuild base scenario from profile"), EL("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => goto("scenarios")
  }, "Open scenarios ", I.chevR))),

  /* ---- Household ---- */
  ctab === "household" && EL(Card, {
    title: "Household"
  }, grid([EL(ClientField, {
    key: "name",
    label: "Client / household name",
    type: "text",
    value: client.name,
    onChange: v => upC(c => ({ ...c, name: v }))
  }), EL(ClientField, {
    key: "cid",
    label: "Client identifier",
    type: "text",
    value: client.clientId,
    onChange: v => upC(c => ({ ...c, clientId: v }))
  }), EL(ClientField, {
    key: "ty",
    label: "Tax year",
    type: "select",
    options: [[2025, "TY2025"], [2026, "TY2026"]],
    value: p.taxYear,
    onChange: v => upProfile({ taxYear: num(v) })
  }), EL(ClientField, {
    key: "fs",
    label: "Filing status",
    type: "select",
    options: STATUSES.map(x => [x.v, x.l]),
    value: p.filingStatus,
    onChange: v => upProfile({ filingStatus: v })
  }), EL(ClientField, {
    key: "st",
    label: "State of residence",
    hint: "state tax not modeled",
    type: "text",
    value: p.state,
    onChange: v => upProfile({ state: v })
  }), EL(ClientField, {
    key: "tp",
    label: "Taxpayer name",
    type: "text",
    value: p.household.taxpayer,
    onChange: v => upSub("household", { taxpayer: v })
  }), EL(ClientField, {
    key: "sp",
    label: "Spouse name",
    type: "text",
    value: p.household.spouse,
    onChange: v => upSub("household", { spouse: v })
  }), EL(ClientField, {
    key: "ta",
    label: "Taxpayer age",
    value: p.household.taxpayerAge,
    onChange: v => upSub("household", { taxpayerAge: num(v) })
  }), EL(ClientField, {
    key: "sa",
    label: "Spouse age",
    value: p.household.spouseAge,
    onChange: v => upSub("household", { spouseAge: num(v) })
  }), EL(ClientField, {
    key: "dep",
    label: "Dependents",
    value: p.household.dependents,
    onChange: v => upSub("household", { dependents: num(v) })
  }), EL(ClientField, {
    key: "depa",
    label: "Dependent ages",
    hint: "comma-separated; under-17 drives CTC",
    type: "text",
    value: p.household.dependentAges,
    onChange: v => upSub("household", { dependentAges: v })
  }), EL(ClientField, {
    key: "col",
    label: "College status",
    type: "text",
    value: p.household.collegeStatus,
    onChange: v => upSub("household", { collegeStatus: v })
  }), EL(ClientField, {
    key: "emp",
    label: "Employment status",
    type: "text",
    value: p.household.employmentStatus,
    onChange: v => upSub("household", { employmentStatus: v })
  }), EL(ClientField, {
    key: "cov",
    label: "Health coverage",
    type: "text",
    value: p.household.healthCoverage,
    onChange: v => upSub("household", { healthCoverage: v })
  }), EL(ClientField, {
    key: "ret",
    label: "Retired",
    type: "check",
    value: p.household.retired,
    onChange: v => upSub("household", { retired: v })
  }), EL(ClientField, {
    key: "med",
    label: "Medicare enrolled",
    type: "check",
    value: p.household.medicare,
    onChange: v => upSub("household", { medicare: v })
  }), EL(ClientField, {
    key: "risk",
    label: "Risk tolerance",
    type: "text",
    value: p.riskTolerance,
    onChange: v => upProfile({ riskTolerance: v })
  }), EL(ClientField, {
    key: "arisk",
    label: "Audit-risk tolerance",
    type: "text",
    value: p.auditRiskTolerance,
    onChange: v => upProfile({ auditRiskTolerance: v })
  })]), EL(Note, null, "Filing status and tax year set here drive the whole application for this client. Changes affect the engine immediately; use “Rebuild base scenario from profile” on the Overview tab after larger fact changes.")),

  /* ---- Income ---- */
  ctab === "income" && EL(Card, {
    title: "Income facts",
    sub: "annual amounts"
  }, grid([["w2Wages", "Taxpayer W-2 wages"], ["bonus", "Bonus"], ["equityComp", "Equity compensation vesting"], ["spouseW2", "Spouse W-2 wages"], ["schedCGross", "Schedule C gross receipts", "use Business Interests for detail"], ["schedCExpenses", "Schedule C expenses"], ["taxableInterest", "Taxable interest"], ["taxExemptInterest", "Tax-exempt interest"], ["ordinaryDividends", "Ordinary dividends"], ["qualifiedDividends", "— of which qualified"], ["shortTermGains", "Short-term capital gains"], ["longTermGains", "Long-term capital gains"], ["pensionAndIRA", "Pension + IRA distributions"], ["rothConversion", "Roth conversion"], ["socialSecurityTotal", "Social Security received"], ["socialSecurityTaxable", "— taxable portion"], ["rentalIncome", "Net rental income"], ["passthroughOrdinary", "Passthrough K-1 (ordinary)"], ["trustDistributions", "Trust distributions"], ["foreignIncome", "Foreign income"], ["otherIncome", "Other income"]].map(f => EL(ClientField, {
    key: f[0],
    label: f[1],
    hint: f[2],
    value: inc[f[0]],
    onChange: v => upSub("income", { [f[0]]: v })
  }))), EL(Note, null, "These are profile facts. The engine calculates from the base scenario — rebuild it from the Overview tab after editing, or adjust the scenario directly on the Scenarios ledger.")),

  /* ---- Assets ---- */
  ctab === "assets" && EL(Card, {
    title: "Assets and accounts",
    sub: "net " + usd$(totals.total),
    flush: true
  }, EL("div", {
    className: "tp-tblwrap"
  }, EL("table", {
    className: "tp-tbl"
  }, EL("thead", null, EL("tr", null, EL("th", null, "Account"), EL("th", null, "Type"), EL("th", {
    className: "num"
  }, "Value"), EL("th", {
    className: "num"
  }, "Tax basis"), EL("th", null, "Owner"), EL("th", null, "Liquidity"), EL("th", null, "Notes"), EL("th", null))), EL("tbody", null, (p.assets || []).map(a => {
    const setA = patch => upC(c => ({
      ...c,
      profile: { ...c.profile, assets: c.profile.assets.map(x => x.id === a.id ? { ...x, ...patch } : x) }
    }));
    return EL("tr", {
      key: a.id
    }, EL("td", null, EL("input", {
      className: "tp-txt",
      value: a.label,
      onChange: e => setA({ label: e.target.value })
    })), EL("td", null, EL("select", {
      className: "tp-mini-sel",
      value: a.type,
      onChange: e => setA({ type: e.target.value })
    }, ASSET_TYPES.map(t => EL("option", { key: t[0], value: t[0] }, t[1])))), EL("td", null, EL(Money, {
      value: a.value,
      onChange: v => setA({ value: v })
    })), EL("td", null, EL(Money, {
      value: a.basis == null ? 0 : a.basis,
      onChange: v => setA({ basis: v })
    })), EL("td", null, EL("input", {
      className: "tp-txt",
      style: { minWidth: 70 },
      value: a.owner || "",
      onChange: e => setA({ owner: e.target.value })
    })), EL("td", null, EL("select", {
      className: "tp-mini-sel",
      value: a.liquidity || "Liquid",
      onChange: e => setA({ liquidity: e.target.value })
    }, LIQUIDITY_LEVELS.map(l => EL("option", { key: l, value: l }, l)))), EL("td", null, EL("input", {
      className: "tp-txt",
      value: a.notes || "",
      onChange: e => setA({ notes: e.target.value })
    })), EL("td", null, EL("button", {
      className: "tp-iconbtn",
      type: "button",
      "aria-label": "Remove",
      onClick: () => upC(c => ({
        ...c,
        profile: { ...c.profile, assets: c.profile.assets.filter(x => x.id !== a.id) }
      }))
    }, I.trash)));
  }), EL("tr", {
    className: "tot"
  }, EL("td", {
    colSpan: 2
  }, "Net of debt"), EL("td", {
    className: "num"
  }, usd$(totals.total)), EL("td", {
    colSpan: 5
  }, "liquid " + usd$(totals.liquid) + " · retirement " + usd$(totals.retirement) + " · debt " + usd$(totals.debt))))), EL("div", {
    className: "tp-add-row"
  }, EL("button", {
    className: "tp-addbtn",
    type: "button",
    onClick: () => upC(c => ({
      ...c,
      profile: { ...c.profile, assets: [...c.profile.assets, mkAsset("cash", "New account", 0)] }
    }))
  }, I.plus, " Add account"))),

  /* ---- Business ---- */
  ctab === "business" && EL("div", {
    className: "tp-stack"
  }, (p.businesses || []).map(b => {
    const setB = patch => upC(c => ({
      ...c,
      profile: { ...c.profile, businesses: c.profile.businesses.map(x => x.id === b.id ? { ...x, ...patch } : x) }
    }));
    return EL(Card, {
      key: b.id,
      title: b.name || "Business",
      sub: b.entityType === "scorp" ? "S corporation" : "Sole proprietorship",
      right: EL("button", {
        className: "tp-iconbtn",
        type: "button",
        "aria-label": "Remove business",
        onClick: () => upC(c => ({
          ...c,
          profile: { ...c.profile, businesses: c.profile.businesses.filter(x => x.id !== b.id) }
        }))
      }, I.trash)
    }, grid([EL(ClientField, {
      key: "n",
      label: "Entity name",
      type: "text",
      value: b.name,
      onChange: v => setB({ name: v })
    }), EL(ClientField, {
      key: "t",
      label: "Entity type",
      type: "select",
      options: [["sole-prop", "Sole proprietorship (Schedule C)"], ["scorp", "S corporation"]],
      value: b.entityType,
      onChange: v => setB({ entityType: v })
    }), EL(ClientField, {
      key: "own",
      label: "Ownership %",
      value: b.ownershipPct,
      onChange: v => setB({ ownershipPct: v })
    }), EL(ClientField, {
      key: "gr",
      label: "Gross receipts",
      value: b.grossReceipts,
      onChange: v => setB({ grossReceipts: v })
    }), EL(ClientField, {
      key: "ox",
      label: "Operating expenses",
      hint: "excl. owner comp, depreciation, interest",
      value: b.operatingExpenses,
      onChange: v => setB({ operatingExpenses: v })
    }), EL(ClientField, {
      key: "oc",
      label: "Owner compensation (W-2)",
      value: b.ownerComp,
      onChange: v => setB({ ownerComp: v })
    }), EL(ClientField, {
      key: "ow",
      label: "Other employee W-2 wages",
      value: b.otherW2,
      onChange: v => setB({ otherW2: v })
    }), EL(ClientField, {
      key: "ub",
      label: "UBIA of qualified property",
      value: b.ubia,
      onChange: v => setB({ ubia: v })
    }), EL(ClientField, {
      key: "dep",
      label: "Depreciation",
      value: b.depreciation,
      onChange: v => setB({ depreciation: v })
    }), EL(ClientField, {
      key: "am",
      label: "Amortization",
      value: b.amortization,
      onChange: v => setB({ amortization: v })
    }), EL(ClientField, {
      key: "ie",
      label: "Business interest expense",
      hint: "§163(j) — run the calculator",
      value: b.interestExpense,
      onChange: v => setB({ interestExpense: v })
    }), EL(ClientField, {
      key: "ic",
      label: "§163(j) carryforward",
      value: b.interestCarryforward,
      onChange: v => setB({ interestCarryforward: v })
    }), EL(ClientField, {
      key: "cc",
      label: "Annual compliance cost",
      value: b.complianceCost,
      onChange: v => setB({ complianceCost: v })
    }), EL(ClientField, {
      key: "sstb",
      label: "Specified service business (SSTB)",
      type: "check",
      value: b.sstb,
      onChange: v => setB({ sstb: v })
    }), EL(ClientField, {
      key: "mp",
      label: "Material participation",
      type: "check",
      value: b.materialParticipation !== false,
      onChange: v => setB({ materialParticipation: v })
    })]), b.notes && EL(Note, null, b.notes));
  }), EL("button", {
    className: "tp-addbtn",
    type: "button",
    onClick: () => upC(c => ({
      ...c,
      profile: {
        ...c.profile,
        businesses: [...(c.profile.businesses || []), {
          id: uid(),
          name: "New business",
          entityType: "sole-prop",
          ownershipPct: 100,
          sstb: false,
          materialParticipation: true,
          grossReceipts: 0,
          operatingExpenses: 0,
          ownerComp: 0,
          otherW2: 0,
          ubia: 0,
          depreciation: 0,
          amortization: 0,
          interestExpense: 0,
          interestCarryforward: 0,
          complianceCost: 0,
          notes: ""
        }]
      }
    }))
  }, I.plus, " Add business")),

  /* ---- Deductions & payments ---- */
  ctab === "deductions" && EL(Card, {
    title: "Deductions, credits and payments"
  }, grid([["mortgageInterest", "Home mortgage interest"], ["stateIncomeTax", "State income tax paid", "itemized only — state tax not modeled"], ["realEstateTax", "Real estate tax"], ["charitableCash", "Charitable — cash"], ["charitableNonCash", "Charitable — non-cash"], ["medicalExpenses", "Medical expenses"], ["investmentInterest", "Investment interest"], ["sehiPremiums", "Self-employed health premiums"], ["retirementContribution", "Current retirement contribution"], ["capitalLossCarryforward", "Capital-loss carryforward", "profile fact — apply via gains inputs"], ["investmentInterestCarryforward", "Investment-interest carryforward", "profile fact — no engine input"]].map(f => EL(ClientField, {
    key: f[0],
    label: f[1],
    hint: f[2],
    value: ded[f[0]],
    onChange: v => upSub("deductions", { [f[0]]: v })
  })).concat([EL(ClientField, {
    key: "hsaMode",
    label: "HSA funding",
    type: "select",
    options: [["off", "Not funding"], ["max", "Fund to limit"], ["manual", "Manual amount"]],
    value: ded.hsaMode,
    onChange: v => upSub("deductions", { hsaMode: v })
  }), EL(ClientField, {
    key: "hsaCoverage",
    label: "HDHP coverage",
    type: "select",
    options: [["self", "Self-only"], ["family", "Family"]],
    value: ded.hsaCoverage,
    onChange: v => upSub("deductions", { hsaCoverage: v })
  }), EL(ClientField, {
    key: "wh",
    label: "Federal withholding",
    value: p.payments.withholding,
    onChange: v => upSub("payments", { withholding: v })
  }), EL(ClientField, {
    key: "est",
    label: "Estimated tax payments",
    value: p.payments.estimatedPayments,
    onChange: v => upSub("payments", { estimatedPayments: v })
  })]))),

  /* ---- Goals ---- */
  ctab === "goals" && EL(Card, {
    title: "Planning goals",
    sub: "ranked 1–5 · drives AI optimization and goal alignment",
    right: EL("select", {
      className: "tp-mini-sel",
      style: { width: 230 },
      value: "",
      onChange: e => {
        if (!e.target.value) return;
        setGoals(gs => [...gs, mkGoal(e.target.value, Math.min(5, gs.length + 1), gs.length < 2 ? "Primary" : "Secondary")]);
        e.target.value = "";
      },
      "aria-label": "Add goal"
    }, EL("option", { value: "" }, "+ Add goal…"), GOAL_CATALOG.map(g => EL("option", {
      key: g[0],
      value: g[0]
    }, g[1])))
  }, !(client.goals || []).length ? EL("div", {
    className: "tp-empty"
  }, "No goals yet — add the client's current tax goals so AI optimization and scenario comparison can respect them.") : EL("div", {
    className: "tp-stack"
  }, client.goals.slice().sort((a, b) => a.priority - b.priority).map(goalRow)), EL(Note, null, "AI optimization reads these goals and the constraints tab — it must not simply pick the lowest-tax scenario.")),

  /* ---- Constraints ---- */
  ctab === "constraints" && EL(Card, {
    title: "Constraints and preferences"
  }, grid([EL(ClientField, {
    key: "msc",
    label: "Minimum annual spendable cash",
    value: client.constraints.minSpendableCash,
    onChange: v => upC(c => ({ ...c, constraints: { ...c.constraints, minSpendableCash: v } }))
  }), EL(ClientField, {
    key: "mtp",
    label: "Maximum voluntary tax payment",
    hint: "e.g. Roth-conversion budget",
    value: client.constraints.maxCurrentTaxPayment,
    onChange: v => upC(c => ({ ...c, constraints: { ...c.constraints, maxCurrentTaxPayment: v } }))
  }), EL(ClientField, {
    key: "mic",
    label: "Maximum implementation cost",
    value: client.constraints.maxImplementationCost,
    onChange: v => upC(c => ({ ...c, constraints: { ...c.constraints, maxImplementationCost: v } }))
  }), EL(ClientField, {
    key: "mcr",
    label: "Minimum cash reserve",
    value: client.constraints.minCashReserve,
    onChange: v => upC(c => ({ ...c, constraints: { ...c.constraints, minCashReserve: v } }))
  }), EL(ClientField, {
    key: "liq",
    label: "Liquidity needs",
    type: "text",
    value: client.constraints.liquidityNeeds,
    onChange: v => upC(c => ({ ...c, constraints: { ...c.constraints, liquidityNeeds: v } }))
  }), EL(ClientField, {
    key: "chi",
    label: "Charitable intent",
    type: "text",
    value: client.constraints.charitableIntent,
    onChange: v => upC(c => ({ ...c, constraints: { ...c.constraints, charitableIntent: v } }))
  }), EL(ClientField, {
    key: "rt",
    label: "Retirement timing",
    type: "text",
    value: client.constraints.retirementTiming,
    onChange: v => upC(c => ({ ...c, constraints: { ...c.constraints, retirementTiming: v } }))
  }), EL(ClientField, {
    key: "io",
    label: "Income outlook",
    type: "text",
    value: client.constraints.incomeOutlook,
    onChange: v => upC(c => ({ ...c, constraints: { ...c.constraints, incomeOutlook: v } }))
  }), EL(ClientField, {
    key: "dp",
    label: "Deferral vs permanent savings",
    type: "text",
    value: client.constraints.deferralVsPermanent,
    onChange: v => upC(c => ({ ...c, constraints: { ...c.constraints, deferralVsPermanent: v } }))
  })]), EL("label", {
    className: "tp-field",
    style: { marginTop: 10 }
  }, EL("span", null, "Other constraints and preferences"), EL("textarea", {
    className: "tp-notearea",
    value: client.constraints.other || "",
    onChange: e => upC(c => ({ ...c, constraints: { ...c.constraints, other: e.target.value } }))
  }))),

  /* ---- Missing facts ---- */
  ctab === "missing" && EL(Card, {
    title: "Missing or unconfirmed facts",
    sub: "visible to AI as unresolved — never invented"
  }, EL("div", {
    className: "tp-stack"
  }, (client.missingFacts || []).map((f, i) => EL("div", {
    key: i,
    className: "tp-linerow",
    style: { gridTemplateColumns: "1fr 30px" }
  }, EL("input", {
    className: "tp-txt",
    value: f,
    onChange: e => upC(c => ({ ...c, missingFacts: c.missingFacts.map((x, j) => j === i ? e.target.value : x) }))
  }), EL("button", {
    className: "tp-iconbtn",
    type: "button",
    "aria-label": "Remove",
    onClick: () => upC(c => ({ ...c, missingFacts: c.missingFacts.filter((x, j) => j !== i) }))
  }, I.trash))), EL("button", {
    className: "tp-addbtn sm",
    type: "button",
    onClick: () => upC(c => ({ ...c, missingFacts: [...(c.missingFacts || []), ""] }))
  }, I.plus, " Add fact to confirm"))),

  /* ---- Notes ---- */
  ctab === "notes" && EL(Card, {
    title: "Documents and notes"
  }, EL("textarea", {
    className: "tp-notearea",
    style: { minHeight: 200 },
    placeholder: "Engagement notes, document inventory, follow-ups…",
    value: client.notes || "",
    onChange: e => upC(c => ({ ...c, notes: e.target.value }))
  }))));
}
