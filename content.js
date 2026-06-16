// 방법 B: 페이지가 로드하는 .mp4 리소스를 관찰해 캐시
const capturedMp4 = [];
try {
  const po = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (/\.mp4(\?|$)/.test(entry.name) && !entry.name.startsWith("blob:")) {
        capturedMp4.push(entry.name);
      }
    }
  });
  po.observe({ type: "resource", buffered: true });
} catch (e) {
  // PerformanceObserver 미지원 환경: 방법 A만으로 동작
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
      // 방법 1 (최우선): 페이지 HTML에 내장된 JSON에서 progressive MP4 URL 추출.
      // /p/ · /reel/ 단일 게시물 페이지에서 로그인 상태일 때 가장 신뢰도 높음.
      let url = extractEmbeddedVideoUrl(document.documentElement.innerHTML);

      // 방법 2: og:video 메타 태그 / <video> src 파싱 (비로그인·공개 페이지 등)
      if (!url) url = extractFromDocument(document);

      // 방법 3: Instagram 내부 API 폴백 (/api/v1/media/<id>/info/).
      // ⚠️  가설적 접근 — 엔드포인트·app-id·숏코드 디코딩은 실제 테스트로 검증 필요.
      //     실패 시 null을 반환해 방법 4로 계속 진행하므로 안전하게 동작한다.
      if (!url) url = await fetchFromInstagramApi();

      // 방법 4 (최후 수단): PerformanceObserver가 관찰한 .mp4 리소스.
      // ⚠️  Instagram의 DASH 스트리밍 환경에서는 ~818 B 짜리 init segment(헤더만 있는
      //     비재생 파일)가 잡힐 수 있음. 재생이 안 되는 파일이 다운로드될 수 있으므로
      //     이 방법은 마지막 폴백으로만 사용한다.
      if (!url) url = pickBestUrl(capturedMp4);

      sendResponse({ url: url || null, pageUrl: location.href });
    })();
    return true; // keep channel open for async sendResponse
  }
});
