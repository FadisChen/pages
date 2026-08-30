function shouldPlayLiveAudio({ hasToolCall = false, suppressAudio = false } = {}) {
  // A synchronous tool call resumes the same model turn after the tool response.
  // Drop any pre-tool audio so the resumed turn cannot be heard twice.
  return !hasToolCall && !suppressAudio;
}

export { shouldPlayLiveAudio };
