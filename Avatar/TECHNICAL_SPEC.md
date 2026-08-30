# TECHNICAL_SPEC.md

# Gemini Live Web Avatar — Technical Specification

## 1. 文件目的

本文件定義 `Gemini Live Web Avatar` 的實作技術規格。

目標是建立一個：

- 純前端 Web Application
- TypeScript
- Vite
- Three.js
- VRM
- Gemini Live API
- Web Audio API
- Client-side Lip Sync
- Client-side Avatar Animation

的即時 AI Avatar 系統。

---

# 2. Architecture

```text
┌──────────────────────────────────────────────────────┐
│                     Browser                          │
│                                                      │
│  ┌───────────────┐                                   │
│  │ Microphone    │                                   │
│  └───────┬───────┘                                   │
│          │                                            │
│          ▼                                            │
│  ┌──────────────────────┐                             │
│  │ GeminiLiveClient     │                             │
│  │ WebSocket            │                             │
│  └──────────┬───────────┘                             │
│             │                                         │
│             │ Gemini Audio                            │
│             ▼                                         │
│  ┌──────────────────────┐                             │
│  │ GeminiAudioPlayer    │                             │
│  │ Web Audio API        │                             │
│  └──────────┬───────────┘                             │
│             │                                         │
│       ┌─────┴──────────────┐                          │
│       │                    │                          │
│       ▼                    ▼                          │
│  ┌────────────┐     ┌───────────────┐                │
│  │ LipSync    │     │ Audio State   │                │
│  │ Engine     │     │ Analyzer      │                │
│  └─────┬──────┘     └───────┬───────┘                │
│        │                     │                        │
│        └──────────┬──────────┘                        │
│                   ▼                                   │
│        ┌─────────────────────┐                        │
│        │ AvatarController    │                        │
│        └──────────┬──────────┘                        │
│                   │                                   │
│          ┌────────┴─────────┐                         │
│          ▼                  ▼                         │
│    Facial Animation    Body Animation                 │
│          │                  │                         │
│          └────────┬─────────┘                         │
│                   ▼                                   │
│          Three.js Renderer                            │
│                   │                                   │
│                   ▼                                   │
│                 VRM                                   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

# 3. Technology Stack

## 3.1 Required

```text
Node.js
Vite
TypeScript
Three.js
@pixiv/three-vrm
```

Gemini：

```text
@google/genai
```

Lip Sync：

```text
three-vrm-lip-sync
```

---

# 4. Package Installation

```bash
npm install three
npm install @pixiv/three-vrm
npm install @google/genai
npm install three-vrm-lip-sync
```

Development:

```bash
npm install -D vite
npm install -D typescript
```

---

# 5. Browser Requirements

最低：

- Chrome 120+
- Edge 120+
- Safari 17+
- Android Chrome
- iOS Safari

Required browser capabilities：

```text
WebGL
Web Audio API
AudioContext
MediaDevices.getUserMedia()
WebSocket
ES2022
```

Production 必須：

```text
HTTPS
```

Development 可使用：

```text
localhost
```

---

# 6. Project Structure

```text
src/
│
├── main.ts
│
├── app/
│   ├── App.ts
│   └── AppState.ts
│
├── gemini/
│   ├── GeminiLiveClient.ts
│   ├── GeminiSession.ts
│   ├── GeminiMessage.ts
│   └── GeminiConfig.ts
│
├── audio/
│   ├── AudioContextManager.ts
│   ├── GeminiAudioPlayer.ts
│   ├── AudioAnalyzer.ts
│   └── LipSyncEngine.ts
│
├── avatar/
│   ├── AvatarLoader.ts
│   ├── AvatarController.ts
│   ├── AvatarExpression.ts
│   ├── AvatarConfig.ts
│   ├── AvatarStateMachine.ts
│   └── AvatarEvents.ts
│
├── animation/
│   ├── IdleAnimation.ts
│   ├── BlinkAnimation.ts
│   ├── BreathingAnimation.ts
│   ├── HeadAnimation.ts
│   └── GestureAnimation.ts
│
├── renderer/
│   ├── SceneManager.ts
│   ├── CameraManager.ts
│   └── Lighting.ts
│
├── types/
│   ├── AvatarTypes.ts
│   ├── AudioTypes.ts
│   └── GeminiTypes.ts
│
└── config/
    └── avatar.json

