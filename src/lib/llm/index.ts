// 모델 제공자에 무관한 sendMessage 통합 인터페이스.
// MCP는 Claude만 네이티브 지원 → OpenAI/Gemini로 mcpEnabled 요청 시
// 안내 문구를 prepend한 일반 응답을 반환한다(명세 2.3).

import type { ApiKeys, LlmProvider, McpConfig, Message } from '@/types'
import { callClaude } from './claude'
import { callOpenAI } from './openai'
import { callGemini } from './gemini'
import type { PdfAttachment } from './types'

export interface SendMessageInput {
  provider: LlmProvider
  apiKey: string
  messages: Message[]
  systemPrompt?: string
  mcpEnabled?: boolean
  mcpConfig?: McpConfig
  /** Claude 모델일 때만 효과. 다른 모델은 무시된다. */
  pdfAttachments?: PdfAttachment[]
}

export interface SendMessageOutput {
  content: string
}

const NON_CLAUDE_MCP_NOTICE =
  '⚠️ MCP 도구(노션/Drive 조회)는 Claude 모델에서만 사용 가능합니다. ' +
  '좌측 사이드바에서 Claude로 변경한 뒤 다시 시도해 보세요.\n\n' +
  '아래는 도구 없이 드리는 일반 답변입니다.\n\n'

export async function sendMessage(
  input: SendMessageInput,
): Promise<SendMessageOutput> {
  switch (input.provider) {
    case 'claude':
      return callClaude(input)
    case 'openai': {
      const r = await callOpenAI(input)
      return input.mcpEnabled
        ? { content: NON_CLAUDE_MCP_NOTICE + r.content }
        : r
    }
    case 'gemini': {
      const r = await callGemini(input)
      return input.mcpEnabled
        ? { content: NON_CLAUDE_MCP_NOTICE + r.content }
        : r
    }
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
  '욕설/개인정보/시험 부정행위 요청에는 응하지 말고 정중히 거절하세요.'

export type { PdfAttachment } from './types'
