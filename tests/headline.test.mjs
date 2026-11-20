import assert from "node:assert/strict";
import fs from "node:fs";
import { analyze, isEvalAccount, parseTrades } from "../js/engine.js";
import { money, pct, pyRound } from "../js/format.js";

const csv = fs.readFileSync(new URL("../data/trades.csv", import.meta.url), "utf8");
const config = JSON.parse(fs.readFileSync(new URL("../data/config.json", import.meta.url), "utf8"));
const records = parseTrades(csv);
const historicalRecords = records.filter((row) => !isEvalAccount(row.account));
const view = analyze(historicalRecords, {});
const all = analyze(records, {}, config);
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/compliance.json", import.meta.url), "utf8"));

function $(n) {
  return pyRound(n, 2);
}

test("the log parses, including the paper row", () => {
  assert.equal(records.length, 292);
  assert.equal(records.filter((r) => r.paper).length, 1);
  assert.equal(view.live.length, 288);
  assert.equal(all.live.length, 291);
  assert.ok(csv.includes("rule_confirmation"));
  assert.ok(csv.includes("rule_three_stops"));
});

test("every live trade matches the review script's flags and P&L", () => {
  const byId = new Map(view.live.map((r) => [r.id, r]));
  assert.equal(byId.size, fixture.length);
  for (const exp of fixture) {
    const row = byId.get(exp.id);
    assert.ok(row, "missing id " + exp.id);
    assert.equal(row.ok, exp.ok, "ok " + exp.id);
    assert.deepEqual([...row.v].sort(), [...exp.v].sort(), "rules " + exp.id);
    if (exp.pnl == null) assert.equal(row.pnl, null, "pnl " + exp.id);
    else assert.equal(row.pnl, exp.pnl, "pnl " + exp.id);
  }
});

test("headline numbers", () => {
  assert.equal(pct(view.trades.pct), "74.7%");
  assert.equal(view.trades.ok, 215);
  assert.equal(view.trades.n, 288);
  assert.equal(pct(view.days.pct), "60.6%");
  assert.equal(view.days.ok, 103);
  assert.equal(view.days.n, 170);

  const p = view.pnl;
  assert.equal($(p.net), 708.04);
  assert.equal(money(p.net), "$708.04");
  assert.equal($(p.exp), 2.78);
  assert.equal(money(p.exp), "$2.78");
  assert.equal(pct(p.wr), "83.9%");
  assert.equal($(p.avgWin), 13.2);
  assert.equal(money(p.avgWin), "$13.20");
  assert.equal($(p.avgLoss), 52.92);
  assert.equal(money(p.avgLoss), "$52.92");
  assert.equal($(p.pf), 1.33);
  assert.equal(p.n, 255);
  assert.equal(view.excludedPnl, 33);

  assert.equal(view.clean.n, 196);
  assert.equal($(view.clean.net), 2220.73);
  assert.equal(money(view.clean.net, { sign: true }), "+$2,220.73");
  assert.equal($(view.clean.exp), 11.33);

  assert.equal(view.broke.n, 59);
  assert.equal($(view.broke.net), -1512.69);
  assert.equal(money(view.broke.net, { sign: true }), "-$1,512.69");
  assert.equal($(view.broke.exp), -25.64);
});

test("per-rule counts and P&L", () => {
  const expect = {
    risk50: [10, -1825.06],
    stop3: [7, -921.43],
    confirm: [40, -713.38],
    revenge: [10, -683.34],
    noadd: [0, 0],
    plan: [25, -490.68],
    size: [7, 59.75],
    riskCap: [0, 0],
  };
  for (const rule of view.rules) {
    const [count, pnl] = expect[rule.id];
    assert.equal(rule.count, count, rule.id);
    assert.equal($(rule.pnl), pnl, rule.id);
  }
  assert.deepEqual(view.stopDays, [
    "2023-02-03",
    "2023-06-20",
    "2023-06-22",
    "2023-07-05",
    "2023-07-13",
    "2023-07-14",
  ]);
});

