import { findBestMove } from './ai.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, ...findBestMove(data) }); }
  catch { self.postMessage({ id: data.id, error: 'NPC 搜尋失敗，請重試。' }); }
};
