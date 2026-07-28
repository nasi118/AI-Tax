/* ==== 11-styles ==== */
const REPORT_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f6fa;color:#18181b;font-size:13px;font-variant-numeric:tabular-nums;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp{max-width:820px;margin:22px auto;background:#fff;padding:38px 40px;border-radius:10px;border:1px solid #e4e7ed}
.rp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:16px;border-bottom:2px solid #18181b;margin-bottom:22px}
.rp-eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;color:#4338ca;margin-bottom:5px}
.rp-head h1{font-size:20px;font-weight:700;line-height:1.2}
.rp-sub{margin-top:4px;font-size:11.5px;color:#71717a}
.rp-meta{text-align:right;font-size:11px;color:#71717a;line-height:1.7;white-space:nowrap}
.rp-sec{margin-bottom:24px}
.rp-sec h2{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:#52525b;margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid #e4e7ed}
.rp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.rp-kpis>div{border:1px solid #e4e7ed;border-radius:8px;padding:9px 10px;background:#fafafa}
.rp-kpis span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#71717a;font-weight:600;margin-bottom:3px}
.rp-kpis strong{font-size:15px;font-weight:700}
.rp-kpis .hi{background:#18181b;border-color:#18181b}
.rp-kpis .hi span{color:#a1a1aa}.rp-kpis .hi strong{color:#fff}
.rp-tbl{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px}
.rp-tbl th{text-align:left;padding:7px 9px;font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;color:#71717a;font-weight:600;border-bottom:1px solid #e4e7ed}
.rp-tbl th.num,.rp-tbl td.num{text-align:right;font-variant-numeric:tabular-nums}
.rp-tbl td{padding:6px 9px;border-bottom:1px solid #f5f5f7;vertical-align:top}
.rp-tbl td.sm{font-size:10.5px;color:#71717a}
.rp-tbl tr.tot td{font-weight:700;border-top:1px solid #18181b;border-bottom:none;background:#fafafa}
.rp-tbl tr.sec td{background:#fafafa;font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;font-weight:600;color:#52525b}
.rp-tbl tr.hl td{background:#eef2ff;font-weight:600}
.rp-note{font-size:11.5px;line-height:1.6;color:#71717a;margin:10px 0 0}
.rp-find{border-left:2px solid #16a34a;padding:2px 0 2px 11px;margin-top:11px;page-break-inside:avoid}
.rp-find-h{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.rp-find-h>span:first-child{font-size:12px;font-weight:600}
.rp-find-amt{font-size:10.5px;font-weight:700;color:#16a34a;background:#f0fdf4;padding:1px 7px;border-radius:20px;white-space:nowrap}
.rp-find-b{font-size:11.5px;line-height:1.55;color:#71717a;margin-top:4px}
.rp-find-a{font-size:11.5px;line-height:1.5;margin-top:4px;color:#18181b}
.rp-find-r{font-size:10px;color:#a1a1aa;margin-top:4px;font-style:italic}
.rp-recs{margin:0;padding-left:17px}
.rp-recs li{font-size:11.5px;line-height:1.6;color:#71717a;margin-bottom:7px}
.rp-recs strong{color:#18181b}
.rp-disc{margin-top:24px;padding-top:13px;border-top:1px solid #e4e7ed;page-break-inside:avoid}
.rp-disc h3{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#71717a;margin:0 0 6px}
.rp-disc p{font-size:10.5px;line-height:1.6;color:#71717a;margin:0 0 6px}
.rp-sig{font-style:italic;color:#a1a1aa}
@page{margin:14mm}
@media print{body{background:#fff}.rp{margin:0;padding:0;border:none;max-width:none}h2{page-break-after:avoid}}
`;
const APP_CSS = `
:root{
--ink:#18181b;--ink2:#3f3f46;--muted:#71717a;--muted2:#a1a1aa;
--paper:#f5f6f9;--card:#fff;--line:#e4e7ed;--line2:#f0f1f4;--hdr:#fafafb;--hover:#f7f8fd;
--indigo:#4338ca;--indigo-bg:#eef2ff;--indigo-line:#c7d2fe;
--green:#15803d;--green-bg:#f0fdf4;--green-line:#bbf7d0;
--amber:#b45309;--amber-bg:#fffbeb;--amber-line:#fde68a;
--red:#b91c1c;--red-bg:#fef2f2;--red-line:#fecaca;
--slate:#475569;--slate-bg:#f1f5f9;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  background:var(--paper);color:var(--ink);font-size:13px;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
button,input,select{font-family:inherit;font-size:inherit;color:inherit}
button{cursor:pointer;border:none;background:none}

/* ---------- shell ---------- */
.tp-shell{display:grid;grid-template-columns:236px 1fr;min-height:100vh;align-items:start}
.tp-side{position:sticky;top:0;height:100vh;background:#fff;border-right:1px solid var(--line);
  display:flex;flex-direction:column;gap:16px;padding:16px 12px;overflow-y:auto}
.tp-brand{display:flex;align-items:center;gap:10px;padding:0 4px}
.tp-mark{width:34px;height:34px;background:var(--indigo);color:#fff;border-radius:9px;display:grid;place-items:center;font-size:18px;font-weight:700;flex-shrink:0}
.tp-brand h1{font-size:14.5px;font-weight:700;letter-spacing:-.01em}
.tp-brand p{font-size:10.5px;color:var(--muted);margin-top:1px}
.tp-nav{display:flex;flex-direction:column;gap:2px}
.tp-navitem{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:7px;
  color:var(--ink2);font-size:12.5px;font-weight:500;text-align:left;transition:background .1s}
.tp-navitem:hover{background:var(--hover);color:var(--ink)}
.tp-navitem.on{background:var(--indigo-bg);color:var(--indigo);font-weight:600}
.tp-side-controls{display:flex;flex-direction:column;gap:10px;padding-top:14px;border-top:1px solid var(--line2);margin-top:auto}
.tp-sidefield{display:flex;flex-direction:column;gap:5px}
.tp-sidefield>span{font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700}
.tp-sidefield select{width:100%;border:1px solid var(--line);border-radius:7px;padding:7px 9px;font-size:12.5px;background:#fff}
.tp-sidefield select:focus{outline:none;border-color:var(--indigo)}
.tp-side-foot{display:flex;flex-direction:column;gap:8px;padding-top:12px;border-top:1px solid var(--line2)}
.tp-sidestat{display:flex;flex-direction:column;gap:1px}
.tp-sidestat span{font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700}
.tp-sidestat strong{font-size:12.5px;font-weight:600}
.tp-sidestat strong.green{color:var(--green);font-size:16px;font-weight:700}
.tp-main{padding:16px 20px 60px;max-width:1240px;min-width:0}
.tp-topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;flex-wrap:wrap}
.tp-topbar h2{font-size:18px;font-weight:700;letter-spacing:-.01em}
.tp-topbar p{font-size:11.5px;color:var(--muted);margin-top:3px;max-width:760px;line-height:1.5}
.tp-stack{display:flex;flex-direction:column;gap:14px}
.tp-2col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:1000px){.tp-2col{grid-template-columns:1fr}}
@media (max-width:900px){.tp-shell{grid-template-columns:1fr}.tp-side{position:static;height:auto}.tp-side-controls{margin-top:0}}

/* ---------- cards ---------- */
.tp-card{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.tp-card-head{display:flex;align-items:center;gap:8px;padding:9px 13px;border-bottom:1px solid var(--line2);background:var(--hdr)}
.tp-card-head h3{font-size:10.5px;font-weight:700;color:var(--ink2);text-transform:uppercase;letter-spacing:.5px}
.tp-card-sub{font-size:10.5px;font-weight:700;color:var(--slate);background:var(--slate-bg);padding:1px 8px;border-radius:20px}
.tp-card-right{margin-left:auto;display:flex;gap:8px;align-items:center}
.tp-card-body{padding:13px}
.tp-minihead{font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;color:var(--muted);margin:12px 0 7px}
.tp-minihead:first-child{margin-top:0}
.tp-splitgrid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media (max-width:900px){.tp-splitgrid{grid-template-columns:1fr}}
.tp-groupdef{font-size:11px;color:var(--muted);line-height:1.5;padding:0 0 10px;font-style:italic}

/* ---------- notes ---------- */
.tp-note{display:flex;gap:8px;align-items:flex-start;font-size:11.5px;line-height:1.55;color:var(--ink2);
  background:var(--indigo-bg);border:1px solid var(--indigo-line);border-radius:8px;padding:9px 11px;margin-top:10px}
.tp-note>svg{color:var(--indigo);margin-top:1px}
.tp-note.warn{background:var(--amber-bg);border-color:var(--amber-line)}
.tp-note.warn>svg{color:var(--amber)}
.tp-note.bad{background:var(--red-bg);border-color:var(--red-line)}
.tp-note.bad>svg{color:var(--red)}
.tp-note.ok{background:var(--green-bg);border-color:var(--green-line)}
.tp-note.ok>svg{color:var(--green)}
.tp-note strong{color:var(--ink);font-weight:700}

/* ---------- kpis ---------- */
.tp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
.tp-kpi{background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px;display:flex;flex-direction:column;gap:2px}
.tp-kpi>span{font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700}
.tp-kpi strong{font-size:20px;font-weight:700;letter-spacing:-.02em;line-height:1.15}
.tp-kpi em{font-style:normal;font-size:10.5px;color:var(--muted2)}
.tp-kpi.good{border-color:var(--green-line);background:var(--green-bg)}
.tp-kpi.good strong{color:var(--green)}
.tp-kpi.warn{border-color:var(--amber-line);background:var(--amber-bg)}
.tp-kpi.warn strong{color:var(--amber)}

/* ---------- tables ---------- */
.tp-tblwrap{overflow-x:auto}
.tp-tbl{width:100%;border-collapse:collapse;font-size:12px}
.tp-tbl th{text-align:left;padding:7px 9px;font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;
  color:var(--muted);font-weight:700;border-bottom:1px solid var(--line);white-space:nowrap}
.tp-tbl td{padding:7px 9px;border-bottom:1px solid var(--line2);vertical-align:top}
.tp-tbl th.num,.tp-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tp-tbl th.ctr,.tp-tbl td.ctr{text-align:center}
.tp-tbl td.strong{font-weight:700}
.tp-tbl td.sm{font-size:10.5px;color:var(--muted);line-height:1.45}
.tp-tbl td.ind{padding-left:22px}
.tp-tbl td.ind2{padding-left:38px;font-size:11px}
.tp-tbl tr.tot td{font-weight:700;border-top:1px solid var(--ink2);border-bottom:none;background:var(--hdr)}
.tp-tbl tr.grand td{font-weight:700;background:var(--ink);color:#fff;border:none;font-size:13.5px}
.tp-tbl tr.sec td{background:var(--hdr);font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;font-weight:700;color:var(--ink2)}
.tp-tbl tr.sep td{border-top:1px solid var(--line)}
.tp-tbl tr.muted td{color:var(--muted)}
.tp-tbl tr.best{background:var(--green-bg)}
.tp-tbl tr.best td:first-child{font-weight:600}
.tp-tbl tr.sel{background:var(--indigo-bg)}
.tp-tbl tr.bad td{color:var(--red)}
.tp-tbl tbody tr:hover td{background:var(--hover)}
.tp-tbl tr.grand:hover td{background:var(--ink)}
.tp-tbl td em{font-style:italic;font-size:10.5px;color:var(--muted2);margin-left:7px;font-weight:400}
.tp-tbl td em.tp-rownote{display:block;font-style:normal;font-size:10.5px;color:var(--muted);margin:2px 0 0;line-height:1.45;font-weight:400}
.tp-tbl td em.tp-cite{display:block;font-style:italic;font-size:10px;color:var(--muted2);margin-top:3px}
.tp-tbl td.up{color:var(--green)}.tp-tbl td.down{color:var(--red)}
.tp-tbl.compare td{vertical-align:middle}
.tp-tbl.qbi td{padding:4px 6px;vertical-align:middle}
.tp-tbl.magi td{vertical-align:middle}
.tp-empty{text-align:center;color:var(--muted);padding:18px;font-size:12px}

/* ---------- inputs ---------- */
.tp-money,.tp-txt{border:1px solid var(--line);border-radius:7px;padding:7px 9px;font-size:12.5px;background:#fff;width:100%;min-width:0}
.tp-money{text-align:right;color:var(--indigo);font-weight:600;font-variant-numeric:tabular-nums}
.tp-money:focus,.tp-txt:focus{outline:none;border-color:var(--indigo);box-shadow:0 0 0 3px rgba(67,56,202,.09)}
.tp-money:disabled{background:var(--line2);color:var(--muted2)}
.tp-txt.big{font-size:14px;font-weight:600}
.tp-field{display:flex;flex-direction:column;gap:4px}
.tp-field>span{font-size:11px;color:var(--ink2);font-weight:500;display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.tp-field>span em{font-style:normal;color:var(--muted2);font-size:10px}
.tp-static{border:1px solid var(--line2);background:var(--hdr);border-radius:7px;padding:7px 9px;font-size:12.5px;font-weight:600}
.tp-grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 14px;margin-bottom:12px}
.tp-search{width:100%;border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:13px;background:#fff}
.tp-search:focus{outline:none;border-color:var(--indigo)}
.tp-seg{display:inline-flex;border:1px solid var(--line);border-radius:7px;overflow:hidden;background:#fff}
.tp-seg button{padding:7px 13px;font-size:12px;font-weight:500;color:var(--ink2);border-right:1px solid var(--line)}
.tp-seg.sm button{padding:6px 11px;font-size:11.5px}
.tp-seg button:last-child{border-right:none}
.tp-seg button.on{background:var(--indigo);color:#fff;font-weight:600}
.tp-check{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;color:var(--ink2);font-weight:500;cursor:pointer;white-space:nowrap}
.tp-check input,.tp-tbl input[type=checkbox]{width:15px;height:15px;accent-color:var(--indigo);cursor:pointer}
.tp-inline{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.tp-btn{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;border-radius:7px;padding:8px 13px}
.tp-btn.solid{background:var(--indigo);color:#fff}
.tp-btn.solid:hover{background:#3730a3}
.tp-btn.ghost{border:1px solid var(--line);color:var(--ink2);background:#fff}
.tp-btn.ghost:hover{background:var(--hover);color:var(--ink)}
.tp-btn.sm{padding:5px 10px;font-size:11px}
.tp-addbtn{display:inline-flex;align-items:center;gap:6px;border:1px dashed var(--line);border-radius:7px;
  padding:8px 13px;font-size:12px;font-weight:500;color:var(--ink2);background:#fff;margin-top:8px}
.tp-addbtn:hover{border-color:var(--indigo);color:var(--indigo);background:var(--hover)}
.tp-addbtn.sm{padding:6px 10px;font-size:11.5px;align-self:flex-start}
.tp-iconbtn{color:var(--muted2);padding:5px;border-radius:6px;display:grid;place-items:center}
.tp-iconbtn:hover{background:var(--red-bg);color:var(--red)}
.tp-mini{font-size:11px;font-weight:600;padding:5px 11px;border-radius:20px;border:1px solid var(--line);color:var(--ink2);background:#fff;white-space:nowrap}
.tp-mini:hover{border-color:var(--indigo);color:var(--indigo)}
.tp-mini.on{background:var(--indigo);border-color:var(--indigo);color:#fff}
.tp-mini-sel{border:1px solid var(--line);border-radius:6px;padding:4px 6px;font-size:11.5px;width:100%;background:#fff}
.tp-selector{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px}
.tp-sel{display:flex;flex-direction:column;gap:4px}
.tp-sel span{font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700}
.tp-sel select{border:1px solid var(--line);border-radius:7px;padding:7px 10px;font-size:12.5px;background:#fff;min-width:210px}
.tp-sel select:focus{outline:none;border-color:var(--indigo)}
.tp-sel.compact select{min-width:180px;padding:6px 9px;font-size:12px}
.tp-linelist{display:flex;flex-direction:column;gap:6px}
.tp-linerow{display:grid;grid-template-columns:1fr 140px 30px;gap:8px;align-items:center}

/* ---------- pills, tags ---------- */
.tp-pill{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap}
.tp-pill.ok{color:var(--green);background:var(--green-bg)}
.tp-pill.warn{color:var(--amber);background:var(--amber-bg)}
.tp-pill.bad{color:var(--red);background:var(--red-bg)}
.tp-tag{display:inline-block;font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--slate-bg);color:var(--slate);margin-left:6px;white-space:nowrap}
.tp-tag.green{background:var(--green-bg);color:var(--green)}
.tp-tag.amber{background:var(--amber-bg);color:var(--amber)}
.tp-tag.red{background:var(--red-bg);color:var(--red)}
.tp-save{font-size:10.5px;font-weight:700;color:var(--green);background:var(--green-bg);padding:2px 9px;border-radius:20px;white-space:nowrap}
.tp-save.neutral{background:var(--slate-bg);color:var(--slate)}

/* ---------- range bar ---------- */
.tp-rangebar{position:relative;height:7px;background:var(--line2);border-radius:20px;overflow:visible;min-width:100px}
.tp-rb-fill{height:100%;border-radius:20px}
.tp-rb-fill.ok{background:var(--green)}
.tp-rb-fill.warn{background:#f59e0b}
.tp-rb-fill.bad{background:var(--red)}
.tp-rb-mark{position:absolute;top:-3px;width:2px;height:13px;background:var(--ink);border-radius:2px;transform:translateX(-1px)}
.tp-rb-lab{position:absolute;top:10px;left:0;font-size:9.5px;color:var(--muted)}
.tp-rangebar.hard{overflow:hidden}

/* ---------- zone boxes ---------- */
.tp-zone{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media (max-width:840px){.tp-zone{grid-template-columns:1fr}}
.tp-zonebox{border:1px solid var(--line);border-radius:9px;padding:11px 12px;background:var(--hdr);opacity:.6}
.tp-zonebox b{display:block;font-size:12px;font-weight:700;margin-bottom:4px}
.tp-zonebox span{display:block;font-size:11px;color:var(--muted);line-height:1.5}
.tp-zonebox i{display:block;font-style:normal;font-size:10.5px;color:var(--muted2);margin-top:6px;font-weight:600}
.tp-zonebox.on{opacity:1;background:#fff;border-width:2px}
.tp-zonebox.on.ok{border-color:var(--green);background:var(--green-bg)}
.tp-zonebox.on.warn{border-color:#f59e0b;background:var(--amber-bg)}
.tp-zonebox.on.bad{border-color:var(--red);background:var(--red-bg)}

/* ---------- callout / refbox ---------- */
.tp-callout{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;
  background:var(--indigo-bg);border:1px solid var(--indigo-line);border-radius:9px;padding:12px 14px;margin-top:12px}
.tp-callout>div{display:flex;flex-direction:column;gap:2px}
.tp-callout span{font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--indigo);font-weight:700}
.tp-callout strong{font-size:18px;font-weight:700}
.tp-callout strong.green{color:var(--green)}
.tp-callout p{grid-column:1/-1;font-size:11.5px;color:var(--ink2);line-height:1.55;margin-top:2px}
.tp-refbox{margin-top:14px;padding-top:12px;border-top:1px solid var(--line2)}
.tp-refgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:7px 16px}
.tp-refgrid>div{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:3px 0;border-bottom:1px solid var(--line2)}
.tp-refgrid span{color:var(--muted)}
.tp-refgrid b{font-weight:700}
.tp-refgrid b.green{color:var(--green)}
.tp-subline{display:flex;justify-content:space-between;gap:12px;padding:7px 11px;background:var(--hdr);border-radius:7px;font-size:11.5px;font-weight:600;margin-top:6px}
.tp-subline.warn{background:var(--amber-bg);color:var(--amber)}
.tp-editor-total{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--ink);color:#fff;border-radius:8px;font-size:12px;font-weight:500;margin-top:10px}
.tp-editor-total strong{font-size:17px;font-weight:700}

/* ---------- svg charts ---------- */
.tp-svg{width:100%;height:auto;display:block}
.tp-svg-axis{font-size:10px;fill:var(--muted2)}
.tp-svg-lab{font-size:10px;fill:var(--muted)}
.tp-svg-val{font-size:10px;fill:var(--ink2);font-weight:600}
.tp-legend{display:flex;gap:12px;font-size:10.5px;color:var(--muted)}
.tp-legend i{font-style:normal;display:inline-flex;align-items:center;gap:5px}
.tp-legend .sw{width:10px;height:10px;border-radius:3px}

/* ---------- scenario cards + ledger ---------- */
.tp-verdict{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.tp-vcard{background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px;position:relative;overflow:hidden}
.tp-vcard.best{border-color:var(--green-line);background:var(--green-bg)}
.tp-badge{position:absolute;top:0;right:0;background:var(--green);color:#fff;font-size:9px;font-weight:700;
  letter-spacing:.4px;text-transform:uppercase;padding:3px 8px;border-radius:0 9px 0 8px;display:flex;align-items:center;gap:3px}
.tp-vname{font-size:11px;color:var(--muted);font-weight:500;margin-bottom:5px;max-width:82%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tp-vtotal{font-size:21px;font-weight:700;letter-spacing:-.02em;line-height:1}
.tp-vsub{font-size:10.5px;color:var(--muted);margin-top:4px}
.tp-vdelta{font-size:11.5px;font-weight:600;margin-top:7px}
.tp-vdelta.save{color:var(--green)}.tp-vdelta.cost{color:var(--red)}.tp-vdelta.base{color:var(--muted)}
.tp-ledger-wrap{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.tp-ledger{display:grid;overflow-x:auto}
.tp-cell{padding:6px 10px;font-size:12px;border-bottom:1px solid var(--line2);display:flex;align-items:center;min-width:0}
.tp-corner{background:var(--hdr);color:var(--ink2);font-weight:700;font-size:9.5px;text-transform:uppercase;
  letter-spacing:.5px;position:sticky;left:0;z-index:5;border-bottom:1px solid var(--line)}
.tp-schead{background:var(--hdr);justify-content:space-between;gap:6px;border-bottom:1px solid var(--line)}
.tp-schead.best{background:var(--green-bg)}
.tp-name{background:transparent;border:none;font-size:12px;font-weight:700;width:100%;min-width:0;padding:2px 0;border-bottom:1px dashed transparent}
.tp-name:hover,.tp-name:focus{border-bottom-color:var(--line);outline:none}
.tp-schead.best .tp-name{color:var(--green)}
.tp-schead-a{display:flex;gap:1px;flex-shrink:0}
.tp-schead-a button{color:var(--muted2);padding:3px;border-radius:5px;display:grid;place-items:center}
.tp-schead-a button:hover{background:var(--line2);color:var(--ink)}
.tp-schead-a button:disabled{opacity:.3;cursor:not-allowed}
.tp-group{background:var(--hdr);font-size:10px;font-weight:700;color:var(--ink2);text-transform:uppercase;
  letter-spacing:.5px;cursor:pointer;user-select:none;gap:6px;position:sticky;left:0;border-bottom:1px solid var(--line2)}
.tp-lab{color:var(--ink);position:sticky;left:0;background:#fff;z-index:2;flex-direction:column;align-items:flex-start;justify-content:center;gap:0}
.tp-lab em{font-style:normal;font-size:10px;color:var(--muted2)}
.tp-lab.ind{padding-left:24px;color:var(--muted)}
.tp-lab.calc{font-weight:600}
.tp-in{padding:0}
.tp-in .tp-money{border:none;border-radius:0;background:transparent;padding:6px 10px;height:100%}
.tp-in .tp-money:focus{background:var(--indigo-bg);box-shadow:none}
.tp-calc{justify-content:flex-end;font-variant-numeric:tabular-nums;gap:6px}
button.tp-calc.drill{width:100%;background:#fff;border-bottom:1px solid var(--line2);font-size:12px;color:var(--ink);font-weight:500}
button.tp-calc.drill:hover{background:var(--indigo-bg);color:var(--indigo)}
.tp-lab.drill{cursor:default}
.tp-cell.subtotal{background:#fcfcfd;font-weight:600}
.tp-cell.total{background:var(--hdr);font-weight:700}
.tp-cell.grand{background:var(--ink);color:#fff;font-weight:700;font-size:13.5px}
.tp-cell.aftertax{background:var(--green-bg);color:var(--green);font-weight:700}
.tp-cell.rate{color:var(--ink2);font-weight:600}
.tp-add-row{display:flex;gap:9px;flex-wrap:wrap;padding:10px 12px}
.tp-add-row .tp-addbtn{margin-top:0}
.tp-biz{border:1px solid var(--line);border-radius:9px;padding:13px;display:flex;flex-direction:column;gap:10px;background:#fff}
.tp-biz-head{display:flex;align-items:center;gap:10px}
.tp-biznet{display:flex;justify-content:space-between;align-items:center;padding:9px 11px;background:var(--green-bg);border-radius:7px;font-size:12px}
.tp-biznet strong{font-size:15px;color:var(--green);font-weight:700}
.tp-biznet.neg{background:var(--red-bg)}
.tp-biznet.neg strong{color:var(--red)}

/* ---------- findings ---------- */
.tp-findings{display:flex;flex-direction:column;gap:9px}
.tp-finding{display:flex;gap:10px;border:1px solid var(--line);border-radius:9px;padding:11px 13px;background:#fcfcfd}
.tp-finding.quant{border-left:3px solid var(--green)}
.tp-finding.flag{border-left:3px solid #f59e0b}
.tp-finding-rank{width:21px;height:21px;border-radius:20px;display:grid;place-items:center;font-size:11px;
  font-weight:700;flex-shrink:0;background:var(--slate-bg);color:var(--slate)}
.tp-finding.flag .tp-finding-rank{background:var(--amber-bg);color:var(--amber)}
.tp-finding-body{flex:1;min-width:0}
.tp-finding-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.tp-finding-title{font-size:12.5px;font-weight:700;line-height:1.35}
.tp-finding-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.tp-finding-why{font-size:11.5px;color:var(--muted);line-height:1.55;margin-top:6px}
.tp-finding-act{display:flex;align-items:flex-start;gap:6px;font-size:11.5px;color:var(--green);line-height:1.5;margin-top:6px;font-weight:500}
.tp-finding-act svg{margin-top:2px;flex-shrink:0}
.tp-finding-ref{font-size:10px;color:var(--muted2);font-style:italic;margin-top:5px}
.tp-clean{display:flex;align-items:center;gap:9px;padding:14px;background:var(--green-bg);border-radius:8px;color:var(--green);font-size:12.5px;font-weight:600}

/* ---------- guide ---------- */
.tp-lawgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.tp-lawcard{background:var(--hdr);border:1px solid var(--line);border-radius:8px;padding:11px 12px;position:relative}
.tp-lawwhen{position:absolute;top:9px;right:10px;font-size:9px;font-weight:700;color:var(--indigo);background:var(--indigo-bg);padding:2px 7px;border-radius:20px}
.tp-lawt{font-size:12px;font-weight:700;margin-bottom:5px;padding-right:60px;line-height:1.35}
.tp-lawd{font-size:11px;color:var(--muted);line-height:1.55}
.tp-cat{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}
.tp-cat-head{width:100%;display:flex;align-items:center;gap:8px;padding:10px 13px;background:var(--hdr);
  font-size:10.5px;font-weight:700;color:var(--ink2);text-transform:uppercase;letter-spacing:.5px;text-align:left}
.tp-cat-head:hover{background:var(--line2)}
.tp-cat-head span{flex:1}
.tp-cat-head em{font-style:normal;font-size:10px;font-weight:700;color:var(--slate);background:var(--slate-bg);border-radius:20px;padding:2px 8px}
.tp-cat-body{padding:6px 14px 14px;display:flex;flex-direction:column;gap:10px}
.tp-consid{border-left:2px solid var(--line);padding:2px 0 2px 13px}
.tp-consid-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.tp-consid-name{font-size:12.5px;font-weight:700}
.tp-consid-b{font-size:11.5px;color:var(--muted);line-height:1.55;margin-top:5px}
.tp-consid-meta{font-size:10.5px;color:var(--muted2);margin-top:5px;font-style:italic}
.tp-disclaimer{padding:13px 15px;background:var(--hdr);border:1px solid var(--line);border-radius:9px;
  font-size:11px;line-height:1.6;color:var(--muted)}
.tp-disclaimer strong{color:var(--ink2)}

/* ---------- modal ---------- */
.tp-overlay{position:fixed;inset:0;background:rgba(24,24,27,.45);backdrop-filter:blur(2px);z-index:50;
  display:flex;align-items:flex-start;justify-content:center;padding:34px 18px;overflow-y:auto}
.tp-modal{background:var(--paper);border-radius:12px;width:100%;max-width:800px;box-shadow:0 16px 48px rgba(24,24,27,.22);overflow:hidden;margin:auto}
.tp-modal-head{background:var(--hdr);padding:14px 18px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;border-bottom:1px solid var(--line)}
.tp-eyebrow{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--indigo);font-weight:700;margin-bottom:3px}
.tp-modal-head h3{font-size:14px;font-weight:700}
.tp-modal-x{background:#fff;border:1px solid var(--line);color:var(--ink2);width:30px;height:30px;border-radius:7px;display:grid;place-items:center;flex-shrink:0}
.tp-modal-x:hover{background:var(--line2);color:var(--ink)}
.tp-modal-body{padding:16px 18px;max-height:66vh;overflow-y:auto}
.tp-modal-foot{padding:12px 18px;background:#fff;border-top:1px solid var(--line);display:flex;justify-content:flex-end}

/* ---------- report ---------- */
.tp-rp-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--line2);margin-top:6px}
.tp-rp-msg{font-size:11.5px;color:var(--green);font-weight:600}
.tp-rp-page{background:var(--line2);border:1px solid var(--line);border-radius:10px;padding:18px;overflow-x:auto}
.tp-rp-page .rp{max-width:790px;margin:0 auto;background:#fff;padding:32px 34px;border-radius:8px;border:1px solid var(--line);font-size:12.5px}
.tp-rp-page .rp-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding-bottom:15px;border-bottom:2px solid var(--ink);margin-bottom:20px}
.tp-rp-page .rp-eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;color:var(--indigo);margin-bottom:5px}
.tp-rp-page .rp-head h1{font-size:20px;font-weight:700}
.tp-rp-page .rp-sub{margin-top:4px;font-size:11.5px;color:var(--muted)}
.tp-rp-page .rp-meta{text-align:right;font-size:11px;color:var(--muted);line-height:1.7}
.tp-rp-page .rp-sec{margin-bottom:22px}
.tp-rp-page .rp-sec h2{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ink2);margin:0 0 9px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.tp-rp-page .rp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.tp-rp-page .rp-kpis>div{border:1px solid var(--line);border-radius:8px;padding:9px 10px;background:var(--hdr)}
.tp-rp-page .rp-kpis span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:700;margin-bottom:3px}
.tp-rp-page .rp-kpis strong{font-size:15px;font-weight:700}
.tp-rp-page .rp-kpis .hi{background:var(--ink);border-color:var(--ink)}
.tp-rp-page .rp-kpis .hi span{color:var(--muted2)}
.tp-rp-page .rp-kpis .hi strong{color:#fff}
.tp-rp-page .rp-tbl{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px}
.tp-rp-page .rp-tbl th{text-align:left;padding:7px 9px;font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--line)}
.tp-rp-page .rp-tbl th.num,.tp-rp-page .rp-tbl td.num{text-align:right;font-variant-numeric:tabular-nums}
.tp-rp-page .rp-tbl td{padding:6px 9px;border-bottom:1px solid var(--line2);vertical-align:top}
.tp-rp-page .rp-tbl td.sm{font-size:10.5px;color:var(--muted)}
.tp-rp-page .rp-tbl tr.tot td{font-weight:700;border-top:1px solid var(--ink);border-bottom:none;background:var(--hdr)}
.tp-rp-page .rp-tbl tr.sec td{background:var(--hdr);font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;font-weight:700;color:var(--ink2)}
.tp-rp-page .rp-tbl tr.hl td{background:var(--indigo-bg);font-weight:600}
.tp-rp-page .rp-note{font-size:11.5px;line-height:1.6;color:var(--muted);margin:9px 0 0}
.tp-rp-page .rp-find{border-left:2px solid var(--green);padding:2px 0 2px 11px;margin-top:11px}
.tp-rp-page .rp-find-h{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.tp-rp-page .rp-find-h>span:first-child{font-size:12px;font-weight:600}
.tp-rp-page .rp-find-amt{font-size:10.5px;font-weight:700;color:var(--green);background:var(--green-bg);padding:1px 7px;border-radius:20px;white-space:nowrap}
.tp-rp-page .rp-find-b{font-size:11.5px;line-height:1.55;color:var(--muted);margin-top:4px}
.tp-rp-page .rp-find-a{font-size:11.5px;line-height:1.5;margin-top:4px}
.tp-rp-page .rp-find-r{font-size:10px;color:var(--muted2);margin-top:4px;font-style:italic}
.tp-rp-page .rp-recs{margin:0;padding-left:17px}
.tp-rp-page .rp-recs li{font-size:11.5px;line-height:1.6;color:var(--muted);margin-bottom:7px}
.tp-rp-page .rp-recs strong{color:var(--ink)}
.tp-rp-page .rp-disc{margin-top:22px;padding-top:13px;border-top:1px solid var(--line)}
.tp-rp-page .rp-disc h3{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);margin:0 0 6px}
.tp-rp-page .rp-disc p{font-size:10.5px;line-height:1.6;color:var(--muted);margin:0 0 6px}
.tp-rp-page .rp-sig{font-style:italic;color:var(--muted2)}

@media print{
  .tp-side,.tp-topbar,.tp-card:first-of-type{display:none!important}
  .tp-shell{display:block}.tp-main{padding:0;max-width:none}
  .tp-rp-page{background:#fff;border:none;padding:0}
  .tp-rp-page .rp{border:none;max-width:none;padding:0}
}
`;

/* ---------- appended: tool windows, calculator, notepad, dock ---------- */
const TOOL_CSS = `
.tp-dock{position:fixed;right:16px;bottom:16px;display:flex;flex-direction:column;gap:8px;z-index:55}
.tp-dockbtn{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);
  border-radius:22px;padding:9px 15px 9px 12px;font-size:12px;font-weight:600;color:var(--ink2);
  box-shadow:0 3px 14px rgba(24,24,27,.13)}
.tp-dockbtn:hover{border-color:var(--indigo);color:var(--indigo)}
.tp-dockbtn.on{background:var(--indigo);border-color:var(--indigo);color:#fff}
@media (max-width:640px){.tp-dockbtn span{display:none}.tp-dockbtn{padding:11px;border-radius:50%}}

.tp-win{position:fixed;background:#fff;border:1px solid var(--line);border-radius:12px;
  box-shadow:0 14px 44px rgba(24,24,27,.24);overflow:hidden;max-height:88vh;display:flex;flex-direction:column}
.tp-win-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px 9px 13px;
  background:var(--hdr);border-bottom:1px solid var(--line);cursor:move;user-select:none;flex-shrink:0}
.tp-win-head strong{font-size:12.5px;font-weight:700;display:block}
.tp-win-head em{font-style:normal;font-size:10.5px;color:var(--muted);display:block;margin-top:1px;
  max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tp-win-x{background:#fff;border:1px solid var(--line);color:var(--ink2);width:26px;height:26px;
  border-radius:6px;display:grid;place-items:center;flex-shrink:0}
.tp-win-x:hover{background:var(--line2);color:var(--ink)}
.tp-win-body{padding:11px;overflow-y:auto}

.tp-calc-disp{background:var(--ink);color:#fff;border-radius:9px;padding:9px 12px;text-align:right;margin-bottom:9px}
.tp-calc-op{font-size:10.5px;color:#a1a1aa;min-height:14px;font-variant-numeric:tabular-nums}
.tp-calc-val{font-size:26px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums;
  overflow:hidden;text-overflow:ellipsis}
.tp-tape{background:var(--hdr);border:1px solid var(--line2);border-radius:8px;padding:7px 10px;
  height:108px;overflow-y:auto;font-variant-numeric:tabular-nums;margin-bottom:9px}
.tp-tape-empty{font-size:10.5px;color:var(--muted2);line-height:1.5}
.tp-tape-line{font-size:11.5px;text-align:right;padding:1px 0;color:var(--ink2)}
.tp-tape-line.sub{color:var(--muted);border-top:1px solid var(--line2)}
.tp-tape-line.total{font-weight:700;color:var(--ink);border-top:2px solid var(--ink2);border-bottom:1px solid var(--line2)}
.tp-tape-line.grab{color:var(--indigo);font-style:italic}
.tp-tape-line.note{color:var(--muted);font-style:italic}
.tp-calc-pad{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.tp-calcbtn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:11px 0;font-size:14.5px;
  font-weight:600;color:var(--ink)}
.tp-calcbtn:hover{background:var(--hover);border-color:var(--indigo)}
.tp-calcbtn:active{background:var(--indigo-bg)}
.tp-calcbtn.op{background:var(--hdr);color:var(--indigo)}
.tp-calcbtn.fn{background:var(--hdr);color:var(--muted);font-size:13px}
.tp-calcbtn.eq{background:var(--indigo);border-color:var(--indigo);color:#fff}
.tp-calcbtn.eq:hover{background:#3730a3}
.tp-calc-mem{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:7px}
.tp-calc-foot{display:flex;gap:6px;margin-top:9px;padding-top:9px;border-top:1px solid var(--line2)}
.tp-chiprow{display:flex;flex-wrap:wrap;gap:5px}
.tp-chip.sm{padding:4px 9px;font-size:10.5px}
.tp-mini:disabled{opacity:.45;cursor:not-allowed}

.tp-notearea{width:100%;min-height:92px;border:1px solid var(--line);border-radius:8px;padding:9px 10px;
  font-size:12.5px;font-family:inherit;line-height:1.55;resize:vertical}
.tp-notearea:focus{outline:none;border-color:var(--indigo);box-shadow:0 0 0 3px rgba(67,56,202,.09)}
.tp-note-actions{display:flex;align-items:center;gap:9px;margin-top:8px}
.tp-hint{font-size:10.5px;color:var(--muted2)}
.tp-notelist{margin-top:11px;padding-top:10px;border-top:1px solid var(--line2);display:flex;
  flex-direction:column;gap:8px;max-height:250px;overflow-y:auto}
.tp-noteitem{border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--hdr)}
.tp-noteitem-head{display:flex;align-items:center;gap:8px;font-size:10px;color:var(--muted)}
.tp-noteitem-head em{font-style:normal;color:var(--indigo);font-weight:600;flex:1;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.tp-noteitem-body{font-size:11.5px;line-height:1.55;color:var(--ink2);margin-top:4px;white-space:pre-wrap}
`;

/* appended: derived cells, limit cards, code spans */
const TOOL_CSS2 = `
.tp-derived{padding:7px 9px;font-size:12.5px;text-align:right;color:var(--muted);
  background:var(--hdr);border:1px dashed var(--line);border-radius:7px;font-variant-numeric:tabular-nums}
.tp-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;background:var(--hdr);
  border:1px solid var(--line);border-radius:5px;padding:1px 6px;display:inline-block;margin:3px 0}
.tp-limits{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.tp-limit{border:1px solid var(--line);border-radius:9px;padding:11px 12px;background:var(--hdr);opacity:.72}
.tp-limit span{display:block;font-size:10.5px;color:var(--muted);line-height:1.4;min-height:29px}
.tp-limit strong{display:block;font-size:19px;font-weight:700;letter-spacing:-.02em;margin-top:5px}
.tp-limit em{display:block;font-style:normal;font-size:10px;color:var(--muted2);margin-top:3px;font-weight:600}
.tp-limit.on{opacity:1;background:#fff;border-color:var(--indigo);border-width:2px;box-shadow:0 0 0 3px rgba(67,56,202,.08)}
.tp-limit.on strong{color:var(--indigo)}
.tp-limit.on em{color:var(--indigo)}
`;
