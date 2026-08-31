/* =========================================================================
   Tax Planner — Individual 1040 (TY2024–TY2028) · application UI
   Vanilla-JS rebuild of the reference planner: four tabs (Planner, Report,
   Scenarios, Coverage), per-module edit drawers, calculation-detail drawer,
   the line-by-line scenario comparison matrix, Excel/JSON import-export, and
   a deterministic client-notes parser. State persists to localStorage when
   available.

   The planner is STANDALONE — it reads no client profile and requires no
   earlier step. The tax year belongs to the project; every figure on screen
   is computed against that year's law, and a projected year is labelled as
   one wherever it appears.
   ========================================================================= */
(function () {
  'use strict';

  var Engine = window.TaxEngine;

  /* ---- tiny DOM helper --------------------------------------------------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    for (var key of Object.keys(attrs)) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key.slice(0, 2) === 'on' && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (key === 'checked') el.checked = !!value;
      else if (key === 'value') el.value = value;
      else if (key === 'disabled') el.disabled = !!value;
      else if (key === 'selected') el.selected = !!value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
    for (var i = 2; i < arguments.length; i++) appendChild(el, arguments[i]);
    return el;
  }

  function appendChild(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { for (var c of child) appendChild(el, c); return; }
    if (child instanceof Node) { el.appendChild(child); return; }
    el.appendChild(document.createTextNode(String(child)));
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (var key of Object.keys(attrs || {})) el.setAttribute(key, attrs[key]);
    for (var i = 2; i < arguments.length; i++) {
      if (arguments[i]) el.appendChild(arguments[i]);
    }
    return el;
  }

  /* ---- formatting -------------------------------------------------------- */
  function fmtUSD(value, opts) {
    opts = opts || {};
    if (!Number.isFinite(value)) return '$0';
    var abs = Math.abs(value).toLocaleString('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: opts.cents ? 2 : 0,
      maximumFractionDigits: opts.cents ? 2 : 0
    });
    if (value < 0) return '(' + abs + ')';
    if (opts.sign && value > 0) return '+' + abs;
    return abs;
  }

  function fmtPct(value, opts) {
    opts = opts || {};
    if (!Number.isFinite(value)) return '0%';
    var pct = value * 100;
    var text = pct.toFixed(opts.decimals != null ? opts.decimals : 1);
    return opts.sign && pct > 0 ? '+' + text + '%' : text + '%';
  }

  function fmtSigned(value, opts) {
    opts = opts || {};
    if (!Number.isFinite(value)) return '$0';
    if (value === 0) return fmtUSD(0, opts);
    var abs = fmtUSD(Math.abs(value), opts);
    return value > 0 ? '+' + abs : '-' + abs;
  }

  function parseAmount(raw) {
    if (typeof raw !== 'string') return 0;
    var text = raw.trim();
    if (text === '') return 0;
    var negative = /^\(.*\)$/.test(text);
    var cleaned = text.replace(/[()$,\s]/g, '');
    if (cleaned === '' || cleaned === '-') return 0;
    var value = Number(cleaned);
    if (Number.isNaN(value)) return 0;
    return negative ? -Math.abs(value) : value;
  }

  /* ---- persistence ------------------------------------------------------- */
  var STORAGE_KEY = 'tax-planner-project-v1';
  var storage = (function () {
    try {
      var probe = '__tax_planner_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return {
        persistent: true,
        get: function (k) { return window.localStorage.getItem(k); },
        set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* quota */ } },
        remove: function (k) { window.localStorage.removeItem(k); }
      };
    } catch (e) {
      var mem = new Map();
      return {
        persistent: false,
        get: function (k) { var v = mem.get(k); return v !== undefined ? v : null; },
        set: function (k, v) { mem.set(k, v); },
        remove: function (k) { mem.delete(k); }
      };
    }
  })();

  /* ---- store ------------------------------------------------------------- */

  /* The tax year the project is being planned for. Every projection in the
     app goes through here, so a figure on screen is always computed against
     one year's law — the project's — and never against the engine's default
     because a call site forgot to say which year it wanted. */
  function projectYear() {
    var y = state.project && state.project.taxYear;
    return Engine.isSupportedYear(y) ? y : Engine.DEFAULT_YEAR;
  }

  function computeInputs(inputs, year) {
    return Engine.computeProjection(inputs, { taxYear: year != null ? year : projectYear() });
  }

  /* Whether the year on screen is published law or a projection, and the
     sentence that says so. Shown wherever a figure from a projected year
     appears, so an estimate is never presented as authority. */
  function yearMeta(year) {
    var params = Engine.paramsFor(year != null ? year : projectYear());
    return {
      year: params.year,
      projected: params.provenance === 'projected',
      provenance: params.provenance,
      basis: params.basis,
      label: 'TY' + params.year + (params.provenance === 'projected' ? ' (Projected)' : '')
    };
  }

  function computeForProject(project) {
    var active = project.scenarios.find(function (s) { return s.id === project.activeScenarioId; }) || project.scenarios[0];
    if (!active) throw new Error('Project contains no scenarios');
    return Engine.computeProjection(active.inputs, { taxYear: project.taxYear });
  }

  var state = {
    project: Engine.createDemoProject(),
    result: null,
    history: [],
    lastSavedAt: null,
    activeTab: 'planner',
    openDrawer: null,
    detailLineKey: null,
    openModal: null,
    compareSelection: [],
    /* True until a saved project is hydrated or the user edits something —
       it marks the untouched demo data, which a deliberate import may replace. */
    bootedFromDemo: true
  };

  /* transient (non-persisted) UI state that must survive re-renders */
  var ui = {
    exportBusy: false,
    exportError: null,
    newScenarioName: '',
    importState: { dragOver: false, parsing: false, warnings: [], error: null, staged: null, jsonText: '' },
    notesText: '',
    libraryAmounts: {},
    /* The strategy column most recently added, so the tab can say what it
       did. Cleared on dismissal; never persisted. */
    lastModelled: null,
    /* Which scenario-matrix groups are open, by group id. Absent means open.
       Kept here rather than in the project so it never travels in an export:
       it is how the table is being looked at, not part of the plan. */
    matrixOpen: {}
  };

  function hydrate() {
    var raw = storage.get(STORAGE_KEY);
    if (raw) {
      try {
        state.project = Engine.parseProject(raw);
        state.lastSavedAt = state.project.updatedAt;
        state.bootedFromDemo = false;
      } catch (e) { /* fall back to demo */ }
    }
    state.result = computeForProject(state.project);
  }

  function persist(project) {
    storage.set(STORAGE_KEY, Engine.serializeProject(project));
    /* Anything saved is the user's project now, not untouched demo data. */
    state.bootedFromDemo = false;
  }

  function pushHistory(previousProject) {
    state.history = [previousProject].concat(state.history).slice(0, 25);
  }

  function activeScenario() {
    var project = state.project;
    return project.scenarios.find(function (s) { return s.id === project.activeScenarioId; }) || project.scenarios[0];
  }

  function replaceInputs(inputs) {
    var now = new Date().toISOString();
    var prev = state.project;
    state.project = Object.assign({}, prev, {
      updatedAt: now,
      scenarios: prev.scenarios.map(function (s) {
        return s.id === prev.activeScenarioId ? Object.assign({}, s, { inputs: inputs, updatedAt: now }) : s;
      })
    });
    persist(state.project);
    state.result = computeForProject(state.project);
    pushHistory(prev);
    state.lastSavedAt = now;
    render();
  }

  function updateInputs(updater) {
    replaceInputs(updater(activeScenario().inputs));
  }

  function setProjectMeta(patch) {
    var prev = state.project;
    state.project = Object.assign({}, prev, patch, { updatedAt: new Date().toISOString() });
    persist(state.project);
    pushHistory(prev);
    state.lastSavedAt = state.project.updatedAt;
    render();
  }

  /* Change the tax year the project is planned against. The year belongs to
     the project, not to one scenario: every column recomputes against the new
     year's law together, so a comparison is never half one year and half
     another. Inputs are untouched. */
  function setTaxYear(year) {
    if (!Engine.isSupportedYear(year)) return;
    if (year === state.project.taxYear) return;
    var prev = state.project;
    state.project = Object.assign({}, prev, { taxYear: year, updatedAt: new Date().toISOString() });
    persist(state.project);
    state.result = computeForProject(state.project);
    pushHistory(prev);
    state.lastSavedAt = state.project.updatedAt;
    render();
  }

  function setActiveScenario(id) {
    if (!state.project.scenarios.some(function (s) { return s.id === id; })) return;
    state.project = Object.assign({}, state.project, { activeScenarioId: id });
    persist(state.project);
    state.result = computeForProject(state.project);
    render();
  }

  function addScenario(name) {
    var prev = state.project;
    var scenario = Engine.createScenario(name, JSON.parse(JSON.stringify(activeScenario().inputs)));
    state.project = Object.assign({}, prev, {
      scenarios: prev.scenarios.concat([scenario]),
      activeScenarioId: scenario.id,
      updatedAt: new Date().toISOString()
    });
    persist(state.project);
    state.result = computeForProject(state.project);
    pushHistory(prev);
    render();
  }

  function duplicateActiveScenario() {
    var prev = state.project;
    var copy = Engine.duplicateScenario(activeScenario());
    state.project = Object.assign({}, prev, {
      scenarios: prev.scenarios.concat([copy]),
      activeScenarioId: copy.id,
      updatedAt: new Date().toISOString()
    });
    persist(state.project);
    state.result = computeForProject(state.project);
    pushHistory(prev);
    render();
  }

  function renameScenario(id, name) {
    var prev = state.project;
    var now = new Date().toISOString();
    state.project = Object.assign({}, prev, {
      scenarios: prev.scenarios.map(function (s) {
        return s.id === id ? Object.assign({}, s, { name: name, updatedAt: now }) : s;
      }),
      updatedAt: now
    });
    persist(state.project);
    pushHistory(prev);
    render();
  }

  function deleteScenario(id) {
    var prev = state.project;
    if (prev.scenarios.length <= 1) return;
    var remaining = prev.scenarios.filter(function (s) { return s.id !== id; });
    var first = remaining[0];
    if (!first) return;
    state.project = Object.assign({}, prev, {
      scenarios: remaining,
      activeScenarioId: prev.activeScenarioId === id ? first.id : prev.activeScenarioId,
      updatedAt: new Date().toISOString()
    });
    persist(state.project);
    state.result = computeForProject(state.project);
    pushHistory(prev);
    state.compareSelection = state.compareSelection.filter(function (s) { return s !== id; });
    render();
  }

  /* ---- mutators the scenario matrix needs ---------------------------------
     The matrix edits any column, not only the active one, so these address a
     scenario by id. Editing one scenario rewrites that scenario and nothing
     else: the other columns keep the inputs they had, and each is recomputed
     from its own inputs, so a change in Scenario 2 can never move Scenario 1.
     -------------------------------------------------------------------- */

  function updateScenarioInputs(id, updater) {
    var prev = state.project;
    var target = prev.scenarios.find(function (s) { return s.id === id; });
    if (!target) return;
    var next = updater(JSON.parse(JSON.stringify(target.inputs)));
    if (!next) return;
    var now = new Date().toISOString();
    state.project = Object.assign({}, prev, {
      updatedAt: now,
      scenarios: prev.scenarios.map(function (s) {
        return s.id === id ? Object.assign({}, s, { inputs: next, updatedAt: now }) : s;
      })
    });
    persist(state.project);
    state.result = computeForProject(state.project);
    pushHistory(prev);
    state.lastSavedAt = now;
    render();
  }

  function duplicateScenarioById(id) {
    var prev = state.project;
    var source = prev.scenarios.find(function (s) { return s.id === id; });
    if (!source) return;
    var copy = Engine.duplicateScenario(source);
    var at = prev.scenarios.indexOf(source) + 1;
    var scenarios = prev.scenarios.slice();
    scenarios.splice(at, 0, copy);
    state.project = Object.assign({}, prev, {
      scenarios: scenarios,
      activeScenarioId: copy.id,
      updatedAt: new Date().toISOString()
    });
    persist(state.project);
    state.result = computeForProject(state.project);
    pushHistory(prev);
    render();
  }

  /* Mark one scenario as the baseline every other column is measured against.

     Baseline is a DECLARED position, not a computed one: it is whichever
     scenario the preparer is comparing from — usually the client's current
     facts. It never moves on its own, and in particular it does not move
     because some other scenario happens to produce a lower tax. Lowest tax
     and baseline are different ideas, and the matrix keeps them apart. */
  function setBaselineScenario(id) {
    var prev = state.project;
    if (!prev.scenarios.some(function (s) { return s.id === id; })) return;
    var now = new Date().toISOString();
    state.project = Object.assign({}, prev, {
      scenarios: prev.scenarios.map(function (s) {
        return Object.assign({}, s, { isBaseline: s.id === id });
      }),
      updatedAt: now
    });
    persist(state.project);
    pushHistory(prev);
    state.lastSavedAt = now;
    render();
  }

  /* Move a column left or right. Order is presentation only — it changes no
     figure, and the baseline stays whichever scenario was declared. */
  function moveScenario(id, direction) {
    var prev = state.project;
    var from = prev.scenarios.findIndex(function (s) { return s.id === id; });
    var to = from + direction;
    if (from < 0 || to < 0 || to >= prev.scenarios.length) return;
    var scenarios = prev.scenarios.slice();
    var moved = scenarios.splice(from, 1)[0];
    scenarios.splice(to, 0, moved);
    state.project = Object.assign({}, prev, { scenarios: scenarios, updatedAt: new Date().toISOString() });
    persist(state.project);
    pushHistory(prev);
    render();
  }

  /* The scenario every other column is measured against: the declared
     baseline, or the first column when none has been declared yet. */
  function baselineScenario() {
    var scenarios = state.project.scenarios;
    return scenarios.find(function (s) { return s.isBaseline; }) || scenarios[0];
  }

  function undo() {
    var previous = state.history[0];
    if (!previous) return;
    state.history = state.history.slice(1);
    persist(previous);
    state.project = previous;
    state.result = computeForProject(previous);
    state.lastSavedAt = new Date().toISOString();
    render();
  }

  function resetToDemo() {
    var prev = state.project;
    state.project = Engine.createDemoProject();
    persist(state.project);
    state.result = computeForProject(state.project);
    pushHistory(prev);
    state.openDrawer = null;
    state.openModal = null;
    render();
  }

  function loadProject(project) {
    var prev = state.project;
    persist(project);
    state.project = project;
    state.result = computeForProject(project);
    pushHistory(prev);
    state.lastSavedAt = project.updatedAt;
    render();
  }

  function setDrawer(name) { state.openDrawer = name; render(); }
  function openCalcDetail(lineKey) { state.openDrawer = 'calcdetail'; state.detailLineKey = lineKey; render(); }
  function setModal(name) {
    state.openModal = name;
    if (name !== 'import') ui.importState = { dragOver: false, parsing: false, warnings: [], error: null, staged: null, jsonText: ui.importState.jsonText };
    render();
  }
  function setTab(tab) { state.activeTab = tab; render(); }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportExcel() {
    ui.exportBusy = true;
    ui.exportError = null;
    render();
    try {
      var bytes = await window.TaxExcel.buildProjectWorkbook(state.project);
      var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      downloadBlob(blob, 'tax-plan-' + projectYear() + '-' + window.TaxExcel.safeClientFilename(state.project) + '.xlsx');
    } catch (e) {
      ui.exportError = e instanceof Error ? e.message : 'Export failed';
    } finally {
      ui.exportBusy = false;
      render();
    }
  }

  function exportJson() {
    var filename = 'tax-plan-' + projectYear() + '-' + (state.project.client.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'client') + '.json';
    downloadBlob(new Blob([Engine.serializeProject(state.project)], { type: 'application/json' }), filename);
  }

  /* ---- status chips ------------------------------------------------------- */
  var STATUS_META = {
    complete: {
      label: 'Complete', short: 'OK',
      className: 'border-emerald-300 bg-emerald-50 text-emerald-800',
      description: 'Computed from complete inputs under the controlling authority.'
    },
    estimated: {
      label: 'Estimated', short: 'EST',
      className: 'border-amber-300 bg-amber-50 text-amber-800',
      description: 'Simplified or approximated calculation — review before delivery.'
    },
    incomplete: {
      label: 'Incomplete', short: 'INC',
      className: 'border-orange-300 bg-orange-50 text-orange-800',
      description: 'Required inputs are missing; figure may be understated.'
    },
    'not-applicable': {
      label: 'N/A', short: '—',
      className: 'border-slate-300 bg-slate-100 text-slate-500',
      description: 'Not applicable to this return.'
    },
    error: {
      label: 'Error', short: 'ERR',
      className: 'border-rose-300 bg-rose-50 text-rose-800',
      description: 'The module failed to compute — see messages.'
    }
  };
  var STATUS_ORDER = ['complete', 'estimated', 'incomplete', 'error', 'not-applicable'];

  function statusChip(status, message, compact) {
    var meta = STATUS_META[status];
    var title = message ? meta.label + ': ' + message : meta.label + ' — ' + meta.description;
    return h('span', {
      title: title, 'aria-label': title,
      class: ['inline-flex select-none items-center justify-center rounded-[2px] border text-[9.5px] font-bold uppercase leading-none tracking-[0.06em]',
        compact ? 'h-[15px] w-[30px]' : 'h-[16px] px-1.5', meta.className].join(' ')
    }, compact ? meta.short : meta.label);
  }

  /* ---- header ------------------------------------------------------------- */
  function logoMark() {
    return svgEl('svg', { viewBox: '0 0 28 28', role: 'img', 'aria-label': 'Tax Planner mark', class: 'h-6 w-6 shrink-0 text-accent-500' },
      svgEl('rect', { x: '1', y: '1', width: '26', height: '26', rx: '2', stroke: 'currentColor', 'stroke-width': '1.6', fill: 'none' }),
      svgEl('path', { d: 'M6 9h16M6 14h9M6 19h12', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round' }),
      svgEl('path', { d: 'M18 17.5l2.6 2.6L26 14.7', stroke: 'currentColor', 'stroke-width': '2', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  function renderHeader() {
    var project = state.project;
    var savedText = state.lastSavedAt
      ? 'Saved ' + new Date(state.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Not yet saved';
    return h('header', { class: 'no-print border-b border-navy-800 bg-navy-950' },
      h('div', { class: 'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2' },
        h('div', { class: 'flex min-w-0 items-center gap-2.5' },
          logoMark(),
          h('div', { class: 'min-w-0 leading-tight' },
            h('div', { class: 'truncate text-[14px] font-semibold tracking-tight text-white' },
              'Tax Planner ', h('span', { class: 'font-normal text-slate-400' }, '/ Individual 1040')),
            h('div', { class: 'truncate text-[11px] text-slate-400' }, project.client + ' · prepared by ' + project.preparedBy))),
        h('div', { class: 'h-8 w-px bg-navy-800', 'aria-hidden': 'true' }),
        h('div', { class: 'flex items-center gap-1.5' },
          h('label', { for: 'taxyear', class: 'text-[10.5px] font-semibold uppercase tracking-wide text-slate-500' }, 'Year'),
          h('select', {
            id: 'taxyear',
            title: 'The tax year the whole project is planned against. Every scenario recomputes on that year\u2019s law.',
            class: 'h-[28px] rounded-[3px] border border-navy-700 bg-navy-900 px-1.5 text-[12.5px] text-slate-100 outline-none focus:border-accent-500',
            onchange: function (e) { setTaxYear(Number(e.target.value)); }
          }, Engine.SUPPORTED_YEARS.map(function (y) {
            var meta = yearMeta(y);
            return h('option', {
              value: String(y), selected: y === project.taxYear,
              title: meta.basis
            }, meta.projected ? y + ' \u00b7 projected' : String(y));
          })),
          /* A projected year is never allowed to look like published law. */
          yearMeta(project.taxYear).projected
            ? h('span', {
              class: 'rounded-[2px] border border-amber-500/60 bg-amber-500/10 px-1.5 py-[2px] text-[9.5px] font-bold uppercase tracking-wide text-amber-300',
              title: yearMeta(project.taxYear).basis
            }, 'Projected / Estimated')
            : null),
        h('div', { class: 'flex min-w-0 items-center gap-1.5' },
          h('label', { for: 'scenario', class: 'text-[10.5px] font-semibold uppercase tracking-wide text-slate-500' }, 'Scenario'),
          h('select', {
            id: 'scenario',
            class: 'h-[28px] max-w-[220px] truncate rounded-[3px] border border-navy-700 bg-navy-900 px-1.5 text-[12.5px] text-slate-100 outline-none focus:border-accent-500',
            onchange: function (e) { setActiveScenario(e.target.value); }
          }, project.scenarios.map(function (s) {
            return h('option', { value: s.id, selected: s.id === project.activeScenarioId },
              s.name + (s.isBaseline ? ' (baseline)' : ''));
          }))),
        h('div', { class: 'ml-auto flex items-center gap-1.5' },
          h('button', {
            type: 'button', class: 'btn-ghost', disabled: state.history.length === 0,
            title: 'Undo the last input change', onclick: undo
          }, 'Undo'),
          h('button', { type: 'button', class: 'btn-ghost', onclick: function () { setModal('import'); } }, 'Import'),
          h('button', { type: 'button', class: 'btn-ghost', onclick: exportJson }, 'Export JSON'),
          h('button', {
            type: 'button', class: 'btn-ghost', disabled: ui.exportBusy,
            onclick: function () { exportExcel(); }
          }, ui.exportBusy ? 'Building…' : 'Export Excel'),
          h('button', { type: 'button', class: 'btn-primary', onclick: function () { setModal('compare'); } }, 'Compare'),
          h('div', { class: 'ml-1.5 flex flex-col items-end leading-tight' },
            h('span', { class: 'flex items-center gap-1 text-[11px] text-slate-400' },
              h('span', { class: 'h-1.5 w-1.5 rounded-full bg-emerald-400', 'aria-hidden': 'true' }), savedText),
            h('span', { class: 'text-[10px] text-slate-600' }, storage.persistent ? 'this browser' : 'this session only')))),
      ui.exportError
        ? h('p', { role: 'alert', class: 'border-t border-rose-800 bg-rose-950/60 px-4 py-1 text-[11.5px] text-rose-200' }, ui.exportError)
        : null);
  }

  /* ---- tab nav ------------------------------------------------------------ */
  var TABS = [
    { key: 'planner', label: 'Planner', hint: 'Form 1040 worksheet' },
    { key: 'report', label: 'Report', hint: 'Client deliverable' },
    { key: 'scenarios', label: 'Scenarios', hint: 'What-if comparison' },
    { key: 'coverage', label: 'Coverage', hint: 'Module support matrix' }
  ];

  function renderTabs() {
    return h('nav', { 'aria-label': 'Primary', class: 'no-print border-b border-navy-800 bg-navy-900 px-4' },
      h('ul', { role: 'tablist', class: 'flex items-stretch gap-0' },
        TABS.map(function (tab) {
          var active = tab.key === state.activeTab;
          return h('li', { class: 'flex' },
            h('button', {
              type: 'button', role: 'tab', id: 'tab-' + tab.key,
              'aria-selected': active ? 'true' : 'false', 'aria-controls': 'panel-' + tab.key,
              title: tab.hint,
              onclick: function () { setTab(tab.key); },
              class: ['relative -mb-px border-b-2 px-4 py-2 text-[13px] font-semibold tracking-wide transition',
                active ? 'border-accent-500 text-white' : 'border-transparent text-slate-400 hover:border-navy-700 hover:text-slate-200'].join(' ')
            }, tab.label));
        })));
  }

  /* ---- planner tab -------------------------------------------------------- */
  var DRAWER_BY_MODULE = {
    wages: 'wages',
    interestDividends: 'interestdividends',
    businessIncome: 'schedulec',
    rentalIncome: 'schedulee',
    capitalGains: 'capitalgains',
    otherIncome: 'otherincome',
    planningDeductions: 'planning',
    deductions: 'itemized',
    payments: 'payments'
  };

  var PLANNER_SECTIONS = [
    {
      id: 'income', title: 'Income', formRef: 'Form 1040, lines 1–8',
      moduleKeys: ['wages', 'interestDividends', 'businessIncome', 'rentalIncome', 'otherIncome'],
      entryPoints: [{
        key: 'capitalgains', label: 'Capital gains & losses (Schedule D)',
        reference: '1040 line 7 · IRC §1(h)', drawer: 'capitalgains'
      }],
      computed: [{ key: 'totalIncome', label: 'Total income', reference: '1040 line 9', value: function (r) { return r.totalIncome; }, emphasis: true }]
    },
    {
      id: 'adjustments', title: 'Adjustments to Income', formRef: 'Schedule 1, Part II', moduleKeys: ['planningDeductions'],
      computed: [{ key: 'adjustments', label: 'Total adjustments to income', reference: '1040 line 10', value: function (r) { return r.adjustments; }, emphasis: true }]
    },
    {
      id: 'agi', title: 'Adjusted Gross Income', formRef: 'Form 1040, line 11', moduleKeys: [],
      computed: [
        { key: 'agi', label: 'Adjusted gross income', reference: '1040 line 11', value: function (r) { return r.agi; }, emphasis: true },
        { key: 'magi', label: 'Modified AGI (NIIT / phase-out testing)', reference: 'IRC §1411(d)', value: function (r) { return r.magi; } }
      ]
    },
    {
      id: 'deductions', title: 'Deductions', formRef: 'Form 1040, line 12', moduleKeys: ['deductions'],
      computed: [{ key: 'deductionUsed', label: 'Deduction taken', reference: '1040 line 12', value: function (r) { return r.deductionUsed; }, emphasis: true }]
    },
    {
      id: 'qbi', title: 'Qualified Business Income Deduction', formRef: 'Form 1040, line 13 · IRC §199A', moduleKeys: ['qbi'],
      computed: [{ key: 'qbiDeduction', label: 'QBI deduction', reference: '1040 line 13', value: function (r) { return r.qbiDeduction; }, emphasis: true }]
    },
    {
      id: 'taxable', title: 'Taxable Income', formRef: 'Form 1040, line 15', moduleKeys: [],
      computed: [{ key: 'taxableIncome', label: 'Taxable income', reference: '1040 line 15', value: function (r) { return r.taxableIncome; }, emphasis: true }]
    },
    {
      id: 'tax', title: 'Tax', formRef: 'Form 1040, line 16', moduleKeys: ['taxComputation'],
      computed: [
        { key: 'ordinaryTax', label: 'Tax on ordinary income', reference: 'IRC §1(j)', value: function (r) { return r.ordinaryTax; } },
        { key: 'capitalGainsTax', label: 'Tax on qualified dividends & net LTCG', reference: 'IRC §1(h)', value: function (r) { return r.capitalGainsTax; } }
      ]
    },
    {
      id: 'othertaxes', title: 'Other Taxes', formRef: 'Schedule 2', moduleKeys: ['selfEmploymentTax', 'additionalTaxes'],
      computed: [
        { key: 'seTax', label: 'Self-employment tax', reference: 'Schedule SE', value: function (r) { return r.seTax; } },
        { key: 'amt', label: 'Alternative minimum tax', reference: 'Form 6251', value: function (r) { return r.amt; } },
        { key: 'niit', label: 'Net investment income tax (3.8%)', reference: 'Form 8960 · IRC §1411', value: function (r) { return r.niit; } },
        { key: 'additionalMedicare', label: 'Additional Medicare tax (0.9%)', reference: 'Form 8959 · IRC §3101(b)(2)', value: function (r) { return r.additionalMedicare; } },
        { key: 'totalTax', label: 'Total tax', reference: '1040 line 24', value: function (r) { return r.totalTax; }, emphasis: true }
      ]
    },
    {
      id: 'payments', title: 'Payments & Credits', formRef: 'Form 1040, lines 25–33', moduleKeys: ['payments'],
      computed: [{ key: 'totalPayments', label: 'Total payments and refundable credits', reference: '1040 line 33', value: function (r) { return r.totalPayments; }, emphasis: true }]
    },
    {
      id: 'balance', title: 'Balance', formRef: 'Form 1040, lines 34–37', moduleKeys: [],
      computed: [
        { key: 'refund', label: 'Overpayment / projected refund', reference: '1040 line 34', value: function (r) { return r.refund; } },
        { key: 'balanceDue', label: 'Amount owed at filing', reference: '1040 line 37', value: function (r) { return r.balanceDue; }, emphasis: true },
        { key: 'safeHarborRequired', label: 'Estimated-tax safe harbor requirement', reference: 'IRC §6654(d)', value: function (r) { return r.safeHarborRequired; } },
        { key: 'underpayment', label: 'Projected underpayment vs. safe harbor', reference: 'Form 2210', value: function (r) { return r.underpayment; } }
      ]
    }
  ];

  function chevron() {
    return svgEl('svg', { viewBox: '0 0 12 12', 'aria-hidden': 'true', class: 'h-3 w-3' },
      svgEl('path', { d: 'M4 2.5 L8 6 L4 9.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  function moduleHeaderRow(module, drawer) {
    var firstMessage = module.messages[0] ? module.messages[0].message : undefined;
    return h('tr', { class: 'border-b border-slate-200 bg-slate-100/80' },
      h('td', { class: 'py-[5px] pl-3 pr-2' },
        h('span', { class: 'text-[13px] font-semibold text-navy-900' }, module.label)),
      h('td', { class: 'px-2 py-[5px] text-[11px] text-slate-500' },
        module.lines.length + ' line' + (module.lines.length === 1 ? '' : 's')),
      h('td', { class: 'num px-2 py-[5px] text-[13px] font-bold text-navy-950' }, fmtUSD(module.total)),
      h('td', { class: 'px-2 py-[5px] text-center' }, statusChip(module.status, firstMessage, true)),
      h('td', { class: 'pr-2 text-right' },
        drawer
          ? h('button', {
            type: 'button', onclick: function () { setDrawer(drawer); },
            class: 'inline-flex h-[22px] items-center gap-1 rounded-[3px] border border-slate-300 bg-white px-1.5 text-[11px] font-medium text-slate-600 transition hover:border-accent-500 hover:text-accent-600',
            'aria-label': 'Edit ' + module.label + ' inputs'
          }, 'Edit', chevron())
          : h('span', { class: 'pr-1 text-[11px] text-slate-300' }, '—')));
  }

  function moduleLineRow(module, lineItem) {
    var muted = lineItem.status === 'not-applicable' && lineItem.amount === 0;
    return h('tr', { class: 'border-b border-slate-100 hover:bg-sky-50/70' },
      h('td', { class: 'py-[3px] pl-7 pr-2 text-[13px] ' + (muted ? 'text-slate-400' : 'text-slate-700') }, lineItem.label),
      h('td', { class: 'px-2 py-[3px] text-[10.5px] leading-[1.3] text-slate-400' }, lineItem.citation != null ? lineItem.citation : ''),
      h('td', { class: 'num px-2 py-[3px] text-[13px] ' + (muted ? 'text-slate-400' : 'text-slate-800') }, fmtUSD(lineItem.amount)),
      h('td', { class: 'px-2 py-[3px] text-center' }, statusChip(lineItem.status, lineItem.notes ? lineItem.notes[0] : undefined, true)),
      h('td', { class: 'pr-2 text-right' },
        h('button', {
          type: 'button', onclick: function () { openCalcDetail(lineItem.key); },
          title: 'Show calculation detail',
          'aria-label': 'Show calculation detail for ' + lineItem.label,
          class: 'inline-flex h-[20px] w-[20px] items-center justify-center rounded-[3px] text-slate-400 transition hover:bg-white hover:text-accent-600'
        }, chevron())));
  }

  function entryPointRow(row, amount) {
    return h('tr', { class: 'border-b border-slate-200 bg-slate-100/80' },
      h('td', { class: 'py-[5px] pl-3 pr-2 text-[13px] font-semibold text-navy-900' }, row.label),
      h('td', { class: 'px-2 py-[5px] text-[10.5px] text-slate-500' }, row.reference),
      h('td', { class: 'num px-2 py-[5px] text-[13px] font-bold text-navy-950' }, fmtUSD(amount)),
      h('td', { class: 'px-2 py-[5px] text-center' }, statusChip('complete', undefined, true)),
      h('td', { class: 'pr-2 text-right' },
        h('button', {
          type: 'button', onclick: function () { setDrawer(row.drawer); },
          class: 'inline-flex h-[22px] items-center gap-1 rounded-[3px] border border-slate-300 bg-white px-1.5 text-[11px] font-medium text-slate-600 transition hover:border-accent-500 hover:text-accent-600',
          'aria-label': 'Edit ' + row.label + ' inputs'
        }, 'Edit', chevron())));
  }

  function computedRow(row, result) {
    var value = row.value(result);
    return h('tr', { class: row.emphasis ? 'border-y border-navy-800/30 bg-navy-950/[0.045]' : 'border-b border-slate-100' },
      h('td', { class: 'py-[5px] pl-3 pr-2 text-[13px] ' + (row.emphasis ? 'font-bold uppercase tracking-wide text-navy-950' : 'text-slate-700') }, row.label),
      h('td', { class: 'px-2 py-[5px] text-[10.5px] text-slate-400' }, row.reference),
      h('td', { class: 'num px-2 py-[5px] ' + (row.emphasis ? 'text-[14px] font-bold text-navy-950' : 'text-[13px] text-slate-800') },
        row.kind === 'percent' ? fmtPct(value) : fmtUSD(value)),
      h('td', {}), h('td', {}));
  }

  function lineStatusPanel(result, onGoToCoverage) {
    var counts = { complete: 0, estimated: 0, incomplete: 0, 'not-applicable': 0, error: 0 };
    for (var key of result.moduleOrder) {
      var mod = result.modules[key];
      if (mod) for (var l of mod.lines) counts[l.status] += 1;
    }
    var total = STATUS_ORDER.reduce(function (acc, s) { return acc + counts[s]; }, 0);
    return h('div', { class: 'panel' },
      h('div', { class: 'panel-header' },
        h('span', {}, 'Line Status'),
        h('span', { class: 'font-mono text-[10px] font-normal normal-case tracking-normal text-slate-500' }, total + ' lines')),
      h('ul', { class: 'divide-y divide-slate-100' },
        STATUS_ORDER.map(function (statusKey) {
          var meta = STATUS_META[statusKey];
          var count = counts[statusKey];
          var pct = total === 0 ? 0 : Math.round(count / total * 100);
          return h('li', { class: 'flex items-center gap-2 px-3 py-[5px]' },
            h('span', { class: 'inline-flex h-[15px] w-[30px] shrink-0 items-center justify-center rounded-[2px] border text-[9.5px] font-bold uppercase leading-none ' + meta.className }, meta.short),
            h('span', { class: 'flex-1 truncate text-[12px] text-slate-600' }, meta.label),
            h('span', { class: 'h-1.5 w-14 overflow-hidden rounded-full bg-slate-200' },
              h('span', { class: 'block h-full rounded-full bg-navy-700', style: { width: pct + '%' } })),
            h('span', { class: 'num w-6 text-[12px] text-navy-900' }, String(count)));
        })),
      onGoToCoverage
        ? h('div', { class: 'border-t border-slate-200 bg-slate-50 px-3 py-1.5' },
          h('button', {
            type: 'button', onclick: onGoToCoverage,
            class: 'text-[11.5px] font-semibold text-accent-600 underline-offset-2 hover:underline'
          }, 'View full coverage matrix →'))
        : h('div', { class: 'border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500' },
          'Overall result status: ',
          h('span', { class: 'font-semibold text-slate-700' }, STATUS_META[result.status].label)));
  }

  function summaryRail(result) {
    var due = result.balanceDue > 0;
    return h('aside', { class: 'no-print sticky top-3 flex w-[286px] shrink-0 flex-col gap-3' },
      h('div', { class: 'panel overflow-hidden' },
        h('div', { class: 'border-b border-navy-800 bg-navy-950 px-3 py-2' },
          h('h2', { class: 'text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300' }, 'Live Projection'),
          h('p', { class: 'mt-0.5 text-[10.5px] ' + (yearMeta().projected ? 'text-amber-400' : 'text-slate-500') },
            'Tax year ' + yearMeta().year + (yearMeta().projected ? ' (projected) ' : ' ') + '· recomputed on edit')),
        h('dl', { class: 'divide-y divide-slate-200' },
          [
            { label: 'Adjusted gross income', value: fmtUSD(result.agi) },
            { label: 'Taxable income', value: fmtUSD(result.taxableIncome) },
            { label: 'Total tax', value: fmtUSD(result.totalTax) },
            { label: 'Total payments', value: fmtUSD(result.totalPayments) },
            { label: 'Effective rate', value: fmtPct(result.effectiveRate), title: 'Tax before credits ÷ taxable income (IRC §1 computation)' },
            { label: 'Marginal rate', value: fmtPct(result.marginalRate) }
          ].map(function (row) {
            return h('div', { class: 'flex items-baseline justify-between px-3 py-[6px]' },
              h('dt', { class: 'text-[12px] text-slate-600', title: row.title }, row.label),
              h('dd', { class: 'num text-[13px] text-navy-950' }, row.value));
          })),
        h('div', { class: 'border-t-2 px-3 py-2.5 ' + (due ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50') },
          h('div', { class: 'text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-600' },
            due ? 'Projected balance due' : 'Projected refund'),
          h('div', { class: 'num mt-0.5 text-[22px] font-bold leading-none ' + (due ? 'text-rose-700' : 'text-emerald-700') },
            fmtUSD(due ? result.balanceDue : result.refund)),
          result.underpayment > 0
            ? h('div', { class: 'mt-1.5 text-[11px] leading-snug text-rose-800' },
              'Underpaid vs. §6654 safe harbor by ',
              h('span', { class: 'num font-semibold' }, fmtUSD(result.underpayment)), '.')
            : h('div', { class: 'mt-1.5 text-[11px] leading-snug text-emerald-800' },
              'Meets the §6654 estimated-tax safe harbor.'))),
      lineStatusPanel(result, null),
      h('div', { class: 'panel' },
        h('div', { class: 'panel-header' },
          h('span', {}, 'Diagnostics'),
          h('span', { class: 'font-mono text-[10px] font-normal normal-case tracking-normal text-slate-500' }, String(result.messages.length))),
        h('ul', { class: 'thin-scroll max-h-[220px] divide-y divide-slate-100 overflow-y-auto' },
          result.messages.length === 0
            ? h('li', { class: 'px-3 py-2 text-[11.5px] italic text-slate-500' }, 'No validation messages.')
            : result.messages.map(function (m) {
              return h('li', { class: 'flex gap-2 px-3 py-1.5' },
                h('span', {
                  'aria-hidden': 'true',
                  class: 'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ' +
                    (m.severity === 'error' ? 'bg-rose-500' : m.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500')
                }),
                h('span', { class: 'text-[11.5px] leading-snug text-slate-600' }, m.message));
            }))),
      h('button', {
        type: 'button', class: 'btn-light w-full justify-center',
        onclick: function () { setModal('textprompt'); }
      }, 'Paste client notes →'));
  }

  function renderPlanner() {
    var result = state.result;
    var capitalGainsTotal = activeScenario().inputs.capitalGains.reduce(function (acc, g) {
      return acc + g.shortTermGain + g.longTermGain + g.section1250Gain + g.collectiblesGain;
    }, 0);
    return h('div', { class: 'flex items-start gap-4 px-4 py-4' },
      h('div', { class: 'min-w-0 flex-1 space-y-3' },
        PLANNER_SECTIONS.map(function (section) {
          var modules = section.moduleKeys.map(function (key) { return result.modules[key]; })
            .filter(function (m) { return m !== undefined; });
          return h('section', { class: 'panel overflow-hidden' },
            h('div', { class: 'panel-header' },
              h('span', {}, section.title),
              h('span', { class: 'font-normal normal-case tracking-normal text-slate-500' }, section.formRef)),
            h('table', { class: 'w-full table-fixed border-collapse' },
              h('colgroup', {},
                h('col', {}), h('col', { class: 'w-[215px]' }), h('col', { class: 'w-[130px]' }),
                h('col', { class: 'w-[56px]' }), h('col', { class: 'w-[64px]' })),
              h('tbody', {},
                modules.map(function (mod) {
                  return [moduleHeaderRow(mod, DRAWER_BY_MODULE[mod.moduleKey])]
                    .concat(mod.lines.map(function (l) { return moduleLineRow(mod, l); }));
                }),
                (section.entryPoints || []).map(function (row) { return entryPointRow(row, capitalGainsTotal); }),
                section.computed.map(function (row) { return computedRow(row, result); }))));
        })),
      summaryRail(result));
  }

  /* ---- report tab --------------------------------------------------------- */
  var FILING_STATUS_LABELS = {
    single: 'Single', mfj: 'Married filing jointly', mfs: 'Married filing separately',
    hoh: 'Head of household', qss: 'Qualifying surviving spouse'
  };

  function renderReport() {
    var project = state.project;
    var scenario = activeScenario();
    var result = state.result;
    var inputs = scenario.inputs;
    var noStrategiesResult = computeInputs(Object.assign({}, inputs, {
      planningStrategies: inputs.planningStrategies.map(function (s) { return Object.assign({}, s, { enabled: false }); })
    }));
    var strategySavings = noStrategiesResult.totalTax - result.totalTax;
    var modules = result.moduleOrder.map(function (k) { return result.modules[k]; })
      .filter(function (m) { return m !== undefined; });
    var summaryRows = [
      ['Total income', 'Form 1040, line 9', fmtUSD(result.totalIncome)],
      ['Adjustments to income', 'Schedule 1, Part II', fmtUSD(result.adjustments)],
      ['Adjusted gross income', 'Form 1040, line 11', fmtUSD(result.agi)],
      ['Deduction taken (' + result.deductionType + ')', 'Form 1040, line 12', fmtUSD(result.deductionUsed)],
      ['Qualified business income deduction', 'Form 1040, line 13 · §199A', fmtUSD(result.qbiDeduction)],
      ['Taxable income', 'Form 1040, line 15', fmtUSD(result.taxableIncome)],
      ['Tax on ordinary income', 'IRC §1(j)', fmtUSD(result.ordinaryTax)],
      ['Tax on preference income', 'IRC §1(h)', fmtUSD(result.capitalGainsTax)],
      ['Self-employment tax', 'Schedule SE', fmtUSD(result.seTax)],
      ['Alternative minimum tax', 'Form 6251', fmtUSD(result.amt)],
      ['Net investment income tax', 'Form 8960', fmtUSD(result.niit)],
      ['Additional Medicare tax', 'Form 8959', fmtUSD(result.additionalMedicare)],
      ['Total tax', 'Form 1040, line 24', fmtUSD(result.totalTax)],
      ['Total payments & refundable credits', 'Form 1040, line 33', fmtUSD(result.totalPayments)],
      [result.balanceDue > 0 ? 'Projected balance due' : 'Projected refund',
        result.balanceDue > 0 ? 'Form 1040, line 37' : 'Form 1040, line 34',
        fmtUSD(result.balanceDue > 0 ? result.balanceDue : result.refund)],
      ['Effective tax rate', 'Tax before credits ÷ taxable income', fmtPct(result.effectiveRate)],
      ['Marginal tax rate', 'Top applicable bracket', fmtPct(result.marginalRate)]
    ];
    var assumptions = [
      ['Tax year', yearMeta().year + ' — ' + yearMeta().basis],
      ['Filing status', FILING_STATUS_LABELS[inputs.profile.filingStatus] || inputs.profile.filingStatus],
      ['Standard deduction available', fmtUSD(Engine.paramsFor(projectYear()).standardDeduction[inputs.profile.filingStatus])],
      ['SALT cap before phase-down', fmtUSD(Engine.paramsFor(projectYear()).saltCap.base)],
      ['State modeling', 'None — federal only. State liability computed outside this tool.'],
      ['Carryforwards', 'Prior-year capital loss, passive loss and charitable carryovers not applied.'],
      ['Basis of figures', 'Client-supplied and practitioner-estimated amounts as of the report date.']
    ];
    var reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    function sectionHeading(text) {
      return h('h2', { class: 'border-b border-navy-950 pb-1 text-[12px] font-bold uppercase tracking-[0.1em] text-navy-950' }, text);
    }

    return h('div', { class: 'px-4 py-4' },
      h('div', { class: 'no-print mb-3 flex items-center justify-between' },
        h('p', { class: 'text-[12px] text-slate-500' }, 'Print-ready client deliverable — use your browser’s print dialog to produce a PDF.'),
        h('button', { type: 'button', class: 'btn-light', onclick: function () { window.print(); } }, 'Print / Save as PDF')),
      h('article', { class: 'print-root mx-auto max-w-[860px] border border-slate-300 bg-white px-10 py-8 shadow-sm print-compact' },
        h('header', { class: 'border-b-2 border-navy-950 pb-4' },
          h('div', { class: 'flex items-start justify-between gap-6' },
            h('div', {},
              h('p', { class: 'text-[10px] font-bold uppercase tracking-[0.18em] text-accent-600' }, 'Individual Income Tax Planning Projection'),
              h('h1', { class: 'mt-1 text-[26px] font-bold leading-tight tracking-tight text-navy-950' }, project.client || 'Unnamed Client'),
              h('p', { class: 'mt-0.5 text-[13px] text-slate-600' }, project.name + ' · Scenario: ' + scenario.name)),
            h('dl', { class: 'shrink-0 space-y-0.5 text-right text-[11.5px] text-slate-600' },
              [
                ['Tax year: ', String(project.taxYear), 'num'],
                ['Prepared by: ', project.preparedBy || '—'],
                ['Report date: ', reportDate],
                ['Filing status: ', FILING_STATUS_LABELS[inputs.profile.filingStatus] || inputs.profile.filingStatus]
              ].map(function (pair) {
                return h('div', {},
                  h('dt', { class: 'inline font-semibold text-slate-500' }, pair[0]),
                  h('dd', { class: 'inline' + (pair[2] ? ' ' + pair[2] : '') }, pair[1]));
              })))),
        h('section', { class: 'print-avoid-break mt-5 grid grid-cols-4 gap-px border border-slate-300 bg-slate-300' },
          [
            { label: 'Adjusted gross income', value: fmtUSD(result.agi) },
            { label: 'Taxable income', value: fmtUSD(result.taxableIncome) },
            { label: 'Total tax', value: fmtUSD(result.totalTax) },
            {
              label: result.balanceDue > 0 ? 'Balance due' : 'Refund',
              value: fmtUSD(result.balanceDue > 0 ? result.balanceDue : result.refund)
            }
          ].map(function (stat) {
            return h('div', { class: 'bg-white px-3 py-2.5' },
              h('div', { class: 'text-[9.5px] font-bold uppercase tracking-[0.09em] text-slate-500' }, stat.label),
              h('div', { class: 'num mt-1 text-[17px] font-bold leading-none text-navy-950' }, stat.value));
          })),
        h('section', { class: 'print-avoid-break mt-6' },
          sectionHeading('Summary of Projected Federal Tax'),
          h('table', { class: 'mt-2 w-full border-collapse text-[12.5px]' },
            h('tbody', {}, summaryRows.map(function (row) {
              var emphasized = row[0].indexOf('Total tax') === 0 || row[0].indexOf('Adjusted gross') === 0 ||
                row[0].indexOf('Taxable income') === 0 || row[0].indexOf('Projected') === 0;
              return h('tr', { class: 'border-b border-slate-200 ' + (emphasized ? 'bg-slate-50 font-semibold' : '') },
                h('td', { class: 'py-[4px] pr-2 text-slate-800' }, row[0]),
                h('td', { class: 'w-[210px] py-[4px] pr-2 text-[10.5px] text-slate-400' }, row[1]),
                h('td', { class: 'num w-[120px] py-[4px] text-navy-950' }, row[2]));
            })))),
        h('section', { class: 'print-avoid-break mt-6' },
          sectionHeading('Planning Strategy Impact'),
          h('table', { class: 'mt-2 w-full border-collapse text-[12.5px]' },
            h('thead', {},
              h('tr', { class: 'border-b border-slate-300 text-left text-[10px] uppercase tracking-wide text-slate-500' },
                h('th', { scope: 'col', class: 'py-1 font-semibold' }, 'Strategy'),
                h('th', { scope: 'col', class: 'py-1 font-semibold' }, 'Status'),
                h('th', { scope: 'col', class: 'py-1 text-right font-semibold' }, 'Amount modeled'))),
            h('tbody', {},
              inputs.planningStrategies.length === 0
                ? h('tr', {}, h('td', { colspan: '3', class: 'py-2 text-[12px] italic text-slate-500' }, 'No planning strategies modeled in this scenario.'))
                : inputs.planningStrategies.map(function (strategy) {
                  return h('tr', { class: 'border-b border-slate-200' },
                    h('td', { class: 'py-[4px] pr-2 text-slate-800' },
                      strategy.label,
                      strategy.note ? h('span', { class: 'block text-[10.5px] text-slate-500' }, strategy.note) : null),
                    h('td', { class: 'py-[4px] pr-2 text-[11.5px] text-slate-600' }, strategy.enabled ? 'Included' : 'Excluded'),
                    h('td', { class: 'num py-[4px] text-navy-950' }, fmtUSD(strategy.amount)));
                }),
              h('tr', { class: 'border-t-2 border-navy-950 bg-slate-50 font-semibold' },
                h('td', { class: 'py-[5px] pr-2 text-navy-950' }, 'Projected federal tax reduction from enabled strategies'),
                h('td', {}),
                h('td', { class: 'num py-[5px] ' + (strategySavings >= 0 ? 'text-emerald-700' : 'text-rose-700') }, fmtSigned(strategySavings))))),
          h('p', { class: 'mt-1.5 text-[10.5px] leading-snug text-slate-500' },
            'Computed by re-running the engine with every planning strategy disabled and comparing total tax. Contribution limits and phase-outs are applied in both runs.')),
        h('section', { class: 'print-break mt-6' },
          sectionHeading('Module Detail'),
          modules.map(function (mod) {
            return h('div', { class: 'print-avoid-break mt-3' },
              h('h3', { class: 'flex items-baseline justify-between border-b border-slate-300 pb-0.5 text-[12px] font-bold text-navy-900' },
                h('span', {}, mod.label),
                h('span', { class: 'num text-[12.5px]' }, fmtUSD(mod.total))),
              h('table', { class: 'w-full border-collapse text-[12px]' },
                h('tbody', {}, mod.lines.map(function (l) {
                  return h('tr', { class: 'border-b border-slate-100' },
                    h('td', { class: 'py-[3px] pr-2 text-slate-700' }, l.label),
                    h('td', { class: 'w-[200px] py-[3px] pr-2 text-[10px] text-slate-400' }, l.citation != null ? l.citation : ''),
                    h('td', { class: 'num w-[110px] py-[3px] text-slate-900' }, fmtUSD(l.amount)),
                    h('td', { class: 'w-[64px] py-[3px] text-right text-[9.5px] uppercase tracking-wide text-slate-400' }, l.status));
                }))));
          })),
        h('section', { class: 'print-avoid-break mt-6' },
          sectionHeading('Assumptions & Limitations'),
          h('dl', { class: 'mt-2 divide-y divide-slate-200' },
            assumptions.map(function (pair) {
              return h('div', { class: 'flex gap-4 py-[4px]' },
                h('dt', { class: 'w-[220px] shrink-0 text-[12px] font-semibold text-slate-700' }, pair[0]),
                h('dd', { class: 'text-[12px] text-slate-600' }, pair[1]));
            }))),
        h('section', { class: 'print-avoid-break mt-6' },
          sectionHeading('Authority for ' + yearMeta().year + ' Parameters'),
          h('ul', { class: 'mt-2 grid grid-cols-2 gap-x-6' },
            Object.entries(Engine.PARAM_AUTHORITIES).map(function (entry) {
              return h('li', { class: 'break-inside-avoid border-b border-slate-100 py-[3px]' },
                h('span', { class: 'block text-[11.5px] font-medium text-slate-700' }, entry[0]),
                h('span', { class: 'block font-mono text-[9.5px] leading-snug text-slate-500' }, entry[1]));
            }))),
        h('footer', { class: 'print-avoid-break mt-6 border-t-2 border-navy-950 pt-3' },
          h('p', { class: 'text-[10.5px] leading-relaxed text-slate-600' },
            h('strong', { class: 'text-navy-950' }, 'Disclaimer.'),
            ' This document is a planning estimate prepared for discussion purposes only. It is not a filed tax return, is not a substitute for a completed Form 1040, and does not constitute tax, legal, or investment advice. Figures are based on information supplied by the client and on the practitioner’s assumptions as of ' + reportDate + ', and on tax-year ' + yearMeta().year + ' parameters (' + yearMeta().provenance + ') that remain subject to further IRS guidance. Items marked ',
            h('em', {}, 'estimated'),
            ' use simplified methodology; state and local taxes, foreign reporting, trusts, and prior-year carryforwards are not modeled. Actual results will differ.'))));
  }

  /* ---- coverage tab -------------------------------------------------------- */
  var COVERAGE_META = {
    implemented: {
      label: 'Implemented', chip: 'border-emerald-300 bg-emerald-50 text-emerald-800',
      blurb: 'Computed end-to-end from entered inputs against the ' + yearMeta().label + ' parameters.'
    },
    partial: {
      label: 'Partial', chip: 'border-sky-300 bg-sky-50 text-sky-800',
      blurb: 'Core mechanics present; edge cases and elections are not modeled.'
    },
    estimated: {
      label: 'Estimated', chip: 'border-amber-300 bg-amber-50 text-amber-800',
      blurb: 'Simplified approximation — verify before relying on the figure.'
    },
    'not-supported': {
      label: 'Not supported', chip: 'border-rose-300 bg-rose-50 text-rose-800',
      blurb: 'Out of scope for this release. Handle outside the planner.'
    }
  };
  var COVERAGE_LEVELS = ['implemented', 'partial', 'estimated', 'not-supported'];
  var ROADMAP = [
    {
      title: 'State income tax',
      detail: 'No state modeling of any kind. SALT is captured only as a federal itemized deduction input; the state liability itself must be computed separately.'
    },
    {
      title: 'AMT refinement',
      detail: 'AMT is an estimate: AMTI is built from a limited set of preference items (SALT add-back, private-activity interest is not modeled) and ISO exercises, depletion, and AMT NOLs are ignored.'
    },
    {
      title: 'Foreign reporting',
      detail: 'Forms 1116 (foreign tax credit), 2555 (foreign earned income exclusion), 8621 (PFIC), 8938 and FBAR are not implemented.'
    },
    {
      title: 'Trusts, estates and gifts',
      detail: 'Form 1041 flows, grantor-trust attribution, and Form 709 gift planning are out of scope. K-1 amounts must be entered manually as other income.'
    },
    {
      title: 'Prior-year carryforwards',
      detail: 'Capital loss carryforwards, suspended passive losses from prior years, charitable carryovers, NOLs and §199A loss carryforwards are not carried in automatically.'
    },
    {
      title: 'Credits beyond CTC / ODC',
      detail: 'Education credits, energy credits, adoption, elderly/disabled, and the premium tax credit reconciliation are not calculated.'
    }
  ];

  function renderCoverage() {
    var byLevel = new Map();
    for (var level of COVERAGE_LEVELS) byLevel.set(level, []);
    for (var item of Engine.COVERAGE) {
      var bucket = byLevel.get(item.level);
      if (bucket) bucket.push(item);
    }
    return h('div', {},
      h('div', { class: 'px-4 pt-4' },
        h('div', { class: 'max-w-[360px]' }, lineStatusPanel(state.result, null))),
      h('div', { class: 'space-y-4 px-4 py-4' },
        h('section', { class: 'panel' },
          h('div', { class: 'panel-header' },
            h('span', {}, 'Calculation Coverage Matrix'),
            h('span', { class: 'font-normal normal-case tracking-normal text-slate-500' },
              Engine.COVERAGE.length + ' tracked items · tax year ' + yearMeta().label)),
          h('div', { class: 'grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-2 xl:grid-cols-4' },
            COVERAGE_LEVELS.map(function (level) {
              var meta = COVERAGE_META[level];
              var items = byLevel.get(level) || [];
              return h('div', { class: 'flex flex-col bg-white' },
                h('div', { class: 'flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2' },
                  h('span', { class: 'inline-flex h-[17px] items-center rounded-[2px] border px-1.5 text-[10px] font-bold uppercase tracking-wide ' + meta.chip }, meta.label),
                  h('span', { class: 'num text-[13px] font-bold text-navy-900' }, String(items.length))),
                h('p', { class: 'border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] leading-snug text-slate-500' }, meta.blurb),
                h('ul', { class: 'divide-y divide-slate-100' },
                  items.length === 0
                    ? h('li', { class: 'px-3 py-2 text-[11.5px] italic text-slate-400' }, 'None.')
                    : items.map(function (item) {
                      return h('li', { class: 'px-3 py-1.5' },
                        h('div', { class: 'flex items-baseline justify-between gap-2' },
                          h('span', { class: 'text-[12.5px] font-medium text-slate-800' }, item.label),
                          h('span', { class: 'shrink-0 font-mono text-[10px] text-slate-400' }, item.formLine)),
                        item.note ? h('p', { class: 'mt-0.5 text-[11px] leading-snug text-slate-500' }, item.note) : null);
                    })));
            }))),
        h('section', { class: 'panel' },
          h('div', { class: 'panel-header' }, h('span', {}, 'Coming Later — Explicitly Out of Scope Today')),
          h('ul', { class: 'divide-y divide-slate-200' },
            ROADMAP.map(function (item) {
              return h('li', { class: 'flex gap-4 px-3 py-2.5' },
                h('span', { class: 'mt-[3px] inline-flex h-[16px] shrink-0 items-center rounded-[2px] border border-slate-300 bg-slate-100 px-1.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-600' }, 'Roadmap'),
                h('div', { class: 'min-w-0' },
                  h('h3', { class: 'text-[13px] font-semibold text-navy-900' }, item.title),
                  h('p', { class: 'mt-0.5 text-[12px] leading-relaxed text-slate-600' }, item.detail)));
            })),
          h('p', { class: 'border-t border-slate-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-900' },
            'This planner produces planning estimates for the tax year selected in the header. It does not prepare, validate, or file a return, and it is not a substitute for professional judgement on any item marked estimated or not supported.'))));
  }

  /* ---- scenarios tab -------------------------------------------------------- */
  /* ---- scenarios tab: the comparison matrix ---------------------------------
     The Scenarios tab IS the planner's comparison surface, and its shape is
     deliberate: ROWS are Form 1040 / schedule / planning line items in return
     sequence, COLUMNS are the baseline and each scenario. It is a working
     table, not a set of summary cards and not a difference report — a
     preparer reads down a column the way they read a return, and across a row
     to see what a change did.

     Every scenario is computed from its OWN inputs. Editing a cell in one
     column rewrites that scenario alone; the others are untouched and are
     recomputed from what they already held, so nothing leaks sideways.
     -------------------------------------------------------------------- */

  /* Editable-cell accessors. Each knows how to read an aggregate out of a
     scenario's inputs and how to write one back.

     Where a line is backed by several records — three W-2s, four rentals —
     the matrix will NOT invent a way to spread one number across them. It
     shows the total, marks the cell as belonging to the drawer, and sends the
     preparer to the per-record editor that can do it properly. */

  function recordsOfKind(list, kind) {
    return (list || []).filter(function (r) { return kind == null || r.kind === kind; });
  }

  /* An aggregate over records in one collection, optionally of one kind. */
  function aggAccessor(collection, field, opts) {
    opts = opts || {};
    return {
      read: function (inputs) {
        return recordsOfKind(inputs[collection], opts.kind)
          .reduce(function (a, r) { return a + (Number(r[field]) || 0); }, 0);
      },
      /* Editable only while a single record backs the line — or none, in
         which case the first edit creates one. */
      editable: function (inputs) {
        return recordsOfKind(inputs[collection], opts.kind).length <= 1;
      },
      write: function (inputs, value) {
        if (!Array.isArray(inputs[collection])) inputs[collection] = [];
        var matching = recordsOfKind(inputs[collection], opts.kind);
        if (matching.length > 1) return null;
        if (matching.length === 0) {
          if (value === 0) return inputs;
          var made = opts.make(value);
          made.id = 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
          inputs[collection].push(made);
          return inputs;
        }
        matching[0][field] = value;
        return inputs;
      }
    };
  }

  /* A plain scalar on an inputs sub-object. */
  function scalarAccessor(group, field) {
    return {
      read: function (inputs) { return Number((inputs[group] || {})[field]) || 0; },
      editable: function () { return true; },
      write: function (inputs, value) {
        if (!inputs[group]) inputs[group] = {};
        inputs[group][field] = value;
        return inputs;
      }
    };
  }

  /* The four estimated-tax instalments, edited as one annual total. Split
     evenly only when the existing instalments are already even, so a
     deliberately uneven schedule is never quietly flattened. */
  var estimatedAccessor = {
    read: function (inputs) {
      return ((inputs.payments || {}).estimatedPayments || [])
        .reduce(function (a, v) { return a + (Number(v) || 0); }, 0);
    },
    editable: function (inputs) {
      var q = ((inputs.payments || {}).estimatedPayments || [0, 0, 0, 0]);
      return q.every(function (v) { return v === q[0]; });
    },
    write: function (inputs, value) {
      if (!inputs.payments) inputs.payments = {};
      var each = Math.round(value / 4 * 100) / 100;
      inputs.payments.estimatedPayments = [each, each, each, round2ish(value - each * 3)];
      return inputs;
    }
  };

  function round2ish(v) { return Math.round(v * 100) / 100; }

  function w2(value) {
    return { employer: 'Wages', wages: value, federalWithholding: 0, socialSecurityWages: value,
      medicareWages: value, socialSecurityWithheld: 0, medicareWithheld: 0, retirementDeferral: 0, hsa: 0 };
  }
  function intDiv(kind) {
    return function (value) { return { payer: '', kind: kind, amount: value, federalWithholding: 0 }; };
  }
  function otherInc(kind) {
    return function (value) { return { description: '', kind: kind, amount: value }; };
  }
  function biz(value) {
    return { name: 'Business', grossReceipts: value, expenses: 0, isSSTB: false,
      w2Wages: 0, unadjustedBasis: 0, materialParticipation: true };
  }
  function rental(value) {
    return { property: 'Rental', rents: value, expenses: 0, depreciation: 0,
      activelyParticipates: true, isQualifiedTradeOrBusiness: true };
  }
  function gain(field) {
    return function (value) {
      var r = { description: 'Capital gains', shortTermGain: 0, longTermGain: 0,
        section1250Gain: 0, collectiblesGain: 0 };
      r[field] = value;
      return r;
    };
  }

  function fromLine(moduleKey, lineKey) {
    return function (result) {
      var mod = result.modules[moduleKey];
      if (!mod) return 0;
      var l = mod.lines.find(function (x) { return x.key === lineKey; });
      return l ? l.amount : 0;
    };
  }

  /* The row skeleton, in Form 1040 order. Groups are the drill-downs; the
     spine rows between them are the return's own subtotals and are always
     visible, because collapsing a group must never hide AGI or total tax. */
  var MATRIX_GROUPS = [
    {
      id: 'income', title: 'Income', formRef: 'Form 1040, lines 1–8', drawer: 'wages',
      rows: [
        { key: 'w2wages', label: 'W-2 wages', ref: '1040 line 1a', edit: aggAccessor('wages', 'wages', { make: w2 }), drawer: 'wages' },
        { key: 'w2deferral', label: 'Elective deferrals (401(k)/403(b))', ref: 'IRC §402(g)', edit: aggAccessor('wages', 'retirementDeferral', { make: w2 }), drawer: 'wages' },
        { key: 'w2hsa', label: 'Employer/cafeteria HSA', ref: 'IRC §106(d)', edit: aggAccessor('wages', 'hsa', { make: w2 }), drawer: 'wages' }
      ]
    },
    {
      id: 'scheduleb', title: 'Schedule B — Investment Income', formRef: 'Form 1040, lines 2–3', drawer: 'interestdividends',
      rows: [
        { key: 'interest', label: 'Taxable interest', ref: '1040 line 2b', edit: aggAccessor('interestDividends', 'amount', { kind: 'interest', make: intDiv('interest') }), drawer: 'interestdividends' },
        { key: 'taxexempt', label: 'Tax-exempt interest', ref: '1040 line 2a · IRC §103', edit: aggAccessor('interestDividends', 'amount', { kind: 'taxExemptInterest', make: intDiv('taxExemptInterest') }), drawer: 'interestdividends' },
        { key: 'orddiv', label: 'Ordinary dividends', ref: '1040 line 3b', edit: aggAccessor('interestDividends', 'amount', { kind: 'ordinaryDividend', make: intDiv('ordinaryDividend') }), drawer: 'interestdividends' },
        { key: 'qualdiv', label: 'Qualified dividends', ref: '1040 line 3a · IRC §1(h)(11)', edit: aggAccessor('interestDividends', 'amount', { kind: 'qualifiedDividend', make: intDiv('qualifiedDividend') }), drawer: 'interestdividends' }
      ]
    },
    {
      id: 'schedulec', title: 'Schedule C — Business Income', formRef: 'Form 1040, line 3 (Sch. 1)', drawer: 'schedulec',
      rows: [
        { key: 'cgross', label: 'Gross receipts', ref: 'Schedule C line 1', edit: aggAccessor('businesses', 'grossReceipts', { make: biz }), drawer: 'schedulec' },
        { key: 'cexp', label: 'Total expenses', ref: 'Schedule C line 28', edit: aggAccessor('businesses', 'expenses', { make: biz }), drawer: 'schedulec' },
        { key: 'cw2', label: 'W-2 wages paid (§199A limit)', ref: 'IRC §199A(b)(2)(B)', edit: aggAccessor('businesses', 'w2Wages', { make: biz }), drawer: 'schedulec' },
        { key: 'cubia', label: 'Unadjusted basis of property (UBIA)', ref: 'IRC §199A(b)(6)', edit: aggAccessor('businesses', 'unadjustedBasis', { make: biz }), drawer: 'schedulec' },
        { key: 'cnet', label: 'Net profit or (loss)', ref: 'Schedule C line 31', value: fromLine('businessIncome', 'business.netProfit'), subtotal: true }
      ]
    },
    {
      id: 'scheduled', title: 'Schedule D — Capital Gains & Losses', formRef: 'Form 1040, line 7', drawer: 'capitalgains',
      rows: [
        { key: 'stcg', label: 'Net short-term gain/(loss)', ref: 'Schedule D Part I', edit: aggAccessor('capitalGains', 'shortTermGain', { make: gain('shortTermGain') }), drawer: 'capitalgains' },
        { key: 'ltcg', label: 'Net long-term gain/(loss)', ref: 'Schedule D Part II', edit: aggAccessor('capitalGains', 'longTermGain', { make: gain('longTermGain') }), drawer: 'capitalgains' },
        { key: 'unrecap', label: 'Unrecaptured §1250 gain (25%)', ref: 'IRC §1(h)(1)(D)', edit: aggAccessor('capitalGains', 'section1250Gain', { make: gain('section1250Gain') }), drawer: 'capitalgains' },
        { key: 'collectibles', label: 'Collectibles gain (28%)', ref: 'IRC §1(h)(4)', edit: aggAccessor('capitalGains', 'collectiblesGain', { make: gain('collectiblesGain') }), drawer: 'capitalgains' }
      ]
    },
    {
      id: 'schedulee', title: 'Schedule E — Rentals & K-1', formRef: 'Form 1040, line 5 (Sch. 1)', drawer: 'schedulee',
      rows: [
        { key: 'rents', label: 'Rents received', ref: 'Schedule E line 3', edit: aggAccessor('rentals', 'rents', { make: rental }), drawer: 'schedulee' },
        { key: 'rexp', label: 'Rental operating expenses', ref: 'Schedule E lines 5–19', edit: aggAccessor('rentals', 'expenses', { make: rental }), drawer: 'schedulee' },
        { key: 'rdep', label: 'Depreciation', ref: 'Schedule E line 18 · IRC §168', edit: aggAccessor('rentals', 'depreciation', { make: rental }), drawer: 'schedulee' },
        { key: 'rallow', label: 'Net rental income allowed this year', ref: 'IRC §469', value: fromLine('rentalIncome', 'rental.netAllowed'), subtotal: true },
        { key: 'rsusp', label: 'Suspended passive losses carried forward', ref: 'IRC §469(b)', value: fromLine('rentalIncome', 'rental.suspendedLosses') },
        { key: 'k1', label: 'K-1 ordinary business income', ref: 'IRC §702 · Schedule E Part II', edit: aggAccessor('otherIncome', 'amount', { kind: 'k1Ordinary', make: otherInc('k1Ordinary') }), drawer: 'otherincome' }
      ]
    },
    {
      id: 'otherincome', title: 'Other Income', formRef: 'Schedule 1, Part I', drawer: 'otherincome',
      rows: [
        { key: 'retirement', label: 'Taxable retirement / pension distributions', ref: 'IRC §72', edit: aggAccessor('otherIncome', 'amount', { kind: 'retirement', make: otherInc('retirement') }), drawer: 'otherincome' },
        { key: 'ssgross', label: 'Gross Social Security benefits', ref: 'IRC §86', edit: aggAccessor('otherIncome', 'amount', { kind: 'socialSecurity', make: otherInc('socialSecurity') }), drawer: 'otherincome' },
        { key: 'sstax', label: 'Taxable Social Security benefits', ref: 'IRC §86(a)', value: fromLine('otherIncome', 'otherIncome.socialSecurityTaxable') },
        { key: 'unemp', label: 'Unemployment compensation', ref: 'IRC §85', edit: aggAccessor('otherIncome', 'amount', { kind: 'unemployment', make: otherInc('unemployment') }), drawer: 'otherincome' },
        { key: 'othinc', label: 'Other income', ref: 'Schedule 1 line 8z', edit: aggAccessor('otherIncome', 'amount', { kind: 'other', make: otherInc('other') }), drawer: 'otherincome' }
      ]
    },
    {
      id: 'adjustments', title: 'Adjustments to Income', formRef: 'Schedule 1, Part II', drawer: 'planning',
      rows: [
        { key: 'setaxded', label: 'Deductible half of self-employment tax', ref: 'IRC §164(f)', value: fromLine('planningDeductions', 'planning.seTaxDeduction') }
      ]
    },
    {
      id: 'retirement', title: 'Retirement & HSA', formRef: 'Schedule 1, Part II', drawer: 'planning',
      rows: [
        { key: 'tira', label: 'Traditional IRA deduction', ref: 'IRC §219', value: fromLine('planningDeductions', 'planning.traditionalIra'), drawer: 'planning' },
        { key: 'sep', label: 'SEP-IRA contribution', ref: 'IRC §408(k)', value: fromLine('planningDeductions', 'planning.sepIra'), drawer: 'planning' },
        { key: 'solo', label: 'Solo 401(k) contribution', ref: 'IRC §401(a); §415(c)', value: fromLine('planningDeductions', 'planning.solo401k'), drawer: 'planning' },
        { key: 'hsa', label: 'HSA contribution', ref: 'IRC §223', value: fromLine('planningDeductions', 'planning.hsa'), drawer: 'planning' }
      ]
    },
    {
      id: 'itemized', title: 'Itemized Deductions', formRef: 'Schedule A', drawer: 'itemized',
      rows: [
        { key: 'medical', label: 'Medical & dental expenses', ref: 'Schedule A line 1 · IRC §213', edit: scalarAccessor('itemizedDeductions', 'medical'), drawer: 'itemized' },
        { key: 'salt-income', label: 'State & local income tax', ref: 'Schedule A line 5a', edit: scalarAccessor('itemizedDeductions', 'stateLocalIncomeTax'), drawer: 'itemized' },
        { key: 'salt-re', label: 'Real estate tax', ref: 'Schedule A line 5b', edit: scalarAccessor('itemizedDeductions', 'realEstateTax'), drawer: 'itemized' },
        { key: 'salt-pp', label: 'Personal property tax', ref: 'Schedule A line 5c', edit: scalarAccessor('itemizedDeductions', 'personalPropertyTax'), drawer: 'itemized' },
        { key: 'saltallowed', label: 'SALT allowed after cap', ref: 'IRC §164(b)(6) · OBBBA §70120', value: fromLine('deductions', 'deductions.salt') },
        { key: 'mortgage', label: 'Home mortgage interest', ref: 'Schedule A line 8 · IRC §163(h)', edit: scalarAccessor('itemizedDeductions', 'mortgageInterest'), drawer: 'itemized' },
        { key: 'investint', label: 'Investment interest expense', ref: 'Schedule A line 9 · IRC §163(d)', edit: scalarAccessor('itemizedDeductions', 'investmentInterest'), drawer: 'itemized' },
        { key: 'charcash', label: 'Charitable — cash', ref: 'Schedule A line 11 · IRC §170', edit: scalarAccessor('itemizedDeductions', 'charitableCash'), drawer: 'itemized' },
        { key: 'charnoncash', label: 'Charitable — non-cash', ref: 'Schedule A line 12', edit: scalarAccessor('itemizedDeductions', 'charitableNonCash'), drawer: 'itemized' },
        { key: 'charallowed', label: 'Charitable allowed after floor & ceiling', ref: 'IRC §170(b)', value: fromLine('deductions', 'deductions.charitable') },
        { key: 'othitem', label: 'Other itemized deductions', ref: 'Schedule A line 16', edit: scalarAccessor('itemizedDeductions', 'other'), drawer: 'itemized' },
        { key: 'haircut', label: 'Itemized deduction haircut', ref: 'IRC §68 as amended (2/37)', value: fromLine('deductions', 'deductions.itemizedHaircut') },
        { key: 'itemtotal', label: 'Total itemized deductions', ref: 'Schedule A line 17', value: fromLine('deductions', 'deductions.itemizedTotal'), subtotal: true },
        { key: 'stdtotal', label: 'Standard deduction available', ref: 'IRC §63(c)', value: fromLine('deductions', 'deductions.standardTotal') }
      ]
    },
    {
      id: 'qbi', title: 'Qualified Business Income (§199A)', formRef: 'Form 1040, line 13 · Form 8995-A',
      rows: [
        { key: 'qbitotal', label: 'Total qualified business income', ref: 'IRC §199A(c)', value: fromLine('qbi', 'qbi.totalQbi') },
        { key: 'qbitent', label: 'Tentative deduction after component limits', ref: 'IRC §199A(b)(2)', value: fromLine('qbi', 'qbi.tentativeDeduction') },
        { key: 'qbilimit', label: 'Overall limit: 20% of (taxable income − net capital gain)', ref: 'IRC §199A(a)', value: fromLine('qbi', 'qbi.overallLimit') }
      ]
    },
    {
      id: 'othertaxes', title: 'Other Taxes', formRef: 'Schedule 2',
      rows: [
        { key: 'amti', label: 'Alternative minimum taxable income', ref: 'Form 6251 · IRC §55(b)(2)', value: fromLine('additionalTaxes', 'additionaltaxes.amti') },
        { key: 'amtex', label: 'AMT exemption after phase-out', ref: 'IRC §55(d)', value: fromLine('additionalTaxes', 'additionaltaxes.amtExemption') },
        { key: 'tmt', label: 'Tentative minimum tax', ref: 'IRC §55(b)(1)', value: fromLine('additionalTaxes', 'additionaltaxes.tentativeMinimumTax') },
        { key: 'senet', label: 'Net earnings from self-employment', ref: 'Schedule SE · IRC §1402(a)', value: fromLine('selfEmploymentTax', 'se.netEarnings') }
      ]
    },
    {
      id: 'credits', title: 'Credits', formRef: 'Form 1040, lines 19–20 · Schedule 3',
      rows: [
        { key: 'ctc', label: 'Child tax credit / credit for other dependents', ref: 'IRC §24', value: fromLine('payments', 'payments.childTaxCredit') },
        { key: 'refcred', label: 'Other refundable credits', ref: 'Schedule 3, Part II', edit: scalarAccessor('payments', 'refundableCredits'), drawer: 'payments' }
      ]
    },
    {
      id: 'payments', title: 'Payments & Estimated Tax', formRef: 'Form 1040, lines 25–33', drawer: 'payments',
      rows: [
        { key: 'withheld', label: 'Federal income tax withheld', ref: '1040 line 25', value: fromLine('payments', 'payments.withholding') },
        { key: 'estpay', label: 'Estimated tax payments (annual)', ref: '1040 line 26 · IRC §6654', edit: estimatedAccessor, drawer: 'payments' },
        { key: 'pyover', label: 'Prior-year overpayment applied', ref: 'IRC §6402(b)', edit: scalarAccessor('payments', 'priorYearOverpayment'), drawer: 'payments' },
        { key: 'ext', label: 'Extension payment', ref: 'Form 4868', edit: scalarAccessor('payments', 'extensionPayment'), drawer: 'payments' },
        { key: 'harbor', label: 'Safe-harbor requirement', ref: 'IRC §6654(d)', value: function (r) { return r.safeHarborRequired; } },
        { key: 'under', label: 'Projected underpayment vs. safe harbor', ref: 'Form 2210', value: function (r) { return r.underpayment; } }
      ]
    }
  ];

  /* The return's own subtotals. Always visible, never inside a collapsible
     group — a collapsed Income section must not be able to hide AGI. Each
     carries the position in the return it belongs after. */
  var MATRIX_SPINE = [
    { after: 'otherincome', key: 'totalIncome', label: 'Total income', ref: '1040 line 9', value: function (r) { return r.totalIncome; } },
    { after: 'adjustments', key: 'adjustments', label: 'Total adjustments to income', ref: '1040 line 10', value: function (r) { return r.adjustments; } },
    { after: 'retirement', key: 'agi', label: 'Adjusted gross income', ref: '1040 line 11', value: function (r) { return r.agi; }, major: true },
    { after: 'itemized', key: 'deductionUsed', label: 'Deduction taken', ref: '1040 line 12', value: function (r) { return r.deductionUsed; }, note: function (r) { return r.deductionType; } },
    { after: 'qbi', key: 'qbiDeduction', label: 'QBI deduction', ref: '1040 line 13', value: function (r) { return r.qbiDeduction; } },
    { after: 'qbi', key: 'taxableIncome', label: 'Taxable income', ref: '1040 line 15', value: function (r) { return r.taxableIncome; }, major: true },
    { after: 'qbi', key: 'ordinaryTax', label: 'Tax on ordinary income', ref: 'IRC §1(j)', value: function (r) { return r.ordinaryTax; } },
    { after: 'qbi', key: 'capitalGainsTax', label: 'Tax on qualified dividends & net LTCG', ref: 'IRC §1(h)', value: function (r) { return r.capitalGainsTax; } },
    { after: 'othertaxes', key: 'amt', label: 'Alternative minimum tax', ref: 'Form 6251', value: function (r) { return r.amt; } },
    { after: 'othertaxes', key: 'seTax', label: 'Self-employment tax', ref: 'Schedule SE', value: function (r) { return r.seTax; } },
    { after: 'othertaxes', key: 'niit', label: 'Net investment income tax (3.8%)', ref: 'Form 8960 · IRC §1411', value: function (r) { return r.niit; } },
    { after: 'othertaxes', key: 'additionalMedicare', label: 'Additional Medicare tax (0.9%)', ref: 'Form 8959 · IRC §3101(b)(2)', value: function (r) { return r.additionalMedicare; } },
    { after: 'credits', key: 'totalTax', label: 'Total tax', ref: '1040 line 24', value: function (r) { return r.totalTax; }, major: true },
    { after: 'payments', key: 'totalPayments', label: 'Total payments & refundable credits', ref: '1040 line 33', value: function (r) { return r.totalPayments; } },
    { after: 'payments', key: 'balance', label: 'Balance due / (refund)', ref: '1040 lines 34–37', value: function (r) { return r.balanceDue > 0 ? r.balanceDue : -r.refund; } },
    { after: 'payments', key: 'effectiveRate', label: 'Effective rate', ref: 'Tax before credits ÷ taxable income', value: function (r) { return r.effectiveRate; }, percent: true },
    { after: 'payments', key: 'marginalRate', label: 'Marginal rate', ref: 'Rate on the next dollar of ordinary income', value: function (r) { return r.marginalRate; }, percent: true }
  ];

  /* Which groups are open. Held in `ui`, so it survives every re-render for
     as long as the tab is being worked in — a recalculation must not throw
     the preparer back to the top of a collapsed table. */
  function groupOpen(id) {
    return ui.matrixOpen[id] !== false;
  }
  function toggleGroup(id) {
    ui.matrixOpen[id] = !groupOpen(id);
    render();
  }
  /* The two global controls. They drive EVERY group, not the visible ones. */
  function setAllGroups(open) {
    for (var g of MATRIX_GROUPS) ui.matrixOpen[g.id] = open;
    render();
  }
  function openGroupCount() {
    return MATRIX_GROUPS.filter(function (g) { return groupOpen(g.id); }).length;
  }

  var MATRIX_COL_W = 186;

  /* One scenario column's computed projection, plus the inputs behind it. */
  function matrixColumns() {
    var project = state.project;
    var baseline = baselineScenario();
    return project.scenarios.map(function (scenario, index) {
      return {
        scenario: scenario,
        index: index,
        isBaseline: baseline && scenario.id === baseline.id,
        isActive: scenario.id === project.activeScenarioId,
        inputs: scenario.inputs,
        result: computeInputs(scenario.inputs)
      };
    });
  }

  /* Savings or cost against the baseline.

     Presented as a direction and a magnitude, never as a verdict. The lowest
     total tax is not marked "best" and gets no winner styling: a scenario's
     tax cost is one input to a decision, and risk, feasibility, substantiation
     and the client's own preferences are others this table knows nothing
     about. Naming a winner here would be the table overstepping. */
  function deltaCell(delta, isBaseline) {
    if (isBaseline) {
      return h('span', {
        class: 'text-[11px] text-slate-400',
        title: 'Every other column is measured against this one.'
      }, 'the baseline');
    }
    if (Math.abs(delta) < 0.005) {
      return h('span', {
        class: 'text-[11px] text-slate-400',
        title: 'This scenario produces the same total tax as the baseline.'
      }, 'no change vs. base');
    }
    var lower = delta < 0;
    return h('span', {
      class: 'inline-flex items-baseline gap-1 text-[11.5px] font-semibold text-slate-200',
      title: lower
        ? 'Total tax is ' + fmtUSD(Math.abs(delta)) + ' lower than the baseline scenario.'
        : 'Total tax is ' + fmtUSD(delta) + ' higher than the baseline scenario.'
    },
      h('span', { class: 'num' }, (lower ? '−' : '+') + fmtUSD(Math.abs(delta)).replace(/^\$/, '$')),
      h('span', { class: 'text-[10px] font-normal uppercase tracking-wide text-slate-400' },
        lower ? 'lower tax' : 'higher tax'));
  }

  function scenarioHeaderCell(col, baselineResult, count) {
    var scenario = col.scenario;
    var delta = col.result.totalTax - baselineResult.totalTax;
    return h('th', {
      scope: 'col',
      class: 'matrix-col-head sticky top-0 z-20 border-l border-navy-800 bg-navy-900 px-2 py-2 text-left align-top' +
        (col.isBaseline ? ' matrix-baseline-col' : ''),
      style: { width: MATRIX_COL_W + 'px', minWidth: MATRIX_COL_W + 'px' }
    },
      h('div', { class: 'flex items-center gap-1' },
        h('input', {
          type: 'text', value: scenario.name,
          'aria-label': 'Name of scenario ' + scenario.name,
          class: 'min-w-0 flex-1 rounded-[3px] border border-transparent bg-transparent px-1 py-[2px] text-[12.5px] font-semibold text-white hover:border-navy-700 focus:border-accent-500 focus:bg-navy-950 focus:outline-none',
          onchange: function (e) { renameScenario(scenario.id, e.target.value.trim() || scenario.name); },
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }
        }),
        col.isBaseline
          ? h('span', {
            class: 'shrink-0 rounded-[2px] border border-slate-400 bg-slate-200 px-1 text-[9px] font-bold uppercase tracking-wide text-navy-950',
            title: 'Every other column is measured against this one. Baseline is declared, not computed — it does not move to whichever scenario has the lowest tax.'
          }, 'Base')
          : h('button', {
            type: 'button', class: 'shrink-0 rounded-[2px] border border-navy-700 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400 hover:border-accent-500 hover:text-accent-400',
            title: 'Measure every other column against this scenario instead',
            onclick: function () { setBaselineScenario(scenario.id); }
          }, 'Set base')),
      h('div', { class: 'matrix-col-total mt-1 num text-[15px] font-bold leading-none text-white', title: 'Total tax (Form 1040 line 24)' },
        fmtUSD(col.result.totalTax)),
      h('div', { class: 'mt-[3px] h-[16px]' }, deltaCell(delta, col.isBaseline)),
      h('div', { class: 'mt-1 flex items-center gap-[3px]' },
        h('button', {
          type: 'button', class: matrixIconBtn, title: 'Move this column left',
          disabled: col.index === 0, onclick: function () { moveScenario(scenario.id, -1); }
        }, '←'),
        h('button', {
          type: 'button', class: matrixIconBtn, title: 'Move this column right',
          disabled: col.index === count - 1, onclick: function () { moveScenario(scenario.id, 1); }
        }, '→'),
        h('button', {
          type: 'button', class: matrixIconBtn, title: 'Duplicate this scenario into a new column',
          onclick: function () { duplicateScenarioById(scenario.id); }
        }, 'Copy'),
        h('button', {
          type: 'button', class: matrixIconBtn + ' hover:border-rose-500 hover:text-rose-300',
          title: count <= 1 ? 'A project keeps at least one scenario' : 'Delete this scenario',
          disabled: count <= 1,
          onclick: function () { deleteScenario(scenario.id); }
        }, 'Del'),
        h('button', {
          type: 'button',
          class: matrixIconBtn + (col.isActive ? ' border-accent-500 text-accent-300' : ''),
          title: 'Open this scenario in the Planner tab and its editors',
          'aria-pressed': col.isActive ? 'true' : 'false',
          onclick: function () { setActiveScenario(scenario.id); }
        }, 'Open')));
  }

  var matrixIconBtn = 'h-[18px] rounded-[2px] border border-navy-700 px-1 text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 transition hover:border-accent-500 hover:text-accent-300 disabled:cursor-not-allowed disabled:opacity-35';

  /* A cell a preparer can type into. Inputs and calculated figures are
     deliberately not interchangeable on screen: an input is a field, on white,
     with a border; a calculated figure sits on a tint and cannot be focused.
     An input that differs from the baseline's carries a left rule, so what
     was actually changed in a scenario is visible without reading across. */
  function matrixInputCell(row, col, baselineCol) {
    var value = row.edit.read(col.inputs);
    var editable = row.edit.editable(col.inputs);
    var baseValue = baselineCol ? row.edit.read(baselineCol.inputs) : value;
    var changed = !col.isBaseline && Math.abs(value - baseValue) >= 0.005;
    if (!editable) {
      /* Several records back this line. The matrix will not guess how to
         split one figure across them — the drawer edits them properly. */
      return h('td', {
        class: 'border-l border-slate-200 bg-white px-1 py-[3px] text-right' + (changed ? ' matrix-changed' : '')
      },
        h('button', {
          type: 'button',
          class: 'num w-full rounded-[3px] border border-dashed border-slate-300 px-1.5 py-[2px] text-right text-[12.5px] text-slate-700 hover:border-accent-500 hover:text-accent-600',
          title: 'Several records make up this line. Open the detail editor to change them.',
          onclick: function () { setActiveScenario(col.scenario.id); if (row.drawer) setDrawer(row.drawer); }
        }, fmtUSD(value)));
    }
    return h('td', {
      class: 'border-l border-slate-200 bg-white px-1 py-[3px]' + (changed ? ' matrix-changed' : '')
    },
      h('input', {
        type: 'text', inputmode: 'decimal',
        'aria-label': row.label + ' for ' + col.scenario.name,
        title: changed ? 'Differs from the baseline (' + fmtUSD(baseValue) + ')' : row.label,
        class: 'num h-[22px] w-full rounded-[3px] border border-slate-300 bg-white px-1.5 text-right text-[12.5px] text-navy-900 outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/40',
        value: value === 0 ? '' : fmtUSD(value),
        placeholder: '0',
        onfocus: function (e) { e.currentTarget.select(); },
        onchange: function (e) {
          var next = parseAmount(e.target.value);
          if (Math.abs(next - value) < 0.005) { e.target.value = value === 0 ? '' : fmtUSD(value); return; }
          updateScenarioInputs(col.scenario.id, function (inputs) { return row.edit.write(inputs, next); });
        },
        onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }
      }));
  }

  function matrixValueCell(row, col, baselineCol, opts) {
    opts = opts || {};
    var value = row.value(col.result);
    var baseValue = baselineCol ? row.value(baselineCol.result) : value;
    var moved = !col.isBaseline && Math.abs(value - baseValue) >= 0.005;
    var text = row.percent ? fmtPct(value) : fmtUSD(value);
    return h('td', {
      class: 'border-l border-slate-200 px-2 py-[3px] text-right num ' +
        (opts.major ? 'bg-navy-950/[0.06] text-[13.5px] font-bold text-navy-950'
          : opts.spine ? 'bg-slate-100/70 text-[12.5px] font-semibold text-navy-900'
            : row.subtotal ? 'bg-slate-50 text-[12.5px] font-semibold text-navy-900'
              : 'bg-slate-50/60 text-[12.5px] text-slate-700'),
      title: moved
        ? (row.percent ? fmtPct(baseValue) : fmtUSD(baseValue)) + ' in the baseline'
        : undefined
    }, text);
  }

  function matrixLabelCell(label, ref, opts) {
    opts = opts || {};
    return h('th', {
      scope: 'row',
      class: 'sticky left-0 z-10 border-r border-slate-300 px-3 py-[3px] text-left font-normal ' +
        (opts.major ? 'bg-navy-950/[0.08]' : opts.spine ? 'bg-slate-100' : 'bg-white')
    },
      h('span', {
        class: 'block truncate ' + (opts.indent ? 'pl-4 ' : '') +
          (opts.major ? 'text-[13px] font-bold uppercase tracking-wide text-navy-950'
            : opts.spine ? 'text-[12.5px] font-semibold text-navy-900'
              : 'text-[12.5px] text-slate-700'),
        title: label
      }, label),
      ref ? h('span', { class: 'block truncate text-[10px] text-slate-400', title: ref }, ref) : null);
  }

  function matrixGroupRow(group, columns) {
    var open = groupOpen(group.id);
    return h('tr', { class: 'border-y border-slate-300 bg-slate-200/70' },
      h('th', {
        scope: 'row',
        class: 'sticky left-0 z-10 border-r border-slate-300 bg-slate-200/95 px-2 py-[4px] text-left'
      },
        h('button', {
          type: 'button',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': 'matrix-group-' + group.id,
          class: 'matrix-group-toggle flex w-full items-center gap-1.5 text-left',
          onclick: function () { toggleGroup(group.id); }
        },
          h('span', {
            'aria-hidden': 'true',
            class: 'inline-block text-[9px] text-slate-500 transition-transform' + (open ? ' rotate-90' : '')
          }, '▶'),
          h('span', { class: 'min-w-0 flex-1' },
            h('span', { class: 'block truncate text-[12px] font-bold uppercase tracking-wide text-navy-900', title: group.title }, group.title),
            h('span', { class: 'block truncate text-[10px] font-normal normal-case tracking-normal text-slate-500', title: group.formRef }, group.formRef)))),
      columns.map(function () {
        return h('td', { class: 'border-l border-slate-300 bg-slate-200/70' });
      }),
      h('td', { class: 'matrix-spacer bg-slate-200/70', 'aria-hidden': 'true' }));
  }

  function matrixSpineRow(row, columns, baselineCol) {
    return h('tr', { class: row.major ? 'border-y-2 border-navy-800/25' : 'border-b border-slate-200' },
      matrixLabelCell(row.label, row.ref, { major: row.major, spine: true }),
      columns.map(function (col) {
        return matrixValueCell(row, col, baselineCol, { major: row.major, spine: true });
      }),
      h('td', { class: 'matrix-spacer ' + (row.major ? 'bg-navy-950/[0.06]' : 'bg-slate-100/70'), 'aria-hidden': 'true' }));
  }

  function renderScenarios() {
    var project = state.project;
    var columns = matrixColumns();
    var baselineCol = columns.find(function (c) { return c.isBaseline; }) || columns[0];
    var meta = yearMeta();
    var allOpen = openGroupCount() === MATRIX_GROUPS.length;
    var noneOpen = openGroupCount() === 0;

    var body = [];
    for (var group of MATRIX_GROUPS) {
      body.push(matrixGroupRow(group, columns));
      if (groupOpen(group.id)) {
        for (var row of group.rows) {
          body.push(h('tr', { class: 'border-b border-slate-100 hover:bg-sky-50/60' },
            matrixLabelCell(row.label, row.ref, { indent: true }),
            columns.map(function (col) {
              return row.edit
                ? matrixInputCell(row, col, baselineCol)
                : matrixValueCell(row, col, baselineCol, {});
            }),
            h('td', { class: 'matrix-spacer', 'aria-hidden': 'true' })));
        }
      }
      /* Subtotals belonging after this group sit outside it, so collapsing
         the group never hides the return's own running totals. */
      for (var spine of MATRIX_SPINE) {
        if (spine.after === group.id) body.push(matrixSpineRow(spine, columns, baselineCol));
      }
    }

    return h('div', { class: 'space-y-3 px-4 py-4' },
      h('section', { class: 'panel overflow-hidden' },
        h('div', { class: 'panel-header' },
          h('span', {}, 'Scenario Comparison'),
          h('span', { class: 'font-normal normal-case tracking-normal text-slate-500' },
            project.scenarios.length + (project.scenarios.length === 1 ? ' scenario' : ' scenarios') +
            ' · ' + meta.label + ' · measured against ' + (baselineCol ? baselineCol.scenario.name : '—'))),

        /* ---- the controls that sit above the table ---- */
        h('div', { class: 'flex flex-wrap items-center gap-2 border-b border-slate-300 bg-slate-50 px-3 py-1.5' },
          h('div', { class: 'flex items-center gap-1' },
            h('span', { class: 'text-[10.5px] font-semibold uppercase tracking-wide text-slate-500' }, 'Rows'),
            h('button', {
              type: 'button', class: 'btn-light h-[24px] px-2 text-[11.5px]',
              disabled: allOpen,
              title: 'Open every group in the table',
              onclick: function () { setAllGroups(true); }
            }, 'Expand all'),
            h('button', {
              type: 'button', class: 'btn-light h-[24px] px-2 text-[11.5px]',
              disabled: noneOpen,
              title: 'Close every group in the table. Subtotals stay visible.',
              onclick: function () { setAllGroups(false); }
            }, 'Collapse all'),
            h('span', { class: 'text-[10.5px] text-slate-500' },
              openGroupCount() + ' of ' + MATRIX_GROUPS.length + ' groups open')),
          h('div', { class: 'ml-auto flex flex-wrap items-center gap-2' },
            h('input', {
              type: 'text', value: ui.newScenarioName,
              placeholder: 'New scenario name',
              'aria-label': 'Name for a new scenario',
              class: 'input-base h-[24px] w-[190px] text-[12px]',
              oninput: function (e) { ui.newScenarioName = e.target.value; }
            }),
            h('button', {
              type: 'button', class: 'btn-primary h-[24px] px-2 text-[11.5px]',
              title: 'Add a column, copied from the baseline scenario',
              onclick: function () {
                var name = ui.newScenarioName.trim() || 'Scenario ' + (project.scenarios.length + 1);
                ui.newScenarioName = '';
                addScenarioFrom(baselineCol ? baselineCol.scenario : null, name);
              }
            }, '+ Add scenario'),
            h('button', {
              type: 'button', class: 'btn-light h-[24px] px-2 text-[11.5px]',
              onclick: function () { setModal('compare'); }
            }, 'Comparison report →'))),

        /* ---- what the cells mean ---- */
        h('div', { class: 'flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white px-3 py-1 text-[10.5px] text-slate-500' },
          h('span', { class: 'inline-flex items-center gap-1' },
            h('span', { class: 'inline-block h-[11px] w-[16px] rounded-[2px] border border-slate-300 bg-white' }), 'entered — type to change this scenario'),
          h('span', { class: 'inline-flex items-center gap-1' },
            h('span', { class: 'inline-block h-[11px] w-[16px] rounded-[2px] border border-slate-200 bg-slate-100' }), 'calculated by the engine'),
          h('span', { class: 'inline-flex items-center gap-1' },
            h('span', { class: 'inline-block h-[11px] w-[3px] bg-accent-500' }), 'differs from the baseline'),
          h('span', { class: 'ml-auto' },
            'Lowest tax is not marked as best: tax cost is one factor, and risk, feasibility and substantiation are others.')),

        meta.projected
          ? h('p', { class: 'border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11.5px] leading-snug text-amber-900' },
            h('strong', {}, 'TY' + meta.year + ' is projected, not published. '),
            meta.basis + ' Treat every figure in this table as a planning estimate for that year.')
          : null,

        /* ---- the table ----
           The line-description column is frozen so a row is still readable
           after scrolling right past several scenarios, and the scenario
           headers are frozen so a column is still identifiable after
           scrolling down into the schedules. Extra scenarios extend the
           table sideways and it scrolls: columns keep a readable width
           rather than being squeezed to fit. */
        h('div', { class: 'thin-scroll matrix-scroll overflow-auto' },
          h('table', { class: 'matrix-table w-full border-collapse text-[13px]' },
            h('thead', {},
              h('tr', {},
                h('th', {
                  scope: 'col',
                  class: 'sticky left-0 top-0 z-30 border-r border-navy-800 bg-navy-950 px-3 py-2 text-left align-bottom',
                  style: { width: '340px', minWidth: '340px' }
                },
                  h('span', { class: 'block text-[11px] font-bold uppercase tracking-[0.1em] text-slate-300' }, 'Form 1040 line'),
                  h('span', { class: 'block text-[10px] font-normal text-slate-500' }, 'in return order · ' + meta.label)),
                columns.map(function (col) { return scenarioHeaderCell(col, baselineCol.result, columns.length); }),
                h('th', { class: 'matrix-spacer sticky top-0 z-20 bg-navy-950', 'aria-hidden': 'true' }))),
            h('tbody', {}, body)))),

      strategyLibraryPanel(baselineCol));
  }

  /* Add a column. Copies the scenario it is created from — usually the
     baseline — so a new column starts as the client's current facts and is
     changed from there, which is how a preparer actually builds one. */
  function addScenarioFrom(source, name) {
    var prev = state.project;
    var from = source || activeScenario();
    var scenario = Engine.createScenario(name, JSON.parse(JSON.stringify(from.inputs)));
    state.project = Object.assign({}, prev, {
      scenarios: prev.scenarios.concat([scenario]),
      activeScenarioId: scenario.id,
      updatedAt: new Date().toISOString()
    });
    persist(state.project);
    state.result = computeForProject(state.project);
    pushHistory(prev);
    render();
  }

  /* ---- strategy scenario library --------------------------------------------- */
  /* Applying a strategy adds a COLUMN to the matrix.

     It clones the scenario it is modelled from — the baseline unless the
     preparer picked another — applies the strategy's assumptions to that
     copy, and drops the result in beside it. Nothing is overwritten, so the
     facts the strategy was measured against are still on screen next to it,
     and the lines the strategy moved are marked in the new column the same
     way any other edit would be.

     The saving or cost it produced is reported against the baseline in the
     column header. It is not a recommendation: the entry's own authority,
     eligibility and substantiation still have to be checked. */
  function modelLibraryScenario(entry, sourceScenario) {
    var raw = ui.libraryAmounts[entry.key];
    var amount = raw !== undefined ? parseAmount(raw) : entry.defaultAmount;
    if (!(amount > 0)) amount = entry.defaultAmount;
    ui.libraryAmounts[entry.key] = fmtUSD(amount);
    var from = sourceScenario || baselineScenario() || activeScenario();
    var inputs = window.TaxLibrary.cloneInputs(from.inputs);
    var applied = entry.apply(inputs, amount, { taxYear: projectYear() });
    var prev = state.project;
    var before = computeInputs(from.inputs);
    var after = computeInputs(applied);
    var scenario = Engine.createScenario(entry.title + ' — ' + fmtUSD(amount), applied, {
      description: entry.summary + ' [Modelled from ' + from.name + ' · Source: ' +
        entry.source + ' · ' + entry.authority + ']'
    });
    state.project = Object.assign({}, prev, {
      scenarios: prev.scenarios.concat([scenario]),
      activeScenarioId: scenario.id,
      updatedAt: new Date().toISOString()
    });
    persist(state.project);
    state.result = computeForProject(state.project);
    pushHistory(prev);
    var baseline = baselineScenario();
    if (baseline) state.compareSelection = [baseline.id, scenario.id];
    /* Report what the new column did, so the effect is visible without
       hunting for it — and open every group, since the changed lines are
       what the preparer has just asked to see. */
    ui.lastModelled = {
      scenarioId: scenario.id,
      title: entry.title,
      from: from.name,
      delta: round2ish(after.totalTax - before.totalTax)
    };
    setAllGroups(true);
  }

  function strategyLibraryPanel(baselineCol) {
    var library = window.TaxLibrary;
    if (!library) return null;
    var byCategory = new Map();
    for (var cat of library.CATEGORIES) byCategory.set(cat, []);
    for (var entry of library.STRATEGY_LIBRARY) {
      var bucket = byCategory.get(entry.category);
      if (bucket) bucket.push(entry);
    }
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-header' },
        h('span', {}, 'Strategy Scenario Library'),
        h('span', { class: 'font-normal normal-case tracking-normal text-slate-500' },
          library.STRATEGY_LIBRARY.length + ' strategies from the uploaded planning guides')),
      h('p', { class: 'border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11.5px] leading-snug text-slate-600' },
        'Each strategy clones ' + (baselineCol ? 'the baseline scenario (' + baselineCol.scenario.name + ')' : 'the baseline scenario') + ', applies the modeled input changes, and adds the result as a new column in the table above — the lines it moved are marked there, and its saving or cost against the baseline is shown in its column header. Sources: Roth IRA client letter · HNWI Tax Planning & Strategies Guide · CCH Capital Gains & Casualty Losses · Entity Classification (CCH) · Essential Tax & Wealth Planning Guide 2025.'),
      ui.lastModelled
        ? h('p', { class: 'flex flex-wrap items-baseline gap-x-2 border-b border-slate-200 bg-white px-3 py-1.5 text-[11.5px] text-slate-700' },
          h('strong', {}, 'Added: ' + ui.lastModelled.title),
          h('span', { class: 'text-slate-500' }, 'modelled from ' + ui.lastModelled.from + ' ·'),
          h('span', { class: 'num font-semibold' },
            (ui.lastModelled.delta <= 0 ? '−' : '+') + fmtUSD(Math.abs(ui.lastModelled.delta))),
          h('span', { class: 'text-slate-500' },
            ui.lastModelled.delta <= 0 ? 'total tax against that scenario' : 'total tax against that scenario'),
          h('button', {
            type: 'button', class: 'ml-auto text-[11px] font-semibold text-accent-600 hover:underline',
            onclick: function () { ui.lastModelled = null; render(); }
          }, 'Dismiss'))
        : null,
      library.CATEGORIES.map(function (cat) {
        var entries = byCategory.get(cat) || [];
        if (entries.length === 0) return null;
        return h('div', {},
          h('div', { class: 'border-b border-slate-200 bg-navy-900 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-300' }, cat),
          h('ul', { class: 'divide-y divide-slate-100' },
            entries.map(function (entry) {
              return h('li', { class: 'flex flex-wrap items-start gap-3 px-3 py-2' },
                h('div', { class: 'min-w-0 flex-1' },
                  h('div', { class: 'flex flex-wrap items-baseline gap-2' },
                    h('span', { class: 'text-[13px] font-semibold text-navy-900' }, entry.title),
                    entry.estimated ? statusChip('estimated', undefined, true) : null,
                    h('span', { class: 'font-mono text-[10px] text-slate-400' }, entry.authority)),
                  h('p', { class: 'mt-0.5 text-[11.5px] leading-snug text-slate-600' }, entry.summary),
                  h('p', { class: 'mt-0.5 text-[10.5px] text-slate-400' }, 'Source: ' + entry.source)),
                h('div', { class: 'flex shrink-0 items-center gap-2 pt-0.5' },
                  h('label', { class: 'field-label', for: 'lib-amt-' + entry.key }, entry.amountLabel),
                  h('input', {
                    id: 'lib-amt-' + entry.key, type: 'text', inputmode: 'decimal',
                    class: 'input-num', style: { width: '110px' },
                    value: ui.libraryAmounts[entry.key] !== undefined ? ui.libraryAmounts[entry.key] : fmtUSD(entry.defaultAmount),
                    onfocus: function (e) { e.currentTarget.select(); },
                    oninput: function (e) { ui.libraryAmounts[entry.key] = e.target.value; },
                    onblur: function (e) {
                      var parsed = parseAmount(e.target.value);
                      ui.libraryAmounts[entry.key] = fmtUSD(parsed > 0 ? parsed : entry.defaultAmount);
                      e.target.value = ui.libraryAmounts[entry.key];
                    },
                    onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }
                  }),
                  h('button', {
                    type: 'button', class: 'btn-primary',
                    title: 'Add this strategy as a new column, cloned from the baseline',
                    onclick: function () { modelLibraryScenario(entry, baselineCol ? baselineCol.scenario : null); }
                  }, '+ Add as column')));
            })));
      }),
      h('p', { class: 'border-t border-slate-200 bg-amber-50 px-3 py-1.5 text-[11px] leading-snug text-amber-900' },
        'Library scenarios are planning estimates: entries marked EST use simplified modeling (see each scenario’s tracking note in the Planning Strategies drawer). Verify eligibility, limits and elections against the cited authority before advising.'));
  }

  /* ---- editable grid -------------------------------------------------------- */
  function currencyCell(value, label, onCommit) {
    var input = h('input', {
      type: 'text', inputmode: 'decimal', 'aria-label': label,
      class: 'input-num h-[26px] rounded-none border-0 bg-transparent px-2 shadow-none focus:bg-white',
      style: { boxShadow: 'none' },
      value: value === 0 ? '' : fmtUSD(value),
      placeholder: '—',
      onfocus: function (e) { e.currentTarget.select(); },
      onblur: function (e) {
        var parsed = parseAmount(e.target.value);
        e.target.value = parsed === 0 ? '' : fmtUSD(parsed);
        if (parsed !== value) onCommit(parsed);
      },
      onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }
    });
    return input;
  }

  function editableGrid(config) {
    var columns = config.columns;
    var rows = config.rows;
    var onChange = config.onChange;
    var makeRow = config.makeRow;
    var addLabel = config.addLabel || 'Add row';
    var emptyMessage = config.emptyMessage || 'No entries yet.';
    var caption = config.caption;

    function updateCell(rowIndex, key, value) {
      onChange(rows.map(function (row, idx) {
        return idx === rowIndex ? Object.assign({}, row, (function () { var o = {}; o[key] = value; return o; })()) : row;
      }));
    }

    var hasTotals = columns.some(function (c) { return c.total; });

    return h('div', { class: 'panel' },
      caption
        ? h('div', { class: 'panel-header' },
          h('span', {}, caption),
          h('span', { class: 'font-mono text-[10px] font-normal normal-case tracking-normal text-slate-500' },
            rows.length + ' ' + (rows.length === 1 ? 'row' : 'rows')))
        : null,
      h('div', { class: 'thin-scroll overflow-x-auto' },
        h('table', { class: 'w-full min-w-full border-collapse text-[13px]' },
          h('thead', {},
            h('tr', { class: 'bg-navy-900 text-left text-[10.5px] uppercase tracking-[0.06em] text-slate-300' },
              columns.map(function (col) {
                return h('th', {
                  scope: 'col', title: col.title,
                  class: ['whitespace-nowrap border-r border-navy-800 px-2 py-1.5 font-semibold last:border-r-0',
                    col.kind === 'currency' ? 'text-right' : '',
                    col.kind === 'checkbox' ? 'text-center' : '',
                    col.width != null ? col.width : ''].join(' ')
                }, col.header);
              }),
              h('th', { scope: 'col', class: 'w-[38px] px-1 py-1.5' }, h('span', { class: 'sr-only' }, 'Remove')))),
          h('tbody', {},
            rows.length === 0
              ? h('tr', {}, h('td', { colspan: String(columns.length + 1), class: 'px-3 py-4 text-center text-[12.5px] italic text-slate-500' }, emptyMessage))
              : rows.map(function (row, rowIndex) {
                return h('tr', { class: 'border-b border-slate-200 last:border-b-0 odd:bg-white even:bg-slate-50/70 hover:bg-sky-50' },
                  columns.map(function (col) {
                    var cellValue = row[col.key];
                    var cellLabel = col.header + ', row ' + (rowIndex + 1);
                    var content;
                    if (col.kind === 'currency') {
                      content = currencyCell(typeof cellValue === 'number' ? cellValue : 0, cellLabel,
                        function (v) { updateCell(rowIndex, col.key, v); });
                    } else if (col.kind === 'checkbox') {
                      content = h('div', { class: 'flex h-[26px] items-center justify-center' },
                        h('input', {
                          type: 'checkbox', 'aria-label': cellLabel, checked: cellValue === true,
                          onchange: function (e) { updateCell(rowIndex, col.key, e.target.checked); },
                          class: 'h-3.5 w-3.5 accent-accent-600'
                        }));
                    } else if (col.kind === 'select') {
                      content = h('select', {
                        'aria-label': cellLabel,
                        onchange: function (e) { updateCell(rowIndex, col.key, e.target.value); },
                        class: 'h-[26px] w-full border-0 bg-transparent px-1.5 text-[12.5px] text-slate-800 outline-none focus:bg-white'
                      }, (col.options || []).map(function (opt) {
                        return h('option', { value: opt.value, selected: opt.value === cellValue }, opt.label);
                      }));
                    } else {
                      content = h('input', {
                        type: 'text', 'aria-label': cellLabel,
                        value: typeof cellValue === 'string' ? cellValue : '',
                        onchange: function (e) { updateCell(rowIndex, col.key, e.target.value); },
                        onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
                        class: 'h-[26px] w-full border-0 bg-transparent px-2 text-[13px] text-slate-800 outline-none focus:bg-white'
                      });
                    }
                    return h('td', { class: 'border-r border-slate-200 p-0 align-middle last:border-r-0' }, content);
                  }),
                  h('td', { class: 'p-0 text-center align-middle' },
                    h('button', {
                      type: 'button',
                      onclick: function () { onChange(rows.filter(function (r, idx) { return idx !== rowIndex; })); },
                      'aria-label': 'Delete row ' + (rowIndex + 1), title: 'Delete row',
                      class: 'h-[26px] w-full text-[13px] text-slate-400 transition hover:bg-rose-50 hover:text-rose-600'
                    }, '✕')));
              })),
          hasTotals && rows.length > 0
            ? h('tfoot', {},
              h('tr', { class: 'border-t-2 border-navy-800 bg-slate-100 font-semibold' },
                columns.map(function (col, colIndex) {
                  var content = '';
                  if (col.total) {
                    var total = rows.reduce(function (acc, row) {
                      var v = row[col.key];
                      return acc + (typeof v === 'number' ? v : 0);
                    }, 0);
                    content = fmtUSD(total);
                  } else if (colIndex === 0) content = 'Total';
                  return h('td', {
                    class: ['border-r border-slate-200 px-2 py-1.5 text-[12.5px] last:border-r-0',
                      col.total ? 'num text-navy-900' : 'text-slate-600'].join(' ')
                  }, content);
                }),
                h('td', {})))
            : null)),
      h('div', { class: 'flex items-center justify-between border-t border-slate-300 bg-white px-2 py-1.5' },
        h('button', { type: 'button', onclick: function () { onChange(rows.concat([makeRow()])); }, class: 'btn-light' }, '+ ' + addLabel),
        h('span', { class: 'pr-1 text-[10.5px] text-slate-400' }, 'Accepts 1,234 and (500) for negatives')));
  }

  function fieldRow(config) {
    /* A hint may be a function when its wording depends on the tax year in
       force — the SALT cap and the charitable floor differ by year, and a
       hint quoting last year's figure is worse than none. */
    var hint = typeof config.hint === 'function' ? config.hint() : config.hint;
    return h('label', { class: 'flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-[5px] last:border-b-0 hover:bg-sky-50/60' },
      h('span', { class: 'min-w-0 flex-1' },
        h('span', { class: 'block truncate text-[12.5px] text-slate-700' }, config.label),
        hint ? h('span', { class: 'block truncate text-[10.5px] text-slate-400', title: hint }, hint) : null),
      h('input', {
        type: 'text', inputmode: 'decimal',
        class: 'input-num w-[140px] shrink-0', style: { width: '140px' },
        placeholder: '0',
        value: config.value === 0 ? '' : fmtUSD(config.value),
        onfocus: function (e) { e.currentTarget.select(); },
        onblur: function (e) {
          var parsed = parseAmount(e.target.value);
          e.target.value = parsed === 0 ? '' : fmtUSD(parsed);
          if (parsed !== config.value) config.onCommit(parsed);
        },
        onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }
      }));
  }

  /* ---- module lines panel (inside drawers) ----------------------------------- */
  function moduleLinesPanel(moduleKey, title) {
    var module = state.result.modules[moduleKey];
    if (!module) return null;
    return h('div', { class: 'panel mt-4' },
      h('div', { class: 'panel-header' },
        h('span', {}, title || 'Computed lines'),
        h('span', { class: 'flex items-center gap-2 font-normal normal-case tracking-normal' },
          statusChip(module.status),
          h('span', { class: 'num text-[12.5px] font-bold text-navy-900' }, fmtUSD(module.total)))),
      h('table', { class: 'w-full table-fixed border-collapse text-[12.5px]' },
        h('colgroup', {},
          h('col', {}), h('col', { class: 'w-[210px]' }), h('col', { class: 'w-[120px]' }),
          h('col', { class: 'w-[52px]' }), h('col', { class: 'w-[44px]' })),
        h('tbody', {}, module.lines.map(function (l) {
          return h('tr', { class: 'border-b border-slate-100 last:border-b-0 hover:bg-sky-50/70' },
            h('td', { class: 'py-[4px] pl-3 pr-2 text-slate-700' }, l.label),
            h('td', { class: 'truncate px-2 py-[4px] text-[10.5px] text-slate-400' }, l.citation != null ? l.citation : ''),
            h('td', { class: 'num px-2 py-[4px] text-slate-800' }, fmtUSD(l.amount)),
            h('td', { class: 'px-1 py-[4px] text-center' }, statusChip(l.status, l.notes ? l.notes[0] : undefined, true)),
            h('td', { class: 'pr-2 text-right' },
              h('button', {
                type: 'button', onclick: function () { openCalcDetail(l.key); },
                'aria-label': 'Calculation detail for ' + l.label,
                class: 'h-[20px] px-1 text-[11px] font-semibold text-accent-600 hover:underline'
              }, 'detail')));
        }))),
      module.messages.length > 0
        ? h('ul', { class: 'divide-y divide-slate-100 border-t border-slate-200 bg-slate-50' },
          module.messages.map(function (m) {
            return h('li', { class: 'flex gap-2 px-3 py-1.5' },
              h('span', {
                'aria-hidden': 'true',
                class: 'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ' +
                  (m.severity === 'error' ? 'bg-rose-500' : m.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500')
              }),
              h('span', { class: 'text-[11.5px] leading-snug text-slate-600' }, m.message));
          }))
        : null);
  }

  /* ---- drawer & modal shells --------------------------------------------------- */
  var DRAWER_WIDTHS = { md: 'max-w-[620px]', lg: 'max-w-[860px]', xl: 'max-w-[1120px]' };
  var MODAL_WIDTHS = { md: 'max-w-[560px]', lg: 'max-w-[900px]', xl: 'max-w-[1280px]' };

  function drawerShell(config) {
    var width = DRAWER_WIDTHS[config.width || 'lg'];
    return h('div', { class: 'no-print fixed inset-0 z-50 flex justify-end' },
      h('button', {
        type: 'button', 'aria-label': 'Close drawer', tabindex: '-1',
        onclick: config.onClose, class: 'absolute inset-0 cursor-default bg-navy-950/50', style: { border: 'none' }
      }),
      h('div', {
        role: 'dialog', 'aria-modal': 'true', tabindex: '-1',
        class: 'relative flex h-full w-full ' + width + ' flex-col border-l border-navy-800 bg-slate-50 shadow-2xl outline-none'
      },
        h('header', { class: 'flex items-start justify-between gap-4 border-b border-navy-800 bg-navy-900 px-4 py-2.5' },
          h('div', { class: 'min-w-0' },
            h('h2', { class: 'truncate text-[14px] font-semibold tracking-wide text-white' }, config.title),
            config.subtitle ? h('p', { class: 'mt-0.5 truncate text-[11.5px] text-slate-400' }, config.subtitle) : null),
          h('button', { type: 'button', onclick: config.onClose, class: 'btn-ghost shrink-0', 'aria-label': 'Close drawer' }, 'Close ✕')),
        h('div', { class: 'thin-scroll drawer-body flex-1 overflow-y-auto px-4 py-4' }, config.children),
        h('footer', { class: 'flex items-center justify-between gap-3 border-t border-slate-300 bg-white px-4 py-2.5' },
          h('div', { class: 'min-w-0 truncate text-[11px] text-slate-500' },
            config.footerLeft != null ? config.footerLeft : (config.citation ? 'Authority: ' + config.citation : null)),
          h('button', { type: 'button', onclick: config.onClose, class: 'btn-primary' }, 'Done'))));
  }

  function modalShell(config) {
    var width = MODAL_WIDTHS[config.size || 'lg'];
    return h('div', { class: 'no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6' },
      h('button', {
        type: 'button', 'aria-label': 'Close dialog', tabindex: '-1',
        onclick: config.onClose, class: 'fixed inset-0 cursor-default bg-navy-950/55', style: { border: 'none' }
      }),
      h('div', {
        role: 'dialog', 'aria-modal': 'true', tabindex: '-1',
        class: 'relative my-2 flex max-h-[92vh] w-full ' + width + ' flex-col border border-navy-800 bg-slate-50 shadow-2xl outline-none'
      },
        h('header', { class: 'flex items-start justify-between gap-4 border-b border-navy-800 bg-navy-900 px-4 py-2.5' },
          h('div', { class: 'min-w-0' },
            h('h2', { class: 'truncate text-[14px] font-semibold tracking-wide text-white' }, config.title),
            config.subtitle ? h('p', { class: 'mt-0.5 text-[11.5px] text-slate-400' }, config.subtitle) : null),
          h('button', { type: 'button', onclick: config.onClose, class: 'btn-ghost shrink-0', 'aria-label': 'Close dialog' }, 'Close ✕')),
        h('div', { class: 'thin-scroll modal-body flex-1 overflow-y-auto px-4 py-4' }, config.children),
        h('footer', { class: 'flex items-center justify-end gap-2 border-t border-slate-300 bg-white px-4 py-2.5' },
          config.footer != null ? config.footer
            : h('button', { type: 'button', onclick: config.onClose, class: 'btn-light' }, 'Close'))));
  }

  /* ---- input drawers ------------------------------------------------------------ */
  var WAGE_COLUMNS = [
    { key: 'employer', header: 'Employer', kind: 'text', width: 'w-[190px]' },
    { key: 'wages', header: 'Box 1 wages', kind: 'currency', total: true },
    { key: 'federalWithholding', header: 'Box 2 fed w/h', kind: 'currency', total: true },
    { key: 'socialSecurityWages', header: 'Box 3 SS wages', kind: 'currency', total: true },
    { key: 'socialSecurityWithheld', header: 'Box 4 SS w/h', kind: 'currency', total: true },
    { key: 'medicareWages', header: 'Box 5 Med wages', kind: 'currency', total: true },
    { key: 'medicareWithheld', header: 'Box 6 Med w/h', kind: 'currency', total: true },
    { key: 'retirementDeferral', header: 'Box 12 deferral', kind: 'currency', total: true },
    { key: 'hsa', header: 'Box 12 W (HSA)', kind: 'currency', total: true }
  ];

  function wagesDrawer() {
    return drawerShell({
      title: 'Wages — Form W-2',
      subtitle: 'Box 1 wages are already net of elective deferrals; deferrals are shown for Social Security wage-base coordination.',
      citation: 'IRC §61(a)(1); §3121(a) wage base',
      width: 'xl',
      onClose: function () { setDrawer(null); },
      children: [
        editableGrid({
          caption: 'W-2 statements',
          columns: WAGE_COLUMNS,
          rows: activeScenario().inputs.wages,
          onChange: function (rows) { updateInputs(function (i) { return Object.assign({}, i, { wages: rows }); }); },
          makeRow: function () {
            return {
              id: Engine.uuid(), employer: '', wages: 0, federalWithholding: 0, socialSecurityWages: 0,
              medicareWages: 0, socialSecurityWithheld: 0, medicareWithheld: 0, retirementDeferral: 0, hsa: 0
            };
          },
          addLabel: 'Add W-2',
          emptyMessage: 'No W-2 statements entered.'
        }),
        moduleLinesPanel('wages')
      ]
    });
  }

  var INTDIV_COLUMNS = [
    { key: 'payer', header: 'Payer', kind: 'text', width: 'w-[240px]' },
    {
      key: 'kind', header: 'Type', kind: 'select', width: 'w-[230px]',
      options: [
        { value: 'interest', label: 'Taxable interest (1099-INT)' },
        { value: 'taxExemptInterest', label: 'Tax-exempt interest' },
        { value: 'ordinaryDividend', label: 'Ordinary dividend (1099-DIV)' },
        { value: 'qualifiedDividend', label: 'Qualified dividend' }
      ]
    },
    { key: 'amount', header: 'Amount', kind: 'currency', total: true },
    { key: 'federalWithholding', header: 'Federal w/h', kind: 'currency', total: true }
  ];

  function interestDividendsDrawer() {
    return drawerShell({
      title: 'Interest & Dividends',
      subtitle: 'Qualified dividends are a subset taxed at capital-gain rates. Tax-exempt interest is excluded from income but still drives MAGI, NIIT and Social Security taxability.',
      citation: 'IRC §61(a)(4); §103; §1(h)(11)',
      width: 'lg',
      onClose: function () { setDrawer(null); },
      children: [
        editableGrid({
          caption: '1099-INT / 1099-DIV detail',
          columns: INTDIV_COLUMNS,
          rows: activeScenario().inputs.interestDividends,
          onChange: function (rows) { updateInputs(function (i) { return Object.assign({}, i, { interestDividends: rows }); }); },
          makeRow: function () { return { id: Engine.uuid(), payer: '', kind: 'interest', amount: 0, federalWithholding: 0 }; },
          addLabel: 'Add payer',
          emptyMessage: 'No interest or dividend income entered.'
        }),
        moduleLinesPanel('interestDividends')
      ]
    });
  }

  var BUSINESS_COLUMNS = [
    { key: 'name', header: 'Business', kind: 'text', width: 'w-[200px]' },
    { key: 'grossReceipts', header: 'Gross receipts', kind: 'currency', total: true },
    { key: 'expenses', header: 'Total expenses', kind: 'currency', total: true },
    { key: 'w2Wages', header: 'W-2 wages paid', kind: 'currency', total: true, title: 'Used for the §199A(b)(2) W-2 wage limitation' },
    { key: 'unadjustedBasis', header: 'UBIA of property', kind: 'currency', total: true, title: 'Unadjusted basis immediately after acquisition of qualified property' },
    { key: 'isSSTB', header: 'SSTB', kind: 'checkbox', width: 'w-[62px]', title: 'Specified service trade or business — QBI phases out above the threshold' },
    { key: 'materialParticipation', header: 'Material part.', kind: 'checkbox', width: 'w-[92px]', title: 'Material participation under the §469 tests' }
  ];

  function businessDrawer() {
    return drawerShell({
      title: 'Business Income — Schedule C',
      subtitle: 'Net profit per business drives self-employment tax and the §199A qualified business income deduction.',
      citation: 'IRC §162; §1402(a); §199A(b)(2)',
      width: 'xl',
      onClose: function () { setDrawer(null); },
      children: [
        editableGrid({
          caption: 'Sole proprietorships & single-member LLCs',
          columns: BUSINESS_COLUMNS,
          rows: activeScenario().inputs.businesses,
          onChange: function (rows) { updateInputs(function (i) { return Object.assign({}, i, { businesses: rows }); }); },
          makeRow: function () {
            return {
              id: Engine.uuid(), name: '', grossReceipts: 0, expenses: 0, isSSTB: false,
              w2Wages: 0, unadjustedBasis: 0, materialParticipation: true
            };
          },
          addLabel: 'Add business',
          emptyMessage: 'No Schedule C businesses entered.'
        }),
        moduleLinesPanel('businessIncome'),
        moduleLinesPanel('selfEmploymentTax', 'Related: self-employment tax')
      ]
    });
  }

  var RENTAL_COLUMNS = [
    { key: 'property', header: 'Property', kind: 'text', width: 'w-[220px]' },
    { key: 'rents', header: 'Rents received', kind: 'currency', total: true },
    { key: 'expenses', header: 'Operating expenses', kind: 'currency', total: true },
    { key: 'depreciation', header: 'Depreciation', kind: 'currency', total: true },
    { key: 'activelyParticipates', header: 'Active part.', kind: 'checkbox', width: 'w-[86px]', title: 'Active participation unlocks the $25,000 special allowance under §469(i)' },
    { key: 'isQualifiedTradeOrBusiness', header: '§199A trade', kind: 'checkbox', width: 'w-[86px]', title: 'Rental rises to a trade or business (Rev. Proc. 2019-38 safe harbor)' }
  ];

  function rentalDrawer() {
    return drawerShell({
      title: 'Rental Real Estate — Schedule E',
      subtitle: 'Passive losses are limited; the $25,000 active-participation allowance phases out at 50% of MAGI over $100,000 and is fully gone at $150,000.',
      citation: 'IRC §469; §469(i); Rev. Proc. 2019-38',
      width: 'xl',
      onClose: function () { setDrawer(null); },
      children: [
        editableGrid({
          caption: 'Rental properties',
          columns: RENTAL_COLUMNS,
          rows: activeScenario().inputs.rentals,
          onChange: function (rows) { updateInputs(function (i) { return Object.assign({}, i, { rentals: rows }); }); },
          makeRow: function () {
            return {
              id: Engine.uuid(), property: '', rents: 0, expenses: 0, depreciation: 0,
              activelyParticipates: true, isQualifiedTradeOrBusiness: false
            };
          },
          addLabel: 'Add property',
          emptyMessage: 'No rental properties entered.'
        }),
        moduleLinesPanel('rentalIncome')
      ]
    });
  }

  var CAPGAIN_COLUMNS = [
    { key: 'description', header: 'Description', kind: 'text', width: 'w-[240px]' },
    { key: 'shortTermGain', header: 'Short-term', kind: 'currency', total: true },
    { key: 'longTermGain', header: 'Long-term', kind: 'currency', total: true },
    { key: 'section1250Gain', header: 'Unrecap. §1250', kind: 'currency', total: true, title: 'Unrecaptured section 1250 gain, taxed at a maximum 25%' },
    { key: 'collectiblesGain', header: 'Collectibles', kind: 'currency', total: true, title: 'Collectibles gain, taxed at a maximum 28%' }
  ];

  function capitalGainsDrawer() {
    var gains = activeScenario().inputs.capitalGains;
    var shortTerm = gains.reduce(function (acc, g) { return acc + g.shortTermGain; }, 0);
    var longTerm = gains.reduce(function (acc, g) { return acc + g.longTermGain + g.section1250Gain + g.collectiblesGain; }, 0);
    return drawerShell({
      title: 'Capital Gains & Losses — Schedule D',
      subtitle: 'Net long-term gain and qualified dividends are stacked on top of ordinary income and taxed at the 0/15/20% breakpoints. Net capital losses are limited to $3,000 ($1,500 MFS).',
      citation: 'IRC §1(h); §1211(b); §1222',
      width: 'xl',
      onClose: function () { setDrawer(null); },
      children: [
        editableGrid({
          caption: 'Realized and planned dispositions',
          columns: CAPGAIN_COLUMNS,
          rows: gains,
          onChange: function (rows) { updateInputs(function (i) { return Object.assign({}, i, { capitalGains: rows }); }); },
          makeRow: function () {
            return { id: Engine.uuid(), description: '', shortTermGain: 0, longTermGain: 0, section1250Gain: 0, collectiblesGain: 0 };
          },
          addLabel: 'Add disposition',
          emptyMessage: 'No capital transactions entered.'
        }),
        h('div', { class: 'mt-3 grid grid-cols-2 gap-3' },
          h('div', { class: 'panel px-3 py-2' },
            h('div', { class: 'field-label' }, 'Net short-term'),
            h('div', { class: 'num mt-0.5 text-[16px] text-navy-950' }, fmtUSD(shortTerm)),
            h('p', { class: 'mt-1 text-[11px] leading-snug text-slate-500' }, 'Taxed at ordinary rates under IRC §1222(7).')),
          h('div', { class: 'panel px-3 py-2' },
            h('div', { class: 'field-label' }, 'Net long-term & preference'),
            h('div', { class: 'num mt-0.5 text-[16px] text-navy-950' }, fmtUSD(longTerm)),
            h('p', { class: 'mt-1 text-[11px] leading-snug text-slate-500' }, 'Preference rates apply: 0/15/20%, 25% §1250, 28% collectibles.'))),
        moduleLinesPanel('taxComputation', 'Resulting tax computation')
      ]
    });
  }

  var OTHER_INCOME_COLUMNS = [
    { key: 'description', header: 'Description', kind: 'text', width: 'w-[220px]' },
    {
      key: 'kind', header: 'Type', kind: 'select', width: 'w-[250px]',
      options: [
        { value: 'retirement', label: 'Retirement distribution (1099-R)' },
        { value: 'socialSecurity', label: 'Social Security benefits (SSA-1099)' },
        { value: 'unemployment', label: 'Unemployment compensation' },
        { value: 'k1Ordinary', label: 'K-1 ordinary business income' },
        { value: 'other', label: 'Other income' }
      ]
    },
    { key: 'amount', header: 'Gross amount', kind: 'currency', total: true },
    { key: 'federalWithholding', header: 'Federal w/h', kind: 'currency', total: true },
    { key: 'isPassive', header: 'Passive', kind: 'checkbox', width: 'w-[70px]', title: 'Passive activity income under §469 — also relevant to net investment income' }
  ];

  function otherIncomeDrawer() {
    return drawerShell({
      title: 'Other Income',
      subtitle: 'Social Security benefits are entered gross; the taxable portion is derived from provisional income at the 50% / 85% tiers.',
      citation: 'IRC §86; §72; §85; §702',
      width: 'xl',
      onClose: function () { setDrawer(null); },
      children: [
        editableGrid({
          caption: 'Retirement, Social Security, K-1 and miscellaneous income',
          columns: OTHER_INCOME_COLUMNS,
          rows: activeScenario().inputs.otherIncome,
          onChange: function (rows) { updateInputs(function (i) { return Object.assign({}, i, { otherIncome: rows }); }); },
          makeRow: function () {
            return { id: Engine.uuid(), description: '', amount: 0, kind: 'other', federalWithholding: 0, isPassive: false };
          },
          addLabel: 'Add income item',
          emptyMessage: 'No other income entered.'
        }),
        moduleLinesPanel('otherIncome')
      ]
    });
  }

  var STRATEGY_KINDS = [
    { value: 'traditionalIra', label: 'Traditional IRA contribution', authority: 'IRC §219' },
    { value: 'sepIra', label: 'SEP-IRA contribution', authority: 'IRC §408(k)' },
    { value: 'solo401k', label: 'Solo 401(k) contribution', authority: 'IRC §401(k), §415(c)' },
    { value: 'hsa', label: 'HSA contribution', authority: 'IRC §223' },
    { value: 'charitableBunching', label: 'Charitable bunching', authority: 'IRC §170(b)' },
    { value: 'dafContribution', label: 'Donor-advised fund gift', authority: 'IRC §170(f)(18)' },
    { value: 'lossHarvesting', label: 'Tax-loss harvesting', authority: 'IRC §1211, §1091' },
    { value: 'incomeDeferral', label: 'Income deferral', authority: 'IRC §451' },
    { value: 'rothConversion', label: 'Roth conversion', authority: 'IRC §408A(d)(3)' },
    { value: 'installmentSale', label: 'Installment sale', authority: 'IRC §453' },
    { value: 'qcd', label: 'Qualified charitable distribution', authority: 'IRC §408(d)(8)' },
    { value: 'appreciatedStock', label: 'Appreciated securities donation', authority: 'IRC §170(b)(1)(C)' },
    { value: 'qofDeferral', label: 'Qualified Opportunity Fund deferral', authority: 'IRC §1400Z-2' },
    { value: 'qsbsExclusion', label: 'QSBS §1202 exclusion', authority: 'IRC §1202' },
    { value: 'nua', label: 'Net unrealized appreciation (employer stock)', authority: 'IRC §402(e)(4)' },
    { value: 'scorpElection', label: 'S-corp election / reasonable compensation', authority: 'Reg. §301.7701-3; IRC §1362' },
    { value: 'plan529', label: '529 plan contribution / front-load', authority: 'IRC §529' },
    { value: 'casualtyLoss', label: 'Disaster casualty loss', authority: 'IRC §165(h)' },
    { value: 'custom', label: 'Custom strategy', authority: 'Practitioner judgement' }
  ];

  var STRATEGY_COLUMNS = [
    { key: 'enabled', header: 'On', kind: 'checkbox', width: 'w-[46px]' },
    { key: 'label', header: 'Strategy', kind: 'text', width: 'w-[200px]' },
    {
      key: 'kind', header: 'Type', kind: 'select', width: 'w-[230px]',
      options: STRATEGY_KINDS.map(function (k) { return { value: k.value, label: k.label }; })
    },
    { key: 'amount', header: 'Amount', kind: 'currency', total: true },
    { key: 'note', header: 'Practitioner note', kind: 'text' }
  ];

  function planningDrawer() {
    var strategies = activeScenario().inputs.planningStrategies;
    var enabled = strategies.filter(function (s) { return s.enabled; });
    var modeled = enabled.reduce(function (acc, s) { return acc + s.amount; }, 0);
    return drawerShell({
      title: 'Planning Strategies',
      subtitle: 'Toggle strategies on and off to see the effect on AGI, taxable income and total tax immediately in the summary rail.',
      citation: 'See per-strategy authority below',
      width: 'xl',
      onClose: function () { setDrawer(null); },
      footerLeft: h('span', {},
        enabled.length + ' of ' + strategies.length + ' enabled · ',
        h('span', { class: 'num font-semibold text-navy-900' }, fmtUSD(modeled)), ' modeled'),
      children: [
        editableGrid({
          caption: 'Modeled strategies',
          columns: STRATEGY_COLUMNS,
          rows: strategies,
          onChange: function (rows) { updateInputs(function (i) { return Object.assign({}, i, { planningStrategies: rows }); }); },
          makeRow: function () {
            return { id: Engine.uuid(), label: 'New strategy', kind: 'custom', amount: 0, enabled: true, note: '' };
          },
          addLabel: 'Add strategy',
          emptyMessage: 'No planning strategies modeled.'
        }),
        h('div', { class: 'panel mt-4' },
          h('div', { class: 'panel-header' }, h('span', {}, 'Strategy authority reference')),
          h('ul', { class: 'grid grid-cols-2 gap-x-4 gap-y-0 px-3 py-2' },
            STRATEGY_KINDS.map(function (k) {
              return h('li', { class: 'flex items-baseline justify-between gap-2 border-b border-slate-100 py-[3px] last:border-b-0' },
                h('span', { class: 'truncate text-[12px] text-slate-700' }, k.label),
                h('span', { class: 'shrink-0 font-mono text-[10.5px] text-slate-400' }, k.authority));
            }))),
        moduleLinesPanel('planningDeductions')
      ]
    });
  }

  var ITEMIZED_GROUPS = [
    {
      title: 'Medical & dental', citation: 'IRC §213(a)',
      fields: [{ key: 'medical', label: 'Unreimbursed medical & dental', hint: 'Deductible only to the extent it exceeds 7.5% of AGI' }]
    },
    {
      title: 'Taxes you paid', citation: 'IRC §164; OBBBA §70120',
      fields: [
        { key: 'stateLocalIncomeTax', label: 'State & local income tax', hint: function () { var p = Engine.paramsFor(projectYear()); return 'Subject to the ' + p.year + ' SALT cap of ' + fmtUSD(p.saltCap.base) + (Number.isFinite(p.saltCap.magiPhaseDownThreshold) ? ', phased down over ' + fmtUSD(p.saltCap.magiPhaseDownThreshold) + ' MAGI' : ' (no phase-down)'); } },
        { key: 'realEstateTax', label: 'Real estate tax', hint: 'Included in the SALT cap' },
        { key: 'personalPropertyTax', label: 'Personal property tax', hint: 'Included in the SALT cap' }
      ]
    },
    {
      title: 'Interest you paid', citation: 'IRC §163(h); §163(d)',
      fields: [
        { key: 'mortgageInterest', label: 'Home mortgage interest', hint: 'Acquisition debt limited to $750,000 ($1M grandfathered pre-12/16/2017)' },
        { key: 'investmentInterest', label: 'Investment interest expense', hint: 'Limited to net investment income (Form 4952)' }
      ]
    },
    {
      title: 'Gifts to charity', citation: 'IRC §170(b); OBBBA 0.5% AGI floor',
      fields: [
        { key: 'charitableCash', label: 'Cash contributions', hint: function () { var p = Engine.paramsFor(projectYear()); return '60% of AGI ceiling' + (p.charitableFloor.agiFloorRate > 0 ? '; ' + (p.charitableFloor.agiFloorRate * 100).toFixed(1) + '% of AGI floor applies for ' + p.year : '; no AGI floor for ' + p.year); } },
        { key: 'charitableNonCash', label: 'Non-cash / appreciated property', hint: '30% of AGI ceiling for appreciated capital gain property' }
      ]
    },
    {
      title: 'Other itemized deductions', citation: 'IRC §67(g); §68 replacement haircut',
      fields: [{ key: 'other', label: 'Other allowable itemized deductions', hint: 'Gambling losses, estate tax on IRD, and similar §67(b) items' }]
    }
  ];

  function itemizedDrawer() {
    var inputs = activeScenario().inputs;
    var itemized = inputs.itemizedDeductions;
    var profile = inputs.profile;
    var result = state.result;
    var gross = Object.values(itemized).reduce(function (acc, v) { return acc + v; }, 0);
    return drawerShell({
      title: 'Itemized Deductions — Schedule A',
      subtitle: 'Entered gross; floors, ceilings, the SALT cap phase-down and the 2/37 itemized haircut are applied by the engine.',
      citation: 'IRC §63(d); Rev. Proc. 2025-32',
      width: 'lg',
      onClose: function () { setDrawer(null); },
      footerLeft: h('span', {},
        'Gross entered ', h('span', { class: 'num font-semibold text-navy-900' }, fmtUSD(gross)),
        ' · engine selected ', h('span', { class: 'font-semibold text-navy-900' }, result.deductionType),
        ' at ', h('span', { class: 'num font-semibold text-navy-900' }, fmtUSD(result.deductionUsed))),
      children: [
        h('div', { class: 'grid grid-cols-1 gap-3 xl:grid-cols-2' },
          ITEMIZED_GROUPS.map(function (group) {
            return h('section', { class: 'panel self-start' },
              h('div', { class: 'panel-header' },
                h('span', {}, group.title),
                h('span', { class: 'font-mono text-[10px] font-normal normal-case tracking-normal text-slate-500' }, group.citation)),
              h('div', {}, group.fields.map(function (field) {
                return fieldRow({
                  label: field.label, hint: field.hint, value: itemized[field.key],
                  onCommit: function (v) {
                    updateInputs(function (i) {
                      var next = Object.assign({}, i.itemizedDeductions);
                      next[field.key] = v;
                      return Object.assign({}, i, { itemizedDeductions: next });
                    });
                  }
                });
              })));
          }),
          h('section', { class: 'panel self-start' },
            h('div', { class: 'panel-header' }, h('span', {}, 'Standard deduction context')),
            h('dl', { class: 'divide-y divide-slate-100' },
              [
                ['Filing status', profile.filingStatus.toUpperCase()],
                ['Taxpayer age', String(profile.taxpayerAge)],
                ['Spouse age', profile.spouseAge === null ? '—' : String(profile.spouseAge)],
                ['Blind (taxpayer / spouse)', (profile.blindTaxpayer ? 'Y' : 'N') + ' / ' + (profile.blindSpouse ? 'Y' : 'N')]
              ].map(function (pair) {
                return h('div', { class: 'flex items-center justify-between px-3 py-[5px]' },
                  h('dt', { class: 'text-[12.5px] text-slate-600' }, pair[0]),
                  h('dd', { class: 'num text-[12.5px] text-navy-900' }, pair[1]));
              }))))
        ,
        moduleLinesPanel('deductions')
      ]
    });
  }

  var PAYMENT_FIELDS = [
    { key: 'federalWithholdingOther', label: 'Other federal withholding', hint: 'Withholding not reported on a W-2, 1099-INT/DIV or 1099-R already entered' },
    { key: 'priorYearOverpayment', label: 'Prior-year overpayment applied', hint: function () { return (projectYear() - 1) + ' refund credited forward to ' + projectYear(); } },
    { key: 'extensionPayment', label: 'Extension payment', hint: 'Amount paid with Form 4868' },
    { key: 'refundableCredits', label: 'Other refundable credits', hint: 'Beyond the additional child tax credit computed by the engine' },
    { key: 'priorYearTax', label: 'Prior-year total tax', hint: '2025 Form 1040 line 24 — drives the §6654 safe harbor' },
    { key: 'priorYearAgi', label: 'Prior-year AGI', hint: 'Over $150,000 ($75,000 MFS) raises the safe harbor to 110%' }
  ];
  var QUARTER_LABELS = ['Q1 — due 4/15/26', 'Q2 — due 6/15/26', 'Q3 — due 9/15/26', 'Q4 — due 1/15/27'];

  function paymentsDrawer() {
    var payments = activeScenario().inputs.payments;
    var result = state.result;
    var estimatedTotal = payments.estimatedPayments.reduce(function (acc, v) { return acc + v; }, 0);
    return drawerShell({
      title: 'Payments, Credits & Estimates',
      subtitle: 'Quarterly estimates are tested against the §6654 safe harbor: 90% of the current-year tax or 100%/110% of the prior-year tax.',
      citation: 'IRC §6654(d)(1); §24(h); §6402(b)',
      width: 'lg',
      onClose: function () { setDrawer(null); },
      footerLeft: h('span', {},
        'Total payments ', h('span', { class: 'num font-semibold text-navy-900' }, fmtUSD(result.totalPayments)),
        ' · safe harbor ', h('span', { class: 'num font-semibold text-navy-900' }, fmtUSD(result.safeHarborRequired))),
      children: [
        h('div', { class: 'grid grid-cols-1 gap-3 xl:grid-cols-2' },
          h('section', { class: 'panel self-start' },
            h('div', { class: 'panel-header' },
              h('span', {}, 'Estimated tax payments'),
              h('span', { class: 'num font-normal normal-case tracking-normal text-slate-600' }, fmtUSD(estimatedTotal))),
            h('div', {}, QUARTER_LABELS.map(function (label, quarter) {
              return fieldRow({
                label: label,
                value: payments.estimatedPayments[quarter] != null ? payments.estimatedPayments[quarter] : 0,
                onCommit: function (v) {
                  updateInputs(function (i) {
                    var next = [i.payments.estimatedPayments[0], i.payments.estimatedPayments[1],
                      i.payments.estimatedPayments[2], i.payments.estimatedPayments[3]];
                    if (quarter >= 0 && quarter < 4) next[quarter] = v;
                    return Object.assign({}, i, { payments: Object.assign({}, i.payments, { estimatedPayments: next }) });
                  });
                }
              });
            }))),
          h('section', { class: 'panel self-start' },
            h('div', { class: 'panel-header' }, h('span', {}, 'Withholding, credits & prior year')),
            h('div', {}, PAYMENT_FIELDS.map(function (field) {
              return fieldRow({
                label: field.label, hint: field.hint, value: payments[field.key],
                onCommit: function (v) {
                  updateInputs(function (i) {
                    var next = Object.assign({}, i.payments);
                    next[field.key] = v;
                    return Object.assign({}, i, { payments: next });
                  });
                }
              });
            })))),
        h('div', { class: 'mt-3 border px-3 py-2 ' + (result.underpayment > 0 ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900') },
          h('div', { class: 'text-[11px] font-bold uppercase tracking-[0.08em]' }, 'Estimated-tax safe harbor'),
          h('p', { class: 'mt-0.5 text-[12px] leading-snug' },
            result.underpayment > 0
              ? ['Projected payments fall short of the safe harbor by ',
                h('span', { class: 'num font-semibold' }, fmtUSD(result.underpayment)),
                '. Increase remaining quarterly estimates or year-end withholding to avoid a Form 2210 penalty.']
              : ['Projected payments of ',
                h('span', { class: 'num font-semibold' }, fmtUSD(result.totalPayments)),
                ' satisfy the §6654 safe harbor of ',
                h('span', { class: 'num font-semibold' }, fmtUSD(result.safeHarborRequired)), '.'])),
        moduleLinesPanel('payments')
      ]
    });
  }

  /* ---- calc detail drawer -------------------------------------------------------- */
  function findLine(modules, order, lineKey) {
    if (!lineKey) return null;
    for (var key of order) {
      var mod = modules[key];
      if (!mod) continue;
      var found = mod.lines.find(function (l) { return l.key === lineKey; });
      if (found) return { module: mod, line: found };
    }
    return null;
  }

  function calcDetailDrawer() {
    var result = state.result;
    var found = findLine(result.modules, result.moduleOrder, state.detailLineKey);
    var authorities = Object.entries(Engine.PARAM_AUTHORITIES).slice(0, 12);
    return drawerShell({
      title: found ? 'Calculation detail — ' + found.line.label : 'Calculation detail',
      subtitle: found ? found.module.label + ' · line key ' + found.line.key : 'Select a line from the planner grid.',
      width: 'md',
      onClose: function () { setDrawer(null); },
      children: found
        ? [
          h('div', { class: 'panel px-3 py-2.5' },
            h('div', { class: 'flex items-start justify-between gap-3' },
              h('div', { class: 'min-w-0' },
                h('div', { class: 'field-label' }, 'Computed amount'),
                h('div', { class: 'num mt-0.5 text-[24px] font-bold leading-none text-navy-950' }, fmtUSD(found.line.amount))),
              statusChip(found.line.status)),
            h('p', { class: 'mt-2 border-t border-slate-100 pt-2 text-[11.5px] leading-snug text-slate-500' },
              STATUS_META[found.line.status].description)),
          h('div', { class: 'panel mt-3' },
            h('div', { class: 'panel-header' }, h('span', {}, 'Inputs & intermediate values')),
            found.line.detail && found.line.detail.length > 0
              ? h('table', { class: 'w-full border-collapse text-[12.5px]' },
                h('tbody', {}, found.line.detail.map(function (entry) {
                  return h('tr', { class: 'border-b border-slate-100 last:border-b-0' },
                    h('td', { class: 'py-[4px] pl-3 pr-2 text-slate-600' }, entry.label),
                    h('td', { class: 'num px-3 py-[4px] text-navy-900' },
                      typeof entry.value === 'number' ? fmtUSD(entry.value) : entry.value));
                })))
              : h('p', { class: 'px-3 py-2 text-[12px] italic text-slate-500' },
                'This line is a direct rollup of the entries in its module; no intermediate worksheet values are produced.')),
          h('div', { class: 'panel mt-3' },
            h('div', { class: 'panel-header' }, h('span', {}, 'Controlling authority')),
            h('p', { class: 'px-3 py-2 font-mono text-[12px] text-navy-900' },
              found.line.citation != null ? found.line.citation : 'Not separately cited — see module authority.')),
          found.line.notes && found.line.notes.length > 0
            ? h('div', { class: 'panel mt-3' },
              h('div', { class: 'panel-header' }, h('span', {}, 'Practitioner notes')),
              h('ul', { class: 'divide-y divide-slate-100' }, found.line.notes.map(function (note) {
                return h('li', { class: 'px-3 py-1.5 text-[12px] leading-snug text-slate-600' }, note);
              })))
            : null,
          h('div', { class: 'panel mt-3' },
            h('div', { class: 'panel-header' },
              h('span', {}, 'Module context — ' + found.module.label),
              h('span', { class: 'num font-normal normal-case tracking-normal text-slate-600' }, fmtUSD(found.module.total))),
            h('ul', { class: 'divide-y divide-slate-100' }, found.module.lines.map(function (l) {
              return h('li', {
                class: 'flex items-center justify-between gap-2 px-3 py-[4px] text-[12px] ' +
                  (l.key === found.line.key ? 'bg-sky-50 font-semibold text-navy-900' : 'text-slate-600')
              },
                h('span', { class: 'truncate' }, l.label),
                h('span', { class: 'num shrink-0' }, fmtUSD(l.amount)));
            }))),
          h('details', { class: 'panel mt-3' },
            h('summary', { class: 'panel-header cursor-pointer list-none' },
              h('span', {}, yearMeta().year + ' parameter authorities'),
              h('span', { class: 'font-normal normal-case tracking-normal text-slate-500' }, 'show all')),
            h('ul', { class: 'divide-y divide-slate-100' }, authorities.map(function (entry) {
              return h('li', { class: 'flex items-baseline justify-between gap-3 px-3 py-[4px]' },
                h('span', { class: 'truncate text-[12px] text-slate-600' }, entry[0]),
                h('span', { class: 'shrink-0 font-mono text-[10.5px] text-slate-500' }, entry[1]));
            })))
        ]
        : h('p', { class: 'text-[12.5px] italic text-slate-500' },
          'No line selected. Use the chevron on any planner row to inspect its computation trail.')
    });
  }

  /* ---- compare modal -------------------------------------------------------------- */
  var COMPARE_LOWER_IS_BETTER = new Set(['totalTax', 'balanceDue', 'effectiveRate', 'marginalRate', 'amt', 'niit',
    'seTax', 'additionalMedicare', 'underpayment', 'taxableIncome']);
  var COMPARE_PERCENT_FIELDS = new Set(['effectiveRate', 'marginalRate']);

  function inputSummary(inputs) {
    function total(values) { return values.reduce(function (acc, v) { return acc + v; }, 0); }
    return {
      'Filing status': inputs.profile.filingStatus.toUpperCase(),
      'Dependents under 17': String(inputs.profile.dependentsUnder17),
      'W-2 statements': inputs.wages.length + ' · ' + fmtUSD(total(inputs.wages.map(function (w) { return w.wages; }))),
      'Interest & dividends': inputs.interestDividends.length + ' · ' + fmtUSD(total(inputs.interestDividends.map(function (i) { return i.amount; }))),
      'Schedule C businesses': inputs.businesses.length + ' · ' + fmtUSD(total(inputs.businesses.map(function (b) { return b.grossReceipts - b.expenses; }))),
      Rentals: inputs.rentals.length + ' · ' + fmtUSD(total(inputs.rentals.map(function (r) { return r.rents - r.expenses - r.depreciation; }))),
      'Capital gains': fmtUSD(total(inputs.capitalGains.map(function (g) { return g.shortTermGain + g.longTermGain + g.section1250Gain + g.collectiblesGain; }))),
      'Other income': fmtUSD(total(inputs.otherIncome.map(function (o) { return o.amount; }))),
      'Itemized (gross)': fmtUSD(total(Object.values(inputs.itemizedDeductions))),
      'Strategies enabled': inputs.planningStrategies.filter(function (s) { return s.enabled; }).length + ' · ' +
        fmtUSD(total(inputs.planningStrategies.filter(function (s) { return s.enabled; }).map(function (s) { return s.amount; }))),
      'Estimated payments': fmtUSD(total(inputs.payments.estimatedPayments))
    };
  }

  function compareModal() {
    var project = state.project;
    var selectedIds = state.compareSelection.length >= 2
      ? state.compareSelection
      : project.scenarios.slice(0, Math.min(2, project.scenarios.length)).map(function (s) { return s.id; });
    var selected = selectedIds
      .map(function (id) { return project.scenarios.find(function (s) { return s.id === id; }); })
      .filter(function (s) { return s !== undefined; })
      .slice(0, 4);
    var comparison = selected.length >= 2 ? Engine.compareScenarios.apply(null, selected) : null;
    var statuses = selected.map(function (s) { return computeInputs(s.inputs).status; });
    var diffs = [];
    if (selected.length >= 2) {
      var summaries = selected.map(function (s) { return inputSummary(s.inputs); });
      var first = summaries[0];
      if (first) {
        diffs = Object.keys(first).map(function (label) {
          return {
            label: label,
            values: summaries.map(function (summary) { return summary[label] != null ? summary[label] : '—'; })
          };
        }).filter(function (row) { return new Set(row.values).size > 1; });
      }
    }

    function toggleScenario(id) {
      if (selected.some(function (s) { return s.id === id; })) {
        if (selected.length <= 2) return;
        state.compareSelection = selected.filter(function (s) { return s.id !== id; }).map(function (s) { return s.id; });
      } else {
        if (selected.length >= 4) return;
        state.compareSelection = selected.map(function (s) { return s.id; }).concat([id]);
      }
      render();
    }

    return modalShell({
      title: 'Scenario Comparison',
      subtitle: 'Select 2 to 4 scenarios. Deltas are measured against the first selected scenario; green is a tax saving.',
      size: 'xl',
      onClose: function () { setModal(null); },
      footer: [
        h('button', { type: 'button', class: 'btn-light', onclick: duplicateActiveScenario }, 'Duplicate active scenario'),
        h('button', { type: 'button', class: 'btn-primary', onclick: function () { setModal(null); } }, 'Done')
      ],
      children: [
        h('div', { class: 'mb-3 flex flex-wrap items-center gap-2' },
          h('span', { class: 'text-[11px] font-semibold uppercase tracking-wide text-slate-500' }, 'Scenarios'),
          project.scenarios.map(function (scenario) {
            var isSelected = selected.some(function (s) { return s.id === scenario.id; });
            return h('button', {
              type: 'button',
              onclick: function () { toggleScenario(scenario.id); },
              'aria-pressed': isSelected ? 'true' : 'false',
              class: 'btn ' + (isSelected ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
            }, scenario.name + (scenario.isBaseline ? ' ★' : ''));
          })),
        comparison
          ? [
            h('div', { class: 'panel overflow-hidden' },
              h('div', { class: 'panel-header' },
                h('span', {}, 'Summary metrics'),
                h('span', { class: 'font-normal normal-case tracking-normal text-slate-500' },
                  'Baseline: ' + (comparison.scenarioNames[0] != null ? comparison.scenarioNames[0] : '—'))),
              h('div', { class: 'thin-scroll overflow-x-auto' },
                h('table', { class: 'w-full border-collapse text-[12.5px]' },
                  h('thead', {},
                    h('tr', { class: 'bg-navy-900 text-[10.5px] uppercase tracking-wide text-slate-300' },
                      h('th', { scope: 'col', class: 'px-3 py-1.5 text-left font-semibold' }, 'Metric'),
                      comparison.scenarioNames.map(function (name, idx) {
                        return h('th', {
                          scope: 'col', colspan: idx === 0 ? '1' : '2',
                          class: 'border-l border-navy-800 px-3 py-1.5 text-right font-semibold'
                        }, name, h('span', { class: 'ml-1 font-normal text-slate-500' },
                          '(' + (statuses[idx] != null ? statuses[idx] : '—') + ')'));
                      }))),
                  h('tbody', {},
                    Object.entries(comparison.fields).map(function (entry) {
                      var fieldKey = entry[0];
                      var field = entry[1];
                      var isPercent = COMPARE_PERCENT_FIELDS.has(fieldKey);
                      var format = function (v) { return isPercent ? fmtPct(v) : fmtUSD(v); };
                      return h('tr', { class: 'border-b border-slate-200 hover:bg-sky-50/70' },
                        h('td', { class: 'px-3 py-[5px] text-slate-700' }, field.label),
                        field.values.map(function (value, idx) {
                          var delta = field.deltaFromFirst[idx] != null ? field.deltaFromFirst[idx] : 0;
                          var isGood = COMPARE_LOWER_IS_BETTER.has(fieldKey) ? delta < 0 : delta > 0;
                          var valueCell = h('td', { class: 'num border-l border-slate-200 px-3 py-[5px] text-navy-950' }, format(value));
                          if (idx === 0) return valueCell;
                          return [valueCell,
                            h('td', {
                              class: 'num px-3 py-[5px] text-[12px] ' +
                                (delta === 0 ? 'text-slate-400' : isGood ? 'text-emerald-700' : 'text-rose-700')
                            }, delta === 0 ? '—' : isPercent ? fmtPct(delta, { sign: true }) : fmtSigned(delta))];
                        }));
                    })))),
              h('div', { class: 'grid grid-cols-2 gap-px border-t-2 border-navy-800 bg-slate-300' },
                h('div', { class: 'bg-white px-3 py-2' },
                  h('div', { class: 'field-label' }, 'Projected tax savings vs. baseline'),
                  h('div', {
                    class: 'num mt-0.5 text-[20px] font-bold leading-none ' +
                      (comparison.taxSavings >= 0 ? 'text-emerald-700' : 'text-rose-700')
                  }, fmtSigned(comparison.taxSavings))),
                h('div', { class: 'bg-white px-3 py-2' },
                  h('div', { class: 'field-label' }, 'Marginal rate change'),
                  h('div', { class: 'num mt-0.5 text-[20px] font-bold leading-none text-navy-950' },
                    fmtPct(comparison.marginalRateChange, { sign: true }))))),
            h('div', { class: 'panel mt-3' },
              h('div', { class: 'panel-header' },
                h('span', {}, 'What changed — input diff'),
                h('span', { class: 'font-normal normal-case tracking-normal text-slate-500' },
                  diffs.length + ' differing group' + (diffs.length === 1 ? '' : 's'))),
              diffs.length === 0
                ? h('p', { class: 'px-3 py-3 text-[12.5px] italic text-slate-500' }, 'Selected scenarios have identical input summaries.')
                : h('table', { class: 'w-full border-collapse text-[12.5px]' },
                  h('thead', {},
                    h('tr', { class: 'bg-slate-100 text-[10.5px] uppercase tracking-wide text-slate-500' },
                      h('th', { scope: 'col', class: 'px-3 py-1.5 text-left font-semibold' }, 'Input group'),
                      selected.map(function (s) {
                        return h('th', { scope: 'col', class: 'border-l border-slate-200 px-3 py-1.5 text-right font-semibold' }, s.name);
                      }))),
                  h('tbody', {}, diffs.map(function (row) {
                    return h('tr', { class: 'border-b border-slate-200' },
                      h('td', { class: 'px-3 py-[4px] text-slate-700' }, row.label),
                      row.values.map(function (value) {
                        return h('td', { class: 'num border-l border-slate-200 px-3 py-[4px] text-navy-900' }, value);
                      }));
                  }))))
          ]
          : h('p', { class: 'panel px-3 py-4 text-[12.5px] italic text-slate-500' },
            'At least two scenarios are required. Duplicate the active scenario to create an alternative.')
      ]
    });
  }

  /* ---- import modal --------------------------------------------------------------- */
  function importModal() {
    var st = ui.importState;

    function resetFeedback() {
      st.warnings = [];
      st.error = null;
      st.staged = null;
    }

    async function handleFile(file) {
      resetFeedback();
      st.parsing = true;
      render();
      try {
        var parsed = await window.TaxExcel.parseProjectWorkbook(await file.arrayBuffer());
        st.staged = parsed.inputs;
        st.warnings = parsed.warnings;
      } catch (e) {
        st.error = e instanceof Error ? e.message : 'Import failed';
      } finally {
        st.parsing = false;
        render();
      }
    }

    return modalShell({
      title: 'Import',
      subtitle: 'Drop a workbook exported from this planner, or paste a saved project JSON document.',
      size: 'lg',
      onClose: function () { resetFeedback(); setModal(null); },
      footer: [
        h('button', {
          type: 'button', class: 'btn-light',
          onclick: function () { resetToDemo(); setModal(null); }
        }, 'Reset to demo data'),
        h('button', {
          type: 'button', class: 'btn-primary', disabled: st.staged === null,
          onclick: function () {
            if (st.staged) {
              replaceInputs(st.staged);
              resetFeedback();
              setModal(null);
            }
          }
        }, 'Apply imported inputs')
      ],
      children: [
        h('div', { class: 'grid grid-cols-1 gap-3 lg:grid-cols-2' },
          h('section', { class: 'panel self-start' },
            h('div', { class: 'panel-header' }, h('span', {}, 'Excel workbook (.xlsx)')),
            h('div', {
              ondragover: function (e) { e.preventDefault(); if (!st.dragOver) { st.dragOver = true; e.currentTarget.classList.add('border-accent-500', 'bg-sky-50'); } },
              ondragleave: function (e) { st.dragOver = false; e.currentTarget.classList.remove('border-accent-500', 'bg-sky-50'); },
              ondrop: function (e) {
                e.preventDefault();
                st.dragOver = false;
                var file = e.dataTransfer.files.item(0);
                if (file) handleFile(file);
              },
              class: 'm-3 flex flex-col items-center justify-center gap-2 border-2 border-dashed px-4 py-8 text-center transition border-slate-300 bg-slate-50'
            },
              h('p', { class: 'text-[12.5px] text-slate-600' }, 'Drag an ', h('span', { class: 'font-semibold' }, '.xlsx'), ' file here'),
              h('label', { class: 'btn-light cursor-pointer' }, 'Choose file…',
                h('input', {
                  type: 'file',
                  accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  class: 'sr-only',
                  onchange: function (e) {
                    var file = e.target.files ? e.target.files.item(0) : null;
                    if (file) handleFile(file);
                  }
                })),
              h('p', { class: 'text-[11px] text-slate-400' }, 'Parsed in your browser using the same template shape the export produces.'),
              st.parsing ? h('p', { class: 'text-[11.5px] font-semibold text-accent-600' }, 'Parsing workbook…') : null)),
          h('section', { class: 'panel self-start' },
            h('div', { class: 'panel-header' }, h('span', {}, 'Project JSON')),
            h('div', { class: 'p-3' },
              h('label', { for: 'project-json', class: 'field-label mb-1' }, 'Paste a serialized project'),
              h('textarea', {
                id: 'project-json', rows: '9', spellcheck: 'false',
                placeholder: '{"version":2,"name":"…","scenarios":[…]}',
                class: 'input-base h-auto resize-y py-1.5 font-mono text-[11.5px] leading-snug',
                oninput: function (e) { st.jsonText = e.target.value; }
              }, st.jsonText),
              h('button', {
                type: 'button', class: 'btn-light mt-2', disabled: st.jsonText.trim() === '',
                onclick: function () {
                  resetFeedback();
                  try {
                    var project = Engine.parseProject(st.jsonText);
                    st.jsonText = '';
                    loadProject(project);
                    setModal(null);
                  } catch (e) {
                    st.error = e instanceof Error ? e.message : 'Could not parse project JSON';
                    render();
                  }
                }
              }, 'Load project JSON')))),
        st.error
          ? h('p', { role: 'alert', class: 'mt-3 border border-rose-300 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800' }, st.error)
          : null,
        st.staged
          ? h('div', { class: 'mt-3 border border-amber-300 bg-amber-50 px-3 py-2' },
            h('h3', { class: 'text-[11px] font-bold uppercase tracking-[0.08em] text-amber-900' },
              'Parse warnings — review before committing (' + st.warnings.length + ')'),
            st.warnings.length === 0
              ? h('p', { class: 'mt-1 text-[12px] text-amber-900' }, 'No warnings. The workbook parsed cleanly into a complete input set.')
              : h('ul', { class: 'mt-1 list-disc space-y-0.5 pl-4' },
                st.warnings.map(function (w) {
                  return h('li', { class: 'text-[12px] leading-snug text-amber-900' }, w);
                })),
            h('p', { class: 'mt-1.5 border-t border-amber-300 pt-1.5 text-[11.5px] text-amber-900' },
              'Applying will replace the inputs of the active scenario. Use Undo in the header to revert.'))
          : null
      ]
    });
  }

  /* ---- client-notes parser modal --------------------------------------------------- */
  var TRAILING_AMOUNT = /\(?-?\$?\s?[\d,]+(?:\.\d{1,2})?\)?\s*$/;

  function withItemized(inputs, key, amount) {
    var next = Object.assign({}, inputs.itemizedDeductions);
    next[key] = amount;
    return Object.assign({}, inputs, { itemizedDeductions: next });
  }

  var NOTE_RULES = [
    {
      target: 'W-2 wages',
      pattern: /^(w-?2\s+)?(wages|salaries|wages and salaries|compensation)\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, {
          wages: [{
            id: Engine.uuid(), employer: 'Imported from notes', wages: amount, federalWithholding: 0,
            socialSecurityWages: amount, medicareWages: amount, socialSecurityWithheld: 0,
            medicareWithheld: 0, retirementDeferral: 0, hsa: 0
          }].concat(inputs.wages)
        });
      }
    },
    {
      target: 'Federal withholding (other)',
      pattern: /^(federal\s+(income\s+)?(tax\s+)?withh?olding|federal\s+tax\s+withheld)\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, {
          payments: Object.assign({}, inputs.payments, { federalWithholdingOther: amount })
        });
      }
    },
    {
      target: 'Taxable interest',
      pattern: /^(taxable\s+)?interest(\s+income)?\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, {
          interestDividends: [{ id: Engine.uuid(), payer: 'Imported from notes', kind: 'interest', amount: amount, federalWithholding: 0 }]
            .concat(inputs.interestDividends)
        });
      }
    },
    {
      target: 'Tax-exempt interest',
      pattern: /^tax[-\s]?exempt\s+interest\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, {
          interestDividends: [{ id: Engine.uuid(), payer: 'Imported from notes', kind: 'taxExemptInterest', amount: amount, federalWithholding: 0 }]
            .concat(inputs.interestDividends)
        });
      }
    },
    {
      target: 'Qualified dividends',
      pattern: /^qualified\s+dividends?\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, {
          interestDividends: [{ id: Engine.uuid(), payer: 'Imported from notes', kind: 'qualifiedDividend', amount: amount, federalWithholding: 0 }]
            .concat(inputs.interestDividends)
        });
      }
    },
    {
      target: 'Ordinary dividends',
      pattern: /^(ordinary|total)\s+dividends?\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, {
          interestDividends: [{ id: Engine.uuid(), payer: 'Imported from notes', kind: 'ordinaryDividend', amount: amount, federalWithholding: 0 }]
            .concat(inputs.interestDividends)
        });
      }
    },
    {
      target: 'Schedule C net profit',
      pattern: /^(schedule\s*c|business)\s+(net\s+)?(profit|income)\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, {
          businesses: [{
            id: Engine.uuid(), name: 'Imported from notes', grossReceipts: amount, expenses: 0,
            isSSTB: false, w2Wages: 0, unadjustedBasis: 0, materialParticipation: true
          }].concat(inputs.businesses)
        });
      }
    },
    {
      target: 'Rental net income',
      pattern: /^(schedule\s*e\s+)?rental?\s+(net\s+)?(income|profit)\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, {
          rentals: [{
            id: Engine.uuid(), property: 'Imported from notes', rents: amount, expenses: 0, depreciation: 0,
            activelyParticipates: true, isQualifiedTradeOrBusiness: false
          }].concat(inputs.rentals)
        });
      }
    },
    {
      target: 'Long-term capital gain',
      pattern: /^(net\s+)?long[-\s]?term\s+(capital\s+)?gains?\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, {
          capitalGains: [{
            id: Engine.uuid(), description: 'Imported from notes (LTCG)', shortTermGain: 0, longTermGain: amount,
            section1250Gain: 0, collectiblesGain: 0
          }].concat(inputs.capitalGains)
        });
      }
    },
    {
      target: 'Short-term capital gain',
      pattern: /^(net\s+)?short[-\s]?term\s+(capital\s+)?gains?\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, {
          capitalGains: [{
            id: Engine.uuid(), description: 'Imported from notes (STCG)', shortTermGain: amount, longTermGain: 0,
            section1250Gain: 0, collectiblesGain: 0
          }].concat(inputs.capitalGains)
        });
      }
    },
    {
      target: 'Social Security benefits',
      pattern: /^social\s+security(\s+benefits?)?\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, {
          otherIncome: [{
            id: Engine.uuid(), description: 'Imported from notes', amount: amount, kind: 'socialSecurity',
            federalWithholding: 0, isPassive: false
          }].concat(inputs.otherIncome)
        });
      }
    },
    {
      target: 'Retirement distributions',
      pattern: /^(ira|pension|retirement|401\(?k\)?)\s+(distributions?|income|withdrawals?)\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, {
          otherIncome: [{
            id: Engine.uuid(), description: 'Imported from notes', amount: amount, kind: 'retirement',
            federalWithholding: 0, isPassive: false
          }].concat(inputs.otherIncome)
        });
      }
    },
    {
      target: 'State & local income tax',
      pattern: /^state\s+(and|&)?\s*(local\s+)?(income\s+)?tax(es)?\b/i,
      apply: function (inputs, amount) { return withItemized(inputs, 'stateLocalIncomeTax', amount); }
    },
    {
      target: 'Real estate tax',
      pattern: /^(real\s+estate|property)\s+tax(es)?\b/i,
      apply: function (inputs, amount) { return withItemized(inputs, 'realEstateTax', amount); }
    },
    {
      target: 'Mortgage interest',
      pattern: /^(home\s+)?mortgage\s+interest\b/i,
      apply: function (inputs, amount) { return withItemized(inputs, 'mortgageInterest', amount); }
    },
    {
      target: 'Charitable contributions (cash)',
      pattern: /^charitable(\s+(contributions?|gifts?|donations?))?\b/i,
      apply: function (inputs, amount) { return withItemized(inputs, 'charitableCash', amount); }
    },
    {
      target: 'Medical expenses',
      pattern: /^(unreimbursed\s+)?medical(\s+(and|&)\s+dental)?(\s+expenses?)?\b/i,
      apply: function (inputs, amount) { return withItemized(inputs, 'medical', amount); }
    },
    {
      target: 'Investment interest expense',
      pattern: /^investment\s+interest(\s+expense)?\b/i,
      apply: function (inputs, amount) { return withItemized(inputs, 'investmentInterest', amount); }
    },
    {
      target: 'Estimated tax payments (total, split evenly)',
      pattern: /^(total\s+)?estimated(\s+tax)?\s+payments?\b/i,
      apply: function (inputs, amount) {
        var quarterly = amount / 4;
        return Object.assign({}, inputs, {
          payments: Object.assign({}, inputs.payments, { estimatedPayments: [quarterly, quarterly, quarterly, quarterly] })
        });
      }
    },
    {
      target: 'Prior-year total tax',
      pattern: /^prior[-\s]?year\s+(total\s+)?tax\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, { payments: Object.assign({}, inputs.payments, { priorYearTax: amount }) });
      }
    },
    {
      target: 'Prior-year AGI',
      pattern: /^prior[-\s]?year\s+agi\b/i,
      apply: function (inputs, amount) {
        return Object.assign({}, inputs, { payments: Object.assign({}, inputs.payments, { priorYearAgi: amount }) });
      }
    }
  ];

  var FILING_STATUS_PATTERNS = [
    [/married\s+filing\s+jointly|\bmfj\b/i, 'mfj'],
    [/married\s+filing\s+separately|\bmfs\b/i, 'mfs'],
    [/head\s+of\s+household|\bhoh\b/i, 'hoh'],
    [/qualifying\s+surviving\s+spouse|\bqss\b/i, 'qss'],
    [/\bsingle\b/i, 'single']
  ];

  function parseClientNotes(text) {
    var matched = [];
    var skipped = [];
    var appliers = [];
    var filingStatus = null;
    for (var rawLine of text.split(/\r?\n/)) {
      var lineText = rawLine.trim();
      if (lineText === '') continue;
      if (/filing\s+status/i.test(lineText)) {
        for (var pair of FILING_STATUS_PATTERNS) {
          if (pair[0].test(lineText)) {
            filingStatus = pair[1];
            matched.push({ sourceLine: lineText, target: 'Filing status', amount: 0 });
            break;
          }
        }
        if (filingStatus !== null) continue;
      }
      var label = lineText.replace(TRAILING_AMOUNT, '').replace(/[:.…\-–—\s]+$/, '').trim();
      var amountMatch = TRAILING_AMOUNT.exec(lineText);
      var amountText = amountMatch ? amountMatch[0] : null;
      if (!amountText) { skipped.push(lineText); continue; }
      var amount = parseAmount(amountText);
      var rule = NOTE_RULES.find(function (r) { return r.pattern.test(label); });
      if (!rule) { skipped.push(lineText); continue; }
      matched.push({ sourceLine: lineText, target: rule.target, amount: amount });
      (function (r, a) { appliers.push(function (inputs) { return r.apply(inputs, a); }); })(rule, amount);
    }
    var fs = filingStatus;
    return {
      matched: matched,
      skipped: skipped,
      filingStatus: filingStatus,
      apply: function (inputs) {
        var next = appliers.reduce(function (acc, fn) { return fn(acc); }, inputs);
        if (fs !== null) {
          next = Object.assign({}, next, { profile: Object.assign({}, next.profile, { filingStatus: fs }) });
        }
        return next;
      }
    };
  }

  var SAMPLE_NOTES = 'Filing status: married filing jointly\nWages: 285,000\nFederal tax withheld: 52,400\nQualified dividends 40,000\nTaxable interest $6,250\nLong-term capital gain 180,000\nSchedule C net profit 248,000\nMortgage interest: 38,500\nState and local income taxes 61,000\nCharitable contributions 45,000\nEstimated tax payments 60,000\nClient wants to discuss a Roth conversion in Q4';

  function notesModal() {
    var parsed = parseClientNotes(ui.notesText);

    function refreshPreview() {
      var container = document.getElementById('notes-preview');
      var footerButton = document.getElementById('notes-apply');
      if (container) {
        var next = notesPreview(parseClientNotes(ui.notesText));
        container.replaceWith(next);
      }
      if (footerButton) {
        var count = parseClientNotes(ui.notesText).matched.length;
        footerButton.disabled = count === 0;
        footerButton.textContent = 'Apply ' + count + ' match' + (count === 1 ? '' : 'es');
      }
    }

    function notesPreview(parseResult) {
      return h('div', { id: 'notes-preview', class: 'space-y-3' },
        h('section', { class: 'panel' },
          h('div', { class: 'panel-header' },
            h('span', {}, 'Matched'),
            h('span', { class: 'num font-normal normal-case tracking-normal text-slate-600' }, String(parseResult.matched.length))),
          parseResult.matched.length === 0
            ? h('p', { class: 'px-3 py-2 text-[12px] italic text-slate-500' }, 'Nothing matched yet.')
            : h('ul', { class: 'divide-y divide-slate-100' },
              parseResult.matched.map(function (m) {
                return h('li', { class: 'flex items-baseline justify-between gap-3 px-3 py-[4px]' },
                  h('span', { class: 'min-w-0 flex-1 truncate text-[12px] text-slate-700' }, m.target),
                  h('span', { class: 'num shrink-0 text-[12px] text-navy-900' },
                    m.target === 'Filing status' ? '—' : fmtUSD(m.amount)));
              }))),
        h('section', { class: 'panel' },
          h('div', { class: 'panel-header' },
            h('span', {}, 'Skipped — no recognized label'),
            h('span', { class: 'num font-normal normal-case tracking-normal text-slate-600' }, String(parseResult.skipped.length))),
          parseResult.skipped.length === 0
            ? h('p', { class: 'px-3 py-2 text-[12px] italic text-slate-500' }, 'Nothing skipped.')
            : h('ul', { class: 'thin-scroll max-h-[220px] divide-y divide-slate-100 overflow-y-auto' },
              parseResult.skipped.map(function (lineText) {
                return h('li', { class: 'truncate px-3 py-[4px] text-[11.5px] text-slate-500' }, lineText);
              }))));
    }

    return modalShell({
      title: 'Parse Client Notes',
      subtitle: 'Deterministic label matching only — no AI, no network call. Every mapping below is produced by a fixed regular expression.',
      size: 'lg',
      onClose: function () { setModal(null); },
      footer: [
        h('button', {
          type: 'button', class: 'btn-light',
          onclick: function () {
            ui.notesText = SAMPLE_NOTES;
            var textarea = document.getElementById('client-notes');
            if (textarea) textarea.value = SAMPLE_NOTES;
            refreshPreview();
          }
        }, 'Load sample notes'),
        h('button', {
          type: 'button', id: 'notes-apply', class: 'btn-primary', disabled: parsed.matched.length === 0,
          onclick: function () {
            var current = parseClientNotes(ui.notesText);
            if (current.matched.length === 0) return;
            ui.notesText = '';
            updateInputs(function (inputs) { return current.apply(inputs); });
            setModal(null);
          }
        }, 'Apply ' + parsed.matched.length + ' match' + (parsed.matched.length === 1 ? '' : 'es'))
      ],
      children: [
        h('div', { class: 'grid grid-cols-1 gap-3 lg:grid-cols-2' },
          h('section', { class: 'panel self-start' },
            h('div', { class: 'panel-header' }, h('span', {}, 'Paste notes or a 1040 summary')),
            h('div', { class: 'p-3' },
              h('label', { for: 'client-notes', class: 'field-label mb-1' }, 'One item per line, label followed by an amount'),
              h('textarea', {
                id: 'client-notes', rows: '16', spellcheck: 'false',
                placeholder: 'Wages: 285,000\nQualified dividends 40,000',
                class: 'input-base h-auto resize-y py-1.5 font-mono text-[12px] leading-snug',
                oninput: function (e) { ui.notesText = e.target.value; refreshPreview(); }
              }, ui.notesText))),
          notesPreview(parsed)),
        h('p', { class: 'mt-3 border border-slate-300 bg-slate-50 px-3 py-2 text-[11.5px] leading-snug text-slate-600' },
          h('strong', { class: 'text-navy-900' }, 'How this works.'),
          ' Each line is stripped of a trailing amount, and the remaining label is tested against a fixed list of ' +
          NOTE_RULES.length + ' regular expressions. There is no language model, no inference and no outbound request; anything not matched verbatim is reported as skipped so you can enter it manually.')
      ]
    });
  }

  /* ---- overlays ------------------------------------------------------------------- */
  function renderOverlays() {
    var overlays = [];
    switch (state.openDrawer) {
      case 'wages': overlays.push(wagesDrawer()); break;
      case 'interestdividends': overlays.push(interestDividendsDrawer()); break;
      case 'schedulec': overlays.push(businessDrawer()); break;
      case 'schedulee': overlays.push(rentalDrawer()); break;
      case 'capitalgains': overlays.push(capitalGainsDrawer()); break;
      case 'otherincome': overlays.push(otherIncomeDrawer()); break;
      case 'planning': overlays.push(planningDrawer()); break;
      case 'itemized': overlays.push(itemizedDrawer()); break;
      case 'payments': overlays.push(paymentsDrawer()); break;
      case 'calcdetail': overlays.push(calcDetailDrawer()); break;
    }
    switch (state.openModal) {
      case 'compare': overlays.push(compareModal()); break;
      case 'import': overlays.push(importModal()); break;
      case 'textprompt': overlays.push(notesModal()); break;
    }
    return overlays;
  }

  /* ---- root render ---------------------------------------------------------------- */
  function render() {
    var root = document.getElementById('app');
    var drawerBody = root.querySelector('.drawer-body');
    var drawerScroll = drawerBody ? drawerBody.scrollTop : 0;
    var modalBody = root.querySelector('.modal-body');
    var modalScroll = modalBody ? modalBody.scrollTop : 0;
    var focusedId = document.activeElement && document.activeElement.id ? document.activeElement.id : null;

    root.textContent = '';
    appendChild(root, [
      renderHeader(),
      renderTabs(),
      h('main', {
        id: 'panel-' + state.activeTab, role: 'tabpanel',
        'aria-labelledby': 'tab-' + state.activeTab,
        class: 'mx-auto max-w-[1600px]'
      },
        state.activeTab === 'planner' ? renderPlanner() : null,
        state.activeTab === 'report' ? renderReport() : null,
        state.activeTab === 'scenarios' ? renderScenarios() : null,
        state.activeTab === 'coverage' ? renderCoverage() : null),
      renderOverlays(),
      h('footer', { class: 'no-print border-t border-slate-300 bg-white px-4 py-2 text-[11px] text-slate-500' },
        'Tax year ' + yearMeta().year + ' planning estimates · ' + yearMeta().basis +
        ' · not a filed return and not tax advice.')
    ]);

    var newDrawerBody = root.querySelector('.drawer-body');
    if (newDrawerBody) newDrawerBody.scrollTop = drawerScroll;
    var newModalBody = root.querySelector('.modal-body');
    if (newModalBody) newModalBody.scrollTop = modalScroll;
    if (focusedId) {
      var toFocus = document.getElementById(focusedId);
      if (toFocus && toFocus !== document.activeElement) {
        try { toFocus.focus({ preventScroll: true }); } catch (e) { /* noop */ }
      }
    }
    document.body.style.overflow = (state.openDrawer || state.openModal) ? 'hidden' : '';
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (state.openModal) { setModal(null); return; }
    if (state.openDrawer) setDrawer(null);
  });

  /* ---- explicit scenario import --------------------------------------------
     THE PLANNER IS STANDALONE. It is not driven by, and does not read from,
     any client profile or host application. It opens on its own project,
     computes with its own engine, and saves to its own storage, whether it is
     loaded at /planner/ directly or shown on a tab of a larger application.
     There is no automatic bridge: nothing pulls a client's return in when the
     planner opens, and no earlier step is required before it can be used.

     What follows is the OPT-IN path for the one case where an outside
     scenario should reach the planner — a preparer deliberately choosing to
     import a return as a starting point. It runs only when something calls
     `window.TaxPlanner.importScenarios(...)` from this same document; there
     is no listener, no message channel, and nothing invokes it on load.

     Imported scenarios are tagged with `importedId`. A later import replaces
     only those, so anything built inside the planner survives untouched.
     ------------------------------------------------------------------------ */
  function scenarioSummary(scenario) {
    var result = computeInputs(scenario.inputs);
    return {
      id: scenario.id,
      importedId: scenario.hostId || null,
      name: scenario.name,
      description: scenario.description || '',
      isBaseline: !!scenario.isBaseline,
      isActive: scenario.id === state.project.activeScenarioId,
      totalIncome: result.totalIncome,
      agi: result.agi,
      taxableIncome: result.taxableIncome,
      deductionUsed: result.deductionUsed,
      qbiDeduction: result.qbiDeduction,
      seTax: result.seTax,
      totalTax: result.totalTax,
      effectiveRate: result.effectiveRate,
      marginalRate: result.marginalRate,
      balanceDue: result.balanceDue,
      refund: result.refund
    };
  }

  function projectSummaries() {
    return state.project.scenarios.map(scenarioSummary);
  }

  /* Replace every previously imported scenario with `list`, keeping the
     planner's own scenarios in place. Returns the resulting summaries.

     Only a deliberate call reaches here — importing a return as a starting
     point. Nothing invokes it when the planner loads. */
  function importScenarios(list, opts) {
    opts = opts || {};
    if (!Array.isArray(list)) throw new Error('importScenarios expects an array.');
    var prev = state.project;
    /* On a first import into untouched demo data, the demo scenarios step
       aside so the tab opens on what was imported. Once the user has saved or
       edited anything in the planner, their scenarios are kept and only
       previously imported ones are refreshed. */
    var native = state.bootedFromDemo
      ? []
      : prev.scenarios.filter(function (s) { return !s.hostId; });
    var imported = list.map(function (entry, i) {
      if (!entry || typeof entry !== 'object') throw new Error('Scenario ' + i + ' is not an object.');
      return Engine.createScenario(
        String(entry.name || 'Scenario ' + (i + 1)),
        Engine.parseInputs(entry.inputs),
        {
          description: entry.description != null ? String(entry.description) : '',
          hostId: entry.hostId != null ? entry.hostId : entry.id,
          /* The first imported scenario is the comparison baseline whenever the
             planner has nothing of its own to anchor against. */
          isBaseline: i === 0 && native.length === 0
        }
      );
    });
    var scenarios = native.concat(imported);
    if (!scenarios.length) return projectSummaries();

    /* Keep the active scenario if it survived; otherwise prefer the first
       import, so the planner opens on what was just brought in. */
    var activeId = scenarios.some(function (s) { return s.id === prev.activeScenarioId; })
      ? prev.activeScenarioId
      : (imported[0] || scenarios[0]).id;
    if (opts.activateFirstImport && imported[0]) activeId = imported[0].id;

    state.project = Object.assign({}, prev, {
      scenarios: scenarios,
      activeScenarioId: activeId,
      updatedAt: new Date().toISOString()
    });
    persist(state.project);
    state.result = computeForProject(state.project);
    pushHistory(prev);
    state.lastSavedAt = state.project.updatedAt;
    /* Pre-select the imported set for the comparison modal (it takes 2–4). */
    if (imported.length >= 2) state.compareSelection = imported.slice(0, 4).map(function (s) { return s.id; });
    if (opts.tab) state.activeTab = opts.tab;
    render();
    return projectSummaries();
  }

  /* The planner's own API, for a deliberate import and for tests.

     There is deliberately NO postMessage listener here. An earlier version
     accepted scenarios from any frame that sent a message naming the bridge,
     which nothing in this application ever did — an unauthenticated way in
     for a surface with no users. Importing a return is a decision a preparer
     makes inside the planner, so it is a call made from this document, not a
     message accepted from another one. */
  window.TaxPlanner = {
    version: 2,
    /* Explicitly import scenarios as a starting point. Never called on load. */
    importScenarios: importScenarios,
    summaries: projectSummaries,
    setTab: function (tab) {
      if (['planner', 'report', 'scenarios', 'coverage'].indexOf(tab) === -1) return;
      setTab(tab);
    },
    activeTab: function () { return state.activeTab; },
    scenarioCount: function () { return state.project.scenarios.length; },
    taxYear: function () { return projectYear(); }
  };

  hydrate();
  render();
})();
