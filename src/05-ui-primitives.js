/* ==== 05-ui-primitives ==== */
/* ============================================================================
   UI PRIMITIVES
   ========================================================================== */
const {
  useState,
  useMemo,
  useEffect,
  useRef,
  Fragment
} = React;

/* ---- Inline SVG icon set (no external icon dependency) ---- */
function Icon({
  d,
  size,
  style,
  fill
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size || 15,
    height: size || 15,
    viewBox: "0 0 24 24",
    fill: fill || "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0,
      ...(style || {})
    },
    "aria-hidden": "true"
  }, d);
}
const I = {
  grid: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "3",
      width: "7",
      height: "7"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "3",
      width: "7",
      height: "7"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "14",
      width: "7",
      height: "7"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "14",
      width: "7",
      height: "7"
    }))
  }),
  layers: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 2 2 7l10 5 10-5-10-5Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m2 17 10 5 10-5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m2 12 10 5 10-5"
    }))
  }),
  briefcase: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "2",
      y: "7",
      width: "20",
      height: "14",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"
    }))
  }),
  gauge: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "m12 14 4-4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3.34 19a10 10 0 1 1 17.32 0"
    }))
  }),
  scale: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M7 21h10"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 3v18"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"
    }))
  }),
  heart: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
    })
  }),
  book: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"
    }))
  }),
  library: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "m16 6 4 14"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 6v14"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 8v12"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M4 4v16"
    }))
  }),
  file: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 2v5h6"
    }))
  }),
  plus: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M5 12h14"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 5v14"
    }))
  }),
  copy: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "9",
      y: "9",
      width: "13",
      height: "13",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
    }))
  }),
  trash: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 6h18"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
    }))
  }),
  chevD: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "m6 9 6 6 6-6"
    }),
    size: 14
  }),
  chevR: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "m9 18 6-6-6-6"
    }),
    size: 14
  }),
  award: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "8",
      r: "6"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"
    })),
    size: 12
  }),
  alert: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 9v4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 17h.01"
    })),
    size: 13
  }),
  check: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "10"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m9 12 2 2 4-4"
    })),
    size: 13
  }),
  bulb: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M9 18h6"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 22h4"
    })),
    size: 12
  }),
  print: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M6 9V2h12v7"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "6",
      y: "14",
      width: "12",
      height: "8"
    })),
    size: 14
  }),
  download: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M7 10l5 5 5-5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 15V3"
    })),
    size: 14
  }),
  reset: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 3v5h5"
    })),
    size: 14
  }),
  x: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M18 6 6 18"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m6 6 12 12"
    })),
    size: 17
  }),
  clock: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "10"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 6v6l4 2"
    }))
  }),
  table: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "3",
      width: "18",
      height: "18",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 9h18"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 15h18"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M9 3v18"
    }))
  }),
  calc: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "4",
      y: "2",
      width: "16",
      height: "20",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 6h8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8"
    })),
    size: 16
  }),
  note: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 2v5h6"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 13h8M8 17h5"
    })),
    size: 16
  }),
  info: /*#__PURE__*/React.createElement(Icon, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "10"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 16v-4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 8h.01"
    })),
    size: 13
  })
};

