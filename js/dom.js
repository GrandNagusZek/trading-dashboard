export function h(tag, props, ...kids) {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "dataset") {
        for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = String(dv);
      } else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else node.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(node, kids);
  return node;
}

function append(node, kids) {
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    if (Array.isArray(kid)) append(node, kid);
    else if (kid instanceof Node) node.append(kid);
    else node.append(document.createTextNode(String(kid)));
  }
}

export function clear(node) {
  node.replaceChildren();
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
