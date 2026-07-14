// POST /api/chat  (netlify.toml 이 /.netlify/functions/chat 로 리다이렉트)
// ----------------------------------------------------------------------------
// 브라우저는 오직 이 함수만 호출한다. 실제 프로바이더 API 키는 서버 환경변수로만
// 읽고, 프론트엔드 번들/응답 어디에도 노출하지 않는다.
// 요청 body: { provider: "anthropic"|"openai"|"gemini", messages: [{role, content}] }
// 응답: text/event-stream (SSE). 이벤트는 다음 세 종류의 JSON 페이로드.
//   data: {"delta":"...토큰..."}
//   data: {"done":true}
//   data: {"error":"사용자용 메시지"}
// ----------------------------------------------------------------------------

import { MODELS, SYSTEM_PROMPT, isProvider, type Provider } from './lib/models.mts'
import { streamProvider, ProviderError, type WireAttachment, type WireMessage } from './lib/llm.mts'

// base64 첨부 1개당 상한(대략 4MB 원본 ≈ 5.3MB base64). Netlify 함수 요청 본문
// 한도(~6MB)와 localStorage 안전을 함께 고려한 값.
const MAX_ATTACH_BASE64 = 6 * 1024 * 1024
// CSV/XLSX 등에서 추출한 평문 첨부 1개당 상한(대략 200K 글자). 과도한 프롬프트 방지.
const MAX_ATTACH_TEXT = 200 * 1024

function sanitizeAttachments(raw: unknown): WireAttachment[] | undefined {
  if (raw == null) return undefined
  if (!Array.isArray(raw)) return undefined
  const out: WireAttachment[] = []
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue
    const kind = (a as any).kind
    const mediaType = (a as any).mediaType
    const name = typeof (a as any).name === 'string' ? (a as any).name : undefined
    if (kind === 'text') {
      // CSV/XLSX 등: base64 대신 추출된 평문(text)만 받는다.
      let text = (a as any).text
      if (typeof text !== 'string' || !text.trim()) continue
      if (text.length > MAX_ATTACH_TEXT) text = text.slice(0, MAX_ATTACH_TEXT) + '\n…(내용이 길어 일부만 표시됨)'
      out.push({ kind: 'text', mediaType: typeof mediaType === 'string' ? mediaType : 'text/plain', data: '', text, name })
      continue
    }
    const data = (a as any).data
    if ((kind !== 'image' && kind !== 'pdf') || typeof mediaType !== 'string' || typeof data !== 'string') {
      continue
    }
    if (data.length > MAX_ATTACH_BASE64) continue
    out.push({ kind, mediaType, data, name })
  }
  return out.length ? out : undefined
}

interface ChatBody {
  provider?: unknown
  messages?: unknown
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function sanitizeMessages(raw: unknown): WireMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: WireMessage[] = []
  for (const m of raw) {
    if (!m || typeof m !== 'object') return null
    const role = (m as any).role
    const content = (m as any).content
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null
    out.push({ role, content, attachments: sanitizeAttachments((m as any).attachments) })
  }
  return out
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json(405, { error: 'POST 만 허용됩니다.' })
  }

  let body: ChatBody
  try {
    body = (await req.json()) as ChatBody
  } catch {
    return json(400, { error: '요청 본문(JSON)을 해석할 수 없습니다.' })
  }

  const provider = body.provider
  if (!isProvider(provider)) {
    return json(400, { error: '알 수 없는 provider 입니다. (anthropic | openai | gemini)' })
  }

  const messages = sanitizeMessages(body.messages)
  if (!messages) {
    return json(400, { error: 'messages 형식이 올바르지 않습니다.' })
  }

  const cfg = MODELS[provider as Provider]
  const apiKey = process.env[cfg.envKey]?.trim()
  if (!apiKey) {
    return json(503, {
      error: `이 모델의 API 키가 서버에 설정되어 있지 않습니다. 선생님/운영자에게 문의하세요. (${cfg.envKey})`,
    })
  }

  // 프로바이더로는 선택된 모델과 메시지 배열만 전달한다(사용자 식별정보 없음).
  const gen = streamProvider({
    provider: provider as Provider,
    apiKey,
    model: cfg.model,
    system: SYSTEM_PROMPT,
    messages,
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      // 프로바이더 첫 토큰을 기다리기 전에 바이트를 먼저 흘려 스트림을 확립한다.
      // (느린 첫 토큰으로 연결이 빈 채 끊겨 ERR_EMPTY_RESPONSE 가 나는 것을 방지.
      //  ':' 로 시작하는 SSE 주석 라인이라 클라이언트는 무시한다.)
      controller.enqueue(encoder.encode(': ok\n\n'))
      try {
        for await (const delta of gen) {
          if (delta) send({ delta })
        }
        send({ done: true })
      } catch (err) {
        const message =
          err instanceof ProviderError
            ? err.message
            : err instanceof Error
              ? `오류가 발생했습니다: ${err.message}`
              : '알 수 없는 오류가 발생했습니다.'
        send({ error: message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
