import type { Message } from '@/types'

export interface PdfAttachment {
  title: string
  base64: string
}

export interface ProviderCallParams {
  apiKey: string
  messages: Message[]
  systemPrompt?: string
  /** Claude 모델일 때만 마지막 user 메시지에 document content block 으로 첨부 */
  pdfAttachments?: PdfAttachment[]
}

export interface ProviderCallResult {
  content: string
}
