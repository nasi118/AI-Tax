/* ==== 28-settings ==== */
/* ============================================================================
   APPLICATION SETTINGS

   Behaviour, not presentation. How the app starts, what it recalculates by
   default, whether the AI layer is available at all, and which OpenAI model
   the secure endpoint is asked for. Presentation — themes, fonts, borders,
   sizing and number formatting — stays in Customize appearance
   (src/22-appearance.js), which this panel links to rather than duplicates.

   WHERE THIS LIVES AND WHAT IT CAN TOUCH
   --------------------------------------
   Settings are interface preferences. They are stored in the UI-preference
   store (localStorage, per device) under a single "settings" key, exactly
   like "appearance", and they are NEVER mixed with client or tax data. No
   setting here changes a tax figure: nothing in this file can alter an input,
   a rule, or a calculation. The deterministic engine stays the sole authority
   for every number, whatever is set here.

   Every setting is bounded to a known set of values, so a hand-edited or
   corrupted preference falls back to its default rather than putting the app
   into a state the user cannot get out of.
   ========================================================================== */

const SETTINGS_DEFAULTS = {
  /* Which tab the app opens on. "last" restores wherever the user left off,
     which is the behaviour this app has always had. */
  startTab: "last",
  /* The default scope of the Recalculate control. Previously hard-coded to
     "affected" and reset on every reload; it is a preference now. */
  recalcScope: "affected",
  /* Master switch for the AI advisory layer. Off hides every AI affordance —
     the dock button, the tab AI bars, the optimize and report actions — for
     users or engagements where no client data may reach a model. */
  aiEnabled: true,
  /* Which model the secure server-side endpoint is asked for. The proxy keeps
     its own allowlist and default (api/_lib/openai-proxy.js); an unknown value
     here is simply ignored by the server. */
  aiModel: "gpt-5.6-sol",
  /* Confirm before a recalculation that spans every client. */
  confirmRecalcAll: true
};

/* Allowed values. A setting whose stored value is not in its list falls back
   to the default — see readSetting. startTab is validated against TABS. */
const SETTINGS_ALLOWED = {
  recalcScope: ["tab", "affected", "all"],
  aiEnabled: [true, false],
  aiModel: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
  confirmRecalcAll: [true, false]
};

const AI_MODEL_CHOICES = [
  { v: "gpt-5.6-sol", l: "Sol", hint: "GPT-5.6 Sol — most capable; the default for tax analysis" },
  { v: "gpt-5.6-terra", l: "Terra", hint: "GPT-5.6 Terra — strong at lower cost; good for routine questions" },
  { v: "gpt-5.6-luna", l: "Luna", hint: "GPT-5.6 Luna — fastest and cheapest; short, simple questions" }
];

/* Read one setting, bounded. Safe to call before React mounts. */
function readSetting(key) {
  const all = getUIPref("settings", {}) || {};
  const v = all[key];
  if (v === undefined) return SETTINGS_DEFAULTS[key];
  if (key === "startTab") {
    if (v === "last") return v;
    return (typeof TABS !== "undefined" && TABS.some(t => t.id === v)) ? v : SETTINGS_DEFAULTS.startTab;
  }
  const allowed = SETTINGS_ALLOWED[key];
  if (allowed && !allowed.includes(v)) return SETTINGS_DEFAULTS[key];
  return v;
}

function writeSetting(key, value) {
  setUIPref("settings", { ...(getUIPref("settings", {}) || {}), [key]: value });
}

/* React binding: re-renders when any setting changes. */
function useSettings() {
  const [raw, setRaw] = useUIPref("settings", {});
  const get = key => {
    const v = (raw || {})[key];
    if (v === undefined) return SETTINGS_DEFAULTS[key];
    if (key === "startTab") return v === "last" || (typeof TABS !== "undefined" && TABS.some(t => t.id === v)) ? v : SETTINGS_DEFAULTS.startTab;
    const allowed = SETTINGS_ALLOWED[key];
    return allowed && !allowed.includes(v) ? SETTINGS_DEFAULTS[key] : v;
  };
  const set = (key, value) => setRaw({ ...(raw || {}), [key]: value });
  const resetAll = () => setRaw({});
  const changedCount = Object.keys(SETTINGS_DEFAULTS)
    .filter(k => get(k) !== SETTINGS_DEFAULTS[k]).length;
  return { get, set, resetAll, changedCount };
}

/* The model the secure endpoint is asked for. src/15-ai-chat.js calls this
   rather than hard-coding a model id. */
function aiEndpointModel() {
  return readSetting("aiModel");
}
/* Whether the AI layer is available at all. */
function aiFeaturesEnabled() {
  return readSetting("aiEnabled") !== false;
}

function SettingsRow({ label, hint, children }) {
  return EL("div", { className: "tp-ap-row tp-set-row" },
    EL("span", { className: "tp-ap-label" }, label,
      hint && EL("em", { className: "tp-set-hint" }, hint)),
    EL("div", { className: "tp-ap-opts" }, children));
}

