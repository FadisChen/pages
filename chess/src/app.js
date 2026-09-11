import { GameSession, NAMES, SYMBOLS, LESSONS } from './game.js';
import { ChessBoard } from './board.js';
import { DEFAULT_SETTINGS, readSettings, saveSettings, requestCoach, coachPrompt, coachSystemInstruction } from './coach.js';

const $ = id => document.getElementById(id);
let settings;
try { settings = readSettings(localStorage); } catch { settings = { ...DEFAULT_SETTINGS }; }
export let game = new GameSession(settings);
export let board;
let busy = false, revision = 0, worker = null, npcTimer = null, watchdog = null;
let pendingPromotion = null, coachController = null, coachGeneration = 0, toastTimer;
let audioContext, backgroundMusic, confirmAction;
let hasStarted = false, activeDrawer = null;

function setDrawer(panel) {
  activeDrawer = panel;
  document.body.dataset.drawer = panel || '';
  document.body.classList.toggle('dock-collapsed',!panel);
  const buttons = { history: 'toggle-history', coach: 'toggle-coach', game: 'toggle-game-controls' };
  for (const [name, id] of Object.entries(buttons)) $(id).setAttribute('aria-expanded',String(name===panel));
  $('drawer-title').textContent = { history:'冒險棋譜', coach:'棋藝教練', game:'對局控制' }[panel] || '對局面板';
  if (panel==='coach') $('coach-unread').hidden=true;
}

function updateLayout() {
  document.body.classList.toggle('is-playing',hasStarted);
  $('game-toolbar').hidden=false;
  $('compact-status-title').textContent=game.status().title;
  $('compact-move-count').textContent=$('move-count').textContent;
  $('compact-turn-dot').classList.toggle('active',game.humanTurn);
  $('focus-undo').disabled=$('undo').disabled;
}

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800);
}

function persist() {
  try { saveSettings(localStorage, settings); }
  catch { toast('瀏覽器未允許儲存，設定仍會在本次頁面有效。'); }
}

