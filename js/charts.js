import { money, prettyDate } from "./format.js";

const NS = "http://www.w3.org/2000/svg";
const hosts = new Set();
let gradSeq = 0;

function el(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v != null) node.setAttribute(k, String(v));
  }
  return node;
}

function theme() {
  const s = getComputedStyle(document.documentElement);
  const v = (name) => s.getPropertyValue(name).trim();
  return {
    ink: v("--ink") || "#1d1a16",
    muted: v("--ink-soft") || "#5c564c",
    line: v("--line") || "#ddd4c4",
    good: v("--good") || "#0f7a45",
    bad: v("--bad") || "#b42318",
    accent: v("--accent") || "#9c4a1a",
    elev: v("--bg-elev") || "#fffdf8",
  };
}

function signColor(value, t, fallback) {
  if (value > 0) return t.good;
  if (value < 0) return t.bad;
  return fallback || t.muted;
}

function ensureTip(host) {
  let tip = host.querySelector(":scope > .tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    host.append(tip);
  }
  return tip;
}

function placeTip(host, tip, clientX, clientY, text) {
  const rect = host.getBoundingClientRect();
  tip.hidden = false;
  tip.textContent = text;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const w = tip.offsetWidth || 120;
  const left = Math.min(Math.max(8, x), Math.max(8, rect.width - w - 8));
  tip.style.left = left + "px";
  tip.style.top = Math.max(8, y - 36) + "px";
}

function track(host, draw) {
  host._draw = draw;
  for (const h of hosts) if (!h.isConnected) hosts.delete(h);
  hosts.add(host);
  if (!track.listening) {
    track.listening = true;
    let timer = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => redrawCharts(), 120);
    });
  }
  paint(host);
}

function paint(host) {
  const w = host.clientWidth;
  if (w < 20) {
    requestAnimationFrame(() => {
      if (host.isConnected && host.clientWidth >= 20) paint(host);
    });
    return;
  }
  host._rendering = true;
  host._w = w;
  try {
    host._draw(w);
  } finally {
    host._rendering = false;
  }
}

export function redrawCharts() {
  for (const host of hosts) {
    if (!host.isConnected) {
      hosts.delete(host);
      continue;
    }
    host._w = 0;
    paint(host);
  }
}

function empty(host, message) {
  host.replaceChildren();
  const p = document.createElement("p");
  p.className = "chart-empty";
  p.textContent = message;
  host.append(p);
}

function niceTicks(min, max, count = 4) {
  if (!(max > min)) return [min];
  const rough = (max - min) / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const err = rough / pow;
  const nf = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const step = nf * pow;
  const start = Math.ceil((min - step * 1e-6) / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.01 && ticks.length < 8; v += step) {
    ticks.push(Number(v.toFixed(8)));
  }
  if (!ticks.length) ticks.push(min, max);
  return ticks;
}

export function drawLine(host, spec) {
  track(host, (w) => renderLine(host, spec, w));
}