public/
│
└── avatars/
    └── default.vrm
```

---

# 7. Core Data Types

## 7.1 Avatar State

```typescript
export enum AvatarState {
    Idle = "idle",
    Listening = "listening",
    Thinking = "thinking",
    Speaking = "speaking",
    Interrupted = "interrupted"
}
```

---

# 8. Emotion

```typescript
export enum Emotion {
    Neutral = "neutral",
    Happy = "happy",
    Sad = "sad",
    Angry = "angry",
    Surprised = "surprised"
}
```

---

# 9. Gesture

```typescript
export enum Gesture {
    None = "none",
    Nod = "nod",
    ShakeHead = "shake_head",
    Wave = "wave",
    Thinking = "thinking",
    Surprised = "surprised"
}
```

---

# 10. Viseme

MVP 採用五種主要 vowel-based viseme：

```typescript
export enum Viseme {
    None = "none",
    AA = "aa",
    IH = "ih",
    OU = "ou",
    EE = "ee",
    OH = "oh"
}
```

---

# 11. AvatarController

核心介面：

```typescript
export interface AvatarController {
    setState(state: AvatarState): void;

    setEmotion(emotion: Emotion): void;

    setViseme(
        viseme: Viseme,
        weight: number
    ): void;

    playGesture(
        gesture: Gesture
    ): void;

    update(
        deltaTime: number
    ): void;

    reset(): void;

    dispose(): void;
}
```

---

# 12. Avatar Event

Gemini 與 Avatar 不應直接互相依賴。

使用事件：

```typescript
export type AvatarEvent =
    | {
        type: "state";
        state: AvatarState;
    }
    | {
        type: "emotion";
        emotion: Emotion;
    }
    | {
        type: "gesture";
        gesture: Gesture;
    }
    | {
        type: "viseme";
        viseme: Viseme;
        weight: number;
    };
```

---

# 13. Gemini Live Client

建立：

```typescript
export interface GeminiLiveClient {
    connect(): Promise<void>;

    disconnect(): void;

    sendAudio(
        pcm: ArrayBuffer
    ): void;

    interrupt(): void;

    isConnected(): boolean;
}
```

---

# 14. Gemini Session

Gemini Session 必須負責：

```text
Connection
Audio Input
Audio Output
Interruption
Session State
Error Handling
```

不要讓 Gemini Session 直接操作 Avatar。

錯誤：

```text
GeminiLiveClient
      ↓
AvatarController
```

正確：

```text
GeminiLiveClient
      ↓
Application Event Bus
      ↓
AvatarController
```

---

# 15. Gemini Event

```typescript
export type GeminiEvent =
    | {
        type: "connected";
    }
    | {
        type: "disconnected";
    }
    | {
        type: "audio";
        data: Int16Array;
        sampleRate: number;
    }
    | {
        type: "turn-start";
    }
    | {
        type: "turn-end";
    }
    | {
        type: "interrupted";
    }
    | {
        type: "error";
        error: Error;
    };
```

---

# 16. Gemini Audio Pipeline

Gemini Audio：

```text
PCM
 ↓
Int16
 ↓
Float32
 ↓
AudioBuffer
 ↓
AudioBufferSourceNode
 ↓
GainNode
 ↓
AnalyserNode
 ↓
AudioContext.destination
```

---

# 17. PCM Conversion

Gemini 回傳 PCM Int16：

```typescript
function int16ToFloat32(
    input: Int16Array
): Float32Array {

    const output =
        new Float32Array(input.length);

    for (let i = 0; i < input.length; i++) {
        output[i] =
            Math.max(
                -1,
                input[i] / 32768
            );
    }

    return output;
}
```

---

# 18. AudioContextManager

```typescript
export interface AudioContextManager {
    initialize(): Promise<void>;