function playSound(capture = false) {
  if (!settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(capture ? 640 : 480, now);
    oscillator.frequency.exponentialRampToValueAtTime(capture ? 180 : 310, now+.13);
    gain.gain.setValueAtTime(.0001,now); gain.gain.exponentialRampToValueAtTime(.08,now+.008); gain.gain.exponentialRampToValueAtTime(.0001,now+.18);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(); oscillator.stop(now+.2);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { /* Sound is optional; a suspended audio device must not interrupt play. */ }
}

function startBackgroundMusic() {
  if (!settings.music || !backgroundMusic) return;
  backgroundMusic.play().catch(() => { /* Browsers may block autoplay until a user gesture. */ });
}

function syncBackgroundMusic() {
  if (!backgroundMusic) return;
  if (settings.music) startBackgroundMusic();
  else { backgroundMusic.pause(); backgroundMusic.currentTime = 0; }
}

function stopNpc() {
  clearTimeout(npcTimer); clearTimeout(watchdog);
  npcTimer = watchdog = null;
  worker?.terminate(); worker = null;
}

function stopCoach() {
  coachGeneration++;
  coachController?.abort(); coachController = null;
  $('ask-coach').disabled = false;
  $('ask-coach').innerHTML = '<svg><use href="#i-spark"/></svg>請教教練<span>↗</span>';
}

function updateCoachMode() {
  const enabled = settings.enabled && settings.apiKey && settings.model;
  $('coach-mode').innerHTML = enabled ? '<i></i>Gemini 即時教練' : '<i></i>隨行小教練';
  $('coach-note').textContent = enabled ? 'AI 建議僅供學習，實際走法以棋盤提示為準' : '連結你的 Gemini，解鎖即時盤面教學';
  $('sound-toggle').setAttribute('aria-pressed', String(settings.sound));
  $('sound-toggle').setAttribute('aria-label', settings.sound ? '關閉音效' : '開啟音效');
}

export function refresh() {
  const status = game.status();
  $('status-title').textContent = status.title;
  $('status-detail').textContent = status.detail;
  $('status-title').closest('.status-row').classList.toggle('check', !!status.check);
  $('status-piece').textContent = SYMBOLS[game.chess.turn()].k;
  $('human-turn-dot').classList.toggle('active', game.humanTurn);
  $('npc-turn-dot').classList.toggle('active', !game.humanTurn && !game.over);
  $('undo').disabled = game.chess.history().length === 0;
  $('resign').disabled = game.over;
  $('human-side').textContent = game.side === 'w' ? '白方' : '黑方';
  $('human-caption').textContent = game.side === 'w' ? '你執白棋，率先出發' : '你執黑棋，後手也能精彩';
  $('human-portrait').className = `portrait portrait-${game.side === 'w' ? 'white' : 'black'}`;
  document.querySelector('.opponent .portrait').className = `portrait portrait-${game.side === 'w' ? 'black' : 'white'}`;
  $('opponent-caption').textContent = { easy: '新手 · 溫柔的挑戰者', medium: '中等 · 聰明的思考者', hard: '進階 · 沉著的戰術家' }[game.difficulty];
  const opponent = game.side === 'w' ? 'b' : 'w';
  $('human-captured').textContent = game.captured(game.side).map(type => SYMBOLS[opponent][type]).join('');
  $('opponent-captured').textContent = game.captured(opponent).map(type => SYMBOLS[game.side][type]).join('');
  const moves = game.chess.history({ verbose: true });
  $('move-count').textContent = `第 ${Math.floor(moves.length / 2) + 1} 回合`;
  const history = $('history'); history.replaceChildren();
  if (!moves.length) history.innerHTML = '<div class="empty-history"><span>✧</span>故事，從你的第一步開始</div>';
  for (let i=0; i<moves.length; i+=2) {
    const row = document.createElement('div'); row.className = 'move-row'+(i>=moves.length-2?' latest':'');
    for (const value of [String(i/2+1).padStart(2,'0'), moves[i].san, moves[i+1]?.san || '…']) {
      const span = document.createElement('span'); span.textContent = value; row.append(span);
    }
    history.append(row);
  }
  history.scrollTop = history.scrollHeight;
  board?.showHighlights(game.selected, game.legalMoves, moves.at(-1));
  board?.setCheck(game.chess);
  updateLayout();
}

function showResult() {
  const status = game.status();
  if (!status.result) return;
  $('result-title').textContent = status.title;
  $('result-description').textContent = status.detail;
  $('result-score').textContent = status.result;
  if (!$('result-dialog').open) $('result-dialog').showModal();
  if (status.result !== '1/2-1/2') {
    const winner = status.result === '1-0' ? 'w' : 'b';
    for (const square of winner==='w'?['b2','e2','g2']:['b7','e7','g7']) board.burst(square,'win');
  }
}

export function startNewGame() {
  revision++; busy = false; pendingPromotion = null;
  hasStarted=false; setDrawer('game'); $('coach-unread').hidden=true;
  stopNpc(); stopCoach();
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  settings.side = $('side').value; settings.difficulty = $('difficulty').value; persist();
  game = new GameSession(settings);
  board.sync(game.chess); board.resetView(game.side);
  $('tip-label').textContent = '給小小棋手的第一個提示';
  $('tip-text').textContent = '點一下你的棋子，看看它能去哪裡。先試著把中央的小兵向前走吧！';
  $('coach-messages').replaceChildren();
  addMessage('新冒險開始了！先占領中央、讓騎士與主教出動，再想想如何保護國王。','coach','入門提示 · 本機');
  refresh(); scheduleNpc();
  triggerAutomaticCoach(null);
}

function confirm(title, description, action, accept = '確定') {
  $('confirm-title').textContent = title; $('confirm-description').textContent = description;
  $('confirm-accept').textContent = accept; confirmAction = action;
  $('confirm-dialog').showModal();
}

function newGameRequested() {
  if (game.chess.history().length && !game.over) confirm('準備開啟新冒險？','目前棋局與棋譜將清除，使用所選陣營和難度重新開始。',startNewGame,'開啟新局');
  else startNewGame();
}

async function performMove(move, human) {
  const current = ++revision;
  busy = true;
  let result;
  try { result = game.move(move); }
  catch { busy = false; toast('這一步不合法，請依照棋盤上的提示走棋。'); refresh(); return; }
  if (!result) { busy = false; return; }
  if(!hasStarted)setDrawer(null);
  hasStarted=true;
  refresh(); playSound(!!result.captured);
  $('tip-label').textContent = `${human ? '你' : '夜幕騎士'}的這一步 · ${result.san}`;
  $('tip-text').textContent = result.promotion ? `小兵抵達底線，升變為${NAMES[result.promotion]}！` : result.flags.includes('k') || result.flags.includes('q') ? '王車易位！國王與城堡同時移動，讓國王更安全。' : result.flags.includes('e') ? '吃過路兵！趁對方小兵剛前進兩格，斜走吃掉它。' : result.captured ? `${NAMES[result.piece]}吃掉了對方的${NAMES[result.captured]}。繼續留意對方的反擊。` : LESSONS[result.piece];
  await board.animateMove(result);
  if (current !== revision) return;
  busy = false; refresh();
  triggerAutomaticCoach(result);
  if (game.over) showResult(); else scheduleNpc();
}

function isLastPieceThreatened(move) {
  return move.color === game.side && game.chess.isAttacked(move.to, game.side === 'w' ? 'b' : 'w');
}

function triggerAutomaticCoach(result) {
  if (!settings.enabled) return;
  const threatened = result && isLastPieceThreatened(result);
  if (settings.alerts && (game.chess.isCheck() || threatened)) {
    askCoach('請簡短解釋最近一步的意圖或風險。', true, 'Gemini · 局面提醒（將軍／受威脅）');
    return;
  }
  if (settings.autoGuide && !game.over && game.humanTurn) {
    askCoach('請給我一個簡短的走法方向建議，幫助我想想下一步可以怎麼走；不用直接告訴我完整的座標走法。', true, 'Gemini · 自動導引建議');
  }
}

function scheduleNpc() {
  stopNpc();
  if (busy || game.over || game.humanTurn) return;
  const current = revision;
  npcTimer = setTimeout(() => {
    const started = performance.now();
    const fallback = () => {
      stopNpc();
      if (current !== revision || game.over || game.humanTurn) return;
      toast('對手的搜尋暫時中斷，已使用備用合法走法。');
      const move = game.chess.moves({ verbose: true })[0];
      if (move) performMove(move, false);
    };
    try {
      worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (current !== revision) return;
        if (data.error || !data.move) { fallback(); return; }
        clearTimeout(watchdog); worker?.terminate(); worker = null;
        npcTimer = setTimeout(() => { if (current === revision) performMove(data.move, false); }, Math.max(0, 360 - (performance.now()-started)));
      };
      worker.onerror = fallback;
      worker.postMessage({ id: current, fen: game.chess.fen(), pgn: game.chess.pgn(), difficulty: game.difficulty });
      watchdog = setTimeout(fallback, 4500);
    } catch { fallback(); }
  }, 170);
}

