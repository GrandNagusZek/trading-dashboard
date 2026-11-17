/**
 * Trade log → compliance and performance.
 *
 * This is a direct port of the review script that produced the headline
 * numbers (compliance 74.7% of trades / 60.6% of days, net $708.04, …).
 * Do not "tidy" the tag tests or the stop-out threshold: substring matches
 * and `losses > 3` are what the historical figures are built on.
 *
 * Optional columns, when a cell is Y or N, override that one inferred flag:
 *   rule_confirmation, rule_risk50, rule_no_revenge, rule_no_average,
 *   rule_three_stops, rule_stop_size, rule_plan
 * Blank cells keep the inference. The CSV stays the only source of truth.
 *
 * Later columns (planned_risk, stop, idea_id, costs, setup_quality, …)
 * never invent values for a blank historical cell. They only change the
 * $50 classification when planned risk was actually recorded.
 */

export const RULES = [
  {
    id: "confirm",
    column: "rule_confirmation",
    name: "Confirmation before conviction / The second mouse gets the cheese",
    short: "Confirmation",
    detail:
      "Tag contains “early entry”, “chas” (chase / chasing), “fomo”, or “support”.",
  },
  {
    id: "size",
    column: "rule_stop_size",
    name: "The setup determines the stop. The stop determines the size.",
    short: "Stop / size",
    detail: "Tag contains “sizing”, “stop too tight”, or “no planned exit”.",
  },
  {
    id: "noadd",
    column: "rule_no_average",
    name: "Never add just to improve my average",
    short: "Averaging",
    detail: "Tag contains “average”, “averag”, or “add against”.",
  },
  {
    id: "revenge",
    column: "rule_no_revenge",
    name: "No revenge trades. No forced trades.",
    short: "Revenge",
    detail: "Tag contains “revenge”, “overtrad”, or “forced”.",
  },
  {
    id: "risk50",
    column: "rule_risk50",
    name: "Risk $50 maximum per idea, including adds and reentries",
    short: "Risk $50",
    detail:
      "Personal and historical trades only. Without a recorded planned risk, a numeric loss larger than $50 is the proxy. Once planned risk is on the row, the rule is judged per idea: planned risk over $50 is a violation, and a loss over $50 inside a $50 plan is slippage, not this flag. Trade the Pool eval trades use the grade cap instead.",
  },
  {
    id: "riskCap",
    column: "rule_risk_cap",
    name: "Eval risk to the stop, by setup grade",
    short: "Eval risk cap",
    detail:
      "Trade the Pool accounts only. A stop has to be written before entry, and planned risk has to sit at or under the cap for the grade written in the plan. Ungraded uses the C cap. If planned risk was not recorded, this check is not scored.",
  },
  {
    id: "stop3",
    column: "rule_three_stops",
    name: "Three stop-outs and I'm done",
    short: "Three stops",
    detail:
      "More than three losing round trips in that calendar day. Every losing row that day is flagged. A “per-trip P&L […]” list in the notes counts each negative trip; otherwise a losing row counts as one. A day that stops at exactly three is not flagged.",
  },
  {
    id: "plan",
    column: "rule_plan",
    name: "Stick to the plan",
    short: "Plan",
    detail:
      "Tag contains “broke plan”. This is not one of the lines of the code. It still counts toward the compliance rate, because the journal marks it as a breach.",
  },
];

const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));
const COLUMN_TO_RULE = Object.fromEntries(RULES.map((r) => [r.column, r.id]));

const HIST = [
  { label: "< −100", test: (p) => p < -100, side: "neg" },
  { label: "−100 to −50", test: (p) => p >= -100 && p < -50, side: "neg" },
  { label: "−50 to −20", test: (p) => p >= -50 && p < -20, side: "neg" },
  { label: "−20 to −5", test: (p) => p >= -20 && p < -5, side: "neg" },
  { label: "−5 to 0", test: (p) => p >= -5 && p < 0, side: "neg" },
  { label: "0 to 5", test: (p) => p >= 0 && p < 5, side: "pos" },
  { label: "5 to 20", test: (p) => p >= 5 && p < 20, side: "pos" },
  { label: "20 to 50", test: (p) => p >= 20 && p < 50, side: "pos" },
  { label: "50 to 100", test: (p) => p >= 50 && p < 100, side: "pos" },
  { label: "> 100", test: (p) => p >= 100, side: "pos" },
];

const DOW_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const TOD_ORDER = ["Premarket", "Open", "Morning", "Late morning", "Afternoon", "Not recorded"];

/** RFC 4180 CSV, including quoted commas and newlines. */
export function parseCSV(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  if (!rows.length) return [];
  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const o = {};
      header.forEach((h, i) => {
        o[h] = r[i] ?? "";
      });
      return o;
    });
}

function leadingNumber(s) {
  const m = /^\s*([+-]?\d+(?:\.\d+)?)/.exec(s || "");
  return m ? Number(m[1]) : null;
}

function entryPrice(s) {
  return leadingNumber((s || "").replace(/^(avg|sells avg|~)\s*/, ""));
}

function perTrip(notes) {
  const m = /per-trip P&L \[([^\]]*)\]/.exec(notes || "");
  if (!m) return null;
  return m[1]
    .split(",")
    .filter((x) => x.trim())
    .map((x) => Number(x));
}

