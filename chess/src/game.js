import { Chess } from '../vendor/chess.js';

export const NAMES = { p: '小兵', n: '騎士', b: '主教', r: '城堡', q: '皇后', k: '國王' };
export const SYMBOLS = { w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }, b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' } };
export const LESSONS = {
  p: '小兵向前一步，首次可走兩步；吃子時斜走一格。走到底線就能升變！',
  n: '騎士走「L」形：兩格直走再轉一格，是唯一能跳過其他棋子的角色。',
  b: '主教沿斜線移動，距離不限。一位主教一生只會走同一種顏色的格子。',
  r: '城堡沿橫線或直線移動，距離不限。和國王合作，還能完成王車易位。',
  q: '皇后可以直走、橫走或斜走，是最靈活的棋子。記得別讓她孤軍深入。',
  k: '國王每次走相鄰一格，不能走進敵方攻擊範圍。守護他就是你的任務。'
};

export class GameSession {
  constructor({ side = 'w', difficulty = 'easy', fen } = {}) {
    this.chess = new Chess(fen);
    this.side = side;
    this.difficulty = difficulty;
    this.resigned = false;
    this.selected = null;
  }
  get humanTurn() { return this.chess.turn() === this.side && !this.over; }
  get over() { return this.resigned || this.chess.isGameOver(); }
  get legalMoves() { return this.selected ? this.chess.moves({ square: this.selected, verbose: true }) : []; }
  select(square) {
    if (!this.humanTurn || this.chess.get(square)?.color !== this.side || square === this.selected) {
      this.selected = null;
    } else this.selected = square;
    return this.legalMoves;
  }
  move(move) {
    if (this.over) return null;
    // chess.js is the sole authority, including pins, castling and en passant.
    const result = this.chess.move(move);
    this.selected = null;
    return result;
  }
  undo() {
    if (!this.chess.history().length) return false;
    this.resigned = false;
    this.selected = null;
    this.chess.undo();
    // Undo the NPC response and the player's move, or just a pending player move.
    if (this.chess.turn() !== this.side && this.chess.history().length) this.chess.undo();
    return true;
  }
  status() {
    const c = this.chess;
    if (this.resigned) return { title: '這次練習，留待下次挑戰', detail: '你已認輸。每一局都是進步的開始。', result: this.side === 'w' ? '0-1' : '1-0' };
    if (c.isCheckmate()) return { title: c.turn() !== this.side ? '漂亮！你贏了' : '將死，再接再厲', detail: '國王已無法避開攻擊，對局結束。', result: c.turn() === 'w' ? '0-1' : '1-0' };
    const draws = [
      [c.isStalemate(), '逼和', '輪到的一方沒有合法走法，但國王未被將軍。'],
      [c.isThreefoldRepetition(), '三次重複和局', '同一盤面已出現三次，本練習局自動判和。'],
      [c.isDrawByFiftyMoves(), '五十步和局', '雙方連續五十步沒有移動小兵或吃子。'],
      [c.isInsufficientMaterial(), '子力不足和局', '剩餘棋子不足以將死對方。']
    ];
    const draw = draws.find(([yes]) => yes);
    if (draw) return { title: draw[1], detail: draw[2], result: '1/2-1/2' };
    if (c.isCheck()) return { title: this.humanTurn ? '將軍！守護你的國王' : '對手被將軍了', detail: '移動國王、擋住攻擊，或吃掉攻擊的棋子。', check: true };
    return { title: this.humanTurn ? '輪到你了' : '對手思考中', detail: this.humanTurn ? '選一位夥伴，走出你的下一步。' : '小小騎士正在盤算下一步…' };
  }
  captured(byColor) {
    return this.chess.history({ verbose: true }).filter(m => m.color === byColor && m.captured).map(m => m.captured);
  }
}
