/* ==== 15-ai-chat ==== */
/* ============================================================================
   AI TAX REVIEWER
   Read-only review layer over the deterministic engine. The engine remains
   authoritative for every calculation: the reviewer can explain, check,
   compare and PROPOSE input changes, but a proposal only takes effect after
   the user approves it, at which point the input is changed, the engine
   re-runs, and the change is recorded in the audit trail. AI output is never
   stored as a tax number.

   Transport, in order of preference:
     1. /api/grok — a secure server-side proxy (Vercel function). The xAI key
        lives only in the deployment environment, never in browser code.
     2. Bring-your-own-key fallback for offline/standalone use: the user's own
        Claude / OpenAI / Grok key, entered at runtime, stored in this
        browser's localStorage only, and sent only to that provider.
   ========================================================================== */

const AI_PROVIDERS = {
  claude: {
    label: "Claude",
    defaultModel: "claude-opus-5",
    keyHint: "sk-ant-...",
    keyUrl: "console.anthropic.com"
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5.5",
    keyHint: "sk-...",
    keyUrl: "platform.openai.com"
  },
  grok: {
    label: "Grok",
    defaultModel: "grok-4.5",
    keyHint: "xai-...",
    keyUrl: "console.x.ai"
  }
};

const AI_SETTINGS_KEY = "tp-ai-settings";
function loadAISettings() {
  try {
    const s = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY));
    if (s && AI_PROVIDERS[s.provider]) return {
      provider: s.provider,
      models: s.models || {},
      keys: s.keys || {}
    };
  } catch (e) {}
  return {
    provider: "grok",
    models: {},
    keys: {}
  };
}
function saveAISettings(s) {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(s));
  } catch (e) {}
}

/* ---------------------------------------------------------------- SNAPSHOT */
/* De-identified scenario snapshot — only modeled figures and assumptions.
   No names, addresses, SSNs or documents ever exist in this app's data model,
   and the snapshot is limited to the fields below regardless. */
function buildScenarioSnapshot(s, r, scenarioName, status, year, validation) {
  const round = x => Math.round(num(x));
  const firstSCorp = (s.sCorps && s.sCorps.entities || [])[0];
  const firstQBI = (s.qbi && s.qbi.entities || [])[0];
  return {
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    taxYear: year,
    filingStatus: status,
    scenarioId: s.id,
    scenarioName: scenarioName,
    assumptions: {
      entityType: firstSCorp ? "s-corporation" : (s.schedC && s.schedC.businesses || []).length ? "sole-proprietorship" : "individual",
      isSSTB: !!(firstQBI && firstQBI.sstb),
      materialParticipation: firstSCorp ? firstSCorp.active !== false : null,
      niitClassifications: (s.passthrough && s.passthrough.entities || []).map(e => e.niitClass || "unclassified")
    },
    income: {
      wages: round(s.w2Wages),
      sCorporationCompensation: round(r.scorpComp + num(s.sCorpComp)),
      scheduleCProfit: round(r.schedC),
      sCorporationK1: round(r.scorpK1 + num(s.sCorpK1)),
      passthroughIncome: round(r.passthrough),
      interest: round(s.taxableInterest),
      dividends: round(s.ordinaryDividends),
      capitalGains: round(r.capitalIncluded),
      retirementDistributions: round(num(s.iraDistributions) + num(s.rothConversion)),
      socialSecurity: round(s.socialSecurityTaxable),
      totalIncome: round(r.grossIncome)
    },
    adjustments: {
      deductibleSETax: round(r.seDeduction),
      retirementDeduction: round(r.retirementDeduction),
      selfEmployedHealthInsurance: round(r.sehiDeduction),
      hsaDeduction: round(r.hsa),
      studentLoanInterest: round(r.studentLoan && r.studentLoan.allowed),
      otherAdjustments: round(r.s1AdjOther),
      total: round(r.adjustments)
    },
    deductions: {
      standardOrItemized: r.deductionKind,
      deductionUsed: round(r.deductionUsed),
      schedule1A: round(r.sched1ATotal),
      qbiDeduction: round(r.qbi.deduction)
    },
    qbi: {
      netQBI: round(r.qbi.netQBI),
      tentativeTwentyPercent: round(r.qbi.tentativeTotal),
      entityComponentAfterLimits: round(r.qbi.component),
      taxableIncomeLimit: round(r.qbi.cap),
      allowedDeduction: round(r.qbi.deduction),
      bindingLimitation: r.qbi.binding ? r.qbi.binding.label : "entity-level component"
    },
    taxes: {
      federalIncomeTax: round(r.fedIncomeTax),
      credits: round(r.creditsApplied),
      selfEmploymentTax: round(r.seTax),
      employeePayrollTax: round(r.employeeFICA),
      employerPayrollTax: round(r.employerFICA),
      additionalMedicareTax: round(r.addlMedicare),
      niit: round(r.niit),
      form1040Tax: round(r.form1040Tax),
      totalModeledFederalTax: round(r.totalTax)
    },
    reconciliation: {
      grossEconomicIncome: round(r.economicIncome),
      adjustedGrossIncome: round(r.agi),
      taxableIncome: round(r.taxableIncome),
      afterTaxEconomicIncome: round(r.afterTaxCash),
      spendableAfterTaxCash: round(r.spendableAfterTaxCash)
    },
    validations: validation ? validation.all.map(v => "[" + v.level + "] " + v.msg) : [],
    unresolvedFacts: r.niitReview || []
  };
}

