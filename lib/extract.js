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

// Un-escape JSON-encoded URL fragments, shared by the extractors below.
//   \/      → /   (JSON forward-slash escape)
//   &  → &   (Instagram security-escapes & in URLs; without this the
//                  query string breaks, e.g. ...?a=1&b=2, and the
//                  download URL is malformed → chrome.downloads fails)
//   &amp;   → &   (HTML-entity form; kept as a defensive fallback)
// Order: handle \/ and & first, &amp; last.
function unescapeJsonUrl(url) {
  return url
    .replace(/\\\//g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&");
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
 * URL values in JSON are JSON-encoded: forward-slashes appear as `\/`, and `&`
 * is security-escaped as `&` (and occasionally as the HTML entity `&amp;`).
 * All three are un-escaped before returning so the download URL is valid.
 *
 * @param {string} html  Full innerHTML / outerHTML of the page.
 * @returns {string|null}  Absolute URL, or null if not found.
 */
function extractEmbeddedVideoUrl(html) {
  // Guard: only accept strings.
  if (typeof html !== "string") return null;

  // 1. "video_versions":[{..."url":"<URL>"...}]
  //    Captures the "url" value inside the first object of the array.
  //    The array may span JSON whitespace, and the "url" key may not be first.
  const vvMatch = html.match(/"video_versions"\s*:\s*\[\s*\{[^}]*?"url"\s*:\s*"([^"]+)"/);
  if (vvMatch) return unescapeJsonUrl(vvMatch[1]);

  // 2. "video_url":"<URL>"
  const vuMatch = html.match(/"video_url"\s*:\s*"([^"]+)"/);
  if (vuMatch) return unescapeJsonUrl(vuMatch[1]);

  // 3. "playable_url_quality_hd":"<URL>"  (check HD before SD)
  const hdMatch = html.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/);
  if (hdMatch) return unescapeJsonUrl(hdMatch[1]);

  // 4. "playable_url":"<URL>"
  const sdMatch = html.match(/"playable_url"\s*:\s*"([^"]+)"/);
  if (sdMatch) return unescapeJsonUrl(sdMatch[1]);

  return null;
}

/**
 * extractVideoUrlForShortcode(html, shortcode)
 *
 * Instagram is a SPA: content.js loads once, and as the user scrolls or navigates
 * post→post, the embedded JSON for EVERY viewed video accumulates in innerHTML.
 * extractEmbeddedVideoUrl() returns the FIRST match in the whole document — i.e.
 * the earliest (previous) video — which is exactly why "the previous video" gets
 * downloaded instead of the one on screen.
 *
 * The address bar, however, always points at the current post: the shortcode in
 * /p/, /reel/, /tv/ is a reliable "which video am I looking at" anchor. This picks
 * the video URL appearing NEAREST to that shortcode in the HTML, so the current
 * video wins over stale ones. Falls back to the global first-match only when the
 * shortcode is missing or not found in the HTML (preserving old behaviour).
 *
 * @param {string} html             Full innerHTML of the page.
 * @param {string|null} shortcode   Current post shortcode from location.pathname.
 * @returns {string|null}
 */
function extractVideoUrlForShortcode(html, shortcode) {
  if (typeof html !== "string") return null;
  if (shortcode) {
    const anchor = html.indexOf(`"${shortcode}"`);
    if (anchor >= 0) {
      // Same key priority as extractEmbeddedVideoUrl, but collect ALL matches with
      // their positions so we can choose the one closest to the current shortcode.
      const patterns = [
        /"video_versions"\s*:\s*\[\s*\{[^}]*?"url"\s*:\s*"([^"]+)"/g,
        /"video_url"\s*:\s*"([^"]+)"/g,
        /"playable_url_quality_hd"\s*:\s*"([^"]+)"/g,
        /"playable_url"\s*:\s*"([^"]+)"/g,
      ];
      let best = null;
      for (const re of patterns) {
        let m;
        while ((m = re.exec(html)) !== null) {
          const dist = Math.abs(m.index - anchor);
          if (!best || dist < best.dist) best = { url: m[1], dist };
        }
      }
      if (best) return unescapeJsonUrl(best.url);
    }
  }
  // Shortcode absent or not in HTML → preserve original global-first-match behaviour.
  return extractEmbeddedVideoUrl(html);
}

/**
 * pickCurrentMp4(entries, minSize)
 *
 * Instagram is a SPA: content.js's PerformanceObserver accumulates every .mp4 the
 * page loads, oldest first. The old pickBestUrl() returned the FIRST entry — i.e.
 * the video from the page's initial "first screen" — so swiping through Reels kept
 * downloading that first video. The currently-viewed Reel is the MOST RECENT load,
 * so we scan from the end. Tiny entries (DASH init segments — a few hundred bytes of
 * header with no playable frames) are skipped via a size floor.
 *
 * @param {Array<{url:string,size:number}>} entries  captured mp4 resources (size = bytes)
 * @param {number} [minSize=50000]  byte floor to skip init segments
 * @returns {string|null}
 */
function pickCurrentMp4(entries, minSize) {
  const min = minSize || 50000;
  const valid = (entries || []).filter(
    (e) => e && typeof e.url === "string" && e.url.length > 0 && !e.url.startsWith("blob:")
  );
  if (!valid.length) return null;
  // Most-recent first: a sufficiently large mp4 (skip init segments).
  for (let i = valid.length - 1; i >= 0; i--) {
    if (valid[i].url.includes(".mp4") && (valid[i].size || 0) >= min) return valid[i].url;
  }
  // Size floor matched nothing → most-recent mp4 regardless of size.
  for (let i = valid.length - 1; i >= 0; i--) {
    if (valid[i].url.includes(".mp4")) return valid[i].url;
  }
  // No mp4 at all → most-recent valid URL.
  return valid[valid.length - 1].url;
}

/**
 * shortcodeToMediaId(shortcode)
 *
 * Decodes an Instagram shortcode (the alphanumeric slug in /p/, /reel/, /tv/ URLs)
 * into the numeric media_id string that Instagram's internal API expects.
 *
 * Shortcodes are base64-encoded using Instagram's custom alphabet:
 *   ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_
 * (A=0, B=1, …, Z=25, a=26, …, z=51, 0=52, …, 9=61, -=62, _=63)
 *
 * Uses BigInt arithmetic because media IDs exceed Number.MAX_SAFE_INTEGER.
 *
 * @param {string} shortcode  e.g. "DZE1ubJoHsB"
 * @returns {string|null}  Numeric media ID string, or null if shortcode contains
 *                         characters outside the alphabet.
 */
function shortcodeToMediaId(shortcode) {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = 0n;
  for (const ch of String(shortcode)) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    id = id * 64n + BigInt(v);
  }
  return id.toString();
}

// NOTE: popup.js keeps an identical copy of makeFilename — popup can't share content-script globals. Keep both in sync.
function makeFilename(pageUrl) {
  const m = (pageUrl || "").match(/\/(p|reel|reels|tv)\/([^/?#]+)/);
  const id = m ? m[2] : "video";
  return `instagram_${id}.mp4`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    pickBestUrl, extractOgVideo, collectVideoSrcs, extractFromDocument, makeFilename,
    extractEmbeddedVideoUrl, extractVideoUrlForShortcode, pickCurrentMp4, shortcodeToMediaId,
  };
}
