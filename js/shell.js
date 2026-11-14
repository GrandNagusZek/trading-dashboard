import { redrawCharts } from "./charts.js";
import { parseTrades, analyze } from "./engine.js";
import { addDays, prettyDate } from "./format.js";

const RANGE_KEY = "td-range";

export function initTheme() {
  const btn = document.getElementById("theme-btn");
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";

  const currentDark = () => {
    const explicit = document.documentElement.getAttribute("data-theme");
    if (explicit) return explicit === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const sync = () => {
    const dark = currentDark();
    btn.textContent = dark ? "Light" : "Dark";
    btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  };
  btn.addEventListener("click", () => {
    const next = currentDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("td-theme", next);
    } catch {
      /* private mode */
    }
    sync();
    redrawCharts();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!document.documentElement.getAttribute("data-theme")) redrawCharts();
    sync();
  });
  sync();
}

function loadStoredRange() {
  const q = new URLSearchParams(location.search);
  if (q.has("from") || q.has("to")) {
    return { from: q.get("from") || "", to: q.get("to") || "", preset: "" };
  }
  try {
    const saved = JSON.parse(localStorage.getItem(RANGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      return { from: saved.from || "", to: saved.to || "", preset: saved.preset ?? "all" };
    }
  } catch {
    /* ignore broken storage */
  }
  return { from: "", to: "", preset: "all" };
}

export function windowFor(id, maxDate) {
  if (!id || id === "all" || !maxDate) return { from: "", to: "" };
  if (id === "30d") return { from: addDays(maxDate, -29), to: maxDate };
  if (id === "90d") return { from: addDays(maxDate, -89), to: maxDate };
  if (id === "ytd") return { from: maxDate.slice(0, 4) + "-01-01", to: maxDate };
  if (/^\d{4}$/.test(id)) return { from: `${id}-01-01`, to: `${id}-12-31` };
  return { from: "", to: "" };
}

function createRange() {
  let state = loadStoredRange();
  const listeners = new Set();
  function get() {
    return { ...state };
  }
  function persist() {
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    const params = new URLSearchParams(location.search);
    if (state.from) params.set("from", state.from);
    else params.delete("from");
    if (state.to) params.set("to", state.to);
    else params.delete("to");
    const s = params.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
  }
  function paint() {
    const fromEl = document.getElementById("date-from");
    const toEl = document.getElementById("date-to");
    if (fromEl) fromEl.value = state.from;
    if (toEl) toEl.value = state.to;
    document.querySelectorAll("#presets [data-preset]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.preset === state.preset ? "true" : "false");
    });
  }
  return {
    get,
    paint,
    set(next, { silent = false } = {}) {
      state = { from: next.from || "", to: next.to || "", preset: next.preset || "" };
      persist();
      paint();
      if (!silent) for (const fn of listeners) fn(get());
    },
    subscribe(fn) {
      listeners.add(fn);
    },
  };
}

function presetList(minDate, maxDate) {
  const presets = [
    { id: "all", label: "All" },
    { id: "30d", label: "30d" },
    { id: "90d", label: "90d" },
    { id: "ytd", label: "YTD" },
  ];
  if (minDate && maxDate) {
    const a = Number(minDate.slice(0, 4));
    const b = Number(maxDate.slice(0, 4));
    for (let y = a; y <= b; y++) presets.push({ id: String(y), label: String(y) });
  }
  return presets;
}

function titles(id, maxDate) {
  if (id === "all") return "Every live trade, including undated journal rows";
  if (id === "30d") return maxDate ? `30 days ending ${prettyDate(maxDate)}, the last trade in the log` : "Last 30 days of the log";
  if (id === "90d") return maxDate ? `90 days ending ${prettyDate(maxDate)}` : "Last 90 days of the log";
  if (id === "ytd") return maxDate ? `Year to date through ${prettyDate(maxDate)}` : "Year to date";
  if (/^\d{4}$/.test(id)) return id;
  return "";
}

