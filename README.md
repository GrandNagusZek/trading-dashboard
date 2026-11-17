# Trading desk

Personal trading-performance dashboard for a short-biased small-cap scalper. The site is static. The browser reads `data/trades.csv` and computes every statistic, chart, and compliance flag. There is no build step and no tracker.

Once GitHub Pages is enabled, the site is at:

**https://grandnaguszek.github.io/trading-dashboard/**

The repository is public, so the site and the journal are public to anyone with the link. Pages send `noindex`, which asks search engines not to list them. It does not make the repo private.

## Turn on GitHub Pages

The deploy workflow is `.github/workflows/pages.yml`. It runs on every push to `main`.

1. On GitHub, open this repo → **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Merge to `main` (or re-run the “Deploy GitHub Pages” workflow).

That Source setting is required. A branch source will not run this workflow’s deploy.

If the workflow fails with a permissions error, open **Settings → Actions → General → Workflow permissions**, choose **Read and write permissions**, and re-run the workflow.

The first successful run creates the `github-pages` environment. After that, the site updates a minute or two after each merge to `main`.

## Preview locally

From the repo root:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000/ . Do not open the HTML files by double-clicking them. The page has to fetch `data/trades.csv`, and a `file://` URL blocks that.

To check that the headline math still matches the journal review:

```bash
node --test tests/headline.test.mjs
```

All-time, that check expects compliance **74.7%** of trades (215/288) and **60.6%** of days (103/170), net P&L **$708.04**, expectancy **$2.78**, win rate **83.9%**, avg win **$13.20**, avg loss **$52.92**, profit factor **1.33**, and compliant **196** trades **+$2,220.73** against non-compliant **59** trades **−$1,512.69**.

## How to add trades

Edit `data/trades.csv` and commit it. Reload the site. Do not generate JSON, and do not install anything.

Keep the header row. Add one row per trade at the bottom. Use the next integer `id`. Quote any field that contains a comma or a line break, and double quotes inside a quoted field (`"` becomes `""`).

Dates must stay `YYYY-MM-DD`. Spreadsheets like to rewrite them. Set the date column to text before saving, or edit the file in a text editor.

`pnl` is **gross** dollars, the way the journal wrote it. Use a plain number: `15.00` or `-12.50`. No dollar sign and no thousands separator (`1234.50`, not `$1,234.50`). A comma would be read as the end of the number. A leading `+` is fine. Words such as `not stated` or `unreadable` stay in the log and in the table, and they are left out of P&L, win rate, expectancy, and profit factor. They still count toward compliance.

`account` of exactly `paper` is excluded from every statistic. The trades table can show it with “Show paper”.

`direction` should start with `short` or `long`. Anything else is grouped as other.

`day_of_week` is `Mon`, `Tue`, `Wed`, `Thu`, or `Fri`.

Undated rows (a date that does not start with `YYYY-MM-DD`) are included only when the date filter is **All**. Any from/to window is dated trades only.

### Columns

```
id,date,day_of_week,ticker,account,direction,entry,exit,size,pnl,result,setup,time_of_day,holding_time,mistakes_tags,notes,source_file,rule_confirmation,rule_risk50,rule_no_revenge,rule_no_average,rule_three_stops,rule_stop_size,rule_plan,stop,planned_risk,idea_id,open_risk,size_reason,commission,fees,locate_cost,setup_quality,execution_error,setup_valid
```

Leave a new column blank when you don’t know it. The site prints **Not recorded**. It does not invent a stop, a planned risk, a cost, or a setup grade for an old row.

| Column | Meaning |
| --- | --- |
| `rule_confirmation` | Y/N. Confirmation before conviction / the second mouse gets the cheese |
| `rule_risk50` | Y/N. Risk $50 maximum per idea. Overrides the dollar test below |
| `rule_no_revenge` | Y/N. No revenge trades. No forced trades. |
| `rule_no_average` | Y/N. Never add just to improve my average |
| `rule_stop_size` | Y/N. The setup determines the stop. The stop determines the size. |
| `rule_three_stops` | Y/N. Three stop-outs and I'm done |
| `rule_plan` | Y/N. Stuck to the plan |
| `stop` | Planned stop price. Not the exit |
| `planned_risk` | Dollars at risk for this fill: \|entry − stop\| × size. Summed across the idea |
| `idea_id` | Shared id for every fill on one thesis, e.g. `2026-11-17-ABCD-1` |
| `open_risk` | Dollars still at risk if the idea is open. Optional |
| `size_reason` | `planned`, `A+ setup`, `emotional`, or `other` |
| `commission` | Dollars, this trade. Optional |
| `fees` | Dollars, this trade (ECN and the like). Optional |
| `locate_cost` | Dollars, this trade. Optional |
| `setup_quality` | `A`, `B`, or `C`. Overrides the tag derivation |
| `execution_error` | `entry timing`, `position management`, `sizing`, `exit early`, or `held loser` |
| `setup_valid` | Y the setup was valid, N it was not |

