/* ==== 22-appearance ==== */
/* ============================================================================
   APPEARANCE — themes, fonts, borders and sizing, adjustable globally or
   per tab. Pure presentation: settings live in the UI-preference store
   (never with tax data) and are applied as CSS custom properties and
   modifier classes on the app root. Every value is bounded to presets so a
   saved preference can never make the app unreadable.
   ========================================================================== */

const APPEARANCE_THEMES = [{
  id: "classic",
  label: "Classic Blue",
  vars: {}
}, {
  id: "indigo",
  label: "Indigo",
  vars: {
    "--indigo": "#4f46e5",
    "--indigo-deep": "#4338ca",
    "--indigo-bg": "#eef2ff",
    "--indigo-line": "#c7d2fe",
    "--navy": "#1e1b4b",
    "--navy-2": "#292663",
    "--navy-hover": "#312e81",
    "--navy-line": "#3730a3",
    "--navtext": "#a5b4fc",
    "--navlabel": "#818cf8",
    "--paper": "#eceefb"
  }
}, {
  id: "emerald",
  label: "Emerald",
  vars: {
    "--indigo": "#059669",
    "--indigo-deep": "#047857",
    "--indigo-bg": "#ecfdf5",
    "--indigo-line": "#a7f3d0",
    "--navy": "#052e2b",
    "--navy-2": "#064e3b",
    "--navy-hover": "#065f46",
    "--navy-line": "#0f5c4a",
    "--navtext": "#8fc6b5",
    "--navlabel": "#5d9c88",
    "--paper": "#eaf1ee"
  }
}, {
  id: "graphite",
  label: "Graphite",
  vars: {
    "--indigo": "#475569",
    "--indigo-deep": "#334155",
    "--indigo-bg": "#f1f5f9",
    "--indigo-line": "#cbd5e1",
    "--navy": "#0f172a",
    "--navy-2": "#1e293b",
    "--navy-hover": "#273449",
    "--navy-line": "#334155",
    "--navtext": "#94a3b8",
    "--navlabel": "#64748b",
    "--paper": "#edeff2"
  }
}, {
  id: "burgundy",
  label: "Burgundy",
  vars: {
    "--indigo": "#be123c",
    "--indigo-deep": "#9f1239",
    "--indigo-bg": "#fff1f2",
    "--indigo-line": "#fecdd3",
    "--navy": "#2b0a14",
    "--navy-2": "#43101f",
    "--navy-hover": "#4c1526",
    "--navy-line": "#5a1a2d",
    "--navtext": "#c99aa6",
    "--navlabel": "#9d6b78",
    "--paper": "#f2edee"
  }
}, {
  id: "dark",
  label: "Dark",
  dark: true,
  vars: {
    "--paper": "#0f172a",
    "--card": "#1e293b",
    "--ink": "#e2e8f0",
    "--ink2": "#cbd5e1",
    "--muted": "#94a3b8",
    "--muted2": "#64748b",
    "--line": "#334155",
    "--line2": "#293548",
    "--hdr": "#243044",
    "--hover": "#273449",
    "--indigo": "#60a5fa",
    "--indigo-deep": "#3b82f6",
    "--indigo-bg": "#1e3a5f",
    "--indigo-line": "#1d4ed8",
    "--green": "#4ade80",
    "--green-bg": "#12291c",
    "--green-line": "#166534",
    "--amber": "#fbbf24",
    "--amber-bg": "#2c2410",
    "--amber-line": "#92600a",
    "--red": "#f87171",
    "--red-bg": "#2c1515",
    "--red-line": "#7f1d1d",
    "--slate": "#94a3b8",
    "--slate-bg": "#273449",
    "--navy": "#020617",
    "--navy-2": "#0f172a",
    "--navy-hover": "#1e293b",
    "--navy-line": "#1e293b",
    "--navtext": "#94a3b8",
    "--navlabel": "#64748b",
    "--grand-bg": "#e2e8f0",
    "--grand-fg": "#0f172a",
    "--input-line": "#475569"
  }
}];

