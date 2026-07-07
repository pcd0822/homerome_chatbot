import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import MessageBubble from './MessageBubble'
import ConversationStarters from './ConversationStarters'
import { getVocativeName } from '@/lib/roster'
import { hasProvider } from '@/lib/api'
import { PROVIDER_LABEL } from '@/types'
import type { LlmProvider, Message, ProviderInfo, Starter, Student } from '@/types'

interface Props {
  student: Student
  messages: Message[]
  isPending: boolean
  onSend: (content: string) => void
  onStop: () => void
  onPickStarter: (s: Starter) => void
  providerInfo: ProviderInfo | null
  selectedProvider: LlmProvider | null
  onSelectProvider: (p: LlmProvider) => void
}

const PROVIDERS: LlmProvider[] = ['claude', 'openai', 'gemini']

export default function ChatArea({
  student,
  messages,
  isPending,
  onSend,
  onStop,
  onPickStarter,
  providerInfo,
  selectedProvider,
  onSelectProvider,
}: Props) {
  const [input, setInput] = useState('')
  const listEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isPending])

  function submit() {
    const content = input.trim()
    if (!content || isPending) return
    onSend(content)
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter 전송 / Shift+Enter 줄바꿈
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const showEmpty = messages.length === 0
  const noProviders = PROVIDERS.every((p) => !hasProvider(providerInfo, p))
  const lastId = messages.length ? messages[messages.length - 1]!.id : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {showEmpty ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="text-3xl">👋</div>
            <h2 className="mt-3 text-xl font-bold text-slate-800">
              안녕 {getVocativeName(student.name)}!
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              탐구하고 싶은 게 있으면 편하게 물어봐. 아래 버튼으로 시작해도 좋아.
            </p>
            <ConversationStarters onPick={onPickStarter} disabled={isPending} />
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                studentName={student.name}
                streaming={isPending && m.id === lastId && m.role === 'assistant'}
              />
            ))}
            <div ref={listEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
        {/* 모델 선택 — 대화 중간에 바꿔도 다음 메시지부터 이어서 적용된다. */}
        <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium text-slate-400">모델</span>
          {PROVIDERS.map((p) => {
            const enabled = hasProvider(providerInfo, p)
            const active = selectedProvider === p
            const modelName = providerInfo?.models?.[p]
            return (
              <button
                key={p}
                type="button"
                onClick={() => onSelectProvider(p)}
                disabled={!enabled}
                title={enabled ? modelName : `${PROVIDER_LABEL[p]} 키 미설정`}
                className={[
                  'rounded-full px-3 py-1 text-xs font-medium transition',
                  active
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                    : enabled
                      ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      : 'cursor-not-allowed bg-slate-50 text-slate-300',
                ].join(' ')}
              >
                {PROVIDER_LABEL[p]}
                {!enabled && <span className="ml-1 text-[10px]">·키 없음</span>}
              </button>
            )
          })}
          {noProviders && (
            <span className="ml-1 text-[10px] text-amber-600">
              · 서버에 API 키가 설정되지 않았습니다
            </span>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="mx-auto flex max-w-3xl items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
          {isPending ? (
            <button
              type="button"
              onClick={onStop}
              className="h-11 shrink-0 rounded-2xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              중지
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="h-11 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 px-5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 transition hover:from-indigo-700 hover:to-indigo-600 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
            >
              전송
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
