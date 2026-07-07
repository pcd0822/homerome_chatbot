# 학생용 멀티 LLM 탐구 챗봇

학생이 **Claude / GPT / Gemini** 중 모델을 골라 대화하는 학급용 챗봇입니다.
대화 내역은 **오직 브라우저(localStorage)에만** 저장되고(서버·DB 저장 없음),
AI가 만든 HTML 코드는 **바로 미리보기(라이브 프리뷰)** 할 수 있습니다.

- **프런트엔드**: Vite + React + TypeScript + Tailwind CSS
- **백엔드**: Netlify Functions (`netlify/functions/`) — API 프록시 전용
- **배포**: Netlify
- **저장소·DB 없음**: 대화는 전부 클라이언트 `localStorage`

> 언어에 대해: 요청서는 JavaScript를 예시로 들었지만, 기존 프로젝트가 이미
> 동작하는 TypeScript라서 타입 안전성을 유지하기 위해 TypeScript로 구현했습니다.

## 보안 설계 (핵심)

- **API 키는 프런트엔드 번들에 절대 포함되지 않습니다.** `VITE_*` 로 키를 노출하지 않습니다.
- 브라우저는 우리 Netlify Function(`/api/chat`)만 호출하고, **키는 함수 안(서버)에서만** 읽습니다.
- 프로바이더로는 **선택된 모델과 메시지 배열만** 전달합니다(학번 등 사용자 식별정보 미포함).
- 세 키는 서버 환경변수로만 읽습니다: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`.

빌드 산출물에 키가 없는지 확인:

```bash
npm run build
grep -R "sk-ant\|sk-proj\|AIza" dist/   # 아무것도 안 나와야 정상
```

## 로그인 (학번 + 개인 코드)

학생은 **학번과 개인 코드**를 함께 입력해야 접속합니다(다른 학생 학번만으로는 불가).
명부와 코드는 `src/data/roster.json` 에 하드코딩되어 있습니다. 인증에 이름은
사용하지 않습니다(이름은 환영 인사에만 표시).

## 로컬 실행

```bash
npm install
```

`.env.example` 을 복사해 `.env` 로 만들고 키를 채웁니다(사용할 모델의 키만 채워도 됨):

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
```

함수까지 함께 띄우려면 **`netlify dev`** 로 실행하세요(그래야 `/api/chat` 이 동작합니다):

```bash
npx netlify dev
```

`npm run dev`(Vite 단독)로도 화면은 뜨지만, `/api/*` 함수가 없어 전송 시 실패합니다.

## 배포 (Netlify)

1. GitHub 에 코드 푸시
2. Netlify → **New site from Git** → 저장소 연결
3. 빌드 설정은 `netlify.toml` 이 자동 적용 (Build: `npm run build`, Publish: `dist`, Functions: `netlify/functions`)
4. **Site settings → Environment variables** 에 키 3개 등록: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` (VITE_ 접두사 없이!)
5. 배포 후 재배포하면 키가 반영됩니다.

`/api/chat`, `/api/providers` 는 `netlify.toml` 의 리다이렉트로 함수에 매핑되어 있습니다.

## 소셜 공유 썸네일(OG 이미지)

`public/og_image/` 폴더의 **`og.png`**(1197×630)가 카카오톡·페북 등에 링크를 공유할 때
썸네일로 나옵니다. `index.html` 의 `og:image`/`twitter:image` 가 배포 도메인 절대
URL(`https://homechatbot.netlify.app/og_image/og.png`)을 가리킵니다. 이미지를 바꾸려면
같은 이름 `og.png` 로 덮어쓰세요. ⚠️ Windows 확장자 숨김 주의: 실제 파일 확장자와
`index.html` 의 경로가 일치해야 합니다(불일치 시 404 → 흰 박스) —
`public/og_image/README.md` 참고.

## 모델 교체 방법

