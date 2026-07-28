/* ==== 18-ai-report ==== */
/* ============================================================================
   AI BUILD REPORT
   Grounded client-report generation: the user picks scenarios, type,
   audience, tone, detail and sections; the AI writes narrative sections
   from the controlled data package; every amount traces to engine output.
   A per-section editor controls regeneration, edits, approval and locking,
   and sections are flagged stale when the underlying scenario data changes.
   ========================================================================== */

const AI_REPORT_TYPES = ["Executive planning summary", "Detailed tax-planning report", "Scenario comparison report", "Single-strategy analysis", "Advisor workpaper report", "Client presentation"];
const AI_REPORT_AUDIENCES = ["Client", "CPA or tax advisor", "Financial advisor", "Attorney", "Internal review"];
const AI_REPORT_TONES = ["Executive", "Technical", "Client-friendly", "Concise", "Detailed"];
const AI_REPORT_SECTIONS = ["Executive summary", "Current tax position", "Income composition", "Deductions", "Tax calculation", "Scenario comparison", "Optimization opportunities", "Cash-flow comparison", "Multi-year outlook", "Risks and assumptions", "Missing information", "Implementation steps", "Technical appendix"];

function reportDataHash(entries) {
  try {
    return JSON.stringify(entries.map(x => [x.s.id, x.s].concat(Math.round(x.r.totalTax)))).length + ":" + entries.map(x => Math.round(x.r.totalTax)).join(",");
  } catch (e) {
    return String(Date.now());
  }
}

