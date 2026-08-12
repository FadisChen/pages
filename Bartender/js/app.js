import { BACKGROUND_MUSIC_TRACKS, DEFAULT_BACKGROUND_MUSIC_ID, BackgroundMusicPlayer, BrowserAudioEngine, TavernSoundscape } from './audio.js';
import { analyzeMemories, analyzeStoryEvents, buildSystemInstruction, checkModel, LiveSession } from './gemini.js';
import { VOICES } from './personas.js';
import { ACCUSATION_OPTIONS, CLUES, advanceStory, getStoryBoard, pinStoryRoute, prepareStoryConversation, recordStoryInteraction, submitAccusation, submitDeduction } from './story.js';
import { GuestSimulation, SEAT_DEPTHS, SEAT_POSITIONS } from './simulation.js';
import { DEFAULT_SETTINGS, getApiKey, loadSave, loadSettings, resetCharacter, saveApiKey, saveMode, saveSettings } from './store.js';
import { SessionTranscript } from './transcript.js';

const app = document.getElementById('app');
const toastRegion = document.getElementById('toastRegion');
const initialSettings = loadSettings();

const state = {
  screen: 'menu',
  mode: 'cozy',
  settings: initialSettings,
  save: null,
  simulation: null,
  guests: [],
  call: null,
  historyOpen: false,
  overlay: null,
  characterPreviewId: null,
  settingsTab: 'general',
  editingId: 'friend1',
  backgroundMusic: new BackgroundMusicPlayer({
    autoPlay: initialSettings.backgroundMusicAutoPlay,
    onTrackChange: (trackId) => { state.backgroundMusicTitle = backgroundMusicTitle(trackId); render(); },
  }),
  backgroundMusicTitle: BACKGROUND_MUSIC_TRACKS.find((track) => track.id === DEFAULT_BACKGROUND_MUSIC_ID)?.title || '背景音樂：關閉',
  backgroundMusicRequest: null,
  soundscape: null,
  arrivedGuestIds: new Set(),
};

app.addEventListener('click', handleClick);
app.addEventListener('submit', handleSubmit);
window.addEventListener('beforeunload', () => { state.call?.session.stop(false); void state.call?.audio.stop(); void state.backgroundMusic.stop({ fade: false }); state.soundscape?.stop(); });
window.setInterval(updateSimulation, 1000);
render();
void ensureHomeBackgroundMusic().catch(() => {});

function render() {
  document.title = `陋室 - ${state.backgroundMusicTitle}`;
  app.innerHTML = state.screen === 'bar' ? renderBar() : renderMenu();
}

function renderMenu() {
  return `
    <main class='screen menu-screen'>
      <div class='menu-bg' aria-hidden='true'></div>
      <section class='menu-layout'>
        <div class='menu-copy'><p class='eyebrow'>The lantern stays lit for you</p><h1>陋室<em>Drifter Loss</em></h1><p>站在吧檯，替旅人留盞燈。<br/>有人帶著笑話，有人帶著祕密。<br/>你有故事，我有酒。</p></div>
        <div class='menu-card'>
          <p class='eyebrow'>Choose tonight's tale</p><h2>今晚想聽哪一種故事？</h2>
          <div class='mode-list'>${modeCard('cozy', '☕', '療癒夜話', '陪伴、近況與慢慢熟識')}${modeCard('story', '✦', '灰燼群像', '線索、祕密與彼此牽連')}</div>
          <div class='menu-actions'><button class='primary' type='button' data-action='enter'>推開酒館的門　→</button><button class='secondary' type='button' data-action='settings' data-tab='general'>設定</button><button class='secondary' type='button' data-action='settings' data-tab='characters'>角色</button></div>
        </div>
      </section>
      ${state.overlay ? renderOverlay() : ''}
    </main>`;
}

function modeCard(id, symbol, title, description) {
  return `<button class='mode-card ${state.mode === id ? 'is-selected' : ''}' type='button' data-action='mode' data-mode='${id}'><span>${symbol}</span><span><strong>${title}</strong><small>${description}</small></span><b>${state.mode === id ? '✓' : ''}</b></button>`;
}

function renderBar() {
  return `
    <main class='screen bar-screen'>
      <div class='ambient' aria-hidden='true'></div>
      <section class='scene'>
        <img class='scene-layer scene-bg' src='./assets/place.png' alt='溫暖燈光下的奇幻酒館吧檯'>
        <div class='scene-shade'></div>
        ${renderGuests()}
        <img class='scene-layer scene-front' src='./assets/place.png' alt='' aria-hidden='true'>
        <header class='hud'><div class='identity'><button class='round' type='button' data-action='menu' aria-label='返回主選單'>←</button><div><strong>陋室</strong><small>${modeLabel()} · ${html(state.settings.playerName)}</small></div></div><div class='hud-actions'>${state.mode === 'story' ? `<button class='round casebook-button' type='button' data-action='story-board' aria-label='開啟案件簿' title='案件簿'>✦</button>` : ''}<button class='round caption-hud ${state.settings.captionsVisible ? '' : 'is-off'}' type='button' data-action='captions' aria-label='${state.settings.captionsVisible ? '隱藏字幕' : '顯示字幕'}' title='${state.settings.captionsVisible ? '隱藏字幕' : '顯示字幕'}'><svg viewBox='0 0 24 24' aria-hidden='true'><path d='M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1-2 2Z'/><path d='M7 11h3m4 0h3M7 14h5m2 0h3'/>${state.settings.captionsVisible ? '' : `<path class='caption-slash' d='m4 4 16 16'/>`}</svg></button><button class='round' type='button' data-action='settings' data-tab='general' aria-label='設定'>⚙</button></div></header>
        <div class='dialogue-stack'>${renderCaption()}${renderHistory()}</div>
        <div class='bgm-dock'>${renderBackgroundMusic()}</div>
        <div class='controls ${state.call ? '' : 'is-idle'}'>${renderControls()}</div>
      </section>
      ${state.overlay ? renderOverlay() : ''}
    </main>`;
}

