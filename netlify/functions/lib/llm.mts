// ============================================================================
// 프로바이더 어댑터 — 세 LLM 의 REST 스트리밍 API 를 공통 형식으로 정규화.
// ============================================================================
// - SDK 를 쓰지 않고 REST 엔드포인트를 직접 호출합니다(요청서 명세 4장).
//   그래야 함수 번들이 가볍고, 각 API 의 스트리밍 포맷을 우리가 통제합니다.
// - 각 어댑터는 "텍스트 조각(delta)"만 async generator 로 흘려보냅니다.
//   호출자(chat.mts)가 이를 받아 클라이언트로 다시 SSE 로 전달합니다.
// ============================================================================

import { MODELS, type Provider } from './models.mts'

export interface WireAttachment {
  kind: 'image' | 'pdf' | 'text'
  mediaType: string
  data: string // image/pdf: base64 (no data: prefix). text: 사용 안 함('')
  name?: string
  text?: string // kind 'text'(CSV/XLSX 등)에서 추출한 평문
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
  /** 응답 최대 출력 토큰(모델별 상한). MODELS[provider].maxTokens 에서 온다. */
  maxTokens: number
  system: string
  messages: WireMessage[]
  /**
   * 이번 요청에서 허용할 웹 검색 최대 횟수. 0 이면 검색 도구를 아예 붙이지 않는다.
   * 학생 코드·모델별 누적 상한(20회)의 "남은 예산"을 클라이언트가 계산해 넘긴다.
   * - Claude 는 이 값을 도구의 max_uses 로 그대로 전달(요청당 하드 상한).
   * - OpenAI/Gemini 는 검색 횟수를 요청 단위로 제한하는 파라미터가 없어, 0 이면
   *   도구 미부착으로만 막는다(남은 예산이 0 이 되면 다음 요청부터 검색 불가).
   */
  searchMaxUses: number
  /**
   * 어댑터가 이번 요청에서 실제로 수행한 웹 검색 횟수를 기록하는 가변 객체.
   * 호출자(chat.mts)가 스트림 종료 후 읽어 클라이언트로 되돌려준다(누적 카운터 반영).
   */
  stats: { searchCount: number }
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

// CSV/XLSX 등 "텍스트로 추출된" 첨부는 어떤 프로바이더든 읽을 수 있도록
// 프롬프트 본문에 라벨과 함께 덧붙인다(바이너리 업로드 대신 평문 주입).
function textAttachmentsAppendix(m: WireMessage): string {
  const texts = (m.attachments ?? []).filter((a) => a.kind === 'text' && a.text)
  if (!texts.length) return ''
  return (
    '\n\n' +
    texts
      .map(
        (a) =>
          `===== 첨부 파일: ${a.name ?? '파일'} =====\n${a.text}\n===== (${a.name ?? '파일'} 끝) =====`,
      )
      .join('\n\n')
  )
}

// 본문 + 텍스트 첨부를 합친 최종 사용자 텍스트.
function combinedText(m: WireMessage): string {
  return (m.content ?? '') + textAttachmentsAppendix(m)
}

// 첨부파일이 있는 메시지를 Anthropic content block 배열로 변환.
function anthropicContent(m: WireMessage): unknown {
  const media = (m.attachments ?? []).filter((a) => a.kind === 'image' || a.kind === 'pdf')
  const text = combinedText(m)
  if (media.length === 0) return text
  const blocks: unknown[] = []
  for (const a of media) {
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
  blocks.push({ type: 'text', text: text || '(첨부 파일을 참고해 답해주세요)' })
  return blocks
}

// ---- Anthropic (Claude) ----------------------------------------------------
async function* streamAnthropic(p: StreamParams): AsyncGenerator<string> {
  // 웹 검색 서버 도구. 남은 예산(searchMaxUses)이 있을 때만 붙이고, 그 값을
  // max_uses 로 넘겨 이번 요청의 검색 횟수를 하드하게 제한한다.
  // (web_search_20260209 은 Claude Sonnet 5 / Opus 4.8 등에서 지원 — 별도 beta 헤더 불필요)
  const tools =
    p.searchMaxUses > 0
      ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: p.searchMaxUses }]
      : undefined
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': p.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: p.model,
      max_tokens: p.maxTokens,
      system: p.system,
      messages: p.messages.map((m) => ({ role: m.role, content: anthropicContent(m) })),
      tools,
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
    } else if (evt.type === 'message_delta') {
      // 실제 수행된 웹 검색 횟수는 누적 usage 로 온다(server_tool_use.web_search_requests).
      const n = evt.usage?.server_tool_use?.web_search_requests
      if (typeof n === 'number') p.stats.searchCount = Math.max(p.stats.searchCount, n)
    } else if (evt.type === 'error') {
      throw new ProviderError(500, `Claude 스트리밍 오류: ${evt.error?.message ?? 'unknown'}`)
    }
  }
}

