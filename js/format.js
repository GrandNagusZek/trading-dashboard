/** Number and date formatting. pyRound matches Python 3 round() (ties to even). */

export function pyRound(value, digits) {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const factor = 10 ** digits;
  const scaled = Math.abs(value) * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const eps = 1e-8 * Math.max(1, scaled);
  let whole;
  if (diff > 0.5 + eps) whole = floor + 1;
  else if (diff < 0.5 - eps) whole = floor;
  else whole = floor % 2 === 0 ? floor : floor + 1;
  const rounded = (sign * whole) / factor;
  // Snap binary dust so 1.33 is 1.33, not 1.329999999999.
  return Number(rounded.toFixed(digits));
}

export function money(n, { sign = false, digits = 2 } = {}) {
  if (n == null || !Number.isFinite(n)) return "—";
  const r = pyRound(n, digits);
  const abs = Math.abs(r).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (r < 0) return "-$" + abs;
  if (sign && r > 0) return "+$" + abs;
  return "$" + abs;
}

export function pct(n, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return pyRound(n, digits).toFixed(digits) + "%";
}

export function num(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return pyRound(n, digits).toFixed(digits);
}

export function price(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function prettyDate(iso) {
  if (!iso || !/^\d{4}-\d\d-\d\d/.test(iso)) return iso || "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function monthLabel(ym) {
  if (!/^\d{4}-\d\d$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function shortMonth(ym, index, all) {
  if (!/^\d{4}-\d\d$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  const name = MONTHS[Number(m) - 1];
  const prev = index > 0 ? all[index - 1] : "";
  if (index === 0 || prev.slice(0, 4) !== y) return `${name} '${y.slice(2)}`;
  return name;
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function cls(n) {
  if (n == null || !Number.isFinite(n) || n === 0) return "flat";
  return n > 0 ? "pos" : "neg";
}