    resume(): Promise<void>;

    suspend(): Promise<void>;

    getContext(): AudioContext;

    getSampleRate(): number;
}
```

AudioContext 必須在 User Gesture 後啟動。

例如：

```typescript
button.addEventListener(
    "click",
    async () => {

        await audioContextManager.initialize();

        await audioContextManager.resume();

        await gemini.connect();
    }
);
```

---

# 19. GeminiAudioPlayer

```typescript
export interface GeminiAudioPlayer {

    enqueue(
        pcm: Int16Array,
        sampleRate: number
    ): void;

    stop(): void;

    interrupt(): void;

    isPlaying(): boolean;

    getAnalyser(): AnalyserNode;
}
```

---

# 20. Audio Scheduling

禁止：

```text
每收到 chunk
→ 立即 play()
```

因為可能產生：

```text
gap
click
audio overlap
```

應採用 Audio Scheduler：

```text
Gemini Chunk
      ↓
AudioBuffer
      ↓
scheduledStartTime
      ↓
AudioBufferSourceNode.start()
```

概念：

```typescript
let nextStartTime = 0;

function enqueue(buffer: AudioBuffer) {

    const now =
        audioContext.currentTime;

    if (nextStartTime < now) {
        nextStartTime = now;
    }

    const source =
        audioContext.createBufferSource();

    source.buffer = buffer;

    source.connect(audioOutput);

    source.start(nextStartTime);

    nextStartTime += buffer.duration;
}
```

---

# 21. Lip Sync Architecture

```text
Gemini Audio
     │
     ▼
AudioBuffer
     │
     ▼
LipSyncEngine
     │
     ├── RMS
     ├── MFCC
     └── Vowel classification
             │
             ▼
          Viseme
             │
             ▼
       AvatarController
```

---

# 22. LipSyncEngine

```typescript
export interface LipSyncEngine {

    start(
        analyser: AnalyserNode
    ): void;

    stop(): void;

    update(
        deltaTime: number
    ): void;

    getCurrentViseme(): Viseme;

    getCurrentWeight(): number;
}
```

---

# 23. Lip Sync Update Frequency

Avatar rendering：

```text
requestAnimationFrame
```

目標：

```text
60 FPS
```

Lip Sync 可以每 frame 更新：

```typescript
function update(deltaTime: number) {

    lipSync.update(deltaTime);

    avatar.update(deltaTime);

    renderer.render();
}
```

---

# 24. Lip Sync Smoothing

禁止直接：

```typescript
mouth.weight = rawWeight;
```

使用 smoothing：

```typescript
current +=
    (target - current)
    * smoothing;
```

推薦：

```text
attack:
快速

release:
稍慢
```

例如：

```typescript
const attack = 0.35;
const release = 0.18;

const factor =
    target > current
        ? attack
        : release;

current +=
    (target - current)
    * factor;
```

目的是避免：

```text
嘴巴抖動
```

---

# 25. Silence Detection

設定：

```text
silenceThreshold
```

如果：

```text
RMS < threshold
```

則：

```text
Viseme = None
```

並將 mouth weight 平滑下降。

---

# 26. VRM Loader

使用：

```typescript
GLTFLoader
VRMLoaderPlugin
```

概念：

```typescript
const loader =
    new GLTFLoader();

loader.register(
    parser =>
        new VRMLoaderPlugin(parser)
);

const gltf =
    await loader.loadAsync(
        "/avatars/default.vrm"
    );

const vrm =
    gltf.userData.vrm;
```

---

# 27. AvatarLoader

```typescript
export interface AvatarLoader {

    load(
        url: string
    ): Promise<VRM>;

    unload(): void;
}
```

---

# 28. VRM Expression

VRM Avatar Expression 應統一由：

```typescript
AvatarExpression
```

管理。

```typescript
export interface AvatarExpression {

