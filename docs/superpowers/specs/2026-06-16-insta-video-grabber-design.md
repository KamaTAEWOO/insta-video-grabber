# 인스타그램 영상 다운로드 크롬 확장 — 설계 문서

- **날짜:** 2026-06-16
- **상태:** 승인됨 (사용자 스펙 리뷰 대기)
- **유형:** 신규 프로젝트 (`/Volumes/samsung/webWork/insta-video-grabber`)

## 1. 배경 / 동기

`/watch` 스킬이 인스타그램 영상을 다운로드하는 것을 보고, 그 "영상 추출" 기능을 브라우저에서 바로 쓰는 크롬 확장으로 만든다. `/watch`는 서버사이드 `yt-dlp`를 쓰지만, 크롬 확장은 브라우저 JS만 가능하므로 페이지에서 직접 영상 URL을 찾아내는 방식으로 구현한다.

## 2. 목표 (MVP 범위)

- **형태:** 크롬 확장 (Manifest V3).
- **트리거:** 인스타 영상 페이지에서 확장 **아이콘 클릭 → 팝업**의 "현재 영상 다운로드" 버튼.
- **범위:** 공개 **피드 영상(`/p/`) + 릴스(`/reel/`)**.
- **추출:** `og:video` 메타·`<video>` src 파싱(A) → 실패 시 네트워크 가로채기(B) 폴백.
- **로컬 전용:** 외부 서버로 아무것도 전송하지 않음. 로그인 쿠키·세션 건드리지 않음.

## 3. 비목표 (MVP 제외 — 이후 확장 후보)

- 스토리 / 비공개 게시물
- 캐러셀 내 다중 영상 선택
- 일괄(batch) 다운로드
- blob/MSE 분할 스트리밍 완전 대응

## 4. 아키텍처

빌드 도구 없는 바닐라 MV3 구조:

```
insta-video-grabber/
├── manifest.json              # Manifest V3
├── popup.html / popup.css / popup.js   # "현재 영상 다운로드" UI
├── content.js                 # 현재 탭 DOM에서 og:video·<video> src 추출 (방법 A)
├── background.js              # .mp4 CDN 요청 가로채기·탭별 캐시 (방법 B) + 다운로드
├── lib/extract.js             # URL 추출 순수 함수 (테스트 대상)
└── icons/                     # 16 · 48 · 128
```

### 컴포넌트 경계 (단위 테스트 가능성)

- `lib/extract.js`: `extractOgVideo(doc)`(문서 → og:video URL), `pickBestUrl(candidates)`(후보 URL 배열 → 최적 1개) — **순수 함수**, DOM·네트워크와 분리. 테스트 용이.
- `content.js`: 현재 페이지 DOM을 읽어 `extract.js`에 넘기는 글루.
- `background.js`: 네트워크 캡처(부수효과) + `chrome.downloads` 오케스트레이션.
- `popup.js`: UI·이벤트 글루.

## 5. 데이터 흐름 (A→B 하이브리드)

1. `background.js`가 인스타 탭의 미디어 요청(`https://*.cdninstagram.com/*.mp4` 등)을 **탭별로 캐시**한다 (방법 B, 백그라운드 상시).
2. 사용자가 영상 페이지에서 **확장 아이콘 클릭** → 팝업 열림.
3. `popup.js` → `content.js`에 "현재 영상 URL 추출" 요청.
4. `content.js`: `meta[property="og:video"]` / `meta[property="og:video:secure_url"]` / `<video>` src를 읽어 `extract.js`로 후보 산출 (방법 A).
5. **A가 비면** background가 잡아둔 네트워크 URL로 폴백 (방법 B).
6. 팝업에 썸네일 + 파일명 + **다운로드 버튼** 표시 → `chrome.downloads.download({ url, filename })`로 저장.

## 6. 권한 (manifest, 최소 원칙)

- `host_permissions`: `https://www.instagram.com/*`, `https://*.cdninstagram.com/*`
- `permissions`: `activeTab`, `downloads`, `scripting`, + 방법 B용 `webRequest` 또는 `declarativeNetRequest`(§10에서 적합한 쪽 확정)
- 외부 호스트로 데이터 전송 없음. 권한은 위 도메인으로 한정.

## 7. 팝업 UI (다크, 심플 — calm·명료)

```
┌─ 📥 인스타 영상 다운로드 ──┐
│  [   영상 썸네일 미리보기  ] │
│  파일명: reel_DZE1u.mp4     │
│        [  ⬇ 다운로드  ]     │
└─────────────────────────────┘
```

- **상태:** 다운로드 버튼에 default/hover/loading/disabled. 추출 중 스피너.
- **영상 페이지 아님:** "인스타그램 영상 페이지에서 열어주세요"
- **추출 실패:** "영상을 못 찾았어요. **영상을 한 번 재생**한 뒤 다시 시도" (방법 B는 재생해야 URL이 잡힘)

## 8. 에러 처리

| 상황 | 처리 |
|---|---|
| 인스타 페이지 아님 | 안내 + 버튼 비활성 |
| 영상 URL 못 찾음 | "재생 후 재시도" 안내 |
| blob/MSE만 잡힘 | "이 영상은 직접 추출이 어렵습니다" — 무한 시도 금지, 정직하게 표시 |
| 다운로드 실패 | 재시도 버튼 |

## 9. 보안 / 프라이버시

- 모든 처리는 로컬. 영상 URL·페이지 내용을 외부로 전송하지 않음.
- 인스타 로그인 세션/쿠키를 읽거나 변형하지 않음.
- `host_permissions`를 instagram.com + cdninstagram.com으로 한정.

## 10. 검증 항목 / 열린 질문 (구현 1단계에서 실측)

- **`og:video` 실제 노출 여부** — 2026년 현재 공개 피드/릴스에서 메타태그로 .mp4가 나오는지 실제 게시물로 확인. *(현재는 추측)*
- **MV3 네트워크 캡처 방식** — `.mp4` URL 포착에 `webRequest`(observe)와 `declarativeNetRequest` 중 어느 쪽이 적합한지 확인.
- **blob/MSE 한계** — 분할 스트리밍만 잡히는 케이스의 처리 경계.

## 11. 테스트 전략 (TDD)

- `lib/extract.js`: `extractOgVideo(doc)`(메타태그 있는/없는 문서), `pickBestUrl(candidates)`(빈 배열·다중 후보·blob 제외) 순수 함수 단위 테스트.
- 수동 E2E: 공개 피드 영상 + 릴스에서 아이콘 클릭 → 추출 → 다운로드 → 파일 재생 확인.

## ⚖️ ToS · 저작권 노트

메타 약관은 무단 다운로드·스크래핑을 금지한다. **개인용/본인 콘텐츠 백업**은 회색지대로 일반적이나, 배포·공유 및 크롬 웹스토어 공개 등록은 정책 위험이 있다. 본 프로젝트는 개인 학습·사용 목적으로 진행한다.
