import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import MessageBubble from './MessageBubble'
import ConversationStarters from './ConversationStarters'
import { getVocativeName } from '@/lib/roster'
import { newId } from '@/lib/storage'
import { hasProvider } from '@/lib/api'
import { PROVIDER_LABEL } from '@/types'
import type { Attachment, LlmProvider, Message, ProviderInfo, Starter, Student } from '@/types'
import type { Artifact } from '@/lib/artifact'

interface Props {
  student: Student
  messages: Message[]
  isPending: boolean
  onSend: (content: string, attachments?: Attachment[]) => void
  onStop: () => void
  onPickStarter: (s: Starter) => void
  onOpenArtifact: (a: Artifact) => void
  providerInfo: ProviderInfo | null
  selectedProvider: LlmProvider | null
  onSelectProvider: (p: LlmProvider) => void
}

const PROVIDERS: LlmProvider[] = ['claude', 'openai', 'gemini']
// 파일 1개 상한. localStorage 및 Netlify 함수 요청 한도를 함께 고려.
const MAX_FILE_BYTES = 4 * 1024 * 1024
// CSV/XLSX 에서 추출한 평문의 최대 글자 수(localStorage·프롬프트 보호).
const MAX_TEXT_CHARS = 200 * 1024

function extLower(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

// 이미지/PDF 는 base64(data: 접두사 제외)로 읽는다.
function readBinaryAttachment(file: File, kind: 'image' | 'pdf'): Promise<Attachment | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      if (comma === -1) return resolve(null)
      const meta = result.slice(0, comma) // data:<mime>;base64
      const data = result.slice(comma + 1)
      const mediaType = meta.slice(5, meta.indexOf(';')) || file.type
      resolve({ id: newId(), kind, name: file.name, mediaType, data })
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

// XLSX 를 시트별 CSV 텍스트로 변환(브라우저에서 SheetJS 로 파싱).
// SheetJS 는 용량이 커서, 실제로 엑셀을 첨부할 때만 동적 import 로 불러온다
// (초기 번들을 가볍게 유지 → 수업 중 학생 접속 속도 보호).
async function xlsxToText(buf: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buf, { type: 'array' })
  const parts = wb.SheetNames.map((nm) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[nm]!)
    return wb.SheetNames.length > 1 ? `# 시트: ${nm}\n${csv}` : csv
  })
  return parts.join('\n\n')
}

function clampText(text: string): string {
  return text.length > MAX_TEXT_CHARS
    ? text.slice(0, MAX_TEXT_CHARS) + '\n…(내용이 길어 일부만 표시됨)'
    : text
}

// 파일을 첨부(Attachment)로 변환. 이미지/PDF 는 base64, CSV/XLSX 는 평문(text)으로.
// 지원하지 않는 형식은 null.
async function readAsAttachment(file: File): Promise<Attachment | null> {
  const ext = extLower(file.name)
  if (file.type === 'application/pdf' || ext === 'pdf') return readBinaryAttachment(file, 'pdf')
  if (file.type.startsWith('image/')) return readBinaryAttachment(file, 'image')

  const isCsv = file.type === 'text/csv' || ext === 'csv'
  const isXlsx =
    ext === 'xlsx' ||
    ext === 'xls' ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'

  try {
    if (isXlsx) {
      const text = clampText(await xlsxToText(await file.arrayBuffer()))
      if (!text.trim()) return null
      return { id: newId(), kind: 'text', name: file.name, mediaType: 'text/csv', data: '', text }
    }
    if (isCsv) {
      const text = clampText(await file.text())
      if (!text.trim()) return null
      return { id: newId(), kind: 'text', name: file.name, mediaType: 'text/csv', data: '', text }
    }
  } catch {
    return null
  }
  return null
}

export default function ChatArea({
  student,
  messages,
  isPending,
  onSend,
  onStop,
  onPickStarter,
  onOpenArtifact,
  providerInfo,
  selectedProvider,
  onSelectProvider,
}: Props) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isPending])

  function submit() {
    const content = input.trim()
    if ((!content && attachments.length === 0) || isPending) return
    onSend(content, attachments.length ? attachments : undefined)
    setInput('')
    setAttachments([])
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  async function handleFiles(files: FileList) {
    const next: Attachment[] = []
    const skipped: string[] = []
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        skipped.push(`${file.name} (4MB 초과)`)
        continue
      }
      const att = await readAsAttachment(file)
      if (att) next.push(att)
      else skipped.push(`${file.name} (이미지·PDF·CSV·XLSX만 가능)`)
    }
    if (next.length) setAttachments((prev) => [...prev, ...next])
    if (skipped.length) alert('첨부하지 못한 파일:\n' + skipped.join('\n'))
  }

  const showEmpty = messages.length === 0
  const noProviders = PROVIDERS.every((p) => !hasProvider(providerInfo, p))
  const lastId = messages.length ? messages[messages.length - 1]!.id : null
  const canSend = Boolean(input.trim()) || attachments.length > 0

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
              탐구하고 싶은 게 있으면 편하게 물어봐. 이미지·PDF·엑셀(xlsx)·CSV도 첨부할 수 있어.
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
                onOpenArtifact={onOpenArtifact}
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

        {/* 첨부 대기 목록 */}
        {attachments.length > 0 && (
          <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1"
              >
                {a.kind === 'image' ? (
                  <img
                    src={`data:${a.mediaType};base64,${a.data}`}
                    alt={a.name}
                    className="h-8 w-8 rounded object-cover"
                  />
                ) : (
                  <span className="text-lg">{a.kind === 'text' ? '📊' : '📄'}</span>
                )}
                <span className="max-w-[140px] truncate text-xs text-slate-600" title={a.name}>
                  {a.name}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  className="text-slate-400 transition hover:text-red-500"
                  title="제거"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="mx-auto flex max-w-3xl items-end gap-2"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isPending}
            aria-label="이미지·PDF·엑셀·CSV 첨부"
            title="이미지·PDF·엑셀(xlsx)·CSV 첨부"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
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
              disabled={!canSend}
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
