export function $(id) {
  return document.getElementById(id);
}

export function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = "status-msg show" + (kind ? ` ${kind}` : "");
}

export function clearStatus(el) {
  el.textContent = "";
  el.className = "status-msg";
}