function backgroundMusicTitle(trackId) {
  return BACKGROUND_MUSIC_TRACKS.find((track) => track.id === trackId)?.title || '背景音樂：關閉';
}

function renderBackgroundMusic() {
  const selectedId = state.backgroundMusic.selectedId;
  const selectedTrack = BACKGROUND_MUSIC_TRACKS.find((track) => track.id === selectedId);
  const selectedTitle = selectedTrack?.title || '背景音樂：關閉';
  const options = [
    { id: '', title: '背景音樂：關閉' },
    ...BACKGROUND_MUSIC_TRACKS,
  ].map((track) => `<button class='bgm-option ${track.id === selectedId ? 'is-selected' : ''}' type='button' role='option' aria-selected='${track.id === selectedId}' data-action='background-music' data-id='${attr(track.id)}'>${html(track.title)}</button>`).join('');
  return `<details class='bgm-picker'><summary><span aria-hidden='true'>♫</span><span class='sr-only'>背景音樂</span><span class='bgm-current'>${html(selectedTitle)}</span><span class='bgm-chevron' aria-hidden='true'>⌄</span></summary><div class='bgm-options' role='listbox' aria-label='背景音樂'>${options}</div></details>`;
}

function renderGuests() {
  return state.guests.map((guest, index) => {
    const character = characterById(guest.characterId);
    const active = state.call?.characterId === guest.characterId;
    const width = character.displayWidth || 18.5;
    const position = Math.max(width / 2, Math.min(100 - width / 2, SEAT_POSITIONS[guest.seat]));
    const style = `--x:${position}%;--guest-width:${width}%;--depth:${SEAT_DEPTHS[guest.seat]}`;
    const hitStyle = `${style};--hit-ratio:${character.hitRatio || '2 / 3'}`;
    const arriving = !state.arrivedGuestIds.has(character.id);
    state.arrivedGuestIds.add(character.id);
    return `<button class='guest-hit ${active ? 'is-active' : ''}' style='${hitStyle}' type='button' data-action='talk' data-id='${character.id}' aria-label='與 ${attr(character.name)} 交談'><span class='guest-name'>${html(character.name)}<small>${html(character.role)}</small></span></button><figure class='guest ${active ? 'is-active' : ''} ${arriving ? 'is-arriving' : ''}' style='${style};animation-delay:${index * 80}ms'><img src='${character.image}' alt=''></figure>`;
  }).join('');
}

function renderCaption() {
  if (!state.settings.captionsVisible) return '';
  const character = activeCharacter();
  let text = '點一位顧客，聽聽今晚的故事。';
  let muted = true;
  if (state.call) {
    text = state.call.status === 'connecting' || state.call.status === 'reconnecting' ? '正在連上另一端的聲音…' : state.call.transcript.currentModel() || '今晚想從哪裡開始聊？';
    muted = state.call.status === 'connecting' || state.call.status === 'reconnecting';
  }
  return `<div class='caption'><p class='${muted ? 'is-muted' : ''}'>${character ? `<strong>${html(character.name)}　</strong>` : ''}<span id='captionText'>${html(text)}</span></p><div class='caption-actions'><button type='button' data-action='history' aria-label='回看最近五次'>☷</button></div></div>`;
}

function renderHistory() {
  if (!state.historyOpen) return '';
  const lines = (state.call?.transcript.visibleHistory() || []).filter((line) => line.role === 'model');
  return `<section class='history'><header><h2>本次最近回覆</h2><button type='button' data-action='history'>關閉</button></header>${lines.length ? lines.map((line) => `<div class='history-row'><strong>${html(activeCharacter()?.name || '顧客')}</strong><p>${html(line.text)}</p></div>`).join('') : `<p class='history-empty'>交談開始後，角色回覆會暫時出現在這裡。</p>`}</section>`;
}

function renderControls() {
  if (!state.call) return `<div class='session-status'><span class='status'>想和誰聊聊</span></div>`;
  return `<div class='session-status'><span id='statusText' class='status ${state.call.status}'>${statusLabel(state.call.status)}</span></div><div class='control-end'><button class='danger' type='button' data-action='end' ${state.call.status === 'ending' ? 'disabled' : ''}>結束</button></div>`;
}

function renderOverlay() {
  if (state.overlay === 'story-board') return renderStoryBoardOverlay();
  const general = state.settingsTab === 'general';
  return `<div class='overlay' role='dialog' aria-modal='true' aria-labelledby='settingsTitle'><section class='settings'><nav class='settings-nav'><p class='eyebrow'>Local tavern</p><h1 id='settingsTitle'>酒館設定</h1><button class='${general ? 'is-active' : ''}' type='button' data-action='tab' data-tab='general'>⚙　全域設定</button><button class='${!general ? 'is-active' : ''}' type='button' data-action='tab' data-tab='characters'>♙　角色設定</button><button class='close' type='button' data-action='close'>←　返回</button></nav><div class='settings-content'>${general ? renderGeneralSettings() : renderCharacterSettings()}</div></section>${state.characterPreviewId ? renderCharacterPreview() : ''}</div>`;
}

