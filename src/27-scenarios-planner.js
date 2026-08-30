/* ==== 27-scenarios-planner ==== */
/* ============================================================================
   SCENARIOS TAB — 1040 PLANNER (TY2026)

   The Scenarios tab used to host a line-by-line ledger that compared the
   workbench's own scenarios side by side. That ledger is archived, not
   deleted: it lives at src/archive/08a-scenarios-ledger.js and is no longer
   loaded by index.html.

   In its place the tab hosts the 1040 Planner module, which runs in an iframe
   (planner/index.html) and is entirely self-contained — its own UI, its own
   TY2026 engine (planner/js/engine.js) and its own saved projects.

   DELIBERATELY UNLINKED
   ---------------------
   Nothing here passes workbench scenarios into the planner, and nothing the
   planner computes flows back out. The tab is disconnected from the
   workbench's calculation pipeline by design: the planner's engine is the
   only thing that computes a number on this tab, and the workbench engine
   (src/02-engine.js / src/03-scenario.js) is the only thing that computes a
   number everywhere else. The two never mix, so a figure on screen is never
   half from one and half from the other.

   Every other tab — Dashboard, the SE / MAGI / QBI / SEHI modules, Report,
   Audit — is untouched and still runs on the workbench engine.
   ========================================================================== */

/* The directory URL, not "planner/index.html": static hosts (and Vercel)
   rewrite the explicit index path to an extensionless "/planner", and the
   browser then resolves the planner's relative script paths against the
   site root instead of the module folder — every one of them 404s and the
   frame comes up blank. A trailing slash keeps the base correct. */
const PLANNER_SRC = "planner/";

/* The single-file standalone build (tools/build-standalone.mjs) inlines the
   src/ scripts into one HTML document served from file://. The planner is a
   separate document with its own vendored libraries and is deliberately NOT
   inlined — doing so would add well over a megabyte to a file meant to be
   emailed. So in that build the module is simply unavailable, and saying so
   plainly beats rendering a frame that silently fails to load. */
function plannerAvailable() {
  return typeof location === "undefined" || location.protocol !== "file:";
}

function ScenariosPlannerPage() {
  /* A remount key: bumping it rebuilds the iframe, which is the only reliable
     way to reset a document we deliberately do not reach into. */
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [tall, setTall] = useUIPref("planner:tall", false);

  /* The planner keeps its own state inside the frame. Remounting discards
     anything unsaved there, so it is a deliberate action, never automatic. */
  const reload = () => {
    setLoaded(false);
    setNonce(n => n + 1);
  };

  if (!plannerAvailable()) {
    return EL("div", { className: "tp-stack tp-planner-missing" },
      EL(Note, { kind: "bad" },
        EL("strong", null, "The 1040 Planner module is not part of the single-file build."),
        " It is a separate document with its own engine and libraries, so it is left out to keep this file small enough to share. Every other tab works exactly as it does in the hosted application. Open the hosted app, or serve the repository, to use the planner."));
  }

  return EL("div", { className: "tp-planner-wrap" + (tall ? " tall" : "") },
    EL("div", { className: "tp-planner-bar" },
      EL("span", { className: "tp-planner-title" }, I.layers, " 1040 Planner (TY2026)"),
      EL("span", { className: "tp-planner-note" },
        "Self-contained module — it computes with its own engine and keeps its own saved projects."),
      EL("div", { className: "tp-planner-btns" },
        EL("button", {
          type: "button",
          className: "tp-btn ghost sm",
          onClick: () => setTall(!tall),
          title: tall ? "Fit the planner to the window" : "Give the planner extra height"
        }, tall ? "Fit height" : "Taller"),
        EL("button", {
          type: "button",
          className: "tp-btn ghost sm",
          onClick: reload,
          title: "Reload the planner — unsaved work inside it is discarded"
        }, "Reload"),
        EL("a", {
          className: "tp-btn ghost sm",
          href: PLANNER_SRC,
          target: "_blank",
          rel: "noopener",
          title: "Open the planner in its own browser tab"
        }, "Open full screen"))),
    !loaded && EL("div", { className: "tp-planner-loading" }, "Loading the 1040 Planner…"),
    EL("iframe", {
      key: nonce,
      className: "tp-planner-frame",
      title: "1040 Planner (TY2026)",
      src: PLANNER_SRC,
      onLoad: () => setLoaded(true)
    }));
}
