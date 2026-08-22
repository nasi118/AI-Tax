/* ==== 12-xlsx ==== */
/* ============================================================================
   XLSX WRITER — no library, no network
   An .xlsx file is a ZIP of XML parts. We write the ZIP with stored (uncompressed)
   entries, which is valid and keeps the writer synchronous and dependency-free.

   The point of this writer is AUDITABILITY: every computed cell is emitted as a
   real Excel formula referencing either a named statutory constant or an input
   cell, so a reviewer can select any figure in the workbook and trace it back to
   its source. Nothing is exported as a dead number except raw inputs and
   recorded history.
   ========================================================================== */

/* ---- CRC-32 ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ c >>> 8;
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const enc = new TextEncoder();

/* ---- Minimal ZIP (stored entries) ---- */
function zipStore(files) {
  const chunks = [],
    central = [];
  let offset = 0;
  const u16 = n => [n & 0xFF, n >>> 8 & 0xFF];
  const u32 = n => [n & 0xFF, n >>> 8 & 0xFF, n >>> 16 & 0xFF, n >>> 24 & 0xFF];

  // A fixed DOS timestamp keeps output byte-identical for the same inputs.
  const dosTime = 0x6000; // 12:00:00
  const dosDate = 0x5A21; // 2025-01-01

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const local = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(dosTime), u16(dosDate), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0));
    chunks.push(new Uint8Array(local), nameBytes, data);
    central.push({
      name: nameBytes,
      crc,
      size: data.length,
      offset
    });
    offset += local.length + nameBytes.length + data.length;
  }
  const centralStart = offset;
  for (const c of central) {
    const hdr = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(dosTime), u16(dosDate), u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
    chunks.push(new Uint8Array(hdr), c.name);
    offset += hdr.length + c.name.length;
  }
  const eocd = [].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(offset - centralStart), u32(centralStart), u16(0));
  chunks.push(new Uint8Array(eocd));
  let total = 0;
  chunks.forEach(c => {
    total += c.length;
  });
  const out = new Uint8Array(total);
  let p = 0;
  chunks.forEach(c => {
    out.set(c, p);
    p += c.length;
  });
  return out;
}