function renderCharacterPreview() {
  const character = characterById(state.characterPreviewId);
  if (!character) return '';
  const portraitWidth = Number(character.portraitWidth) || 116;
  const previewScale = Math.max(1, portraitWidth / 165);
  return `<div class='character-preview' role='dialog' aria-modal='true' aria-labelledby='characterPreviewTitle'><button class='character-preview-scrim' type='button' data-action='close-character-preview' aria-label='關閉角色全圖'></button><section class='character-preview-card'><header><div><p class='eyebrow'>Character portrait</p><h2 id='characterPreviewTitle'>${html(character.name)}</h2></div><button class='character-preview-close' type='button' data-action='close-character-preview' aria-label='關閉'>×</button></header><figure style='--preview-scale:${previewScale.toFixed(2)}'><img src='${character.image}' alt='${attr(character.name)} 全身立繪'></figure><small>點擊外側區域關閉</small></section></div>`;
}

function renderGeneralSettings() {
  return `<form id='settingsForm'><header class='settings-head'><div><p class='eyebrow'>Shared between both ledgers</p><h2>全域設定</h2></div><p>角色與記憶只留在這台瀏覽器。</p></header><div class='settings-grid'><section class='panel'><h3>酒保身份</h3><div class='field'><label for='playerName'>角色稱呼</label><input id='playerName' name='playerName' maxlength='40' value='${attr(state.settings.playerName)}'></div><div class='switch-row'><div><strong>顯示角色單句字幕</strong><small>遊戲中仍可隨時關閉</small></div><label class='switch'><input name='captionsVisible' type='checkbox' ${state.settings.captionsVisible ? 'checked' : ''}><span></span></label></div></section><section class='panel'><h3>背景音樂</h3><div class='switch-row'><div><strong>自動輪播背景音樂</strong><small>開啟後依序換歌；關閉時目前歌曲單曲循環</small></div><label class='switch'><input name='backgroundMusicAutoPlay' type='checkbox' ${state.settings.backgroundMusicAutoPlay ? 'checked' : ''}><span></span></label></div></section><section class='panel full'><h3>Gemini API</h3><div class='field'><label for='apiKey'>API key</label><input id='apiKey' name='apiKey' type='password' autocomplete='off' value='${attr(getApiKey())}' placeholder='AIza…'></div><div class='model-fields'><div class='field'><label for='liveModelName'>Live model name</label><input id='liveModelName' name='liveModelName' maxlength='160' spellcheck='false' value='${attr(state.settings.liveModelName)}' placeholder='gemini-3.1-flash-live-preview'><small>語音即時交談使用</small><button class='secondary model-test' type='button' data-action='test-model' data-model-input='liveModelName' data-model-kind='Live'>測試 Live 模型</button></div><div class='field'><label for='memoryModelName'>整理記憶的 model name</label><input id='memoryModelName' name='memoryModelName' maxlength='160' spellcheck='false' value='${attr(state.settings.memoryModelName)}' placeholder='gemini-3.1-flash-lite'><small>交談結束後萃取長期記憶</small><button class='secondary model-test' type='button' data-action='test-model' data-model-input='memoryModelName' data-model-kind='記憶'>測試記憶模型</button></div></div><div class='switch-row'><div><strong>在這個瀏覽器記住金鑰</strong><small>關閉時只保留到工作階段結束</small></div><label class='switch'><input name='rememberApiKey' type='checkbox' ${state.settings.rememberApiKey ? 'checked' : ''}><span></span></label></div></section></div><div class='form-actions'><button class='secondary' type='button' data-action='close'>取消</button><button class='primary' type='submit'>儲存設定</button></div></form>`;
}

function renderCharacterSettings() {
  ensureSave();
  const character = characterById(state.editingId) || state.save.characters[0];
  const portraitWidth = Number(character.portraitWidth) || 116;
  return `<header class='settings-head'><div><p class='eyebrow'>${modeLabel()} · independent save</p><h2>角色設定</h2></div><p>立繪固定；資料只影響目前模式。</p></header><div class='character-layout'><nav class='character-list'>${state.save.characters.map((item) => `<button class='${item.id === character.id ? 'is-active' : ''}' type='button' data-action='edit-character' data-id='${item.id}'><span class='character-thumb'><img style='--thumb-width:${Number(item.thumbnailWidth) || 100}%' src='${item.image}' alt=''></span><span><strong>${html(item.name)}</strong><small>${html(item.role)}</small></span></button>`).join('')}</nav><form id='characterForm'><input type='hidden' name='id' value='${character.id}'><div class='character-top'><div><div class='field'><label>顧客名稱</label><input name='name' maxlength='40' value='${attr(character.name)}'></div><div class='field'><label>聲線</label><select name='voice'>${VOICES.map((voice) => `<option ${voice === character.voice ? 'selected' : ''}>${voice}</option>`).join('')}</select></div></div><button class='portrait' type='button' data-action='preview-character' data-id='${character.id}' aria-label='查看 ${attr(character.name)} 全圖'><img style='--portrait-width:${portraitWidth}%' src='${character.image}' alt='${attr(character.name)}'></button></div><div class='field'><label>固定人設</label><textarea name='persona' maxlength='4000'>${html(character.persona)}</textarea></div><div class='memories'>${character.memories.map((memory) => `<div class='memory'><label class='memory-lock' title='鎖定記憶'><input type='checkbox' name='memory-lock-${memory.id}' ${memory.locked ? 'checked' : ''}><span aria-hidden='true'>${memory.locked ? '◆' : '◇'}</span><span class='sr-only'>鎖定</span></label><input name='memory-${memory.id}' maxlength='500' value='${attr(memory.content)}' aria-label='記憶內容'><label class='memory-importance'><span>重要度</span><select name='memory-importance-${memory.id}' aria-label='記憶重要度'>${[1,2,3,4,5].map((level) => `<option value='${level}' ${level === memory.importance ? 'selected' : ''}>${level}</option>`).join('')}</select></label><button type='button' data-action='delete-memory' data-id='${memory.id}' aria-label='刪除'>×</button></div>`).join('')}</div><div class='field' style='margin-top:10px'><label>新增記憶</label><div style='display:flex;gap:8px'><input id='newMemory' maxlength='500' placeholder='值得長期記住的內容'><button class='secondary' type='button' data-action='add-memory'>新增</button></div></div><div class='form-actions'><button class='danger' type='button' data-action='reset-character'>重設此角色</button><button class='primary' type='submit'>儲存角色</button></div></form></div>`;
}