/* ---------------------------------------------------------- SYSTEM PROMPT */
function reviewerSystemPrompt(snapshot, includeScenario) {
  const head = "You are the AI Tax Reviewer inside Tax Advisory Pro, a deterministic federal individual income tax planning workbench (TY2025/TY2026) used by a tax professional. " + "The deterministic engine is authoritative for every calculation. Your role is review only: explain calculations, check arithmetic and consistency, identify missing facts, highlight tax-law issues, compare scenarios, and draft reviewer memos. " + "You must NOT invent client facts, mark anything approved, or present conclusions as final tax advice — flag uncertain positions as requiring confirmation against current IRS guidance.\n\n" + "If, and only if, an input appears wrong or a change is worth modeling, you may propose it using EXACTLY this format (one block per change, plain text):\n" + "PROPOSED CHANGE\nfield: <field path, e.g. w2Wages or scheduleA.charityCash>\ncurrent: <current numeric value>\nproposed: <proposed numeric value>\nreason: <one sentence>\n\n" + "The user must approve every proposal; on approval the application changes the input, re-runs the deterministic engine, and records the change in the audit trail. Never present recalculated totals of your own as authoritative — the engine's next run decides.\n\n" + "Keep answers focused and concise, in plain text (no markdown tables). Cite Code sections where helpful.";
  if (includeScenario && snapshot) {
    return head + "\n\nDE-IDENTIFIED SNAPSHOT OF THE ACTIVE SCENARIO (engine output, treat as given):\n" + JSON.stringify(snapshot, null, 1);
  }
  return head + "\n\nThe user has chosen not to share the scenario snapshot; answer in general terms and say when you would need the numbers.";
}

/* ------------------------------------------------------ PROPOSAL PARSING */
const AI_FIELD_WHITELIST = /^(w2Wages|taxableInterest|taxExemptInterest|ordinaryDividends|qualifiedDividends|shortTermGains|longTermGains|sCorpComp|sCorpK1|rothConversion|iraDistributions|socialSecurityTaxable|socialSecurityTotal|otherIncome|otherCredits|withholding|estimatedPayments|children|foreignExclusion|scheduleA\.[A-Za-z]+|schedule1\.[A-Za-z]+|sched1A\.[A-Za-z]+|planning\.[A-Za-z]+|sehi\.[A-Za-z]+|ira\.[A-Za-z]+)$/;
function parseProposals(text) {
  const out = [];
  const re = /PROPOSED CHANGE\s*\n\s*field:\s*([^\n]+)\n\s*current:\s*([^\n]+)\n\s*proposed:\s*([^\n]+)\n\s*reason:\s*([^\n]+)/g;
  let m;
  while (m = re.exec(text)) {
    const field = m[1].trim();
    const proposed = parseFloat(String(m[3]).replace(/[$,\s]/g, ""));
    out.push({
      field,
      current: m[2].trim(),
      proposed,
      reason: m[4].trim(),
      valid: AI_FIELD_WHITELIST.test(field) && isFinite(proposed)
    });
  }
  return out;
}

/* ------------------------------------------------------------- TRANSPORT */
let grokEndpointDown = false;
async function callSecureEndpoint({
  system,
  messages,
  signal
}) {
  let resp;
  try {
    resp = await fetch("/api/grok", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        system,
        messages,
        model: "grok-4.5"
      })
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    grokEndpointDown = true;
    throw Object.assign(new Error("endpoint-unavailable"), {
      endpointUnavailable: true
    });
  }
  if (resp.status === 404 || resp.status === 405 || resp.status === 501) {
    grokEndpointDown = true;
    throw Object.assign(new Error("endpoint-unavailable"), {
      endpointUnavailable: true
    });
  }
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(j.error || "AI service error (HTTP " + resp.status + ")");
  return j.text || "";
}

