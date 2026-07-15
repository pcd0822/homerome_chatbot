# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

프로젝트 UI·주석·사용자 문자열은 전부 **한국어**입니다. 코드를 수정할 때 같은 언어를 유지하세요.

## 무엇인가

**학생용 멀티 LLM 탐구 챗봇** (`homerome-chatbot`, v0.2). 고등학생이 **Claude / GPT / Gemini** 중 모델을 골라 대화하는 학급용 챗봇(Claude는 **기본 Sonnet** / **고급 Opus** 두 칩으로 나뉨). 대화·첨부파일은 **오직 브라우저 `localStorage`에만** 저장되고 서버·DB는 없다. AI가 만든 문서·웹페이지는 오른쪽 "캔버스"에서 바로 미리보고 PDF/Word/HTML/MD로 내려받는다.

스택: Vite 5 + React 18 + TypeScript + Tailwind 3(프런트) / Netlify Functions(백엔드 = **API 프록시 전용**) / Netlify 배포.

## 명령어

```bash
npm install
npx netlify dev   # 개발은 반드시 이걸로 — /api/* 함수까지 함께 뜬다
npm run dev       # Vite 단독. 화면은 뜨지만 /api/* 가 없어 전송이 실패한다
npm run build     # tsc -b && vite build (실질적 타입체크 게이트)
npm run typecheck # tsc -b --noEmit
npm run preview   # 프로덕션 빌드 미리보기
```

테스트 스위트는 없다. `npm run build`가 TS 프로젝트 빌드를 돌리므로 비자명한 변경 후에는 이걸로 타입을 검증한다. Lint 스크립트는 없다.

빌드 산출물에 키가 새지 않았는지 확인: `npm run build` 후 `grep -R "sk-ant\|sk-proj\|AIza" dist/` — 아무것도 안 나와야 정상.

## 핵심 아키텍처

**보안이 이 프로젝트의 존재 이유다.** API 키는 **절대 프런트 번들에 들어가지 않는다** — `VITE_` 접두사 금지. 브라우저는 오직 `/api/chat`·`/api/providers`만 호출하고, 실제 프로바이더 키(`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`)는 **Netlify Function 안(서버 환경변수)에서만** 읽는다. 프로바이더로는 선택 모델과 메시지 배열만 전달하고 학번 등 식별정보는 보내지 않는다. 이 경계를 절대 무너뜨리지 말 것.

**요청 흐름 (한 번의 전송):**
```
ChatArea(입력·첨부) → App.handleSend → src/lib/api.streamChat
  → POST /api/chat (netlify.toml 리다이렉트) → netlify/functions/chat.mts
  → lib/llm.mts streamProvider (프로바이더 REST 스트리밍 직접 호출, SDK 없음)
  → SSE(delta/done/error) 역방향 → App 에서 ~50ms 로 묶어 렌더 → localStorage 저장
```

**상태 관리: 라우터·상태 라이브러리 없음.** `src/App.tsx` 한 곳이 `student` / `conversations` / `activeId` / `selectedProvider` / `artifact` 등 전체 상태를 `useState`로 들고 자식(Sidebar·ChatArea·Canvas)에 슬라이스로 내려준다.

**두 개의 provider 이름 공간 — 매핑을 반드시 유지할 것.** 클라이언트는 `'claude' | 'claude_opus' | 'openai' | 'gemini'`(`LlmProvider`, `src/types/index.ts`)를 쓰고, 서버는 `'anthropic' | 'anthropic_opus' | 'openai' | 'gemini'`(`Provider`, `netlify/functions/lib/models.mts`)를 쓴다. **Claude는 슬롯이 둘**: `claude↔anthropic`(기본=Sonnet), `claude_opus↔anthropic_opus`(고급=Opus). 두 서버 슬롯은 **같은 키(`ANTHROPIC_API_KEY`)를 공유**하고 호출 시 `model` ID만 다르다. 변환은 두 군데: 클라 → 서버는 `src/lib/api.ts`의 `CLIENT_TO_SERVER`, 서버 → 클라는 `netlify/functions/providers.mts`의 `TO_CLIENT`. provider를 추가/변경하면 이 매핑 두 개 + `src/types/index.ts`의 `PROVIDER_LABEL` + `ChatArea.tsx`의 `PROVIDERS` 칩 목록 + `models.mts`의 `MODELS`/`isProvider`/`PROVIDERS`를 모두 손봐야 한다.

