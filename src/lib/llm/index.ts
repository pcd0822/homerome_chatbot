// 모델 제공자에 무관한 sendMessage 통합 인터페이스.

import type { ApiKeys, LlmProvider, Message } from '@/types'
import { callClaude } from './claude'
import { callOpenAI } from './openai'
import { callGemini } from './gemini'
import type { PdfAttachment } from './types'

export interface SendMessageInput {
  provider: LlmProvider
  apiKey: string
  messages: Message[]
  systemPrompt?: string
  /** Claude 모델일 때만 효과. 다른 모델은 무시된다. */
  pdfAttachments?: PdfAttachment[]
}

export interface SendMessageOutput {
  content: string
}

export async function sendMessage(
  input: SendMessageInput,
): Promise<SendMessageOutput> {
  switch (input.provider) {
    case 'claude':
      return callClaude(input)
    case 'openai':
      return callOpenAI(input)
    case 'gemini':
      return callGemini(input)
  }
}

// 키 보유 여부 — 사이드바 드롭다운 비활성화 판단용.
export function hasKey(keys: ApiKeys, provider: LlmProvider): boolean {
  return Boolean(keys[provider]?.trim())
}

// 마지막에 선택된 제공자가 키가 없을 때 자동으로 키 있는 첫 제공자 선택.
export function pickInitialProvider(
  keys: ApiKeys,
  last: LlmProvider | null,
): LlmProvider | null {
  if (last && hasKey(keys, last)) return last
  const order: LlmProvider[] = ['claude', 'openai', 'gemini']
  return order.find((p) => hasKey(keys, p)) ?? null
}

export const DEFAULT_SYSTEM_PROMPT =
  '당신은 중학교 학급에서 학생들의 학습을 돕는 친절한 챗봇입니다. ' +
  '항상 한국어로 답하고, 중학생 수준에 맞는 쉬운 설명을 사용하세요. ' +
  '욕설/개인정보/시험 부정행위 요청에는 응하지 말고 정중히 거절하세요.\n\n' +
  '## 학급 Google Drive 자료 자동 첨부\n' +
  '매 메시지마다 학급 Drive 폴더의 파일 목록과(Claude 사용 시) PDF 내용이 자동으로 함께 전달됩니다. ' +
  '학생의 질문이 이 자료들과 관련 있어 보이면 자료 내용을 직접 인용/요약해 답하세요. ' +
  '(예: 평가 일정, 수행평가 기준, 시험 범위, 탐구활동 자료, 학급 안내 등) ' +
  '학생의 질문이 학급 자료와 관계없는 일반 학습 개념(수학 풀이, 영어 문법 등) 또는 ' +
  '일상 대화이면 자료를 굳이 언급하지 말고 평소처럼 답하세요. ' +
  '자료에 답이 없는 학급 관련 질문에는 "학급 자료에는 관련 내용이 없어요. 선생님께 여쭤보는 게 좋겠어요" 라고 안내하세요.'

export type { PdfAttachment } from './types'