Each rule cell is `Y` (followed it), `N` (broke it), or blank.

A filled rule cell **overrides the inferred flag for that rule only**. Blank cells on the same row still use the inference.

### Going forward

Checklist for a new trade, in the row itself:

- Planned stop (`stop`)
- Planned risk (`planned_risk`). If you leave it blank but `stop`, entry, and share size are all plain numbers, the site uses \|entry − stop\| × size and labels it computed
- `idea_id` on the starter and on every add, stop-out, and reentry of that thesis
- Setup valid (`setup_valid` Y or N)
- `size_reason` when size is outside the usual: planned, A+ setup, emotional, or other
- Each rule as Y or N: confirmation, risk $50, no revenge, no averaging, three stops, stop and size, plan

Optional on the same row: `open_risk`, `commission`, `fees`, `locate_cost`, `setup_quality`, `execution_error`.

### Example: a checklist trade inside the code

Planned stop 4.70, 100 shares, planned risk $50. One idea id. Class A. Every rule Y.

```csv
290,2026-11-17,Tue,ABCD,personal,short,4.20,4.05,100,15.00,win,bounce to VWAP,open (9:30-10:00),4m,,Waited for the fail and covered into the wash.,manual,Y,Y,Y,Y,Y,Y,Y,4.70,50,2026-11-17-ABCD-1,,planned,,,,A,,Y
```

### Example: chased, and the plan itself was over $50

`rule_confirmation` is N. Planned risk is 80, so the idea is a planned-risk violation even before the loss. `setup_valid` is N. `size_reason` is emotional.

```csv
291,2026-11-17,Tue,ABCD,personal,short,4.80,5.60,200,-160.00,loss,chase at the open,open (9:30-10:00),2m,chasing,Got in before the fail.,manual,N,N,Y,Y,Y,Y,Y,5.20,80,2026-11-17-ABCD-2,,emotional,,,,C,entry timing,N
```

### Example: plan was $40, the loss was $70

That is slippage, not a planned-risk violation. `rule_risk50` stays Y because the plan was inside $50.

```csv
292,2026-11-18,Wed,EFGH,personal,short,6.00,6.70,100,-70.00,loss,bounce to VWAP,open (9:30-10:00),3m,,Stopped through the planned stop.,manual,Y,Y,Y,Y,Y,Y,Y,6.40,40,2026-11-18-EFGH-1,,planned,1.00,0.20,4.00,B,exit early,Y
```

### What the inference does when a cell is blank

This is the historical rule, ported from the review script. Do not “clean it up” if you want the old numbers to stay put.

- **Confirmation** — a mistakes tag contains `early entry`, `chas` (chase / chasing), `fomo`, or `support`.
- **Revenge / forced** — a tag contains `revenge`, `overtrad`, or `forced`.
- **Averaging** — a tag contains `average`, `averag`, or `add against`.
- **Plan** — a tag contains `broke plan`. This is not one of the lines of the code. It still counts toward the compliance rate.
- **Stop / size** — a tag contains `sizing`, `stop too tight`, or `no planned exit`.
- **Risk $50, no planned risk recorded** — the numeric P&L is a loss larger than $50. The rules table calls this “Realized loss > $50 (proxy, planned risk not recorded)”. A loss of exactly $50 is not flagged. This proxy is what the all-time compliance rate uses.
- **Risk $50, planned risk recorded** — summed per `idea_id` (or, if you left `idea_id` blank, per ticker per day). Planned risk over $50 is a planned-risk violation and counts against compliance. Planned risk of $50 or under, with a realized loss over $50, is slippage. Slippage is shown on its own and does not flip the compliance flag.
- **Three stop-outs** — the calendar day has more than three losing round trips. Every losing row that day is flagged. If the note contains `per-trip P&L [ ... ]`, each negative number in that list counts as a loss; otherwise a losing row counts as one. A day that stops at exactly three is not flagged.
- **Setup class, when `setup_quality` is blank** — derived from tags, and labeled derived. C if the tags show FOMO, revenge, forced, or overtrading, or chasing a name the setup calls avoid / hot chick / ignore. B if the tags show early entry, cut winner early or piked, held loser, broke plan, shorted support, or sizing. A otherwise. A blank tag list becomes A, which is an upper bound. `setup_valid` N forces C. `setup_valid` Y blocks C.
- **Size escalation** — share size (or planned risk, when a risk baseline exists) above 1.5× the median of the previous 20 dated trades. It does not change the compliance rate. `size_reason` says whether the jump was deliberate. Rows without a parseable share count stay “not recorded”.
- **Costs** — `commission`, `fees`, and `locate_cost` on the row win. Anything blank falls back to `data/config.json`.

