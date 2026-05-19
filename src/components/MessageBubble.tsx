import type { Message } from '@/types'

interface Props {
  message: Message
  studentName: string
}

function AiAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
      <img
        src="/ai-icon.png"
        alt="AI"
        className="h-8 w-8 object-cover"
        onError={(e) => {
          // 9단계에서 실제 아이콘 파일이 들어오기 전까지의 안전망.
          const target = e.currentTarget
          target.style.display = 'none'
          const parent = target.parentElement
          if (parent && !parent.dataset.fallback) {
            parent.dataset.fallback = '1'
            parent.textContent = '🤖'
          }
        }}
      />
    </div>
  )
}

function StudentAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0) || '?'
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
      {initial}
    </div>
  )
}

export default function MessageBubble({ message, studentName }: Props) {
  const isUser = message.role === 'user'
  return (
    <div
      className={`flex w-full gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && <AiAvatar />}
      <div
        className={[
          'max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-indigo-500/20'
            : 'bg-white text-slate-800 ring-1 ring-slate-100',
        ].join(' ')}
      >
        {message.content}
      </div>
      {isUser && <StudentAvatar name={studentName} />}
    </div>
  )
}
