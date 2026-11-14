import { boot } from "./shell.js";
import { drawLine, drawVBars, drawHBars, drawRatio } from "./charts.js";
import { h } from "./dom.js";
import { cls, money, monthLabel, num, pct, prettyDate, shortMonth } from "./format.js";

function stat(label, value, key, note, tone) {
  return h("article", { class: "kpi" },
    h("h2", {}, label),
    h("p", { class: "kpi-value " + (tone || ""), "data-stat": key }, value),
    note ? h("p", { class: "kpi-note" }, note) : null,
  );
}

function meter(pctValue, extra) {
  const width = Math.max(0, Math.min(100, pctValue));
  return h("div", { class: "meter " + (extra || ""), "aria-hidden": "true" },
    h("span", { style: { width: width + "%" } }),
  );
}

function hero(view) {
  const t = view.trades;
  const d = view.days;
  const p = view.pnl;
  return h("section", { class: "hero" },
    h("article", { class: "card hero-card" },
      h("p", { class: "eyebrow" }, "Primary process KPI"),
      h("h1", {}, "Execution compliance"),
      h("p", { class: "hero-pct", "data-stat": "compliance-trades" }, pct(t.pct)),
      h("p", { class: "hero-of" }, "of trades had zero rule violations"),
      h("p", { class: "hero-sub" }, `${t.ok} of ${t.n} live trades`),
      meter(t.pct, "meter-trade"),
      h("p", { class: "day-line" },
        h("strong", { "data-stat": "compliance-days" }, pct(d.pct)),
        ` of days · ${d.ok} of ${d.n} with a clean card`,
      ),
      meter(d.pct, "meter-day"),
    ),
    h("article", { class: "card outcome-card" },
      h("p", { class: "eyebrow" }, "Outcomes · gross"),
      h("h2", { class: "sr-only" }, "Outcome KPIs"),
      h("p", { class: "outcome-value " + cls(p.n ? p.net : null), "data-stat": "net" }, p.n ? money(p.net) : "—"),
      h("p", { class: "outcome-label" }, "Net P&L"),
      h("p", { class: "outcome-note" }, "Gross, as written in the journal. Not a brokerage statement."),
      h("p", { class: "outcome-value outcome-value-2 " + cls(p.n ? p.exp : null), "data-stat": "expectancy" }, p.n ? money(p.exp) : "—"),
      h("p", { class: "outcome-label" }, "Expectancy per trade"),
      h("p", { class: "outcome-note" }, p.n ? `${p.n} trades with a dollar P&L` : "No numeric P&L in this window"),
    ),
  );
}

function kpis(view) {
  const p = view.pnl;
  const flat = p.flat ? ` · ${p.flat} flat` : "";
  return h("section", { class: "kpis", "aria-label": "Secondary outcome stats" },
    stat("Win rate", pct(p.wr), "winrate", `${p.wins} wins · ${p.losses} losses${flat}`),
    stat("Avg win", money(p.avgWin), "avgwin", "Mean of the winning trades"),
    stat("Avg loss", money(p.avgLoss), "avgloss", "Mean size of a losing trade"),
    stat("Profit factor", p.pf == null ? "—" : num(p.pf, 2), "pf", "Gross wins ÷ gross losses"),
  );
}

function sideCard(title, tone, block, lines) {
  return h("article", { class: "card side " + tone },
    h("h3", {}, title),
    h("p", { class: "side-pnl " + cls(block.net), "data-stat": tone === "clean" ? "clean-pnl" : "broke-pnl" }, money(block.net, { sign: true })),
    h("p", { class: "side-meta", "data-stat": tone === "clean" ? "clean-n" : "broke-n" },
      `${block.n} trade${block.n === 1 ? "" : "s"} with a dollar P&L`,
    ),
    h("dl", { class: "side-dl" }, lines.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])),
  );
}

function insight(view) {
  const scoredNote = `${view.pnl.n} trades have a dollar P&L (${view.clean.n} clean, ${view.broke.n} not). Compliance above counts all ${view.trades.n} live trades${view.excludedPnl ? `, including ${view.excludedPnl} with no numeric P&L` : ""}.`;
  return h("section", { class: "insight-wrap" },
    h("div", { class: "section-head" },
      h("h2", {}, "Clean process against a broken one"),
      h("p", {}, "Same market, same journal. The split is whether the row carried a rule violation."),
    ),
    h("div", { class: "insight" },
      sideCard("Compliant", "clean", view.clean, [
        ["Expectancy", money(view.clean.exp, { sign: true })],
        ["Win rate", pct(view.clean.wr)],
        ["Avg loss", money(view.clean.avgLoss)],
      ]),
      sideCard("Broke a rule", "broke", view.broke, [
        ["Expectancy", money(view.broke.exp, { sign: true })],
        ["Win rate", pct(view.broke.wr)],
        ["Avg loss", money(view.broke.avgLoss)],
      ]),
    ),
    h("p", { class: "fine" }, scoredNote),
  );
}