function onSquare(square) {
  if (busy || game.over || pendingPromotion || !game.humanTurn) return;
  const possible = game.legalMoves.filter(move => move.to === square);
  if (possible.length) {
    if (possible.some(move => move.promotion)) {
      pendingPromotion = { from: game.selected, to: square };
      for (const button of document.querySelectorAll('[data-promotion]')) button.querySelector('span').textContent = SYMBOLS[game.side][button.dataset.promotion];
      $('promotion-dialog').showModal();
    } else performMove({ from: game.selected, to: square },true);
    return;
  }
  game.select(square);
  if (game.selected) {
    const piece = game.chess.get(game.selected);
    $('tip-label').textContent = `${NAMES[piece.type]} · ${game.selected.toUpperCase()} · ${new Set(game.legalMoves.map(m=>m.to)).size} 個可走格`;
    $('tip-text').textContent = LESSONS[piece.type];
  }
  refresh();
}

function addMessage(text, type = 'coach', label = 'Gemini · AI 建議') {
  const message = document.createElement('div'); message.className = 'coach-message '+type; message.textContent = text;
  if (label) { const caption = document.createElement('span'); caption.className = 'message-label'; caption.textContent = label; message.append(caption); }
  const messages = $('coach-messages'); messages.append(message);
  while (messages.children.length>30) messages.firstElementChild.remove();
  messages.scrollTop = messages.scrollHeight;
  if (hasStarted && activeDrawer!=='coach' && type!=='user') $('coach-unread').hidden=false;
}

