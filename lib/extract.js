function pickBestUrl(candidates) {
  const valid = (candidates || []).filter(
    (u) => typeof u === "string" && u.length > 0 && !u.startsWith("blob:")
  );
  const mp4 = valid.find((u) => u.includes(".mp4"));
  return mp4 || valid[0] || null;
}

function extractOgVideo(doc) {
  const selectors = [
    'meta[property="og:video:secure_url"]',
    'meta[property="og:video"]',
    'meta[property="og:video:url"]',
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const content = el.getAttribute("content");
      if (content) return content;
    }
  }
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { pickBestUrl, extractOgVideo };
}
