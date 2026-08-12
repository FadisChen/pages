const STORY_REVISION = 1;

const WORLD_CANON = Object.freeze({
  premise: '灰燼商隊在「燼雨之夜」失蹤；這不是單純事故，而是一場利用偽造訂單、改道與內應完成的劫貨。',
  contaminant: '貨物被混入會麻痺嗅覺並干擾記憶的「記憶灰」，原料來自遭挪用的鍊金研究。',
  route: '商隊被刻意引向已從現行地圖刪除的舊驛站，誘餌車則把目擊者帶離真正路線。',
  culprit: '艾德里安家族的掌印管事盜用印章與帳目，勾結薇拉舊傭兵團中的人執行伏擊。',
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
});

const CLUES = Object.freeze([
  clue('last-letter', 'friend1', '最後一封信', '最後一封信的收件地被改成現行地圖上不存在的舊驛站，刮痕下仍看得到原本的港口地址。'),
  clue('withdrawal-order', 'friend2', '可疑撤隊令', '凱恩收到的撤隊令比正式軍令早一個時辰，封蠟是真的，但口令格式出自商隊內部而非護衛系統。', ['last-letter']),
  clue('ash-mark-reagent', 'friend3', '灰燼徽記', '灰燼徽記不是商標，而是封存記憶灰的鍊金警示；瑟琳家族的研究配方曾被人抄走一頁。'),
  clue('stolen-ledger', 'friend4', '失竊帳本', '帳本記載一筆不存在的追加訂單，付款被拆成數筆，流向北境酒商家族與一個舊傭兵團的中間人。'),
  clue('inside-locks', 'friend5', '內部改造的鎖', '事故後找到的鎖先由正確鑰匙從內部開啟，再被刻意敲壞成遭外力破壞的模樣，證明車隊有內應。'),
  clue('root-memory', 'friend6', '根系記憶', '舊驛站方向的植物根系殘留強烈記憶灰反應，污染痕跡並未通往官方公布的失蹤地點。', ['numbing-gray-powder']),
  clue('military-hand-sign', 'friend7', '軍用手勢', '伏擊前的手勢屬於薇拉舊傭兵團的夜間換防暗號，當晚有人借此讓誘餌車誤以為前路安全。', ['withdrawal-order']),
  clue('wrong-tide-seal', 'friend8', '錯誤潮汐封印', '廢棄碼頭的灰蠟封印刻著不可能通航的潮汐日期，證明公開航程是事後偽造的掩護。'),
  clue('numbing-gray-powder', 'friend9', '麻痺嗅覺的灰粉', '酒桶殘留的灰粉會先麻痺嗅覺再干擾短期記憶，成分與瑟琳所查的記憶灰一致。'),
  clue('old-relay-star-map', 'friend10', '夢中的舊驛站', '夢中星圖、最後一封信與偽造潮汐日期共同指向北岸舊驛站；那裡在十年前就從官方地圖刪除。', ['last-letter', 'wrong-tide-seal']),
  clue('forged-additional-order', 'friend11', '偽造追加訂單', '追加訂單使用艾德里安的真印章，卻由家族掌印管事經手；其分拆款項與洛恩帳本中的傭兵付款相符。', ['stolen-ledger', 'wrong-tide-seal']),
  clue('survivor-testimony', 'friend12', '倖存者證詞', '倖存者在舊驛站看見北境酒商家族的掌印管事與舊傭兵團接頭，並聽見他們計畫把記憶灰偽裝成酒貨運走。', ['ash-mark-reagent', 'inside-locks', 'root-memory', 'military-hand-sign', 'old-relay-star-map', 'forged-additional-order']),
]);

const CLUE_BY_ID = new Map(CLUES.map((item) => [item.id, item]));
const CHARACTER_IDS = new Set(Object.keys(CHARACTERS));

