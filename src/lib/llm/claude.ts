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
      '학생 PC에 API 키가 노출됩니다. 공용 PC 사용 후에는 반드시 "내 데이터 초기화"를 누르세요.',
  )
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
    const { notion, googleDrive } = p.mcpConfig
    if (notion?.url && notion?.token) {
      mcpServers.push({
        type: 'url',
        url: notion.url,
        name: 'notion',
        authorization_token: notion.token,
      })
    }
    if (googleDrive?.url && googleDrive?.token) {
      mcpServers.push({
        type: 'url',
        url: googleDrive.url,
        name: 'google-drive',
        authorization_token: googleDrive.token,
      })
    }
  }

  const useMcp = mcpServers.length > 0

  // SDK가 messages.create의 mcp_servers 옵션을 정식 타입으로 노출하지 않을 수 있어
  // 베타 헤더와 함께 raw 페이로드로 전달한다. (Anthropic MCP는 베타 기능)
  const requestBody: Record<string, unknown> = {
    model: PROVIDER_MODEL_ID.claude,
    max_tokens: 4096,
    messages: p.messages.map((m) => ({ role: m.role, content: m.content })),
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