    set(
        name: string,
        weight: number
    ): void;

    reset(
        name: string
    ): void;

    resetAll(): void;
}
```

---

# 29. Expression Layer

Expression 必須分 Layer：

```text
Base
 ↓
Emotion
 ↓
Blink
 ↓
Lip Sync
```

Lip Sync 不得永久覆蓋：

```text
happy
sad
surprised
```

---

# 30. Expression Priority

優先級：

```text
Lip Sync
   ↑
Blink
   ↑
Emotion
   ↑
Idle
```

但不同 Expression 不應互相覆蓋。

例如：

```text
mouth:
Lip Sync

eyes:
Blink

eyebrows:
Emotion

body:
Gesture
```

---

# 31. Avatar State Machine

```text
             ┌──────────┐
             │   IDLE   │
             └────┬─────┘
                  │
           user speaks
                  │
                  ▼
          ┌─────────────┐
          │ LISTENING   │
          └──────┬──────┘
                 │
          Gemini processing
                 │
                 ▼
          ┌─────────────┐
          │ THINKING    │
          └──────┬──────┘
                 │
          audio received
                 │
                 ▼
          ┌─────────────┐
          │ SPEAKING    │
          └──────┬──────┘
                 │
             audio end
                 │
                 ▼
              IDLE

SPEAKING
    │
    │ user interrupt
    ▼
INTERRUPTED
    │
    ▼
LISTENING
```

---

# 32. State Transition Rules

```typescript
IDLE
 → LISTENING

LISTENING
 → THINKING

THINKING
 → SPEAKING

SPEAKING
 → IDLE

SPEAKING
 → INTERRUPTED

INTERRUPTED
 → LISTENING
```

不允許任意 State 直接修改其他 State。

統一透過：

```typescript
stateMachine.transition(...)
```

---

# 33. State Machine Interface

```typescript
export interface AvatarStateMachine {

    getState(): AvatarState;

    transition(
        next: AvatarState
    ): void;

    update(
        deltaTime: number
    ): void;
}
```

---

# 34. Idle Animation

Idle 不使用 AI。

包含：

```text
Breathing
Blink
Head micro movement
Eye micro movement
```

---

# 35. Blink

眨眼間隔：

```text
2 ~ 6 seconds
```

採用隨機 interval。

Blink：

```text
0
 ↓
1
 ↓
0
```

使用 easing。

不要：

```text
Math.random()
```

每 frame 重新決定是否眨眼。

---

# 36. Breathing

使用：

```typescript
const breathing =
    Math.sin(time * frequency)
    * amplitude;
```

控制：

```text
Chest
Spine
Shoulder
```

不要直接大幅修改整個 VRM root。

---

# 37. Head Movement

Head movement 使用低頻 noise。

例如：

```text
rotation.x
rotation.y
rotation.z
```

限制：

```text
X:
± 2°

Y:
± 4°

Z:
± 1°
```

避免角色看起來像機械人。

---

# 38. Gesture Animation

Gesture 使用預先建立的 AnimationClip。

例如：

```text
nod.glb
wave.glb
shake-head.glb
```

透過：

```typescript
AnimationMixer
```

播放。

---

# 39. Gesture API

```typescript
export interface GestureController {

    play(
        gesture: Gesture
    ): void;

    stop(): void;

    isPlaying(): boolean;
}
```

---

# 40. Emotion Controller

```typescript
export interface EmotionController {

    setEmotion(
        emotion: Emotion
    ): void;

    getEmotion(): Emotion;

    update(
        deltaTime: number
    ): void;
}
```

Emotion transition 必須 smooth。

例如：

```text
neutral
   ↓ 300ms
happy
```

禁止：

```text
neutral → happy
```

瞬間切換造成視覺跳動。

---

# 41. Gemini → Emotion

MVP 不要求 Gemini 每個 audio chunk 傳 emotion。

Emotion 是：

```text
Response-level metadata
```

例如：

```json
{
    "emotion": "happy",
    "gesture": "nod"
}
```

Application Layer 接收後：

```typescript
avatar.setEmotion(
    response.emotion
);

