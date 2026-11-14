import { boot } from "./shell.js";
import { RULES } from "./engine.js";
import { h } from "./dom.js";
import { cls, money, prettyDate, price } from "./format.js";

const state = {
  q: "",
  dir: "all",
  process: "all",
  rule: "all",
  paper: false,
  risk: "all",
  klass: "all",
  error: "",
  sort: "date",
  order: "desc",
  openId: null,
  ready: false,
};

let latest = null;
let chromeReady = false;

function readQuery() {
  const q = new URLSearchParams(location.search);
  if (q.get("rule") && RULES.some((r) => r.id === q.get("rule"))) state.rule = q.get("rule");
  if (["short", "long", "other"].includes(q.get("dir"))) state.dir = q.get("dir");
  if (["clean", "broke"].includes(q.get("process"))) state.process = q.get("process");
  if (q.get("q")) state.q = q.get("q");
  if (q.get("paper") === "1") state.paper = true;
  if (["planned", "slippage", "proxy"].includes(q.get("risk"))) state.risk = q.get("risk");
  if (["A", "B", "C"].includes(q.get("class"))) state.klass = q.get("class");
  if (q.get("error")) state.error = q.get("error");
}

function writeQuery() {
  const params = new URLSearchParams(location.search);
  const set = (key, value, blank) => {
    if (value && value !== blank) params.set(key, value);
    else params.delete(key);
  };
  set("q", state.q.trim(), "");
  set("dir", state.dir, "all");
  set("process", state.process, "all");
  set("rule", state.rule, "all");
  set("risk", state.risk, "all");
  set("class", state.klass, "all");
  set("error", state.error, "");
  if (state.paper) params.set("paper", "1");
  else params.delete("paper");
  const s = params.toString();
  history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
}

function pool() {
  const live = latest.live;
  return state.paper ? live.concat(latest.paper) : live;
}

function filtered() {
  const query = state.q.trim().toLowerCase();
  return pool().filter((row) => {
    if (state.dir !== "all" && row.dir !== state.dir) return false;
    if (state.process === "clean" && !row.ok) return false;
    if (state.process === "broke" && row.ok) return false;
    if (state.rule !== "all" && !row.v.has(state.rule)) return false;
    if (state.risk !== "all" && row.riskKind !== state.risk) return false;
    if (state.klass !== "all" && row.quality !== state.klass) return false;
    if (state.error && !(row.qualityErrors || []).includes(state.error)) return false;
    if (!query) return true;
    const hay = [row.ticker, row.notes, row.tags, row.setup, row.result, row.direction, row.pnlRaw]
      .join("\n")
      .toLowerCase();
    return hay.includes(query);
  });
}

function compare(a, b) {
  const dir = state.order === "asc" ? 1 : -1;
  const key = state.sort;
  const va = valueOf(a, key);
  const vb = valueOf(b, key);
  if (va == null && vb == null) return (b.id - a.id) * (state.order === "asc" ? -1 : 1);
  if (va == null) return 1;
  if (vb == null) return -1;
  if (typeof va === "number" && typeof vb === "number") {
    if (va !== vb) return (va - vb) * dir;
  } else if (String(va) !== String(vb)) {
    return String(va) < String(vb) ? -dir : dir;
  }
  return b.id - a.id;
}

function valueOf(row, key) {
  if (key === "date") return row.dated ? row.date : null;
  if (key === "ticker") return row.ticker.toLowerCase();
  if (key === "dir") return row.dir;
  if (key === "entry") return row.entry;
  if (key === "pnl") return row.pnl;
  if (key === "process") return row.ok ? 1 : 0;
  return row.date;
}

function escalationText(row) {
  const info = row.escalation;
  if (!info || info.multiple == null) {
    if (!row.dated) return "Not recorded";
    if (row.shares == null && row.plannedRisk == null) return "Not recorded";
    return "Not enough history";
  }
  const bits = [`${info.multiple.toFixed(2)}× ${info.metricName}`];
  if (info.flagged) bits.push("escalation");
  if (info.afterStreak) bits.push(`after ${info.streak} wins`);
  return bits.join(" · ");
}

function sideLabel(row) {
  if (row.dir === "short") return "Short";
  if (row.dir === "long") return "Long";
  return "Other";
}

