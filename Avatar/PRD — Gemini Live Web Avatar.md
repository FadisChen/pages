# PRD — Gemini Live Web Avatar

## 1. 專案概述

### 1.1 專案名稱

Gemini Live Web Avatar

### 1.2 專案目標

建立一個**純前端 Web Application**，整合 Google Gemini Live API 與 3D VRM Avatar，讓使用者可以直接透過瀏覽器與 AI 進行即時語音對話。

AI 回應時，Avatar 必須同步呈現：

- 嘴型動作
- 說話狀態
- 基本表情
- 眨眼
- 頭部微動
- 點頭
- 基本情緒動作

整個 Avatar 動畫系統必須在瀏覽器 Client 端執行，不依賴：

- 自建 Backend
- GPU Server
- Lip-sync API
- 第三方 TTS
- 第三方 Avatar API
- 雲端影片生成服務

核心原則：

> Gemini 負責「大腦與聲音」，瀏覽器負責「嘴型、表情與身體動畫」。

---

# 2. 產品目標

## 2.1 MVP

使用者開啟網頁後：

1. 載入 VRM Avatar
2. 使用者允許麥克風
3. 建立 Gemini Live API Session
4. 使用者說話
5. Gemini 即時產生語音
6. 瀏覽器播放 Gemini Audio
7. Audio 同時送入 Lip Sync Engine
8. Avatar 即時嘴型同步
9. Avatar 在說話期間播放自然的表情與微動作
10. 使用者可以隨時打斷 Gemini

---

## 2.2 第二階段

加入：

- 情緒表情
- 點頭
- 搖頭
- 眨眼
- Thinking 動畫
- Listening 動畫
- Speaking 動畫
- Idle 動畫
- 手勢動畫

---

## 2.3 非目標

第一階段不實作：

- AI 影片生成
- 真人照片 Avatar
- MuseTalk
- Wav2Lip
- 伺服器端 Lip Sync
- 伺服器端 TTS
- WebRTC Avatar Streaming
- AI 動作生成
- 人體姿態生成模型

原因：

這些技術會增加 GPU、延遲、成本與系統複雜度，不符合「純前端 Web」目標。

---

# 3. 技術架構

```text
┌─────────────────────────────────────────────┐
│                  Browser                    │
│                                             │
│  ┌──────────────┐                           │
│  │ Microphone   │                           │
│  └──────┬───────┘                           │
│         │ PCM 16kHz                          │
│         ▼                                    │
│  ┌─────────────────────┐                     │
│  │ Gemini Live API     │                     │
│  │ WebSocket           │                     │
│  └─────────┬───────────┘                     │
│            │                                 │
│            │ Gemini Audio 24kHz              │
│            ▼                                 │
│  ┌─────────────────────┐                     │
│  │ Audio Playback      │                     │
│  │ Web Audio API        │                     │
│  └─────────┬───────────┘                     │
│            │                                 │
│            ├───────────────┐                 │
│            │               │                 │
│            ▼               ▼                 │
│   ┌────────────────┐  ┌────────────────┐    │
│   │ Lip Sync       │  │ Audio Analyzer │    │
│   │ Engine         │  │                │    │
│   └───────┬────────┘  └───────┬────────┘    │
│           │                   │              │
│           ▼                   ▼              │
│     Mouth Viseme        Speaking State       │
│           │                   │              │
│           └──────────┬────────┘              │
│                      ▼                       │
│             ┌─────────────────┐              │
│             │ Avatar Controller│              │
│             └────────┬────────┘              │
│                      │                       │
│          ┌───────────┴────────────┐          │
│          ▼                        ▼          │
│    Facial Animation         Body Animation   │
│          │                        │          │
│          └────────────┬───────────┘          │
│                       ▼                      │
│             Three.js + VRM                   │
│                       │                      │
│                       ▼                      │
│                 WebGL Canvas                 │
└─────────────────────────────────────────────┘
```

---

# 4. 技術選型

## 4.1 Frontend

推薦：

```text
Vite
TypeScript
Three.js
@pixiv/three-vrm
Web Audio API
```

