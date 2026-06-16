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
    // 방법 A: DOM/메타 파싱
    let url = extractFromDocument(document);
    // 방법 B: 폴백 — 관찰된 .mp4
    if (!url) url = pickBestUrl(capturedMp4);
    sendResponse({
      url: url || null,
      pageUrl: location.href,
    });
  }
  return true; // async sendResponse 유지
});
