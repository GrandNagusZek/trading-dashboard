import { boot } from "./shell.js";
import { parseCSV } from "./engine.js";
import { h } from "./dom.js";
import { cls, money, prettyDate } from "./format.js";

function fillCaps(view) {
  const host = document.getElementById("eval-caps");
  const caps = view.riskCaps;
  if (!host || !caps) return;
  host.textContent = `Risk to the stop: A $${caps.A}, B $${caps.B}, C $${caps.C}.`;
}

function fillCounts(view) {
  const byId = Object.fromEntries(view.rules.map((r) => [r.id, r]));
  document.querySelectorAll("[data-count-for]").forEach((el) => {
    const rule = byId[el.dataset.countFor];
    if (!rule) return;
    el.replaceChildren();
    if (!rule.count) {
      el.textContent = "None flagged in this window.";
      return;
    }
    const dollars = rule.withPnl ? money(rule.pnl, { sign: true }) + " gross on the flagged rows that have a dollar P&L" : "no numeric P&L on the flagged rows";
    el.textContent = `${rule.count} trade${rule.count === 1 ? "" : "s"} flagged · ${dollars}`;
  });
}

function violations(view) {
  const body = document.getElementById("violations-body");
  if (!body) return;
  const q = new URLSearchParams(location.search);
  const shown = view.rules.flatMap((rule) =>
    rule.id === "risk50" ? [view.riskSplit.planned, view.riskSplit.slippage, view.riskSplit.proxy] : [rule],
  );
  body.replaceChildren(
    ...shown.map((rule) => {
      const params = new URLSearchParams(q);
      if (rule.id === "risk-planned" || rule.id === "risk-slip" || rule.id === "risk-proxy") {
        params.set("risk", rule.id === "risk-planned" ? "planned" : rule.id === "risk-slip" ? "slippage" : "proxy");
      } else params.set("rule", rule.id);
      return h("tr", {},
        h("th", { scope: "row" },
          h("span", { class: "rule-title" }, rule.name),
          h("span", { class: "rule-detail" }, rule.detail),
        ),
        h("td", { class: "num" }, String(rule.count)),
        h("td", { class: "num " + cls(rule.withPnl ? rule.pnl : 0) }, rule.withPnl ? money(rule.pnl, { sign: true }) : "—"),
        h("td", {}, h("a", { href: "trades.html?" + params.toString() }, "Trades")),
      );
    }),
  );
  const note = document.getElementById("violation-summary");
  if (note) {
    const broke = view.trades.n - view.trades.ok;
    note.textContent = `${broke} of ${view.trades.n} live trades in this window broke at least one rule. The counts above overlap.`;
  }
}

function missedInRange(row, view) {
  const date = (row.date || "").trim();
  const dated = /^\d{4}-\d\d-\d\d/.test(date);
  if (!view.from && !view.to) return true;
  if (!dated) return false;
  if (view.from && date < view.from) return false;
  if (view.to && date > view.to) return false;
  return true;
}

function missedCard(row) {
  const bits = [
    ["Planned entry", row.planned_entry],
    ["Stop", row.stop],
    ["Target", row.target],
    ["If taken", row.outcome_if_taken],
    ["Why it was skipped", row.reason_skipped],
    ["Lesson", row.lesson],
  ];
  return h("article", { class: "missed" },
    h("header", {},
      h("strong", {}, row.ticker || "—"),
      h("span", {}, row.direction || ""),
      h("time", {}, /^\d{4}-\d\d-\d\d/.test(row.date || "") ? prettyDate(row.date) : row.date || ""),
    ),
    h("dl", {}, bits.flatMap(([k, v]) => (v ? [h("dt", {}, k), h("dd", {}, v)] : []))),
  );
}

async function loadMissed(view) {
  const host = document.getElementById("missed");
  if (!host) return;
  try {
    const res = await fetch("data/missed_trades.csv", { cache: "no-cache" });
    if (!res.ok) throw new Error("data/missed_trades.csv returned " + res.status);
    const rows = parseCSV(await res.text()).filter((row) => missedInRange(row, view));
    if (!rows.length) {
      host.replaceChildren(h("p", { class: "muted" }, "No missed trades logged in this window."));
      return;
    }
    host.replaceChildren(
      h("p", { class: "missed-count" }, `${rows.length} missed trade${rows.length === 1 ? "" : "s"} in this window. Not a loss, and not in the compliance rate.`),
      ...rows.map(missedCard),
    );
  } catch (err) {
    host.replaceChildren(h("p", { class: "muted" }, err.message || "Could not read missed trades."));
  }
}

boot((view) => {
  fillCaps(view);
  fillCounts(view);
  violations(view);
  loadMissed(view);
});
