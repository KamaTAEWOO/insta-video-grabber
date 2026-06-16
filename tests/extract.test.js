const test = require("node:test");
const assert = require("node:assert");
const { pickBestUrl } = require("../lib/extract.js");

test("pickBestUrl: mp4를 우선 선택하고 blob을 제외한다", () => {
  assert.equal(
    pickBestUrl(["blob:https://x", "https://cdn/v.mp4"]),
    "https://cdn/v.mp4"
  );
});

test("pickBestUrl: 후보가 없으면 null", () => {
  assert.equal(pickBestUrl([]), null);
  assert.equal(pickBestUrl(undefined), null);
});

test("pickBestUrl: mp4가 없으면 blob이 아닌 첫 후보", () => {
  assert.equal(pickBestUrl(["blob:x", "https://cdn/v.webm"]), "https://cdn/v.webm");
});

test("pickBestUrl: 모두 blob이면 null", () => {
  assert.equal(pickBestUrl(["blob:a", "blob:b"]), null);
});

const { extractOgVideo } = require("../lib/extract.js");

function mockDoc(metaMap) {
  return {
    querySelector(sel) {
      const m = sel.match(/property="([^"]+)"/);
      const key = m && m[1];
      if (key && metaMap[key]) {
        return { getAttribute: (a) => (a === "content" ? metaMap[key] : null) };
      }
      return null;
    },
  };
}

test("extractOgVideo: secure_url을 우선 읽는다", () => {
  const doc = mockDoc({
    "og:video": "https://cdn/plain.mp4",
    "og:video:secure_url": "https://cdn/secure.mp4",
  });
  assert.equal(extractOgVideo(doc), "https://cdn/secure.mp4");
});

test("extractOgVideo: 메타가 없으면 null", () => {
  assert.equal(extractOgVideo(mockDoc({})), null);
});