**모델 교체 지점은 단 하나: `netlify/functions/lib/models.mts`의 `MODELS`.** 여기서 각 프로바이더의 `model` ID와 `maxTokens`(출력 토큰 상한)를 바꾼다. Claude는 `anthropic`(기본=`claude-sonnet-5`)과 `anthropic_opus`(고급=`claude-opus-4-8`) 두 항목이며, 저비용으로 낮추려면 기본을 `claude-haiku-4-5` 로 바꾼다. ⚠️ OpenAI/Gemini를 추론(reasoning/thinking) 모델로 바꾸면 첫 토큰이 늦어져 Netlify 함수 타임아웃(`ERR_EMPTY_RESPONSE`)이 날 수 있다 — 수업용은 비추론 모델 권장. 같은 파일에 공통 `SYSTEM_PROMPT`도 있는데, 여기서 **캔버스용 코드펜스 규칙**을 모델에 지시한다(아래 참조). Gemini는 `thinkingConfig.thinkingLevel`(3.x)을 쓴다 — 구형 2.5 계열로 되돌리면 `thinkingBudget`으로 바꿔야 한다.

**프로바이더 어댑터(`netlify/functions/lib/llm.mts`)**: 세 LLM의 REST 스트리밍을 공통 async generator(텍스트 delta만 흘림)로 정규화한다. `streamProvider`는 `anthropic`·`anthropic_opus` 둘 다 `streamAnthropic`으로 라우팅한다(같은 Anthropic API, `model`만 다름). 세 API의 요청 포맷·첨부 형식이 제각각이라 어댑터별로 분기한다 — Anthropic은 content block, OpenAI는 `image_url`/`file`, Gemini는 `inlineData`. `maxTokens`는 `StreamParams`로 전달되어 각각 `max_tokens`/`max_tokens`/`maxOutputTokens`에 꽂힌다. **CSV/XLSX 첨부는 base64가 아니라 평문(text)으로** 프롬프트 본문에 주입되어(`combinedText`) 세 모델 공통으로 읽힌다.

**첨부파일 처리 (`src/components/ChatArea.tsx`)**: 이미지·PDF는 브라우저에서 base64로, CSV·XLSX는 **SheetJS(`xlsx`)로 브라우저에서 평문 추출**(`xlsxToText`) 후 `kind:'text'` Attachment로 만든다. `Attachment`(`src/types/index.ts`)는 `image`/`pdf`/`text` 세 종류이고, base64/추출평문 모두 localStorage에 저장된다. 인식 지원: 이미지=세 모델, PDF=Claude·Gemini(GPT는 파일입력), CSV/XLSX=평문 주입이라 전 모델.

**캔버스(아티팩트) 파이프라인**: `SYSTEM_PROMPT`가 "완성된 문서/웹페이지는 하나의 코드펜스로 감싸라"고 모델을 유도 → 답변 완료 시 `src/lib/artifact.ts`의 `extractArtifact`가 마지막 ```` ```html ````(웹페이지) 또는 ```` ```markdown ````(문서) 펜스를 뽑아 `Canvas`를 연다. `Canvas.tsx`는 PDF(브라우저 `window.print` + `@media print`), Word(HTML을 `.doc`로 저장), HTML, MD로 내보낸다.

**로그인 = 학번 + 개인 코드 2-factor** (`src/lib/roster.ts`, 명부는 `src/data/roster.json`에 하드코딩). 이름은 인증에 쓰지 않고 환영 인사(`getVocativeName`으로 호격 조사 처리)에만 쓴다. 인증 통과 후 저장되는 `Student`에는 `code`를 담지 않는다.

**localStorage 스키마(`src/lib/storage.ts`)**: `chatbot.currentStudent`, `chatbot.selectedProvider`, `chatbot.uiState.sidebarCollapsed`, `chatbot.history.{studentId}`(학생별 대화 배열). 모든 접근은 quota/SecurityError를 흡수하는 `safeGet/safeSet` 래퍼를 거친다.

## 배포·환경 (Netlify)

- `netlify.toml`이 빌드(`npm run build`)·publish(`dist`)·functions 디렉터리와 `/api/*` → `/.netlify/functions/*` 리다이렉트, SPA 폴백을 잡는다. `/api` 규칙이 `/*` SPA 폴백보다 **먼저** 와야 한다.
- 로컬은 `.env`(gitignore됨)에 키를 채운다. `.env.example`이 템플릿 — **여기엔 절대 실제 키를 넣지 말 것**(placeholder만). 실제 키는 Netlify **Site settings → Environment variables**에 `VITE_` 없이 등록.
- 사용할 모델의 키만 채워도 된다 — `/api/providers`가 키 설정 여부만 알려주고, UI는 키 없는 모델을 비활성화한다(키 값 자체는 절대 클라로 내려오지 않음).
- OG 썸네일: `public/og_image/og.png`(1197×630)가 카카오톡·페북 공유 이미지. `index.html`의 `og:image`가 배포 도메인 절대 URL을 가리킨다. ⚠️ Windows 확장자 숨김 주의 — 실제 파일명과 경로가 어긋나면 404.