function queryLink(extra) {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const s = params.toString();
  return "trades.html" + (s ? "?" + s : "");
}

function costPanel(view) {
  const gross = view.costs.gross;
  const net = view.costs.net;
  return h("section", { class: "card" },
    view.costs.configured
      ? null
      : h("p", { class: "banner" }, "Costs not configured, P&L is gross."),
    h("div", { class: "card-head" },
      h("h2", {}, "Gross and net"),
      h("p", {}, view.costs.configured
        ? "Net subtracts a row’s commission, fees, and locate cost when those cells are filled, otherwise the rates in data/config.json. Locates in the config apply to shorts."
        : "Set data/config.json, or fill commission, fees, and locate_cost on a row, and this becomes net of costs."),
    ),
    h("div", { class: "kpis cost-kpis" },
      stat("Gross P&L", gross.n ? money(gross.net) : "—", "gross-pnl", "Before costs"),
      stat("Net P&L", net.n ? money(net.net) : "—", "net-pnl", view.costs.configured ? "After recorded and assumed costs" : "Same as gross until costs are set"),
      stat("Gross expectancy", gross.n ? money(gross.exp) : "—", "gross-exp", "Per scored trade"),
      stat("Net expectancy", net.n ? money(net.exp) : "—", "net-exp", "Per scored trade"),
    ),
    h("p", { class: "fine" },
      `Break-even cost per trade ${gross.n ? money(gross.exp) : "—"}. That is gross expectancy: costs larger than this, on a typical trade, erase the edge.`,
    ),
  );
}

function qualityPanel(view) {
  return h("section", { class: "stack" },
    h("div", { class: "section-head" },
      h("h2", {}, "Setup quality"),
      h("p", {}, "A is a valid setup executed correctly. B is a valid setup executed poorly. C is an invalid or impulsive setup. Historical letters are derived from tags and labeled as such. A quiet tag list becomes A, so A is an upper bound."),
    ),
    h("div", { class: "quality" },
      view.quality.classes.map((item) => h("a", { class: "card quality-card", href: queryLink({ class: item.id, error: "" }) },
        h("p", { class: "quality-letter" }, item.id),
        h("h3", {}, item.label),
        h("p", { class: "quality-pnl " + cls(item.n ? item.net : null) }, item.n ? money(item.net, { sign: true }) : "Not recorded"),
        h("p", { class: "fine" }, `${item.trades} trades · expectancy ${item.n ? money(item.exp, { sign: true }) : "—"}`),
        h("p", { class: "fine" }, item.recorded ? `${item.recorded} from the checklist · ${item.derived} derived` : "All derived"),
      )),
    ),
    h("section", { class: "card" },
      h("div", { class: "card-head" },
        h("h2", {}, "Where the B trades broke down"),
        h("p", {}, "Execution error on class B only. A trade with two tags is counted in both, so the columns are not a split of the B total."),
      ),
      h("div", { class: "breach-list" },
        view.quality.breakdown.map((err) => h("a", { class: "breach", href: queryLink({ class: "B", error: err.id }) },
          h("span", { class: "breach-name" }, err.label),
          h("span", { class: "breach-count" }, `${err.count} trades`),
          h("span", { class: "breach-pnl " + cls(err.n ? err.net : null) }, err.n ? money(err.net, { sign: true }) : "Not recorded"),
        )),
      ),
    ),
  );
}

