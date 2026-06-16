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

/**
 * extractEmbeddedVideoUrl(html)
 *
 * Tries to extract a progressive MP4 URL from the raw HTML of an Instagram post
 * page. Instagram embeds JSON data (either as __additionalDataLoaded, server-data
 * script tags, or similar) that contains direct video URLs for logged-in users on
 * single-post pages (/p/, /reel/).
 *
 * ⚠️  Key names are hypothesised from known Instagram API shapes as of 2025.
 * Instagram changes its JSON schema without notice — if extraction fails after
 * an Instagram update, inspect the page HTML and update the regexes below.
 *
 * Priority (first match wins):
 *   1. "video_versions":[{..."url":"<URL>"...}]  — mobile/private-API shape; first
 *      entry is typically the highest-quality rendition.
 *   2. "video_url":"<URL>"                        — GraphQL / GQL shape.
 *   3. "playable_url_quality_hd":"<URL>"          — alternate HD key.
 *   4. "playable_url":"<URL>"                     — alternate SD/fallback key.
 *
 * URL values in JSON are JSON-encoded, so forward-slashes may appear as `\/`
 * and `&` as `&amp;`. Both are un-escaped before returning.
 *
 * @param {string} html  Full innerHTML / outerHTML of the page.
 * @returns {string|null}  Absolute URL, or null if not found.
 */
function extractEmbeddedVideoUrl(html) {
  // Guard: only accept strings.
  if (typeof html !== "string") return null;

  // Helper to un-escape JSON-encoded URL fragments.
  function unescape(url) {
    return url.replace(/\\\//g, "/").replace(/&amp;/g, "&");
  }

  // 1. "video_versions":[{..."url":"<URL>"...}]
  //    Captures the "url" value inside the first object of the array.
  //    The array may span JSON whitespace, and the "url" key may not be first.
  const vvMatch = html.match(/"video_versions"\s*:\s*\[\s*\{[^}]*?"url"\s*:\s*"([^"]+)"/);
  if (vvMatch) return unescape(vvMatch[1]);

  // 2. "video_url":"<URL>"
  const vuMatch = html.match(/"video_url"\s*:\s*"([^"]+)"/);
  if (vuMatch) return unescape(vuMatch[1]);

  // 3. "playable_url_quality_hd":"<URL>"  (check HD before SD)
  const hdMatch = html.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/);
  if (hdMatch) return unescape(hdMatch[1]);

  // 4. "playable_url":"<URL>"
  const sdMatch = html.match(/"playable_url"\s*:\s*"([^"]+)"/);
  if (sdMatch) return unescape(sdMatch[1]);

  return null;
}

// NOTE: popup.js keeps an identical copy of makeFilename — popup can't share content-script globals. Keep both in sync.
function makeFilename(pageUrl) {
  const m = (pageUrl || "").match(/\/(p|reel|tv)\/([^/?#]+)/);
  const id = m ? m[2] : "video";
  return `instagram_${id}.mp4`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    pickBestUrl, extractOgVideo, collectVideoSrcs, extractFromDocument, makeFilename,
    extractEmbeddedVideoUrl,
  };
}
