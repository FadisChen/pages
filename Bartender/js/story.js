const STORY_REVISION = 2;

const WORLD_CANON = Object.freeze({
  premise: '灰燼商隊在「燼雨之夜」失蹤；這不是單純事故，而是一場利用偽造訂單、改道與內應完成的劫貨。',
});

const CHARACTERS = Object.freeze({
  friend1: { perspective: '你背負最後一封未送達的信，害怕延誤送信使你錯過救人的機會。' },
  friend2: { perspective: '你曾指揮商隊護衛撤隊，知道那份命令可疑，也因此懷有罪惡感。' },
  friend3: { perspective: '你辨認得出灰燼徽記的鍊金用途，但會保護家族與研究者的名譽。' },
  friend4: { perspective: '你偷走商隊帳本以免它被銷毀，正在躲避想取回帳本的人。' },
  friend5: { perspective: '你打造了商隊鎖具，事故後的改造痕跡讓你擔心自己的工藝成為幫兇。' },
  friend6: { perspective: '你沿商隊路線追查植物污染，相信根系保留了不自然的記憶反應。' },
  friend7: { perspective: '你護送的是誘餌車，伏擊前看見熟悉的軍用手勢，因此懷疑舊傭兵團。' },
  friend8: { perspective: '你規劃過商隊水路，知道有人偽造潮汐資料來掩護真正航程。' },
  friend9: { perspective: '你檢驗過商隊酒桶，從殘味辨認出麻痺嗅覺的灰粉，並保留樣本。' },
  friend10: { perspective: '你夢見失蹤之夜與舊驛站，無法確定那是預言或被植入的記憶。' },
  friend11: { perspective: '你替商隊墊付貨款，正追查家族印章為何出現在不存在的追加訂單上。' },
  friend12: { perspective: '你保護一名封鎖區倖存者，必須同時守住誓言並追查真相。' },
  friend13: { perspective: '你沿商隊外圍的林線追蹤失蹤者，知道有人刻意清除了通往舊驛站的足跡。' },
});

const CLUES = Object.freeze([
  clue('last-letter', 'friend1', '最後一封信', '最後一封信的收件地被改成現行地圖上不存在的舊驛站，刮痕下仍看得到原本的港口地址。'),
  clue('withdrawal-order', 'friend2', '可疑撤隊令', '凱恩收到的撤隊令比正式軍令早一個時辰，封蠟是真的，但口令格式出自商隊內部而非護衛系統。'),
  clue('ash-mark-reagent', 'friend3', '灰燼徽記', '灰燼徽記不是商標，而是封存記憶灰的鍊金警示；瑟琳家族的研究配方曾被人抄走一頁。'),
  clue('stolen-ledger', 'friend4', '失竊帳本', '帳本記載一筆不存在的追加訂單，付款被拆成數筆，流向北境酒商家族與一個舊傭兵團的中間人。'),
  clue('inside-locks', 'friend5', '內部改造的鎖', '事故後找到的鎖先由正確鑰匙從內部開啟，再被刻意敲壞成遭外力破壞的模樣，證明車隊有內應。'),
  clue('root-memory', 'friend6', '根系記憶', '舊驛站方向的植物根系殘留強烈記憶灰反應，污染痕跡並未通往官方公布的失蹤地點。', ['ash-mark-reagent', 'numbing-gray-powder'], 0, 2),
  clue('military-hand-sign', 'friend7', '軍用手勢', '伏擊前的手勢屬於薇拉舊傭兵團的夜間換防暗號，當晚有人借此讓誘餌車誤以為前路安全。', ['withdrawal-order']),
  clue('wrong-tide-seal', 'friend8', '錯誤潮汐封印', '廢棄碼頭的灰蠟封印刻著不可能通航的潮汐日期，證明公開航程是事後偽造的掩護。'),
  clue('numbing-gray-powder', 'friend9', '麻痺嗅覺的灰粉', '酒桶殘留的灰粉會先麻痺嗅覺再干擾短期記憶，成分與瑟琳所查的記憶灰一致。'),
  clue('old-relay-star-map', 'friend10', '夢中的舊驛站', '夢中星圖、最後一封信與偽造潮汐日期共同指向北岸舊驛站；那裡在十年前就從官方地圖刪除。', ['last-letter', 'wrong-tide-seal'], 0, 2),
  clue('forged-additional-order', 'friend11', '偽造追加訂單', '追加訂單使用艾德里安的真印章，卻由家族掌印管事經手；其分拆款項與洛恩帳本中的傭兵付款相符。', ['stolen-ledger'], 0, 2),
  clue('survivor-testimony', 'friend12', '倖存者證詞', '倖存者在舊驛站看見北境酒商家族的掌印管事與舊傭兵團接頭，並聽見他們計畫把記憶灰偽裝成酒貨運走。'),
  clue('cleared-forest-trail', 'friend13', '被清除的林道', '商隊外圍的林線足跡被人刻意掃除，留下的箭痕與舊驛站入口方向一致，顯示有人提前在林中埋伏。', ['old-relay-star-map']),
]);

