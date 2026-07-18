// localStorage 래퍼. 키 네임스페이스를 한 곳에 모으고,
// JSON 직렬화/역직렬화와 quota/SecurityError 예외를 흡수한다.
//
// 비밀(LLM API 키)은 클라이언트에 없다. Netlify Function(/api/chat) 서버에서만
// 환경 변수(ANTHROPIC_API_KEY 등)로 읽는다. 여기엔 대화/UI 상태만 저장한다.
//
// 키 컨벤션:
//   chatbot.currentStudent              현재 로그인 학생
//   chatbot.selectedProvider            마지막으로 선택한 모델 제공자
//   chatbot.uiState.sidebarCollapsed    사이드바 접힘 여부
//   chatbot.history.{studentId}         학생별 대화 스레드 배열
//   chatbot.searchUsage.{studentId}     학생별·모델별 웹 검색 누적 횟수(Record<provider, n>)

import type { Conversation, LlmProvider, Student } from '@/types'

const KEY = {
  currentStudent: 'chatbot.currentStudent',
  selectedProvider: 'chatbot.selectedProvider',
  sidebarCollapsed: 'chatbot.uiState.sidebarCollapsed',
  historyFor: (studentId: string) => `chatbot.history.${studentId}`,
  searchUsageFor: (studentId: string) => `chatbot.searchUsage.${studentId}`,
} as const

// 학생 코드·모델별 웹 검색 누적 상한. 이 값에 도달하면 그 모델의 검색이 비활성화된다.
// (localStorage 기반 소프트 제한 — 학생이 저장소를 지우면 리셋됨)
export const SEARCH_LIMIT_PER_MODEL = 20

type SearchUsage = Partial<Record<LlmProvider, number>>

function safeGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function safeSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota exceeded / private mode — silently drop.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export const storage = {
  // ---- 현재 학생 ----
  getCurrentStudent(): Student | null {
    return safeGet<Student>(KEY.currentStudent)
  },
  setCurrentStudent(s: Student): void {
    safeSet(KEY.currentStudent, s)
  },
  clearCurrentStudent(): void {
    safeRemove(KEY.currentStudent)
  },

  // ---- 선택 모델 제공자 ----
  getSelectedProvider(): LlmProvider | null {
    return safeGet<LlmProvider>(KEY.selectedProvider)
  },
  setSelectedProvider(p: LlmProvider): void {
    safeSet(KEY.selectedProvider, p)
  },

  // ---- 사이드바 UI 상태 ----
  getSidebarCollapsed(): boolean {
    return safeGet<boolean>(KEY.sidebarCollapsed) ?? false
  },
  setSidebarCollapsed(v: boolean): void {
    safeSet(KEY.sidebarCollapsed, v)
  },

  // ---- 학생별 대화 기록 ----
  getHistory(studentId: string): Conversation[] {
    return safeGet<Conversation[]>(KEY.historyFor(studentId)) ?? []
  },
  setHistory(studentId: string, conversations: Conversation[]): void {
    safeSet(KEY.historyFor(studentId), conversations)
  },
  clearHistory(studentId: string): void {
    safeRemove(KEY.historyFor(studentId))
  },

  // ---- 학생별·모델별 웹 검색 누적 횟수 ----
  getSearchUsage(studentId: string, provider: LlmProvider): number {
    const usage = safeGet<SearchUsage>(KEY.searchUsageFor(studentId))
    return usage?.[provider] ?? 0
  },
  // 이번 요청에서 수행한 검색 횟수를 누적에 더한다. 새 누적값을 반환.
  addSearchUsage(studentId: string, provider: LlmProvider, count: number): number {
    if (!Number.isFinite(count) || count <= 0) {
      return this.getSearchUsage(studentId, provider)
    }
    const usage = safeGet<SearchUsage>(KEY.searchUsageFor(studentId)) ?? {}
    const next = (usage[provider] ?? 0) + Math.floor(count)
    usage[provider] = next
    safeSet(KEY.searchUsageFor(studentId), usage)
    return next
  },

  // ---- "내 데이터 초기화"(명세 5장): 현재 학생의 기록 + 로그인 + 검색 누적 삭제 ----
  // 비밀은 환경 변수라 학생 PC에 없음.
  clearStudentData(studentId: string): void {
    safeRemove(KEY.historyFor(studentId))
    safeRemove(KEY.searchUsageFor(studentId))
    safeRemove(KEY.currentStudent)
  },
}

// 메시지/대화 ID 등에서 공통으로 쓰는 ID 생성기.
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