async function streamSSE(resp, onData) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const {
      done,
      value
    } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, {
      stream: true
    });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const raw of lines) {
      const l = raw.trim();
      if (!l.startsWith("data:")) continue;
      const data = l.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let obj;
      try {
        obj = JSON.parse(data);
      } catch (e) {
        continue;
      }
      onData(obj);
    }
  }
}
async function askClaude({
  apiKey,
  model,
  system,
  messages,
  onText,
  signal
}) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      stream: true,
      system,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    })
  });
  if (!resp.ok) throw new Error(await aiErrorText(resp));
  let refused = false;
  await streamSSE(resp, ev => {
    if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") onText(ev.delta.text);
    if (ev.type === "message_delta" && ev.delta && ev.delta.stop_reason === "refusal") refused = true;
  });
  if (refused) onText("\n\n[The model declined to answer this request.]");
}
async function askOpenAICompatible(baseUrl, {
  apiKey,
  model,
  system,
  messages,
  onText,
  signal
}) {
  const resp = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer " + apiKey
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{
        role: "system",
        content: system
      }].concat(messages.map(m => ({
        role: m.role,
        content: m.content
      })))
    })
  });
  if (!resp.ok) throw new Error(await aiErrorText(resp));
  await streamSSE(resp, ev => {
    const d = ev.choices && ev.choices[0] && ev.choices[0].delta;
    if (d && d.content) onText(d.content);
  });
}
async function aiErrorText(resp) {
  let detail = "";
  try {
    const j = await resp.json();
    detail = j.error && (j.error.message || j.error.type) || JSON.stringify(j);
  } catch (e) {
    try {
      detail = await resp.text();
    } catch (e2) {}
  }
  return "HTTP " + resp.status + (detail ? " — " + String(detail).slice(0, 300) : "");
}
function askOwnKey(provider, opts) {
  if (provider === "claude") return askClaude(opts);
  if (provider === "openai") return askOpenAICompatible("https://api.openai.com/v1", opts);
  return askOpenAICompatible("https://api.x.ai/v1", opts);
}

/* ------------------------------------------------------------ QUICK ASKS */
const QUICK_REVIEWS = [{
  l: "Explain calculation",
  p: "Explain how the active scenario's total modeled federal tax is built up, step by step, from the snapshot figures."
}, {
  l: "Review for arithmetic errors",
  p: "Check the snapshot for internal arithmetic consistency (income → AGI → taxable income → tax; payroll taxes; reconciliation block). List anything that does not tie out."
}, {
  l: "Review QBI",
  p: "Review the QBI figures: is the binding limitation identified correctly, and do the tentative amount, entity component, and taxable-income cap relate sensibly? Flag missing facts."
}, {
  l: "Compare to base",
  p: "Given this is one scenario of several, what should I verify before comparing its modeled tax against a base scenario? Focus on economic comparability."
}, {
  l: "Identify missing facts",
  p: "List the facts most likely to be missing or unresolved in this scenario (eligibility, elections, classifications) that could change the result materially."
}, {
  l: "Reconcile after-tax cash",
  p: "Walk through the reconciliation from gross economic income to spendable after-tax cash and confirm nothing is double-counted, especially employer payroll tax."
}, {
  l: "Review NIIT treatment",
  p: "Review the NIIT classification assumptions and the unresolvedFacts list. Which activities need a documented §1411 position?"
}, {
  l: "Review S-corp conversion",
  p: "Review the S-corporation figures: reasonable compensation level, employer payroll tax in the K-1, QBI wage limitation interaction, and what documentation the position needs."
}];