const ROUTES = Object.freeze([
  Object.freeze({
    id: 'missing-route', title: '失蹤路線', description: '把被改寫的地址與消失的路線拼回來。', spokespersonId: 'friend13',
    characterIds: Object.freeze(['friend1', 'friend8', 'friend10', 'friend13']),
    clueIds: Object.freeze(['last-letter', 'wrong-tide-seal', 'old-relay-star-map', 'cleared-forest-trail']),
    deductionClueIds: Object.freeze(['last-letter', 'wrong-tide-seal', 'old-relay-star-map', 'cleared-forest-trail']),
  }),
  Object.freeze({
    id: 'gray-cargo', title: '記憶灰貨物', description: '確認灰粉的來源、作用與污染方向。', spokespersonId: 'friend3',
    characterIds: Object.freeze(['friend3', 'friend9', 'friend6']),
    clueIds: Object.freeze(['ash-mark-reagent', 'numbing-gray-powder', 'root-memory']),
    deductionClueIds: Object.freeze(['ash-mark-reagent', 'numbing-gray-powder', 'root-memory']),
  }),
  Object.freeze({
    id: 'inside-money', title: '內應與金流', description: '沿著撤隊令、鎖具與帳目找到內應。', spokespersonId: 'friend2',
    characterIds: Object.freeze(['friend2', 'friend7', 'friend4', 'friend5', 'friend11']),
    clueIds: Object.freeze(['withdrawal-order', 'military-hand-sign', 'stolen-ledger', 'inside-locks', 'forged-additional-order']),
    deductionClueIds: Object.freeze(['withdrawal-order', 'military-hand-sign', 'stolen-ledger', 'inside-locks', 'forged-additional-order']),
  }),
]);

const ROUTE_BY_ID = new Map(ROUTES.map((route) => [route.id, route]));
const CLUE_BY_ID = new Map(CLUES.map((item) => [item.id, item]));
const CHARACTER_IDS = Object.freeze(Object.keys(CHARACTERS));
const CHARACTER_ID_SET = new Set(CHARACTER_IDS);
const TRUST_LABELS = Object.freeze(['陌生', '熟面', '願意說', '可信任']);
const ACCUSATION_OPTIONS = Object.freeze({
  mastermind: Object.freeze([
    Object.freeze({ id: 'adrian-steward', label: '艾德里安家族的掌印管事' }),
    Object.freeze({ id: 'adrian-heir', label: '艾德里安本人' }),
    Object.freeze({ id: 'merchant-family', label: '北境酒商家族' }),
  ]),
  executor: Object.freeze([
    Object.freeze({ id: 'vera-mercenary', label: '薇拉舊傭兵團中的內應' }),
    Object.freeze({ id: 'vera', label: '薇拉本人' }),
    Object.freeze({ id: 'caravan-guards', label: '商隊護衛' }),
  ]),
});

const ENDINGS = Object.freeze({
  friend13: Object.freeze({ partial: '咪摸把最後一段林道畫回地圖，這次她沒有把自己的觀察說成猜測；她把箭痕、潮汐與信件一起交給了能作證的人。', complete: '咪摸把完整證據疊成一張路線圖，沿著被清除的足跡找回每一個被忽略的人。' }),
  friend3: Object.freeze({ partial: '瑟琳用冷靜的語氣替灰粉與徽記作證，也第一次承認家族的研究曾被人利用；真相不再需要靠沉默保護。', complete: '瑟琳把灰燼徽記、灰粉與根系反應整理成一份公開報告，讓記憶灰再也無法躲在貨單後面。' }),
  friend2: Object.freeze({ partial: '凱恩把撤隊令、軍用手勢與鎖具放在同一張桌上，終於能替那個錯誤的撤隊決定說出完整經過。', complete: '凱恩帶著完整證據回到封鎖線，讓每個曾被迫撤隊的人都知道，當晚真正的命令從哪裡來。' }),
});