const APPEARANCE_BACKGROUNDS = [{
  id: "theme",
  label: "Theme default",
  value: null
}, {
  id: "white",
  label: "White",
  value: "#ffffff"
}, {
  id: "cool",
  label: "Cool grey",
  value: "#e9edf3"
}, {
  id: "warm",
  label: "Warm grey",
  value: "#f0eeea"
}, {
  id: "mist",
  label: "Blue mist",
  value: "#e3eaf4"
}, {
  id: "sage",
  label: "Sage",
  value: "#e9efe9"
}, {
  id: "linen",
  label: "Linen",
  value: "#f4efe6"
}];

const APPEARANCE_FONTS = [{
  id: "system",
  label: "System Sans",
  stack: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
}, {
  id: "calibri",
  /* Uses the locally installed Calibri where present; falls back to the
     metric-compatible Carlito, then Segoe UI/Arial. No font binaries are
     bundled (Calibri is proprietary; Carlito is OFL). */
  label: "Calibri",
  stack: "Calibri,Carlito,'Segoe UI',Arial,sans-serif"
}, {
  id: "arial",
  label: "Arial",
  stack: "Arial,'Helvetica Neue',Helvetica,sans-serif"
}, {
  id: "humanist",
  label: "Humanist",
  stack: "Verdana,'Segoe UI',Geneva,Tahoma,sans-serif"
}, {
  id: "serif",
  label: "Georgia Serif",
  stack: "Georgia,'Times New Roman',serif"
}, {
  id: "mono",
  label: "Monospace",
  stack: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
}];

const APPEARANCE_SIZES = [{
  id: "sm",
  label: "Compact"
}, {
  id: "md",
  label: "Default"
}, {
  id: "lg",
  label: "Large"
}, {
  id: "xl",
  label: "Extra large"
}];

const APPEARANCE_DEFAULTS = {
  theme: "classic",
  background: "theme",
  customBackground: "",
  font: "system",
  numberFont: "same",     // "same" = follow the text font
  numberWeight: "default", // default | medium | bold
  numberSize: "default",   // default | sm | lg
  numberFormat: {},        // patch over TP_NUMFMT_DEFAULTS (00-format.js)
  size: "md",
  borderTone: "light", // light | medium | strong
  borderWidth: "1", // 1 | 2
  radius: "rounded", // rounded | soft | square
  gridlines: false
};

/* Effective settings for a tab = defaults <- global overrides <- tab overrides */
function effectiveAppearance(appearance, tab) {
  return {
    ...APPEARANCE_DEFAULTS,
    ...(appearance.global || {}),
    ...(appearance.tabs && appearance.tabs[tab] || {})
  };
}

/* Style + class computation applied on the app root */
function appearanceStyle(eff) {
  const theme = APPEARANCE_THEMES.find(t => t.id === eff.theme) || APPEARANCE_THEMES[0];
  const style = { ...theme.vars };
  const bg = APPEARANCE_BACKGROUNDS.find(b => b.id === eff.background);
  if (eff.background === "custom" && /^#[0-9a-fA-F]{6}$/.test(eff.customBackground)) {
    style["--paper"] = eff.customBackground;
  } else if (bg && bg.value) {
    style["--paper"] = bg.value;
  }
  const font = APPEARANCE_FONTS.find(f => f.id === eff.font);
  if (font && font.id !== "system") style["--app-font"] = font.stack;
  if (eff.numberFont && eff.numberFont !== "same") {
    const nf = APPEARANCE_FONTS.find(f => f.id === eff.numberFont);
    if (nf) style["--app-font-num"] = nf.stack;
  }
  if (eff.borderTone === "medium") {
    style["--line"] = theme.dark ? "#475569" : "#cbd5e1";
    style["--line2"] = theme.dark ? "#334155" : "#dde3ea";
  } else if (eff.borderTone === "strong") {
    style["--line"] = theme.dark ? "#64748b" : "#94a3b8";
    style["--line2"] = theme.dark ? "#475569" : "#cbd5e1";
  }
  return style;
}
function appearanceClasses(eff) {
  const theme = APPEARANCE_THEMES.find(t => t.id === eff.theme) || APPEARANCE_THEMES[0];
  return ["ap-fs-" + eff.size, "ap-bw-" + eff.borderWidth, "ap-rad-" + eff.radius,
    eff.numberWeight && eff.numberWeight !== "default" ? "ap-numw-" + eff.numberWeight : "",
    eff.numberSize && eff.numberSize !== "default" ? "ap-nums-" + eff.numberSize : "",
    eff.gridlines ? "ap-gridv" : "", theme.dark ? "ap-dark" : ""].filter(Boolean).join(" ");
}