avatar.playGesture(
    response.gesture
);
```

---

# 42. 不可接受的設計

不要：

```text
Gemini
 ↓
每 16ms JSON
 ↓
Avatar
```

不要：

```text
Gemini
 ↓
AI Animation Generator
 ↓
Video
```

不要：

```text
Audio
 ↓
Backend
 ↓
Lip Sync
 ↓
Video
 ↓
Browser
```

MVP 必須保持：

```text
Gemini
 ↓
Audio
 ↓
Browser
 ↓
Avatar
```

---

# 43. Application Event Bus

建立：

```typescript
export interface EventBus {

    emit<T>(
        event: string,
        data: T
    ): void;

    on<T>(
        event: string,
        handler: (data: T) => void
    ): () => void;
}
```

事件：

```text
gemini.connected
gemini.disconnected
gemini.audio
gemini.turn.start
gemini.turn.end
gemini.interrupted

avatar.state
avatar.emotion
avatar.gesture
avatar.viseme

audio.started
audio.stopped
```

---

# 44. Main Application Flow

```typescript
async function startApplication() {

    await audio.initialize();

    await avatar.load(
        "/avatars/default.vrm"
    );

    await gemini.connect();

    avatar.setState(
        AvatarState.Idle
    );
}
```

---

# 45. User Speech Flow

```text
User
 ↓
Microphone
 ↓
Gemini Live
 ↓
Gemini processing
 ↓
THINKING
 ↓
Gemini Audio
 ↓
SPEAKING
 ↓
AudioPlayer
 ↓
LipSync
 ↓
VRM
```

---

# 46. User Interrupt Flow

```text
User speaks
      ↓
Gemini detects interruption
      ↓
gemini.interrupted
      ↓
AudioPlayer.stop()
      ↓
LipSync reset
      ↓
Avatar State = INTERRUPTED
      ↓
Avatar State = LISTENING
```

---

# 47. Main Render Loop

```typescript
function animate() {

    requestAnimationFrame(
        animate
    );

    const delta =
        clock.getDelta();

    lipSync.update(delta);

    avatarStateMachine.update(
        delta
    );

    emotionController.update(
        delta
    );

    gestureController.update(
        delta
    );

    avatarController.update(
        delta
    );

    renderer.render(
        scene,
        camera
    );
}
```

---

# 48. Rendering

Three.js：

```text
WebGLRenderer
```

設定：

```typescript
renderer.setPixelRatio(
    Math.min(
        window.devicePixelRatio,
        2
    )
);
```

Mobile 建議：

```text
max DPR = 1.5
```

Desktop：

```text
max DPR = 2
```

避免高 DPI 手機 GPU 負擔過大。

---

# 49. Camera

Avatar Camera 預設：

```text
Head / upper body framing
```

建議：

```text
Camera
 ↓
Avatar chest
 ↓
Head
```

Avatar 頭部約佔：

```text
畫面高度 35% ~ 50%
```

---

# 50. Lighting

最低：

```text
Ambient / Hemisphere
+
Key Light
+
Fill Light
```

不要使用過多 realtime lights。

MVP：

```text
1 directional
1 hemisphere
```

即可。

---

# 51. VRM Performance

推薦 Avatar：

```text
Triangles < 50k
Textures ≤ 2048
```

Mobile 優先：

```text
Triangles < 30k
Textures ≤ 1024
```

避免：

- 高解析度多張 4K texture
- 過多 bones
- 過多 SpringBone
- 過多 realtime lights

---

# 52. Resource Management

VRM 切換時：

```text
old VRM
 ↓
remove from scene
 ↓
dispose geometry
 ↓
dispose material
 ↓
dispose texture
 ↓
