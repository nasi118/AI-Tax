/* ==== 16-ai-workspace ==== */
/* ============================================================================
   AI ANALYSIS WORKSPACE
   Central AI advisory page: pick the analysis context, ask a question or run
   a quick review, read a structured advisory response, approve proposed test
   scenarios, and keep a saved history that feeds workpapers and reports.
   The deterministic engine stays authoritative throughout.
   ========================================================================== */

const AI_QUICK_PROMPTS = ["Review the overall tax plan", "Optimize deductions", "Review retirement strategy", "Analyze Roth conversion opportunities", "Review QBI planning", "Analyze S-corporation strategy", "Review charitable planning", "Analyze capital-gain timing", "Review NIIT exposure", "Identify missing facts", "Compare selected scenarios", "Explain why tax changed", "Reconcile after-tax cash"];

function aiScopeEntries(scope, selectedIds, results, activeIdx) {
  if (scope === "active") return [results[activeIdx]];
  if (scope === "base") return [results[0]];
  if (scope === "selected") return results.filter(x => selectedIds.includes(x.s.id));
  return results; // all + multi-year
}

function AIAnalysisPage({
  results,
  status,
  year,
  activeIdx,
  aiPrefill,
  clearPrefill,
  onCreateTestScenario,
  onSaveToNotes,
  onAddToReport,
  logEvent,
  history,
  setHistory
}) {
  const [scope, setScope] = useState("active");
  const [selectedIds, setSelectedIds] = useState([]);
  const [includeCalcs, setIncludeCalcs] = useState(true);
  const [includeWarnings, setIncludeWarnings] = useState(true);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [decided, setDecided] = useState({});
  const abortRef = useRef(null);
  const lastCalc = useMemo(() => new Date().toLocaleString(), [results]);

  /* Context arriving from scenario cards / module buttons */
  useEffect(() => {
    if (!aiPrefill) return;
    if (aiPrefill.scope) setScope(aiPrefill.scope);
    if (aiPrefill.scenarioId) {
      setScope("selected");
      setSelectedIds([aiPrefill.scenarioId]);
    }
    if (aiPrefill.question) setQuestion(aiPrefill.question);
    clearPrefill();
    if (aiPrefill.autoRun && aiPrefill.question) run(aiPrefill.question, aiPrefill.scenarioId ? "selected" : aiPrefill.scope || "active", aiPrefill.scenarioId ? [aiPrefill.scenarioId] : []);
  }, [aiPrefill]);
  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
  }, []);
  const entriesFor = (sc, ids) => aiScopeEntries(sc, ids, results, activeIdx);
  const entries = entriesFor(scope, selectedIds);
  const multiYear = scope === "multiyear";
  const anyBlocking = entries.some(x => x.v && x.v.blocking);
  const scopeLabel = scope === "active" ? "Active scenario — " + (entries[0] ? entries[0].s.name : "") : scope === "base" ? "Base scenario — " + results[0].s.name : scope === "selected" ? "Selected: " + entries.map(x => x.s.name).join(", ") : scope === "multiyear" ? "Multi-year plan (TY2025 + TY2026), all scenarios" : "All scenarios";
  const statusLabel = (STATUSES.find(x => x.v === status) || {}).l || status;
  const run = async (q, scOverride, idsOverride) => {
    const text = (q || question).trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    setResponse(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const sc = scOverride || scope;
    const ids = idsOverride || selectedIds;
    const ents = entriesFor(sc, ids);
    try {
      const pack = buildAIDataPackage({
        requestType: "analyze",
        entries: ents,
        status,
        year,
        includeCalcs,
        includeWarnings,
        multiYear: sc === "multiyear"
      });
      const system = AI_SYSTEM_CORE + "\n" + AI_ANALYZE_STRUCTURE + "\nWhen answering a planning question, distinguish: known facts from the model; assumptions; missing facts; applicable calculation; planning alternatives; modeled impact; potential legal or tax issues; recommended next analytical step.\n\nCONTROLLED DATA PACKAGE (engine output, treat as given):\n" + JSON.stringify(pack);
      const reply = await callAI("analyze", {
        system,
        messages: [{
          role: "user",
          content: text
        }],
        signal: ctrl.signal
      });
      const proposals = parseProposals(reply);
      const entry = {
        id: uid(),
        ts: Date.now(),
        tsLabel: new Date().toLocaleString(),
        scopeLabel: sc === "multiyear" ? "Multi-year, all scenarios" : ents.map(x => x.s.name).join(", "),
        question: text,
        model: "grok-4.5",
        engineVersion: ENGINE_VERSION,
        rulesVersion: RULES_VERSION,
        response: reply,
        proposals,
        decision: null
      };
      setResponse(entry);
      setHistory(h => [entry, ...h].slice(0, 50));
      logEvent({
        label: "AI analysis run — " + (text.length > 60 ? text.slice(0, 57) + "…" : text),
        kind: "ai",
        scenarioName: entry.scopeLabel,
        to: "engine " + ENGINE_VERSION + " · rules " + RULES_VERSION
      });
    } catch (e) {
      if (e.name !== "AbortError") setError(String(e.message || e));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };
  const exportEntry = (entry, asDoc) => {
    const html = "<html><head><meta charset='utf-8'><title>AI Analysis</title></head><body><h1>AI Tax Analysis</h1><p><b>" + entry.tsLabel + "</b> · " + entry.scopeLabel + " · " + entry.model + " · engine " + entry.engineVersion + "</p><h2>Question</h2><p>" + entry.question.replace(/</g, "&lt;") + "</p><h2>Analysis</h2><pre style='white-space:pre-wrap;font-family:Georgia,serif'>" + entry.response.replace(/</g, "&lt;") + "</pre><p><i>AI review only — figures are engine-generated planning estimates, not tax advice.</i></p></body></html>";
    if (asDoc) {
      const blob = new Blob(["﻿" + html], {
        type: "application/msword"
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "AI-Analysis-" + new Date(entry.ts).toISOString().slice(0, 10) + ".doc";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 800);
    } else {
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 300);
    }
  };
  const decideProposal = (key, action, pr) => {
    setDecided(d => ({
      ...d,
      [key]: action
    }));
    if (action === "created") {
      const startId = entries[0] ? entries[0].s.id : results[activeIdx].s.id;
      onCreateTestScenario({
        scenarioName: "AI test — " + pr.field,
        startingScenarioId: startId,
        proposedChanges: [{
          field: pr.field,
          currentValue: pr.current,
          proposedValue: pr.proposed,
          reason: pr.reason
        }]
      });
    }
  };
  const sections = response ? splitAISections(response.response) : [];
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-side"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Analysis context"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Scope"), /*#__PURE__*/React.createElement("select", {
    className: "tp-txt",
    value: scope,
    onChange: e => setScope(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "active"
  }, "Active scenario"), /*#__PURE__*/React.createElement("option", {
    value: "base"
  }, "Base scenario"), /*#__PURE__*/React.createElement("option", {
    value: "selected"
  }, "Selected scenarios"), /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All scenarios"), /*#__PURE__*/React.createElement("option", {
    value: "multiyear"
  }, "Multi-year plan (TY2025 + TY2026)"))), scope === "selected" && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-selects"
  }, results.map(x => /*#__PURE__*/React.createElement("label", {
    key: x.s.id,
    className: "tp-check sm"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: selectedIds.includes(x.s.id),
    onChange: e => setSelectedIds(ids => e.target.checked ? [...ids, x.s.id] : ids.filter(i => i !== x.s.id))
  }), " ", x.s.name))), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-meta"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Tax year"), /*#__PURE__*/React.createElement("strong", null, TY[year].label, multiYear ? " + " + TY[year === 2025 ? 2026 : 2025].label : "")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Filing status"), /*#__PURE__*/React.createElement("strong", null, statusLabel)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Scenarios"), /*#__PURE__*/React.createElement("strong", null, scopeLabel)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Engine / rules"), /*#__PURE__*/React.createElement("strong", null, ENGINE_VERSION, " · ", RULES_VERSION)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Last calculation"), /*#__PURE__*/React.createElement("strong", null, lastCalc)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Validation status"), /*#__PURE__*/React.createElement("strong", {
    className: anyBlocking ? "bad" : ""
  }, anyBlocking ? "Blocking errors present" : entries.some(x => x.v && x.v.warnings.length) ? "Warnings — review" : "Clean"))), /*#__PURE__*/React.createElement("label", {
    className: "tp-check sm"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: includeCalcs,
    onChange: e => setIncludeCalcs(e.target.checked)
  }), " Include detailed calculations"), /*#__PURE__*/React.createElement("label", {
    className: "tp-check sm"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: includeWarnings,
    onChange: e => setIncludeWarnings(e.target.checked)
  }), " Include unresolved facts and warnings")), /*#__PURE__*/React.createElement(Card, {
    title: "Saved analyses",
    right: history.length ? history.length + " saved" : null
  }, !history.length && /*#__PURE__*/React.createElement("p", {
    className: "tp-ai-empty"
  }, "Analyses you run are saved here with their context, model, and engine versions."), history.map(h => /*#__PURE__*/React.createElement("div", {
    key: h.id,
    className: "tp-ai-hist"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-ai-hist-main",
    onClick: () => setResponse(h),
    type: "button"
  }, /*#__PURE__*/React.createElement("strong", null, h.question.length > 60 ? h.question.slice(0, 57) + "…" : h.question), /*#__PURE__*/React.createElement("em", null, h.tsLabel, " · ", h.scopeLabel, " · ", h.model)), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-hist-acts"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    title: "Save to workpapers (Notes)",
    onClick: () => {
      onSaveToNotes("AI analysis (" + h.tsLabel + ", " + h.scopeLabel + ")\nQ: " + h.question + "\n\n" + h.response);
      logEvent({
        label: "AI analysis saved to workpapers",
        kind: "ai",
        scenarioName: h.scopeLabel,
        to: h.question.slice(0, 80)
      });
    }
  }, "Workpapers"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    title: "Add to the AI report inbox",
    onClick: () => onAddToReport(h)
  }, "Report"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => exportEntry(h, true)
  }, "Word"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => exportEntry(h, false)
  }, "PDF"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => setHistory(list => list.filter(x => x.id !== h.id))
  }, "Delete")))))), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-main"
  },/*#__PURE__*/React.createElement(Card, {
    title: "Question or task"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "tp-chat-input tp-ai-q",
    rows: 3,
    placeholder: "Ask a tax-planning question or describe the strategy you want analyzed...",
    value: question,
    onChange: e => setQuestion(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        run();
      }
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-actions"
  }, busy ? /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => abortRef.current && abortRef.current.abort()
  }, "Stop") : /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid sm",
    type: "button",
    disabled: !question.trim(),
    onClick: () => run()
  }, "Analyze"), /*#__PURE__*/React.createElement("span", {
    className: "tp-ai-governance-inline"
  }, "AI review only — the deterministic engine remains the source of every stored tax amount.")), /*#__PURE__*/React.createElement("div", {
    className: "tp-aidrawer-quick"
  }, AI_QUICK_PROMPTS.map(qp => /*#__PURE__*/React.createElement("button", {
    key: qp,
    className: "tp-mini",
    type: "button",
    disabled: busy,
    onClick: () => {
      setQuestion(qp);
      run(qp);
    }
  }, qp)))), error && /*#__PURE__*/React.createElement(Note, {
    kind: "bad"
  }, error), busy && /*#__PURE__*/React.createElement(Card, {
    title: "Analyzing…"
  }, /*#__PURE__*/React.createElement("p", {
    className: "tp-ai-empty"
  }, "The AI is reviewing the controlled data package (", entries.length, " scenario", entries.length === 1 ? "" : "s", multiYear ? ", two tax years" : "", "). Engine numbers are supplied as given; nothing is changed by analysis.")), response && !busy && /*#__PURE__*/React.createElement(Card, {
    title: "Advisory analysis",
    right: /*#__PURE__*/React.createElement("span", {
      className: "tp-tag"
    }, response.model, " · engine ", response.engineVersion)
  }, anyBlocking && /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, "Blocking validation errors are present in the analyzed scope — treat conclusions as provisional until they are resolved."), sections.length > 1 ? sections.map((sec, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "tp-ai-sec"
  }, sec.title && /*#__PURE__*/React.createElement("button", {
    className: "tp-ai-sec-head",
    type: "button",
    onClick: () => setCollapsed(c => ({
      ...c,
      [i]: !c[i]
    }))
  }, /*#__PURE__*/React.createElement("strong", null, sec.title), /*#__PURE__*/React.createElement("em", null, collapsed[i] ? "show" : "hide")), !collapsed[i] && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-sec-body"
  }, sec.body))) : /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-sec-body"
  }, response.response), (response.proposals || []).map((pr, j) => {
    const key = response.id + ":" + j;
    const state = decided[key];
    return /*#__PURE__*/React.createElement("div", {
      key: key,
      className: "tp-proposal"
    }, /*#__PURE__*/React.createElement("strong", null, "Proposed planning change"), /*#__PURE__*/React.createElement("div", null, "Field: ", /*#__PURE__*/React.createElement("code", null, pr.field)), /*#__PURE__*/React.createElement("div", null, "Current value: ", pr.current), /*#__PURE__*/React.createElement("div", null, "Proposed value: ", String(pr.proposed)), /*#__PURE__*/React.createElement("div", null, "Reason: ", pr.reason), /*#__PURE__*/React.createElement("div", null, "Modeled result: not yet calculated — the engine runs after approval"), !pr.valid && /*#__PURE__*/React.createElement("div", {
      className: "tp-proposal-invalid"
    }, "Field not on the applyable-input whitelist — apply manually if appropriate."), state ? /*#__PURE__*/React.createElement("div", {
      className: "tp-proposal-state"
    }, state === "created" ? "Test scenario created — engine result is on the Scenarios page." : "Rejected.") : /*#__PURE__*/React.createElement("div", {
      className: "tp-proposal-actions"
    }, /*#__PURE__*/React.createElement("button", {
      className: "tp-btn ghost sm",
      type: "button",
      onClick: () => decideProposal(key, "rejected", pr)
    }, "Reject"), pr.valid && /*#__PURE__*/React.createElement("button", {
      className: "tp-btn solid sm",
      type: "button",
      onClick: () => decideProposal(key, "created", pr)
    }, "Create test scenario")));
  }), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-hist-acts",
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => {
      onSaveToNotes("AI analysis (" + response.tsLabel + ", " + response.scopeLabel + ")\nQ: " + response.question + "\n\n" + response.response);
      logEvent({
        label: "AI analysis saved to workpapers",
        kind: "ai",
        scenarioName: response.scopeLabel,
        to: response.question.slice(0, 80)
      });
    }
  }, "Save to workpapers"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => onAddToReport(response)
  }, "Add to report"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => exportEntry(response, true)
  }, "Export to Word"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => exportEntry(response, false)
  }, "Export to PDF"))), !response && !busy && !error && /*#__PURE__*/React.createElement(Card, {
    title: "Advisory analysis"
  }, /*#__PURE__*/React.createElement("p", {
    className: "tp-ai-empty"
  }, "Responses arrive structured as: executive conclusion, current position, key tax drivers, optimization opportunities, scenario comparison, potential tax impact, cash-flow impact, risks and limitations, missing facts, and recommended next steps. Proposed input changes require your approval before a test scenario is created and recalculated by the engine."))));
}