async function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (state.screen === 'menu') void ensureHomeBackgroundMusic().catch(() => {});
  const { action, mode, tab, id } = button.dataset;
  if (action === 'mode') { state.mode = mode; state.editingId = 'friend1'; render(); }
  else if (action === 'enter') enterBar();
  else if (action === 'menu') { if (state.call) return toast('請先結束目前的交談。'); leaveBar(); }
  else if (action === 'settings') openSettings(tab);
  else if (action === 'story-board') openStoryBoard();
  else if (action === 'close') { state.overlay = null; state.characterPreviewId = null; render(); }
  else if (action === 'close-character-preview') { state.characterPreviewId = null; render(); }
  else if (action === 'preview-character') { state.characterPreviewId = id; render(); }
  else if (action === 'tab') { state.settingsTab = tab; state.characterPreviewId = null; render(); }
  else if (action === 'edit-character') {
    const scrollTop = button.closest('.character-list')?.scrollTop || 0;
    state.editingId = id; state.characterPreviewId = null; render();
    const list = app.querySelector('.character-list');
    if (list) list.scrollTop = scrollTop;
  }
  else if (action === 'talk') await startCall(id);
  else if (action === 'end') await endCall();
  else if (action === 'background-music') await selectBackgroundMusic(id, button);
  else if (action === 'captions') { state.settings = saveSettings({ ...state.settings, captionsVisible: !state.settings.captionsVisible }); render(); }
  else if (action === 'history') { state.historyOpen = !state.historyOpen; render(); }
  else if (action === 'pin-route') pinRoute(id);
  else if (action === 'test-model') await testModel(button);
  else if (action === 'add-memory') addMemory();
  else if (action === 'delete-memory') deleteMemory(id);
  else if (action === 'reset-character') resetEditingCharacter();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (event.target.id === 'settingsForm') saveGeneralForm(event.target);
  else if (event.target.id === 'characterForm') saveCharacterForm(event.target);
  else if (event.target.id === 'deductionForm') submitDeductionForm(event.target);
  else if (event.target.id === 'accusationForm') submitAccusationForm(event.target);
}