`netlify/functions/lib/models.mts` 의 `MODELS` 객체에서 각 프로바이더의 `model` 값을
바꾸면 됩니다. 예를 들어 비용을 낮추려면 Claude 를 `claude-haiku-4-5` 로 교체하세요.

```ts
export const MODELS = {
  anthropic: { model: 'claude-opus-4-8', envKey: 'ANTHROPIC_API_KEY' }, // ← 여기서 교체
  openai:    { model: 'gpt-5',           envKey: 'OPENAI_API_KEY' },
  gemini:    { model: 'gemini-3.1-pro',  envKey: 'GEMINI_API_KEY' },
}
```

기본값은 Claude 최상위 모델(`claude-opus-4-8`)입니다. 학급 규모·비용에 맞게 조정하세요.

## 주요 기능

- **모델 선택**: 하단 칩에서 Claude/GPT/Gemini 선택. 키가 없는 모델은 비활성.
  대화 중간에 바꿔도 다음 메시지부터 이어서 적용됩니다.
- **스트리밍**: 답변이 실시간 표시(SSE). 렌더링을 ~50ms 로 묶고 스트리밍 중에는
  일반 텍스트로, 완료 시 마크다운으로 그려 부드럽게 표시. "중지" 버튼으로 취소.
- **파일 첨부**: 📎 버튼으로 이미지·PDF 업로드(파일당 4MB 이하). 업로드한 파일은
  **이 기기(localStorage)에만** 저장되며 서버 DB 에는 저장하지 않습니다.
  이미지는 세 모델 모두, PDF 는 Claude·Gemini 에서 인식합니다(GPT 는 이미지만).
- **최근 항목**: 좌측 사이드바에 대화 목록. 클릭해 이어보기, ✎ 이름변경, 🗑 삭제.
  첫 메시지로 제목 자동 생성.
- **코드 라이브 미리보기**: 코드블록에 언어 라벨·복사 버튼. `html` 코드블록은
  "미리보기" 탭에서 **샌드박스 iframe**(`sandbox="allow-scripts"`, `srcdoc`)으로 즉시 실행.
- **캔버스(문서 작성)**: 학생이 보고서·글·웹페이지 등 "문서 작성"을 요청하면, 답변의
  산출물이 **오른쪽 캔버스 패널**에 열립니다(웹페이지는 미리보기, 문서는 렌더링).
  캔버스에서 **PDF(브라우저 인쇄) · Word(.doc) · HTML · 마크다운(.md)** 으로 내려받을 수
  있습니다. (동작 규칙: 모델이 산출물을 ```html 또는 ```markdown 펜스로 감싸도록
  시스템 프롬프트가 유도 → 클라이언트가 이를 캔버스로 추출. `src/lib/artifact.ts`)
- **내보내기/가져오기**: 대화 기록을 JSON 으로 저장/복원.
- **모바일 반응형**: 사이드바 토글.

## 알려진 한계

- **키 노출은 없지만 호출량 제한(rate limit)** 은 각 프로바이더 계정 정책을 따릅니다.
  많은 학생이 동시에 쓰면 429(사용량 한도)가 날 수 있습니다 — 그때는 잠시 후 재시도.
- **함수 실행 시간**: Netlify Functions 기본 실행 시간 제한이 있어, 매우 긴 답변은
  중간에 끊길 수 있습니다(스트리밍이라 대부분 문제 없음).
- 대화는 기기 로컬 저장이라, 브라우저를 바꾸거나 데이터를 지우면 기록이 사라집니다.
- **첨부파일은 localStorage(약 5MB)에 base64 로 쌓입니다.** 큰 파일을 많이 올리면
  용량 한도에 걸려 오래된 기록 저장이 실패할 수 있으니, 필요 없는 대화는 삭제하세요.
- 첨부파일은 답변을 위해 해당 프로바이더로 전송됩니다(로컬 저장과 별개로, AI가
  읽으려면 전송이 필요). PDF 는 페이지 수만큼 토큰을 많이 써 rate limit 에 유의.