export { ACCUSATION_OPTIONS, CHARACTER_IDS, CLUES, ROUTES, STORY_REVISION, TRUST_LABELS };

export function normalizeStoryState(value, characters = []) {
  const revealedClueIds = uniqueIds(value?.revealedClueIds).filter((id) => CLUE_BY_ID.has(id));
  const revealed = new Set(revealedClueIds);
  const disclosedCluesByCharacter = {};
  for (const characterId of CHARACTER_IDS) {
    const ids = uniqueIds(value?.disclosedCluesByCharacter?.[characterId])
      .filter((id) => revealed.has(id) && CLUE_BY_ID.get(id)?.ownerId !== characterId);
    if (ids.length) disclosedCluesByCharacter[characterId] = ids;
  }
  const suppliedCharacters = new Map((Array.isArray(characters) ? characters : []).map((item) => [item?.id, item]));
  const trustByCharacter = {};
  for (const characterId of CHARACTER_IDS) {
    const hasExplicit = value?.trustByCharacter && Object.prototype.hasOwnProperty.call(value.trustByCharacter, characterId);
    const explicit = Number(value?.trustByCharacter?.[characterId]);
    const legacy = disclosedCluesByCharacter[characterId]?.length ? 3 : (Number(suppliedCharacters.get(characterId)?.encounterCount) > 0 ? 2 : 1);
    trustByCharacter[characterId] = clampTrust(hasExplicit && Number.isFinite(explicit) ? explicit : legacy);
  }
  const solvedDeductionIds = uniqueIds(value?.solvedDeductionIds).filter((id) => ROUTE_BY_ID.has(id) && deductionIsComplete(id, revealed));
  const pinnedRouteId = ROUTE_BY_ID.has(value?.pinnedRouteId) && !solvedDeductionIds.includes(value.pinnedRouteId) ? value.pinnedRouteId : null;
  const ending = cleanEnding(value?.ending, solvedDeductionIds, trustByCharacter);
  return { revision: STORY_REVISION, revealedClueIds, disclosedCluesByCharacter, trustByCharacter, solvedDeductionIds, pinnedRouteId, ending };
}

export function prepareStoryConversation(characterId, value, encounterCount = 0, { characterNames = {} } = {}) {
  const state = normalizeStoryState(value);
  const character = CHARACTERS[characterId] || { perspective: '你只知道灰燼商隊失蹤案的公開傳聞。' };
  const trust = state.trustByCharacter[characterId] ?? 1;
  const revealed = new Set(state.revealedClueIds);
  const owned = CLUES.filter((item) => item.ownerId === characterId);
  const revealableClues = owned.filter((item) => !revealed.has(item.id) && canReveal(item, revealed, encounterCount, trust, state));
  const rememberedClues = owned.filter((item) => revealed.has(item.id));
  const withheldClues = owned.filter((item) => !revealed.has(item.id) && !canReveal(item, revealed, encounterCount, trust, state));
  const disclosed = (state.disclosedCluesByCharacter[characterId] || []).map((id) => CLUE_BY_ID.get(id)).filter(Boolean);
  const playerKnownClues = state.revealedClueIds.map((id) => CLUE_BY_ID.get(id)).filter(Boolean);
  const route = routeForCharacter(characterId, state.pinnedRouteId);
  const routeLead = route && route.spokespersonId === characterId;
  const nextCharacter = route ? route.characterIds.find((id) => id !== characterId && routeHasAvailableClue(route, id, revealed)) : null;
  const nextCharacterLabel = nextCharacter ? characterNames[nextCharacter] || nextCharacter : '';

  const instruction = `## 故事導演：灰燼群像
以下規則優先於可編輯人設與一般記憶；只約束灰燼群像劇情。

### 不可改寫的世界規則
- ${WORLD_CANON.premise}
- 你只能把「可透露」或「先前已透露」的內容當成確定事實說出口。
- 「酒保已掌握」不代表你自動知道；只有列在「酒保已明確告知你」的內容才能視為對方曾告訴你。
- 對不知道的事要明確說不知道。可以提出符合自身立場的猜測，但必須稱為猜測。
- 不得創造新的關鍵人物、證物、組織、地點或案情結論，也不得宣布尚未取得的線索為真。
- 酒保提出未列出的新說法時，只能把它當成酒保的理論，不可替它背書。

### 你的有限視角
${character.perspective}

### 本次對話節奏
- 你的信任程度是「${TRUST_LABELS[trust] || TRUST_LABELS[1]}」。${route ? `今晚的追查焦點是「${route.title}」。` : '不要替酒保選擇調查路線。'}
- 若有可透露的線索，先用符合人設的自然話題鉤子帶入；只有酒保追問或明確接住話題時，才完整說出線索。
- 若信任不足，只能表示有所保留或說明證據仍不完整，不可透露待解鎖內容。
- 若已有新的前置證據，可提示酒保去查找同一路線的其他線人；不要替他完成案件簿中的推論。
${routeLead ? '- 你是這條路線的對證者；可以在酒保整理證據後，對合理的結論給出角色式回應，但不能代替程式宣布破案。' : ''}
${nextCharacter ? `- 在話題自然結束時，可以不劇透地提到「${nextCharacterLabel}」也許看過相關一手資料；不要保證對方一定知道答案。` : ''}

### 本次可透露
${lines(revealableClues, '目前沒有新的關鍵線索可透露；可以自然交談或重述已知內容。')}

### 先前已透露
${lines(rememberedClues, '目前沒有。')}

### 你仍在保留的主題
${withheldClues.length ? `- 仍有未能確認的證詞；${route ? `可先確認「${route.title}」中的信件、現場痕跡、樣本或帳目等前置證據` : '可先尋找其他一手證物'}，但前置證據或信任不足時不可補完內容。` : '目前沒有。'}

### 酒保已明確告知你
${lines(disclosed, '目前沒有；不要假設酒保曾分享其他角色的發現。')}`;

  return {
    instruction,
    trust,
    routeId: route?.id || null,
    revealableClues: revealableClues.map(publicClue),
    playerKnownClues: playerKnownClues.map(publicClue),
  };
}