function SettingsPanel({ tab, onClose, onOpenAppearance, counts }) {
  const S = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);

  const startTabOptions = [{ v: "last", l: "Where I left off" }]
    .concat((typeof TABS !== "undefined" ? TABS : []).map(t => ({ v: t.id, l: t.label })));

  return EL(Drawer, {
    title: "Settings",
    sub: "How the application behaves. Saved on this device, never mixed with client data — no setting here changes a tax figure.",
    width: "min(460px, 100vw)",
    onClose: onClose
  }, EL("div", { className: "tp-stack" },

    /* ---- Startup ---- */
    EL("h4", { className: "tp-set-head" }, "Startup"),
    EL(SettingsRow, { label: "Open on", hint: "The tab shown when the application starts" },
      EL("select", {
        className: "tp-select sm",
        value: S.get("startTab"),
        "aria-label": "Tab to open on startup",
        onChange: e => S.set("startTab", e.target.value)
      }, startTabOptions.map(o => EL("option", { key: o.v, value: o.v }, o.l)))),

    /* ---- Calculation ---- */
    EL("h4", { className: "tp-set-head" }, "Calculation"),
    EL(SettingsRow, {
      label: "Default recalculation scope",
      hint: "What the Recalculate control is set to when the application starts"
    }, EL(Seg, {
      small: true,
      value: S.get("recalcScope"),
      onChange: v => S.set("recalcScope", v),
      options: [{ v: "tab", l: "This tab" }, { v: "affected", l: "Affected" }, { v: "all", l: "All" }]
    })),
    EL(SettingsRow, {
      label: "Confirm an all-client recalculation",
      hint: "Ask first when the scope is every client, not just this one"
    }, EL(Seg, {
      small: true,
      value: S.get("confirmRecalcAll") ? "on" : "off",
      onChange: v => S.set("confirmRecalcAll", v === "on"),
      options: [{ v: "on", l: "Ask first" }, { v: "off", l: "Run straight away" }]
    })),
    EL(Note, null, "The deterministic engine is the calculation authority in every case. These choices change only what is re-run and when, never how a figure is computed."),

    /* ---- AI ---- */
    EL("h4", { className: "tp-set-head" }, "AI advisory layer"),
    EL(SettingsRow, {
      label: "AI features",
      hint: "Off removes every AI control from the interface"
    }, EL(Seg, {
      small: true,
      value: S.get("aiEnabled") ? "on" : "off",
      onChange: v => S.set("aiEnabled", v === "on"),
      options: [{ v: "on", l: "Enabled" }, { v: "off", l: "Disabled" }]
    })),
    S.get("aiEnabled") && EL(SettingsRow, {
      label: "Model",
      hint: "Requested from the secure server-side endpoint"
    }, EL("div", { className: "tp-set-models" },
      AI_MODEL_CHOICES.map(m => EL("button", {
        key: m.v,
        type: "button",
        className: "tp-mini" + (S.get("aiModel") === m.v ? " on" : ""),
        title: m.hint,
        "aria-pressed": S.get("aiModel") === m.v,
        onClick: () => S.set("aiModel", m.v)
      }, m.l)))),
    !S.get("aiEnabled") && EL(Note, null, "Every AI affordance is hidden while this is off: the Ask AI dock button, the AI bars on each tab, AI Optimize and AI Build Report. Nothing is sent to any model."),
    S.get("aiEnabled") && EL(Note, null, "Requests go to the deployment's secure endpoint, which holds the credential server-side. Your own key, if you add one under Ask AI → Settings, stays in this browser and is sent only to that provider. AI output is never stored as a tax figure."),

    /* ---- Appearance hand-off ---- */
    EL("h4", { className: "tp-set-head" }, "Appearance"),
    EL(SettingsRow, {
      label: "Theme, fonts and number format",
      hint: "Presentation is customized separately, globally or per tab"
    }, EL("button", {
      type: "button",
      className: "tp-btn ghost sm",
      onClick: () => { onClose(); onOpenAppearance(); }
    }, "✎ Customize appearance…")),

    /* ---- Stored data ---- */
    EL("h4", { className: "tp-set-head" }, "Stored on this device"),
    counts && EL("div", { className: "tp-set-counts" },
      EL("div", null, EL("strong", null, counts.clients), EL("span", null, counts.clients === 1 ? "client" : "clients")),
      EL("div", null, EL("strong", null, counts.scenarios), EL("span", null, counts.scenarios === 1 ? "scenario" : "scenarios")),
      EL("div", null, EL("strong", null, counts.notes), EL("span", null, counts.notes === 1 ? "note" : "notes")),
      EL("div", null, EL("strong", null, counts.audit), EL("span", null, "audit entries"))),
    EL(Note, null, "Client profiles, scenarios, notes and the audit trail live in this browser. Use Import / Export to save or move them — resetting preferences below does not touch any of them."),
    EL(SettingsRow, {
      label: "Interface preferences",
      hint: S.changedCount ? S.changedCount + " setting" + (S.changedCount === 1 ? "" : "s") + " changed from the default" : "All settings are at their defaults"
    }, confirmReset
      ? EL(React.Fragment, null,
          EL("button", {
            type: "button",
            className: "tp-btn danger sm",
            onClick: () => { S.resetAll(); setConfirmReset(false); }
          }, "Reset settings"),
          EL("button", {
            type: "button",
            className: "tp-btn ghost sm",
            onClick: () => setConfirmReset(false)
          }, "Cancel"))
      : EL("button", {
          type: "button",
          className: "tp-btn ghost sm",
          disabled: !S.changedCount,
          onClick: () => setConfirmReset(true),
          title: "Restore every setting on this panel to its default. Client data is not affected."
        }, "Reset to defaults")),
    confirmReset && EL(Note, null, "This restores the settings on this panel only. Appearance, client profiles, scenarios, notes and the audit trail are all left as they are.")));
}