若需要 React：

```text
React
@react-three/fiber
@react-three/drei
@pixiv/three-vrm
```

但 MVP 不需要 React。

推薦先採：

```text
Vite + TypeScript + Three.js
```

降低框架複雜度。

---

# 5. Avatar 技術

## 5.1 Avatar 格式

採用：

**VRM**

原因：

- 適合動漫角色
- WebGL 可直接渲染
- 支援 Humanoid
- 支援 Facial Expressions
- 支援 BlendShape
- 支援 Spring Bone
- 有成熟 Three.js 生態系

官方 `@pixiv/three-vrm` 可以直接在 Three.js 中載入 VRM。

---

# 6. Lip Sync

## 6.1 MVP

採用：

```text
Gemini Audio
      ↓
Web Audio API
      ↓
MFCC / Audio Analysis
      ↓
Viseme
      ↓
VRM Expression
```

推薦優先評估：

```text
three-vrm-lip-sync
```

其設計就是：

```text
Audio Stream
      ↓
MFCC vowel classification
      ↓
aa
ih
ou
ee
oh
      ↓
VRM Expressions
```

而且可以直接接受：

- AudioBuffer
- MediaStream
- WebRTC stream
- TTS stream
- live audio stream

全部在瀏覽器執行。

---

# 7. Viseme Mapping

Avatar 必須至少支援：

```text
aa
ih
ou
ee
oh
```

映射：

```text
Audio
  │
  ├── AA ──→ mouth AA
  ├── IH ──→ mouth IH
  ├── OU ──→ mouth OU
  ├── EE ──→ mouth EE
  └── OH ──→ mouth OH
```

不同 VRM 模型的 Expression 命名可能不同，因此建立：

```typescript
interface AvatarExpressionMap {
    aa: string;
    ih: string;
    ou: string;
    ee: string;
    oh: string;
}
```

允許每個 Avatar 個別設定。

---

# 8. Audio Pipeline

Gemini Live API：

```text
Input:
PCM 16-bit
16kHz
Mono

Output:
PCM
24kHz
```

Google 官方文件目前明確說明 Live API 輸出音訊為 24 kHz，而輸入原生為 16 kHz。

因此：

```text
Gemini Audio
      ↓
PCM Decoder
      ↓
Float32Array
      ↓
AudioBuffer
      ↓
AudioContext
      ├── Speaker
      │
      └── LipSync Analyzer
```

重要：

**Lip Sync 不應重新錄製 Speaker。**

應直接分析 Gemini 回傳的原始 Audio。

這可以降低：

- 延遲
- 回音
- 麥克風污染
- Audio routing 複雜度

---

# 9. Audio 播放器

建立：

```typescript
class GeminiAudioPlayer {
    playChunk(audio: Float32Array): void;

    stop(): void;

    interrupt(): void;

    getAnalyser(): AnalyserNode;
}
```

Audio Graph：

```text
AudioBufferSourceNode
        │
        ▼
   GainNode
        │
        ├──────────► AudioContext.destination
        │
        ▼
   AnalyserNode
        │
        ▼
    Lip Sync
```

---

# 10. Avatar Animation State Machine

建立統一 Avatar State：

```typescript
type AvatarState =
    | "idle"
    | "listening"
    | "thinking"
    | "speaking"
    | "interrupted";
```

---

## 10.1 IDLE

動畫：

- 自然呼吸
- 身體輕微晃動
- 隨機眨眼
- 微小頭部移動

目的：

避免角色看起來像靜態模型。

---

## 10.2 LISTENING

使用者正在說話：

```text
LISTENING
```

動畫：

- 眼睛朝向 Camera
- 偶爾點頭
- 輕微頭部移動
- 嘴巴保持關閉

---

## 10.3 THINKING

Gemini 尚未開始輸出 Audio：

```text
THINKING
```

動畫：

- 頭部輕微偏移
- 視線移動
- 眨眼
- 輕微身體動作

不要使用過度誇張的動畫。

---

## 10.4 SPEAKING

Gemini Audio 開始播放：