function yn(raw) {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "y" || s === "yes" || s === "1" || s === "true") return "Y";
  if (s === "n" || s === "no" || s === "0" || s === "false") return "N";
  return null;
}

/** Share count from the size text. "100 sh total…" → 100. A bare number is accepted. Prose stays blank. */
export function parseShares(size) {
  const s = size || "";
  const withUnit = /(\d+(?:\.\d+)?)\s*sh\b/i.exec(s);
  if (withUnit) return Number(withUnit[1]);
  const bare = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(s);
  return bare ? Number(bare[1]) : null;
}

export const DEFAULT_COSTS = {
  commission_per_share: 0,
  min_per_order: 0,
  ecn_fees_per_share: 0,
  locate_per_share: 0,
  locate_per_trade: 0,
};

export const DEFAULT_RISK_CAPS = { A: 250, B: 100, C: 50 };

/** Trade the Pool eval accounts use grade caps, not the flat $50 journal rule. */
export function isEvalAccount(account) {
  return (account || "").includes("Trade the Pool");
}

export function recordedGrade(row) {
  const q = (row.setupQuality || "").trim().toUpperCase();
  return q === "A" || q === "B" || q === "C" ? q : null;
}

export const QUALITY_ERRORS = [
  { id: "entry", label: "Entry timing" },
  { id: "position", label: "Position management" },
  { id: "sizing", label: "Sizing" },
  { id: "exit", label: "Exit early" },
  { id: "held", label: "Held loser" },
];

const ERROR_ALIASES = {
  "entry timing": "entry",
  entry: "entry",
  "position management": "position",
  position: "position",
  sizing: "sizing",
  size: "sizing",
  "exit early": "exit",
  exit: "exit",
  "held loser": "held",
  held: "held",
};

function sizeReasonOf(raw) {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "planned" || s === "plan") return "planned";
  if (s === "a+" || s === "a+ setup" || s === "aplus" || s.includes("a+")) return "A+ setup";
  if (s.startsWith("emotion")) return "emotional";
  if (s === "other") return "other";
  return (raw || "").trim();
}

function executionErrorOf(raw) {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return null;
  return ERROR_ALIASES[s] || null;
}

function avoidSetup(text) {
  return /hot chick|said avoid|ignoring short|said ignore|non niche/.test(text || "");
}

/** Historical setup class. Explicit columns, applied by the caller, win over this. */
export function deriveQuality(tagsRaw, setupRaw) {
  const tags = (tagsRaw || "").toLowerCase();
  const setup = (setupRaw || "").toLowerCase();
  const blob = `${tags} ${setup}`;
  const impulsive =
    ["fomo", "revenge", "forced", "overtrad"].some((k) => tags.includes(k)) ||
    (tags.includes("chas") && avoidSetup(blob)) ||
    avoidSetup(setup);
  if (impulsive) return { quality: "C", errors: [] };

  const errors = [];
  if (tags.includes("early entry") || /short(?:ed|ing)\s+(?:at\s+)?support/.test(tags)) errors.push("entry");
  if (tags.includes("sizing")) errors.push("sizing");
  if (tags.includes("cut winner") || tags.includes("piked")) errors.push("exit");
  if (tags.includes("held loser")) errors.push("held");
  if (tags.includes("broke plan")) errors.push("position");
  if (errors.length) return { quality: "B", errors };
  return { quality: "A", errors: [] };
}

function attachQuality(row) {
  const recorded = (row.setupQuality || "").trim().toUpperCase();
  const recordedError = executionErrorOf(row.executionError);
  if (recorded === "A" || recorded === "B" || recorded === "C") {
    row.quality = recorded;
    row.qualitySource = "recorded";
    row.qualityErrors = recordedError ? [recordedError] : recorded === "B" ? deriveQuality(row.tags, row.setup).errors : [];
    return;
  }
  const derived = deriveQuality(row.tags, row.setup);
  if (row.setupValid === "N") {
    row.quality = "C";
    row.qualitySource = "recorded";
    row.qualityErrors = recordedError ? [recordedError] : [];
    return;
  }
  if (row.setupValid === "Y" && derived.quality === "C") {
    const fallback = deriveQuality(
      (row.tags || "").replace(/fomo|revenge|forced|overtrad|chas[a-z]*/gi, ""),
      row.setup,
    );
    row.quality = fallback.quality === "C" ? "A" : fallback.quality;
    row.qualitySource = "recorded";
    row.qualityErrors = recordedError ? [recordedError] : row.quality === "B" ? fallback.errors : [];
    return;
  }
  row.quality = derived.quality;
  row.qualitySource = "derived";
  row.qualityErrors = recordedError ? [recordedError] : derived.errors;
}

