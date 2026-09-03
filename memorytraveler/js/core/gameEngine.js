import { generateContent } from "../gemini/client.js";
import { buildSystemInstruction, buildSummaryPrompt } from "../gemini/promptBuilder.js";
import { compactHistory } from "../gemini/contextManager.js";
import { parseTurnResponse, parseSummaryResponse } from "../gemini/responseValidators.js";
import { extractResponseText, userContent, modelContent } from "../utils/geminiContent.js";
import { buildSummarySchema, TURN_SCHEMA, AFFINITY, STORY_CONTINUATION } from "./constants.js";
import { clamp } from "../utils/clamp.js";

const START_PROMPT = "（遊戲開始，請生成開場劇情）";

// The narrative engine, deliberately DOM-free so it can be exercised in unit
// tests and reused regardless of how the UI renders it. Owns everything the
// game needs to resume after a reload (see toSnapshot/fromSnapshot).
export class GameEngine {
  constructor({ apiKey, model, outline, generateContentFn = generateContent }) {
    this.apiKey = apiKey;
    this.model = model;
    this.outline = outline;
    this._generateContent = generateContentFn;
    this._busy = false;

    this.contents = [];
    this.storySummary = "";
    this.affinity = AFFINITY.default;
    this.clues = [];
    this.log = [];
    this.currentChoices = [];
  }

  static fromSnapshot(snapshot, { apiKey, model, generateContentFn } = {}) {
    const engine = new GameEngine({
      apiKey: apiKey ?? snapshot.apiKey,
      model: model ?? snapshot.model,
      outline: snapshot.outline,
      generateContentFn
    });
    engine.contents = snapshot.contents || [];
    engine.storySummary = snapshot.storySummary || "";
    engine.affinity = typeof snapshot.affinity === "number" ? snapshot.affinity : AFFINITY.default;
    engine.clues = Array.isArray(snapshot.clues) ? snapshot.clues : [];
    engine.log = Array.isArray(snapshot.log) ? snapshot.log : [];
    engine.currentChoices = Array.isArray(snapshot.currentChoices) ? snapshot.currentChoices : [];
    engine._ensureContinuationChoice();
    return engine;
  }

  toSnapshot() {
    return {
      apiKey: this.apiKey,
      model: this.model,
      outline: this.outline,
      contents: this.contents,
      storySummary: this.storySummary,
      affinity: this.affinity,
      clues: this.clues,
      log: this.log,
      currentChoices: this.currentChoices
    };
  }

  start() {
    return this._callTurn(START_PROMPT);
  }

  choose(choiceText) {
    return this._callTurn(`玩家行動：${choiceText}`, { choiceLogText: choiceText });
  }

  async finish() {
    return this._guardBusy(async () => {
      const prompt = buildSummaryPrompt({
        outline: this.outline,
        storySummary: this.storySummary,
        contents: this.contents,
        affinity: this.affinity,
        clues: this.clues
      });
      const resp = await this._generateContent(this.apiKey, this.model, {
        contents: [userContent(prompt)],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: "application/json",
          responseSchema: buildSummarySchema()
        }
      });
      return parseSummaryResponse(extractResponseText(resp));
    });
  }

  async _callTurn(userText, { choiceLogText } = {}) {
    return this._guardBusy(async () => {
      const compacted = await compactHistory(
        {
          contents: this.contents,
          storySummary: this.storySummary,
          outline: this.outline,
          affinity: this.affinity,
          clues: this.clues
        },
        (prompt) => this._rawGenerate(prompt)
      );
      this.contents = compacted.contents;
      this.storySummary = compacted.storySummary;

      const turnNumber = this._narrativeTurnCount() + 1;
      const body = {
        systemInstruction: { parts: [{ text: this._systemInstructionText(turnNumber) }] },
        contents: [...this.contents, userContent(userText)],
        generationConfig: {
          temperature: 0.95,
          responseMimeType: "application/json",
          responseSchema: TURN_SCHEMA
        }
      };
      const resp = await this._generateContent(this.apiKey, this.model, body);
      const rawText = extractResponseText(resp);
      const turn = this._ensureTurnContinuation(parseTurnResponse(rawText));

      // Only commit to history/log once we have a validated turn, so a
      // failed call never corrupts what gets persisted for session resume.
      this.contents.push(userContent(userText));
      this.contents.push(modelContent(rawText));

      this.affinity = clamp(this.affinity + turn.affinityDelta, AFFINITY.min, AFFINITY.max);
      turn.newClues.forEach((c) => {
        const trimmed = c.trim();
        if (trimmed && !this.clues.includes(trimmed)) this.clues.push(trimmed);
      });

      if (choiceLogText != null) {
        this.log.push({ type: "choice", text: choiceLogText });
      }
      this.log.push({
        type: "narrative",
        text: turn.narrative,
        friendLine: turn.friendLine,
        affinityDelta: turn.affinityDelta,
        newClues: turn.newClues
      });
      this.currentChoices = turn.choices;

      return turn;
    });
  }

  async _rawGenerate(promptText) {
    const resp = await this._generateContent(this.apiKey, this.model, {
      contents: [userContent(promptText)],
      generationConfig: { temperature: 0.3 }
    });
    return extractResponseText(resp);
  }

  _systemInstructionText(turnNumber) {
    let sysText = buildSystemInstruction(this.outline, this.affinity, this.clues, turnNumber);
    if (this.storySummary) {
      sysText += `\n\n到目前為止的劇情摘要（供你接續發展，不要重複描述這些內容）：\n${this.storySummary}`;
    }
    return sysText;
  }

  _narrativeTurnCount() {
    return this.log.filter((entry) => entry.type === "narrative").length;
  }

  _ensureTurnContinuation(turn) {
    if (turn.choices.length === 0) {
      turn.choices = [STORY_CONTINUATION.fallbackChoice];
    }
    return turn;
  }

  _ensureContinuationChoice() {
    if (this.currentChoices.length === 0 && this._narrativeTurnCount() > 0) {
      this.currentChoices = [STORY_CONTINUATION.fallbackChoice];
    }
  }

  // Defense-in-depth against a UI bug allowing two calls to overlap: the UI
  // is expected to disable choice buttons while a call is in flight, but the
  // engine refuses concurrent calls regardless.
  async _guardBusy(fn) {
    if (this._busy) {
      throw new Error("上一個請求仍在進行中，請稍候再試。");
    }
    this._busy = true;
    try {
      return await fn();
    } finally {
      this._busy = false;
    }
  }
}