```text
SPEAKING
```

同時：

```text
Lip Sync
+
Blink
+
Head Movement
+
Expression
```

---

## 10.5 INTERRUPTED

使用者打斷 Gemini：

```text
SPEAKING
     ↓
INTERRUPTED
     ↓
LISTENING
```

必須立即：

- 停止 Audio
- 嘴巴快速閉合
- 停止目前 Speaking animation
- 回到 Listening

---

# 11. 表情系統

建立：

```typescript
type Emotion =
    | "neutral"
    | "happy"
    | "sad"
    | "angry"
    | "surprised";
```

Avatar Controller：

```typescript
interface AvatarController {
    setEmotion(emotion: Emotion): void;

    setState(state: AvatarState): void;

    setViseme(viseme: Viseme, weight: number): void;

    playGesture(gesture: Gesture): void;
}
```

---

# 12. Gemini Emotion Integration

第一階段不要求 Gemini 每個 Audio chunk 都輸出 emotion。

改採：

```text
Gemini Response
      ↓
Emotion
      ↓
Avatar Controller
```

例如：

```json
{
  "emotion": "happy",
  "gesture": "nod"
}
```

然後：

```text
emotion = happy
       ↓
Smile expression
       +
Speaking lip sync
```

---

# 13. Gesture 系統

第一階段建立有限集合：

```typescript
type Gesture =
    | "none"
    | "nod"
    | "shake_head"
    | "wave"
    | "thinking"
    | "surprised";
```

不使用 AI 即時生成骨骼動畫。

採用預先設計 Animation Clip：

```text
gesture
   ↓
AnimationMixer
   ↓
VRM humanoid bones
```

這樣可以維持：

- 穩定 FPS
- 低 CPU
- 低延遲
- 可預期結果

---

# 14. Idle Animation

Idle 是整體品質非常重要的一環。

至少加入：

### 呼吸

```text
胸口 / Spine
      ↓
sin(time)
```

### 眨眼

```text
random timer
      ↓
blink
      ↓
ease-in
      ↓
ease-out
```

### 微小頭部移動

```text
head.rotation.x
head.rotation.y
```

使用 Perlin noise 或低頻 sine wave。

不要使用完全隨機的每 frame rotation。

---

# 15. Lip Sync 與 Animation Layer

必須將嘴型和其他動畫分離。

```text
Animation Layer

Layer 1
Idle Body

Layer 2
Gesture

Layer 3
Head / Eye

Layer 4
Emotion

Layer 5
Lip Sync
```

Lip Sync 只控制：

```text
mouth expressions
```

不得直接修改：

- Arm
- Leg
- Spine
- Head

如此可以避免 Lip Sync 與 Gesture 發生互相覆蓋。

目前 `three-vrm-lip-sync` 本身也是以只寫入五種 VRM viseme expression 的方式設計，並可在無聲時將嘴部控制權釋放回其他動畫。

---

# 16. Gemini Live API Integration

Web 端：

```text
Browser
   │
   ▼
Ephemeral Token
   │
   ▼
Gemini Live API
   │
   ▼
WebSocket
```

正式環境不應將永久 Gemini API Key 直接放在 JavaScript bundle。

Google 官方目前建議 client-to-server 架構使用 ephemeral tokens，以降低 API Key 暴露風險。

### 開發階段

可以使用：

```text
VITE_GEMINI_API_KEY
```

但僅限：

```text
localhost
```

或私人測試環境。

### Production

需要解決：

```text
Browser
   ↓
Token Provider
   ↓
Ephemeral Token
   ↓
Gemini Live
```

注意：

這裡的 Token Provider 是「身份驗證／臨時 token 發放」，不是 Avatar Backend。

---

# 17. 純前端限制

本專案定義：

> Avatar Rendering、Lip Sync、Animation 全部 Client-side。

允許：

```text
Browser
 ├─ Gemini Live
 ├─ Web Audio API
 ├─ Three.js
 ├─ VRM
 └─ Lip Sync
```

不允許：

```text
Browser
   ↓
Backend
   ↓
Lip Sync AI
```

---

