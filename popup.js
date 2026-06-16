const btn = document.getElementById("download");
const statusEl = document.getElementById("status");

// NOTE: lib/extract.js keeps an identical copy of makeFilename — popup can't share content-script globals. Keep both in sync.
function makeFilename(pageUrl) {
  const m = (pageUrl || "").match(/\/(p|reel|tv)\/([^/?#]+)/);
  const id = m ? m[2] : "video";
  return `instagram_${id}.mp4`;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("instagram.com")) {
    statusEl.textContent = "인스타그램 영상 페이지에서 열어주세요";
    return;
  }

  let res;
  try {
    res = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_VIDEO" });
  } catch (e) {
    statusEl.textContent = "페이지를 새로고침한 뒤 다시 시도하세요";
    return;
  }

  if (!res || !res.url) {
    statusEl.textContent = "영상을 못 찾았어요. 영상을 한 번 재생한 뒤 다시 시도";
    return;
  }

  const filename = makeFilename(res.pageUrl);
  statusEl.textContent = filename;
  btn.disabled = false;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "다운로드 중…";
    try {
      await chrome.downloads.download({ url: res.url, filename });
      btn.textContent = "✓ 완료";
    } catch (e) {
      btn.textContent = "다운로드 실패 — 재시도";
      btn.disabled = false;
    }
  });
}

init();
