import Anthropic from '@anthropic-ai/sdk'
import { PROVIDER_MODEL_ID } from '@/types'
import type { ProviderCallParams, ProviderCallResult } from './types'

let warned = false
function warnOnce() {
  if (warned) return
  warned = true
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      '[security] Anthropic SDK is being called from the browser with dangerouslyAllowBrowser=true. ' +
        'API 키가 빌드 산출물 JS 번들에 평문으로 들어 있습니다. 학급 단위 폐쇄 운영을 권장합니다.',
    )
  }
}

interface AnthropicTextBlock {
  type: 'text'
  text: string
}
interface AnthropicDocumentBlock {
  type: 'document'
  source: {
    type: 'base64'
    media_type: 'application/pdf'
    data: string
  }
  title?: string
}
type AnthropicContentBlock = AnthropicTextBlock | AnthropicDocumentBlock

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export async function callClaude(
  p: ProviderCallParams,
): Promise<ProviderCallResult> {
  warnOnce()

  const client = new Anthropic({
    apiKey: p.apiKey,
    dangerouslyAllowBrowser: true,
  })

  // messages 변환: 마지막 user 메시지에 PDF 첨부가 있으면 content를 array 로.
  const baseMessages: AnthropicMessage[] = p.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))
  const pdfs = p.pdfAttachments ?? []
  if (pdfs.length > 0 && baseMessages.length > 0) {
    for (let i = baseMessages.length - 1; i >= 0; i--) {
      const m = baseMessages[i]!
      if (m.role !== 'user') continue
      const text = typeof m.content === 'string' ? m.content : ''
      const blocks: AnthropicContentBlock[] = []
      for (const pdf of pdfs) {
        blocks.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdf.base64,
          },
          title: pdf.title,
        })
      }
      blocks.push({
        type: 'text',
        text: text || '(첨부 파일을 참고해 답해주세요)',
      })
      baseMessages[i] = { role: 'user', content: blocks }
      break
    }
  }

  // Anthropic SDK 0.32.1 의 타입이 PDF document block 을 정식 노출하지 않아
  // any 캐스팅으로 우회한다. 호출 시그니처/응답 구조 자체는 동일.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = (await (client.messages.create as any)({
    model: PROVIDER_MODEL_ID.claude,
    max_tokens: 4096,
    system: p.systemPrompt,
    messages: baseMessages,
  })) as { content: Array<{ type: string; text?: string }> }

  const text = response.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')

  return { content: text || '(응답이 비어 있습니다)' }
}