function bindRange(range, maxDate, presets) {
  const host = document.getElementById("presets");
  if (host && !host.dataset.bound) {
    host.dataset.bound = "1";
    host.replaceChildren();
    for (const preset of presets) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset";
      btn.dataset.preset = preset.id;
      btn.textContent = preset.label;
      btn.title = titles(preset.id, maxDate);
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => {
        const w = windowFor(preset.id, maxDate);
        range.set({ ...w, preset: preset.id });
      });
      host.append(btn);
    }
  }
  const fromEl = document.getElementById("date-from");
  const toEl = document.getElementById("date-to");
  const onEdit = () => {
    const from = fromEl.value;
    const to = toEl.value;
    let preset = "";
    for (const p of presets) {
      const w = windowFor(p.id, maxDate);
      if (w.from === from && w.to === to) preset = p.id;
    }
    range.set({ from, to, preset });
  };
  if (fromEl && !fromEl.dataset.bound) {
    fromEl.dataset.bound = "1";
    fromEl.addEventListener("change", onEdit);
  }
  if (toEl && !toEl.dataset.bound) {
    toEl.dataset.bound = "1";
    toEl.addEventListener("change", onEdit);
  }
  range.paint();
}

function updateReadout(view) {
  const el = document.getElementById("range-readout");
  if (!el) return;
  if (!view.trades.n) {
    el.textContent = "No trades in this window.";
    return;
  }
  const when =
    view.from || view.to
      ? `${prettyDate(view.from || view.minDate)} – ${prettyDate(view.to || view.maxDate)}`
      : `All time · ${prettyDate(view.minDate)} – ${prettyDate(view.maxDate)}`;
  const bits = [when, `${view.trades.n} live trade${view.trades.n === 1 ? "" : "s"}`];
  if (!view.from && !view.to && view.undated.n) bits.push(`${view.undated.n} undated included`);
  else if (view.from || view.to) bits.push("dated trades only");
  el.textContent = bits.join(" · ");
}

function errorPanel(err) {
  const wrap = document.createElement("div");
  wrap.className = "card empty";
  const h = document.createElement("h1");
  h.textContent = "The trade log didn’t load";
  const p = document.createElement("p");
  p.textContent =
    "This page reads data/trades.csv in the browser. Open it through a local server (python3 -m http.server) or through GitHub Pages. Opening the HTML file directly blocks that read.";
  const small = document.createElement("p");
  small.className = "muted";
  small.textContent = err && err.message ? err.message : "Unknown error";
  wrap.append(h, p, small);
  return wrap;
}

export async function boot(render) {
  initTheme();
  const main = document.getElementById("main");
  const range = createRange();
  let records;
  try {
    const res = await fetch("data/trades.csv", { cache: "no-cache" });
    if (!res.ok) throw new Error("data/trades.csv returned " + res.status);
    records = parseTrades(await res.text());
  } catch (err) {
    if (main) main.replaceChildren(errorPanel(err));
    return;
  }
  let config = {};
  try {
    const cfg = await fetch("data/config.json", { cache: "no-cache" });
    if (cfg.ok) config = await cfg.json();
  } catch {
    config = {};
  }
  const bounds = analyze(records, {}, config);
  const presets = presetList(bounds.minDate, bounds.maxDate);
  bindRange(range, bounds.maxDate, presets);
  const stored = range.get();
  if (stored.preset && stored.preset !== "all") {
    const w = windowFor(stored.preset, bounds.maxDate);
    if (w.from !== stored.from || w.to !== stored.to) range.set({ ...w, preset: stored.preset }, { silent: true });
  } else if (!stored.preset && !stored.from && !stored.to) {
    range.set({ from: "", to: "", preset: "all" }, { silent: true });
  }
  const draw = () => {
    const view = analyze(records, range.get(), config);
    updateReadout(view);
    render(view);
  };
  range.subscribe(draw);
  draw();
}
