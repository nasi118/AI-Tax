/* ==== 15-ai-chat ==== */
/* ============================================================================
   AI ADVISOR CHAT
   Floating chat window backed by the user's own API key for Claude
   (Anthropic), OpenAI, or Grok (xAI). The key is stored in localStorage and
   sent only to the selected provider, directly from the browser — this app
   has no server. The active scenario's computed figures are supplied to the
   model as context so it can discuss the client's actual numbers.
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
  return { provider: "claude", models: {}, keys: {} };
}
function saveAISettings(s) {
  try { localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
}

/* Build the system prompt from the active scenario's computed results so the
   model talks about the client's actual figures rather than guessing. */
function aiSystemPrompt(result, scenarioName, status, year) {
  const r = result;
  const statusLabel = (typeof STATUSES !== "undefined" && STATUSES.find(s => s.v === status) || {}).l || status;
  const line = (k, v) => k + ": " + v;
  const facts = [
    line("Tax year", year),
    line("Filing status", statusLabel),
    line("Scenario", scenarioName),
    line("Total income", usd$(r.grossIncome)),
    line("Adjustments to income", usd$(r.adjustments)),
    line("AGI", usd$(r.agi)),
    line("MAGI", usd$(r.magi)),
    line("Deduction used", usd$(r.deductionUsed) + " (" + r.deductionKind + ")"),
    line("QBI deduction", usd$(r.qbi && r.qbi.deduction)),
    line("Taxable income", usd$(r.taxableIncome)),
    line("Federal income tax", usd$(r.fedIncomeTax)),
    line("SE tax", usd$(r.seTax)),
    line("Additional Medicare tax", usd$(r.addlMedicare)),
    line("NIIT", usd$(r.niit)),
    line("Child tax credit applied", usd$(r.creditsApplied)),
    line("Total tax", usd$(r.totalTax)),
    line("Marginal ordinary rate", pct(r.marginal, 0)),
    line("Effective rate on economic income", pct(r.effectiveRate, 1))
  ].join("\n");
  return "You are the AI advisor inside Tax Advisory Pro, a deterministic federal individual income tax planning workbench for TY2025 and TY2026 used by a tax professional. " +
    "Answer questions about federal individual income tax planning: SE tax, retirement plan design, S-corp elections, Sec. 199A QBI, MAGI phase-outs, SEHI, IRAs, and related strategy. " +
    "The engine has already computed the active scenario; treat these figures as given:\n\n" + facts + "\n\n" +
    "Keep answers focused and concise, use plain text (no markdown tables), and cite Code sections where helpful. " +
    "If a question requires facts not shown above, say what additional input is needed. " +
    "Remind the user to verify conclusions against current IRS guidance when a position is uncertain; this tool is a planning aid, not tax advice.";
}

/* ---- Streaming clients (raw fetch; this is a build-less static app with no
   bundler, so the provider SDKs are not available). Each returns when the
   stream completes; text is delivered incrementally through onText. ---- */
async function streamSSE(resp, onData) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const raw of lines) {
      const l = raw.trim();
      if (!l.startsWith("data:")) continue;
      const data = l.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let obj;
      try { obj = JSON.parse(data); } catch (e) { continue; }
      onData(obj);
    }
  }
}

async function askClaude({ apiKey, model, system, messages, onText, signal }) {
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
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    })
  });
  if (!resp.ok) throw new Error(await aiErrorText(resp));
  let refused = false;
  await streamSSE(resp, ev => {
    if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") onText(ev.delta.text);
    if (ev.type === "message_delta" && ev.delta && ev.delta.stop_reason === "refusal") refused = true;
    if (ev.type === "error") throw new Error(ev.error && ev.error.message || "Stream error");
  });
  if (refused) onText("\n\n[The model declined to answer this request.]");
}

async function askOpenAICompatible(baseUrl, { apiKey, model, system, messages, onText, signal }) {
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
      messages: [{ role: "system", content: system }].concat(messages.map(m => ({ role: m.role, content: m.content })))
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
    detail = (j.error && (j.error.message || j.error.type)) || JSON.stringify(j);
  } catch (e) {
    try { detail = await resp.text(); } catch (e2) {}
  }
  return "HTTP " + resp.status + (detail ? " — " + String(detail).slice(0, 300) : "");
}

function askAI(provider, opts) {
  if (provider === "claude") return askClaude(opts);
  if (provider === "openai") return askOpenAICompatible("https://api.openai.com/v1", opts);
  return askOpenAICompatible("https://api.x.ai/v1", opts);
}

/* ---- Chat window ---- */
const AI_CHAT_W = 380;

/* Third dock slot: left of the calculator and notes positions so all three
   tools can be open at once without stacking. */