function pnlCell(row) {
  if (row.pnl == null) {
    const raw = (row.pnlRaw || "not stated").trim();
    const short = raw.length > 28 ? raw.slice(0, 26) + "…" : raw;
    return h("span", { class: "muted", title: raw }, short || "—");
  }
  return h("span", { class: cls(row.pnl) }, money(row.pnl, { sign: true }));
}

function detail(row) {
  const pairs = [
    ["Result", row.result],
    ["Setup", row.setup],
    ["Time", row.todRaw],
    ["Holding", row.holding],
    ["Size", row.size],
    ["Exit", row.exit],
    ["Tags", row.tags],
    ["Account", row.account],
    ["Source", row.source],
    ["Planned stop", row.stop == null ? "Not recorded" : price(row.stop)],
    ["Planned risk", row.plannedRisk == null ? "Not recorded" : `${money(row.plannedRisk)} (${row.plannedRiskSource})`],
    ["Idea", row.ideaExplicit ? row.ideaLabel : `${row.ideaLabel} · assumed, one ticker per day`],
    ["Open risk", row.openRisk == null ? "Not recorded" : money(row.openRisk)],
    ["Setup class", `${row.quality} · ${row.qualitySource}`],
    ["Execution error", (row.qualityErrors || []).length ? row.qualityErrors.join(", ") : "Not recorded"],
    ["Size reason", row.sizeReason || "Not recorded"],
    ["Size versus baseline", escalationText(row)],
    ["Costs", row.cost ? `${money(row.cost)} · ${row.costSource}` : row.costSource === "none" ? "Not recorded" : money(row.cost || 0)],
  ];
  const flags = RULES.filter((r) => row.overrides[r.id]).map((r) => `${r.short}: ${row.overrides[r.id]}`);
  return h("div", { class: "detail-body" },
    h("dl", {}, pairs.flatMap(([k, v]) => (v ? [h("dt", {}, k), h("dd", {}, v)] : []))),
    flags.length ? h("p", { class: "checklist-note" }, "Checklist on this row. " + flags.join(" · ")) : null,
    row.notes ? h("p", { class: "notes" }, row.notes) : h("p", { class: "muted" }, "No note."),
  );
}

const SORT_LABELS = {
  date: "Date",
  ticker: "Ticker",
  dir: "Side",
  entry: "Entry",
  pnl: "P&L",
  process: "Process",
};

function headerCell(key, label) {
  return h("th", { scope: "col" },
    h("button", {
      type: "button",
      class: "sort",
      "data-sort": key,
      onClick: (event) => {
        event.stopPropagation();
        if (state.sort === key) state.order = state.order === "asc" ? "desc" : "asc";
        else {
          state.sort = key;
          state.order = key === "ticker" || key === "dir" ? "asc" : "desc";
        }
        paint();
      },
    }, label),
  );
}

function syncSort() {
  document.querySelectorAll("button.sort").forEach((btn) => {
    const key = btn.dataset.sort;
    const on = state.sort === key;
    const arrow = on ? (state.order === "asc" ? " ↑" : " ↓") : "";
    btn.textContent = (SORT_LABELS[key] || key) + arrow;
    btn.closest("th")?.setAttribute("aria-sort", on ? (state.order === "asc" ? "ascending" : "descending") : "none");
  });
}

function paint() {
  syncSort();
  const rows = filtered().sort(compare);
  const count = document.getElementById("trade-count");
  const universe = pool().length;
  if (count) {
    const extras = [];
    if (state.risk !== "all") extras.push(state.risk === "proxy" ? "loss > $50 proxy" : state.risk);
    if (state.error) extras.push(state.error);
    count.textContent = `Showing ${rows.length} of ${universe} in this window${extras.length ? " · " + extras.join(" · ") : ""}`;
  }
  const body = document.getElementById("trade-body");
  if (!body) return;
  if (!rows.length) {
    body.replaceChildren(h("tr", { class: "empty-row" }, h("td", { colspan: "7", class: "empty-cell", "data-label": "" }, "No trades match these filters.")));
    return;
  }
  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const open = state.openId === row.id;
    const toggle = () => {
      state.openId = open ? null : row.id;
      paint();
      document.querySelector(`#trade-body tr[data-id="${row.id}"]`)?.focus();
    };
    const tr = h("tr", {
      class: (row.ok ? "is-clean" : "is-broke") + (row.paper ? " is-paper" : "") + (open ? " is-open" : ""),
      tabindex: "0",
      "data-id": String(row.id),
      onClick: toggle,
      onKeydown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      },
    },
      h("td", { "data-label": "Date" }, row.dated ? prettyDate(row.date) : "Undated"),
      h("td", { "data-label": "Ticker", class: "ticker" }, row.ticker),
      h("td", { "data-label": "Side", title: row.direction }, sideLabel(row)),
      h("td", { "data-label": "Entry", title: row.entryRaw }, price(row.entry)),
      h("td", { "data-label": "P&L" }, pnlCell(row)),
      h("td", { "data-label": "Process" },
        row.paper ? h("span", { class: "pill paper" }, "Paper") : null,
        h("span", { class: "pill " + (row.ok ? "ok" : "bad") }, row.ok ? "Clean" : "Broke"),
      ),
      h("td", { "data-label": "Broke" }, row.rules.length ? row.rules.map((id) => RULES.find((r) => r.id === id).short).join(", ") : "—"),
    );
    frag.append(tr);
    if (open) {
      frag.append(h("tr", { class: "detail" },
        h("td", { colspan: "7", "data-label": "" }, detail(row)),
      ));
    }
  }
  body.replaceChildren(frag);
}

