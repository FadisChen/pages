export function mergePartial(current, incoming) {
  const existing = String(current || '').trim();
  const next = String(incoming || '').trim();
  if (!existing) return next;
  if (!next) return existing;
  if (next.startsWith(existing)) return next;
  if (existing.endsWith(next)) return existing;
  return existing + next;
}

export class SessionTranscript {
  constructor() {
    this.analysisLines = [];
    this.visibleLines = [];
    this.userBuffer = '';
    this.modelBuffer = '';
  }

  onVoiceUser(text) { this.flushModel(); this.userBuffer = mergePartial(this.userBuffer, text); }
  onModel(text) { this.flushUser(); this.modelBuffer = mergePartial(this.modelBuffer, text); }
  onInterrupted() { this.flushModel(); }
  onTurnComplete() { this.flushUser(); this.flushModel(); }

  flushUser() {
    const text = this.userBuffer.trim();
    if (text) this.analysisLines.push({ role: 'user', text });
    this.userBuffer = '';
  }

  flushModel() {
    const text = this.modelBuffer.trim();
    if (text) {
      this.analysisLines.push({ role: 'model', text });
      this.visibleLines.push({ role: 'model', text });
    }
    this.modelBuffer = '';
  }

  currentModel() { return this.modelBuffer.trim() || [...this.visibleLines].reverse().find((line) => line.role === 'model')?.text || ''; }
  visibleHistory() { this.flushModel(); return this.visibleLines.filter((line) => line.role === 'model').slice(-10); }
  snapshotForAnalysis() { this.flushUser(); this.flushModel(); return this.analysisLines.map((line) => ({ ...line })); }
  clear() { this.analysisLines = []; this.visibleLines = []; this.userBuffer = ''; this.modelBuffer = ''; }
}