function renderStoryBoardOverlay() {
  ensureSave();
  const board = getStoryBoard(state.save.storyState);
  const characterName = (id) => html(state.save.characters.find((item) => item.id === id)?.name || id);
  const selectedRoute = board.routes.find((route) => route.id === board.pinnedRouteId) || board.routes.find((route) => !route.completed) || board.routes[0];
  const routeCards = board.routes.map((route) => `
    <article class='case-route ${route.completed ? 'is-complete' : ''} ${route.id === board.pinnedRouteId ? 'is-pinned' : ''}'>
      <header><div><span class='case-route-mark'>${route.completed ? '✓' : '◇'}</span><div><h3>${html(route.title)}</h3><p>${html(route.description)}</p></div></div><button class='quiet' type='button' data-action='pin-route' data-id='${attr(route.id)}' ${route.completed ? 'disabled' : ''}>${route.completed ? '已完成' : route.id === board.pinnedRouteId ? '取消釘選' : '釘選路線'}</button></header>
      <div class='case-route-meta'><span>進度 ${html(route.progress)}</span><span>對證者：${characterName(route.spokespersonId)}</span></div>
      ${route.availableCharacterIds.length ? `<small class='case-route-hint'>可追查：${route.availableCharacterIds.map(characterName).join('、')}</small>` : '<small class="case-route-hint">目前沒有可立即追查的新線索。</small>'}
      <div class='case-clues'>${route.visibleClues.length ? route.visibleClues.map((clue) => `<div class='case-clue'><strong>${html(clue.title)}</strong><p>${html(clue.summary)}</p></div>`).join('') : '<p class="case-empty">尚未取得這條路線的線索。</p>'}</div>
    </article>`).join('');
  const selectable = selectedRoute?.visibleClues || [];
  const deductionStatus = selectedRoute?.deductionReady ? '勾選全部已確認線索，完成這條證據鏈。' : `還缺 ${selectedRoute?.missingClueCount || 0} 張線索；可先釘選路線追查。`;
  const deduction = selectedRoute && !selectedRoute.completed ? `<form id='deductionForm' class='case-deduction' data-route-id='${attr(selectedRoute.id)}'><header><div><p class='eyebrow'>Evidence board</p><h3>整理「${html(selectedRoute.title)}」</h3></div><small>${html(deductionStatus)}</small></header><div class='case-evidence-options'>${selectable.length ? selectable.map((clue) => `<label class='case-evidence'><input type='checkbox' name='clue' value='${attr(clue.id)}' ${selectedRoute.deductionReady ? 'required' : ''}><span><strong>${html(clue.title)}</strong><small>${html(clue.summary)}</small></span></label>`).join('') : '<p class="case-empty">先和相關角色交談，案件簿才會出現可連結的線索卡。</p>'}</div><button class='primary' type='submit' ${selectedRoute.deductionReady ? '' : 'disabled'}>${selectedRoute.deductionReady ? '提交證據鏈' : `尚缺 ${selectedRoute.missingClueCount} 張線索`}</button></form>` : '';
  const completedSpokespersons = board.routes.filter((route) => route.completed && board.eligibleSpokespersonIds.includes(route.spokespersonId)).map((route) => `<option value='${attr(route.spokespersonId)}'>${characterName(route.spokespersonId)}（${html(route.title)}）</option>`).join('');
  const accusation = board.accusationReady && !board.ending ? `<form id='accusationForm' class='case-accusation'><header><div><p class='eyebrow'>Final accusation</p><h3>提交最終指控</h3></div><small>倖存者證詞已能與至少兩條證據鏈互相印證。</small></header><label>主謀<select name='mastermindId' required><option value='' selected disabled>請選擇主謀</option>${ACCUSATION_OPTIONS.mastermind.map((item) => `<option value='${attr(item.id)}'>${html(item.label)}</option>`).join('')}</select></label><label>執行者<select name='executorId' required><option value='' selected disabled>請選擇執行者</option>${ACCUSATION_OPTIONS.executor.map((item) => `<option value='${attr(item.id)}'>${html(item.label)}</option>`).join('')}</select></label><label>結案角色<select name='spokespersonId' required>${completedSpokespersons}</select></label><button class='primary' type='submit'>確認指控</button></form>` : '';
  const testimonyKnown = board.revealedClues.some((clue) => clue.id === 'survivor-testimony');
  const untrustedSpokespersons = board.routes.filter((route) => route.completed && !board.eligibleSpokespersonIds.includes(route.spokespersonId)).map((route) => characterName(route.spokespersonId));
  const finalLead = board.witnessNeeded
    ? `<p class='case-unlock'>兩條證據鏈已完成；${board.witnessUnlocked ? `請與${characterName('friend12')}交談，取得倖存者證詞。` : `先和${characterName('friend12')}建立「可信任」關係，再請她帶回倖存者證詞。`}</p>`
    : testimonyKnown && !board.accusationReady && !board.ending && untrustedSpokespersons.length
      ? `<p class='case-unlock'>證詞已取得；請先讓已完成路線的對證者 ${untrustedSpokespersons.join('、')} 達到「可信任」。</p>`
      : '';
  const ending = board.ending ? `<section class='case-ending'><p class='eyebrow'>Case closed</p><h3>${board.ending.completeness === 'complete' ? '灰燼商隊的完整真相已拼回來' : '灰燼商隊案件已結案'}</h3><p>${html(board.ending.epilogue || `由 ${characterName(board.ending.spokespersonId)} 代表你完成結案。`)}</p><small>仍可繼續交談，補完其他路線。</small></section>` : '';
  const trust = state.save.characters.map((character) => `<div class='case-trust'><span>${html(character.name)}</span><span class='case-trust-dots'>${[1, 2, 3].map((level) => `<i class='${level <= (board.trustByCharacter[character.id] ?? 1) ? 'is-on' : ''}'></i>`).join('')}</span><small>${html(board.trustLabels[character.id])}</small></div>`).join('');
  return `<div class='overlay casebook-overlay' role='dialog' aria-modal='true' aria-labelledby='casebookTitle'><section class='casebook'><header class='casebook-head'><div><p class='eyebrow'>Ashes Ensemble</p><h2 id='casebookTitle'>案件簿</h2><p>把角色帶回來的碎片，整理成可以驗證的證據鏈。</p></div><button class='character-preview-close' type='button' data-action='close' aria-label='關閉案件簿'>×</button></header><div class='casebook-scroll'><section class='case-routes'>${routeCards}</section>${deduction}${accusation}${finalLead}${ending}<section class='case-trust-panel'><header><div><p class='eyebrow'>Trust ledger</p><h3>角色信任</h3></div><small>有效交談與明確分享會逐步累積信任。</small></header><div class='case-trust-grid'>${trust}</div></section></div></section></div>`;
}

async function selectBackgroundMusic(trackId, button) {
  if (button) button.disabled = true;
  try {
    await (trackId === DEFAULT_BACKGROUND_MUSIC_ID ? selectDefaultBackgroundMusic() : state.backgroundMusic.select(trackId));
    state.backgroundMusicTitle = backgroundMusicTitle(trackId);
    render();
  } catch (error) {
    if (button) button.disabled = false;
    toast(`無法播放背景音樂：${error.message}`);
  }
}

function enterBar() {
  state.save = loadSave(state.mode);
  state.simulation = new GuestSimulation(state.save.characters.map((item) => item.id));
  syncStorySimulationPriority();
  state.arrivedGuestIds = new Set();
  state.guests = state.simulation.start();
  state.soundscape = new TavernSoundscape();
  state.soundscape.start();
  state.screen = 'bar';
  state.backgroundMusicTitle = backgroundMusicTitle(DEFAULT_BACKGROUND_MUSIC_ID);
  state.historyOpen = false;
  render();
  void selectDefaultBackgroundMusic().then(render).catch((error) => {
    render();
    toast(`無法播放預設背景音樂：${error.message}`);
  });
}

