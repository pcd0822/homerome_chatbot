import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import MessageBubble from './MessageBubble'
import ConversationStarters from './ConversationStarters'
import type { Message, Starter, Student } from '@/types'

interface Props {
  student: Student
  messages: Message[]
  isPending: boolean
  onSend: (content: string) => void
  onPickStarter: (s: Starter) => void
}

export default function ChatArea({
  student,
  messages,
  isPending,
  onSend,
  onPickStarter,
}: Props) {
  const [input, setInput] = useState('')
  const listEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, isPending])

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {showEmpty ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="text-3xl">👋</div>
            <h2 className="mt-3 text-xl font-bold text-slate-800">
              {student.name} 학생, 환영합니다
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              궁금한 것을 자유롭게 물어보세요. 아래 버튼으로 자주 쓰는 도움도
              한 번에 받을 수 있어요.
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
              />
            ))}
            {isPending && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200 text-sm">
                  🤖
                </div>
                <div className="rounded-2xl bg-white px-4 py-2.5 text-sm text-slate-400 shadow-sm ring-1 ring-slate-100">
                  생각하는 중…
                </div>
              </div>
            )}
            <div ref={listEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
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
          <button
            type="submit"
            disabled={!input.trim() || isPending}
            className="h-11 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 px-5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 transition hover:from-indigo-700 hover:to-indigo-600 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
          >
            전송
          </button>
        </form>
      </div>
    </div>
  )
}