export function advanceStory(characterId, value, candidates, encounterCount = 0) {
  const state = normalizeStoryState(value);
  const revealedBefore = new Set(state.revealedClueIds);
  const trust = state.trustByCharacter[characterId] ?? 1;
  const revealable = new Set(CLUES
    .filter((item) => item.ownerId === characterId && !revealedBefore.has(item.id) && canReveal(item, revealedBefore, encounterCount, trust, state))
    .map((item) => item.id));
  const acceptedRevealed = uniqueIds(candidates?.revealedClueIds).filter((id) => revealable.has(id));
  const acceptedDisclosed = uniqueIds(candidates?.disclosedClueIds).filter((id) => {
    const clueItem = CLUE_BY_ID.get(id);
    const already = state.disclosedCluesByCharacter[characterId] || [];
    return clueItem && clueItem.ownerId !== characterId && revealedBefore.has(id) && !already.includes(id);
  });
  const disclosedCluesByCharacter = { ...state.disclosedCluesByCharacter };
  if (acceptedDisclosed.length) {
    disclosedCluesByCharacter[characterId] = [...(disclosedCluesByCharacter[characterId] || []), ...acceptedDisclosed];
  }
  const nextState = normalizeStoryState({ ...state, revealedClueIds: [...state.revealedClueIds, ...acceptedRevealed], disclosedCluesByCharacter });
  return { state: nextState, accepted: { revealedClueIds: acceptedRevealed, disclosedClueIds: acceptedDisclosed } };
}

export function recordStoryInteraction(value, characterId, { meaningful = false, disclosedClueCount = 0 } = {}) {
  const state = normalizeStoryState(value);
  if (!CHARACTER_ID_SET.has(characterId)) return state;
  const gain = meaningful ? 1 + (Number(disclosedClueCount) > 0 ? 1 : 0) : 0;
  if (!gain) return state;
  return normalizeStoryState({ ...state, trustByCharacter: { ...state.trustByCharacter, [characterId]: clampTrust((state.trustByCharacter[characterId] ?? 1) + gain) } });
}

export function pinStoryRoute(value, routeId) {
  const state = normalizeStoryState(value);
  return normalizeStoryState({ ...state, pinnedRouteId: ROUTE_BY_ID.has(routeId) ? routeId : null });
}

