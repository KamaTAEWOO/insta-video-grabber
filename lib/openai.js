const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

function buildWhisperRequest(blob, key) {
  const form = new FormData();
  form.append("file", blob, "instagram.mp4");
  form.append("model", "whisper-1");
  return {
    url: WHISPER_URL,
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildWhisperRequest };
}
