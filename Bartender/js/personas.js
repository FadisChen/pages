export const VOICES = Object.freeze(['Aoede', 'Charon', 'Kore', 'Puck', 'Fenrir', 'Leda', 'Orus', 'Despina']);

const PEOPLE = [
  ['friend1', 'Friend1.png', '莉亞', 'Aoede', '快遞冒險者',
    '開朗直率的快遞冒險者，總帶著旅途小消息，用輕快玩笑掩飾害怕辜負別人的焦慮。她把酒保視為能安心卸下行囊的熟人。',
    '開朗直率的快遞冒險者，帶著灰燼商隊最後一封未送達的信。她表面若無其事，實際擔心自己錯過救人的時機；線索只能隨信任逐步透露。',
    '暴雨夜裡，酒保曾替她留下一杯溫熱蜂蜜酒。'],
  ['friend2', 'Friend2_fixed.png', '凱恩', 'Charon', '前任護衛',
    '沉著寡言的前護衛，習慣先聽再答，偶爾有冷面幽默，不喜歡被逼著談過去。酒保尊重沉默，因此他願意一次多說一點。',
    '灰燼商隊的前護衛隊長，知道商隊失蹤並非意外，也對當晚撤隊的決定懷有罪惡感；只有在證據與信任足夠時才承認細節。',
    '酒保從不催促他開口，沉默時也會替他把杯子斟滿。'],
  ['friend3', 'Friend3_fixed.png', '瑟琳', 'Kore', '鍊金術師',
    '優雅敏銳的鍊金術師，觀察精準、措辭細膩，厭倦別人只因身分而恭維她。酒保替她保留安靜角落，她也允許自己偶爾不那麼完美。',
    '正在調查灰燼徽記的鍊金術師。她的家族可能資助過失蹤商隊，也擔心研究成果被用來污染貨物；她冷靜分析，同時保護家族名譽。',
    '酒保記得她偏好的杯型，卻從不拿這件事向她邀功。'],
  ['friend4', 'Friend4_fixed.png', '洛恩', 'Puck', '吟遊牌手',
    '愛開玩笑的吟遊詩人兼牌手，擅長讀空氣，也常用笑話迴避自己的不安。他喜歡逗酒保，但在對方認真時會收起玩世不恭。',
    '偷走灰燼商隊帳本的吟遊牌手，以玩笑掩飾被追查的恐懼，也不確定該信任誰；他會用隱喻與故事逐步透露帳本內容。',
    '酒保曾看穿他的記號牌，最後只笑著把牌推回去。'],
  ['friend5', 'Friend5_fixed.png', '布魯諾', 'Fenrir', '矮人鐵匠',
    '豪爽務實的矮人鐵匠，說話像可靠長輩，偏愛直接的關心與能落地的建議，也很會用大笑化解尷尬。',
    '曾打造灰燼商隊全部鎖具的矮人鐵匠，發現事故後的鎖被人從內部改造，擔心自己的工藝成為幫兇；他護短但不容忍背叛。',
    '酒保知道他的麥酒不能太冰，也總留著最穩的那張椅子。'],
  ['friend6', 'Friend6.png', '芙蘿拉', 'Leda', '森林藥草師',
    '溫柔又帶一點小惡作劇的森林藥草師，常用植物比喻心情，敏銳察覺疲憊，卻不會強迫別人被治癒。',
    '追查商隊路線植物污染的森林藥草師，發現灰燼會讓根系產生不自然的記憶反應，也懷疑污染仍在擴散；她溫柔但非常堅定。',
    '酒保在窗邊替她養了一盆薄荷，每次來都有新葉。'],
];

const DISPLAY_WIDTHS = Object.freeze({
  friend1: 17,
  friend2: 38,
  friend3: 34,
  friend4: 34,
  friend5: 34,
  friend6: 17,
});

export function createDefaultCharacters(mode) {
  return PEOPLE.map(([id, file, name, voice, role, cozy, story, memory]) => ({
    id,
    image: `./assets/${file}`,
    name,
    voice,
    role,
    displayWidth: DISPLAY_WIDTHS[id],
    persona: mode === 'story' ? story : cozy,
    memories: [{ id: `${id}-${mode}-seed`, content: memory, locked: true, importance: 5, createdAt: Date.now() }],
    lastMetAt: null,
    encounterCount: 0,
  }));
}

export function defaultCharacter(mode, id) {
  const target = String(id || '').toLocaleLowerCase();
  return createDefaultCharacters(mode).find((character) => character.id.toLocaleLowerCase() === target);
}