# 18. UI

Desktop：

```text
┌───────────────────────────────────────┐
│ Gemini Live Avatar                    │
├───────────────────────────────────────┤
│                                       │
│              Avatar                   │
│                                       │
│                                       │
│                                       │
├───────────────────────────────────────┤
│                                       │
│  [ Mic ]  [ Stop ]  [ Settings ]     │
│                                       │
│  Status: Listening                    │
└───────────────────────────────────────┘
```

Mobile：

```text
┌──────────────────────┐
│                      │
│                      │
│       Avatar         │
│                      │
│                      │
│                      │
│                      │
├──────────────────────┤
│   ● Listening        │
│                      │
│       [ Mic ]        │
└──────────────────────┘
```

---

# 20. Performance Requirements

Desktop：

```text
Target FPS: 60
Minimum FPS: 30
```

Mobile：

```text
Target FPS: 60
Minimum acceptable: 30
```

Avatar：

```text
Triangles:
推薦 < 50,000

Textures:
優先壓縮

Bone:
避免過度複雜

Animation:
Client-side
```

---

# 21. Audio Latency

目標：

```text
Gemini Audio received
        ↓
< 50 ms
        ↓
Lip Sync update
```

Avatar 嘴型不能等待完整句子。

必須：

```text
Audio Chunk
    ↓
立即分析
    ↓
立即更新 Viseme
```

而不是：

```text
完整 Audio
    ↓
完整分析
    ↓
播放
```

---

# 22. Mobile Browser

必須支援：

- Chrome Android
- Safari iOS
- Chrome Desktop
- Edge Desktop

AudioContext 必須在 User Gesture 後啟動：

```text
User click
    ↓
AudioContext.resume()
    ↓
Gemini connection
    ↓
Audio playback
```

Lip-sync library 本身也要求在 mobile autoplay policy 下，從使用者操作後建立 AudioContext。

---

# 23. HTTPS Requirement

Production：

```text
HTTPS
```

Development：

```text
localhost
```

原因：

- Microphone
- AudioWorklet
- Web APIs

需要 Secure Context。

`three-vrm-lip-sync` 也明確要求 AudioWorklet / microphone 使用 localhost 或 HTTPS。

---

# 24. 專案結構

```text
src/
│
├── main.ts
│
├── gemini/
│   ├── GeminiLiveClient.ts
│   ├── GeminiAudioReceiver.ts
│   └── GeminiSession.ts
│
├── audio/
│   ├── AudioPlayer.ts
│   ├── AudioAnalyzer.ts
│   └── LipSync.ts
│
├── avatar/
│   ├── AvatarLoader.ts
│   ├── AvatarController.ts
│   ├── AvatarExpression.ts
│   ├── AvatarGesture.ts
│   ├── AvatarStateMachine.ts
│   └── AvatarConfig.ts
│
├── animation/
│   ├── IdleAnimation.ts
│   ├── BlinkAnimation.ts
│   ├── HeadAnimation.ts
│   └── GestureAnimation.ts
│
├── ui/
│   ├── ControlPanel.ts
│   └── StatusPanel.ts
│
└── config/
    └── avatar.json
```

---

# 25. Avatar Configuration

```json
{
  "model": "/avatars/default.vrm",

  "expressions": {
    "aa": "aa",
    "ih": "ih",
    "ou": "ou",
    "ee": "ee",
    "oh": "oh",

    "happy": "happy",
    "sad": "sad",
    "angry": "angry",
    "surprised": "surprised"
  },

  "animation": {
    "idle": true,
    "blink": true,
    "breathing": true,
    "headMovement": true
  }
}
```

如此未來替換 VRM 模型時，不需要修改核心程式。

---

# 26. MVP Acceptance Criteria

## Avatar

- [ ] VRM 可以成功載入
- [ ] Avatar 可以正常渲染
- [ ] Camera framing 正確
- [ ] Idle animation 正常
- [ ] 眨眼正常

## Gemini

- [ ] 可以建立 Gemini Live Session
- [ ] 麥克風可以輸入
- [ ] Gemini 可以回應
- [ ] Audio 可以播放
- [ ] 可以 interrupt