## 주의점

- **함수 타임아웃 vs 느린 첫 토큰**: `chat.mts`는 프로바이더 첫 토큰 전에 `: ok` SSE 주석을 먼저 흘려 빈 연결 종료(`ERR_EMPTY_RESPONSE`)를 막는다. 모델을 느린(추론) 것으로 바꿀 때 이 문제가 재발할 수 있다.
- **첨부 크기 상한**은 서버(`chat.mts`)에서도 재검증한다: base64 첨부 ~6MB(`MAX_ATTACH_BASE64`), 텍스트 첨부 ~200K자(`MAX_ATTACH_TEXT`). 클라(`ChatArea`)에도 별도 상한이 있으니 값을 바꾸면 양쪽을 맞출 것.
- **스트리밍 렌더링**은 토큰마다 하지 않고 `App.tsx`에서 ~50ms로 묶는다(매 토큰 setState + 마크다운 재파싱 방지). 스트리밍 중엔 평문, 완료 시 마크다운으로 그린다. localStorage 저장은 스트리밍 종료 후 한 번만.
- **`MessageBubble`은 `React.memo`로 감싸져 있다.** 스트리밍 중 50ms마다 전체 대화가 갱신돼도 완료된 말풍선은 `message` 참조가 유지되어 재렌더(=마크다운 재파싱)를 건너뛴다. 이 memo를 벗기면 대화가 길수록 스트리밍이 버벅인다. 기본 shallow 비교가 성립하려면 `message`/`studentName`/`streaming`/`onOpenArtifact` 참조가 안정적이어야 한다(`onOpenArtifact`=App의 `setArtifact`).
- **출력 토큰 상한은 프로바이더별 `maxTokens`(`models.mts`)** 이다. 예전 단일 `MAX_TOKENS` 상수는 제거됐고 Claude·Gemini엔 `max_tokens`/`maxOutputTokens`, OpenAI엔 `max_tokens`로 모두 적용된다. 값을 키우면 아주 긴 답변의 스트리밍 시간이 늘어 Netlify 실행시간 한도에 걸릴 수 있으니, 긴 답이 끊기면 이 값을 낮춘다. (OpenAI를 gpt-5/o1 등 추론 모델로 바꾸면 `max_tokens` 대신 `max_completion_tokens`를 요구한다.)
- **로컬 타입체크의 `xlsx` 에러는 환경 문제다.** `npm run typecheck`가 `ChatArea.tsx`의 `xlsx` 모듈을 못 찾는 2건 에러는 `node_modules/xlsx` 미설치 때문(`npm install`로 해소). Netlify는 배포 시 설치하므로 빌드가 통과한다.

## 작업 내역 (2026-07 세션)

이 세션에서 반영된 변경 요약. 세부 동작은 위 아키텍처·주의점 참고.

1. **응답 끊김(글자수 리밋) 해제** — 단일 `MAX_TOKENS = 4096` 상수를 없애고 `MODELS`에 프로바이더별 `maxTokens: 16000`을 추가. Claude(`max_tokens`)·Gemini(`maxOutputTokens`)뿐 아니라 이전엔 상한이 없던 OpenAI에도 `max_tokens` 적용. (`models.mts`, `llm.mts`, `chat.mts`)
2. **스트리밍 버벅임 해결** — `MessageBubble`을 `React.memo`로 감싸, 스트리밍 중 완료된 말풍선의 마크다운 재파싱을 차단(대화가 길수록 커지던 지연 제거). (`MessageBubble.tsx`)
3. **Claude 기본/고급 2선택 도입** — Claude 슬롯을 `anthropic`(기본=`claude-sonnet-5`)과 `anthropic_opus`(고급=`claude-opus-4-8`)로 분리. 학생이 하단 칩에서 "Claude"(기본)와 "Claude 고급"(복잡한 작업용)을 고른다. 기본 선택은 Sonnet. 두 슬롯은 `ANTHROPIC_API_KEY` 공유. (`models.mts`, `llm.mts`, `providers.mts`, `types/index.ts`, `lib/api.ts`, `ChatArea.tsx`)
   - 비용: Sonnet 5는 Opus 4.8 대비 입·출력 40% 저렴(도입 프로모 기간 60%), Haiku 4.5는 80% 저렴.
4. **모델 칩 툴팁** — `ChatArea.tsx`의 `PROVIDER_HINT` 맵으로 활성 칩 마우스오버에 "안내문구 · 모델ID"를 표시(현재 `claude_opus` = "복잡한 작업용 · 비용 높음 · claude-opus-4-8"). 문구가 없는 칩은 모델 ID만 표시.
5. **README 동기화** — "모델 교체 방법" 절을 2-슬롯 Claude + `maxTokens` 구조로 갱신.