export function ideaIdentity(row) {
  if (row.ideaId) return { key: `id:${row.ideaId}`, label: row.ideaId, explicit: true };
  if (row.dated) return { key: `day:${row.date}|${row.ticker}`, label: `${row.date}-${row.ticker}`, explicit: false };
  return { key: `row:${row.id}`, label: `undated-${row.ticker}-${row.id}`, explicit: false };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function annotateEscalation(records) {
  const ordered = records
    .filter((r) => !r.paper && r.dated)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  const history = [];
  let streak = 0;
  for (const row of ordered) {
    const window = history.slice(-20);
    const sizes = window.map((h) => h.shares).filter((n) => n != null);
    const risks = window.map((h) => h.plannedRisk).filter((n) => n != null);
    const enough = history.length >= 20;
    const sizeBaseline = enough && sizes.length >= 5 ? median(sizes) : null;
    const riskBaseline = enough && risks.length >= 5 ? median(risks) : null;
    let metric = null;
    let baseline = null;
    let metricName = null;
    if (row.plannedRisk != null && riskBaseline != null) {
      metric = row.plannedRisk;
      baseline = riskBaseline;
      metricName = "planned risk";
    } else if (row.shares != null && sizeBaseline != null) {
      metric = row.shares;
      baseline = sizeBaseline;
      metricName = "shares";
    }
    const multiple = metric != null && baseline > 0 ? metric / baseline : null;
    row.escalation = {
      metricName,
      metric,
      baseline,
      multiple,
      flagged: multiple != null && multiple > 1.5,
      afterStreak: streak >= 2,
      streak,
      reason: row.sizeReason,
      history: enough ? "ready" : "short",
    };
    history.push(row);
    if (row.pnl == null) {
      /* unknown P&L neither extends nor breaks the streak */
    } else if (row.pnl > 0) streak += 1;
    else streak = 0;
  }
  for (const row of records) {
    if (!row.escalation) {
      row.escalation = {
        metricName: null,
        metric: null,
        baseline: null,
        multiple: null,
        flagged: false,
        afterStreak: false,
        streak: 0,
        reason: row.sizeReason,
        history: row.dated ? "short" : "undated",
      };
    }
  }
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeConfig(config) {
  const out = { ...DEFAULT_COSTS };
  for (const key of Object.keys(DEFAULT_COSTS)) {
    out[key] = numOr(config?.[key], 0);
  }
  const caps = config?.riskCapsByGrade || {};
  out.riskCapsByGrade = {
    A: numOr(caps.A, DEFAULT_RISK_CAPS.A),
    B: numOr(caps.B, DEFAULT_RISK_CAPS.B),
    C: numOr(caps.C, DEFAULT_RISK_CAPS.C),
  };
  out.accountCosts = Array.isArray(config?.accountCosts)
    ? config.accountCosts
        .filter((rule) => rule && rule.match)
        .map((rule) => ({
          match: String(rule.match),
          commission_per_share: numOr(rule.commission_per_share, 0),
          min_per_fill: numOr(rule.min_per_fill, 0),
        }))
    : [];
  return out;
}

function fillShareCounts(row) {
  const text = `${row.entryRaw || ""} ${row.exit || ""}`;
  return [...text.matchAll(/\b[SB](\d+(?:\.\d+)?)@/gi)].map((match) => Number(match[1]));
}

function explicitCost(row) {
  const parts = [row.commission, row.fees, row.locateCost].filter((n) => n != null);
  if (!parts.length) return null;
  return parts.reduce((sum, n) => sum + n, 0);
}

function applyGlobalCost(row, costs) {
  let cost = 0;
  let assumed = false;
  if (costs.commission_per_share && row.shares != null) {
    cost += row.shares * costs.commission_per_share;
    assumed = true;
  }
  if (costs.min_per_order) {
    cost += costs.min_per_order;
    assumed = true;
  }
  if (costs.ecn_fees_per_share && row.shares != null) {
    cost += row.shares * costs.ecn_fees_per_share;
    assumed = true;
  }
  if (row.dir === "short") {
    if (costs.locate_per_share && row.shares != null) {
      cost += row.shares * costs.locate_per_share;
      assumed = true;
    }
    if (costs.locate_per_trade) {
      cost += costs.locate_per_trade;
      assumed = true;
    }
  }
  return { cost, assumed };
}

function applyAccountCost(row, rule) {
  const perShare = rule.commission_per_share || 0;
  const minFill = rule.min_per_fill || 0;
  const sizes = fillShareCounts(row);
  if (sizes.length) {
    return sizes.reduce((sum, shares) => sum + Math.max(shares * perShare, minFill), 0);
  }
  if (row.shares != null) return Math.max(row.shares * perShare, minFill);
  return 0;
}

function annotateCosts(records, config) {
  const costs = normalizeConfig(config);
  const globalOn = Object.keys(DEFAULT_COSTS).some((key) => costs[key] !== 0);
  const evalOn = costs.accountCosts.some((rule) => rule.commission_per_share !== 0 || rule.min_per_fill !== 0);
  const anyExplicit = records.some((r) => r.commission != null || r.fees != null || r.locateCost != null);
  for (const row of records) {
    const recordedTotal = explicitCost(row);
    let cost = 0;
    let recorded = false;
    let assumed = false;
    if (recordedTotal != null) {
      cost = recordedTotal;
      recorded = true;
    } else {
      const accountRule = costs.accountCosts.find((rule) => (row.account || "").includes(rule.match));
      if (accountRule) {
        cost = applyAccountCost(row, accountRule);
        assumed = cost !== 0;
      } else {
        const global = applyGlobalCost(row, costs);
        cost = global.cost;
        assumed = global.assumed;
      }
    }
    row.cost = cost;
    row.netPnl = row.pnl == null ? null : row.pnl - cost;
    row.costSource = recorded ? "recorded" : assumed ? "assumed" : "none";
  }
  const configured = globalOn || evalOn || anyExplicit;
  let banner = null;
  if (!configured) banner = "Costs not configured, P&L is gross.";
  else if (!globalOn && evalOn) {
    const rule = costs.accountCosts.find((item) => item.commission_per_share || item.min_per_fill);
    const per = rule ? `$${rule.commission_per_share} per share` : "the account rate";
    const min = rule ? `$${rule.min_per_fill.toFixed(2)} minimum per fill` : "a minimum per fill";
    banner = `Historical trades stay gross unless a cost was written on the row. Trade the Pool eval trades use the fees on the row, or ${per} with a ${min}.`;
  }
  return { config: costs, configured, historicalGross: !globalOn, evalModel: evalOn, banner };
}

function scoreEvalIdea(list, planned, complete, caps) {
  const grades = [...new Set(list.map(recordedGrade).filter(Boolean))];
  const grade = grades.length === 1 && list.every((row) => recordedGrade(row)) ? grades[0] : null;
  const cap = grade ? caps[grade] : caps.C;
  if (!complete) {
    return { kind: "eval-unscored", breach: false, grade: "ungraded", cap, status: "unrecorded" };
  }
  if (list.some((row) => row.stop == null)) {
    return { kind: "eval-nostop", breach: true, grade: grade || "ungraded", cap, status: "nostop" };
  }
  if (planned > cap) {
    return { kind: "eval-over", breach: true, grade: grade || "ungraded", cap, status: "over" };
  }
  return { kind: "eval-within", breach: false, grade: grade || "ungraded", cap, status: "within" };
}

/**
 * $50 is per idea once planned risk is recorded on every row of the idea.
 * Historical ideas have no planned risk, so the row-level loss proxy is left alone.
 * Trade the Pool ideas use the grade cap instead of $50.
 */
function applyPlanClassification(rows, caps) {
  const groups = new Map();
  for (const row of rows) {
    if (row.paper) continue;
    const id = ideaIdentity(row);
    row.ideaKey = id.key;
    row.ideaLabel = id.label;
    row.ideaExplicit = id.explicit;
    if (!groups.has(id.key)) groups.set(id.key, []);
    groups.get(id.key).push(row);
  }
    for (const list of groups.values()) {
    const plannedValues = list.map((r) => r.plannedRisk).filter((n) => n != null);
    const complete = plannedValues.length === list.length && plannedValues.length > 0;
    const planned = plannedValues.length ? plannedValues.reduce((s, n) => s + n, 0) : null;
    const loss = list.reduce((s, r) => s + (r.pnl != null && r.pnl < 0 ? -r.pnl : 0), 0);
    const open = [...list].reverse().find((r) => r.openRisk != null)?.openRisk ?? null;
    const evalIdea = list.some((r) => isEvalAccount(r.account));
    let status = "unrecorded";
    let evalMeta = null;
    if (evalIdea) {
      evalMeta = scoreEvalIdea(list, planned, complete, caps);
      status = evalMeta.status;
    } else if (complete) {
      if (planned > 50) status = "planned";
      else if (loss > 50) status = "slippage";
      else status = "within";
    }
    for (const row of list) {
      row.ideaPlanned = planned;
      row.ideaPlannedComplete = complete;
      row.ideaRealizedLoss = list.some((r) => r.pnl != null) ? loss : null;
      row.ideaOpenRisk = open;
      row.ideaTradeCount = list.length;
      row.riskGrade = evalMeta ? evalMeta.grade : null;
      row.riskCap = evalMeta ? evalMeta.cap : null;
      if (evalIdea) {
        row.v.delete("risk50");
        if (row.overrides.risk50 === "Y") row.v.delete("riskCap");
        else if (row.overrides.risk50 === "N" || evalMeta.breach) row.v.add("riskCap");
        else row.v.delete("riskCap");
        row.riskKind = row.overrides.risk50 === "Y" ? "eval-within" : row.overrides.risk50 === "N" ? "eval-over" : evalMeta.kind;
        row.ok = row.v.size === 0;
        row.rules = RULES.filter((rule) => row.v.has(rule.id)).map((rule) => rule.id);
        continue;
      }
      if (!complete) {
        row.riskKind = row.v.has("risk50") ? "proxy" : "none";
        continue;
      }
      if (row.overrides.risk50 === "Y") row.v.delete("risk50");
      else if (row.overrides.risk50 === "N") row.v.add("risk50");
      else if (status === "planned") row.v.add("risk50");
      else row.v.delete("risk50");
      if (row.overrides.risk50 === "Y") row.riskKind = "within";
      else if (row.overrides.risk50 === "N") row.riskKind = status === "slippage" ? "slippage" : "planned";
      else row.riskKind = status;
      row.ok = row.v.size === 0;
      row.rules = RULES.filter((rule) => row.v.has(rule.id)).map((rule) => rule.id);
    }
  }
  for (const row of rows) {
    if (row.riskKind) continue;
    row.riskKind = row.v.has("risk50") ? "proxy" : "none";
    row.ideaKey = row.ideaKey || ideaIdentity(row).key;
    row.ideaLabel = row.ideaLabel || ideaIdentity(row).label;
    row.ideaExplicit = row.ideaExplicit ?? ideaIdentity(row).explicit;
  }
}

/** First segment of time_of_day, folded into the buckets a scalper actually uses. */
export function todBucket(raw) {
  const s = (raw || "").split(";")[0].trim().toLowerCase();
  if (!s || s === "not stated" || s.startsWith("unreadable") || s.startsWith("per fill")) {
    return "Not recorded";
  }
  if (s.includes("afternoon") || s.includes("pm")) return "Afternoon";
  if (s.includes("zombie") || s.includes("after 10:30") || s.includes("11:") || s.startsWith("10:30")) {
    return "Late morning";
  }
  if (s.startsWith("premarket") || s.includes("pre-market")) return "Premarket";
  if (s.startsWith("open") || s.includes("9:3") || s.includes("9:4") || s.includes("9:5")) return "Open";
  if (s.includes("morning") || s.includes("10:")) return "Morning";
  return "Not recorded";
}

function sideOf(direction) {
  const d = (direction || "").toLowerCase();
  if (d.startsWith("short")) return "short";
  if (d.startsWith("long")) return "long";
  return "other";
}

export function parseTrades(text) {
  return parseCSV(text).map((row, index) => {
    const tags = (row.mistakes_tags || "").toLowerCase();
    const pnl = leadingNumber(row.pnl);
    const dateRaw = row.date || "";
    const dated = /^\d{4}-\d\d-\d\d/.test(dateRaw);
    const baseV = new Set();
    if (pnl != null && pnl < -50) baseV.add("risk50");
    if (["early entry", "chas", "fomo", "support"].some((k) => tags.includes(k))) baseV.add("confirm");
    if (["revenge", "overtrad", "forced"].some((k) => tags.includes(k))) baseV.add("revenge");
    if (["average", "averag", "add against"].some((k) => tags.includes(k))) baseV.add("noadd");
    if (tags.includes("broke plan")) baseV.add("plan");
    if (["sizing", "stop too tight", "no planned exit"].some((k) => tags.includes(k))) baseV.add("size");

    const trips = perTrip(row.notes);
    const lossResult = (row.result || "").toLowerCase().startsWith("loss");
    const nloss =
      trips != null ? trips.filter((t) => t < 0).length : (pnl != null && pnl < 0) || lossResult ? 1 : 0;

    const overrides = {};
    let checklist = false;
    for (const [column, id] of Object.entries(COLUMN_TO_RULE)) {
      const flag = yn(row[column]);
      overrides[id] = flag;
      if (flag) checklist = true;
    }

    const idNum = Number.parseInt(row.id, 10);
    const shares = parseShares(row.size);
    const entry = entryPrice(row.entry);
    const stop = leadingNumber(row.stop);
    let plannedRisk = leadingNumber(row.planned_risk);
    let plannedRiskSource = plannedRisk != null ? "recorded" : null;
    if (plannedRisk == null && stop != null && entry != null && shares != null) {
      plannedRisk = Math.round(Math.abs(entry - stop) * shares * 100) / 100;
      plannedRiskSource = "computed";
    }
    const built = {
      id: Number.isFinite(idNum) ? idNum : index + 1,
      date: dated ? dateRaw : "undated",
      dateRaw,
      dated,
      dow: row.day_of_week || "",
      ticker: row.ticker || "",
      account: row.account || "",
      paper: (row.account || "") === "paper",
      direction: row.direction || "",
      dir: sideOf(row.direction),
      entryRaw: row.entry || "",
      entry,
      exit: row.exit || "",
      size: row.size || "",
      shares,
      stop,
      plannedRisk,
      plannedRiskSource,
      ideaId: (row.idea_id || "").trim(),
      openRisk: leadingNumber(row.open_risk),
      sizeReason: sizeReasonOf(row.size_reason),
      commission: leadingNumber(row.commission),
      fees: leadingNumber(row.fees),
      locateCost: leadingNumber(row.locate_cost),
      setupQuality: row.setup_quality || "",
      executionError: row.execution_error || "",
      setupValid: yn(row.setup_valid),
      pnl,
      pnlRaw: row.pnl || "",
      result: row.result || "",
      setup: row.setup || "",
      todRaw: row.time_of_day || "",
      tod: todBucket(row.time_of_day),
      holding: row.holding_time || "",
      tags: row.mistakes_tags || "",
      notes: row.notes || "",
      source: row.source_file || "",
      baseV,
      nloss,
      overrides,
      checklist,
      v: new Set(),
      ok: true,
      riskKind: "none",
    };
    attachQuality(built);
    return built;
  });
}

function inRange(record, from, to) {
  if (!record.dated) return !from && !to;
  if (from && record.date < from) return false;
  if (to && record.date > to) return false;
  return true;
}

/** Idempotent. stop3 is evaluated on the rows passed in (a date window is whole days). */
function finalize(records) {
  for (const r of records) r.v = new Set(r.baseV);
  const byDay = new Map();
  for (const r of records) {
    if (r.paper || !r.dated) continue;
    if (!byDay.has(r.date)) byDay.set(r.date, []);
    byDay.get(r.date).push(r);
  }
  const stopDays = [];
  for (const [day, list] of byDay) {
    const losses = list.reduce((s, r) => s + r.nloss, 0);
    if (losses > 3) {
      stopDays.push(day);
      for (const r of list) if (r.nloss > 0) r.v.add("stop3");
    }
  }
  for (const r of records) {
    for (const [id, flag] of Object.entries(r.overrides)) {
      if (flag === "Y") r.v.delete(id);
      else if (flag === "N") r.v.add(id);
    }
    r.ok = r.v.size === 0;
    r.rules = RULES.filter((rule) => r.v.has(rule.id)).map((rule) => rule.id);
  }
  stopDays.sort();
  return stopDays;
}

function outcome(rows) {
  const wins = rows.filter((r) => r.pnl > 0);
  const losses = rows.filter((r) => r.pnl < 0);
  const n = rows.length;
  const sumW = wins.reduce((s, r) => s + r.pnl, 0);
  const sumL = losses.reduce((s, r) => s + r.pnl, 0);
  const net = rows.reduce((s, r) => s + r.pnl, 0);
  const avgWin = wins.length ? sumW / wins.length : 0;
  const avgLoss = losses.length ? -sumL / losses.length : 0;
  const exp = n ? (wins.length / n) * avgWin - (losses.length / n) * avgLoss : 0;
  const pf = sumL < 0 ? sumW / -sumL : null;
  const wr = n ? (wins.length / n) * 100 : 0;
  return {
    n,
    net,
    wr,
    avgWin,
    avgLoss,
    pf,
    exp,
    wins: wins.length,
    losses: losses.length,
    flat: rows.filter((r) => r.pnl === 0).length,
  };
}

function emptyOutcome() {
  return outcome([]);
}

/**
 * @param {ReturnType<parseTrades>} records
 * @param {{from?: string, to?: string}} [range] blank from/to means all time, which is the only view that includes undated rows
 */
function bookStats(rows) {
  const scoredRows = rows.filter((r) => r.pnl != null);
  const ok = rows.filter((r) => r.ok).length;
  return {
    trades: { ok, n: rows.length, pct: rows.length ? (ok / rows.length) * 100 : 0 },
    gross: scoredRows.length ? outcome(scoredRows) : emptyOutcome(),
    net: scoredRows.length ? outcome(scoredRows.map((r) => ({ pnl: r.netPnl }))) : emptyOutcome(),
  };
}

function riskBucket(live, kind, meta) {
  const rows = live.filter((r) => r.riskKind === kind);
  const withPnl = rows.filter((r) => r.pnl != null);
  return {
    ...meta,
    count: rows.length,
    withPnl: withPnl.length,
    pnl: withPnl.reduce((s, r) => s + r.pnl, 0),
  };
}

function buildIdeas(live) {
  const groups = new Map();
  for (const row of live) {
    const key = row.ideaKey || ideaIdentity(row).key;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const ideas = [];
  for (const [, rows] of groups) {
    const first = rows[0];
    const scoredRows = rows.filter((r) => r.pnl != null);
    const net = scoredRows.reduce((s, r) => s + r.pnl, 0);
    const loss = scoredRows.reduce((s, r) => s + (r.pnl < 0 ? -r.pnl : 0), 0);
    const plannedValues = rows.map((r) => r.plannedRisk).filter((n) => n != null);
    const complete = plannedValues.length === rows.length && plannedValues.length > 0;
    const planned = plannedValues.length ? plannedValues.reduce((s, n) => s + n, 0) : null;
    const evalRow = rows.find((r) => isEvalAccount(r.account));
    let status = "No $50 flag";
    if (evalRow) {
      const kind = evalRow.riskKind;
      const grade = evalRow.riskGrade === "ungraded" ? "ungraded, C cap" : `${evalRow.riskGrade} cap`;
      if (kind === "eval-over") status = `Over ${grade}`;
      else if (kind === "eval-nostop") status = "No stop at entry";
      else if (kind === "eval-within") status = `Within ${grade}`;
      else status = "Risk not recorded";
    } else if (!scoredRows.length && planned == null) status = "Not recorded";
    else if (complete && planned > 50) status = "Planned-risk violation";
    else if (complete && loss > 50) status = "Slippage/overrun";
    else if (complete) status = "Within $50";
    else if (rows.some((r) => r.riskKind === "proxy")) status = "Loss > $50 proxy";
    ideas.push({
      key: first.ideaKey,
      label: first.ideaLabel,
      explicit: !!first.ideaExplicit,
      date: first.dated ? first.date : "",
      tickers: [...new Set(rows.map((r) => r.ticker).filter(Boolean))],
      trades: rows.length,
      net: scoredRows.length ? net : null,
      realizedLoss: scoredRows.length ? loss : null,
      planned,
      plannedComplete: complete,
      openRisk: first.ideaOpenRisk ?? null,
      status,
    });
  }
  ideas.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.label < b.label ? -1 : 1;
  });
  return ideas;
}

function qualityStats(live) {
  function pack(q, label) {
    const rows = live.filter((r) => r.quality === q);
    const scoredRows = rows.filter((r) => r.pnl != null);
    const stats = scoredRows.length ? outcome(scoredRows) : emptyOutcome();
    return {
      id: q,
      label,
      trades: rows.length,
      derived: rows.filter((r) => r.qualitySource === "derived").length,
      recorded: rows.filter((r) => r.qualitySource === "recorded").length,
      ...stats,
    };
  }
  const breakdown = QUALITY_ERRORS.map((err) => {
    const rows = live.filter((r) => r.quality === "B" && r.qualityErrors.includes(err.id));
    const scoredRows = rows.filter((r) => r.pnl != null);
    const stats = scoredRows.length ? outcome(scoredRows) : emptyOutcome();
    return { ...err, count: rows.length, ...stats };
  });
  return {
    classes: [
      pack("A", "Valid setup, executed correctly"),
      pack("B", "Valid setup, executed poorly"),
      pack("C", "Invalid or impulsive setup"),
    ],
    breakdown,
    derived: live.filter((r) => r.qualitySource === "derived").length,
    recorded: live.filter((r) => r.qualitySource === "recorded").length,
  };
}

function escalationStats(live) {
  const measured = live.filter((r) => r.escalation && r.escalation.multiple != null);
  const flagged = measured.filter((r) => r.escalation.flagged);
  const normal = measured.filter((r) => !r.escalation.flagged);
  const scoredOf = (rows) => {
    const scoredRows = rows.filter((r) => r.pnl != null);
    return {
      trades: rows.length,
      ...(scoredRows.length ? outcome(scoredRows) : emptyOutcome()),
    };
  };
  const series = measured
    .filter((r) => r.dated)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))
    .map((r) => ({
      date: r.date,
      id: r.id,
      ticker: r.ticker,
      multiple: r.escalation.multiple,
      flagged: r.escalation.flagged,
      metricName: r.escalation.metricName,
      pnl: r.pnl,
      afterStreak: r.escalation.afterStreak,
    }));
  return {
    measured: measured.length,
    unmeasured: live.length - measured.length,
    flagged: {
      ...scoredOf(flagged),
      afterStreak: flagged.filter((r) => r.escalation.afterStreak).length,
    },
    normal: scoredOf(normal),
    reasons: {
      planned: flagged.filter((r) => r.sizeReason === "planned").length,
      aplus: flagged.filter((r) => r.sizeReason === "A+ setup").length,
      emotional: flagged.filter((r) => r.sizeReason === "emotional").length,
      other: flagged.filter((r) => r.sizeReason && !["planned", "A+ setup", "emotional"].includes(r.sizeReason)).length,
      unrecorded: flagged.filter((r) => !r.sizeReason).length,
    },
    series,
  };
}

