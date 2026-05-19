import OpenAI from 'openai'
import { PROVIDER_MODEL_ID } from '@/types'
import type { ProviderCallParams, ProviderCallResult } from './types'

let warned = false
function warnOnce() {
  if (warned) return
  warned = true
  // eslint-disable-next-line no-console
  console.warn(
    '[security] OpenAI SDK is being called from the browser with dangerouslyAllowBrowser=true.',
  )
}

export async function callOpenAI(
  p: ProviderCallParams,
): Promise<ProviderCallResult> {
  warnOnce()

  const client = new OpenAI({
    apiKey: p.apiKey,
    dangerouslyAllowBrowser: true,
  })

  const messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }> = []
  if (p.systemPrompt) {
    messages.push({ role: 'system', content: p.systemPrompt })
  }
  for (const m of p.messages) {
    messages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })
  }

  const res = await client.chat.completions.create({
    model: PROVIDER_MODEL_ID.openai,
    messages,
  })

  const content = res.choices[0]?.message?.content ?? ''
  return { content: content || '(응답이 비어 있습니다)' }
}