load new VRM
```

避免長時間使用後：

```text
GPU memory leak
```

---

# 53. Error Handling

Gemini：

```text
Connection Error
Authentication Error
Rate Limit
Network Error
Session Closed
```

Avatar：

```text
VRM Load Error
Invalid VRM
WebGL Error
Texture Error
```

Audio：

```text
Microphone Permission Denied
AudioContext Suspended
Audio Decode Error
```

UI 必須提供使用者可理解的錯誤訊息。

---

# 55. Performance Metrics

記錄：

```text
FPS
Frame Time
Audio Latency
LipSync Latency
Gemini First Audio Time
VRM Load Time
Memory
```

---

# 56. Performance Targets

Desktop：

```text
FPS ≥ 55
```

最低：

```text
FPS ≥ 30
```

Lip Sync：

```text
Audio → Mouth
< 100ms
```

目標：

```text
< 50ms
```

Gemini：

不對 Gemini response latency 設定硬性限制，因為其受網路與模型處理時間影響。

---

# 57. Security

## 57.1 不將永久 API Key 放入 Production Bundle

錯誤：

```typescript
const apiKey =
    "AIza....";
```

禁止。

---

## 57.2 Production Authentication

推薦：

```text
Browser
   ↓
Token Provider
   ↓
Ephemeral Token
   ↓
Gemini Live
```

Token Provider 不負責：

```text
Avatar
LipSync
Audio Processing
```

它只負責：

```text
Authentication
Token Issuing
```

---

# 58. Configuration

```typescript
export interface AppConfig {

    gemini: {
        model: string;
        systemInstruction: string;
    };

    avatar: {
        modelUrl: string;
        expressionMap: Record<string, string>;
    };

    audio: {
        inputSampleRate: number;
        outputSampleRate: number;
        volume: number;
    };

    lipSync: {
        enabled: boolean;
        smoothing: number;
        silenceThreshold: number;
    };
}
```

---

# 59. avatar.json

```json
{
    "modelUrl": "/avatars/default.vrm",

    "expressionMap": {
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
        "blink": true,
        "breathing": true,
        "headMovement": true
    }
}
```

---

# 60. Testing Strategy

## Unit Test

測試：

```text
PCM conversion
Audio scheduling
State transition
Emotion transition
Viseme mapping
Expression mapping
```

---

# 61. State Machine Tests

例如：

```typescript
expect(
    machine.transition(
        AvatarState.Speaking
    )
).toBe(false);
```

當前：

```text
IDLE
```

不能直接：

```text
IDLE → SPEAKING
```

應：

```text
IDLE
→ LISTENING
→ THINKING
→ SPEAKING
```

---

# 62. Lip Sync Tests

測試 Audio：

```text
silence
AA dominant
IH dominant
OU dominant
EE dominant
OH dominant
```

確認：

```text
Viseme
Weight
```

符合預期。

---

# 63. Browser Test

使用：

```text
Chrome
Edge
Safari
Android Chrome
iOS Safari
```

測試：

```text
Microphone
AudioContext
WebGL
VRM
Gemini WebSocket
```

---

# 64. Mobile Test

至少測試：

```text
Android Chrome
iOS Safari
```

確認：

- AudioContext 啟動
- Microphone permission
- Gemini Audio 播放
- VRM FPS
- Lip Sync
- Interrupt
- Background / foreground recovery

---

# 65. Graceful Degradation

如果裝置效能不足：

```text
60 FPS
 ↓
30 FPS
```

依序降低：

```text
Pixel Ratio
 ↓
Shadow
 ↓
Post Processing
 ↓
SpringBone
 ↓
Animation complexity
```

Lip Sync 必須優先保留。

---

# 66. Feature Flags

```typescript
interface FeatureFlags {

    lipSync: boolean;

    emotion: boolean;

    gesture: boolean;

    idleAnimation: boolean;

    highQualityRendering: boolean;
}
```

方便逐步開發。

---

# 67. MVP Implementation Order

Coding Agent 必須按照以下順序開發。

## Step 1

建立：

```text
Vite
TypeScript
Three.js
```

確認 WebGL 正常。

---

## Step 2

加入：

```text
@pixiv/three-vrm
```

成功載入 VRM。

---

## Step 3

建立：

```text
AvatarController
```

實作：

```text
Expression
Blink
Breathing
```

---

## Step 4

加入 Gemini Live。

先確認：

```text
Microphone
 ↓
