// ============================================================================
// 프로바이더 어댑터 — 세 LLM 의 REST 스트리밍 API 를 공통 형식으로 정규화.
// ============================================================================
// - SDK 를 쓰지 않고 REST 엔드포인트를 직접 호출합니다(요청서 명세 4장).
//   그래야 함수 번들이 가볍고, 각 API 의 스트리밍 포맷을 우리가 통제합니다.
// - 각 어댑터는 "텍스트 조각(delta)"만 async generator 로 흘려보냅니다.
//   호출자(chat.mts)가 이를 받아 클라이언트로 다시 SSE 로 전달합니다.
// ============================================================================

import { MODELS, MAX_TOKENS, type Provider } from './models.mts'

export interface WireAttachment {
  kind: 'image' | 'pdf'
  mediaType: string
  data: string // base64 (no data: prefix)
  name?: string
}

export interface WireMessage {
  role: 'user' | 'assistant'
  content: string
  attachments?: WireAttachment[]
}

export interface StreamParams {
  provider: Provider
  apiKey: string
  model: string
  system: string
  messages: WireMessage[]
}

// 사용자에게 보여줄 친절한 에러. HTTP 상태를 구분해 메시지를 만든다.
export class ProviderError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function friendly(status: number, providerLabel: string, detail: string): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(status, `${providerLabel} API 키가 올바르지 않거나 권한이 없습니다. 서버 환경변수를 확인하세요.`)
  }
  if (status === 429) {
    return new ProviderError(status, `${providerLabel} 사용량 한도(rate limit)에 걸렸습니다. 잠시 후 다시 시도하세요.`)
  }
  if (status >= 500) {
    return new ProviderError(status, `${providerLabel} 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도하세요.`)
  }
  return new ProviderError(status, `${providerLabel} 오류(${status}): ${detail}`)
}

// ReadableStream<Uint8Array> 를 줄 단위로 읽어 "data:" 페이로드만 뽑아내는 SSE 리더.
async function* sseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      // SSE 는 빈 줄로 이벤트를 구분하지만, 여기서는 라인 단위로 처리해도 충분.
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (line.startsWith('data:')) {
          yield line.slice(5).trim()
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text()
    try {
      const j = JSON.parse(text)
      return j?.error?.message ?? j?.error?.type ?? text.slice(0, 300)
    } catch {
      return text.slice(0, 300)
    }
  } catch {
    return res.statusText
  }
}

// 첨부파일이 있는 메시지를 Anthropic content block 배열로 변환.
function anthropicContent(m: WireMessage): unknown {
  if (!m.attachments?.length) return m.content
  const blocks: unknown[] = []
  for (const a of m.attachments) {
    if (a.kind === 'image') {
      blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } })
    } else {
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: a.data },
        title: a.name,
      })
    }
  }
  blocks.push({ type: 'text', text: m.content || '(첨부 파일을 참고해 답해주세요)' })
  return blocks
}

// ---- Anthropic (Claude) ----------------------------------------------------
async function* streamAnthropic(p: StreamParams): AsyncGenerator<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': p.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: p.model,
      max_tokens: MAX_TOKENS,
      system: p.system,
      messages: p.messages.map((m) => ({ role: m.role, content: anthropicContent(m) })),
      stream: true,
    }),
  })
  if (!res.ok || !res.body) throw friendly(res.status, 'Claude', await readError(res))

  for await (const data of sseLines(res.body)) {
    if (!data || data === '[DONE]') continue
    let evt: any
    try {
      evt = JSON.parse(data)
    } catch {
      continue
    }
    if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
      yield evt.delta.text as string
    } else if (evt.type === 'error') {
      throw new ProviderError(500, `Claude 스트리밍 오류: ${evt.error?.message ?? 'unknown'}`)
    }
  }
}

// OpenAI chat/completions 는 이미지(image_url)만 지원. PDF 는 제외하고 안내를 붙인다.
function openaiContent(m: WireMessage): unknown {
  if (!m.attachments?.length) return m.content
  const images = m.attachments.filter((a) => a.kind === 'image')
  const hasPdf = m.attachments.some((a) => a.kind === 'pdf')
  if (images.length === 0 && !hasPdf) return m.content
  let text = m.content
  if (hasPdf) {
    text = (m.content ? m.content + '\n\n' : '') + '(참고: PDF 첨부는 이 모델에서 직접 지원되지 않아 제외되었습니다. 이미지는 첨부되었습니다.)'
  }
  const parts: unknown[] = [{ type: 'text', text }]
  for (const a of images) {
    parts.push({ type: 'image_url', image_url: { url: `data:${a.mediaType};base64,${a.data}` } })
  }
  return parts
}

// ---- OpenAI (GPT) ----------------------------------------------------------
async function* streamOpenAI(p: StreamParams): AsyncGenerator<string> {
  const messages = [
    { role: 'system', content: p.system },
    ...p.messages.map((m) => ({ role: m.role, content: openaiContent(m) })),
  ]
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify({ model: p.model, messages, stream: true }),
  })
  if (!res.ok || !res.body) throw friendly(res.status, 'GPT', await readError(res))

  for await (const data of sseLines(res.body)) {
    if (!data || data === '[DONE]') continue
    let evt: any
    try {
      evt = JSON.parse(data)
    } catch {
      continue
    }
    const delta = evt.choices?.[0]?.delta?.content
    if (typeof delta === 'string' && delta) yield delta
  }
}

// ---- Gemini ----------------------------------------------------------------
async function* streamGemini(p: StreamParams): AsyncGenerator<string> {
  // Gemini 는 role 이 'user' | 'model' 이고, system 은 systemInstruction 으로 분리.
  // 이미지·PDF 모두 inlineData(base64) 로 첨부 가능.
  const contents = p.messages.map((m) => {
    const parts: unknown[] = []
    if (m.content) parts.push({ text: m.content })
    for (const a of m.attachments ?? []) {
      parts.push({ inlineData: { mimeType: a.mediaType, data: a.data } })
    }
    if (parts.length === 0) parts.push({ text: '' })
    return { role: m.role === 'assistant' ? 'model' : 'user', parts }
  })
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(p.apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: p.system }] },
      contents,
    }),
  })
  if (!res.ok || !res.body) throw friendly(res.status, 'Gemini', await readError(res))

  for await (const data of sseLines(res.body)) {
    if (!data) continue
    let evt: any
    try {
      evt = JSON.parse(data)
    } catch {
      continue
    }
    const parts = evt.candidates?.[0]?.content?.parts
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (typeof part.text === 'string' && part.text) yield part.text
      }
    }
  }
}

export function streamProvider(p: StreamParams): AsyncGenerator<string> {
  switch (p.provider) {
    case 'anthropic':
      return streamAnthropic(p)
    case 'openai':
      return streamOpenAI(p)
    case 'gemini':
      return streamGemini(p)
  }
}

// 키가 설정된 프로바이더 목록 + 모델 ID (키 값은 절대 노출하지 않음).
export function providerAvailability(env: Record<string, string | undefined>) {
  const available: Record<string, boolean> = {}
  const models: Record<string, string> = {}
  for (const [provider, cfg] of Object.entries(MODELS)) {
    available[provider] = Boolean(env[cfg.envKey]?.trim())
    models[provider] = cfg.model
  }
  return { available, models }
}
