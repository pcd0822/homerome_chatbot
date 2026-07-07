import { useRef } from 'react'
import { getClassLabel } from '@/lib/roster'
import type { Conversation } from '@/types'

interface Props {
  collapsed: boolean
  onToggleCollapsed: () => void
  onNewConversation: () => void
  onResetMyData: () => void
  conversations: Conversation[]
  activeId: string | null
  onSelectConversation: (id: string) => void
  onRenameConversation: (id: string, title: string) => void
  onDeleteConversation: (id: string) => void
  onExport: () => void
  onImport: (file: File) => void
}

export default function Sidebar(props: Props) {
  const {
    collapsed,
    onToggleCollapsed,
    onNewConversation,
    onResetMyData,
    conversations,
    activeId,
    onSelectConversation,
    onRenameConversation,
    onDeleteConversation,
    onExport,
    onImport,
  } = props

  const fileRef = useRef<HTMLInputElement | null>(null)

  if (collapsed) {
    return (
      <aside className="flex h-full w-14 shrink-0 flex-col items-center justify-between border-r border-slate-200 bg-white py-3">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            title="사이드바 펼치기"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
          >
            ☰
          </button>
          <button
            type="button"
            onClick={onNewConversation}
            title="새 대화"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700"
          >
            ＋
          </button>
        </div>
        <button
          type="button"
          onClick={onResetMyData}
          title="내 데이터 초기화"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-red-500 transition hover:bg-red-50"
        >
          🗑
        </button>
      </aside>
    )
  }

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-[10px] font-medium text-indigo-600">{getClassLabel()}</p>
          <p className="text-sm font-semibold text-slate-800">탐구 챗봇</p>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="기록 숨기기"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          ✕
        </button>
      </div>

      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={onNewConversation}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          <span>＋</span> 새 대화
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between px-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          최근 항목
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onExport}
            title="대화 내보내기(JSON)"
            className="rounded p-1 text-[11px] text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            내보내기
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="대화 가져오기(JSON)"
            className="rounded p-1 text-[11px] text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            가져오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImport(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1">
        {sorted.length === 0 ? (
          <p className="px-2 py-2 text-xs text-slate-400">
            아직 대화가 없어요. 새 대화를 시작해 보세요.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {sorted.map((c) => {
              const active = c.id === activeId
              return (
                <li key={c.id}>
                  <div
                    className={[
                      'group flex items-center rounded-lg px-2 py-1.5 text-xs transition',
                      active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectConversation(c.id)}
                      className="flex-1 truncate text-left"
                      title={c.title}
                    >
                      {c.title || '제목 없음'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const next = window.prompt('대화 이름 변경', c.title)
                        if (next != null && next.trim()) onRenameConversation(c.id, next.trim())
                      }}
                      className="ml-1 opacity-0 transition group-hover:opacity-100"
                      title="이름 변경"
                    >
                      <span className="text-slate-400 hover:text-slate-600">✎</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`"${c.title}" 대화를 삭제할까요?`)) onDeleteConversation(c.id)
                      }}
                      className="ml-1 opacity-0 transition group-hover:opacity-100"
                      title="삭제"
                    >
                      <span className="text-red-500">🗑</span>
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-100 px-3 py-3">
        <button
          type="button"
          onClick={onResetMyData}
          className="w-full rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
        >
          내 데이터 초기화
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
          대화는 이 기기에만 저장됩니다. 서버에는 저장되지 않아요.
        </p>
      </div>
    </aside>
  )
}