/* ---- The Customize drawer ---- */
function SwatchRow({ label, children }) {
  return EL("div", {
    className: "tp-ap-row"
  }, EL("span", {
    className: "tp-ap-label"
  }, label), EL("div", {
    className: "tp-ap-opts"
  }, children));
}
function AppearancePanel({ appearance, setAppearance, tab, tabLabel, onClose }) {
  const [scope, setScope] = useState(appearance.tabs && appearance.tabs[tab] && Object.keys(appearance.tabs[tab]).length ? "tab" : "global");
  const eff = effectiveAppearance(appearance, tab);
  const set = patch => {
    if (scope === "global") {
      setAppearance({
        ...appearance,
        global: { ...(appearance.global || {}), ...patch }
      });
    } else {
      setAppearance({
        ...appearance,
        tabs: {
          ...(appearance.tabs || {}),
          [tab]: { ...(appearance.tabs && appearance.tabs[tab] || {}), ...patch }
        }
      });
    }
  };
  const resetScope = () => {
    if (scope === "global") setAppearance({ ...appearance, global: {} });
    else setAppearance({
      ...appearance,
      tabs: { ...(appearance.tabs || {}), [tab]: {} }
    });
  };
  const tabHasOverrides = !!(appearance.tabs && appearance.tabs[tab] && Object.keys(appearance.tabs[tab]).length);
  const setNumFmtPref = patch => set({ numberFormat: { ...(eff.numberFormat || {}), ...patch } });
  /* Accessibility guard: warn when a custom background leaves body text
     below WCAG AA contrast against the theme's ink color. */
  const contrastWarning = (() => {
    if (eff.background !== "custom" || !/^#[0-9a-fA-F]{6}$/.test(eff.customBackground)) return null;
    const lum = hex => {
      const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const theme = APPEARANCE_THEMES.find(t => t.id === eff.theme) || APPEARANCE_THEMES[0];
    const ink = theme.dark ? "#e2e8f0" : "#0f172a";
    const [a, b] = [lum(eff.customBackground), lum(ink)];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return ratio < 4.5 ? "this background gives body text a contrast ratio of " +
      ratio.toFixed(1) + ":1 (below the 4.5:1 accessibility minimum). Pick a lighter or darker background." : null;
  })();
  return EL(Drawer, {
    title: "Customize appearance",
    sub: "Presentation only — calculations, data and exports are unaffected. Settings are saved on this device.",
    width: "min(420px, 100vw)",
    onClose: onClose
  }, EL("div", {
    className: "tp-stack"
  }, EL(SwatchRow, {
    label: "Apply to"
  }, EL(Seg, {
    small: true,
    value: scope,
    onChange: setScope,
    options: [{
      v: "global",
      l: "Entire application"
    }, {
      v: "tab",
      l: "This tab (" + tabLabel + ")"
    }]
  })), scope === "tab" && EL(Note, null, "Choices below apply only to the ", EL("strong", null, tabLabel), " tab and override the application-wide setting.", tabHasOverrides ? " This tab already has overrides." : ""), EL(SwatchRow, {
    label: "Color theme"
  }, APPEARANCE_THEMES.map(t => EL("button", {
    key: t.id,
    type: "button",
    className: "tp-ap-theme" + (eff.theme === t.id ? " on" : ""),
    title: t.label,
    "aria-pressed": eff.theme === t.id,
    onClick: () => set({ theme: t.id })
  }, EL("span", {
    className: "tp-ap-chip",
    style: {
      background: t.vars["--navy"] || "#0b1526"
    }
  }), EL("span", {
    className: "tp-ap-chip",
    style: {
      background: t.vars["--indigo"] || "#1d4ed8"
    }
  }), EL("span", {
    className: "tp-ap-chip",
    style: {
      background: t.vars["--paper"] || "#e9edf3",
      border: "1px solid #cbd5e1"
    }
  }), t.label))), EL(SwatchRow, {
    label: "Background"
  }, APPEARANCE_BACKGROUNDS.map(b => EL("button", {
    key: b.id,
    type: "button",
    className: "tp-ap-swatch" + (eff.background === b.id ? " on" : ""),
    title: b.label,
    "aria-pressed": eff.background === b.id,
    style: {
      background: b.value || (APPEARANCE_THEMES.find(t => t.id === eff.theme) || {}).vars && (APPEARANCE_THEMES.find(t => t.id === eff.theme).vars || {})["--paper"] || "#e9edf3"
    },
    onClick: () => set({ background: b.id })
  }, b.id === "theme" ? "Auto" : "")), EL("label", {
    className: "tp-ap-custom"
  }, EL("input", {
    type: "color",
    value: /^#[0-9a-fA-F]{6}$/.test(eff.customBackground) ? eff.customBackground : "#e9edf3",
    onChange: e => set({
      background: "custom",
      customBackground: e.target.value
    }),
    "aria-label": "Custom background color"
  }), "Custom")), EL(SwatchRow, {
    label: "Font family"
  }, APPEARANCE_FONTS.map(f => EL("button", {
    key: f.id,
    type: "button",
    className: "tp-mini" + (eff.font === f.id ? " on" : ""),
    style: {
      fontFamily: f.stack
    },
    onClick: () => set({ font: f.id })
  }, f.label))), EL(SwatchRow, {
    label: "Number font"
  }, [EL("button", {
    key: "same",
    type: "button",
    className: "tp-mini" + (eff.numberFont === "same" ? " on" : ""),
    title: "Numbers use the same font as text",
    onClick: () => set({ numberFont: "same" })
  }, "Same as text")].concat(APPEARANCE_FONTS.map(f => EL("button", {
    key: f.id,
    type: "button",
    className: "tp-mini" + (eff.numberFont === f.id ? " on" : ""),
    style: { fontFamily: f.stack, fontVariantNumeric: "tabular-nums lining-nums" },
    title: "Applies to currency, percentages, table totals, KPI values, chart labels and calculation figures",
    onClick: () => set({ numberFont: f.id })
  }, f.label, " 1,234")))), EL(SwatchRow, {
    label: "Number size"
  }, EL(Seg, {
    small: true,
    value: eff.numberSize,
    onChange: v => set({ numberSize: v }),
    options: [{ v: "sm", l: "Smaller" }, { v: "default", l: "Default" }, { v: "lg", l: "Larger" }]
  })), EL(SwatchRow, {
    label: "Number weight"
  }, EL(Seg, {
    small: true,
    value: eff.numberWeight,
    onChange: v => set({ numberWeight: v }),
    options: [{ v: "default", l: "Default" }, { v: "medium", l: "Medium" }, { v: "bold", l: "Bold" }]
  })), EL(SwatchRow, {
    label: "Text size"
  }, EL(Seg, {
    small: true,
    value: eff.size,
    onChange: v => set({ size: v }),
    options: APPEARANCE_SIZES.map(s => ({
      v: s.id,
      l: s.label
    }))
  })), EL(SwatchRow, {
    label: "Border strength"
  }, EL(Seg, {
    small: true,
    value: eff.borderTone,
    onChange: v => set({ borderTone: v }),
    options: [{
      v: "light",
      l: "Light"
    }, {
      v: "medium",
      l: "Medium"
    }, {
      v: "strong",
      l: "Strong"
    }]
  })), EL(SwatchRow, {
    label: "Border width"
  }, EL(Seg, {
    small: true,
    value: eff.borderWidth,
    onChange: v => set({ borderWidth: v }),
    options: [{
      v: "1",
      l: "Hairline"
    }, {
      v: "2",
      l: "Bold"
    }]
  })), EL(SwatchRow, {
    label: "Corners"
  }, EL(Seg, {
    small: true,
    value: eff.radius,
    onChange: v => set({ radius: v }),
    options: [{
      v: "rounded",
      l: "Rounded"
    }, {
      v: "soft",
      l: "Soft"
    }, {
      v: "square",
      l: "Square"
    }]
  })), EL(SwatchRow, {
    label: "Table gridlines"
  }, EL("label", {
    className: "tp-check"
  }, EL("input", {
    type: "checkbox",
    checked: !!eff.gridlines,
    onChange: e => set({ gridlines: e.target.checked })
  }), " Show vertical column rules in tables")), EL(SwatchRow, {
    label: "Currency"
  }, EL(Seg, {
    small: true,
    value: String((eff.numberFormat || {}).currencyDecimals != null ? eff.numberFormat.currencyDecimals : 0),
    onChange: v => setNumFmtPref({ currencyDecimals: Number(v) }),
    options: [{ v: "0", l: "$1,234" }, { v: "2", l: "$1,234.00" }]
  })), EL(SwatchRow, {
    label: "Negative numbers"
  }, EL(Seg, {
    small: true,
    value: (eff.numberFormat || {}).negativeStyle || "parentheses",
    onChange: v => setNumFmtPref({ negativeStyle: v }),
    options: [{ v: "parentheses", l: "($1,234)" }, { v: "minus", l: "-$1,234" }]
  })), EL(SwatchRow, {
    label: "Zero currency"
  }, EL(Seg, {
    small: true,
    value: (eff.numberFormat || {}).currencyZeroStyle || "dollar",
    onChange: v => setNumFmtPref({ currencyZeroStyle: v }),
    options: [{ v: "dollar", l: "$0" }, { v: "dash", l: "\u2014" }, { v: "blank", l: "Blank" }]
  })), EL(SwatchRow, {
    label: "Zero amounts"
  }, EL(Seg, {
    small: true,
    value: (eff.numberFormat || {}).zeroStyle || "dash",
    onChange: v => setNumFmtPref({ zeroStyle: v }),
    options: [{ v: "dash", l: "\u2014" }, { v: "zero", l: "0" }, { v: "blank", l: "Blank" }]
  })), EL(SwatchRow, {
    label: "Percent precision"
  }, EL(Seg, {
    small: true,
    value: String((eff.numberFormat || {}).percentDecimals != null ? eff.numberFormat.percentDecimals : 1),
    onChange: v => setNumFmtPref({ percentDecimals: Number(v) }),
    options: [{ v: "0", l: "12%" }, { v: "1", l: "12.3%" }, { v: "2", l: "12.34%" }]
  })), EL(SwatchRow, {
    label: "Separators"
  }, EL("label", {
    className: "tp-check"
  }, EL("input", {
    type: "checkbox",
    checked: (eff.numberFormat || {}).thousandsSeparator !== false,
    onChange: e => setNumFmtPref({ thousandsSeparator: e.target.checked })
  }), " Thousands separators (1,234)")), EL(Note, null, "Number formatting is presentation-only: the stored values, the deterministic engine, and every export of raw data are unaffected."), contrastWarning && EL(Note, null, EL("strong", null, "Readability warning: "), contrastWarning), EL(Note, null, "Column widths for the scenario comparison ledger are adjusted on the Scenarios tab itself — use the sliders in the ledger toolbar. They persist just like these settings."), EL("div", {
    className: "tp-calc-actions"
  }, EL("button", {
    className: "tp-btn ghost sm",
    type: "button",
    onClick: resetScope
  }, scope === "global" ? "Reset application defaults" : "Clear this tab's overrides"), tabHasOverrides && scope === "global" && EL("em", {
    className: "tp-hint"
  }, "Some tabs carry their own overrides — switch scope to adjust them."))));
}