function escalationPanel(view, canvas) {
  const flag = view.escalation.flagged;
  const normal = view.escalation.normal;
  const reasons = view.escalation.reasons;
  return h("section", { class: "stack" },
    h("div", { class: "section-head" },
      h("h2", {}, "Size escalation"),
      h("p", {}, "A trade is flagged above 1.5× the median of the previous 20 trades. Planned risk is the measure when it was recorded and there is a risk baseline; otherwise the measure is share size. This flag does not change the compliance rate. The first 20 dated trades have no baseline."),
    ),
    h("div", { class: "insight" },
      h("article", { class: "card side broke" },
        h("h3", {}, "Escalated"),
        h("p", { class: "side-pnl " + cls(flag.n ? flag.net : null) }, flag.n ? money(flag.net, { sign: true }) : "Not recorded"),
        h("p", { class: "side-meta" }, `${flag.trades} trades · expectancy ${flag.n ? money(flag.exp, { sign: true }) : "—"}`),
        h("p", { class: "fine" }, `${flag.afterStreak} of ${flag.trades} came after 2 or more consecutive wins.`),
      ),
      h("article", { class: "card side clean" },
        h("h3", {}, "Inside the baseline"),
        h("p", { class: "side-pnl " + cls(normal.n ? normal.net : null) }, normal.n ? money(normal.net, { sign: true }) : "Not recorded"),
        h("p", { class: "side-meta" }, `${normal.trades} trades · expectancy ${normal.n ? money(normal.exp, { sign: true }) : "—"}`),
        h("p", { class: "fine" }, `${view.escalation.unmeasured} trades have no baseline yet, or no recorded size.`),
      ),
    ),
    h("section", { class: "card chart-card" },
      h("div", { class: "card-head" },
        h("h2", {}, "Size and risk versus baseline"),
        h("p", {}, "Log scale. The dashed line is 1.5×. Red dots are escalations. Historical rows compare share size, because planned risk was not recorded."),
      ),
      canvas,
      h("p", { class: "fine" }, `Reason on escalations — planned ${reasons.planned}, A+ setup ${reasons.aplus}, emotional ${reasons.emotional}, other ${reasons.other}, not recorded ${reasons.unrecorded}.`),
    ),
  );
}

function chartCard(title, note, canvas, wide) {
  return h("section", { class: "card chart-card" + (wide ? " span-2" : "") },
    h("div", { class: "card-head" },
      h("h2", {}, title),
      note ? h("p", {}, note) : null,
    ),
    canvas,
  );
}

function hintMoney(label, value, extra) {
  return `${label} · ${money(value, { sign: true })}${extra ? " · " + extra : ""}`;
}

function breaches(view) {
  const q = new URLSearchParams(location.search);
  const split = [view.riskSplit.planned, view.riskSplit.slippage, view.riskSplit.proxy];
  const rows = view.rules
    .filter((rule) => rule.id !== "risk50")
    .concat(split)
    .sort((a, b) => a.pnl - b.pnl || b.count - a.count);
  return h("section", { class: "card" },
    h("div", { class: "card-head" },
      h("h2", {}, "Where the rules broke"),
      h("p", {}, "A trade can break more than one rule, so these dollars are not a partition of the loss."),
    ),
    h("div", { class: "breach-list" },
      rows.map((rule) => {
        const params = new URLSearchParams(q);
        if (rule.id === "risk-planned" || rule.id === "risk-slip" || rule.id === "risk-proxy") {
          params.set("risk", rule.id === "risk-planned" ? "planned" : rule.id === "risk-slip" ? "slippage" : "proxy");
        } else params.set("rule", rule.id);
        return h("a", { class: "breach", href: "trades.html?" + params.toString() },
          h("span", { class: "breach-name" }, rule.short),
          h("span", { class: "breach-count" }, `${rule.count} flagged`),
          h("span", { class: "breach-pnl " + cls(rule.pnl) }, rule.withPnl ? money(rule.pnl, { sign: true }) : "—"),
        );
      }),
    ),
  );
}