function ensureHomeBackgroundMusic() {
  if (state.screen !== 'menu') return Promise.resolve(false);
  return selectDefaultBackgroundMusic();
}

function selectDefaultBackgroundMusic() {
  if (state.backgroundMusic.selectedId === DEFAULT_BACKGROUND_MUSIC_ID && state.backgroundMusic.currentAudio) return Promise.resolve(true);
  if (state.backgroundMusicRequest) return state.backgroundMusicRequest;
  const request = state.backgroundMusic.select(DEFAULT_BACKGROUND_MUSIC_ID);
  const trackedRequest = request.finally(() => {
    if (state.backgroundMusicRequest === trackedRequest) state.backgroundMusicRequest = null;
  });
  state.backgroundMusicRequest = trackedRequest;
  return trackedRequest;
}

function leaveBar() {
  void selectDefaultBackgroundMusic().catch(() => {});
  state.soundscape?.stop();
  state.soundscape = null;
  state.screen = 'menu'; state.save = null; state.simulation = null; state.guests = []; state.overlay = null; state.characterPreviewId = null; render();
}

function openSettings(tab) {
  if (state.call) return toast('請先結束目前的交談再調整設定。');
  state.settingsTab = tab || 'general'; state.overlay = 'settings'; state.characterPreviewId = null; ensureSave(); render();
}

function openStoryBoard() {
  if (state.mode !== 'story') return;
  if (state.call) return toast('請先結束目前的交談，再查看案件簿。');
  ensureSave(); state.overlay = 'story-board'; state.characterPreviewId = null; render();
}

function pinRoute(routeId) {
  if (state.mode !== 'story' || state.call) return;
  ensureSave();
  const board = getStoryBoard(state.save.storyState);
  state.save = saveMode({ ...state.save, storyState: pinStoryRoute(state.save.storyState, board.pinnedRouteId === routeId ? null : routeId) });
  syncStorySimulationPriority();
  render();
}

function submitDeductionForm(form) {
  if (!form || state.mode !== 'story' || state.call) return;
  ensureSave();
  const selected = [...new FormData(form).getAll('clue')];
  const result = submitDeduction(state.save.storyState, form.dataset.routeId, selected);
  if (!result.accepted) return toast('證據鏈還不能成立；只選已確認且屬於同一路線的線索。');
  state.save = saveMode({ ...state.save, storyState: result.state });
  syncStorySimulationPriority();
  render();
  toast(result.reason === 'already-solved' ? '這條證據鏈已經整理完成。' : '證據鏈成立；案件簿已更新。');
}

function submitAccusationForm(form) {
  if (!form || state.mode !== 'story' || state.call) return;
  ensureSave();
  const values = new FormData(form);
  const result = submitAccusation(state.save.storyState, {
    mastermindId: values.get('mastermindId'), executorId: values.get('executorId'), spokespersonId: values.get('spokespersonId'),
  });
  state.save = saveMode({ ...state.save, storyState: result.state });
  syncStorySimulationPriority();
  render();
  if (result.accepted) return toast('指控成立。案件簿留下了這個結案版本。');
  toast(result.reason === 'incorrect' ? '指控沒有被證據支持；請先重新和結案角色談談。' : '目前還不能提交最終指控。');
}

function syncStorySimulationPriority() {
  if (!state.simulation || state.mode !== 'story' || !state.save) return;
  const board = getStoryBoard(state.save.storyState);
  state.simulation.setPriorityCharacterIds(board.priorityCharacterIds, 30000, board.priorityCharacterIds.length > 0);
}

async function startCall(characterId) {
  if (state.call) return characterId === state.call.characterId ? undefined : toast(`請先結束與 ${activeCharacter().name} 的交談。`);
  const apiKey = getApiKey();
  if (!apiKey) { toast('請先在設定輸入 Gemini API key。'); return openSettings('general'); }
  const character = characterById(characterId);
  const transcript = new SessionTranscript();
  const storyEncounterCount = character.encounterCount;
  const storyConversation = state.mode === 'story' ? prepareStoryConversation(characterId, state.save.storyState, storyEncounterCount, { characterNames: Object.fromEntries(state.save.characters.map((item) => [item.id, item.name])) }) : null;
  const call = { characterId, status: 'connecting', transcript, storyConversation, storyEncounterCount, audio: null, session: null, audioErrorShown: false, startCuePlayed: false, startedAt: Date.now() };
  state.call = call; state.simulation.setActive(characterId); render();
  try {
    call.audio = new BrowserAudioEngine({ capture: true, onAudioChunk: (bytes) => call.session?.sendAudio(bytes) });
    await call.audio.start();
    call.session = new LiveSession({ apiKey, liveModelName: state.settings.liveModelName, voice: character.voice, systemInstruction: buildSystemInstruction(character, selectMemories(character.memories), state.settings.playerName, state.mode, storyConversation?.instruction) }, {
      onStatus: (status) => {
        if (state.call !== call) return;
        call.status = status;
        updateCallDom();
        if (!call.startCuePlayed && (status === 'connected' || status === 'listening')) {
          call.startCuePlayed = true;
          void call.audio.playSessionCue('start').catch((error) => {
            console.error('[Bartender Audio]', error);
            if (state.call !== call || call.audioErrorShown) return;
            call.audioErrorShown = true;
            toast(`無法啟動聲音輸出：${error.message}`);
          });
        }
      },
      onAudio: (bytes) => {
        void call.audio.playPcm24k(bytes).catch((error) => {
          console.error('[Bartender Audio]', error);
          if (state.call !== call || call.audioErrorShown) return;
          call.audioErrorShown = true;
          toast(`無法播放角色聲音：${error.message}`);
        });
      },
      onUserTranscript: (text) => { if (state.call === call) call.transcript.onVoiceUser(text); },
      onModelTranscript: (text) => { if (state.call !== call) return; call.transcript.onModel(text); updateCaptionDom(); },
      onInterrupted: () => {
        call.audio.flushPlayback();
        call.transcript.onInterrupted();
        render();
      },
      onTurnComplete: () => { call.transcript.onTurnComplete(); render(); },
      onError: (error) => toast(error.message),
      onDebug: (message) => console.warn('[Bartender Live]', message),
    });
    call.session.start();
  } catch (error) {
    await call.audio?.stop(); state.call = null; state.simulation.setActive(null); render(); toast(`無法開始交談：${error.message}`);
  }
}

