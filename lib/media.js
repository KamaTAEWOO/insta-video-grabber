function pickFrameTimes(duration, max) {
  if (!(duration > 0)) return [];
  const n = Math.max(1, Math.min(max, Math.ceil(duration)));
  const times = [];
  for (let i = 0; i < n; i++) {
    times.push(Number(((duration * (i + 0.5)) / n).toFixed(3)));
  }
  return times;
}

async function fetchAsBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return await res.blob();
}

// blob → 숨김 video → 각 시점 seek → canvas 캡처 → jpeg dataURL[]
async function captureFrames(blob, times) {
  const objUrl = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.src = objUrl;
    video.muted = true;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video load failed"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    const frames = [];
    for (const t of times) {
      await new Promise((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("seek failed"));
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.7));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { pickFrameTimes, fetchAsBlob, captureFrames };
}
