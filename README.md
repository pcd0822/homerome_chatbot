# homerome_chatbot — 학급 전용 멀티 LLM 챗봇

중학교 한 학급(예: 3학년 5반)이 사용하는 **클라이언트 사이드 단독 동작** 챗봇 웹앱입니다.
서버/DB가 없습니다. 학생 명부는 정적 JSON, API 키와 Drive 인증 정보는 **빌드 시점 환경 변수**(Netlify)로 주입됩니다.

- 학번 입력 → 명부에서 이름 조회 → "안녕 OOO!" 다정한 호격 인사로 대화 시작
- 입력창 위에서 **Claude / Gemini / OpenAI** 중 모델 선택 (등록된 키가 있는 모델만 활성화)
- 학급 **Google Drive 폴더**의 자료를 자동으로 참고 (Claude는 PDF 내용까지 첨부)
- 대화 스타터 버튼 4종으로 자주 쓰는 흐름 한 번에 실행
- 학생별 대화 기록이 사이드바에 누적 (숨기기 가능)

> ⚠️ **보안 모델 안내** — 환경 변수(`VITE_*`)는 빌드 산출물 JS 번들에 평문으로 인라인됩니다.
> 학교/학급 단위의 제한된 사용자 그룹에서만 운영하세요. 공개 인터넷에 노출하면
> 누구나 브라우저에서 키를 추출할 수 있습니다.

---

## 빠른 시작

```bash
npm install
cp .env.example .env       # 또는 .env 를 직접 편집
# .env 의 키를 채운 뒤
npm run dev
```

`http://localhost:5173/` 에서 실행됩니다. 정적 빌드는 `npm run build` → `dist/`.

요구 사항: Node.js 18 이상.

---

## 1) 환경 변수 — 이 앱의 모든 비밀

키와 토큰은 모두 환경 변수로 관리합니다. 학생 PC에는 **어떤 비밀도 저장되지 않습니다.**

### .env (로컬 개발)

```bash
# LLM API 키 (사용할 모델의 키만 채우면 됩니다)
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_OPENAI_API_KEY=sk-...
VITE_GEMINI_API_KEY=...

# Google Drive (서비스 계정 + 폴더 ID 방식)
VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL=chatbot@<project>.iam.gserviceaccount.com
VITE_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
VITE_GOOGLE_DRIVE_FOLDER_ID=1AbCdEfGhIjKlMnOpQrStUv
```

`.env` 는 `.gitignore` 에 포함되어 있어 GitHub에 올라가지 않습니다.
GitHub에 올라가는 템플릿은 `.env.example` 이며, **여기에는 절대 실제 값을 넣지 마세요.**

> 💡 **가장 간단한 셋업**: 서비스 계정 JSON 파일 전체를 작은따옴표로 감싸서
> `VITE_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` 에 통째로 넣으면 앱이 자동으로
> `private_key` / `client_email` 을 꺼내 씁니다. EMAIL 변수는 비워둬도 됩니다.

### Netlify (배포)

1. https://app.netlify.com → 사이트 → **Site settings → Environment variables**
2. 위 `.env` 와 동일한 이름/값으로 모두 등록
3. 변경 후에는 **Deploys → Trigger deploy → Deploy site** 로 재배포

`netlify.toml` 에 빌드 명령과 publish 디렉터리가 정의돼 있어, GitHub 리포지터리만 연결하면 자동 빌드됩니다.

### 키 발급 페이지

| 제공자 | 모델 | 키 발급 페이지 |
| --- | --- | --- |
| Anthropic (Claude) | `claude-sonnet-4-5` | https://console.anthropic.com/ |
| OpenAI | `gpt-4.1` | https://platform.openai.com/api-keys |
| Google (Gemini) | `gemini-2.5-pro` | https://aistudio.google.com/app/apikey |

---

## 2) 학생 명부 편집

`src/data/roster.json` 파일을 수정합니다.

```json
{
  "classInfo": { "grade": 3, "classNum": 5, "year": 2026 },
  "students": [
    { "studentId": "30501", "name": "강한솔" },
    { "studentId": "30502", "name": "김나연" }
  ]
}
```

- `studentId` 는 정확 일치로 매칭됩니다(앞뒤 공백만 자동 제거).
- 명부에 없는 학번을 입력하면 "명부에 없는 학번입니다. 선생님께 문의하세요." 안내가 표시됩니다.
- **이름 외에 민감 정보(생년월일, 연락처 등)는 절대 넣지 마세요.**

