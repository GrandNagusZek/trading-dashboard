import { initTheme } from "./shell.js";
import { escapeHtml } from "./dom.js";

initTheme();

function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*]+)\*/g, "$1<em>$2</em>");
}

export function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let list = null;
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push("<ul>" + list.map((item) => `<li>${inline(item)}</li>`).join("") + "</ul>");
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (trimmed.startsWith("- ")) {
      flushPara();
      list = list || [];
      list.push(trimmed.slice(2));
      continue;
    }
    flushList();
    para.push(trimmed);
  }
  flushPara();
  flushList();
  return `<article class="prose">${out.join("\n")}</article>`;
}

const main = typeof document === "undefined" ? null : document.getElementById("main");

if (main) fetch("data/lessons.md", { cache: "no-cache" })
  .then((res) => {
    if (!res.ok) throw new Error("data/lessons.md returned " + res.status);
    return res.text();
  })
  .then((text) => {
    main.innerHTML = renderMarkdown(text);
  })
  .catch((err) => {
    main.textContent = err.message || "Could not read lessons.";
  });