function renderLine(host, spec, w) {
  const points = spec.points || [];
  if (points.length < 2) {
    empty(host, "Not enough dated trades in this window.");
    return;
  }
  const t = theme();
  const h = spec.height || 260;
  const pad = { l: 64, r: 16, t: 18, b: 32 };
  const ys = points.map((p) => p.y);
  let min = Math.min(0, ...ys);
  let max = Math.max(0, ...ys);
  const span = max - min || 1;
  min -= span * 0.08;
  max += span * 0.1;
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const xAt = (i) => pad.l + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (v) => pad.t + ((max - v) / (max - min)) * innerH;
  const zeroY = yAt(0);

  const svg = el("svg", {
    viewBox: `0 0 ${w} ${h}`,
    width: w,
    height: h,
    role: "img",
    "aria-label": spec.label || "Cumulative P&L",
  });
  const id = "fill" + ++gradSeq;
  const defs = el("defs");
  const grad = el("linearGradient", { id, x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.append(
    el("stop", { offset: "0%", "stop-color": t.accent, "stop-opacity": "0.28" }),
    el("stop", { offset: "100%", "stop-color": t.accent, "stop-opacity": "0.02" }),
  );
  defs.append(grad);
  svg.append(defs);

  for (const tick of niceTicks(min, max, 4)) {
    const y = yAt(tick);
    svg.append(
      el("line", { x1: pad.l, x2: w - pad.r, y1: y, y2: y, stroke: t.line, "stroke-width": 1 }),
    );
    const label = el("text", {
      x: pad.l - 8,
      y: y + 4,
      "text-anchor": "end",
      fill: t.muted,
      "font-size": 11,
      "font-family": "IBM Plex Mono, ui-monospace, monospace",
    });
    label.textContent = money(tick, { digits: Math.abs(tick) >= 100 || tick === 0 ? 0 : 0 });
    svg.append(label);
  }
  svg.append(
    el("line", {
      x1: pad.l,
      x2: w - pad.r,
      y1: zeroY,
      y2: zeroY,
      stroke: t.muted,
      "stroke-width": 1,
      "stroke-dasharray": "3 3",
      "stroke-opacity": 0.7,
    }),
  );

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)}`).join(" ");
  const area = `M${xAt(0).toFixed(1)},${zeroY.toFixed(1)} ` + points.map((p, i) => `L${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)}`).join(" ") + ` L${xAt(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} Z`;
  svg.append(el("path", { d: area, fill: `url(#${id})` }));
  svg.append(el("path", { d: line, fill: "none", stroke: t.accent, "stroke-width": 2.25, "stroke-linejoin": "round", "stroke-linecap": "round" }));

  const last = points[points.length - 1];
  svg.append(
    el("circle", {
      cx: xAt(points.length - 1),
      cy: yAt(last.y),
      r: 4,
      fill: signColor(last.y, t, t.accent),
      stroke: t.elev,
      "stroke-width": 2,
    }),
  );

  const labelEvery = Math.ceil(points.length / 5);
  points.forEach((p, i) => {
    if (i !== 0 && i !== points.length - 1 && i % labelEvery !== 0) return;
    const label = el("text", {
      x: xAt(i),
      y: h - 10,
      "text-anchor": i === 0 ? "start" : i === points.length - 1 ? "end" : "middle",
      fill: t.muted,
      "font-size": 11,
      "font-family": "IBM Plex Mono, ui-monospace, monospace",
    });
    label.textContent = p.date.slice(2, 7);
    svg.append(label);
  });

  const hit = el("rect", { x: pad.l, y: pad.t, width: innerW, height: innerH, fill: "transparent" });
  const guide = el("line", { y1: pad.t, y2: h - pad.b, stroke: t.ink, "stroke-opacity": 0.35, "stroke-width": 1, visibility: "hidden" });
  const dot = el("circle", { r: 4.5, fill: t.ink, stroke: t.elev, "stroke-width": 2, visibility: "hidden" });
  svg.append(hit, guide, dot);
  host.replaceChildren(svg);
  const tip = ensureTip(host);

  const move = (event) => {
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * w;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(xAt(i) - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    const p = points[best];
    const cx = xAt(best);
    const cy = yAt(p.y);
    guide.setAttribute("visibility", "visible");
    guide.setAttribute("x1", cx);
    guide.setAttribute("x2", cx);
    dot.setAttribute("visibility", "visible");
    dot.setAttribute("cx", cx);
    dot.setAttribute("cy", cy);
    const day = p.pnl >= 0 ? "+" : "";
    placeTip(host, tip, event.clientX, event.clientY, `${prettyDate(p.date)}  day ${day}${money(p.pnl)}  ·  ${money(p.y)}`);
  };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerleave", () => {
    guide.setAttribute("visibility", "hidden");
    dot.setAttribute("visibility", "hidden");
    tip.hidden = true;
  });
}

export function drawVBars(host, spec) {
  track(host, (w) => renderVBars(host, spec, w));
}

