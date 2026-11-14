import { boot } from "./shell.js";
import { h } from "./dom.js";
import { cls, money, prettyDate } from "./format.js";

boot((view) => {
  const main = document.getElementById("main");
  const ideas = view.ideas;
  main.replaceChildren(
    h("header", { class: "page-head" },
      h("h1", { class: "page-title" }, "Ideas"),
      h("p", { class: "lede" }, "Risk $50 is per idea: starters, adds, stop-outs, and reentries on the same thesis. Historical rows have no idea id, so the site assumes one ticker per day. Planned risk and open risk on those rows are not recorded."),
    ),
    ideas.length
      ? h("div", { class: "table-scroll" },
        h("table", { class: "violations" },
          h("thead", {},
            h("tr", {},
              ["Idea", "When", "Ticker", "Fills", "Net P&L", "Realized loss", "Planned risk", "Open risk", "$50"].map((label) =>
                h("th", { scope: "col" }, label),
              ),
            ),
          ),
          h("tbody", {},
            ideas.map((idea) => h("tr", {},
              h("td", {},
                idea.label,
                idea.explicit ? h("span", { class: "pill ok" }, "Recorded") : h("span", { class: "pill paper" }, "Assumed"),
              ),
              h("td", {}, idea.date ? prettyDate(idea.date) : "Undated"),
              h("td", { class: "ticker" }, idea.tickers.join(", ")),
              h("td", { class: "num" }, String(idea.trades)),
              h("td", { class: "num " + cls(idea.net) }, idea.net == null ? "Not recorded" : money(idea.net, { sign: true })),
              h("td", { class: "num" }, idea.realizedLoss == null ? "Not recorded" : money(idea.realizedLoss)),
              h("td", {}, idea.planned == null ? "Not recorded" : money(idea.planned)),
              h("td", {}, idea.openRisk == null ? "Not recorded" : money(idea.openRisk)),
              h("td", {}, idea.status),
            )),
          ),
        ),
      )
      : h("p", { class: "card empty" }, "No ideas in this window."),
    h("p", { class: "fine" }, `${ideas.length} ideas in this window. Realized loss adds up the losing fills. It is not the net. An assumed idea is one ticker on one day.`),
  );
});