/* ---- Number input that keeps the caret stable while typing ---- */
function Money({
  value,
  onChange,
  className,
  placeholder,
  disabled
}) {
  return /*#__PURE__*/React.createElement("input", {
    className: "tp-money " + (className || ""),
    type: "text",
    inputMode: "decimal",
    disabled: disabled,
    value: value === 0 || value === "0" ? "" : value,
    placeholder: placeholder || "0",
    onFocus: e => {
      /* Remembered so the quick calculator's "Insert into input" can target
         the money field the user last worked in. */
      window.__tpLastMoneyInput = e.target;
    },
    onChange: e => {
      const v = e.target.value.replace(/[^0-9.\-]/g, "");
      onChange(v === "" ? 0 : v);
    }
  });
}
function Field({
  label,
  hint,
  value,
  onChange,
  disabled
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: "tp-field"
  }, /*#__PURE__*/React.createElement("span", null, label, hint && /*#__PURE__*/React.createElement("em", null, hint)), /*#__PURE__*/React.createElement(Money, {
    value: value,
    onChange: onChange,
    disabled: disabled
  }));
}
function Seg({
  value,
  onChange,
  options,
  small
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-seg" + (small ? " sm" : "")
  }, options.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.v,
    className: value === o.v ? "on" : "",
    onClick: () => onChange(o.v),
    type: "button"
  }, o.l)));
}
function Card({
  title,
  sub,
  children,
  right,
  flush
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "tp-card"
  }, (title || right) && /*#__PURE__*/React.createElement("div", {
    className: "tp-card-head"
  }, title && /*#__PURE__*/React.createElement("h3", null, title), sub && /*#__PURE__*/React.createElement("span", {
    className: "tp-card-sub"
  }, sub), right && /*#__PURE__*/React.createElement("div", {
    className: "tp-card-right"
  }, right)), /*#__PURE__*/React.createElement("div", {
    className: flush ? "" : "tp-card-body"
  }, children));
}
function Note({
  children,
  kind
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-note " + (kind || "")
  }, I.info, " ", /*#__PURE__*/React.createElement("div", null, children));
}
function StatusPill({
  status
}) {
  const map = {
    under: {
      l: "Under",
      c: "ok"
    },
    phaseout: {
      l: "In phase-out",
      c: "warn"
    },
    above: {
      l: "Above",
      c: "bad"
    }
  };
  const m = map[status] || map.under;
  return /*#__PURE__*/React.createElement("span", {
    className: "tp-pill " + m.c
  }, m.l);
}

/* ---- A phase-out position bar: shows where MAGI sits in the range ---- */
function RangeBar({
  value,
  lo,
  hi
}) {
  if (hi == null || !isFinite(hi)) {
    const over = value > lo;
    return /*#__PURE__*/React.createElement("div", {
      className: "tp-rangebar hard"
    }, /*#__PURE__*/React.createElement("div", {
      className: "tp-rb-fill " + (over ? "bad" : "ok"),
      style: {
        width: over ? "100%" : "50%"
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "tp-rb-lab"
    }, over ? "over limit" : "under limit"));
  }
  if (!isFinite(lo)) return /*#__PURE__*/React.createElement("div", {
    className: "tp-rangebar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tp-rb-lab"
  }, "no limit"));
  const span = hi - lo;
  const p = span > 0 ? Math.min(1, Math.max(0, (value - lo) / span)) : value > lo ? 1 : 0;
  const cls = value < lo ? "ok" : value >= hi ? "bad" : "warn";
  return /*#__PURE__*/React.createElement("div", {
    className: "tp-rangebar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tp-rb-fill " + cls,
    style: {
      width: (p * 100).toFixed(1) + "%"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "tp-rb-mark",
    style: {
      left: (p * 100).toFixed(1) + "%"
    }
  }));
}

