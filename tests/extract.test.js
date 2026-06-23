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

const { shortcodeToMediaId } = require("../lib/extract.js");

// --- shortcodeToMediaId tests ---
// Base64 alphabet: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_
// A=0, B=1, ..., Z=25, a=26, ..., z=51, 0=52, ..., 9=61, -=62, _=63
// Each character contributes: id = id * 64 + charIndex

test("shortcodeToMediaId: 단일 문자 A → 0", () => {
  // A is index 0; result is 0
  assert.equal(shortcodeToMediaId("A"), "0");
});

test("shortcodeToMediaId: 단일 문자 B → 1", () => {
  // B is index 1
  assert.equal(shortcodeToMediaId("B"), "1");
});

test("shortcodeToMediaId: BA → 64 (1*64 + 0)", () => {
  // B=1, A=0 → 1*64 + 0 = 64
  assert.equal(shortcodeToMediaId("BA"), "64");
});

test("shortcodeToMediaId: BB → 65 (1*64 + 1)", () => {
  // B=1, B=1 → 1*64 + 1 = 65
  assert.equal(shortcodeToMediaId("BB"), "65");
});

test("shortcodeToMediaId: _ → 63 (알파벳 마지막 문자)", () => {
  // _ is the last character at index 63
  assert.equal(shortcodeToMediaId("_"), "63");
});

test("shortcodeToMediaId: - → 62 (끝에서 두 번째 문자)", () => {
  // - is at index 62
  assert.equal(shortcodeToMediaId("-"), "62");
});

test("shortcodeToMediaId: 실제 숏코드 DZE1ubJoHsB → 올바른 숫자 ID", () => {
  // Confirmed by running the function: 3910486663177992961
  assert.equal(shortcodeToMediaId("DZE1ubJoHsB"), "3910486663177992961");
});

test("shortcodeToMediaId: 잘못된 문자(!) → null", () => {
  assert.equal(shortcodeToMediaId("!"), null);
});

test("shortcodeToMediaId: 잘못된 문자가 중간에 있으면 → null", () => {
  assert.equal(shortcodeToMediaId("AB!C"), null);
});

