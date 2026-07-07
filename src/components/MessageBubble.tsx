import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from './CodeBlock'
import type { Message } from '@/types'

interface Props {
  message: Message
  studentName: string
  streaming?: boolean
}

function AiAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm ring-1 ring-slate-200">
      🤖
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

// 어시스턴트 답변용 Markdown 렌더러. 코드블록은 CodeBlock(복사/미리보기)로.
function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children }) {
          const text = String(children ?? '')
          const match = /language-(\w+)/.exec(className || '')
          const isBlock = Boolean(match) || text.includes('\n')
          if (!isBlock) {
            return (
              <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em] text-indigo-700">
                {text}
              </code>
            )
          }
          return <CodeBlock language={match?.[1] ?? ''} code={text.replace(/\n$/, '')} />
        },
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal pl-5">{children}</ol>,
        li: ({ children }) => <li className="my-0.5">{children}</li>,
        h1: ({ children }) => <h1 className="mb-2 mt-3 text-lg font-bold">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-3 text-base font-bold">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-2 font-semibold">{children}</h3>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 underline"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-slate-300 pl-3 text-slate-500">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left">{children}</th>
        ),
        td: ({ children }) => <td className="border border-slate-200 px-2 py-1">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export default function MessageBubble({ message, studentName, streaming }: Props) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex w-full gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <AiAvatar />}
      <div
        className={[
          'max-w-[85%] break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'whitespace-pre-wrap bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-indigo-500/20'
            : 'bg-white text-slate-800 ring-1 ring-slate-100',
        ].join(' ')}
      >
        {isUser ? (
          message.content
        ) : message.content ? (
          <AssistantMarkdown content={message.content} />
        ) : (
          <span className="text-slate-400">생각하는 중…</span>
        )}
        {!isUser && streaming && message.content && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-slate-400 align-middle" />
        )}
      </div>
      {isUser && <StudentAvatar name={studentName} />}
    </div>
  )
}
