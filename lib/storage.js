const KEY_NAME = "openai_key";

function getKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get([KEY_NAME], (r) => resolve(r[KEY_NAME] || ""));
  });
}
function setKey(key) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [KEY_NAME]: key }, () => resolve());
  });
}
function resultKey(videoId, tab) {
  return `result_${tab}_${videoId || "current"}`;
}
function getResult(videoId, tab) {
  const k = resultKey(videoId, tab);
  return new Promise((resolve) => {
    chrome.storage.local.get([k], (r) => resolve(r[k] || ""));
  });
}
function setResult(videoId, tab, text) {
  const k = resultKey(videoId, tab);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [k]: text }, () => resolve());
  });
}