export function analyze(records, range = {}, config = DEFAULT_COSTS) {
  const from = range.from || "";
  const to = range.to || "";
  annotateEscalation(records);
  const costInfo = annotateCosts(records, config);
  const allDated = records.filter((r) => r.dated && !r.paper);
  let minDate = "";
  let maxDate = "";
  for (const r of allDated) {
    if (!minDate || r.date < minDate) minDate = r.date;
    if (!maxDate || r.date > maxDate) maxDate = r.date;
  }

  let view = records.filter((r) => inRange(r, from, to));
  const stopDays = finalize(view);
  applyPlanClassification(view, costInfo.config.riskCapsByGrade);
  const evalBook = bookStats(view.filter((r) => !r.paper && isEvalAccount(r.account)));
  if (range.book === "eval") view = view.filter((r) => isEvalAccount(r.account));
  else if (range.book === "personal") view = view.filter((r) => !isEvalAccount(r.account));
  const live = view.filter((r) => !r.paper);
  const paper = view.filter((r) => r.paper);
  const scored = live.filter((r) => r.pnl != null);
  const clean = scored.filter((r) => r.ok);
  const broke = scored.filter((r) => !r.ok);

  const dayMap = new Map();
  for (const r of live) {
    if (!r.dated) continue;
    if (!dayMap.has(r.date)) dayMap.set(r.date, []);
    dayMap.get(r.date).push(r);
  }
  let cleanDays = 0;
  for (const list of dayMap.values()) if (list.every((r) => r.ok)) cleanDays++;

  const undatedRows = live.filter((r) => !r.dated);
  const undatedPnl = undatedRows.reduce((s, r) => s + (r.pnl || 0), 0);

  const rules = RULES.map((rule) => {
    const flagged = live.filter((r) => r.v.has(rule.id));
    const withPnl = flagged.filter((r) => r.pnl != null);
    return {
      ...rule,
      count: flagged.length,
      withPnl: withPnl.length,
      pnl: withPnl.reduce((s, r) => s + r.pnl, 0),
    };
  });

  const byDate = new Map();
  for (const r of scored) {
    if (!r.dated) continue;
    byDate.set(r.date, (byDate.get(r.date) || 0) + r.pnl);
  }
  const daily = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, pnl]) => ({ date, pnl, cum: 0 }));
  let cum = 0;
  for (const d of daily) {
    cum += d.pnl;
    d.cum = cum;
  }

  const byMonth = new Map();
  for (const r of live) {
    if (!r.dated) continue;
    const month = r.date.slice(0, 7);
    if (!byMonth.has(month)) {
      byMonth.set(month, { month, pnl: 0, trades: 0, cleanTrades: 0, days: new Map() });
    }
    const m = byMonth.get(month);
    m.trades++;
    if (r.ok) m.cleanTrades++;
    if (r.pnl != null) m.pnl += r.pnl;
    if (!m.days.has(r.date)) m.days.set(r.date, true);
    if (!r.ok) m.days.set(r.date, false);
  }
  const monthly = [...byMonth.values()]
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((m) => {
      const days = m.days.size;
      let cleanDaysInMonth = 0;
      for (const ok of m.days.values()) if (ok) cleanDaysInMonth++;
      return {
        month: m.month,
        pnl: m.pnl,
        trades: m.trades,
        cleanTrades: m.cleanTrades,
        days,
        cleanDays: cleanDaysInMonth,
        tradePct: m.trades ? (m.cleanTrades / m.trades) * 100 : 0,
        dayPct: days ? (cleanDaysInMonth / days) * 100 : 0,
      };
    });

  const priceDefs = [
    { id: "under", label: "Under $10", test: (r) => r.entry != null && r.entry < 10 },
    { id: "over", label: "$10 and up", test: (r) => r.entry != null && r.entry >= 10 },
    { id: "unknown", label: "Entry not recorded", test: (r) => r.entry == null },
  ];
  const prices = priceDefs
    .map((def) => {
      const rows = scored.filter(def.test);
      return {
        id: def.id,
        label: def.label,
        pnl: rows.reduce((s, r) => s + r.pnl, 0),
        n: rows.length,
        wins: rows.filter((r) => r.pnl > 0).length,
      };
    })
    .filter((p) => p.n > 0);

  const hist = HIST.map((bin) => ({
    label: bin.label,
    side: bin.side,
    n: scored.filter((r) => bin.test(r.pnl)).length,
  }));

  function group(keyFn, order) {
    const map = new Map();
    for (const key of order) map.set(key, { label: key, pnl: 0, n: 0, wins: 0 });
    for (const r of scored) {
      const key = keyFn(r);
      if (!map.has(key)) map.set(key, { label: key, pnl: 0, n: 0, wins: 0 });
      const g = map.get(key);
      g.pnl += r.pnl;
      g.n++;
      if (r.pnl > 0) g.wins++;
    }
    return [...map.values()].filter((g) => g.n > 0 || order.includes(g.label));
  }

  const dow = group((r) => (DOW_ORDER.includes(r.dow) ? r.dow : r.dow || "Unknown"), DOW_ORDER).filter(
    (g) => g.n > 0,
  );
  const tod = group((r) => r.tod, TOD_ORDER).filter((g) => g.n > 0);

  const byTicker = new Map();
  for (const r of scored) {
    const key = r.ticker || "—";
    if (!byTicker.has(key)) byTicker.set(key, { ticker: key, pnl: 0, n: 0, wins: 0 });
    const t = byTicker.get(key);
    t.pnl += r.pnl;
    t.n++;
    if (r.pnl > 0) t.wins++;
  }
  const tickers = [...byTicker.values()].sort((a, b) => a.pnl - b.pnl);

  const tradeN = live.length;
  const tradeOk = live.filter((r) => r.ok).length;
  const dayN = dayMap.size;

  return {
    from,
    to,
    minDate,
    maxDate,
    live,
    paper,
    scored,
    stopDays,
    trades: { ok: tradeOk, n: tradeN, pct: tradeN ? (tradeOk / tradeN) * 100 : 0 },
    days: { ok: cleanDays, n: dayN, pct: dayN ? (cleanDays / dayN) * 100 : 0 },
    pnl: scored.length ? outcome(scored) : emptyOutcome(),
    clean: clean.length ? outcome(clean) : emptyOutcome(),
    broke: broke.length ? outcome(broke) : emptyOutcome(),
    excludedPnl: live.filter((r) => r.pnl == null).length,
    undated: {
      n: undatedRows.length,
      pnl: undatedPnl,
      ok: undatedRows.filter((r) => r.ok).length,
    },
    rules,
    riskSplit: {
      planned: riskBucket(live, "planned", {
        id: "risk-planned",
        name: "Planned-risk violation",
        short: "Planned risk",
        detail: "Recorded planned risk for the idea is over $50. Deliberate. Counts as breaking the $50 rule.",
      }),
      slippage: riskBucket(live, "slippage", {
        id: "risk-slip",
        name: "Slippage/overrun",
        short: "Slippage",
        detail:
          "Planned risk for the idea was $50 or less, and the idea’s realized loss still exceeded $50. Execution, not a planned breach, so it is not the compliance flag.",
      }),
      proxy: riskBucket(live, "proxy", {
        id: "risk-proxy",
        name: "Realized loss > $50 (proxy, planned risk not recorded)",
        short: "Loss > $50 proxy",
        detail:
          "Planned risk was not written down. A numeric loss larger than $50 on the row stands in for the rule. This is the historical proxy, and it still counts toward compliance.",
      }),
    },
    ideas: buildIdeas(live),
    quality: qualityStats(live),
    escalation: escalationStats(live),
    costs: {
      ...costInfo,
      gross: scored.length ? outcome(scored) : emptyOutcome(),
      net: scored.length ? outcome(scored.map((r) => ({ pnl: r.netPnl }))) : emptyOutcome(),
    },
    evalBook,
    riskCaps: costInfo.config.riskCapsByGrade,
    daily,
    monthly,
    prices,
    hist,
    dow,
    tod,
    tickers,
    ruleName: (id) => RULE_BY_ID[id]?.short || id,
  };
}
