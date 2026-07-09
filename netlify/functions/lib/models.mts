// ============================================================================
// 모델 설정 — 교사가 여기서 모델을 추가/교체합니다.
// ============================================================================
// - 각 프로바이더가 실제로 호출할 모델 ID 를 한 곳에 모았습니다.
// - 값이 바뀔 수 있으니(모델 신규 출시 등) 이 파일만 고치면 됩니다.
// - Claude 기본값은 최상위 모델(claude-opus-4-8)입니다. 비용을 낮추려면
//   'claude-haiku-4-5' 등으로 바꾸세요. (모델 ID 는 platform.claude.com 참고)
// - 서버 환경변수(키)는 여기서 다루지 않습니다: ANTHROPIC_API_KEY /
//   OPENAI_API_KEY / GEMINI_API_KEY 를 Netlify 대시보드에 등록하세요.
// ============================================================================

export type Provider = 'anthropic' | 'openai' | 'gemini'

export interface ModelConfig {
  /** 실제 호출 모델 ID (여기서 추가/교체) */
  model: string
  /** 이 프로바이더의 키를 담은 환경변수 이름 */
  envKey: string
}

export const MODELS: Record<Provider, ModelConfig> = {
  // 여기서 모델 추가/교체 ↓
  anthropic: { model: 'claude-opus-4-8', envKey: 'ANTHROPIC_API_KEY' },
  openai: { model: 'gpt-5', envKey: 'OPENAI_API_KEY' },
  gemini: { model: 'gemini-2.5-pro', envKey: 'GEMINI_API_KEY' },
}

export const PROVIDERS: Provider[] = ['anthropic', 'openai', 'gemini']

export function isProvider(v: unknown): v is Provider {
  return v === 'anthropic' || v === 'openai' || v === 'gemini'
}

// 응답 길이 상한. 챗봇 답변용으로 넉넉하게. (스트리밍이라 타임아웃 부담 적음)
export const MAX_TOKENS = 4096

// 학생 탐구 보조용 공통 시스템 프롬프트.
export const SYSTEM_PROMPT =
  '당신은 고등학생의 탐구활동을 돕는 친절한 AI 어시스턴트입니다. ' +
  '항상 한국어로 답하고, 학생 수준에 맞는 쉬운 설명과 예시를 사용하세요. ' +
  '코드를 보여줄 때는 반드시 언어를 명시한 마크다운 코드블록(```언어)으로 감싸세요. ' +
  '\n\n' +
  '## 문서/산출물 작성 규칙 (캔버스)\n' +
  '학생이 보고서·글·편지·안내문·계획서 같은 "완성된 문서"나 웹페이지 제작을 요청하면, ' +
  '그 산출물 전체를 **하나의 코드펜스**로 감싸 제공하세요. 이 블록은 화면 오른쪽 캔버스에 ' +
  '표시되고 학생이 PDF/Word/HTML 로 내려받을 수 있습니다.\n' +
  '- 웹페이지/HTML/CSS/JS 는 하나의 완결된 문서로 만들어 ```html 로 감싸세요.\n' +
  '- 그 외 문서(보고서·글 등)는 ```markdown 으로 감싸고, 맨 위에 `# 제목`을 넣으세요.\n' +
  '- 문서 앞뒤에 한두 문장으로 간단히 안내는 하되, 문서 본문은 반드시 코드펜스 안에 두세요.\n' +
  '- 짧은 질문·대화형 답변은 코드펜스로 감싸지 말고 평소처럼 답하세요.\n' +
  '\n' +
  '욕설·개인정보·시험 부정행위 요청에는 응하지 말고 정중히 거절하세요.'