function renderVBars(host, spec, w) {
  const bars = spec.bars || [];
  if (!bars.length) {
    empty(host, "Nothing in this window.");
    return;
  }
  const t = theme();
  const h = spec.height || 240;
  const rotate = !!spec.rotate;
  const pad = { l: 58, r: 8, t: 16, b: rotate ? 68 : 32 };
  const values = bars.map((b) => b.value);
  let min = spec.domain ? spec.domain[0] : Math.min(0, ...values);
  let max = spec.domain ? spec.domain[1] : Math.max(0, ...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  if (!spec.domain) {
    const span = max - min || 1;
    if (min < 0) min -= span * 0.06;
    if (max > 0) max += span * 0.08;
  }
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const yAt = (v) => pad.t + ((max - v) / (max - min)) * innerH;
  const zeroY = yAt(Math.min(max, Math.max(min, 0)));
  const slot = innerW / bars.length;
  const barW = Math.max(3, Math.min(slot * 0.62, 36));

  const svg = el("svg", {
    viewBox: `0 0 ${w} ${h}`,
    width: w,
    height: h,
    role: "img",
    "aria-label": spec.label || "Bar chart",
  });

  for (const tick of spec.domain ? [0, 50, 100] : niceTicks(min, max, 4)) {
    if (tick < min - 1e-6 || tick > max + 1e-6) continue;
    const y = yAt(tick);
    svg.append(el("line", { x1: pad.l, x2: w - pad.r, y1: y, y2: y, stroke: t.line }));
    const label = el("text", {
      x: pad.l - 6,
      y: y + 4,
      "text-anchor": "end",
      fill: t.muted,
      "font-size": 11,
      "font-family": "IBM Plex Mono, ui-monospace, monospace",
    });
    label.textContent = spec.formatTick ? spec.formatTick(tick) : money(tick, { digits: 0 });
    svg.append(label);
  }
  if (min < 0 && max > 0) {
    svg.append(el("line", { x1: pad.l, x2: w - pad.r, y1: zeroY, y2: zeroY, stroke: t.muted, "stroke-opacity": 0.55 }));
  }

  bars.forEach((bar, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const y = yAt(bar.value);
    const y0 = yAt(Math.min(max, Math.max(min, 0)));
    const top = Math.min(y, y0);
    const height = Math.max(1.5, Math.abs(y - y0));
    const named = bar.color === "good" ? t.good : bar.color === "bad" ? t.bad : bar.color === "accent" ? t.accent : bar.color;
    const color = named || signColor(bar.value, t, t.accent);
    const rect = el("rect", {
      x: cx - barW / 2,
      y: top,
      width: barW,
      height,
      rx: 3,
      fill: color,
    });
    const title = el("title");
    title.textContent = bar.hint || `${bar.label}: ${bar.value}`;
    rect.append(title);
    svg.append(rect);
    const hit = el("rect", { x: pad.l + slot * i, y: pad.t, width: slot, height: innerH, fill: "transparent" });
    hit.addEventListener("pointermove", (event) => {
      placeTip(host, tip, event.clientX, event.clientY, bar.hint || `${bar.label}  ${bar.value}`);
    });
    svg.append(hit);

    const label = el("text", {
      x: rotate ? cx : cx,
      y: rotate ? h - 42 : h - 12,
      fill: t.muted,
      "font-size": 11,
      "text-anchor": rotate ? "end" : "middle",
      "font-family": "IBM Plex Mono, ui-monospace, monospace",
      transform: rotate ? `rotate(-55 ${cx} ${h - 42})` : null,
    });
    label.textContent = bar.label;
    svg.append(label);
  });

  host.replaceChildren(svg);
  const tip = ensureTip(host);
  svg.addEventListener("pointerleave", () => {
    tip.hidden = true;
  });
}

export function drawRatio(host, spec) {
  track(host, (w) => renderRatio(host, spec, w));
}

function renderRatio(host, spec, w) {
  const points = (spec.points || []).filter((p) => p.multiple > 0);
  if (points.length < 2) {
    empty(host, "Not enough trades with a size baseline in this window.");
    return;
  }
  const t = theme();
  const h = spec.height || 240;
  const pad = { l: 44, r: 12, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const min = Math.min(0.2, ...points.map((p) => p.multiple));
  const max = Math.max(2.2, ...points.map((p) => p.multiple));
  const yAt = (v) => {
    const clamped = Math.min(max, Math.max(min, v));
    const span = Math.log10(max) - Math.log10(min) || 1;
    return pad.t + (1 - (Math.log10(clamped) - Math.log10(min)) / span) * innerH;
  };
  const xAt = (i) => pad.l + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const svg = el("svg", {
    viewBox: `0 0 ${w} ${h}`,
    width: w,
    height: h,
    role: "img",
    "aria-label": spec.label || "Size versus baseline",
  });
  for (const guide of [1, 1.5]) {
    if (guide < min || guide > max) continue;
    const y = yAt(guide);
    svg.append(el("line", {
      x1: pad.l,
      x2: w - pad.r,
      y1: y,
      y2: y,
      stroke: guide === 1.5 ? t.bad : t.muted,
      "stroke-dasharray": guide === 1.5 ? "4 3" : "0",
      "stroke-opacity": guide === 1.5 ? 0.9 : 0.45,
    }));
    const label = el("text", {
      x: pad.l - 6,
      y: y + 4,
      "text-anchor": "end",
      fill: guide === 1.5 ? t.bad : t.muted,
      "font-size": 11,
      "font-family": "IBM Plex Mono, ui-monospace, monospace",
    });
    label.textContent = guide === 1 ? "1×" : "1.5×";
    svg.append(label);
  }
  points.forEach((p, i) => {
    const dot = el("circle", {
      cx: xAt(i),
      cy: yAt(p.multiple),
      r: p.flagged ? 3.4 : 2.4,
      fill: p.flagged ? t.bad : t.accent,
      "fill-opacity": p.flagged ? 0.95 : 0.75,
    });
    const title = el("title");
    title.textContent = `${p.date} ${p.ticker} ${p.multiple.toFixed(2)}×`;
    dot.append(title);
    svg.append(dot);
  });
  const first = el("text", { x: pad.l, y: h - 8, fill: t.muted, "font-size": 11, "font-family": "IBM Plex Mono, ui-monospace, monospace" });
  first.textContent = points[0].date.slice(2, 7);
  const last = el("text", { x: w - pad.r, y: h - 8, "text-anchor": "end", fill: t.muted, "font-size": 11, "font-family": "IBM Plex Mono, ui-monospace, monospace" });
  last.textContent = points[points.length - 1].date.slice(2, 7);
  svg.append(first, last);
  host.replaceChildren(svg);
  const tip = ensureTip(host);
  svg.addEventListener("pointermove", (event) => {
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * w;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(xAt(i) - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    const p = points[best];
    const streak = p.afterStreak ? " · after a win streak" : "";
    placeTip(
      host,
      tip,
      event.clientX,
      event.clientY,
      `${prettyDate(p.date)} ${p.ticker} · ${p.multiple.toFixed(2)}× ${p.metricName || ""}${p.flagged ? " · escalation" : ""}${streak}`,
    );
  });
  svg.addEventListener("pointerleave", () => {
    tip.hidden = true;
  });
}

export function drawHBars(host, spec) {
  track(host, (w) => renderHBars(host, spec, w));
}

function renderHBars(host, spec, w) {
  const bars = spec.bars || [];
  if (!bars.length) {
    empty(host, "Nothing in this window.");
    return;
  }
  const t = theme();
  const rowH = 32;
  const pad = { t: 6, b: 6 };
  const h = pad.t + pad.b + bars.length * rowH;
  const labelW = Math.min(spec.labelWidth || 108, Math.max(56, w * 0.36));
  const valueW = Math.min(92, Math.max(68, w * 0.24));
  const x0 = labelW + 8;
  const x1 = w - valueW - 8;
  const values = bars.map((b) => b.value);
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min || 1;
  const xAt = (v) => x0 + ((v - min) / span) * (x1 - x0);
  const zeroX = xAt(0);

  const svg = el("svg", {
    viewBox: `0 0 ${w} ${h}`,
    width: w,
    height: h,
    role: "img",
    "aria-label": spec.label || "Bar chart",
  });
  svg.append(el("line", { x1: zeroX, x2: zeroX, y1: 4, y2: h - 4, stroke: t.line }));

  bars.forEach((bar, i) => {
    const y = pad.t + i * rowH;
    const mid = y + rowH / 2;
    const x = xAt(bar.value);
    const named = bar.color === "good" ? t.good : bar.color === "bad" ? t.bad : bar.color === "accent" ? t.accent : bar.color;
    const rect = el("rect", {
      x: Math.min(zeroX, x),
      y: mid - 7,
      width: Math.max(2, Math.abs(x - zeroX)),
      height: 14,
      rx: 3,
      fill: named || signColor(bar.value, t, t.accent),
    });
    const title = el("title");
    title.textContent = bar.hint || bar.label;
    rect.append(title);
    svg.append(rect);
    const name = el("text", {
      x: 0,
      y: mid + 4,
      fill: t.ink,
      "font-size": 12,
      "font-family": "IBM Plex Mono, ui-monospace, monospace",
    });
    name.textContent = bar.label;
    svg.append(name);
    const val = el("text", {
      x: w - 2,
      y: mid + 4,
      "text-anchor": "end",
      fill: signColor(bar.value, t, t.muted),
      "font-size": 12,
      "font-family": "IBM Plex Mono, ui-monospace, monospace",
    });
    val.textContent = spec.format ? spec.format(bar.value) : money(bar.value, { sign: true });
    svg.append(val);
    const hit = el("rect", { x: 0, y, width: w, height: rowH, fill: "transparent" });
    hit.addEventListener("pointermove", (event) => {
      placeTip(host, tip, event.clientX, event.clientY, bar.hint || `${bar.label}  ${val.textContent}`);
    });
    svg.append(hit);
  });

  host.replaceChildren(svg);
  const tip = ensureTip(host);
  svg.addEventListener("pointerleave", () => {
    tip.hidden = true;
  });
}
