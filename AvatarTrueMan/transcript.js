export function normalizeTranscript(text) {
  return String(text || "").trim();
}

export function mergePartial(current, incoming) {
  const existing = normalizeTranscript(current);
  const next = normalizeTranscript(incoming);
  if (!existing) return next;
  if (!next) return existing;
  if (next.startsWith(existing)) return next;
  if (existing.endsWith(next)) return existing;
  return `${existing}${next}`;
}

export class TranscriptView {
  constructor(element) {
    this.element = element;
    this.last = new Map();
  }

  add(role, text, merge = false) {
    const clean = normalizeTranscript(text);
    if (!clean) return;
    const previous = this.last.get(role);
    if (merge && previous) {
      previous.text = mergePartial(previous.text, clean);
      previous.bubble.textContent = previous.text;
      this.scroll();
      return;
    }
    const article = document.createElement("article");
    article.className = `message ${role}`;
    const meta = document.createElement("span");
    meta.className = "message-meta";
    meta.textContent = role === "user" ? "YOU" : role === "model" ? "HOST" : "SYSTEM";
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = clean;
    article.append(meta, bubble);
    this.element.append(article);
    this.last.set(role, { article, bubble, text: clean });
    while (this.element.children.length > 30) this.element.firstElementChild.remove();
    this.scroll();
  }

  clearPartial(role) {
    this.last.delete(role);
  }

  scroll() {
    this.element.scrollTop = this.element.scrollHeight;
  }
}
