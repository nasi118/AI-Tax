/* ==== 17-ai-optimize ==== */
/* ============================================================================
   AI OPTIMIZATION WORKFLOW
   Validate → choose objective → AI proposes candidate input changes →
   human reviews → application clones scenarios → deterministic engine
   recalculates → results dashboard ranks ENGINE-generated numbers.
   ========================================================================== */

const AI_OBJECTIVES = ["Minimize current-year federal tax", "Maximize after-tax economic income", "Maximize spendable cash", "Reduce estimated-payment exposure", "Optimize retirement funding", "Reduce NIIT", "Optimize QBI", "Manage capital gains", "Optimize charitable giving", "Smooth income across years", "Minimize audit and documentation risk", "Balance tax savings and implementation complexity"];

function AIOptimizePanel({
  onClose,
  results,
  status,
  year,
  onCreateScenarios,
  logEvent,
  onOpenScenario,
  onAskWorkspace,
  onAddToReport,
  onDecide
}) {
  const [step, setStep] = useState("objective");
  const [objectives, setObjectives] = useState(["Maximize after-tax economic income"]);
  const [customObjective, setCustomObjective] = useState("");
  const [multiYear, setMultiYear] = useState(false);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  const [chosen, setChosen] = useState({});
  const [created, setCreated] = useState([]);
  const abortRef = useRef(null);
  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
  }, []);
  const base = results[0];
  const validationIssues = [];
  results.forEach(x => {
    if (x.v) x.v.errors.forEach(e => validationIssues.push(x.s.name + ": " + e.msg));
  });
  const comparabilityIssues = results.slice(1).filter(x => Math.abs(x.r.economicIncome - base.r.economicIncome) > 1).map(x => x.s.name + ": gross economics differ from the base — comparisons are not like-for-like.");
  const blocking = validationIssues.length > 0;
  const runOptimize = async () => {
    setError(null);
    setStep("running");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const cl = typeof TP_ACTIVE_CLIENT !== "undefined" ? TP_ACTIVE_CLIENT : null;
      const objective = {
        primaryObjective: objectives[0] || "Maximize after-tax economic income while maintaining reasonable implementation risk.",
        secondaryObjectives: objectives.slice(1).concat(customObjective ? [customObjective] : []),
        clientPriorities: cl ? (cl.goals || []).slice().sort((a, b) => a.priority - b.priority).filter(g => g.classification === "Primary" || g.classification === "Secondary").map(g => g.priority + ". " + g.label + (g.reason ? " — " + g.reason : "")) : [],
        clientConstraints: cl ? [num(cl.constraints.minSpendableCash) > 0 ? "Preserve at least " + usd$(num(cl.constraints.minSpendableCash)) + " of spendable after-tax cash" : null, num(cl.constraints.maxCurrentTaxPayment) > 0 ? "Maximum voluntary tax payment " + usd$(num(cl.constraints.maxCurrentTaxPayment)) : null, num(cl.constraints.maxImplementationCost) > 0 ? "Maximum implementation cost " + usd$(num(cl.constraints.maxImplementationCost)) : null, cl.profile.auditRiskTolerance ? "Audit-risk tolerance: " + cl.profile.auditRiskTolerance : null, cl.constraints.other || null].filter(Boolean) : [],
        riskTolerance: "reasonable implementation risk",
        cashConstraints: null
      };
      const pack = buildAIDataPackage({
        requestType: "optimize",
        entries: results,
        status,
        year,
        objective,
        includeCalcs: true,
        includeWarnings: true,
        multiYear
      });
      const system = AI_SYSTEM_CORE + "\n" + AI_OPTIMIZE_SCHEMA + "\nOnly propose strategies relevant to the supplied facts and explain why each is relevant. If validation issues are listed in the package, treat all output as provisional and say so in the summary.\n\nCONTROLLED DATA PACKAGE:\n" + JSON.stringify(pack);
      const reply = await callAI("optimize", {
        system,
        messages: [{
          role: "user",
          content: "Identify optimization strategies and candidate scenarios for the stated objective. Remember: propose input changes only — the deterministic engine computes every result."
        }],
        signal: ctrl.signal
      });
      const parsed = extractAIJSON(reply);
      if (!parsed || !Array.isArray(parsed.candidates)) throw new Error("The AI response did not contain a valid optimization plan. Try again.");
      parsed.candidates = parsed.candidates.slice(0, 4);
      setPlan(parsed);
      setChosen(Object.fromEntries(parsed.candidates.map((c, i) => [i, true])));
      setStep("review");
      logEvent({
        label: "AI optimization proposals generated (" + parsed.candidates.length + " candidates)",
        kind: "ai",
        scenarioName: "All scenarios",
        to: objective.primaryObjective
      });
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(String(e.message || e));
        setStep("objective");
      }
    }
  };
  const createScenarios = which => {
    const picks = plan.candidates.filter((c, i) => which === "all" || chosen[i]);
    if (!picks.length) return;
    const out = onCreateScenarios(picks);
    setCreated(out);
    setStep("results");
  };
  const madeIds = created.map(c => c.id);
  const madeResults = results.filter(x => madeIds.includes(x.s.id));
  const rankPool = [base, ...madeResults];
  const badge = (label, pick) => {
    if (rankPool.length < 2) return null;
    const best = rankPool.reduce((a, b) => pick(b.r) > pick(a.r) ? b : a);
    return {
      label,
      id: best.s.id
    };
  };
  const badges = step === "results" ? [badge("Lowest modeled tax", r => -r.totalTax), badge("Highest after-tax income", r => r.afterTaxCash), badge("Highest spendable cash", r => r.spendableAfterTaxCash), badge("Best retirement funding", r => r.cashOutflows.retirement + r.cashOutflows.hsa)].filter(Boolean) : [];
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-overlay"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "AI Optimize"), /*#__PURE__*/React.createElement("em", null, TY[year].label, multiYear ? " + " + TY[year === 2025 ? 2026 : 2025].label : "", " · ", (STATUSES.find(x => x.v === status) || {}).l, " · engine ", ENGINE_VERSION)), /*#__PURE__*/React.createElement("button", {
    className: "tp-win-x",
    onClick: onClose,
    type: "button"
  }, I.x)), step === "objective" && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Step 1 — model validation"), blocking ? /*#__PURE__*/React.createElement(Note, {
    kind: "bad"
  }, /*#__PURE__*/React.createElement("strong", null, "Optimization cannot be finalized until the following items are resolved."), " Preliminary observations will be labeled provisional.", /*#__PURE__*/React.createElement("ul", {
    className: "tp-ai-list"
  }, validationIssues.map((v, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, v)))) : /*#__PURE__*/React.createElement(Note, null, "No blocking validation errors. ", comparabilityIssues.length ? "Comparability notes: " + comparabilityIssues.join(" ") : "Scenario economics reconcile with the base."), /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead",
    style: {
      marginTop: 12
    }
  }, "Step 2 — optimization objective"), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-objectives"
  }, AI_OBJECTIVES.map(o => /*#__PURE__*/React.createElement("label", {
    key: o,
    className: "tp-check sm"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: objectives.includes(o),
    onChange: e => setObjectives(list => e.target.checked ? [...list, o] : list.filter(x => x !== o))
  }), " ", o))), /*#__PURE__*/React.createElement("div", {
    className: "tp-field",
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, "Custom objective (optional)"), /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    value: customObjective,
    onChange: e => setCustomObjective(e.target.value),
    placeholder: "e.g. keep AGI under the IRMAA tier 2 threshold"
  })), /*#__PURE__*/React.createElement("label", {
    className: "tp-check sm",
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: multiYear,
    onChange: e => setMultiYear(e.target.checked)
  }), " Two-year planning period (TY2025 + TY2026) — classify timing vs permanent benefits"), error && /*#__PURE__*/React.createElement(Note, {
    kind: "bad"
  }, error), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid",
    type: "button",
    onClick: runOptimize
  }, "Identify strategies"), /*#__PURE__*/React.createElement("span", {
    className: "tp-ai-governance-inline"
  }, "AI proposes input changes only — every result is computed by the deterministic engine."))), step === "running" && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-panel-body"
  }, /*#__PURE__*/React.createElement("p", {
    className: "tp-ai-empty"
  }, "Reviewing ", results.length, " scenario", results.length === 1 ? "" : "s", " against the objective… The AI sees the controlled data package (engine outputs, validations, unresolved facts) and returns structured proposals for your review."), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => {
      if (abortRef.current) abortRef.current.abort();
      setStep("objective");
    }
  }, "Cancel")), step === "review" && plan && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "Review proposed scenarios"), /*#__PURE__*/React.createElement("p", {
    className: "tp-ai-summary"
  }, plan.summary), (plan.validationIssues || []).length > 0 && /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, "Provisional — items to resolve: ", plan.validationIssues.join("; ")), (plan.strategiesConsidered || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-strategies"
  }, plan.strategiesConsidered.map((st, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "tp-vchip " + (st.pursued ? "info" : "warn"),
    title: st.relevantBecause
  }, st.name, st.pursued ? "" : " (not pursued)"))), plan.candidates.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "tp-ai-candidate"
  }, /*#__PURE__*/React.createElement("label", {
    className: "tp-check"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: !!chosen[i],
    onChange: e => setChosen(ch => ({
      ...ch,
      [i]: e.target.checked
    }))
  }), " ", /*#__PURE__*/React.createElement("strong", null, c.scenarioName)), /*#__PURE__*/React.createElement("em", {
    className: "tp-ai-cand-meta"
  }, "Starts from: ", (results.find(x => x.s.id === c.startingScenarioId) || base).s.name, " · ", c.benefitClassification || "unclassified benefit"), (c.proposedChanges || []).map((ch, j) => /*#__PURE__*/React.createElement("div", {
    key: j,
    className: "tp-ai-change"
  }, /*#__PURE__*/React.createElement("code", null, ch.field), ": ", String(ch.currentValue), " → ", /*#__PURE__*/React.createElement("strong", null, String(ch.proposedValue)), /*#__PURE__*/React.createElement("span", null, " — ", ch.reason))), (c.factsToConfirm || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-facts"
  }, "Facts to confirm: ", c.factsToConfirm.join("; ")), (c.risks || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-facts"
  }, "Risks: ", c.risks.join("; ")))), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid",
    type: "button",
    onClick: () => createScenarios("selected")
  }, "Create selected scenarios"), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost",
    type: "button",
    onClick: () => createScenarios("all")
  }, "Create all scenarios"), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost",
    type: "button",
    onClick: onClose
  }, "Cancel"))), step === "results" && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead"
  }, "AI Optimization summary"), /*#__PURE__*/React.createElement("p", {
    className: "tp-ai-summary"
  }, (plan.strategiesConsidered || []).length, " strategies were reviewed. ", created.length, " candidate scenario", created.length === 1 ? " was" : "s were", " modeled by the deterministic engine. ", madeResults.filter(x => x.r.afterTaxCash > base.r.afterTaxCash + 1).length, " improved after-tax economic income versus the base. ", madeResults.filter(x => x.r.totalTax < base.r.totalTax - 1 && x.r.spendableAfterTaxCash < base.r.spendableAfterTaxCash - 1).length, " produced lower tax but reduced spendable cash. ", created.reduce((a, c) => a + (c.factsToConfirm || []).length, 0), " assumptions require confirmation."), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-tablewrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Scenario"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Total modeled tax"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Tax change"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "After-tax economic income"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Spendable cash"), /*#__PURE__*/React.createElement("th", null, "Badges"), /*#__PURE__*/React.createElement("th", null, "Facts to confirm"))), /*#__PURE__*/React.createElement("tbody", null, rankPool.map(x => {
    const c = created.find(cc => cc.id === x.s.id);
    const d = x.r.totalTax - base.r.totalTax;
    return /*#__PURE__*/React.createElement("tr", {
      key: x.s.id
    }, /*#__PURE__*/React.createElement("td", null, x.s.name, x.s.id === base.s.id ? " (base)" : ""), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(x.r.totalTax)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, x.s.id === base.s.id ? "—" : (d > 0 ? "+" : "") + usd(Math.round(d))), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(x.r.afterTaxCash)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, usd$(x.r.spendableAfterTaxCash)), /*#__PURE__*/React.createElement("td", null, badges.filter(b => b.id === x.s.id).map(b => /*#__PURE__*/React.createElement("span", {
      key: b.label,
      className: "tp-vchip info"
    }, b.label))), /*#__PURE__*/React.createElement("td", null, c ? (c.factsToConfirm || []).length || "—" : "—"));
  })))), /*#__PURE__*/React.createElement(Note, null, "Rankings use engine-generated results across several measures — never total tax alone. Nothing here is an approved recommendation; approval requires a human reviewer."), created.map(c => {
    const x = madeResults.find(m => m.s.id === c.id);
    if (!x) return null;
    return /*#__PURE__*/React.createElement("div", {
      key: c.id,
      className: "tp-ai-candidate"
    }, /*#__PURE__*/React.createElement("strong", null, c.name), /*#__PURE__*/React.createElement("em", {
      className: "tp-ai-cand-meta"
    }, "AI proposed · engine calculated · ", c.benefitClassification || "unclassified benefit"), /*#__PURE__*/React.createElement("div", {
      className: "tp-ai-change"
    }, "Inputs changed: ", c.changes.map(ch => ch.field + " → " + ch.proposedValue).join("; ")), /*#__PURE__*/React.createElement("div", {
      className: "tp-ai-change"
    }, "Engine tax impact: ", usd$(x.r.totalTax), " (", x.r.totalTax - base.r.totalTax > 0 ? "+" : "", usd(Math.round(x.r.totalTax - base.r.totalTax)), " vs base) · after-tax income ", usd$(x.r.afterTaxCash), " · spendable ", usd$(x.r.spendableAfterTaxCash)), (c.factsToConfirm || []).length > 0 && /*#__PURE__*/React.createElement("div", {
      className: "tp-ai-facts"
    }, "Facts to confirm: ", c.factsToConfirm.join("; ")), /*#__PURE__*/React.createElement("div", {
      className: "tp-ai-actions"
    }, /*#__PURE__*/React.createElement("button", {
      className: "tp-mini",
      type: "button",
      onClick: () => onOpenScenario(c.id)
    }, "Open scenario"), /*#__PURE__*/React.createElement("button", {
      className: "tp-mini",
      type: "button",
      onClick: () => onAskWorkspace({
        scenarioId: c.id,
        question: "Compare this AI-proposed scenario to the base scenario. Explain what drives the differences and whether the benefit is permanent or timing.",
        autoRun: true
      })
    }, "Compare to base"), /*#__PURE__*/React.createElement("button", {
      className: "tp-mini",
      type: "button",
      onClick: () => onAddToReport({
        id: c.id,
        ts: Date.now(),
        tsLabel: new Date().toLocaleString(),
        scopeLabel: c.name,
        question: "AI optimization strategy",
        model: "grok-4.5",
        engineVersion: ENGINE_VERSION,
        rulesVersion: RULES_VERSION,
        response: "Strategy " + c.name + ": inputs changed — " + c.changes.map(ch => ch.field + " → " + ch.proposedValue).join("; ") + ". Engine result: total modeled federal tax " + usd$(x.r.totalTax) + ", after-tax economic income " + usd$(x.r.afterTaxCash) + ", spendable cash " + usd$(x.r.spendableAfterTaxCash) + ".",
        proposals: []
      })
    }, "Add to report"), /*#__PURE__*/React.createElement("button", {
      className: "tp-mini",
      type: "button",
      onClick: () => onDecide(c.id, "approved")
    }, "Approve for planning"), /*#__PURE__*/React.createElement("button", {
      className: "tp-mini",
      type: "button",
      onClick: () => onDecide(c.id, "rejected")
    }, "Reject"), /*#__PURE__*/React.createElement("button", {
      className: "tp-mini",
      type: "button",
      onClick: () => onAskWorkspace({
        scenarioId: c.id,
        question: "Provide a deeper analysis of this strategy: implementation requirements, documentation needed, risks, multi-year considerations, and what facts must be confirmed.",
        autoRun: true
      })
    }, "Request deeper analysis")));
  }), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid",
    type: "button",
    onClick: onClose
  }, "Done")))));
}
