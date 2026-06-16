// ---- 공용 ----
function makeFilename(pageUrl) {
  // NOTE: lib/extract.js와 동일 복사본 — 동기화 유지.
  const m = (pageUrl || "").match(/\/(p|reel|tv)\/([^/?#]+)/);
  const id = m ? m[2] : "video";
  return `instagram_${id}.mp4`;
}
function videoIdFrom(pageUrl) {
  const m = (pageUrl || "").match(/\/(p|reel|tv)\/([^/?#]+)/);
  return m ? m[2] : "current";
}
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
async function extractCurrentUrl(tabId) {
  const res = await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_VIDEO" });
  return res || {};
}

// ---- 탭 전환 ----
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    document.getElementById("panel-" + t.dataset.tab).classList.add("active");
  });
});

// ---- 결과 미니 버튼(복사/저장/지우기) ----
document.querySelectorAll("[data-copy]").forEach((b) =>
  b.addEventListener("click", () => {
    const el = document.getElementById(b.dataset.copy);
    navigator.clipboard.writeText(el.value);
  })
);
document.querySelectorAll("[data-save]").forEach((b) =>
  b.addEventListener("click", () => {
    const el = document.getElementById(b.dataset.save);
    const blob = new Blob([el.value], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: `instagram_${b.dataset.name}.txt` });
  })
);
document.querySelectorAll("[data-clear]").forEach((b) =>
  b.addEventListener("click", () => {
    document.getElementById(b.dataset.clear).value = "";
  })
);

// ---- 다운로드 탭 ----
async function initDownload() {
  const tab = await activeTab();
  const status = document.getElementById("dl-status");
  const btn = document.getElementById("dl-btn");
  if (!tab || !tab.url || !tab.url.includes("instagram.com")) {
    status.textContent = "인스타그램 영상 페이지에서 열어주세요";
    return;
  }
  let res;
  try { res = await extractCurrentUrl(tab.id); }
  catch (e) { status.textContent = "페이지를 새로고침한 뒤 다시 시도하세요"; return; }
  if (!res.url) { status.textContent = "영상을 못 찾았어요. 영상을 한 번 재생한 뒤 다시 시도"; return; }
  const filename = makeFilename(res.pageUrl);
  status.textContent = filename;
  btn.disabled = false;
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = "다운로드 중…";
    try { await chrome.downloads.download({ url: res.url, filename }); btn.textContent = "✓ 완료"; }
    catch (e) { btn.textContent = "다운로드 실패 — 재시도"; btn.disabled = false; }
  };
}

// ---- 설정 탭 ----
async function initSettings() {
  const input = document.getElementById("key-input");
  const status = document.getElementById("key-status");
  input.value = await getKey();
  document.getElementById("key-save").onclick = async () => {
    await setKey(input.value.trim());
    status.textContent = "✓ 저장됨";
  };
}

initDownload();
initSettings();
