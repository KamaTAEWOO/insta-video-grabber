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

const { collectVideoSrcs, extractFromDocument } = require("../lib/extract.js");

function mockVideoDoc(videoSrcs, metaMap) {
  const videos = videoSrcs.map((src) => ({
    src,
    querySelectorAll: () => [],
  }));
  return {
    querySelector(sel) {
      const m = sel.match(/property="([^"]+)"/);
      const key = m && m[1];
      if (key && metaMap && metaMap[key]) {
        return { getAttribute: () => metaMap[key] };
      }
      return null;
    },
    querySelectorAll(sel) {
      return sel === "video" ? videos : [];
    },
  };
}

test("collectVideoSrcs: video src들을 모은다", () => {
  const doc = mockVideoDoc(["https://cdn/a.mp4", ""]);
  assert.deepEqual(collectVideoSrcs(doc), ["https://cdn/a.mp4"]);
});

test("extractFromDocument: og:video가 있으면 그것을 선택", () => {
  const doc = mockVideoDoc(["blob:x"], { "og:video": "https://cdn/og.mp4" });
  assert.equal(extractFromDocument(doc), "https://cdn/og.mp4");
});

test("extractFromDocument: og가 없으면 video src로 폴백", () => {
  const doc = mockVideoDoc(["https://cdn/v.mp4"], {});
  assert.equal(extractFromDocument(doc), "https://cdn/v.mp4");
});

const { makeFilename } = require("../lib/extract.js");

test("makeFilename: /p/ 게시물 ID로 파일명", () => {
  assert.equal(
    makeFilename("https://www.instagram.com/p/DZE1ubJoHsB/?x=1"),
    "instagram_DZE1ubJoHsB.mp4"
  );
});

test("makeFilename: /reel/ ID로 파일명", () => {
  assert.equal(
    makeFilename("https://www.instagram.com/reel/ABC123/"),
    "instagram_ABC123.mp4"
  );
});

test("makeFilename: 매칭 실패 시 기본값", () => {
  assert.equal(makeFilename("https://www.instagram.com/"), "instagram_video.mp4");
});