/* ---- Charts drawn as inline SVG, no chart library ---- */
function StackedBars({
  data,
  series,
  height,
  format,
  axisFormat
}) {
  const axisF = axisFormat || (v => "$" + Math.round(v / 1000) + "k");
  const h = height || 210,
    padL = 56,
    padB = 34,
    padT = 10,
    padR = 8;
  const w = 640;
  const max = Math.max(1, ...data.map(d => series.reduce((a, s) => a + Math.max(0, d[s.key] || 0), 0)));
  const iw = w - padL - padR,
    ih = h - padB - padT;
  const bw = Math.min(72, iw / Math.max(1, data.length) * 0.6);
  const ticks = 4;
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${w} ${h}`,
    className: "tp-svg",
    preserveAspectRatio: "xMidYMid meet",
    role: "img"
  }, Array.from({
    length: ticks + 1
  }).map((_, i) => {
    const v = max / ticks * i,
      y = padT + ih - v / max * ih;
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("line", {
      x1: padL,
      x2: w - padR,
      y1: y,
      y2: y,
      stroke: "#e8eaee",
      strokeDasharray: "2 4"
    }), /*#__PURE__*/React.createElement("text", {
      x: padL - 8,
      y: y + 4,
      textAnchor: "end",
      className: "tp-svg-axis"
    }, axisF(v)));
  }), data.map((d, i) => {
    const cx = padL + iw / data.length * (i + 0.5);
    let acc = 0;
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, series.map(s => {
      const v = Math.max(0, d[s.key] || 0);
      const bh = v / max * ih;
      const y = padT + ih - acc - bh;
      acc += bh;
      return v > 0 ? /*#__PURE__*/React.createElement("rect", {
        key: s.key,
        x: cx - bw / 2,
        y: y,
        width: bw,
        height: bh,
        fill: s.color
      }, /*#__PURE__*/React.createElement("title", null, s.label + ": " + format(v))) : null;
    }), /*#__PURE__*/React.createElement("title", null, d.name + (i === 0 ? " (base scenario)" : "") + " \u2014 total " + format(series.reduce((a, sr) => a + Math.max(0, d[sr.key] || 0), 0))), /*#__PURE__*/React.createElement("text", {
      x: cx,
      y: h - padB + 16,
      textAnchor: "middle",
      className: "tp-svg-lab"
    }, (() => {
      /* Numbered aliases keep long names distinguishable; the number survives
         truncation and the full name is on hover. The base scenario is marked. */
      const maxChars = Math.max(6, Math.floor(iw / data.length / 6.4));
      const alias = (i + 1) + ". " + d.name + (i === 0 ? " (base)" : "");
      return alias.length > maxChars ? alias.slice(0, maxChars - 1) + "\u2026" : alias;
    })()), /*#__PURE__*/React.createElement("text", {
      x: cx,
      y: h - padB + 28,
      textAnchor: "middle",
      className: "tp-svg-val"
    }, format(acc / ih * max)));
  }), /*#__PURE__*/React.createElement("line", {
    x1: padL,
    x2: w - padR,
    y1: padT + ih,
    y2: padT + ih,
    stroke: "#cfd4da"
  }));
}

/* ---- Marginal rate curve: total tax on the next dollar across an income sweep ---- */
function RateCurve({
  points,
  markerX,
  height
}) {
  const h = height || 200,
    padL = 46,
    padB = 30,
    padT = 12,
    padR = 12,
    w = 640;
  const iw = w - padL - padR,
    ih = h - padB - padT;
  const xs = points.map(p => p.x),
    ys = points.map(p => p.y);
  const xMin = Math.min(...xs),
    xMax = Math.max(...xs);
  const yMax = Math.max(0.45, Math.max(...ys) * 1.1);
  const X = x => padL + (x - xMin) / Math.max(1, xMax - xMin) * iw;
  const Y = y => padT + ih - y / yMax * ih;
  const path = points.map((p, i) => (i ? "L" : "M") + X(p.x).toFixed(1) + " " + Y(p.y).toFixed(1)).join(" ");
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${w} ${h}`,
    className: "tp-svg",
    preserveAspectRatio: "xMidYMid meet",
    role: "img"
  }, [0, 0.1, 0.2, 0.3, 0.4].filter(v => v <= yMax).map(v => /*#__PURE__*/React.createElement("g", {
    key: v
  }, /*#__PURE__*/React.createElement("line", {
    x1: padL,
    x2: w - padR,
    y1: Y(v),
    y2: Y(v),
    stroke: "#e8eaee",
    strokeDasharray: "2 4"
  }), /*#__PURE__*/React.createElement("text", {
    x: padL - 6,
    y: Y(v) + 4,
    textAnchor: "end",
    className: "tp-svg-axis"
  }, (v * 100).toFixed(0) + "%"))), /*#__PURE__*/React.createElement("path", {
    d: path,
    fill: "none",
    stroke: "#4338ca",
    strokeWidth: "2"
  }), markerX != null && markerX >= xMin && markerX <= xMax && /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("line", {
    x1: X(markerX),
    x2: X(markerX),
    y1: padT,
    y2: padT + ih,
    stroke: "#dc2626",
    strokeWidth: "1.5",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("text", {
    x: X(markerX),
    y: padT - 2,
    textAnchor: "middle",
    className: "tp-svg-val",
    fill: "#dc2626"
  }, "current")), points.filter((_, i) => i % Math.ceil(points.length / 6) === 0).map((p, i) => /*#__PURE__*/React.createElement("text", {
    key: i,
    x: X(p.x),
    y: h - padB + 16,
    textAnchor: "middle",
    className: "tp-svg-lab"
  }, "$" + Math.round(p.x / 1000) + "k")), /*#__PURE__*/React.createElement("line", {
    x1: padL,
    x2: w - padR,
    y1: padT + ih,
    y2: padT + ih,
    stroke: "#cfd4da"
  }));
}