async function endCall() {
  const call = state.call;
  if (!call || call.status === 'ending') return;
  call.status = 'ending'; updateCallDom(); call.session?.stop(); await call.audio?.stop();
  const transcript = call.transcript.snapshotForAnalysis(); call.transcript.clear();
  const mode = state.mode; const characterId = call.characterId; const apiKey = getApiKey();
  const character = characterById(characterId); character.lastMetAt = Date.now(); character.encounterCount += 1; state.save = saveMode(state.save);
  state.call = null; state.simulation.setActive(null); state.historyOpen = false; render();
  if (!transcript.some((line) => line.role === 'user')) return toast('交談已結束，本次沒有足夠內容可整理。');
  toast('交談已結束，正在整理高信心記憶…');
  if (mode === 'story') return finishStoryAnalysis({ apiKey, character, characterId, transcript, call, mode });
  try {
    const additions = await analyzeMemories(apiKey, character, transcript, character.memories, state.settings.memoryModelName);
    const target = mode === state.mode && state.save ? state.save : loadSave(mode);
    const storedCharacter = target.characters.find((item) => item.id === characterId);
    storedCharacter.memories.push(...additions);
    const saved = saveMode(target); if (mode === state.mode && state.save) state.save = saved;
    toast(additions.length ? `已為 ${storedCharacter.name} 新增 ${additions.length} 條記憶。` : '本次沒有新增長期記憶。');
  } catch (error) { toast(`記憶整理失敗：${error.message}`); }
}

async function finishStoryAnalysis({ apiKey, character, characterId, transcript, call, mode }) {
  const [memoryResult, storyResult] = await Promise.allSettled([
    analyzeMemories(apiKey, character, transcript, character.memories, state.settings.memoryModelName, { mode: 'story' }),
    analyzeStoryEvents(apiKey, character, transcript, call.storyConversation, state.settings.memoryModelName),
  ]);
  const target = mode === state.mode && state.save ? state.save : loadSave(mode);
  const storedCharacter = target.characters.find((item) => item.id === characterId);
  const additions = memoryResult.status === 'fulfilled' ? memoryResult.value : [];
  storedCharacter.memories.push(...additions);

  let accepted = { revealedClueIds: [], disclosedClueIds: [] };
  const trustBefore = target.storyState.trustByCharacter?.[characterId] ?? 1;
  if (storyResult.status === 'fulfilled') {
    const advanced = advanceStory(characterId, target.storyState, storyResult.value, call.storyEncounterCount);
    target.storyState = advanced.state;
    accepted = advanced.accepted;
  }
  const meaningful = transcript.some((line) => line.role === 'user') && transcript.some((line) => line.role === 'model');
  target.storyState = recordStoryInteraction(target.storyState, characterId, { meaningful, disclosedClueCount: accepted.disclosedClueIds.length });
  const saved = saveMode(target);
  if (mode === state.mode && state.save) state.save = saved;
  if (mode === state.mode && state.save) syncStorySimulationPriority();

  const updates = [];
  if (additions.length) updates.push(`${additions.length} 條記憶`);
  if (accepted.revealedClueIds.length) {
    const titles = accepted.revealedClueIds.map((id) => CLUES.find((clue) => clue.id === id)?.title || id);
    updates.push(`新線索：${titles.join('、')}`);
  }
  if (accepted.disclosedClueIds.length) updates.push(`${accepted.disclosedClueIds.length} 條角色知情`);
  const trustAfter = target.storyState.trustByCharacter?.[characterId] ?? trustBefore;
  if (trustAfter > trustBefore) updates.push(`信任提升至${trustAfter}級`);
  const failures = [];
  if (memoryResult.status === 'rejected') {
    console.warn('[Bartender Memory]', memoryResult.reason);
    failures.push('關係記憶整理失敗');
  }
  if (storyResult.status === 'rejected') {
    console.warn('[Bartender Story]', storyResult.reason);
    failures.push('故事事件整理失敗');
  }
  if (failures.length) return toast(`${updates.length ? `已保存${updates.join('、')}；` : ''}${failures.join('、')}。`);
  toast(updates.length ? `已為 ${storedCharacter.name} 保存${updates.join('、')}。` : '本次沒有新增長期記憶或故事進度。');
}

