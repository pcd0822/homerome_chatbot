import { GoogleGenerativeAI } from '@google/generative-ai'
import { PROVIDER_MODEL_ID } from '@/types'
import type { ProviderCallParams, ProviderCallResult } from './types'

export async function callGemini(
  p: ProviderCallParams,
): Promise<ProviderCallResult> {
  const genAI = new GoogleGenerativeAI(p.apiKey)
  const model = genAI.getGenerativeModel({
    model: PROVIDER_MODEL_ID.gemini,
    systemInstruction: p.systemPrompt,
  })

  if (p.messages.length === 0) {
    return { content: '' }
  }

  const last = p.messages[p.messages.length - 1]!
  // Gemini는 마지막 메시지를 sendMessage로 보내고 나머지를 history로 받는다.
  const history = p.messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const chat = model.startChat({ history })
  const result = await chat.sendMessage(last.content)
  const text = result.response.text()

  return { content: text || '(응답이 비어 있습니다)' }
}
