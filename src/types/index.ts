// 학급 챗봇 전체에서 공유되는 도메인 타입.

export type LlmProvider = 'claude' | 'openai' | 'gemini'

export interface ClassInfo {
  grade: number
  classNum: number
  year: number
}

export interface Student {
  studentId: string
  name: string
}

export interface RosterFile {
  classInfo: ClassInfo
  students: Student[]
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

export interface ApiKeys {
  claude?: string
  openai?: string
  gemini?: string
}

// Google Drive 는 서비스 계정으로 직접 호출한다.
// 학급 자료를 둘 폴더(folderId)에 서비스 계정 email 을 뷰어로 공유.
export interface DriveServiceAccountConfig {
  clientEmail: string
  privateKey: string // PEM
  folderId: string
}

// NEIS Open API 설정. 학교명만 있어도 동작(코드는 첫 호출에 자동 검색).
// API 키는 선택 — 없으면 호출 한도가 작지만 무인증 호출 가능.
export interface NeisConfig {
  schoolName: string
  apiKey?: string
}

export interface Starter {
  id: string
  emoji: string
  label: string
  prompt: string
  /** Google Drive 학급 폴더 자료 조회/첨부가 필요한지 */
  requiresDrive?: boolean
}

export interface StartersFile {
  starters: Starter[]
}

// 제공자별 표시명과 실제 모델 ID 매핑(명세 2.2 고정 모델).
// UI 라벨/실제 호출에 사용.
export const PROVIDER_LABEL: Record<LlmProvider, string> = {
  claude: 'Claude (claude-sonnet-4-5)',
  openai: 'OpenAI (gpt-4.1)',
  gemini: 'Gemini (gemini-2.5-pro)',
}

export const PROVIDER_MODEL_ID: Record<LlmProvider, string> = {
  claude: 'claude-sonnet-4-5',
  openai: 'gpt-4.1',
  gemini: 'gemini-2.5-pro',
}