/* ---- Per-scenario AI menu (Summary tab cards) ---- */
function AICardMenu({
  scenario,
  status,
  year,
  onAskAI,
  onAIOptimize
}) {
  const [open, setOpen] = useState(false);
  const ctx = TY[year].label + " · " + ((STATUSES.find(x => x.v === status) || {}).l || status) + " · " + scenario.name;
  const opts = [{
    l: "Explain results",
    q: "Explain this scenario's results: how income becomes taxable income and total modeled federal tax, and what the largest drivers are."
  }, {
    l: "Identify opportunities",
    q: "Identify planning opportunities relevant to this scenario's facts. For each, explain why it applies and what input change would test it."
  }, {
    l: "Compare to base",
    q: "Compare this scenario to the base scenario: what changed, what drives the tax and after-tax differences, and are they economically comparable?"
  }, {
    l: "Review calculation logic",
    q: "Review this scenario's calculation chain for internal consistency and identify anything that does not tie out or needs verification."
  }, {
    l: "Identify missing facts",
    q: "List the missing or unconfirmed facts most likely to change this scenario's result materially."
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-cardmenu"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-mini ai",
    type: "button",
    title: "Analyze this scenario with AI",
    onClick: () => setOpen(v => !v)
  }, I.chat, " AI"), open && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-cardmenu-pop"
  }, /*#__PURE__*/React.createElement("em", null, "AI analysis context:", /*#__PURE__*/React.createElement("br", null), ctx), opts.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.l,
    type: "button",
    onClick: () => {
      setOpen(false);
      onAskAI({
        scenarioId: scenario.id,
        question: o.q,
        autoRun: true
      });
    }
  }, o.l)), onAIOptimize && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setOpen(false);
      onAIOptimize();
    }
  }, "Use as optimization starting point")));
}