/* ---- XML helpers ---- */
function xmlEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
  // Strip control characters Excel rejects
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}
function colLetter(n) {
  // 1 -> A
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* ---- Style indices (must match buildStyles below) ---- */
const ST = {
  base: 0,
  title: 1,
  sectionHdr: 2,
  colHdr: 3,
  label: 4,
  labelInd: 5,
  money: 6,
  moneyF: 7,
  moneyBold: 8,
  moneyGrand: 9,
  pctF: 10,
  num: 11,
  small: 12,
  cite: 13,
  key: 14,
  input: 15,
  date: 16,
  wrap: 17,
  moneyTot: 18,
  warn: 19
};
function buildStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4">
<numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0;[Red]&quot;($&quot;#,##0&quot;)&quot;"/>
<numFmt numFmtId="165" formatCode="0.00%"/>
<numFmt numFmtId="166" formatCode="#,##0"/>
<numFmt numFmtId="167" formatCode="yyyy-mm-dd hh:mm"/>
</numFmts>
<fonts count="9">
<font><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF0B5CAB"/><name val="Calibri"/></font>
<font><i/><sz val="8.5"/><color rgb="FF6B7280"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF0B5CAB"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF9A3412"/><name val="Calibri"/></font>
</fonts>
<fills count="7">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E1"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8F0FE"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="4">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF1F2937"/></top><bottom style="double"><color rgb="FF1F2937"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF1F2937"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="20">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment indent="2"/></xf>
<xf numFmtId="164" fontId="7" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="3" fillId="0" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="3" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="166" fontId="7" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="6" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="167" fontId="7" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" fontId="3" fillId="3" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="8" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
</cellXfs>
</styleSheet>`;
}

/* ============================================================================
   SHEET BUILDER
   Rows are added in order with an optional stable id. Formulas are supplied as
   functions that receive a ref() helper, so a formula can point at another row
   by id and get a real cell reference. Two passes: assign row numbers, then
   materialise. That allows forward references to rows added later.
   ========================================================================== */
function Sheet(name, opts) {
  opts = opts || {};
  const rows = [];
  const ids = {};
  return {
    name,
    cols: opts.cols || [],
    freeze: opts.freeze || null,
    /* cells: array of cell descriptors, or a function(ref) returning that array.
       cell: {v, f, t, s, k}  k = machine key written to a hidden-ish column */
    add(def) {
      const r = {
        id: def.id || null,
        cells: def.cells,
        height: def.height
      };
      rows.push(r);
      if (r.id) ids[r.id] = rows.length; // 1-based row number
      return r;
    },
    blank() {
      rows.push({
        cells: []
      });
    },
    rowOf(id) {
      return ids[id];
    },
    build() {
      // ref(id, colIndex1Based) -> "D14"; ref(id) -> row number
      const ref = (id, col) => {
        const r = ids[id];
        if (!r) return "#REF!";
        return col ? colLetter(col) + r : String(r);
      };
      const out = [];
      rows.forEach((r, i) => {
        const rowNum = i + 1;
        const cells = typeof r.cells === "function" ? r.cells(ref, rowNum) : r.cells;
        if (!cells || !cells.length) {
          out.push(`<row r="${rowNum}"/>`);
          return;
        }
        const parts = cells.map((c, ci) => {
          if (c == null) return "";
          const addr = colLetter(ci + 1) + rowNum;
          const st = c.s != null ? ` s="${c.s}"` : "";
          if (c.f != null) {
            // An OOXML <f> element carries the formula WITHOUT a leading "=".
            const formula = String(c.f).replace(/^=+/, "");
            const cached = c.v != null && isFinite(c.v) ? `<v>${Math.round(Number(c.v) * 1e6) / 1e6}</v>` : "";
            return `<c r="${addr}"${st}><f>${xmlEsc(formula)}</f>${cached}</c>`;
          }
          if (c.t === "s") return `<c r="${addr}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
          if (c.v == null || c.v === "") return `<c r="${addr}"${st}/>`;
          const nv = Number(c.v);
          if (!isFinite(nv)) return `<c r="${addr}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
          return `<c r="${addr}"${st}><v>${Math.round(nv * 1e6) / 1e6}</v></c>`;
        });
        const h = r.height ? ` ht="${r.height}" customHeight="1"` : "";
        out.push(`<row r="${rowNum}"${h}>${parts.join("")}</row>`);
      });
      return out.join("");
    }
  };
}

/* ---- Assemble the workbook ---- */
function buildWorkbook(sheets, definedNames, meta) {
  meta = meta || {};
  const parts = [];
  const push = (name, str) => parts.push({
    name,
    data: enc.encode(str)
  });
  const sheetXmls = sheets.map((sh, i) => {
    const colsXml = sh.cols && sh.cols.length ? `<cols>${sh.cols.map((w, ci) => `<col min="${ci + 1}" max="${ci + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const pane = sh.freeze ? `<sheetViews><sheetView workbookViewId="0"${i === 0 ? ' tabSelected="1"' : ""}><pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : `<sheetViews><sheetView workbookViewId="0"${i === 0 ? ' tabSelected="1"' : ""}/></sheetViews>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<sheetFormatPr defaultRowHeight="14"/>${colsXml}<sheetData>${sh.build()}</sheetData></worksheet>`;
  });
  sheetXmls.forEach((x, i) => push(`xl/worksheets/sheet${i + 1}.xml`, x));
  push("xl/styles.xml", buildStyles());
  const dn = (definedNames || []).map(d => `<definedName name="${xmlEsc(d.name)}">${xmlEsc(d.ref)}</definedName>`).join("");
  push("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
${dn ? `<definedNames>${dn}</definedNames>` : ""}
<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  push("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  push("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`);
  push("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xmlEsc(meta.title || "Tax Planning Workbench export")}</dc:title>
<dc:creator>${xmlEsc(meta.creator || "Tax Planning Workbench")}</dc:creator>
<cp:lastModifiedBy>${xmlEsc(meta.creator || "Tax Planning Workbench")}</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${meta.created || "2025-01-01T00:00:00Z"}</dcterms:created>
</cp:coreProperties>`);
  push("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`);
  return zipStore(parts);
}
function downloadBlob(bytes, filename, mime) {
  const blob = new Blob([bytes], {
    type: mime || "application/octet-stream"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ============================================================================
   XLSX READER
   Inflates entries with the browser's native DecompressionStream, so no
   decompression library is needed. Stored entries are read directly.
   ========================================================================== */
async function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Locate the end-of-central-directory record
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid zip archive — no end-of-central-directory record found.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + compSize);
    if (method === 0) {
      files[name] = raw;
    } else if (method === 8) {
      if (typeof DecompressionStream === "undefined") {
        throw new Error("This browser cannot read compressed spreadsheets. Chrome, Edge, Safari 16.4+ and Firefox 113+ all support it.");
      }
      const ds = new DecompressionStream("deflate-raw");
      const stream = new Blob([raw]).stream().pipeThrough(ds);
      files[name] = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new Error("Unsupported compression method " + method + " in " + name);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/* Parse one worksheet into a { "A1": value } map. Cached formula values are
   used where present, so a workbook Excel has recalculated round-trips cleanly. */
function parseSheetXml(xml, sharedStrings) {
  const cells = {};
  /* The self-closing form must be tried FIRST. Matching <c ...> before <c .../>
     lets an empty cell be read as an opening tag, whose body then runs on to the
     next </c> and steals the following cell's value. */
  const rowRe = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
  let m;
  while ((m = rowRe.exec(xml)) !== null) {
    const selfClosing = m[1] != null;
    const attrs = selfClosing ? m[1] : m[2] || "";
    const body = selfClosing ? "" : m[3] || "";
    const rm = /r="([A-Z]+\d+)"/.exec(attrs);
    if (!rm) continue;
    const addr = rm[1];
    const tm = /t="([^"]+)"/.exec(attrs);
    const type = tm ? tm[1] : "n";
    let val = null;
    if (type === "inlineStr") {
      const im = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body);
      val = im ? unesc(im[1]) : "";
    } else if (type === "s") {
      const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
      val = vm ? sharedStrings[Number(vm[1])] || "" : "";
    } else if (type === "str") {
      const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
      val = vm ? unesc(vm[1]) : "";
    } else {
      const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
      val = vm ? Number(vm[1]) : null;
    }
    cells[addr] = val;
  }
  return cells;
}
function unesc(s) {
  return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const texts = [];
    const tre = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tre.exec(m[1])) !== null) texts.push(unesc(t[1]));
    out.push(texts.join(""));
  }
  return out;
}
async function readWorkbook(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = await unzip(bytes);
  const dec = new TextDecoder();
  const wbXml = files["xl/workbook.xml"] ? dec.decode(files["xl/workbook.xml"]) : "";
  const relsXml = files["xl/_rels/workbook.xml.rels"] ? dec.decode(files["xl/_rels/workbook.xml.rels"]) : "";
  const shared = parseSharedStrings(files["xl/sharedStrings.xml"] ? dec.decode(files["xl/sharedStrings.xml"]) : "");

  // Map sheet name -> target part
  const relMap = {};
  const relRe = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g;
  let rm;
  while ((rm = relRe.exec(relsXml)) !== null) relMap[rm[1]] = rm[2];
  const sheets = {};
  const shRe = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"[^>]*\/>/g;
  let sm;
  let idx = 0;
  while ((sm = shRe.exec(wbXml)) !== null) {
    idx++;
    const name = unesc(sm[1]);
    let target = relMap[sm[2]] || "worksheets/sheet" + idx + ".xml";
    if (target.charAt(0) === "/") target = target.slice(1);else target = "xl/" + target.replace(/^\.\//, "");
    const part = files[target] || files["xl/worksheets/sheet" + idx + ".xml"];
    if (part) sheets[name] = parseSheetXml(dec.decode(part), shared);
  }
  return sheets;
}