수정 후 `git push` → Netlify 자동 재배포 → 학생들이 새 명부로 사용.

---

## 3) Google Drive 학급 자료 연동

학급 자료(평가계획서, 탐구활동 PDF 등)는 **하나의 Drive 폴더**에 모아 두고,
그 폴더를 **서비스 계정 이메일에 뷰어 권한으로 공유**하면 끝입니다.
앱은 학생이 스타터를 클릭하거나 자료 관련 질문을 할 때 자동으로 폴더 내용을 읽어 LLM에 전달합니다.

**셋업 절차** (한 번만)

1. **Google Cloud Console** → 새 프로젝트 생성 (예: `class-chatbot`)
2. **API & Services → Library → Google Drive API → Enable**
3. **IAM & Admin → Service Accounts → Create service account**
   - 이름: `class-chatbot`
   - 역할은 비워 두어도 됩니다 (폴더에서 직접 공유로 권한 부여)
4. 생성된 서비스 계정 → **Keys → Add key → Create new key → JSON** → 다운로드
5. **Google Drive** 에 학급 자료 폴더 생성 (예: "3학년 5반 자료")
   - 폴더 우클릭 → **공유** → 위 서비스 계정 이메일을 **뷰어** 로 추가
   - 폴더 URL `https://drive.google.com/drive/folders/<여기가_FOLDER_ID>` 에서 ID 추출
6. 환경 변수 등록 (둘 중 한 방식)

   **방식 A (가장 간단) — JSON 통째**
   ```bash
   VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL=
   VITE_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY='{"type":"service_account","client_email":"...","private_key":"-----BEGIN..."...}'
   VITE_GOOGLE_DRIVE_FOLDER_ID=1AbCdEfGhIjKlMnOpQrStUv
   ```
   작은따옴표로 감싸면 큰따옴표 충돌 없음. 앱이 자동으로 `private_key` / `client_email` 을 추출합니다.

   **방식 B — 분해**
   ```bash
   VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL=class-chatbot@<프로젝트>.iam.gserviceaccount.com
   VITE_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
   VITE_GOOGLE_DRIVE_FOLDER_ID=1AbCdEfGhIjKlMnOpQrStUv
   ```

**운영 메모**

- 새 자료는 그냥 Drive 폴더에 끌어다 놓으면 끝. 앱 재배포 불필요(다음 호출 시 최신 목록 반영).
- PDF 파일명·설명을 잘 적어두면 LLM이 자료를 더 정확히 찾아 줍니다.
- Claude 모델 사용 중에는 폴더 안 PDF 가 자동 첨부됩니다 (최대 5개, 합계 10MB). 초과분은 자동 제외 후 학생에게 안내.
- OpenAI/Gemini 사용 중에는 PDF 첨부 대신 파일 목록 텍스트만 LLM 컨텍스트로 전달됩니다.
- 서비스 계정 키는 한 번 만들면 만료 없음. 누출 의심 시 Cloud Console에서 Disable / Delete key 후 재발급.
- 디버깅: 브라우저 콘솔(F12)에 `[drive] fetchDriveContext ...` 로그가 출력됩니다.

---

## 4) AI 아이콘 교체

기본 아이콘은 `public/ai-icon.png` (256×256 인디고 배경 + "AI" 글씨) 입니다.
교사가 자유롭게 교체할 수 있습니다.

- 권장 사이즈: 256×256 정사각 PNG
- 같은 경로/같은 파일명 (`public/ai-icon.png`) 으로 덮어쓰고 `npm run build` → Netlify 자동 배포
- 캐시 때문에 즉시 반영이 안 되면 학생들에게 새로고침(Ctrl+F5) 안내

학생 메시지 아바타는 학생 이름 첫 글자가 인디고 배경에 표시됩니다.

---

## 5) 대화 스타터 편집

`src/data/starters.json` 을 수정합니다. 기본 4개:

```json
{
  "starters": [
    {
      "id": "evalplan",
      "emoji": "📚",
      "label": "평가계획서 보기",
      "prompt": "학급 Google Drive 폴더의 평가계획서를 과목별로 정리하고 핵심 내용을 알려줘.",
      "requiresDrive": true
    }
  ]
}
```