Tag tests are substrings, on purpose. `support` matches “shorting at support”.

A live trade with no flags is compliant, including a good loss. Compliance of days is the share of dated days on which every live trade was clean. The one `paper` row is ignored.

Historical flags were read out of the journal after the fact. A quiet note looks clean. The all-time percentage is likely an **upper bound**, not a card filled out at the time.

### Costs file

`data/config.json` holds the assumptions used when a trade’s own cost cells are blank. Shipped values are zero. While every rate is zero and no row has a cost filled in, the dashboard says **Costs not configured, P&L is gross.**

```json
{
  "commission_per_share": 0,
  "min_per_order": 0,
  "ecn_fees_per_share": 0,
  "locate_per_share": 0,
  "locate_per_trade": 0
}
```

`locate_per_share` and `locate_per_trade` are applied to shorts only. `min_per_order` is added when `commission` is blank. Per-share rates need a share count (`100 sh`, or a bare number). Without one, that piece is left off rather than guessed. Gross P&L on the dashboard does not change when you set these. Net P&L and net expectancy sit beside it. Break-even cost per trade is the gross expectancy.

`riskCapsByGrade` is the Trade the Pool eval cap on planned risk to the stop: A $250, B $100, C $50. An ungraded eval trade uses the C cap. A blank planned risk is not scored. Personal and historical trades stay on the $50 rule. Grade and stop must be written in the plan before entry.

`accountCosts` is the default fee model for an account name match, used only when that row’s commission, fees, and locate cost are all blank. Trade the Pool is `$0.005` per share with a `$0.75` minimum on each fill (`S10@…` / `B10@…` in the entry and exit text). A fee written on the row replaces that default. The global rates above stay at zero, so historical trades stay gross. The dashboard banner says so.

## Missed trades and lessons

`data/missed_trades.csv` is the list under “Missing a move is not losing money.” Those rows are not violations and they are not in the P&L. Add a row; the Code page picks it up.

```
date,ticker,direction,planned_entry,stop,target,outcome_if_taken,reason_skipped,lesson,source_file
```

`data/lessons.md` is the Lessons page. It is his journal, spelling included. Edit the markdown and commit it.

## What the numbers mean

- **Compliance, trades** — live trades with zero flagged rules, divided by all live trades.
- **Compliance, days** — dated days whose live trades are all clean, divided by dated live days.
- **Net P&L** — sum of numeric gross P&L.
- **Expectancy** — average numeric gross P&L per trade.
- **Win rate** — share of numeric trades with P&L above zero. A flat trade is in the denominator and is not a win.
- **Avg win / avg loss** — mean of the winners, and the mean size of the losers (shown as a positive number).
- **Profit factor** — gross wins divided by gross losses.

The date presets **30d**, **90d**, and **YTD** are measured from the last trade in the log, not from today, so they still mean something when the journal has a gap.

## Layout

```
index.html          Dashboard
rules.html          My Trading Code
ideas.html          One row per idea
trades.html         Filterable trade log
lessons.html        Journal lessons
css/styles.css
js/                 CSV parse, compliance, charts. No build.
data/trades.csv     The file the coach edits for new trades
data/config.json    Cost assumptions. Zeros until set
data/missed_trades.csv
data/lessons.md
fonts/              Fraunces, Figtree, IBM Plex Mono (SIL Open Font License)
.github/workflows/pages.yml
```

Charts are drawn as SVG in the page. Nothing is loaded from a CDN. Fonts are the files in `fonts/`, under their OFL licenses (`fonts/*-OFL.txt`).
