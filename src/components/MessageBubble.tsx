import Markdown from './Markdown'
import { extractArtifact, type Artifact } from '@/lib/artifact'
import type { Message } from '@/types'

interface Props {
  message: Message
  studentName: string
  streaming?: boolean
  onOpenArtifact?: (a: Artifact) => void
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

function AttachmentList({ message }: { message: Message }) {
  if (!message.attachments?.length) return null
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {message.attachments.map((a) =>
        a.kind === 'image' ? (
          <img
            key={a.id}
            src={`data:${a.mediaType};base64,${a.data}`}
            alt={a.name}
            className="max-h-40 max-w-[200px] rounded-lg object-contain"
          />
        ) : (
          <div key={a.id} className="flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1 text-xs">
            <span>📄</span>
            <span className="max-w-[160px] truncate" title={a.name}>
              {a.name}
            </span>
          </div>
        ),
      )}
    </div>
  )
}

function ArtifactCard({ artifact, onOpen }: { artifact: Artifact; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-2 flex w-full items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-left transition hover:bg-indigo-100"
    >
      <span className="text-xl">{artifact.type === 'html' ? '🌐' : '📄'}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-indigo-800">{artifact.title}</p>
        <p className="text-[11px] text-indigo-500">
          {artifact.type === 'html' ? '웹페이지' : '문서'} · 캔버스에서 열기 →
        </p>
      </div>
    </button>
  )
}

export default function MessageBubble({ message, studentName, streaming, onOpenArtifact }: Props) {
  const isUser = message.role === 'user'

  // 완료된 어시스턴트 메시지에서만 아티팩트 카드를 노출(스트리밍 중엔 일반 텍스트).
  const artifact = !isUser && !streaming ? extractArtifact(message.content) : null
  const displayContent =
    artifact && artifact.raw ? message.content.replace(artifact.raw, '').trim() : message.content

  return (
    <div className={`flex w-full gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <AiAvatar />}
      <div
        className={[
          'max-w-[85%] break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-indigo-500/20'
            : 'bg-white text-slate-800 ring-1 ring-slate-100',
        ].join(' ')}
      >
        <AttachmentList message={message} />
        {artifact && onOpenArtifact && (
          <ArtifactCard artifact={artifact} onOpen={() => onOpenArtifact(artifact)} />
        )}
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : message.content ? (
          // 스트리밍 중엔 일반 텍스트(마크다운 재파싱 회피 → 부드러움), 완료 시 마크다운.
          streaming ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : displayContent ? (
            <Markdown content={displayContent} />
          ) : (
            <span className="text-slate-400">문서를 캔버스에 표시했어요. 카드를 눌러 열어보세요.</span>
          )
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
