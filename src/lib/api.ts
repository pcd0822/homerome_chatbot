// 브라우저 → Netlify Function(/api/chat, /api/providers) 통신 레이어.
// API 키는 절대 여기(클라이언트)에 없다. 서버 함수가 대신 프로바이더를 호출한다.

import type { Attachment, LlmProvider, Message, ProviderInfo } from '@/types'

// 클라이언트 provider → 서버 body provider 매핑.
// claude=기본(Sonnet)→anthropic, claude_opus=고급(Opus)→anthropic_opus.
const CLIENT_TO_SERVER: Record<LlmProvider, string> = {
  claude: 'anthropic',
  claude_opus: 'anthropic_opus',
  openai: 'openai',
  gemini: 'gemini',
}

// 기본 선택 우선순위. 맨 앞(claude=Sonnet)이 기본값이 된다.
const PROVIDER_ORDER: LlmProvider[] = ['claude', 'claude_opus', 'openai', 'gemini']

/** 서버에 어떤 프로바이더 키가 설정됐는지 + 모델명 조회 (키 값은 오지 않음). */
export async function fetchProviders(): Promise<ProviderInfo> {
  const res = await fetch('/api/providers', { method: 'GET' })
  if (!res.ok) throw new Error(`프로바이더 정보를 불러오지 못했습니다 (${res.status})`)
  return (await res.json()) as ProviderInfo
}

export function hasProvider(info: ProviderInfo | null, p: LlmProvider): boolean {
  return Boolean(info?.available?.[p])
}

/** 마지막 선택 프로바이더가 사용 가능하면 유지, 아니면 사용 가능한 첫 번째. */
export function pickInitialProvider(
  info: ProviderInfo | null,
  last: LlmProvider | null,
): LlmProvider | null {
  if (last && hasProvider(info, last)) return last
  return PROVIDER_ORDER.find((p) => hasProvider(info, p)) ?? null
}

// 서버로 보내는 첨부는 UI 표시용 id 를 뺀 최소 형태.
// text 첨부(CSV/XLSX)는 base64 대신 추출 평문(text)만 보낸다.
function toWireAttachments(atts?: Attachment[]) {
  if (!atts?.length) return undefined
  return atts.map((a) =>
    a.kind === 'text'
      ? { kind: a.kind, mediaType: a.mediaType, name: a.name, text: a.text }
      : { kind: a.kind, mediaType: a.mediaType, data: a.data, name: a.name },
  )
}

export interface StreamChatArgs {
  provider: LlmProvider
  messages: Message[]
  onDelta: (text: string) => void
  signal?: AbortSignal
  /** 이번 요청에서 허용할 웹 검색 최대 횟수(학생·모델별 남은 예산). 0 이면 검색 비활성. */
  searchMaxUses?: number
  /** 스트림 종료 시 이번 요청에서 실제 수행된 검색 횟수 등을 전달. */
  onMeta?: (meta: { searchCount: number }) => void
}

/**
 * /api/chat 로 스트리밍 요청. 토큰이 올 때마다 onDelta 호출, 최종 전체 텍스트 반환.
 * 서버가 SSE 대신 JSON 에러를 주면(키 누락 등) Error 로 던진다.
 */
export async function streamChat(args: StreamChatArgs): Promise<string> {
  const { provider, messages, onDelta, signal, searchMaxUses, onMeta } = args

  const wireMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
    attachments: toWireAttachments(m.attachments),
  }))

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: CLIENT_TO_SERVER[provider],
      messages: wireMessages,
      searchMaxUses: searchMaxUses ?? 0,
    }),
    signal,
  })

  const contentType = res.headers.get('content-type') ?? ''
  if (!res.ok || !contentType.includes('text/event-stream') || !res.body) {
    let message = `요청에 실패했습니다 (HTTP ${res.status})`
    try {
      const j = await res.json()
      if (j?.error) message = j.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  const handlePayload = (payload: string) => {
    if (!payload) return
    let evt: { delta?: string; done?: boolean; error?: string; searchCount?: number }
    try {
      evt = JSON.parse(payload)
    } catch {
      return
    }
    if (evt.error) throw new Error(evt.error)
    if (typeof evt.delta === 'string') {
      full += evt.delta
      onDelta(evt.delta)
    }
    if (evt.done) {
      onMeta?.({ searchCount: typeof evt.searchCount === 'number' ? evt.searchCount : 0 })
    }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // SSE 이벤트는 빈 줄로 구분. 각 이벤트의 "data:" 라인만 처리.
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data:')) handlePayload(trimmed.slice(5).trim())
      }
    }
  }

  return full
}