/* ---------------------------------------------------------------- DRAWER */
function AIReviewer({
  onClose,
  result,
  scenario,
  scenarioName,
  status,
  year,
  validation,
  onSendToNotes,
  onApplyChange
}) {
  const [settings, setSettings] = useState(loadAISettings);
  const [showSetup, setShowSetup] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [includeScenario, setIncludeScenario] = useState(true);
  const [mode, setMode] = useState(grokEndpointDown ? "own-key" : "endpoint");
  const [decided, setDecided] = useState({});
  const abortRef = useRef(null);
  const bodyRef = useRef(null);
  const provider = settings.provider;
  const P = AI_PROVIDERS[provider];
  const model = settings.models[provider] || P.defaultModel;
  const apiKey = settings.keys[provider] || "";
  const patchSettings = patch => setSettings(s => {
    const next = {
      ...s,
      ...patch
    };
    saveAISettings(next);
    return next;
  });
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);
  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
  }, []);
  const statusLabel = (STATUSES.find(x => x.v === status) || {}).l || status;
  const send = async text => {
    const q = (text || draft).trim();
    if (!q || busy) return;
    setError(null);
    setDraft("");
    const history = [...messages, {
      role: "user",
      content: q
    }];
    setMessages([...history, {
      role: "assistant",
      content: ""
    }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const snapshot = includeScenario ? buildScenarioSnapshot(scenario, result, scenarioName, status, year, validation) : null;
    const system = reviewerSystemPrompt(snapshot, includeScenario);
    const setLast = content => setMessages(m => {
      const out = m.slice();
      out[out.length - 1] = {
        role: "assistant",
        content
      };
      return out;
    });
    try {
      if (mode === "endpoint" && !grokEndpointDown) {
        try {
          const reply = await callSecureEndpoint({
            system,
            messages: history,
            signal: ctrl.signal
          });
          setLast(reply);
        } catch (e) {
          if (e.endpointUnavailable) {
            setMode("own-key");
            if (!apiKey) {
              setShowSetup(true);
              setMessages(history);
              setError("The secure /api/grok endpoint is not available here (offline or standalone use). Add your own API key to continue — it stays in this browser.");
              return;
            }
            let acc = "";
            await askOwnKey(provider, {
              apiKey,
              model,
              system,
              messages: history,
              signal: ctrl.signal,
              onText: t => {
                acc += t;
                setLast(acc);
              }
            });
          } else throw e;
        }
      } else {
        if (!apiKey) {
          setShowSetup(true);
          setMessages(history);
          setError("Add an API key in Settings first — it stays in this browser and is sent only to " + P.label + ".");
          return;
        }
        let acc = "";
        await askOwnKey(provider, {
          apiKey,
          model,
          system,
          messages: history,
          signal: ctrl.signal,
          onText: t => {
            acc += t;
            setLast(acc);
          }
        });
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(String(e.message || e));
        setMessages(m => m.length && m[m.length - 1].role === "assistant" && !m[m.length - 1].content ? m.slice(0, -1) : m);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };
  const stop = () => {
    if (abortRef.current) abortRef.current.abort();
  };
  const decideProposal = (key, action, prop) => {
    setDecided(d => ({
      ...d,
      [key]: action
    }));
    if (action === "applied") onApplyChange(prop.field, prop.proposed, prop.reason);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-aidrawer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-aidrawer-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "AI Tax Reviewer"), /*#__PURE__*/React.createElement("em", null, TY[year].label, " · ", statusLabel, " · ", scenarioName), /*#__PURE__*/React.createElement("em", null, "Engine ", ENGINE_VERSION, " · Rules ", RULES_VERSION, " · ", mode === "endpoint" ? "via secure /api/grok" : P.label + " · " + model + " (your key)")), /*#__PURE__*/React.createElement("button", {
    className: "tp-win-x",
    onClick: onClose,
    title: "Close"
  }, I.x)), /*#__PURE__*/React.createElement("div", {
    className: "tp-aidrawer-tools"
  }, /*#__PURE__*/React.createElement("label", {
    className: "tp-check sm"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: includeScenario,
    onChange: e => setIncludeScenario(e.target.checked)
  }), " Include current scenario (de-identified snapshot)"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini " + (showSetup ? "on" : ""),
    onClick: () => setShowSetup(v => !v),
    type: "button"
  }, "Settings"), messages.length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    onClick: () => {
      setMessages([]);
      setError(null);
      setDecided({});
    },
    type: "button"
  }, "Clear")), showSetup && /*#__PURE__*/React.createElement("div", {
    className: "tp-chat-setup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Transport"), /*#__PURE__*/React.createElement("div", {
    className: "tp-seg sm"
  }, /*#__PURE__*/React.createElement("button", {
    className: mode === "endpoint" ? "on" : "",
    onClick: () => setMode("endpoint"),
    type: "button",
    disabled: grokEndpointDown
  }, "Secure endpoint"), /*#__PURE__*/React.createElement("button", {
    className: mode === "own-key" ? "on" : "",
    onClick: () => setMode("own-key"),
    type: "button"
  }, "My own key"))), mode === "own-key" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Provider"), /*#__PURE__*/React.createElement("div", {
    className: "tp-seg sm"
  }, Object.keys(AI_PROVIDERS).map(p => /*#__PURE__*/React.createElement("button", {
    key: p,
    className: provider === p ? "on" : "",
    onClick: () => patchSettings({
      provider: p
    }),
    type: "button"
  }, AI_PROVIDERS[p].label)))), /*#__PURE__*/React.createElement("div", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Model"), /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    value: model,
    onChange: e => patchSettings({
      models: {
        ...settings.models,
        [provider]: e.target.value
      }
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "API key ", /*#__PURE__*/React.createElement("em", null, P.keyUrl)), /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    type: "password",
    placeholder: P.keyHint,
    value: apiKey,
    onChange: e => patchSettings({
      keys: {
        ...settings.keys,
        [provider]: e.target.value
      }
    })
  })), /*#__PURE__*/React.createElement("p", {
    className: "tp-chat-keynote"
  }, "Your key stays in this browser (localStorage) and is sent only to " + P.label + ". The deployed app instead uses the server-side /api/grok endpoint, which keeps the key out of the browser entirely."))), /*#__PURE__*/React.createElement("div", {
    className: "tp-aidrawer-quick"
  }, QUICK_REVIEWS.map(q => /*#__PURE__*/React.createElement("button", {
    key: q.l,
    className: "tp-mini",
    type: "button",
    disabled: busy,
    onClick: () => send(q.p)
  }, q.l))), /*#__PURE__*/React.createElement("div", {
    className: "tp-chat-body tp-aidrawer-body",
    ref: bodyRef
  }, messages.length === 0 && !error && /*#__PURE__*/React.createElement("div", {
    className: "tp-chat-empty"
  }, "Ask for a review of the active scenario, or use a quick review above. The reviewer sees a de-identified snapshot of engine outputs — never raw documents."), messages.map((m, i) => {
    const proposals = m.role === "assistant" && m.content ? parseProposals(m.content) : [];
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "tp-chat-msg " + m.role
    }, /*#__PURE__*/React.createElement("div", {
      className: "tp-chat-bubble"
    }, m.content || (busy && i === messages.length - 1 ? "…" : "")), proposals.map((pr, j) => {
      const key = i + ":" + j;
      const state = decided[key];
      return /*#__PURE__*/React.createElement("div", {
        key: key,
        className: "tp-proposal"
      }, /*#__PURE__*/React.createElement("strong", null, "Proposed change"), /*#__PURE__*/React.createElement("div", null, "Field: ", /*#__PURE__*/React.createElement("code", null, pr.field)), /*#__PURE__*/React.createElement("div", null, "Current value: ", pr.current), /*#__PURE__*/React.createElement("div", null, "Proposed value: ", usd$(pr.proposed)), /*#__PURE__*/React.createElement("div", null, "Reason: ", pr.reason), /*#__PURE__*/React.createElement("div", null, "Tax impact: recomputed by the engine after approval"), /*#__PURE__*/React.createElement("div", null, "Requires approval: Yes"), !pr.valid && /*#__PURE__*/React.createElement("div", {
        className: "tp-proposal-invalid"
      }, "This field is not on the applyable-input whitelist — apply it manually if appropriate."), state ? /*#__PURE__*/React.createElement("div", {
        className: "tp-proposal-state"
      }, state === "applied" ? "Applied — engine re-ran and the change is in the audit trail." : "Rejected.") : /*#__PURE__*/React.createElement("div", {
        className: "tp-proposal-actions"
      }, /*#__PURE__*/React.createElement("button", {
        className: "tp-btn ghost sm",
        type: "button",
        onClick: () => decideProposal(key, "rejected", pr)
      }, "Reject"), pr.valid && /*#__PURE__*/React.createElement("button", {
        className: "tp-btn solid sm",
        type: "button",
        onClick: () => decideProposal(key, "applied", pr)
      }, "Apply and recalculate")));
    }), m.role === "assistant" && m.content && !(busy && i === messages.length - 1) && onSendToNotes && /*#__PURE__*/React.createElement("button", {
      className: "tp-chat-tonotes",
      onClick: () => onSendToNotes("AI Tax Reviewer:\n" + m.content),
      type: "button"
    }, "→ Notes"));
  }), error && /*#__PURE__*/React.createElement("div", {
    className: "tp-chat-error"
  }, error)), /*#__PURE__*/React.createElement("div", {
    className: "tp-chat-inputrow tp-aidrawer-input"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "tp-chat-input",
    rows: 2,
    placeholder: "Ask the reviewer…",
    value: draft,
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    }
  }), busy ? /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost sm",
    onClick: stop,
    type: "button"
  }, "Stop") : /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid sm",
    onClick: () => send(),
    disabled: !draft.trim(),
    type: "button"
  }, "Send")), /*#__PURE__*/React.createElement("div", {
    className: "tp-aidrawer-governance"
  }, "AI review only. No calculations or inputs are changed automatically."));
}

/* Chat bubble icon, same stroke style as the shared icon set */
I.chat = /*#__PURE__*/React.createElement(Icon, {
  d: /*#__PURE__*/React.createElement("path", {
    d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
  })
});