function AIReportPanel({
  onClose,
  results,
  status,
  year,
  reportInbox,
  logEvent
}) {
  const [step, setStep] = useState("setup");
  const [scenarioMode, setScenarioMode] = useState("all");
  const [pickedIds, setPickedIds] = useState([]);
  const [rtype, setRtype] = useState(AI_REPORT_TYPES[1]);
  const [audience, setAudience] = useState("Client");
  const [tone, setTone] = useState("Client-friendly");
  const [detail, setDetail] = useState("Standard");
  const [wantSections, setWantSections] = useState(AI_REPORT_SECTIONS.slice(0, 12));
  const [clientId, setClientId] = useState("Client 1");
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [builtHash, setBuiltHash] = useState(null);
  const [secBusy, setSecBusy] = useState(null);
  const abortRef = useRef(null);
  const previewRef = useRef(null);
  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
  }, []);
  const entries = scenarioMode === "base" ? [results[0]] : scenarioMode === "ai" ? results.filter((x, i) => i === 0 || x.s.aiGenerated) : scenarioMode === "custom" ? results.filter(x => pickedIds.includes(x.s.id)) : results;
  const base = results[0];
  const currentHash = reportDataHash(entries);
  const statusLabel = (STATUSES.find(x => x.v === status) || {}).l || status;
  const buildSystem = () => {
    const pack = buildAIDataPackage({
      requestType: "build-report",
      entries,
      status,
      year,
      includeCalcs: true,
      includeWarnings: true,
      multiYear: wantSections.includes("Multi-year outlook")
    });
    const approved = (reportInbox || []).map(h => "APPROVED ANALYSIS (" + h.scopeLabel + "): " + h.response.slice(0, 4000)).join("\n\n");
    return AI_SYSTEM_CORE + "\n" + AI_REPORT_SCHEMA + "\nReport type: " + rtype + ". Audience: " + audience + ". Tone: " + tone + ". Detail level: " + detail + ". Requested sections (produce one JSON section per requested item, in order): " + wantSections.join("; ") + ".\nFor each strategy discussed use the structure: observation; why it matters; modeled result; economic effect; implementation considerations; risks; facts requiring confirmation; recommended next step. Organize implementation steps as: immediate; before year-end; before the filing date; future-year monitoring. Classify benefits as permanent vs deferral vs timing. Refer to the client only as \"" + clientId.replace(/"/g, "") + "\".\n\nCONTROLLED DATA PACKAGE (all amounts must come from here):\n" + JSON.stringify(pack) + (approved ? "\n\nADVISOR-SELECTED ANALYSES TO INCORPORATE:\n" + approved : "");
  };
  const generate = async () => {
    setError(null);
    setStep("building");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const reply = await callAI("build-report", {
        system: buildSystem(),
        messages: [{
          role: "user",
          content: "Build the report now."
        }],
        signal: ctrl.signal
      });
      const parsed = extractAIJSON(reply);
      if (!parsed || !Array.isArray(parsed.sections) || !parsed.sections.length) throw new Error("The AI response did not contain valid report sections. Try again.");
      setReport(parsed.sections.map(s => ({
        id: s.id || uid(),
        title: s.title || "Section",
        body: String(s.body || ""),
        original: String(s.body || ""),
        supportingFields: s.supportingFields || [],
        status: "AI draft",
        hidden: false,
        comment: ""
      })));
      setBuiltHash(currentHash);
      setStep("editor");
      logEvent({
        label: "AI report built — " + rtype + " (" + entries.length + " scenarios)",
        kind: "ai",
        scenarioName: entries.map(x => x.s.name).join(", "),
        to: audience + " · " + tone
      });
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(String(e.message || e));
        setStep("setup");
      }
    }
  };
  const regenSection = async (idx, instruction) => {
    setSecBusy(idx);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const sec = report[idx];
      const reply = await callAI("build-report", {
        system: buildSystem(),
        messages: [{
          role: "user",
          content: "Regenerate ONLY the section titled \"" + sec.title + "\". " + (instruction || "") + " Respond with one fenced JSON block: {\"sections\": [{\"id\": \"" + sec.id + "\", \"title\": \"" + sec.title + "\", \"body\": \"...\", \"supportingFields\": []}]}"
        }],
        signal: ctrl.signal
      });
      const parsed = extractAIJSON(reply);
      const next = parsed && parsed.sections && parsed.sections[0];
      if (!next) throw new Error("Section regeneration failed — no valid section returned.");
      setReport(rep => rep.map((s, i) => i === idx ? {
        ...s,
        body: String(next.body || s.body),
        status: "AI draft"
      } : s));
      logEvent({
        label: "AI report section regenerated — " + sec.title,
        kind: "ai",
        scenarioName: entries.map(x => x.s.name).join(", "),
        to: instruction || "regenerate"
      });
    } catch (e) {
      if (e.name !== "AbortError") setError(String(e.message || e));
    } finally {
      setSecBusy(null);
    }
  };
  const setSec = (idx, patch) => setReport(rep => rep.map((s, i) => i === idx ? {
    ...s,
    ...patch
  } : s));
  const move = (idx, dir) => setReport(rep => {
    const out = rep.slice();
    const j = idx + dir;
    if (j < 0 || j >= out.length) return rep;
    const t = out[idx];
    out[idx] = out[j];
    out[j] = t;
    return out;
  });
  const stale = builtHash && builtHash !== currentHash;
  const exportReport = () => {
    const body = previewRef.current ? previewRef.current.innerHTML : "";
    const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Tax Planning Analysis</title><style>" + (typeof REPORT_CSS !== "undefined" ? REPORT_CSS : "") + ".ai-sec{margin:18px 0}.ai-sec h2{font-size:15px;margin:0 0 6px}.ai-sec pre{white-space:pre-wrap;font-family:Georgia,serif;font-size:12.5px;line-height:1.6}</style></head><body><div class='rp'>" + body + "</div></body></html>";
    const blob = new Blob([html], {
      type: "text/html"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "AI-Tax-Planning-Report-" + year + ".html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 800);
  };
  const chartData = entries.map(x => ({
    name: x.s.name,
    inc: Math.max(0, x.r.fedIncomeTax - x.r.creditsApplied),
    emp: x.r.seTax + x.r.sCorpFICA + x.r.addlMedicare,
    niit: x.r.niit
  }));
  const atData = entries.map(x => ({
    name: x.s.name,
    at: x.r.afterTaxCash
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-overlay"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-panel wide"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "AI Build Report"), /*#__PURE__*/React.createElement("em", null, TY[year].label, " · ", statusLabel, " · engine ", ENGINE_VERSION, " · rules ", RULES_VERSION)), /*#__PURE__*/React.createElement("button", {
    className: "tp-win-x",
    onClick: onClose,
    type: "button"
  }, I.x)), step === "setup" && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-grid3"
  }, /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Scenarios"), /*#__PURE__*/React.createElement("select", {
    className: "tp-txt",
    value: scenarioMode,
    onChange: e => setScenarioMode(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "base"
  }, "Base only"), /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All scenarios"), /*#__PURE__*/React.createElement("option", {
    value: "ai"
  }, "AI-optimized scenarios (with base)"), /*#__PURE__*/React.createElement("option", {
    value: "custom"
  }, "Custom selection"))), /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Report type"), /*#__PURE__*/React.createElement("select", {
    className: "tp-txt",
    value: rtype,
    onChange: e => setRtype(e.target.value)
  }, AI_REPORT_TYPES.map(t => /*#__PURE__*/React.createElement("option", {
    key: t,
    value: t
  }, t)))), /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Audience"), /*#__PURE__*/React.createElement("select", {
    className: "tp-txt",
    value: audience,
    onChange: e => setAudience(e.target.value)
  }, AI_REPORT_AUDIENCES.map(t => /*#__PURE__*/React.createElement("option", {
    key: t,
    value: t
  }, t)))), /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Tone"), /*#__PURE__*/React.createElement("select", {
    className: "tp-txt",
    value: tone,
    onChange: e => setTone(e.target.value)
  }, AI_REPORT_TONES.map(t => /*#__PURE__*/React.createElement("option", {
    key: t,
    value: t
  }, t)))), /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Detail level"), /*#__PURE__*/React.createElement("select", {
    className: "tp-txt",
    value: detail,
    onChange: e => setDetail(e.target.value)
  }, ["Summary", "Standard", "Detailed"].map(t => /*#__PURE__*/React.createElement("option", {
    key: t,
    value: t
  }, t)))), /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, "Client identifier ", /*#__PURE__*/React.createElement("em", null, "no sensitive information")), /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    value: clientId,
    onChange: e => setClientId(e.target.value)
  }))), scenarioMode === "custom" && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-selects"
  }, results.map(x => /*#__PURE__*/React.createElement("label", {
    key: x.s.id,
    className: "tp-check sm"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: pickedIds.includes(x.s.id),
    onChange: e => setPickedIds(ids => e.target.checked ? [...ids, x.s.id] : ids.filter(i => i !== x.s.id))
  }), " ", x.s.name))), /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead",
    style: {
      marginTop: 10
    }
  }, "Include sections"), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-objectives"
  }, AI_REPORT_SECTIONS.map(sname => /*#__PURE__*/React.createElement("label", {
    key: sname,
    className: "tp-check sm"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: wantSections.includes(sname),
    onChange: e => setWantSections(list => e.target.checked ? [...list, sname] : list.filter(x => x !== sname))
  }), " ", sname))), (reportInbox || []).length > 0 && /*#__PURE__*/React.createElement(Note, null, (reportInbox || []).length, " approved analysis item", reportInbox.length === 1 ? "" : "s", " from the AI Analysis workspace will be incorporated."), error && /*#__PURE__*/React.createElement(Note, {
    kind: "bad"
  }, error), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid",
    type: "button",
    disabled: !entries.length || !wantSections.length,
    onClick: generate
  }, "Build report"), /*#__PURE__*/React.createElement("span", {
    className: "tp-ai-governance-inline"
  }, "Every amount in the narrative must trace to the engine-generated package; the AI cannot invent figures."))), step === "building" && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-panel-body"
  }, /*#__PURE__*/React.createElement("p", {
    className: "tp-ai-empty"
  }, "Building a ", rtype.toLowerCase(), " for ", audience.toLowerCase(), " from ", entries.length, " engine-calculated scenario", entries.length === 1 ? "" : "s", "…"), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => {
      if (abortRef.current) abortRef.current.abort();
      setStep("setup");
    }
  }, "Cancel")), step === "editor" && report && /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-panel-body tp-ai-editor"
  }, stale && /*#__PURE__*/React.createElement(Note, {
    kind: "warn"
  }, "Underlying scenario data changed after this report was built. Sections below should be refreshed — approved narrative is never updated silently."), /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-btn solid sm",
    type: "button",
    onClick: exportReport
  }, "Export report (HTML)"), /*#__PURE__*/React.createElement("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: () => setStep("setup")
  }, "Back to setup")), /*#__PURE__*/React.createElement("div", {
    className: "tp-rp-page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rp",
    ref: previewRef
  }, /*#__PURE__*/React.createElement("div", {
    className: "rp-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "rp-eyebrow"
  }, "Tax planning analysis · ", TY[year].label), /*#__PURE__*/React.createElement("h1", null, clientId || "Client"), /*#__PURE__*/React.createElement("div", {
    className: "rp-sub"
  }, statusLabel, " · ", entries.length, " scenario", entries.length === 1 ? "" : "s", " analyzed · ", new Date().toLocaleDateString())), /*#__PURE__*/React.createElement("div", {
    className: "rp-meta"
  }, /*#__PURE__*/React.createElement("div", null, rtype), /*#__PURE__*/React.createElement("div", null, "Engine ", ENGINE_VERSION), /*#__PURE__*/React.createElement("div", null, "Rules ", RULES_VERSION))), /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "Key figures — ", base.s.name), /*#__PURE__*/React.createElement("div", {
    className: "rp-kpis"
  }, [["Total income", base.r.grossIncome], ["Adjusted gross income", base.r.agi], ["Taxable income", base.r.taxableIncome], ["Federal income tax", base.r.fedIncomeTax], ["Total modeled federal tax", base.r.totalTax], ["After-tax economic income", base.r.afterTaxCash], ["Spendable after-tax cash", base.r.spendableAfterTaxCash]].map(kv => /*#__PURE__*/React.createElement("div", {
    key: kv[0]
  }, /*#__PURE__*/React.createElement("span", null, kv[0]), /*#__PURE__*/React.createElement("strong", null, usd$(kv[1])))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Effective rate"), /*#__PURE__*/React.createElement("strong", null, pct(base.r.effectiveRate))))), entries.length > 1 && /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "Total modeled federal tax by scenario"), /*#__PURE__*/React.createElement(StackedBars, {
    data: chartData,
    format: usd$,
    series: [{
      key: "inc",
      label: "Income tax",
      color: "#312e81"
    }, {
      key: "emp",
      label: "Employment taxes",
      color: "#6366f1"
    }, {
      key: "niit",
      label: "NIIT",
      color: "#f59e0b"
    }]
  }), /*#__PURE__*/React.createElement("h2", {
    style: {
      marginTop: 14
    }
  }, "After-tax economic income by scenario"), /*#__PURE__*/React.createElement(StackedBars, {
    data: atData,
    format: usd$,
    series: [{
      key: "at",
      label: "After-tax economic income",
      color: "#15803d"
    }]
  }), /*#__PURE__*/React.createElement("p", {
    className: "rp-note"
  }, "Tax and after-tax income are charted separately — they are different measures and do not share a scale.")), entries.length > 1 && /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "Scenario comparison"), /*#__PURE__*/React.createElement("table", {
    className: "rp-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Measure"), entries.map(x => /*#__PURE__*/React.createElement("th", {
    key: x.s.id,
    className: "num"
  }, x.s.name)))), /*#__PURE__*/React.createElement("tbody", null, [["AGI", r => r.agi], ["Taxable income", r => r.taxableIncome], ["QBI deduction", r => r.qbi.deduction], ["Income tax less credits", r => Math.max(0, r.fedIncomeTax - r.creditsApplied)], ["Employment taxes", r => r.seTax + r.sCorpFICA + r.addlMedicare], ["NIIT", r => r.niit], ["Total modeled federal tax", r => r.totalTax], ["After-tax economic income", r => r.afterTaxCash], ["Spendable after-tax cash", r => r.spendableAfterTaxCash], ["Change vs base (tax)", r => r.totalTax - base.r.totalTax]].map(row => /*#__PURE__*/React.createElement("tr", {
    key: row[0]
  }, /*#__PURE__*/React.createElement("td", null, row[0]), entries.map(x => /*#__PURE__*/React.createElement("td", {
    key: x.s.id,
    className: "num"
  }, usd$(row[1](x.r))))))))), report.filter(s => !s.hidden).map(s => /*#__PURE__*/React.createElement("section", {
    className: "rp-sec ai-sec",
    key: s.id
  }, /*#__PURE__*/React.createElement("h2", null, s.title), /*#__PURE__*/React.createElement("pre", null, s.body), s.comment && /*#__PURE__*/React.createElement("p", {
    className: "rp-note"
  }, "Advisor comment: ", s.comment))), /*#__PURE__*/React.createElement("section", {
    className: "rp-sec"
  }, /*#__PURE__*/React.createElement("p", {
    className: "rp-note"
  }, "Modeled planning estimates from deterministic engine ", ENGINE_VERSION, " (rules ", RULES_VERSION, "), federal only; not a filed return and not final tax advice. AI-drafted narrative is grounded in engine-generated amounts and identified internally by section status.")))), /*#__PURE__*/React.createElement("div", {
    className: "tp-minihead",
    style: {
      marginTop: 14
    }
  }, "Section controls"), report.map((s, idx) => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    className: "tp-ai-secedit" + (s.hidden ? " hidden" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-ai-secedit-head"
  }, /*#__PURE__*/React.createElement("strong", null, s.title), /*#__PURE__*/React.createElement("span", {
    className: "tp-vchip " + (s.status === "Advisor approved" || s.status === "Locked" ? "info" : "warn")
  }, stale && s.status !== "Locked" ? "Needs update" : s.status), /*#__PURE__*/React.createElement("span", {
    className: "tp-ai-secedit-btns"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    disabled: s.status === "Locked" || secBusy != null,
    onClick: () => regenSection(idx, "")
  }, secBusy === idx ? "…" : "Regenerate"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    disabled: s.status === "Locked" || secBusy != null,
    onClick: () => regenSection(idx, "Make it materially shorter.")
  }, "Shorten"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    disabled: s.status === "Locked" || secBusy != null,
    onClick: () => regenSection(idx, "Make it more technical, citing Code sections.")
  }, "More technical"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    disabled: s.status === "Locked" || secBusy != null,
    onClick: () => regenSection(idx, "Make it more client-friendly and plain-language.")
  }, "Client-friendly"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => setSec(idx, {
      hidden: !s.hidden
    })
  }, s.hidden ? "Show" : "Hide"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => move(idx, -1)
  }, "↑"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => move(idx, 1)
  }, "↓"), /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    disabled: s.status === "Locked",
    onClick: () => setSec(idx, {
      body: s.original,
      status: "AI draft"
    })
  }, "Restore AI wording"), s.status !== "Advisor approved" && s.status !== "Locked" && /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => {
      setSec(idx, {
        status: "Advisor approved"
      });
      logEvent({
        label: "AI report section approved — " + s.title,
        kind: "ai",
        scenarioName: rtype,
        to: "advisor approved"
      });
    }
  }, "Approve"), s.status === "Advisor approved" && /*#__PURE__*/React.createElement("button", {
    className: "tp-mini",
    type: "button",
    onClick: () => setSec(idx, {
      status: "Locked"
    })
  }, "Lock"))), !s.hidden && /*#__PURE__*/React.createElement("textarea", {
    className: "tp-chat-input",
    rows: 5,
    value: s.body,
    disabled: s.status === "Locked",
    onChange: e => setSec(idx, {
      body: e.target.value,
      status: s.status === "AI draft" ? "Edited" : s.status
    })
  }), !s.hidden && /*#__PURE__*/React.createElement("input", {
    className: "tp-txt",
    placeholder: "Advisor comment (optional)",
    value: s.comment,
    onChange: e => setSec(idx, {
      comment: e.target.value
    })
  }), s.supportingFields.length > 0 && /*#__PURE__*/React.createElement("em", {
    className: "tp-ai-cand-meta"
  }, "Supported by: ", s.supportingFields.join(", ")))), error && /*#__PURE__*/React.createElement(Note, {
    kind: "bad"
  }, error))));
}
