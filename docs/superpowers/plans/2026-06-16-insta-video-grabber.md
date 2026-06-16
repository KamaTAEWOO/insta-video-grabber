# Insta Video Grabber 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 인스타그램 피드(`/p/`)·릴스(`/reel/`) 영상을 아이콘 클릭 팝업에서 다운로드하는 Manifest V3 크롬 확장을 만든다.

**Architecture:** 빌드 없는 바닐라 JS. 순수 추출 로직(`lib/extract.js`)을 content script(`content.js`)가 페이지에서 사용하고, 팝업(`popup.js`)이 추출 결과를 받아 `chrome.downloads`로 저장한다. 추출은 `og:video`/`<video>` 파싱(A) → `PerformanceObserver`가 잡은 `.mp4` 리소스(B) 폴백.

**Tech Stack:** Manifest V3, 바닐라 JS(ES2020), Node.js 내장 테스트 러너(`node --test`, 외부 의존성 0).

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `manifest.json` | MV3 설정: action 팝업, content_scripts, 권한 |
| `lib/extract.js` | 순수 함수: `pickBestUrl` · `extractOgVideo` · `collectVideoSrcs` · `extractFromDocument` · `makeFilename` |
| `content.js` | 페이지에 주입 — `PerformanceObserver`로 `.mp4` 캡처(B), 팝업의 `EXTRACT_VIDEO` 메시지에 응답 |
| `popup.html` / `popup.css` / `popup.js` | 팝업 UI — 추출 요청 → 다운로드 |
| `icons/16.png` · `48.png` · `128.png` | 툴바 아이콘 |
| `tests/extract.test.js` | `lib/extract.js` 순수 함수 단위 테스트 |
| `README.md` | 설치·사용법 |

**권한(최소):** `permissions: ["downloads"]`, `host_permissions: ["https://www.instagram.com/*"]`. 정적 content_scripts라 `scripting`/`activeTab` 불필요. background service worker 없음(팝업이 직접 다운로드).

---

## Task 1: 프로젝트 스캐폴드

**Files:**
- Create: `package.json`, `.gitignore`

- [ ] **Step 1: 폴더 이동 및 git 초기화**

```bash
cd /Volumes/samsung/webWork/insta-video-grabber
git init
```

> 사용자가 git 버전관리를 원치 않으면 이 단계와 이후 모든 `git commit` 단계를 생략한다.

- [ ] **Step 2: `package.json` 생성**

```json
{
  "name": "insta-video-grabber",
  "version": "0.1.0",
  "private": true,
  "description": "공개 인스타그램 피드/릴스 영상 다운로드 크롬 확장 (개인용)",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 3: `.gitignore` 생성**

```
node_modules/
.DS_Store
*.zip
```

- [ ] **Step 4: 커밋**

```bash
git add package.json .gitignore
git commit -m "chore: scaffold insta-video-grabber project"
```

---

## Task 2: `pickBestUrl` (순수 함수, TDD)

후보 URL 배열에서 다운로드할 1개를 고른다. `blob:`은 제외(직접 다운로드 불가), `.mp4` 우선.

**Files:**
- Create: `lib/extract.js`
- Test: `tests/extract.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/extract.test.js`:

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test`
Expected: FAIL — "Cannot find module '../lib/extract.js'"

- [ ] **Step 3: 최소 구현**

`lib/extract.js`:

```js
function pickBestUrl(candidates) {
  const valid = (candidates || []).filter(
    (u) => typeof u === "string" && u.length > 0 && !u.startsWith("blob:")
  );
  const mp4 = valid.find((u) => u.includes(".mp4"));
  return mp4 || valid[0] || null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { pickBestUrl };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/extract.js tests/extract.test.js
git commit -m "feat: add pickBestUrl candidate selection"
```

---

## Task 3: `extractOgVideo` (순수 함수, TDD)

