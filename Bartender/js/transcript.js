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
    this.textPendingUser = '';
    this.textStreaming = false;
    this.textModelIndex = -1;
  }

  onVoiceUser(text) { this.flushModel(); this.userBuffer = mergePartial(this.userBuffer, text); }
  onModel(text) { this.flushUser(); this.modelBuffer = mergePartial(this.modelBuffer, text); }
  onInterrupted() { this.flushModel(); }
  onTurnComplete() { this.flushUser(); this.flushModel(); }

  onTextUser(text) {
    const clean = String(text || '').trim();
    if (!clean || this.textPendingUser) return false;
    this.textPendingUser = clean;
    this.visibleLines.push({ role: 'user', text: clean });
    return true;
  }

  startTextModel() {
    if (!this.textPendingUser || this.textStreaming) return false;
    this.textStreaming = true;
    this.modelBuffer = '';
    this.visibleLines.push({ role: 'model', text: '' });
    this.textModelIndex = this.visibleLines.length - 1;
    return true;
  }

  setTextModel(text) {
    if (!this.textStreaming) this.startTextModel();
    this.modelBuffer = String(text || '');
    if (this.textModelIndex >= 0) this.visibleLines[this.textModelIndex].text = this.modelBuffer;
  }

  finishTextModel() {
    if (!this.textStreaming) return false;
    const user = this.textPendingUser.trim();
    const model = this.modelBuffer.trim();
    if (user) this.analysisLines.push({ role: 'user', text: user });
    if (model) this.analysisLines.push({ role: 'model', text: model });
    this.textPendingUser = '';
    this.textStreaming = false;
    this.modelBuffer = '';
    this.textModelIndex = -1;
    return Boolean(user && model);
  }

  rollbackTextModel() {
    if (!this.textPendingUser && !this.textStreaming) return;
    if (this.textModelIndex >= 0) this.visibleLines.splice(this.textModelIndex, 1);
    const last = this.visibleLines.at(-1);
    if (last?.role === 'user' && last.text === this.textPendingUser) this.visibleLines.pop();
    this.textPendingUser = '';
    this.textStreaming = false;
    this.modelBuffer = '';
    this.textModelIndex = -1;
  }

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
  conversationHistory() { return this.visibleLines.filter((line) => line.text).map((line) => ({ ...line })); }
  snapshotForAnalysis() { this.flushUser(); if (!this.textStreaming) this.flushModel(); return this.analysisLines.map((line) => ({ ...line })); }
  clear() {
    this.analysisLines = [];
    this.visibleLines = [];
    this.userBuffer = '';
    this.modelBuffer = '';
    this.textPendingUser = '';
    this.textStreaming = false;
    this.textModelIndex = -1;
  }
}
