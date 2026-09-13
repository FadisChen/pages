const AVATAR_GESTURES = Object.freeze(["nod", "shake_head", "wave", "present", "tilt_head"]);

const AVATAR_GESTURE_TOOL = Object.freeze({
  name: "play_avatar_gesture",
  description: "依照自己即將說出的內容選擇一個自然動作：肯定用 nod，否定用 shake_head，招呼或道別用 wave，解釋介紹用 present，疑問思考用 tilt_head。每個回覆最多一次，沒有適合情境就不呼叫。",
  parameters: {
    type: "OBJECT",
    properties: { gesture: { type: "STRING", enum: AVATAR_GESTURES } },
    required: ["gesture"],
  },
});

function normalizeAvatarGesture(args) {
  if (!args || typeof args !== "object" || Array.isArray(args) || !AVATAR_GESTURES.includes(args.gesture)) {
    return { ok: false, error: "請使用支援的 gesture：nod、shake_head、wave、present、tilt_head。" };
  }
  return { ok: true, gesture: args.gesture };
}

const smooth = value => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };
const DURATIONS = { nod: 1.5, shake_head: 1.6, wave: 2.4, present: 2.6, tilt_head: 1.8 };

// Offsets are local rotations added AFTER the existing natural arms-down pose.
function sampleGesture(name, time) {
  const weight = smooth(time / .35) * smooth((DURATIONS[name] - time) / .45);
  const beat = Math.sin(time * Math.PI * 3);
  const offer = smooth((time - .35) / .65) * (1 - smooth((time - 1.65) / .45));
  switch (name) {
    case "nod": return { head: [.16 * beat * weight, 0, 0], neck: [.04 * beat * weight, 0, 0] };
    case "shake_head": return { head: [0, .21 * beat * weight, 0], neck: [0, .05 * beat * weight, 0] };
    case "tilt_head": return { head: [0, -.06 * weight, -.16 * weight], neck: [0, 0, -.04 * weight] };
    case "wave": return {
      rightUpperArm: [0, 0, -.08 * weight],
      rightLowerArm: [0, 2.7 * weight, (.2 + .1 * beat) * weight],
      rightHand: [-1.51 * weight, -.28 * weight, .36 * weight],
    };
    case "present": return {
      rightUpperArm: [.63 * weight, .25 * weight, -.28 * weight],
      rightLowerArm: [0, 1.4 * weight, (-.55 + .3 * offer) * weight],
      rightHand: [1.42 * weight, .86 * weight, .33 * weight],
    };
    default: return {};
  }
}

class AvatarGesturePlayer {
  constructor() { this.pending = null; this.active = null; }
  queue(gesture, id) {
    if (!AVATAR_GESTURES.includes(gesture) || this.pending || this.active) return false;
    this.pending = { gesture, id, wait: 0 };
    return true;
  }
  reset(immediate = false) {
    this.pending = null;
    if (immediate) this.active = null;
    else if (this.active && this.active.release === undefined) this.active.release = 0;
  }
  cancel(ids) {
    if (ids.includes(this.pending?.id)) this.pending = null;
    if (ids.includes(this.active?.id)) this.reset();
  }
  finishTurn() { if (this.pending) this.pending.finished = true; }
  update(dt, playing) {
    if (this.pending) {
      this.pending.wait += dt;
      if (this.pending.wait > 8 || (this.pending.finished && !playing)) this.pending = null;
      else if (playing) { this.active = { ...this.pending, time: 0 }; this.pending = null; }
    }
    if (!this.active) return {};
    const active = this.active;
    if (!playing && active.release === undefined) active.release = 0;
    if (active.release !== undefined) active.release += dt;
    else active.time += dt;
    if (active.time >= DURATIONS[active.gesture] || active.release >= .25) { this.active = null; return {}; }
    const pose = sampleGesture(active.gesture, active.time);
    const fade = active.release === undefined ? 1 : 1 - smooth(active.release / .25);
    for (const angles of Object.values(pose)) for (let i = 0; i < 3; i++) angles[i] *= fade;
    return pose;
  }
}

export { AVATAR_GESTURES, AVATAR_GESTURE_TOOL, normalizeAvatarGesture, AvatarGesturePlayer };