document-like 객체에서 `og:video` 계열 메타태그의 영상 URL을 읽는다.

**Files:**
- Modify: `lib/extract.js`
- Test: `tests/extract.test.js`

- [ ] **Step 1: 실패 테스트 추가**

`tests/extract.test.js`에 추가:

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test`
Expected: FAIL — `extractOgVideo` is not a function

- [ ] **Step 3: 구현 추가**

`lib/extract.js`에 함수 추가하고 exports 갱신:

```js
function extractOgVideo(doc) {
  const selectors = [
    'meta[property="og:video:secure_url"]',
    'meta[property="og:video"]',
    'meta[property="og:video:url"]',
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const content = el.getAttribute("content");
      if (content) return content;
    }
  }
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { pickBestUrl, extractOgVideo };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/extract.js tests/extract.test.js
git commit -m "feat: add extractOgVideo meta parsing"
```

---

## Task 4: `collectVideoSrcs` + `extractFromDocument` (순수 함수, TDD)

`<video>`/`<source>`의 src를 모으고, og:video와 합쳐 최종 URL을 고른다.

**Files:**
- Modify: `lib/extract.js`
- Test: `tests/extract.test.js`

- [ ] **Step 1: 실패 테스트 추가**

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test`
Expected: FAIL — `collectVideoSrcs` is not a function

- [ ] **Step 3: 구현 추가**

```js
function collectVideoSrcs(doc) {
  const out = [];
  const videos = doc.querySelectorAll ? doc.querySelectorAll("video") : [];
  for (const v of videos) {
    if (v.src) out.push(v.src);
    const sources = v.querySelectorAll ? v.querySelectorAll("source") : [];
    for (const s of sources) if (s.src) out.push(s.src);
  }
  return out;
}

function extractFromDocument(doc) {
  const candidates = [];
  const og = extractOgVideo(doc);
  if (og) candidates.push(og);
  candidates.push(...collectVideoSrcs(doc));
  return pickBestUrl(candidates);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { pickBestUrl, extractOgVideo, collectVideoSrcs, extractFromDocument };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/extract.js tests/extract.test.js
git commit -m "feat: add collectVideoSrcs and extractFromDocument"
```

---

## Task 5: `makeFilename` (순수 함수, TDD)

게시물 URL에서 다운로드 파일명을 만든다.

**Files:**
- Modify: `lib/extract.js`
- Test: `tests/extract.test.js`