// OpenAI Responses API 의 input 항목으로 변환.
// 웹 검색 도구(web_search)를 쓰려면 chat/completions 가 아니라 Responses API 가 필요하다.
// - user: 텍스트는 input_text, 이미지는 input_image, PDF 는 input_file 로 넣는다.
//   (CSV/XLSX 는 combinedText 로 이미 본문에 주입됨)
// - assistant: 지난 답변은 문자열로 그대로 전달.
function openaiInput(messages: WireMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'assistant') {
      return { role: 'assistant', content: m.content ?? '' }
    }
    const text = combinedText(m)
    const media = (m.attachments ?? []).filter((a) => a.kind === 'image' || a.kind === 'pdf')
    if (media.length === 0) {
      return { role: 'user', content: text }
    }
    const parts: unknown[] = [
      { type: 'input_text', text: text || '(첨부 파일을 참고해 답해주세요)' },
    ]
    for (const a of media) {
      if (a.kind === 'image') {
        parts.push({ type: 'input_image', image_url: `data:${a.mediaType};base64,${a.data}` })
      } else {
        parts.push({
          type: 'input_file',
          filename: a.name ?? 'document.pdf',
          file_data: `data:application/pdf;base64,${a.data}`,
        })
      }
    }
    return { role: 'user', content: parts }
  })
}

// ---- OpenAI (GPT) ----------------------------------------------------------
async function* streamOpenAI(p: StreamParams): AsyncGenerator<string> {
  // 남은 예산이 있을 때만 웹 검색 도구를 붙인다(요청당 횟수 제한 파라미터는 없음 →
  // 예산이 0 이 되면 도구 미부착으로만 검색을 막는다).
  const tools = p.searchMaxUses > 0 ? [{ type: 'web_search' }] : undefined
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify({
      model: p.model,
      instructions: p.system,
      input: openaiInput(p.messages),
      tools,
      max_output_tokens: p.maxTokens,
      stream: true,
    }),
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
    switch (evt.type) {
      case 'response.output_text.delta':
        if (typeof evt.delta === 'string' && evt.delta) yield evt.delta
        break
      case 'response.output_item.added':
        // 웹 검색 호출이 하나 시작될 때마다 1 회로 카운트.
        if (evt.item?.type === 'web_search_call') p.stats.searchCount++
        break
      case 'error':
      case 'response.error':
      case 'response.failed': {
        const msg =
          evt.response?.error?.message ?? evt.error?.message ?? evt.message ?? 'unknown'
        throw new ProviderError(500, `GPT 스트리밍 오류: ${msg}`)
      }
    }
  }
}

// ---- Gemini ----------------------------------------------------------------
async function* streamGemini(p: StreamParams): AsyncGenerator<string> {
  // Gemini 는 role 이 'user' | 'model' 이고, system 은 systemInstruction 으로 분리.
  // 이미지·PDF 모두 inlineData(base64) 로 첨부 가능.
  const contents = p.messages.map((m) => {
    const parts: unknown[] = []
    const text = combinedText(m) // 본문 + CSV/XLSX 등 텍스트 첨부
    if (text) parts.push({ text })
    for (const a of m.attachments ?? []) {
      if (a.kind === 'text') continue // 텍스트 첨부는 위 text 로 이미 주입됨
      parts.push({ inlineData: { mimeType: a.mediaType, data: a.data } })
    }
    if (parts.length === 0) parts.push({ text: '' })
    return { role: m.role === 'assistant' ? 'model' : 'user', parts }
  })
  // Google 검색 그라운딩. 남은 예산이 있을 때만 붙인다(요청당 횟수 제한 파라미터는 없음).
  const tools = p.searchMaxUses > 0 ? [{ google_search: {} }] : undefined
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(p.apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: p.system }] },
      contents,
      tools,
      generationConfig: {
        maxOutputTokens: p.maxTokens,
        // 사고(thinking)를 최소로 낮춰 첫 토큰을 빨리 흘린다(타임아웃/느린 응답 방지).
        // ⚠️ Gemini 3.x 는 thinkingBudget 이 아니라 thinkingLevel 을 쓴다('minimal'|'low'|
        //    'medium'|'high'). 3.x 는 사고를 완전히 끌 수 없어 'minimal' 이 최저값이다.
        //    (구형 2.5 계열로 되돌릴 경우엔 { thinkingBudget: 0 } 으로 바꿔야 함)
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
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
    // 실제 검색 횟수: groundingMetadata.webSearchQueries(발행한 검색어 목록) 길이.
    // 보통 마지막 청크에 한 번 실려 오므로 최댓값으로 반영한다.
    const queries = evt.candidates?.[0]?.groundingMetadata?.webSearchQueries
    if (Array.isArray(queries)) {
      p.stats.searchCount = Math.max(p.stats.searchCount, queries.length)
    }
  }
}

export function streamProvider(p: StreamParams): AsyncGenerator<string> {
  switch (p.provider) {
    // 기본(Sonnet)·고급(Opus) 모두 Anthropic API. 모델 ID(p.model)만 다르다.
    case 'anthropic':
    case 'anthropic_opus':
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