function aiDockPos() {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  if (vw < 980) return {
    x: Math.max(8, (vw - AI_CHAT_W) / 2),
    y: Math.max(8, 56 + 2 * 28)
  };
  const x = vw - 24 - CALC_W - 14 - 390 - 14 - AI_CHAT_W;
  return {
    x: Math.max(16, x),
    y: Math.max(16, Math.min(84, vh - 460))
  };
}
function AIChat({ onClose, result, scenarioName, status, year, onFocus, z, onSendToNotes }) {
  const [settings, setSettings] = useState(loadAISettings);
  const [showSetup, setShowSetup] = useState(() => !loadAISettings().keys[loadAISettings().provider]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const bodyRef = useRef(null);

  const provider = settings.provider;
  const P = AI_PROVIDERS[provider];
  const model = settings.models[provider] || P.defaultModel;
  const apiKey = settings.keys[provider] || "";

  const patchSettings = patch => setSettings(s => {
    const next = { ...s, ...patch };
    saveAISettings(next);
    return next;
  });

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    if (!apiKey) { setShowSetup(true); return; }
    setError(null);
    setDraft("");
    const history = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await askAI(provider, {
        apiKey,
        model,
        system: aiSystemPrompt(result, scenarioName, status, year),
        messages: history,
        signal: ctrl.signal,
        onText: t => setMessages(m => {
          const out = m.slice();
          out[out.length - 1] = { role: "assistant", content: out[out.length - 1].content + t };
          return out;
        })
      });
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(String(e.message || e));
        // Drop the empty assistant placeholder if nothing streamed back
        setMessages(m => m.length && m[m.length - 1].role === "assistant" && !m[m.length - 1].content ? m.slice(0, -1) : m);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const stop = () => { if (abortRef.current) abortRef.current.abort(); };

  return /*#__PURE__*/React.createElement(ToolWindow, {
    title: "AI Advisor",
    sub: P.label + " · " + model + " · " + scenarioName,
    onClose: onClose,
    onFocus: onFocus,
    z: z,
    width: AI_CHAT_W,
    initial: aiDockPos()
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-chat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-chat-bar"
  }, /*#__PURE__*/React.createElement("span", null, "Asks " + P.label + " about the active scenario"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini " + (showSetup ? "on" : ""),
    onClick: () => setShowSetup(v => !v),
    type: "button"
  }, "Settings"), messages.length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    onClick: () => { setMessages([]); setError(null); },
    type: "button"
  }, "Clear")), showSetup && /*#__PURE__*/React.createElement("div", {
    className: "tp-chat-setup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Provider"), /*#__PURE__*/React.createElement("div", {
    className: "tp-seg sm"
  }, Object.keys(AI_PROVIDERS).map(p => /*#__PURE__*/React.createElement("button", {
    key: p,
    className: provider === p ? "on" : "",
    onClick: () => patchSettings({ provider: p }),
    type: "button"
  }, AI_PROVIDERS[p].label)))), /*#__PURE__*/React.createElement("div", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Model"), /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    value: model,
    onChange: e => patchSettings({ models: { ...settings.models, [provider]: e.target.value } })
  })), /*#__PURE__*/React.createElement("div", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "API key ", /*#__PURE__*/React.createElement("em", null, P.keyUrl)), /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    type: "password",
    placeholder: P.keyHint,
    value: apiKey,
    onChange: e => patchSettings({ keys: { ...settings.keys, [provider]: e.target.value } })
  })), /*#__PURE__*/React.createElement("p", {
    className: "tp-chat-keynote"
  }, "The key stays in this browser (localStorage) and is sent only to " + P.label + ". Requests go straight from your browser to the provider — this app has no server.")), /*#__PURE__*/React.createElement("div", {
    className: "tp-chat-body",
    ref: bodyRef
  }, messages.length === 0 && !error && /*#__PURE__*/React.createElement("div", {
    className: "tp-chat-empty"
  }, "Ask about the active scenario — e.g. “Why is the QBI deduction limited?” or “Would a solo 401(k) beat the SEP here?”"), messages.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "tp-chat-msg " + m.role
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-chat-bubble"
  }, m.content || (busy && i === messages.length - 1 ? "…" : "")), m.role === "assistant" && m.content && !(busy && i === messages.length - 1) && onSendToNotes && /*#__PURE__*/React.createElement("button", {
    className: "tp-chat-tonotes",
    onClick: () => onSendToNotes("AI Advisor (" + P.label + "):\n" + m.content),
    type: "button"
  }, "→ Notes"))), error && /*#__PURE__*/React.createElement("div", {
    className: "tp-chat-error"
  }, error)), /*#__PURE__*/React.createElement("div", {
    className: "tp-chat-inputrow"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "tp-chat-input",
    rows: 2,
    placeholder: apiKey ? "Ask a planning question…" : "Add an API key in Settings first",
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
    onClick: send,
    disabled: !draft.trim(),
    type: "button"
  }, "Send"))));
}

/* Chat bubble icon, same stroke style as the shared icon set */
I.chat = /*#__PURE__*/React.createElement(Icon, {
  d: /*#__PURE__*/React.createElement("path", {
    d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
  })
});
