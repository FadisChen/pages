function shouldPlayLiveAudio({ interrupted = false, suppressAudio = false } = {}) {
  // Emotion tools affect the avatar, not the validity of already received PCM.
  // Only a real interruption or explicit suppression invalidates output audio.
  return !interrupted && !suppressAudio;
}

export { shouldPlayLiveAudio };