test("price, weekday, and timeline totals", () => {
  const price = Object.fromEntries(view.prices.map((p) => [p.id, p]));
  assert.equal($(price.under.pnl), 944.53);
  assert.equal(price.under.n, 201);
  assert.equal($(price.over.pnl), -301.08);
  assert.equal(price.over.n, 36);
  assert.equal($(price.unknown.pnl), 64.59);
  assert.equal(price.unknown.n, 18);

  const dow = Object.fromEntries(view.dow.map((d) => [d.label, d]));
  assert.equal($(dow.Mon.pnl), -164.55);
  assert.equal(dow.Mon.n, 37);
  assert.equal($(dow.Tue.pnl), 182.9);
  assert.equal(dow.Tue.n, 55);
  assert.equal($(dow.Wed.pnl), 414.03);
  assert.equal(dow.Wed.n, 46);
  assert.equal($(dow.Thu.pnl), -382.37);
  assert.equal(dow.Thu.n, 61);
  assert.equal($(dow.Fri.pnl), 645.03);
  assert.equal(dow.Fri.n, 54);

  assert.equal(view.daily[0].date, "2022-05-24");
  assert.equal($(view.daily.at(-1).cum), 695.04);
  assert.equal(view.daily.length, 148);
  assert.equal($(view.monthly.find((m) => m.month === "2022-05").pnl), -0.08);
  assert.equal($(view.monthly.find((m) => m.month === "2023-06").pnl), 696.72);
  assert.equal($(view.monthly.find((m) => m.month === "2023-07").pnl), -672.51);
  assert.equal($(view.monthly.reduce((s, m) => s + m.pnl, 0)), 695.04);
  assert.equal(view.undated.n, 2);
  assert.equal($(view.undated.pnl), 13);
  assert.equal(view.hist.reduce((s, b) => s + b.n, 0), 255);
});

test("time of day buckets cover every numeric trade", () => {
  const tod = Object.fromEntries(view.tod.map((t) => [t.label, t]));
  assert.equal($(tod.Premarket.pnl), 274.21);
  assert.equal(tod.Premarket.n, 59);
  assert.equal($(tod.Open.pnl), 529.16);
  assert.equal(tod.Open.n, 143);
  assert.equal($(tod.Morning.pnl), 105.56);
  assert.equal(tod.Morning.n, 20);
  assert.equal($(tod["Late morning"].pnl), 14.67);
  assert.equal(tod["Late morning"].n, 8);
  assert.equal($(tod.Afternoon.pnl), -11.08);
  assert.equal(tod.Afternoon.n, 4);
  assert.equal($(tod["Not recorded"].pnl), -204.48);
  assert.equal(tod["Not recorded"].n, 21);
});

test("a dated window drops undated rows and keeps the same rules", () => {
  const june = analyze(historicalRecords, { from: "2023-06-01", to: "2023-06-30" });
  assert.equal(june.undated.n, 0);
  assert.ok(june.live.length > 0);
  assert.ok(june.live.every((r) => r.date.startsWith("2023-06")));
  const back = analyze(historicalRecords, {});
  assert.equal(back.trades.ok, 215);
});

test("explicit Y/N columns override the inferred flag and nothing else", () => {
  const header = [
    "id,date,day_of_week,ticker,account,direction,entry,exit,size,pnl,result,setup,time_of_day,holding_time,mistakes_tags,notes,source_file",
    "rule_confirmation,rule_risk50,rule_no_revenge,rule_no_average,rule_three_stops,rule_stop_size,rule_plan",
  ].join(",");
  const line = (id, date, pnl, tags, notes, flags) =>
    [id, date, "Tue", "TEST", "live", "short", "4.00", "3.90", "100", pnl, pnl < 0 ? "loss" : "win", "bounce", "open (9:30-10:00)", "2m", tags, notes, "manual", ...flags].join(",");
  const blank = ["", "", "", "", "", "", ""];
  const text = [
    header,
    line(1, "2024-01-02", -80, "", "", blank),
    line(2, "2024-01-03", -80, "", "", ["", "Y", "", "", "", "", ""]),
    line(3, "2024-01-04", 10, "", "", ["", "", "", "", "", "", "N"]),
    line(4, "2024-01-05", -1, "", "", blank),
    line(5, "2024-01-05", -1, "", "", blank),
    line(6, "2024-01-05", -1, "", "", blank),
    line(7, "2024-01-05", -1, "", '"per-trip P&L [-1, -1]"', blank),
    line(8, "2024-01-08", 5, "early entry", "", ["Y", "", "", "", "", "", ""]),
  ].join("\n");
  const rows = analyze(parseTrades(text), {}).live;
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.ok(by[1].v.has("risk50"), "inferred risk50");
  assert.equal(by[2].v.has("risk50"), false, "Y clears risk50");
  assert.equal(by[2].ok, true);
  assert.ok(by[3].v.has("plan"));
  assert.equal(by[3].ok, false);
  // 4+5+6 are one loss each, row 7 is two losses via the per-trip list: 5 > 3.
  for (const id of [4, 5, 6, 7]) assert.ok(by[id].v.has("stop3"), "stop3 " + id);
  assert.equal(by[1].v.has("stop3"), false);
  assert.equal(by[8].v.has("confirm"), false, "Y clears a tag inference");
  assert.equal(by[8].ok, true);
});

