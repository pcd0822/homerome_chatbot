// localStorage 래퍼. 키 네임스페이스를 한 곳에 모으고,
// JSON 직렬화/역직렬화와 quota/SecurityError 예외를 흡수한다.
//
// 비밀(LLM API 키, MCP 토큰)은 더 이상 localStorage에 저장하지 않는다.
// 모두 빌드 타임 환경 변수(VITE_*)로 주입된다. src/lib/env.ts 참고.
//
// 키 컨벤션:
//   chatbot.currentStudent              현재 로그인 학생
//   chatbot.selectedProvider            마지막으로 선택한 모델 제공자
//   chatbot.uiState.sidebarCollapsed    사이드바 접힘 여부
//   chatbot.history.{studentId}         학생별 대화 스레드 배열

import type { Conversation, LlmProvider, Student } from '@/types'

const KEY = {
  currentStudent: 'chatbot.currentStudent',
  selectedProvider: 'chatbot.selectedProvider',
  sidebarCollapsed: 'chatbot.uiState.sidebarCollapsed',
  historyFor: (studentId: string) => `chatbot.history.${studentId}`,
} as const

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

  // ---- "내 데이터 초기화"(명세 5장): 현재 학생의 기록 + 로그인만 삭제 ----
  // 비밀은 환경 변수라 학생 PC에 없음.
  clearStudentData(studentId: string): void {
    safeRemove(KEY.historyFor(studentId))
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