async function askCoach(question = '現在我應該注意什麼？請給我一個容易理解的建議。', automatic = false, label = null) {
  if (coachController) { if (!automatic) toast('路米正在思考，請稍候一下。'); return; }
  if (!settings.enabled || !settings.apiKey || !settings.model) {
    if (automatic) return;
    const selected = game.selected && game.chess.get(game.selected);
    const hint = selected ? LESSONS[selected.type] : game.chess.isCheck() ? '你的國王受到了攻擊！選取棋子，尋找移開國王、擋住攻擊或吃掉攻擊者的合法走法。' : '先爭取中央的 e4、d4、e5、d5 格，讓騎士和主教出動。每次走棋前，看看對手正在攻擊什麼。';
    addMessage(hint+'\n\n想針對當前盤面提問，可以在設定中連結你的 Gemini。','coach','入門提示 · 本機');
    return;
  }
  const generation = coachGeneration;
  const moveNumber = game.chess.history().length;
  coachController = new AbortController();
  if (!automatic) addMessage(question,'user','');
  $('ask-coach').disabled = true; $('ask-coach').textContent = '路米正在思考…';
  try {
    const result = await requestCoach({ settings, prompt: coachPrompt(game.chess,question), systemInstruction: coachSystemInstruction(game.side), signal: coachController.signal });
    if (generation === coachGeneration) addMessage(result,'coach',label || `Gemini · 第 ${moveNumber} 手局面 · AI 建議`);
  } catch (error) {
    if (generation === coachGeneration) addMessage(error.message,'error','教練暫時離線 · 棋局不受影響');
  } finally {
    if (generation === coachGeneration) {
      coachController = null; $('ask-coach').disabled = false;
      $('ask-coach').innerHTML = '<svg><use href="#i-spark"/></svg>請教教練<span>↗</span>';
    }
  }
}

function openSettings() {
  $('quality').value = settings.quality; $('sound').checked = settings.sound; $('music').checked = settings.music;
  $('coach-enabled').checked = settings.enabled; $('api-key').value = settings.apiKey;
  $('model').value = settings.model; $('remember-key').checked = settings.remember;
  $('auto-guide').checked = settings.autoGuide; $('coach-alerts').checked = settings.alerts;
  $('settings-dialog').showModal();
}