Gemini
 ↓
Audio
 ↓
Speaker
```

---

## Step 5

建立：

```text
GeminiAudioPlayer
```

確保 Audio Chunk 不產生 gap。

---

## Step 6

建立：

```text
LipSyncEngine
```

先實作：

```text
RMS
```

確認：

```text
Audio Volume
 ↓
mouthOpen
```

---

## Step 7

加入：

```text
three-vrm-lip-sync
```

將：

```text
Audio
 ↓
Viseme
 ↓
VRM
```

串接完成。

---

## Step 8

加入：

```text
AvatarStateMachine
```

完成：

```text
IDLE
LISTENING
THINKING
SPEAKING
INTERRUPTED
```

---

## Step 9

加入：

```text
Emotion
```

---

## Step 10

加入：

```text
Gesture
```

---

## Step 11

加入：

```text
Performance optimization
```

---

# 68. Definition of Done

第一個可交付版本必須符合：

### Gemini

- [ ] Gemini Live 可以連線
- [ ] Microphone 可以輸入
- [ ] Gemini Audio 可以播放
- [ ] 支援 interruption
- [ ] 支援 reconnect

### Avatar

- [ ] VRM 正常載入
- [ ] 60 FPS desktop
- [ ] 30 FPS mobile
- [ ] Idle animation
- [ ] Blink
- [ ] Breathing

### Lip Sync

- [ ] Audio → Viseme
- [ ] Viseme → VRM Expression
- [ ] Mouth smoothing
- [ ] Silence detection
- [ ] Interrupt 時嘴巴停止

### Animation

- [ ] Listening
- [ ] Thinking
- [ ] Speaking
- [ ] Emotion
- [ ] Gesture

### Architecture

- [ ] Gemini 與 Avatar 解耦
- [ ] Lip Sync 與 Gemini Session 解耦
- [ ] Animation State Machine
- [ ] Event Bus
- [ ] Avatar 可替換
- [ ] Gemini 可替換

### Security

- [ ] Production 不暴露永久 API Key
- [ ] 使用 HTTPS
- [ ] Token provider 與 Avatar backend 無關

---

# 69. Future Architecture

完成 MVP 後，可以進一步演進：

```text
                    Gemini Live
                        │
            ┌───────────┴───────────┐
            │                       │
          Audio                  Metadata
            │                       │
            ▼                       ▼
        Lip Sync              Emotion/Gesture
            │                       │
            └───────────┬───────────┘
                        ▼
                Avatar Controller
                        │
             ┌──────────┴──────────┐
             │                     │
            VRM                 Live2D
             │                     │
             └──────────┬──────────┘
                        ▼
                   Web Avatar
```

---

# 70. Future: Multimodal Avatar

未來可以加入 Camera：

```text
User Camera
     │
     ▼
Face Tracking
     │
     ├── Face Direction
     ├── Eye Direction
     ├── Emotion
     └── Head Pose
             │
             ▼
          Avatar
```

進一步形成：

```text
User
 │
 ├── Voice
 ├── Camera
 └── Gesture
       │
       ▼
 Gemini Live
       │
       ├── Audio
       ├── Emotion
       └── Response
       │
       ▼
 AI Avatar
