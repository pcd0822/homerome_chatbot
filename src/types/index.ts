// 학급 챗봇 전체에서 공유되는 도메인 타입.

export type LlmProvider = 'claude' | 'openai' | 'gemini'

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

export interface Message {
  id: string
  role: MessageRole
  content: string
  createdAt: number
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
  openai: 'GPT',
  gemini: 'Gemini',
}