## Lip Sync

- [ ] Gemini 說話時嘴巴會動
- [ ] Gemini 停止說話後嘴巴會關閉
- [ ] 嘴型與音訊延遲小於 100ms
- [ ] 不需要 server
- [ ] 不需要額外 AI API

## Animation

- [ ] Speaking state
- [ ] Listening state
- [ ] Thinking state
- [ ] Idle state
- [ ] Emotion
- [ ] Gesture

## Performance

- [ ] Desktop ≥ 30 FPS
- [ ] Mobile ≥ 30 FPS
- [ ] Lip Sync 不造成明顯卡頓
- [ ] Gemini Audio 不因 Avatar rendering 發生 drop

---

# 27. 開發階段

## Phase 1 — VRM

```text
Three.js
   ↓
@pixiv/three-vrm
   ↓
載入 VRM
   ↓
Camera
   ↓
Lighting
```

---

## Phase 2 — Gemini Live

```text
Microphone
   ↓
Gemini Live
   ↓
Audio
   ↓
Browser Speaker
```

---

## Phase 3 — Audio Pipeline

```text
Gemini Audio
   ↓
AudioContext
   ↓
Analyser
   ↓
LipSync
```

---

## Phase 4 — Lip Sync

```text
Audio
 ↓
MFCC
 ↓
Viseme
 ↓
VRM Expression
```

---

## Phase 5 — Animation

加入：

```text
Idle
Blink
Breathing
Head Movement
```

---

## Phase 6 — State Machine

```text
IDLE
LISTENING
THINKING
SPEAKING
INTERRUPTED
```

---

## Phase 7 — Emotion

加入：

```text
neutral
happy
sad
angry
surprised
```

---

## Phase 8 — Gesture

加入：

```text
nod
shake_head
wave
thinking
surprised
```

---

# 28. 第一版技術決策

## 最終選型

```text
Language:
TypeScript

Build:
Vite

3D:
Three.js

Avatar:
VRM

VRM Runtime:
@pixiv/three-vrm

Lip Sync:
three-vrm-lip-sync

Audio:
Web Audio API

AI:
Gemini Live API

Communication:
WebSocket

Backend:
無

Database:
無

GPU:
無

TTS:
Gemini Live Audio

STT:
Gemini Live

Animation:
Three.js AnimationMixer + procedural animation
```

---

# 29. 核心設計原則

### 原則 1

Gemini 不負責 Avatar Rendering。

```text
Gemini = Brain
```

---

### 原則 2

Audio 才是 Lip Sync 的主要資料來源。

```text
Audio
 ↓
Viseme
 ↓
Mouth
```

不要讓 Gemini 為每一個音節產生 animation JSON。

---

### 原則 3

Animation 必須 Client-side。

```text
No GPU Server
No Video Generation
```

---

### 原則 4

Emotion 與 Gesture 低頻更新。

```text
Lip Sync:
60 FPS

Emotion:
每個 response

Gesture:
每個 response / state change
```

不要讓 Gemini 每 16ms 傳一次動畫指令。

---

### 原則 5

Avatar Engine 與 Gemini Engine 完全解耦。

```text
GeminiLiveClient
       │
       ▼
AvatarEvent
       │
       ▼
AvatarController
```

未來可以把 Gemini 換成：

```text
OpenAI
Claude
Local LLM
其他 Voice AI
```

Avatar 系統仍然可以使用。

---

# 30. 未來擴充

架構完成後可以進一步加入：

```text
Voice
  ↓
Gemini Live
  ↓
Emotion
  ↓
Avatar
```

以及：

```text
User Camera
     ↓
Face Tracking
     ↓
User Emotion
     ↓
Avatar Response
```

甚至：

```text
User
 ↓
Voice + Camera
 ↓
Gemini Live
 ↓
AI Emotion
 ↓
Avatar Emotion
 ↓
Avatar Gesture
```

最終形成完整的：

> **Browser-based AI Character Runtime**

而不是單純的 Gemini Chat UI。