function bindUI() {
  setDrawer('game');
  const resizer=$('panel-resizer');
  let resizing=false;
  const setWidth=width=>{
    const value=Math.round(Math.min(460,Math.max(270,width)));
    document.documentElement.style.setProperty('--panel-width',value+'px');
    resizer.setAttribute('aria-valuenow',String(value));
  };
  resizer.addEventListener('pointerdown',event=>{if(event.button!==0)return;resizing=true;resizer.setPointerCapture(event.pointerId);event.preventDefault();});
  resizer.addEventListener('pointermove',event=>{if(resizing)setWidth($('game-sidebar').getBoundingClientRect().right-event.clientX);});
  resizer.addEventListener('pointerup',()=>{resizing=false;});
  resizer.addEventListener('pointercancel',()=>{resizing=false;});
  resizer.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const value=Number(resizer.getAttribute('aria-valuenow'));
    setWidth(event.key==='Home'?270:event.key==='End'?460:value+(event.key==='ArrowLeft'?10:-10));
  });
  for(const [panel,id] of Object.entries({history:'toggle-history',coach:'toggle-coach',game:'toggle-game-controls'})) {
    $(id).addEventListener('click',()=>setDrawer(activeDrawer===panel?null:panel));
  }
  $('close-drawer').addEventListener('click',()=>{
    const button={history:'toggle-history',coach:'toggle-coach',game:'toggle-game-controls'}[activeDrawer];
    setDrawer(null); if(button)$(button).focus();
  });
  $('focus-undo').addEventListener('click',()=>$('undo').click());
  $('difficulty').value = settings.difficulty; $('side').value = settings.side;
  $('difficulty').addEventListener('change', () => { settings.difficulty = game.difficulty = $('difficulty').value; persist(); refresh(); if (!busy) scheduleNpc(); toast('對手難度已更新。'); });
  $('side').addEventListener('change', () => toast('陣營已選好，按「開啟新冒險」即可套用。'));
  $('new-game').addEventListener('click',newGameRequested);
  $('result-new').addEventListener('click',startNewGame);
  $('undo').addEventListener('click', () => {
    if (!game.chess.history().length) return;
    revision++; stopNpc(); stopCoach(); busy = false; pendingPromotion = null;
    $('promotion-dialog').close(); $('result-dialog').close();
    game.undo(); board.sync(game.chess); refresh();
    $('tip-label').textContent = '再想一次，也是一種進步';
    $('tip-text').textContent = '已撤回你的上一步與對手的回應。重新選擇你的下一步吧。';
    scheduleNpc();
  });
  $('resign').addEventListener('click', () => confirm('先休息一下嗎？','認輸會結束這場對局。你仍然可以回看棋譜，或開始新冒險。',() => { revision++; stopNpc(); stopCoach(); board.cancelAnimations(); busy=false; game.resigned=true; game.selected=null; refresh(); showResult(); },'確認認輸'));
  $('confirm-cancel').addEventListener('click', () => { confirmAction=null; $('confirm-dialog').close(); });
  $('confirm-accept').addEventListener('click', () => { const action=confirmAction; confirmAction=null; $('confirm-dialog').close(); action?.(); });
  $('confirm-dialog').addEventListener('cancel',()=>{confirmAction=null;});
  $('reset-view').addEventListener('click', () => { board.resetView(game.side); toast('已回到你的起始視角。'); });
  $('sound-toggle').addEventListener('click', () => { settings.sound=!settings.sound; persist(); updateCoachMode(); if(settings.sound)playSound(); });
  document.addEventListener('pointerdown', startBackgroundMusic, { passive: true });
  document.addEventListener('keydown', startBackgroundMusic);
  for (const id of ['settings-open','coach-settings']) $(id).addEventListener('click',openSettings);
  for (const id of ['guide-open','help-open']) $(id).addEventListener('click',()=>$('guide-dialog').showModal());
  for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click',()=>button.closest('dialog').close());
  $('promotion-dialog').addEventListener('close',()=>{pendingPromotion=null;});
  for (const button of document.querySelectorAll('[data-promotion]')) button.addEventListener('click',()=>{
    if(!pendingPromotion)return;
    const move={...pendingPromotion,promotion:button.dataset.promotion}; pendingPromotion=null;
    $('promotion-dialog').close(); performMove(move,true);
  });
  $('settings-form').addEventListener('submit', event => {
    event.preventDefault();
    if ($('coach-enabled').checked && (!$('api-key').value.trim() || !$('model').value.trim())) {
      toast('啟用教練時，請同時填寫 API Key 與模型名稱。');
      (!$('api-key').value.trim()?$('api-key'):$('model')).focus(); return;
    }
    stopCoach();
    Object.assign(settings,{ quality:$('quality').value, sound:$('sound').checked, music:$('music').checked, enabled:$('coach-enabled').checked, apiKey:$('api-key').value.trim(), model:$('model').value.trim(), remember:$('remember-key').checked, autoGuide:$('auto-guide').checked, alerts:$('coach-alerts').checked });
    persist(); board.setQuality(settings.quality); updateCoachMode(); syncBackgroundMusic(); $('settings-dialog').close();
    $('api-key').value=''; toast('設定已儲存，繼續你的冒險吧。');
  });
  $('ask-coach').addEventListener('click',()=>askCoach());
  $('coach-form').addEventListener('submit',event=>{ event.preventDefault(); const question=$('coach-question').value.trim(); if(!question)return; if(coachController){toast('路米正在思考，請稍候一下。');return;} $('coach-question').value=''; askCoach(question); });
  for(const type of ['k','q','r','b','n','p']) {
    const row=document.createElement('div');row.className='guide-piece';
    row.innerHTML=`<span>${SYMBOLS.w[type]}</span><div><strong>${NAMES[type]}</strong><p>${LESSONS[type]}</p></div>`;
    $('piece-guide').append(row);
  }
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){setDrawer(null);game.selected=null;refresh();}});
}

async function init() {
  try {
    backgroundMusic = $('background-music');
    board = new ChessBoard($('board'),onSquare);
    $('board').addEventListener('rendererror',event=>{ $('loading').hidden=false; $('loading').textContent=event.detail; });
    await board.load();
    board.sync(game.chess); board.setQuality(settings.quality); board.resetView(game.side);
    bindUI(); updateCoachMode(); refresh();
    $('loading').hidden = true;
    scheduleNpc();
  } catch (error) {
    console.error('Game initialization failed:',error);
    $('loading').replaceChildren();
    const title=document.createElement('strong');title.textContent='棋盤暫時無法載入';
    const detail=document.createElement('small');detail.textContent=location.protocol==='file:'?'請執行 npm start，再開啟 http://localhost:5173。':'請使用支援 WebGL2 的瀏覽器並開啟硬體加速，再重新整理。';
    $('loading').append(title,detail);
  }
}

await init();