function render(view) {
  const main = document.getElementById("main");
  if (!view.trades.n) {
    main.replaceChildren(
      h("div", { class: "card empty" },
        h("h1", {}, "No trades in this window"),
        h("p", {}, "Widen the dates, or choose All. Undated journal rows only appear in All time."),
      ),
    );
    return;
  }

  const cum = h("div", { class: "chart-canvas" });
  const monthly = h("div", { class: "chart-canvas" });
  const comp = h("div", { class: "chart-canvas" });
  const price = h("div", { class: "chart-canvas" });
  const hist = h("div", { class: "chart-canvas" });
  const dow = h("div", { class: "chart-canvas" });
  const tod = h("div", { class: "chart-canvas" });
  const losers = h("div", { class: "chart-canvas" });
  const winners = h("div", { class: "chart-canvas" });
  const ratio = h("div", { class: "chart-canvas" });

  const undatedNote = view.undated.n
    ? `${view.undated.n} undated trade${view.undated.n === 1 ? "" : "s"} (${money(view.undated.pnl, { sign: true })}) sit in the totals and are left off this line.`
    : "Each point is one calendar day. The line is the running sum of gross P&L.";

  const worst = view.tickers.filter((t) => t.pnl < 0).slice(0, 8);
  const best = view.tickers.filter((t) => t.pnl > 0).slice(-8).reverse();

  main.replaceChildren(
    h("div", { class: "dashboard" },
      hero(view),
      kpis(view),
      costPanel(view),
      insight(view),
      qualityPanel(view),
      escalationPanel(view, ratio),
      h("div", { class: "chart-grid" },
        chartCard("Cumulative gross P&L", undatedNote, cum, true),
        chartCard("Monthly gross P&L", "Sum of numeric P&L. Undated rows are not in a month.", monthly),
        chartCard("Compliance by month", "Share of that month’s trades with zero violations.", comp),
        chartCard("P&L by entry price", "Under $10 versus $10 and up, from the first number in the entry column.", price),
        chartCard("Win / loss distribution", "Count of trades in each gross P&L bucket. Zero sits with the small wins.", hist),
        chartCard("Day of week", "Gross P&L by the weekday on the row.", dow),
        chartCard("Time of day", "Open is 9:30–10:00. Morning is 10:00–10:30. Late morning is after 10:30, his zombie time.", tod),
        chartCard("Tickers that cost the most", "Worst eight symbols by gross P&L.", losers),
        chartCard("Tickers that paid the most", "Best eight symbols by gross P&L.", winners),
      ),
      breaches(view),
      h("aside", { class: "callout" },
        h("h2", {}, "How to read the compliance rate"),
        h("p", {}, "Historical compliance is inferred from mistakes tags, notes, and the dollar result. It is not a checklist filled out at the time, and a quiet note can look like a clean trade. Treat the percentage as an upper bound. A row that carries the optional Y/N rule columns uses those answers instead of the inference, one rule at a time."),
      ),
    ),
  );

  drawLine(cum, {
    label: `Cumulative gross P&L, ending ${money(view.daily.at(-1)?.cum || 0)}`,
    points: view.daily.map((d) => ({ date: d.date, y: d.cum, pnl: d.pnl })),
  });
  drawVBars(monthly, {
    label: "Monthly gross P&L",
    rotate: true,
    bars: view.monthly.map((m, i, all) => ({
      label: shortMonth(m.month, i, all.map((x) => x.month)),
      value: m.pnl,
      hint: `${monthLabel(m.month)} · ${money(m.pnl, { sign: true })} · ${m.trades} trades`,
    })),
  });
  drawVBars(comp, {
    label: "Compliance by month",
    rotate: true,
    domain: [0, 100],
    formatTick: (v) => Math.round(v) + "%",
    bars: view.monthly.map((m, i, all) => ({
      label: shortMonth(m.month, i, all.map((x) => x.month)),
      value: m.tradePct,
      color: "accent",
      hint: `${monthLabel(m.month)} · ${pct(m.tradePct)} of trades (${m.cleanTrades}/${m.trades}) · ${pct(m.dayPct)} of days (${m.cleanDays}/${m.days})`,
    })),
  });
  drawHBars(price, {
    label: "P&L by entry price",
    labelWidth: 150,
    bars: view.prices.map((p) => ({
      label: p.label,
      value: p.pnl,
      hint: hintMoney(p.label, p.pnl, `${p.n} trades · ${p.wins} wins`),
    })),
  });
  drawVBars(hist, {
    label: "Win and loss distribution",
    rotate: true,
    formatTick: (v) => String(Math.round(v)),
    bars: view.hist.map((b) => ({
      label: b.label,
      value: b.n,
      color: b.side === "neg" ? "bad" : "good",
      hint: `${b.label} · ${b.n} trade${b.n === 1 ? "" : "s"}`,
    })),
  });
  drawHBars(dow, {
    label: "P&L by weekday",
    labelWidth: 48,
    bars: view.dow.map((d) => ({
      label: d.label,
      value: d.pnl,
      hint: hintMoney(d.label, d.pnl, `${d.n} trades · ${d.wins} wins`),
    })),
  });
  drawHBars(tod, {
    label: "P&L by time of day",
    labelWidth: 120,
    bars: view.tod.map((d) => ({
      label: d.label,
      value: d.pnl,
      hint: hintMoney(d.label, d.pnl, `${d.n} trades · ${d.wins} wins`),
    })),
  });
  const tickerBar = (t) => ({
    label: t.ticker,
    value: t.pnl,
    hint: hintMoney(t.ticker, t.pnl, `${t.n} trades · ${t.wins} wins`),
  });
  drawHBars(losers, { label: "Weakest tickers", labelWidth: 64, bars: worst.map(tickerBar) });
  drawHBars(winners, { label: "Strongest tickers", labelWidth: 64, bars: best.map(tickerBar) });
  drawRatio(ratio, {
    label: "Trade size or planned risk divided by the rolling baseline",
    points: view.escalation.series,
  });

  // Keep the last trade date available to the header readout's neighbors.
  const foot = document.querySelector(".site-footer p");
  if (foot) {
    foot.textContent = `Log through ${prettyDate(view.maxDate)} · ${view.trades.n} live trades in this window · gross dollars.`;
  }
}

boot(render);
