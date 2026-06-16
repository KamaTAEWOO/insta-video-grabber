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

test("extractOgVideo: secure_url·og:video가 없으면 og:video:url로 폴백", () => {
  const doc = mockDoc({ "og:video:url": "https://cdn/url.mp4" });
  assert.equal(extractOgVideo(doc), "https://cdn/url.mp4");
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

const { extractEmbeddedVideoUrl } = require("../lib/extract.js");

// --- extractEmbeddedVideoUrl tests ---

test("extractEmbeddedVideoUrl: video_versions 배열에서 첫 번째 url 추출 + unescape", () => {
  const html = String.raw`"video_versions":[{"type":101,"width":720,"height":1280,"url":"https:\/\/cdn.cdninstagram.com\/v\/video.mp4?e=123&ccb=4"}]`;
  const result = extractEmbeddedVideoUrl(html);
  assert.equal(result, "https://cdn.cdninstagram.com/v/video.mp4?e=123&ccb=4");
});

test("extractEmbeddedVideoUrl: video_url 키로 폴백", () => {
  const html = String.raw`{"video_url":"https:\/\/cdn.cdninstagram.com\/v\/plain.mp4?e=1"}`;
  const result = extractEmbeddedVideoUrl(html);
  assert.equal(result, "https://cdn.cdninstagram.com/v/plain.mp4?e=1");
});

test("extractEmbeddedVideoUrl: playable_url_quality_hd 키로 폴백", () => {
  const html = String.raw`{"playable_url_quality_hd":"https:\/\/cdn.cdninstagram.com\/v\/hd.mp4?e=1"}`;
  const result = extractEmbeddedVideoUrl(html);
  assert.equal(result, "https://cdn.cdninstagram.com/v/hd.mp4?e=1");
});

test("extractEmbeddedVideoUrl: playable_url 키로 폴백", () => {
  const html = String.raw`{"playable_url":"https:\/\/cdn.cdninstagram.com\/v\/sd.mp4?e=1"}`;
  const result = extractEmbeddedVideoUrl(html);
  assert.equal(result, "https://cdn.cdninstagram.com/v/sd.mp4?e=1");
});

test("extractEmbeddedVideoUrl: \\u0026 유니코드 이스케이프된 &를 &로 푼다", () => {
  // Instagram은 보안상 URL의 &를 &(유니코드 이스케이프)로 인코딩한다.
  // NOTE: String.raw를 쓰면 소스의 &가 파싱 단계에서 &로 변환되어 false-positive가 된다.
  //       따라서 일반 문자열에 명시적 \\ 로 리터럴 백슬래시를 넣어 진짜 & / \/ 를 만든다.
  const html = '{"video_url":"https:\\/\\/cdn\\/v.mp4?a=1\\u0026b=2"}';
  const result = extractEmbeddedVideoUrl(html);
  assert.equal(result, "https://cdn/v.mp4?a=1&b=2");
});

test("extractEmbeddedVideoUrl: 어떤 키도 없으면 null", () => {
  assert.equal(extractEmbeddedVideoUrl("<html>no video keys here</html>"), null);
});

test("extractEmbeddedVideoUrl: null 입력 → null", () => {
  assert.equal(extractEmbeddedVideoUrl(null), null);
});

test("extractEmbeddedVideoUrl: video_versions 우선, video_url은 무시", () => {
  // Both keys present — video_versions wins (first priority)
  const html = String.raw`"video_versions":[{"url":"https:\/\/cdn.cdninstagram.com\/v\/versions.mp4"}]` +
    String.raw` "video_url":"https:\/\/cdn.cdninstagram.com\/v\/graphql.mp4"`;
  const result = extractEmbeddedVideoUrl(html);
  assert.equal(result, "https://cdn.cdninstagram.com/v/versions.mp4");
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

test("makeFilename: /tv/ ID로 파일명", () => {
  assert.equal(
    makeFilename("https://www.instagram.com/tv/XYZ789/"),
    "instagram_XYZ789.mp4"
  );
});

test("makeFilename: 매칭 실패 시 기본값", () => {
  assert.equal(makeFilename("https://www.instagram.com/"), "instagram_video.mp4");
});