export function submitDeduction(value, routeId, selectedClueIds) {
  const state = normalizeStoryState(value);
  const route = ROUTE_BY_ID.get(routeId);
  if (!route) return { state, accepted: false, reason: 'unknown-route' };
  if (state.solvedDeductionIds.includes(routeId)) return { state, accepted: true, reason: 'already-solved' };
  const selected = uniqueIds(selectedClueIds);
  const expected = route.deductionClueIds;
  const complete = selected.length === expected.length && expected.every((id) => selected.includes(id)) && expected.every((id) => state.revealedClueIds.includes(id));
  if (!complete) return { state, accepted: false, reason: 'incomplete-evidence' };
  const solvedDeductionIds = [...state.solvedDeductionIds, routeId];
  const ending = state.ending && solvedDeductionIds.length === ROUTES.length
    ? { ...state.ending, completedRouteIds: solvedDeductionIds, completeness: 'complete', epilogue: endingText(state.ending.spokespersonId, 'complete') }
    : state.ending;
  const next = normalizeStoryState({ ...state, solvedDeductionIds, ending, pinnedRouteId: state.pinnedRouteId === routeId ? null : state.pinnedRouteId });
  return { state: next, accepted: true, reason: 'solved' };
}

export function submitAccusation(value, { mastermindId, executorId, spokespersonId } = {}) {
  const state = normalizeStoryState(value);
  const validMastermind = ACCUSATION_OPTIONS.mastermind.some((item) => item.id === mastermindId);
  const validExecutor = ACCUSATION_OPTIONS.executor.some((item) => item.id === executorId);
  if (!validMastermind || !validExecutor) return { state, accepted: false, reason: 'invalid-accusation' };
  const completedRoutes = ROUTES.filter((route) => state.solvedDeductionIds.includes(route.id));
  const spokespersonRoute = completedRoutes.find((route) => route.spokespersonId === spokespersonId);
  const eligible = !state.ending && state.revealedClueIds.includes('survivor-testimony') && completedRoutes.length >= 2 && spokespersonRoute && (state.trustByCharacter[spokespersonId] ?? 1) >= 3;
  if (!eligible) return { state, accepted: false, reason: 'not-ready' };
  const correct = mastermindId === 'adrian-steward' && executorId === 'vera-mercenary';
  if (!correct) {
    const nextTrust = Math.max(0, (state.trustByCharacter[spokespersonId] ?? 1) - 1);
    return { state: normalizeStoryState({ ...state, trustByCharacter: { ...state.trustByCharacter, [spokespersonId]: nextTrust } }), accepted: false, reason: 'incorrect' };
  }
  const ending = {
    mastermindId, executorId, spokespersonId,
    completedRouteIds: completedRoutes.map((route) => route.id),
    completeness: completedRoutes.length === ROUTES.length ? 'complete' : 'partial',
    completedAt: Date.now(),
    epilogue: endingText(spokespersonId, completedRoutes.length === ROUTES.length ? 'complete' : 'partial'),
  };
  return { state: normalizeStoryState({ ...state, ending }), accepted: true, reason: 'correct' };
}

export function getStoryBoard(value) {
  const state = normalizeStoryState(value);
  const revealed = new Set(state.revealedClueIds);
  const routes = ROUTES.map((route) => {
    const completed = state.solvedDeductionIds.includes(route.id);
    const visibleClues = route.clueIds.filter((id) => revealed.has(id)).map((id) => publicClue(CLUE_BY_ID.get(id)));
    const availableCharacterIds = route.characterIds.filter((id) => routeHasAvailableClue(route, id, revealed));
    const missingClueCount = route.deductionClueIds.filter((id) => !revealed.has(id)).length;
    return { id: route.id, title: route.title, description: route.description, spokespersonId: route.spokespersonId, completed, visibleClues, availableCharacterIds, missingClueCount, deductionReady: missingClueCount === 0, progress: `${visibleClues.length}/${route.clueIds.length}` };
  });
  const completedRoutes = routes.filter((route) => route.completed);
  const witnessNeeded = completedRoutes.length >= 2 && !revealed.has('survivor-testimony');
  const witnessUnlocked = completedRoutes.length >= 2 && (state.trustByCharacter.friend12 ?? 1) >= 3;
  const eligibleSpokespersonIds = completedRoutes
    .map((route) => route.spokespersonId)
    .filter((id) => (state.trustByCharacter[id] ?? 1) >= 3);
  const accusationReady = !state.ending && witnessUnlocked && revealed.has('survivor-testimony') && eligibleSpokespersonIds.length > 0;
  const pinnedRoute = routes.find((route) => route.id === state.pinnedRouteId);
  const closingCharacterIds = !state.ending && revealed.has('survivor-testimony') && !eligibleSpokespersonIds.length
    ? completedRoutes.map((route) => route.spokespersonId)
    : [];
  const priorityCharacterIds = [...new Set([...(pinnedRoute?.availableCharacterIds || []), ...(witnessNeeded ? ['friend12'] : []), ...closingCharacterIds])];
  return {
    revision: state.revision,
    pinnedRouteId: state.pinnedRouteId,
    routes,
    revealedClues: state.revealedClueIds.map((id) => publicClue(CLUE_BY_ID.get(id))),
    trustByCharacter: { ...state.trustByCharacter },
    trustLabels: { ...Object.fromEntries(CHARACTER_IDS.map((id) => [id, TRUST_LABELS[state.trustByCharacter[id] ?? 1] || TRUST_LABELS[1]])) },
    completedRouteIds: completedRoutes.map((route) => route.id),
    witnessNeeded,
    witnessUnlocked,
    accusationReady,
    eligibleSpokespersonIds,
    priorityCharacterIds,
    accusationOptions: accusationReady ? ACCUSATION_OPTIONS : { mastermind: [], executor: [] },
    ending: state.ending,
  };
}

