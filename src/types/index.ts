// 학급 챗봇 전체에서 공유되는 도메인 타입.

// 'claude' = 기본(Sonnet), 'claude_opus' = 고급(Opus). 둘 다 Anthropic.
export type LlmProvider = 'claude' | 'claude_opus' | 'openai' | 'gemini'

export interface ClassInfo {
  grade: number
  classNum: number
  year: number
}

// 로그인에 쓰이는 학생 정보. name 은 환영 인사에만 사용하고,
// 인증은 studentId + code 2-factor 로만 한다(이름은 인증에 관여하지 않음).
export interface Student {
  studentId: string
  name: string
}

// 명부 원본 항목. code 는 학번과 매칭되는 개별 접속 코드(하드코딩).
export interface RosterStudent extends Student {
  code: string
}

export interface RosterFile {
  classInfo: ClassInfo
  students: RosterStudent[]
}

export type MessageRole = 'user' | 'assistant'

// 첨부파일(이미지/PDF/텍스트). base64(또는 추출 평문)로 localStorage(대화 기록)에만
// 저장되며, 서버 DB 에는 저장하지 않는다. LLM 에 질문할 때만 프로바이더로 전달된다.
// - image/pdf: 원본을 base64 로 담아 프로바이더에 그대로 전달
// - text: CSV/XLSX 등을 브라우저에서 평문으로 추출해 프롬프트에 주입(세 모델 공통)
export interface Attachment {
  id: string
  kind: 'image' | 'pdf' | 'text'
  name: string
  mediaType: string // 예: image/png, application/pdf, text/csv
  data: string // image/pdf: base64(data: 접두사 제외). text: '' (미사용)
  text?: string // kind 'text' 에서 추출한 평문(CSV/XLSX 등)
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  createdAt: number
  attachments?: Attachment[]
}

export interface Conversation {
  id: string
  title: string
  provider: LlmProvider
  messages: Message[]
  createdAt: number
  updatedAt: number
}

// 서버(/api/providers)가 알려주는 사용 가능한 프로바이더 목록과 실제 모델 ID.
// 키 자체는 절대 클라이언트로 내려오지 않는다(가용 여부와 모델명만).
export interface ProviderInfo {
  available: Record<LlmProvider, boolean>
  models: Record<LlmProvider, string>
}

export interface Starter {
  id: string
  emoji: string
  label: string
  prompt: string
}

export interface StartersFile {
  starters: Starter[]
}

// 제공자별 짧은 표시명. 실제 모델 ID 는 서버 MODELS 에서 관리되며
// /api/providers 로 받아 UI 에 함께 표시한다.
export const PROVIDER_LABEL: Record<LlmProvider, string> = {
  claude: 'Claude',
  claude_opus: 'Claude 고급',
  openai: 'GPT',
  gemini: 'Gemini',
}