- [ ] **Step 1: 실패 테스트 추가**

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test`
Expected: FAIL — `makeFilename` is not a function

- [ ] **Step 3: 구현 추가**

```js
function makeFilename(pageUrl) {
  const m = (pageUrl || "").match(/\/(p|reel|tv)\/([^/?#]+)/);
  const id = m ? m[2] : "video";
  return `instagram_${id}.mp4`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    pickBestUrl, extractOgVideo, collectVideoSrcs, extractFromDocument, makeFilename,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test`
Expected: PASS (12 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/extract.js tests/extract.test.js
git commit -m "feat: add makeFilename"
```

---

## Task 6: `manifest.json`

**Files:**
- Create: `manifest.json`

- [ ] **Step 1: manifest 작성**

```json
{
  "manifest_version": 3,
  "name": "Insta Video Grabber",
  "version": "0.1.0",
  "description": "공개 인스타그램 피드/릴스 영상을 다운로드합니다 (개인용).",
  "action": {
    "default_popup": "popup.html",
    "default_title": "인스타 영상 다운로드"
  },
  "permissions": ["downloads"],
  "host_permissions": ["https://www.instagram.com/*"],
  "content_scripts": [
    {
      "matches": ["https://www.instagram.com/*"],
      "js": ["lib/extract.js", "content.js"],
      "run_at": "document_start"
    }
  ]
}
```

> `lib/extract.js`를 content script 배열의 **앞**에 두어 `content.js`가 전역 함수(`extractFromDocument` 등)를 쓸 수 있게 한다. (브라우저에선 `module.exports` 분기가 false라 전역으로 로드됨.) 아이콘은 Task 9에서 추가.

- [ ] **Step 2: 커밋**

```bash
git add manifest.json
git commit -m "feat: add MV3 manifest"
```

---

## Task 7: `content.js`

페이지에 주입되어 `.mp4` 리소스를 `PerformanceObserver`로 캡처(B)하고, 팝업의 추출 요청에 응답한다.

**Files:**
- Create: `content.js`

- [ ] **Step 1: content.js 작성**

```js
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
```

- [ ] **Step 2: 커밋**

```bash
git add content.js
git commit -m "feat: add content script with A->B extraction"
```

> 자동 테스트 없음(브라우저 API 의존) — Task 10 수동 E2E에서 검증한다.

---

## Task 8: 팝업 (`popup.html` / `popup.css` / `popup.js`)

**Files:**
- Create: `popup.html`, `popup.css`, `popup.js`

- [ ] **Step 1: `popup.html` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <main class="card">
    <h1 class="title">📥 인스타 영상 다운로드</h1>
    <p id="status" class="status">영상을 찾는 중…</p>
    <button id="download" class="btn" disabled>⬇ 다운로드</button>
  </main>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: `popup.css` 작성** (다크, calm·명료)

```css
:root {
  --bg: #0F1115;
  --surface: #1A1D24;
  --text: #E8EAED;
  --muted: #9AA0AB;
  --accent: #B4E600;
  --radius: 12px;
}
* { box-sizing: border-box; }
body { margin: 0; width: 320px; font-family: -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--text); }
.card { padding: 16px; }
.title { font-size: 16px; margin: 0 0 12px; }
.status { font-size: 14px; color: var(--muted); min-height: 20px; margin: 0 0 16px; word-break: break-all; }
.btn {
  width: 100%; padding: 12px; font-size: 14px; font-weight: 600;
  color: #0F1115; background: var(--accent); border: none;
  border-radius: 8px; cursor: pointer; transition: opacity 150ms;
}
.btn:hover:not(:disabled) { opacity: 0.85; }
.btn:disabled { background: var(--surface); color: var(--muted); cursor: not-allowed; }
```

- [ ] **Step 3: `popup.js` 작성**

```js
const btn = document.getElementById("download");
const statusEl = document.getElementById("status");

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
```

> `makeFilename`은 `lib/extract.js`와 동일 로직을 팝업 컨텍스트에 복제한다(팝업은 content script 전역을 공유하지 않으므로). 두 곳이 일치하는지 Task 10에서 확인.

- [ ] **Step 4: 커밋**

```bash
git add popup.html popup.css popup.js
git commit -m "feat: add popup UI and download flow"
```

---

## Task 9: 아이콘 + README

**Files:**
- Create: `icons/16.png`, `icons/48.png`, `icons/128.png`, `README.md`
- Modify: `manifest.json`

- [ ] **Step 1: 단색 아이콘 생성**

macOS `sips`로 단색 정사각형 png를 만든 뒤 크기별로 리사이즈한다(임시 아이콘):

```bash
mkdir -p icons
# 128px 라임색 단색 PNG를 Python 표준 라이브러리로 생성 (의존성 없음)
python3 - <<'PY'
import struct, zlib
def png(path, size, rgb):
    raw = b''.join(b'\x00' + bytes(rgb) * size for _ in range(size))
    def chunk(t, d): 
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw)
    open(path,'wb').write(sig + chunk(b'IHDR',ihdr) + chunk(b'IDAT',idat) + chunk(b'IEND',b''))
for s in (16,48,128):
    png(f'icons/{s}.png', s, (180,230,0))
print('icons created')
PY
```

Expected: `icons created`, 3개 png 생성.

- [ ] **Step 2: `manifest.json`에 아이콘 추가**

`action`에 `default_icon`을, 최상위에 `icons`를 추가:

```json
  "action": {
    "default_popup": "popup.html",
    "default_title": "인스타 영상 다운로드",
    "default_icon": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" }
  },
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" },
```

- [ ] **Step 3: `README.md` 작성**

````markdown
# Insta Video Grabber

공개 인스타그램 피드(`/p/`)·릴스(`/reel/`) 영상을 다운로드하는 크롬 확장 (개인용).

## 설치 (개발자 모드)
1. 크롬에서 `chrome://extensions` 열기
2. 우상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램 로드** → 이 폴더 선택
4. 툴바에 아이콘 생성 (📌 고정 권장)

## 사용
1. 인스타그램 영상 게시물(`/p/`) 또는 릴스(`/reel/`) 열기
2. 영상이 안 잡히면 한 번 **재생**
3. 확장 **아이콘 클릭** → 팝업의 **다운로드** 버튼
4. 다운로드 폴더에 `instagram_<id>.mp4` 저장

## 테스트
```bash
npm test   # node --test
```

## 한계
- 스토리·비공개·캐러셀 다중영상·blob 분할 스트리밍은 미지원.
- 인스타 구조 변경 시 추출이 깨질 수 있음.

## 주의
메타(인스타그램) 약관상 무단 다운로드는 회색지대입니다. 개인용·본인 콘텐츠 백업 용도로만 사용하세요. 크롬 웹스토어 공개 배포는 정책 위험이 있습니다.
````

- [ ] **Step 4: 커밋**

```bash
git add icons README.md manifest.json
git commit -m "feat: add icons and README"
```

---

## Task 10: 수동 E2E 검증 (구현 1단계 검증 항목 포함)

자동 테스트로 못 잡는 실제 동작을 확인한다. **스펙 §10 검증 항목을 여기서 실측한다.**

**Files:** 없음 (수동 + 필요 시 수정)

- [ ] **Step 1: 확장 로드**

`chrome://extensions` → 개발자 모드 → 압축해제 로드 → 콘솔에 에러 없는지 확인.

- [ ] **Step 2: 검증 A — `og:video` 실노출 여부**

공개 피드 영상(`/p/...`)을 열고, 페이지에서 콘솔에 다음을 실행:

```js
document.querySelector('meta[property="og:video"]')?.content
```

Expected: `.mp4` URL이 나오면 방법 A 동작. `null`이면 방법 B(PerformanceObserver) 의존 — 영상 재생 후 재확인.

- [ ] **Step 3: 검증 B — 피드 영상 다운로드**

`/p/` 영상 페이지에서 아이콘 클릭 → 다운로드 → 파일이 재생되는지 확인.

- [ ] **Step 4: 검증 C — 릴스 다운로드**

`/reel/` 페이지에서 동일 확인. og:video가 없으면 한 번 재생 후 시도(B 경로).

- [ ] **Step 5: 검증 D — blob 한계 확인**

추출 URL이 `blob:`만 잡히는 케이스가 있으면, 팝업이 "영상을 못 찾았어요" 안내를 내는지 확인(무한 시도 없이).

- [ ] **Step 6: 결과 기록 및 보정**

검증 결과(A/B 어느 경로가 실제로 동작했는지, 릴스 대응 여부)를 README "한계"에 반영하고, 필요 시 `content.js`의 캡처 정규식·셀렉터를 보정한 뒤 커밋.

```bash
git add -A
git commit -m "test: manual E2E verification and adjustments"
```

---

## 검증(Verify) 단계 연결

구현 완료 후 flow의 `verification-before-completion`으로 넘어가, **스크린샷(팝업 + 실제 다운로드된 파일)**과 `design-2026.md §6` 체크리스트로 "작동 증거"를 제시한 뒤에만 완료를 선언한다. "코드상 됨"이 아니라 **눈으로 확인한 것만** 완료로 보고한다.