test("new columns do not move the historical $50 proxy, and recorded risk is per idea", () => {
  assert.equal(view.riskSplit.proxy.count, 10);
  assert.equal($(view.riskSplit.proxy.pnl), -1825.06);
  assert.equal(view.riskSplit.planned.count, 0);
  assert.equal(view.riskSplit.slippage.count, 0);
  assert.equal(view.costs.configured, false);
  assert.equal($(view.costs.net.net), 708.04);
  assert.equal(view.ideas.every((idea) => idea.explicit === false), true);
  assert.ok(view.ideas.every((idea) => idea.planned == null));
  assert.equal(view.quality.classes.reduce((s, c) => s + c.trades, 0), 288);

  const header = [
    "id", "date", "day_of_week", "ticker", "account", "direction", "entry", "exit", "size", "pnl", "result", "setup",
    "time_of_day", "holding_time", "mistakes_tags", "notes", "source_file", "stop", "planned_risk", "idea_id",
    "setup_quality", "execution_error", "setup_valid", "size_reason", "commission",
  ].join(",");
  const line = (cells) => cells.join(",");
  const text = [
    header,
    line([1, "2024-03-01", "Fri", "AAA", "live", "short", "5.00", "5.80", "100 sh", -80, "loss", "wl line", "open", "1m", "", "", "m", "5.80", 80, "2024-03-01-AAA-1", "", "", "", "emotional", ""]),
    line([2, "2024-03-04", "Mon", "BBB", "live", "short", "5.00", "5.70", "100 sh", -70, "loss", "wl line", "open", "1m", "", "", "m", "5.40", 40, "2024-03-04-BBB-1", "", "", "", "", ""]),
    line([3, "2024-03-05", "Tue", "CCC", "live", "short", "5.00", "5.20", "40 sh", -8, "loss", "wl line", "open", "1m", "", "", "m", "5.75", 30, "2024-03-05-CCC-1", "", "", "", "", ""]),
    line([4, "2024-03-05", "Tue", "CCC", "live", "short", "5.40", "5.60", "40 sh", -8, "loss", "add", "open", "1m", "", "", "m", "6.15", 30, "2024-03-05-CCC-1", "", "", "", "", ""]),
    line([5, "2024-03-06", "Wed", "DDD", "live", "short", "4.00", "3.50", "100 sh", 50, "win", "wl line", "open", "1m", "", "", "m", "4.40", "", "2024-03-06-DDD-1", "", "", "Y", "", ""]),
    line([6, "2024-03-07", "Thu", "EEE", "live", "short", "2.00", "2.40", "10 sh", -4, "loss", "wl line", "open", "1m", "FOMO", "", "m", "", "", "", "", "", "", ""]),
    line([7, "2024-03-08", "Fri", "FFF", "live", "short", "2.00", "1.80", "10 sh", 2, "win", "wl line", "open", "1m", "early entry; cut winner early", "", "m", "", "", "", "B", "exit early", "", ""]),
  ].join("\n");
  const next = analyze(parseTrades(text), {});
  const by = Object.fromEntries(next.live.map((r) => [r.id, r]));
  assert.equal(by[1].riskKind, "planned");
  assert.equal(by[1].ok, false);
  assert.equal(by[1].plannedRisk, 80);
  assert.equal(by[2].riskKind, "slippage");
  assert.equal(by[2].v.has("risk50"), false);
  assert.equal(by[2].ok, true);
  assert.equal(by[3].riskKind, "planned");
  assert.equal(by[4].riskKind, "planned");
  assert.equal(by[3].ideaPlanned, 60);
  assert.equal(by[5].plannedRiskSource, "computed");
  assert.equal($(by[5].plannedRisk), 40);
  assert.equal(by[5].riskKind, "within");
  assert.equal(by[6].quality, "C");
  assert.equal(by[6].qualitySource, "derived");
  assert.equal(by[7].quality, "B");
  assert.equal(by[7].qualitySource, "recorded");
  assert.deepEqual(by[7].qualityErrors, ["exit"]);
  const priced = analyze(historicalRecords, {}, { commission_per_share: 0.01 });
  assert.equal(priced.costs.configured, true);
  assert.equal($(priced.pnl.net), 708.04);
  assert.ok(priced.costs.net.net < priced.costs.gross.net);
});

