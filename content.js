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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "EXTRACT_VIDEO") {
    // 방법 1 (최우선): 페이지 HTML에 내장된 JSON에서 progressive MP4 URL 추출.
    // /p/ · /reel/ 단일 게시물 페이지에서 로그인 상태일 때 가장 신뢰도 높음.
    let url = extractEmbeddedVideoUrl(document.documentElement.innerHTML);

    // 방법 2: og:video 메타 태그 / <video> src 파싱 (비로그인·공개 페이지 등)
    if (!url) url = extractFromDocument(document);

    // 방법 3 (최후 수단): PerformanceObserver가 관찰한 .mp4 리소스.
    // ⚠️  Instagram의 DASH 스트리밍 환경에서는 ~818 B 짜리 init segment(헤더만 있는
    //     비재생 파일)가 잡힐 수 있음. 재생이 안 되는 파일이 다운로드될 수 있으므로
    //     이 방법은 마지막 폴백으로만 사용한다.
    if (!url) url = pickBestUrl(capturedMp4);

    sendResponse({
      url: url || null,
      pageUrl: location.href,
    });
  }
  return true; // async sendResponse 유지
});