- `requiresDrive: true` 인 스타터는 클릭 시 Drive 폴더 내용을 LLM에 컨텍스트로 자동 첨부합니다.
- 학년/과목별 흔한 질문을 미리 등록해 두면 학생이 클릭만으로 자주 쓰는 흐름을 실행할 수 있습니다.

---

## 6) Netlify 배포 절차

1. GitHub에 푸시 (`.env` 는 제외됨)
2. https://app.netlify.com → **Add new site → Import from Git** → 이 리포지터리 선택
3. 빌드 설정은 `netlify.toml` 이 자동으로 처리:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. **Site settings → Environment variables** 에서 위 `.env` 키들을 모두 등록
5. **Deploys → Trigger deploy → Deploy site** 로 첫 배포
6. 이후에는 `git push main` 만으로 자동 배포

### 다른 정적 호스팅 (참고)

- **Vercel**: Framework Preset `Vite` 자동 인식, 환경 변수는 대시보드에서 등록
- **Cloudflare Pages**: Build command `npm run build`, output `dist`, Environment variables 등록

---

## 7) 디렉터리 구조

```
homerome_chatbot/
├── public/
│   └── ai-icon.png              # 교사가 교체할 AI 아이콘
├── src/
│   ├── components/
│   │   ├── Sidebar.tsx          # 대화 기록 + 새 대화 + 초기화
│   │   ├── ChatArea.tsx         # 메시지 + 모델 선택 칩 + 입력창
│   │   ├── MessageBubble.tsx
│   │   ├── ConversationStarters.tsx
│   │   └── StudentLoginModal.tsx
│   ├── lib/
│   │   ├── llm/
│   │   │   ├── index.ts         # sendMessage 통합
│   │   │   ├── claude.ts        # Anthropic + PDF 첨부
│   │   │   ├── openai.ts
│   │   │   ├── gemini.ts
│   │   │   └── types.ts
│   │   ├── drive/
│   │   │   ├── auth.ts          # 서비스 계정 → JWT → access_token
│   │   │   └── index.ts         # listFolderFiles / fetchDriveContext
│   │   ├── env.ts               # 환경 변수 → ApiKeys / DriveConfig
│   │   ├── storage.ts           # localStorage 래퍼 (학생/대화 기록만)
│   │   └── roster.ts            # 학번-이름 매칭 + 다정한 호격
│   ├── data/
│   │   ├── roster.json          # 학생 명부
│   │   └── starters.json        # 대화 스타터
│   ├── types/index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── .env                          # 로컬용(gitignore)
├── .env.example                  # 템플릿(git 추적)
├── netlify.toml
├── package.json
└── README.md
```

`localStorage` 에 저장되는 데이터: 현재 학생, 모델 선택, 사이드바 상태, 학생별 대화 기록.
**API 키와 Drive 인증 정보는 학생 PC에 저장되지 않습니다.**

---

## 8) 보안·운영 주의사항

- `VITE_*` 환경 변수는 Vite가 빌드할 때 **JS 번들에 평문으로 인라인**합니다.
  배포된 사이트의 소스를 보면 누구나 키를 추출할 수 있습니다.
- 따라서 이 앱은 **학교/학급 단위의 폐쇄적 운영**(IP 제한, 학생만 알 수 있는 URL 등)을 전제로 합니다.
- API 사용량 폭증 위험이 우려되면 각 키 제공자 대시보드에서 **월별 사용량 한도(spending limit)** 를 반드시 설정하세요.
- 학생 명부에는 학번/이름만 포함하세요(연락처/생년월일 금지).
- 공용 PC에서는 좌측 하단 **"내 데이터 초기화"** 사용을 학생에게 안내하세요.
  (대화 기록 + 로그인 정보만 삭제, 다른 학생의 데이터에는 영향 없음)

---

## 9) 개발/검증 명령

```bash
npm run dev        # 개발 서버 (http://localhost:5173)
npm run build      # 정적 빌드 → dist/
npm run preview    # 빌드 결과물 로컬 미리보기
npm run typecheck  # 타입 검사만 수행
```

---

## 10) 기술 스택

- Vite + React 18 + TypeScript + Tailwind CSS
- `@anthropic-ai/sdk` (Claude + PDF document block)
- `openai` (gpt-4.1)
- `@google/generative-ai` (gemini-2.5-pro)
- Google Drive API v3 (서비스 계정 JWT 인증, Web Crypto API)
- 폰트: Pretendard (CDN)
- 디자인 시안: Stitch 프로젝트 `13087988346671586661`