test("eval trades use grade caps and recorded fees, and the old book is unchanged", () => {
  assert.equal(pct(all.trades.pct), "74.6%");
  assert.equal(all.trades.ok, 217);
  assert.equal(all.trades.n, 291);
  assert.equal(pct(all.days.pct), "60.5%");
  assert.equal(all.days.ok, 104);
  assert.equal(all.days.n, 172);
  assert.equal($(all.pnl.net), 1226.34);
  assert.equal($(all.costs.net.net), 1202.44);
  assert.equal($(all.pnl.exp), 4.75);
  assert.equal($(all.costs.net.exp), 4.66);
  assert.equal(all.evalBook.trades.n, 3);
  assert.equal(all.evalBook.trades.ok, 2);
  assert.equal(pct(all.evalBook.trades.pct), "66.7%");
  assert.equal($(all.evalBook.gross.net), 518.3);
  assert.equal($(all.evalBook.gross.exp), 172.77);
  assert.equal($(all.evalBook.net.net), 494.4);
  assert.equal($(all.evalBook.net.exp), 164.8);
  assert.match(all.costs.banner, /Historical trades stay gross/);
  assert.equal(all.costs.historicalGross, true);

  const by = Object.fromEntries(all.live.map((row) => [row.id, row]));
  assert.equal(by[290].pnl, 284.3);
  assert.equal(by[290].plannedRisk, 251);
  assert.equal(by[290].stop, 4.04);
  assert.equal(by[290].fees, 10.8);
  assert.equal(by[290].quality, "A");
  assert.equal(by[290].qualitySource, "recorded");
  assert.equal(by[290].setupValid, "Y");
  assert.equal(by[290].ideaId, "2026-11-16-LXEO");
  assert.equal(by[290].riskGrade, "A");
  assert.equal(by[290].riskKind, "eval-over");
  assert.equal(by[290].ok, false);
  assert.equal($(by[290].netPnl), 273.5);
  assert.equal(by[291].pnl, 4.4);
  assert.equal(by[291].plannedRisk, 6.5);
  assert.equal(by[291].stop, 3);
  assert.equal(by[291].setupQuality, "");
  assert.equal(by[291].riskGrade, "ungraded");
  assert.equal(by[291].riskKind, "eval-within");
  assert.equal(by[291].ok, true);
  assert.equal($(by[291].cost), 1.5);
  assert.equal($(by[291].netPnl), 2.9);
  assert.equal(by[292].pnl, 229.6);
  assert.equal(by[292].stop, 3.01);
  assert.equal(by[292].plannedRisk, 200);
  assert.equal(by[292].fees, 11.6);
  assert.equal(by[292].quality, "A");
  assert.equal(by[292].setupValid, "Y");
  assert.equal(by[292].executionError, "");
  assert.equal(by[292].ideaId, "2026-11-17-GP");
  assert.equal(by[292].riskKind, "eval-within");
  assert.equal(by[292].ok, true);
  assert.equal($(by[292].cost), 11.6);
  assert.equal($(by[292].netPnl), 218);
  assert.equal(
    by[292].sizeReason,
    "planned scale-in starters (max 30 sh before confirmation) then planned 1000 sh after confirmation (broke under VWAP)",
  );
  const personal = analyze(parseTrades(csv).filter((row) => !isEvalAccount(row.account)), {}, config);
  assert.ok(personal.live.every((row) => row.cost === 0));

  const pricedFill = analyze(parseTrades([
    "id,date,day_of_week,ticker,account,direction,entry,exit,size,pnl,result,setup,time_of_day,holding_time,mistakes_tags,notes,source_file",
    "1,2026-11-20,Fri,ZZZ,Trade the Pool eval,short,S10@2.00,B10@1.80,10 sh,2,win,line,open,1m,,,src",
  ].join("\n")), {}, config);
  assert.equal($(pricedFill.live[0].cost), 1.5);
});

function test(name, fn) {
  try {
    fn();
    console.log("ok", name);
  } catch (err) {
    console.error("FAIL", name);
    throw err;
  }
}
