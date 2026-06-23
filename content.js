// 방법 B: 페이지가 로드하는 .mp4 리소스를 관찰해 캐시
const capturedMp4 = [];
try {
  const po = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (/\.mp4(\?|$)/.test(entry.name) && !entry.name.startsWith("blob:")) {
        // URL과 크기를 함께 저장한다. 크기로 DASH init segment(작은 헤더 파일)를
        // 가려내고, 최근 항목(현재 보는 릴스)을 골라낼 수 있다.
        capturedMp4.push({
          url: entry.name,
          size: entry.transferSize || entry.encodedBodySize || entry.decodedBodySize || 0,
        });
      }
    }
  });
  po.observe({ type: "resource", buffered: true });
} catch (e) {
  // PerformanceObserver 미지원 환경: 방법 A만으로 동작
}

/**
 * findVisibleVideo()
 *
 * 다운로드를 누른 '그 순간' 화면에 떠서 재생 중인 <video>를 찾는다. Instagram은
 * SPA라 content.js가 한 번만 로드되지만 <video> 엘리먼트는 실시간 DOM 상태이므로,
 * 릴스를 넘겼을 때 '지금 보는 영상'을 가장 정확히 가리킨다. 화면 중앙에 가깝고
 * 재생 중(paused=false)인 것을 우선한다.
 *
 * @returns {HTMLVideoElement|null}
 */
function findVisibleVideo() {
  const cx = innerWidth / 2, cy = innerHeight / 2;
  let best = null;
  for (const v of document.querySelectorAll("video")) {
    const r = v.getBoundingClientRect();
    if (r.width < 80 || r.height < 80) continue;          // 썸네일·아이콘 크기 제외
    if (r.bottom <= 0 || r.top >= innerHeight) continue;  // 화면 밖 제외
    const vcx = r.left + r.width / 2, vcy = r.top + r.height / 2;
    const dist = Math.hypot(vcx - cx, vcy - cy);
    const score = (v.paused ? 1e6 : 0) + dist;            // 재생 중 우선, 그다음 중앙 근접
    if (!best || score < best.score) best = { v, score };
  }
  return best ? best.v : null;
}

/**
 * fetchFromInstagramApi()
 *
 * ⚠️  HYPOTHESIS — must be verified by real testing.
 *
 * This approach relies on:
 *   - The /api/v1/media/<mediaId>/info/ endpoint being accessible from a logged-in
 *     browser session (cookies sent via credentials: "include").
 *   - The x-ig-app-id value "936619743392459" (Instagram Web's app ID as of 2025).
 *   - The shortcode-to-mediaId base64 decoding being correct for the shortcode found
 *     in /p/, /reel/, /reels/, /tv/ URL path segments.
 *   - The response JSON shape: { items: [{ video_versions: [{ url: "..." }, ...] }] }
 *
 * Instagram changes endpoints, app IDs, and response shapes without notice.
 * On ANY failure (network error, non-OK status, unexpected JSON shape) this function
 * returns null, allowing the existing PerformanceObserver path to run as the final
 * fallback — so this is fully graceful and non-breaking.
 *
 * @returns {Promise<string|null>}
 */
async function fetchFromInstagramApi() {
  try {
    const m = location.pathname.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/);
    if (!m) return null;
    const mediaId = shortcodeToMediaId(m[1]);
    if (!mediaId) return null;
    const res = await fetch(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, {
      headers: { "x-ig-app-id": "936619743392459" },
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const versions = data && data.items && data.items[0] && data.items[0].video_versions;
    return (versions && versions.length) ? versions[0].url : null;
  } catch (e) {
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "EXTRACT_VIDEO") {
    (async () => {
      const scMatch = location.pathname.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/);
      const shortcode = scMatch ? scMatch[1] : null;
      const html = document.documentElement.innerHTML;

      // 다운로드를 누른 '그 순간' 화면에서 재생 중인 영상을 직접 찾는다 (첫 화면 고착 방지).
      const cur = findVisibleVideo();
      const curSrc = cur ? (cur.currentSrc || cur.src || "") : "";
      const m0 = (curSrc && !curSrc.startsWith("blob:") && /\.mp4(\?|$)/.test(curSrc)) ? curSrc : null;

      const m1 = extractVideoUrlForShortcode(html, shortcode); // 주소 shortcode 앵커 (단일 게시물)
      const m2 = extractFromDocument(document);                // og:video / <video> src
      const m3 = await fetchFromInstagramApi();                // 내부 API
      const m4 = pickCurrentMp4(capturedMp4);                  // 가장 최근 로드된 mp4 (릴스)

      // 단일 게시물(shortcode 있음): 주소가 현재 영상을 정확히 가리킨다.
      // 릴스/피드: shortcode→내부 API(m3)가 현재 영상을 가장 정확히 준다. innerHTML 앵커(m1)는
      // 릴스 누적 데이터에서 첫 화면 영상을 집을 수 있어 후순위로 내린다 (실측 확인).
      const url = shortcode
        ? (m3 || m1 || m0 || m2 || m4 || null)
        : (m0 || m4 || m1 || m2 || null);

      sendResponse({ url: url || null, pageUrl: location.href });
    })();
    return true; // keep channel open for async sendResponse
  }
});