function updateCallDom() {
  const status = document.getElementById('statusText');
  if (status && state.call) { status.className = `status ${state.call.status}`; status.textContent = statusLabel(state.call.status); }
  updateCaptionDom();
}

function updateCaptionDom() {
  const element = document.getElementById('captionText');
  if (element && state.call) element.textContent = state.call.transcript.currentModel() || (['connecting','reconnecting'].includes(state.call.status) ? '正在連上另一端的聲音…' : '正在聽你說…');
}

function updateSimulation() {
  if (state.screen !== 'bar' || state.overlay || !state.simulation) return;
  const events = state.simulation.tick();
  if (events.length) {
    let shouldRender = false;
    for (const event of events) {
      if (event.type === 'arrival-door') {
        state.soundscape?.playEffect('door', 0.42);
        continue;
      }
      if (event.type === 'left') {
        state.arrivedGuestIds.delete(event.characterId);
        state.soundscape?.playEffect('door', 0.42);
        shouldRender = true;
        continue;
      }
      if (event.type === 'arrived') shouldRender = true;
    }
    if (shouldRender) {
      state.guests = state.simulation.snapshot(); render();
    }
  }
}

function saveGeneralForm(form) {
  const values = new FormData(form);
  state.settings = saveSettings({ playerName: values.get('playerName'), captionsVisible: values.get('captionsVisible') === 'on', backgroundMusicAutoPlay: values.get('backgroundMusicAutoPlay') === 'on', rememberApiKey: values.get('rememberApiKey') === 'on', liveModelName: values.get('liveModelName'), memoryModelName: values.get('memoryModelName') });
  state.backgroundMusic.setAutoPlay(state.settings.backgroundMusicAutoPlay);
  saveApiKey(values.get('apiKey'), state.settings.rememberApiKey); state.overlay = null; render(); toast('設定已儲存。');
}

async function testModel(button) {
  const input = document.getElementById('apiKey');
  const model = document.getElementById(button.dataset.modelInput);
  const kind = button.dataset.modelKind || '';
  const modelLabel = kind === 'Live' ? 'Live 模型' : '記憶模型';
  if (!input?.value.trim()) return toast('請先輸入 API key。');
  const idleLabel = button.textContent;
  button.disabled = true; button.textContent = '測試中…';
  try { await checkModel(input.value.trim(), model?.value); toast(`Gemini ${modelLabel}連線成功。`); }
  catch (error) { toast(error.message); }
  finally { button.disabled = false; button.textContent = idleLabel; }
}

function captureCharacterForm() {
  const form = document.getElementById('characterForm'); if (!form) return;
  const character = characterById(state.editingId); const values = new FormData(form);
  character.name = String(values.get('name') || character.name).trim() || character.name;
  character.voice = VOICES.includes(values.get('voice')) ? values.get('voice') : character.voice;
  character.persona = String(values.get('persona') || character.persona).trim() || character.persona;
  character.memories = character.memories.map((memory) => ({
    ...memory,
    content: String(values.get(`memory-${memory.id}`) || memory.content).trim() || memory.content,
    locked: values.get(`memory-lock-${memory.id}`) === 'on',
    importance: Math.min(5, Math.max(1, Number(values.get(`memory-importance-${memory.id}`)) || 3)),
  }));
}

function saveCharacterForm() { captureCharacterForm(); state.save = saveMode(state.save); render(); toast('角色設定已儲存。'); }
function addMemory() { captureCharacterForm(); const input = document.getElementById('newMemory'); const content = input?.value.trim(); if (!content) return toast('先輸入記憶內容。'); characterById(state.editingId).memories.push({ id:`memory-${Date.now()}`,content,locked:false,importance:3,createdAt:Date.now() }); state.save=saveMode(state.save); render(); }
function deleteMemory(id) { captureCharacterForm(); const character=characterById(state.editingId); const target=character.memories.find((memory)=>memory.id===id); if (target?.locked) return toast('固定記憶已鎖定，請先改寫而不是刪除。'); character.memories=character.memories.filter((memory)=>memory.id!==id); state.save=saveMode(state.save); render(); }
function resetEditingCharacter() { state.save=saveMode(resetCharacter(state.save,state.editingId)); render(); toast('已重設此角色在目前模式的資料。'); }
function ensureSave() { if (!state.save || state.save.mode !== state.mode) state.save = loadSave(state.mode); }
function characterById(id) { ensureSave(); return state.save.characters.find((character) => character.id === id); }
function activeCharacter() { return state.call ? characterById(state.call.characterId) : null; }
function modeLabel() { return state.mode === 'story' ? '灰燼群像' : '療癒夜話'; }
function selectMemories(memories) { let used=0; return [...memories].sort((a,b)=>Number(b.locked)-Number(a.locked)||b.importance-a.importance||b.createdAt-a.createdAt).filter((memory)=>{const cost=memory.content.length;if(used+cost>3000)return false;used+=cost;return true;}); }
function statusLabel(status) { return ({connecting:'正在連線…',reconnecting:'重新連線中…',connected:'語音連線中',listening:'正在聽你說',speaking:`${activeCharacter()?.name || '顧客'} 回應中`,failed:'連線失敗',ending:'正在結束…'})[status] || status; }
function toast(message) { const element=document.createElement('div');element.className='toast';element.textContent=message;toastRegion.appendChild(element);setTimeout(()=>element.remove(),4200); }
function html(value) { return String(value??'').replace(/[&<>]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]); }
function attr(value) { return html(value).replace(/'/g,'&#39;'); }