function clue(id, ownerId, title, summary, requires = [], minimumEncounters = 0, minimumTrust = 1) {
  return Object.freeze({ id, ownerId, title, summary, requires: Object.freeze(requires), minimumEncounters, minimumTrust });
}

function canReveal(item, revealed, encounterCount, trust, state) {
  if (item.id === 'survivor-testimony') return state.solvedDeductionIds.length >= 2 && trust >= 3;
  return Number(encounterCount) >= item.minimumEncounters && trust >= item.minimumTrust && item.requires.every((id) => revealed.has(id));
}

function routeForCharacter(characterId, pinnedRouteId) {
  const pinned = ROUTE_BY_ID.get(pinnedRouteId);
  if (pinned?.characterIds.includes(characterId)) return pinned;
  return ROUTES.find((route) => route.characterIds.includes(characterId));
}

function routeHasAvailableClue(route, characterId, revealed) {
  return CLUES.some((item) => item.ownerId === characterId && route.clueIds.includes(item.id) && !revealed.has(item.id) && item.requires.every((id) => revealed.has(id)));
}

function deductionIsComplete(routeId, revealed) {
  const route = ROUTE_BY_ID.get(routeId);
  return Boolean(route && route.deductionClueIds.every((id) => revealed.has(id)));
}

function cleanEnding(value, solvedDeductionIds, trustByCharacter) {
  if (!value || typeof value !== 'object') return null;
  if (value.mastermindId !== 'adrian-steward' || value.executorId !== 'vera-mercenary') return null;
  const completedRouteIds = uniqueIds(value.completedRouteIds).filter((id) => solvedDeductionIds.includes(id));
  const spokespersonRoute = ROUTES.find((route) => route.spokespersonId === value.spokespersonId && completedRouteIds.includes(route.id));
  if (!spokespersonRoute || completedRouteIds.length < 2) return null;
  if ((trustByCharacter[value.spokespersonId] ?? 1) < 3) return null;
  const completeness = completedRouteIds.length === ROUTES.length ? 'complete' : 'partial';
  return {
    mastermindId: String(value.mastermindId || ''), executorId: String(value.executorId || ''), spokespersonId: value.spokespersonId,
    completedRouteIds,
    completeness,
    completedAt: Number(value.completedAt) || Date.now(),
    epilogue: endingText(value.spokespersonId, completeness),
  };
}

function publicClue(item) { return { id: item.id, title: item.title, summary: item.summary, ownerId: item.ownerId }; }
function lines(items, empty) { return items.length ? items.map((item) => `- [${item.id}] ${item.summary}`).join('\n') : empty; }
function uniqueIds(value) { return [...new Set((Array.isArray(value) ? value : []).map((id) => String(id || '').trim()).filter(Boolean))]; }
function clampTrust(value) { return Math.min(3, Math.max(0, Math.round(Number(value) || 0))); }
function endingText(spokespersonId, completeness) { return ENDINGS[spokespersonId]?.[completeness] || ENDINGS.friend2[completeness]; }