test("shortcodeToMediaId: 빈 문자열 → 0", () => {
  // No iterations: id stays 0n → "0"
  assert.equal(shortcodeToMediaId(""), "0");
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

test("makeFilename: /reels/ (릴스 탭 복수형) ID로 파일명", () => {
  // 릴스 탭 URL은 /reels/<id>/ 형태 — 이걸 인식 못 하면 instagram_video.mp4로 떨어진다.
  assert.equal(
    makeFilename("https://www.instagram.com/reels/DZ6JLhuPHQ2/"),
    "instagram_DZ6JLhuPHQ2.mp4"
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

const { extractVideoUrlForShortcode } = require("../lib/extract.js");

// --- extractVideoUrlForShortcode tests ---
// 버그: Instagram은 SPA라 content.js가 한 번만 로드되고, 본 영상들의 데이터가
// innerHTML에 누적된다. 전역 첫 매칭(extractEmbeddedVideoUrl)은 "먼저 박힌(이전)
// 영상"을 집어 잘못된 영상을 다운로드시킨다. 현재 주소의 shortcode를 닻으로 삼아
// "지금 보는 영상"에 속한 URL만 골라내야 한다.

test("extractVideoUrlForShortcode: 여러 영상이 섞인 HTML에서 현재 shortcode의 영상을 고른다", () => {
  // 영상 A(코드 AAA111)가 먼저, 영상 B(코드 BBB222)가 뒤에 박힌 페이지.
  // 사용자가 보는 건 B. 전역 첫 매칭이면 A가 잡히는 버그 → shortcode 앵커링으로 B를 골라야 한다.
  const html = String.raw`{"code":"AAA111","video_versions":[{"url":"https:\/\/cdn\/A.mp4"}]} ` +
    String.raw`{"code":"BBB222","video_versions":[{"url":"https:\/\/cdn\/B.mp4?e=1&ccb=2"}]}`;
  assert.equal(
    extractVideoUrlForShortcode(html, "BBB222"),
    "https://cdn/B.mp4?e=1&ccb=2"
  );
});

test("extractVideoUrlForShortcode: code가 video_versions 뒤에 와도 현재 영상을 고른다", () => {
  // JSON 키 순서는 불확정 — code가 video_versions 뒤에 올 수 있다.
  const html = String.raw`{"video_versions":[{"url":"https:\/\/cdn\/A.mp4"}],"code":"AAA111"} ` +
    String.raw`{"video_versions":[{"url":"https:\/\/cdn\/B.mp4"}],"code":"BBB222"}`;
  assert.equal(extractVideoUrlForShortcode(html, "BBB222"), "https://cdn/B.mp4");
});

test("extractVideoUrlForShortcode: shortcode를 HTML에서 못 찾으면 전역 첫 매칭으로 폴백", () => {
  const html = String.raw`{"video_versions":[{"url":"https:\/\/cdn\/first.mp4"}]}`;
  assert.equal(
    extractVideoUrlForShortcode(html, "NOTINPAGE"),
    "https://cdn/first.mp4"
  );
});

test("extractVideoUrlForShortcode: shortcode가 없으면(null) 전역 첫 매칭", () => {
  const html = String.raw`{"video_versions":[{"url":"https:\/\/cdn\/x.mp4"}]}`;
  assert.equal(extractVideoUrlForShortcode(html, null), "https://cdn/x.mp4");
});

test("extractVideoUrlForShortcode: null HTML → null", () => {
  assert.equal(extractVideoUrlForShortcode(null, "BBB222"), null);
});

const { pickCurrentMp4 } = require("../lib/extract.js");

// --- pickCurrentMp4 tests ---
// 릴스 버그: content.js가 페이지 로드 시점의 '첫 화면' mp4(capturedMp4[0])를 집어
// 릴스를 넘겨도 첫 영상만 받아진다. 현재 보는 영상은 '가장 최근에' 로드되므로,
// 누적 배열의 뒤(최근)부터 골라야 한다. init segment(수백 B 헤더 파일)는 건너뛴다.
// 입력: [{ url, size }] (size = 바이트 전송량).

test("pickCurrentMp4: 가장 최근(마지막)에 로드된 mp4를 고른다 — 첫 화면 고착 방지", () => {
  const entries = [
    { url: "https://cdn/first.mp4", size: 800000 },
    { url: "https://cdn/current.mp4", size: 900000 },
  ];
  assert.equal(pickCurrentMp4(entries), "https://cdn/current.mp4");
});

test("pickCurrentMp4: init segment(작은 파일)는 건너뛰고 실제 영상을 고른다", () => {
  const entries = [
    { url: "https://cdn/real.mp4", size: 700000 },
    { url: "https://cdn/init.mp4", size: 818 },
  ];
  assert.equal(pickCurrentMp4(entries), "https://cdn/real.mp4");
});

test("pickCurrentMp4: blob은 제외한다", () => {
  const entries = [
    { url: "blob:https://x", size: 900000 },
    { url: "https://cdn/v.mp4", size: 700000 },
  ];
  assert.equal(pickCurrentMp4(entries), "https://cdn/v.mp4");
});

test("pickCurrentMp4: 빈 입력 → null", () => {
  assert.equal(pickCurrentMp4([]), null);
  assert.equal(pickCurrentMp4(undefined), null);
});

test("pickCurrentMp4: 모두 작은 파일이면 그래도 최근 mp4를 반환(완전 실패 방지)", () => {
  const entries = [
    { url: "https://cdn/a.mp4", size: 800 },
    { url: "https://cdn/b.mp4", size: 900 },
  ];
  assert.equal(pickCurrentMp4(entries), "https://cdn/b.mp4");
});
