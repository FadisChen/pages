import { Chess } from '../vendor/chess.js';

const VALUES = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
const LEVELS = { easy: { depth: 1, time: 180 }, medium: { depth: 3, time: 700 }, hard: { depth: 4, time: 1350 } };

export function evaluate(chess) {
  let score = 0;
  for (const row of chess.board()) for (const p of row) {
    if (!p) continue;
    const file = p.square.charCodeAt(0) - 97;
    const rank = Number(p.square[1]) - 1;
    const advance = p.color === 'w' ? rank : 7 - rank;
    const center = 7 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5));
    let position = 0;
    if (p.type === 'p') position = advance * 9 + center * 4;
    if (p.type === 'n') position = center * 14 - (advance === 0 ? 15 : 0);
    if (p.type === 'b') position = center * 7 + (advance > 0 ? 12 : 0);
    if (p.type === 'r') position = advance * 3;
    if (p.type === 'q') position = center * 3;
    if (p.type === 'k') position = advance < 2 && [1, 2, 6].includes(file) ? 35 : -advance * 8;
    score += (VALUES[p.type] + position) * (p.color === 'w' ? 1 : -1);
  }
  return score * (chess.turn() === 'w' ? 1 : -1);
}

function ordered(chess) {
  const priority = m => (m.captured ? VALUES[m.captured] * 10 - VALUES[m.piece] : 0) + (m.promotion ? VALUES[m.promotion] : 0) + (m.san.includes('+') ? 50 : 0);
  return chess.moves({ verbose: true }).sort((a, b) => priority(b) - priority(a));
}

export function findBestMove({ fen, pgn, difficulty = 'medium', timeLimit, random = Math.random }) {
  const chess = new Chess(fen);
  // Keep repetition history when searching a real game.
  if (pgn) chess.loadPgn(pgn);
  if (chess.isGameOver()) return { move: null, depth: 0, nodes: 0 };
  const config = LEVELS[difficulty] || LEVELS.medium;
  const started = performance.now();
  const deadline = started + (timeLimit ?? config.time);
  let nodes = 0;
  const timeout = Symbol('timeout');
  function search(depth, alpha, beta, ply) {
    nodes++;
    if (performance.now() > deadline) throw timeout;
    if (chess.isCheckmate()) return -100000 + ply;
    if (chess.isDraw() || chess.isThreefoldRepetition()) return 0;
    if (depth === 0) return evaluate(chess);
    let best = -Infinity;
    for (const move of ordered(chess)) {
      chess.move(move);
      let score;
      try { score = -search(depth - 1, -beta, -alpha, ply + 1); }
      finally { chess.undo(); }
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }
  let choices = ordered(chess);
  let best = choices[0], completed = 0;
  if (difficulty === 'easy' && random() < .28) {
    best = choices[Math.floor(random() * choices.length)];
  } else {
    for (let depth = 1; depth <= config.depth; depth++) {
      const scored = [];
      try {
        let alpha = -Infinity;
        for (const move of choices) {
          chess.move(move);
          let score;
          try { score = -search(depth - 1, -Infinity, -alpha, 1); }
          finally { chess.undo(); }
          scored.push({ move, score });
          alpha = Math.max(alpha, score);
        }
        scored.sort((a, b) => b.score - a.score);
        best = scored[0].move;
        choices = scored.map(s => s.move);
        completed = depth;
      } catch (error) { if (error !== timeout) throw error; break; }
    }
  }
  return { move: { from: best.from, to: best.to, ...(best.promotion ? { promotion: best.promotion } : {}) }, depth: completed, nodes, elapsed: performance.now() - started };
}
