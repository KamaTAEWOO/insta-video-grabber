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

function collectVideoSrcs(doc) {
  const out = [];
  const videos = doc.querySelectorAll ? doc.querySelectorAll("video") : [];
  for (const v of videos) {
    if (v.src) out.push(v.src);
    const sources = v.querySelectorAll ? v.querySelectorAll("source") : [];
    for (const s of sources) if (s.src) out.push(s.src);
  }
  return out;
}

function extractFromDocument(doc) {
  const candidates = [];
  const og = extractOgVideo(doc);
  if (og) candidates.push(og);
  candidates.push(...collectVideoSrcs(doc));
  return pickBestUrl(candidates);
}

function makeFilename(pageUrl) {
  const m = (pageUrl || "").match(/\/(p|reel|tv)\/([^/?#]+)/);
  const id = m ? m[2] : "video";
  return `instagram_${id}.mp4`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    pickBestUrl, extractOgVideo, collectVideoSrcs, extractFromDocument, makeFilename,
  };
}
