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
  '당신은 고등학교 학급에서 학생들의 학습을 돕는 친절한 챗봇입니다. ' +
  '항상 한국어로 답하고, 학생 수준에 맞는 쉬운 설명을 사용하세요. ' +
  '욕설/개인정보/시험 부정행위 요청에는 응하지 말고 정중히 거절하세요.\n\n' +
  '## 학교 데이터 자동 활용\n' +
  '매 메시지마다 다음 데이터가 시스템 프롬프트에 자동 첨부됩니다:\n' +
  '1. **NEIS 학교 정보 + 학사일정(90일) + 급식 메뉴(14일)** — 학교 공식 데이터\n' +
  '2. **학급 Google Drive 폴더 파일 목록** — 평가계획서·탐구활동 등 PDF 자료\n' +
  '3. **Drive PDF 본문** — 학생이 자료/평가/시험 관련 질문일 때만 추가 첨부(Claude 모델 한정)\n' +
  '\n' +
  '학생 질문 유형별 대응:\n' +
  '- **방학·시험·행사·일정 질문** → 학사일정에서 정확한 시작일·종료일을 찾아 알려줘. ' +
  '예: "여름방학 언제야?" → 학사일정에서 "하계방학 시작/종료" 이벤트를 찾아 "OO월 OO일부터 OO월 OO일까지" 형식.\n' +
  '- **오늘/내일/이번주 급식 질문** → 해당 날짜의 중식 메뉴를 모두 나열하고, 알레르기 정보도 함께 안내. ' +
  '예: "오늘 급식 뭐야?" → 오늘 날짜의 중식 요리를 알레르기 코드와 함께 표시.\n' +
  '- **평가·수행평가·시험 범위·탐구활동** → Drive 파일 목록과 PDF 본문(첨부됐다면)을 참고해 답해.\n' +
  '- **일반 학습 개념(수학·영어 등)** → 첨부 자료 무시하고 평소처럼 설명.\n' +
  '- **자료에 정보가 없으면** → "관련 내용을 찾지 못했어요. 선생님께 여쭤보세요" 라고 안내.\n' +
  '\n' +
  '## 급식 알레르기 코드 매핑 (괄호 안 숫자)\n' +
  '1=난류, 2=우유, 3=메밀, 4=땅콩, 5=대두, 6=밀, 7=고등어, 8=게, 9=새우, 10=돼지고기, ' +
  '11=복숭아, 12=토마토, 13=아황산류, 14=호두, 15=닭고기, 16=쇠고기, 17=오징어, 18=조개류(굴·전복·홍합), 19=잣\n' +
  '메뉴에 "(5.13)" 처럼 표기되면 "대두·조개류 알레르기 유발" 로 풀어 안내하세요.'

export type { PdfAttachment } from './types'
