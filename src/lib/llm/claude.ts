import Anthropic from '@anthropic-ai/sdk'
import { PROVIDER_MODEL_ID } from '@/types'
import type { ProviderCallParams, ProviderCallResult } from './types'

// 명세 2.2: 브라우저에서 직접 호출. dangerouslyAllowBrowser 사용 시
// 콘솔에 보안 경고를 한 번 출력해서 운영자가 인지하게 한다.
let warned = false
function warnOnce() {
  if (warned) return
  warned = true
  // eslint-disable-next-line no-console
  console.warn(
    '[security] Anthropic SDK is being called from the browser with dangerouslyAllowBrowser=true. ' +
      'API 키가 학생 PC에서 빌드된 JS 번들에 평문으로 들어 있습니다. 학급 단위 폐쇄 운영을 권장합니다.',
  )
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

  // 명세 2.3 MCP 페이로드 구성. 비어 있는 항목은 보내지 않는다.
  const mcpServers: Array<{
    type: 'url'
    url: string
    name: string
    authorization_token: string
  }> = []
  if (p.mcpEnabled && p.mcpConfig) {
    const { notion } = p.mcpConfig
    if (notion?.url && notion?.token) {
      mcpServers.push({
        type: 'url',
        url: notion.url,
        name: 'notion',
        authorization_token: notion.token,
      })
    }
  }
  const useMcp = mcpServers.length > 0

  // messages 변환: 마지막 user 메시지에 PDF 첨부가 있으면 content를 array 로.
  const baseMessages: AnthropicMessage[] = p.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))
  const pdfs = p.pdfAttachments ?? []
  if (pdfs.length > 0 && baseMessages.length > 0) {
    // 가장 가까운 마지막 user 메시지를 찾아 첨부
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
      blocks.push({ type: 'text', text: text || '(첨부 파일을 참고해 답해주세요)' })
      baseMessages[i] = { role: 'user', content: blocks }
      break
    }
  }

  const requestBody: Record<string, unknown> = {
    model: PROVIDER_MODEL_ID.claude,
    max_tokens: 4096,
    messages: baseMessages,
  }
  if (p.systemPrompt) requestBody.system = p.systemPrompt
  if (useMcp) requestBody.mcp_servers = mcpServers

  const options: { headers?: Record<string, string> } = {}
  if (useMcp) {
    options.headers = { 'anthropic-beta': 'mcp-client-2025-04-04' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = (await (client.messages.create as any)(
    requestBody,
    options,
  )) as { content: Array<{ type: string; text?: string }> }

  const text = response.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')

  return { content: text || '(응답이 비어 있습니다)' }
}