function build() {
  const main = document.getElementById("main");
  const ruleOptions = [h("option", { value: "all" }, "Any rule")].concat(
    RULES.map((r) => h("option", { value: r.id }, r.short)),
  );
  main.replaceChildren(
    h("header", { class: "page-head" },
      h("h1", { class: "page-title" }, "Trades"),
      h("p", { class: "lede" }, "Every live row in the log. Paper stays out unless you ask for it. Open a row for the note."),
    ),
    h("div", { class: "filters" },
      h("label", {}, "Search",
        h("input", {
          id: "q",
          type: "search",
          placeholder: "Ticker, notes, tags",
          value: state.q,
          onInput: (event) => {
            state.q = event.target.value;
            writeQuery();
            paint();
          },
        }),
      ),
      h("label", {}, "Side",
        h("select", {
          id: "dir",
          onChange: (event) => {
            state.dir = event.target.value;
            writeQuery();
            paint();
          },
        },
          h("option", { value: "all" }, "All"),
          h("option", { value: "short" }, "Short"),
          h("option", { value: "long" }, "Long"),
          h("option", { value: "other" }, "Other"),
        ),
      ),
      h("label", {}, "Process",
        h("select", {
          id: "process",
          onChange: (event) => {
            state.process = event.target.value;
            writeQuery();
            paint();
          },
        },
          h("option", { value: "all" }, "All"),
          h("option", { value: "clean" }, "Clean"),
          h("option", { value: "broke" }, "Broke a rule"),
        ),
      ),
      h("label", {}, "Broke",
        h("select", {
          id: "rule",
          onChange: (event) => {
            state.rule = event.target.value;
            writeQuery();
            paint();
          },
        }, ruleOptions),
      ),
      h("label", {}, "Class",
        h("select", {
          id: "class",
          onChange: (event) => {
            state.klass = event.target.value;
            state.error = "";
            writeQuery();
            paint();
          },
        },
          h("option", { value: "all" }, "All"),
          h("option", { value: "A" }, "A"),
          h("option", { value: "B" }, "B"),
          h("option", { value: "C" }, "C"),
        ),
      ),
      h("label", { class: "check" },
        h("input", {
          id: "paper",
          type: "checkbox",
          onChange: (event) => {
            state.paper = event.target.checked;
            writeQuery();
            paint();
          },
        }),
        "Show paper",
      ),
    ),
    h("p", { id: "trade-count", class: "trade-count" }, ""),
    h("div", { class: "table-wrap" },
      h("table", { class: "trades" },
        h("thead", {},
          h("tr", {},
            headerCell("date", "Date"),
            headerCell("ticker", "Ticker"),
            headerCell("dir", "Side"),
            headerCell("entry", "Entry"),
            headerCell("pnl", "P&L"),
            headerCell("process", "Process"),
            h("th", { scope: "col" }, "Broke"),
          ),
        ),
        h("tbody", { id: "trade-body" }),
      ),
    ),
  );
  document.getElementById("dir").value = state.dir;
  document.getElementById("process").value = state.process;
  document.getElementById("rule").value = state.rule;
  document.getElementById("paper").checked = state.paper;
  document.getElementById("class").value = state.klass;
  chromeReady = true;
}

function render(view) {
  latest = view;
  if (!state.ready) {
    readQuery();
    state.ready = true;
  }
  if (!chromeReady) build();
  paint();
}

boot(render);