export function normalizeStoryState(value) {
  const revealedClueIds = uniqueIds(value?.revealedClueIds).filter((id) => CLUE_BY_ID.has(id));
  const revealed = new Set(revealedClueIds);
  const disclosedCluesByCharacter = {};
  for (const characterId of CHARACTER_IDS) {
    const ids = uniqueIds(value?.disclosedCluesByCharacter?.[characterId])
      .filter((id) => revealed.has(id) && CLUE_BY_ID.get(id)?.ownerId !== characterId);
    if (ids.length) disclosedCluesByCharacter[characterId] = ids;
  }
  return { revision: STORY_REVISION, revealedClueIds, disclosedCluesByCharacter };
}

export function prepareStoryConversation(characterId, value, encounterCount = 0) {
  const state = normalizeStoryState(value);
  const character = CHARACTERS[characterId] || { perspective: '你只知道灰燼商隊失蹤案的公開傳聞。' };
  const revealed = new Set(state.revealedClueIds);
  const owned = CLUES.filter((item) => item.ownerId === characterId);
  const revealableClues = owned.filter((item) => !revealed.has(item.id) && canReveal(item, revealed, encounterCount));
  const rememberedClues = owned.filter((item) => revealed.has(item.id));
  const withheldClues = owned.filter((item) => !revealed.has(item.id) && !canReveal(item, revealed, encounterCount));
  const disclosed = (state.disclosedCluesByCharacter[characterId] || []).map((id) => CLUE_BY_ID.get(id));
  const playerKnownClues = state.revealedClueIds.map((id) => CLUE_BY_ID.get(id));

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

### 本次可透露
${lines(revealableClues, '目前沒有新的關鍵線索可透露；可以自然交談或重述已知內容。')}

### 先前已透露
${lines(rememberedClues, '目前沒有。')}

### 你仍在保留的主題
${withheldClues.length ? withheldClues.map((item) => `- ${item.title}的細節；前置證據不足，不可補完內容。`).join('\n') : '目前沒有。'}

### 酒保已明確告知你
${lines(disclosed, '目前沒有；不要假設酒保曾分享其他角色的發現。')}`;

  return {
    instruction,
    revealableClues: revealableClues.map(publicClue),
    playerKnownClues: playerKnownClues.map(publicClue),
  };
}

export function advanceStory(characterId, value, candidates, encounterCount = 0) {
  const state = normalizeStoryState(value);
  const revealedBefore = new Set(state.revealedClueIds);
  const revealable = new Set(CLUES
    .filter((item) => item.ownerId === characterId && !revealedBefore.has(item.id) && canReveal(item, revealedBefore, encounterCount))
    .map((item) => item.id));
  const acceptedRevealed = uniqueIds(candidates?.revealedClueIds).filter((id) => revealable.has(id));
  const acceptedDisclosed = uniqueIds(candidates?.disclosedClueIds).filter((id) => {
    const clueItem = CLUE_BY_ID.get(id);
    const already = state.disclosedCluesByCharacter[characterId] || [];
    return clueItem && clueItem.ownerId !== characterId && revealedBefore.has(id) && !already.includes(id);
  });

  const disclosedCluesByCharacter = { ...state.disclosedCluesByCharacter };
  if (acceptedDisclosed.length) {
    disclosedCluesByCharacter[characterId] = [
      ...(disclosedCluesByCharacter[characterId] || []),
      ...acceptedDisclosed,
    ];
  }
  const nextState = normalizeStoryState({
    revealedClueIds: [...state.revealedClueIds, ...acceptedRevealed],
    disclosedCluesByCharacter,
  });

  return {
    state: nextState,
    accepted: { revealedClueIds: acceptedRevealed, disclosedClueIds: acceptedDisclosed },
  };
}

function clue(id, ownerId, title, summary, requires = [], minimumEncounters = 0) {
  return Object.freeze({ id, ownerId, title, summary, requires: Object.freeze(requires), minimumEncounters });
}

function canReveal(item, revealed, encounterCount) {
  return Number(encounterCount) >= item.minimumEncounters && item.requires.every((id) => revealed.has(id));
}

function uniqueIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((id) => String(id || '').trim()).filter(Boolean))];
}

function publicClue(item) { return { id: item.id, summary: item.summary }; }
function lines(items, empty) { return items.length ? items.map((item) => `- [${item.id}] ${item.summary}`).join('\n') : empty; }
