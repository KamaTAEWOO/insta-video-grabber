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

const VISION_URL = "https://api.openai.com/v1/chat/completions";
const OCR_PROMPT =
  "다음은 한 인스타그램 영상에서 뽑은 프레임들이다. 화면에 떠 있는 자막(번인 텍스트)만 위에서 아래, 시간 순서대로 추출해라. 인스타 UI·버튼·워터마크·계정명은 제외하고, 같은 줄이 여러 프레임에 반복되면 한 번만 적어라. 자막이 전혀 없으면 '(자막 없음)'이라고만 답해라.";

function buildVisionRequest(dataUrls, key) {
  const content = [{ type: "text", text: OCR_PROMPT }];
  for (const url of dataUrls) {
    content.push({ type: "image_url", image_url: { url } });
  }
  return {
    url: VISION_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content }],
      max_tokens: 1500,
    }),
  };
}

async function transcribeAudio(blob, key) {
  const req = buildWhisperRequest(blob, key);
  const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
  if (!res.ok) throw new Error(`Whisper API ${res.status}`);
  const data = await res.json();
  return (data.text || "").trim();
}

async function ocrFrames(dataUrls, key) {
  const req = buildVisionRequest(dataUrls, key);
  const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
  if (!res.ok) throw new Error(`Vision API ${res.status}`);
  const data = await res.json();
  return (data.choices && data.choices[0] && data.choices[0].message.content || "").trim();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildWhisperRequest, buildVisionRequest, transcribeAudio, ocrFrames };
}