```

---

# 71. Future: Spatial Interaction

如果瀏覽器支援適當的裝置 API，可以進一步加入：

```text
Device Orientation
Camera
Pointer
Touch
Voice
```

Avatar 可以：

```text
看向使用者
跟隨視線
點頭
回應觸控
```

---

# 72. Engineering Principles

## Principle 1

**Audio is the source of truth for Lip Sync.**

---

## Principle 2

**Gemini does not directly control rendering.**

---

## Principle 3

**Animation is deterministic whenever possible.**

---

## Principle 4

**Do not generate video when real-time rendering is sufficient.**

---

## Principle 5

**Do not send high-frequency animation commands through Gemini.**

---

## Principle 6

**All latency-sensitive operations remain client-side.**

---

## Principle 7

**Avatar implementation must be replaceable.**

---

# 73. Final Architecture

```text
                        ┌─────────────────┐
                        │  Gemini Live    │
                        └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                  Audio                    Events
                    │                         │
                    ▼                         ▼
             AudioPlayer                EventBus
                    │                         │
                    ▼                         │
              AudioAnalyser                   │
                    │                         │
                    ▼                         │
               LipSyncEngine                  │
                    │                         │
                    ▼                         │
                 Viseme                       │
                    │                         │
                    └────────────┬────────────┘
                                 ▼
                       AvatarController
                                 │
                 ┌───────────────┼───────────────┐
                 │               │               │
                 ▼               ▼               ▼
              Lip Sync        Emotion         Gesture
                 │               │               │
                 └───────────────┼───────────────┘
                                 ▼
                        Animation State
                                 │
                                 ▼
                       Three.js Renderer
                                 │
                                 ▼
                              VRM
                                 │
                                 ▼
                              WebGL
```

---

# 74. Implementation Priority

| Priority | Feature | Importance |
|---|---|---|
| P0 | Gemini Live | Critical |
| P0 | VRM Rendering | Critical |
| P0 | Audio Playback | Critical |
| P0 | Basic Lip Sync | Critical |
| P0 | Interruption | Critical |
| P1 | State Machine | High |
| P1 | Blink | High |
| P1 | Breathing | High |
| P1 | Emotion | High |
| P1 | Gesture | High |
| P2 | Advanced Viseme | Medium |
| P2 | Face Tracking | Medium |
| P2 | Eye Tracking | Medium |
| P3 | AI-generated Gesture | Future |
| P3 | AI Video Avatar | Future |

---

# 75. Coding Agent Instructions

Coding Agent 執行本專案時必須遵守：

1. 不建立 Backend。
2. 不使用 GPU Server。
3. 不使用第三方 Lip Sync API。
4. 不使用第三方 Avatar Streaming API。
5. Lip Sync 必須 Client-side。
6. Gemini Audio 必須直接進入 Web Audio Pipeline。
7. 不將完整 Audio 等待完畢後才做 Lip Sync。
8. Avatar 與 Gemini Client 必須解耦。
9. 不在 Gemini Event Handler 中直接修改 Three.js Object。
10. 使用 Event Bus / Controller 進行模組間溝通。
11. 所有動畫必須透過 AvatarController。
12. 所有 VRM Expression 必須集中管理。
13. 所有 State Transition 必須經過 AvatarStateMachine。
14. 必須支援 Gemini interruption。
15. 必須避免 Audio chunk 播放 gap。
16. 必須對 AudioContext suspended 狀態進行處理。
17. 必須處理 microphone permission denied。
18. 必須處理 Gemini connection failure。
20. 所有高頻動畫操作必須在 Client-side requestAnimationFrame 中完成。

---

# 76. Recommended First Milestone

第一個 Milestone 不要一次實作所有功能。

先完成：

```text
Vite
 +
TypeScript
 +
Three.js
 +
VRM
 +
Gemini Live
 +
Web Audio
 +
RMS Lip Sync
```

達成：

```text
使用者說話
      ↓
Gemini 回應
      ↓
Avatar 開始說話
      ↓
嘴巴跟著 Gemini Audio 動
      ↓
Gemini 被使用者打斷
      ↓
Avatar 嘴巴停止
```

確認這條 Pipeline 穩定後，再加入：

```text
Viseme
 ↓
Emotion
 ↓
Blink
 ↓
Head Movement
 ↓
Gesture
```

這樣可以把問題拆成可獨立驗證的模組，避免 Gemini Live、Audio、VRM、Lip Sync、Animation 同時出錯而難以定位。
