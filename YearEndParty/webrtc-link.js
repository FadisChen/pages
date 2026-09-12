// 共用模組：stage.js（投影端筆電）與 operator.js（手機遙控端）都會匯入這份檔案，
// 確保雙方對「配對方式」與「訊息格式」的理解一致，不會各自漂移。
//
// 為什麼需要這個檔案：投影端筆電跟操作手機是兩台不同裝置，純前端網頁沒有辦法讓
// 兩台不同瀏覽器的裝置直接互相發現、對話——需要一個「牽線」機制。這裡用 WebRTC
// （透過 PeerJS 套件簡化 API），PeerJS 的免費公用雲端 broker 只負責「配對／交換連線
// 資訊」這件事本身，一旦兩台裝置的 P2P 連線建立起來，麥克風音訊與控制指令就直接在
// 兩台裝置之間傳送（有自行配置 TURN 時才可中繼），完全不會流經任何
// 我們自己架設的伺服器。
//
// 已知風險：若會場 Wi-Fi 對同網段裝置做「用戶隔離」（很多飯店/場地會這樣設定），
// 純 STUN 可能打不通，需要 TURN 中繼才能連上；PeerJS 雲端預設不保證提供穩定的免費
// TURN。若正式上場前測試發現連不上，需要自備 TURN 服務（例如 Twilio Network
// Traversal Service、metered.ca 等），把憑證加進下面的 ICE_SERVERS 陣列。

const ROOM_PREFIX = "yep-";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // 若會場網路需要 TURN 才能打通，在這裡加入：
  // { urls: "turn:your-turn-host:3478", username: "...", credential: "..." },
];

// 尾牙 Rundown：環節由工作人員手動切換，Nami 不會自己換環節。
// operator.js 只需要 id/label 畫按鈕；context 是切換時要餵給 Gemini 的場控文字，
// 只有 stage.js 會用到，但放在同一份共用清單裡，確保雙邊顯示的環節名稱不會兜不起來。
const SEGMENTS = Object.freeze([
  { id: "opening", label: "開場", context: "[環節切換] 現在進入「開場」。請歡迎大家、簡短介紹今天主持人與活動亮點，帶動期待感。" },
  { id: "vp_speech", label: "副總致詞", context: "[環節切換] 現在進入「副總致詞」。請用熱情但得體的語氣，邀請 James 副總上台致詞，簡短歡迎即可，致詞內容交給他本人，不要代為發言。" },
  { id: "manager_speech", label: "部門主管致詞", context: "[環節切換] 現在進入「部門主管致詞」。請邀請 Jerry 處長上台致詞，語氣保持熱情尊重，簡短歡迎即可，致詞內容交給他本人，不要代為發言。" },
  { id: "meal", label: "用餐", context: "[環節切換] 現在進入「用餐」。請提醒大家開動享用美食，並提一下待會後段還有金色三麥最具特色的啤酒可以享用，帶動期待感。" },
  { id: "game", label: "小遊戲", context: "[環節切換] 現在進入「小遊戲：123木頭人」。請邀請大家拿出手機掃描 QRCode 加入遊戲，並提醒大家仔細聆聽遊戲規則，說明前三名抵達終點的人會有獎賞。" },
  { id: "outstanding_employee", label: "部門優良員工", context: "[環節切換] 現在進入「部門優良員工」表揚。請用真誠的語氣帶出這個環節的意義；得獎名單會由工作人員另外用文字告訴你，收到後再逐一唸名字恭喜對方。" },
  { id: "lucky_draw", label: "抽獎", context: "[環節切換] 現在進入「抽獎」。請營造懸念、公布獎項亮點；得獎名單會由工作人員另外用文字告訴你，收到後再唸名字恭喜對方。" },
  { id: "closing", label: "尾聲", context: "[環節切換] 現在進入「尾聲」。請感謝大家參與、溫馨收尾，預告活動即將結束。" },
]);

// operator → stage 的訊息（走 PeerJS DataConnection）：
//   { type: "ptt", active: true|false }        AudioWorklet 產生的發話起訖
//   { type: "audio", bytes: Uint8Array }      16 kHz mono PCM16 LE，每包最多 640 bytes
//   { type: "segment", id: "lucky_draw" }       切換 Rundown 環節
//   { type: "note", text: "..." }               現場備註／文字訊息
//
// stage → operator 的訊息：
//   { type: "status", state: "idle"|"listening"|"thinking"|"speaking"|"interrupted" }
//   { type: "connection", status: "connected"|"connecting"|"reconnecting"|"failed"|"offline" }
//   { type: "transcript", role: "user"|"model", text: "..." }
//   { type: "turn-complete" }                 清除本輪逐字稿合併狀態
//   { type: "segment-ack", id: "lucky_draw" }   確認環節已套用
// 音訊與起訖必須使用同一條 reliable:true DataConnection，最後一包 PCM 先於 active:false。
// 不再建立 MediaConnection，也不在投影端重新擷取/取樣遠端 MediaStream。

function randomRoomCode() {
  const random = Math.random().toString(36).slice(2, 8);
  return `${ROOM_PREFIX}${random}`;
}

function createPeer(id) {
  if (typeof Peer === "undefined") throw new Error("PeerJS 尚未載入，請確認 index.html 有引入 peerjs script。");
  // eslint-disable-next-line no-undef
  return new Peer(id, { config: { iceServers: ICE_SERVERS }, debug: 1 });
}

export { ROOM_PREFIX, ICE_SERVERS, SEGMENTS, randomRoomCode, createPeer };
