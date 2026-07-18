import { useEffect, useMemo, useRef, useState } from 'react'
import StudentLoginModal from '@/components/StudentLoginModal'
import Sidebar from '@/components/Sidebar'
import ChatArea from '@/components/ChatArea'
import Canvas from '@/components/Canvas'
import { storage, newId, SEARCH_LIMIT_PER_MODEL } from '@/lib/storage'
import { getClassLabel } from '@/lib/roster'
import { extractArtifact, type Artifact } from '@/lib/artifact'
import { fetchProviders, hasProvider, pickInitialProvider, streamChat } from '@/lib/api'
import { PROVIDER_LABEL } from '@/types'
import type {
  Attachment,
  Conversation,
  LlmProvider,
  Message,
  ProviderInfo,
  Starter,
  Student,
} from '@/types'

function truncateTitle(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= 24) return trimmed
  return trimmed.slice(0, 24) + '…'
}

export default function App() {
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null)
  const [student, setStudent] = useState<Student | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [selectedProvider, setSelectedProvider] = useState<LlmProvider | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [artifact, setArtifact] = useState<Artifact | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )
  const messages: Message[] = activeConversation?.messages ?? []

  // 최초 마운트: 로컬 상태 복원 + 서버에 사용 가능한 프로바이더 조회.
  useEffect(() => {
    const initialStudent = storage.getCurrentStudent()
    setStudent(initialStudent)
    setSidebarCollapsed(storage.getSidebarCollapsed())
    if (initialStudent) setConversations(storage.getHistory(initialStudent.studentId))
    setHydrated(true)

    let cancelled = false
    fetchProviders()
      .then((info) => {
        if (cancelled) return
        setProviderInfo(info)
        setSelectedProvider((prev) => pickInitialProvider(info, prev ?? storage.getSelectedProvider()))
      })
      .catch(() => {
        // 서버 조회 실패 시에도 UI 는 뜬다(전송 시 에러로 안내).
      })
    return () => {
      cancelled = true
    }
  }, [])

  function persist(studentId: string, next: Conversation[]): void {
    setConversations(next)
    storage.setHistory(studentId, next)
  }

  function handleLogin(s: Student) {
    storage.setCurrentStudent(s)
    setStudent(s)
    setConversations(storage.getHistory(s.studentId))
    setActiveId(null)
  }

  function handleLogout() {
    abortRef.current?.abort()
    storage.clearCurrentStudent()
    setStudent(null)
    setConversations([])
    setActiveId(null)
    setArtifact(null)
  }

  function handleToggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      storage.setSidebarCollapsed(next)
      return next
    })
  }

  function handleNewConversation() {
    setActiveId(null)
    setArtifact(null)
  }

  function handleSelectConversation(id: string) {
    setActiveId(id)
    const conv = conversations.find((c) => c.id === id)
    if (conv && hasProvider(providerInfo, conv.provider)) {
      setSelectedProvider(conv.provider)
      storage.setSelectedProvider(conv.provider)
    }
  }

  function handleRenameConversation(id: string, title: string) {
    if (!student) return
    persist(
      student.studentId,
      conversations.map((c) => (c.id === id ? { ...c, title } : c)),
    )
  }

  function handleDeleteConversation(id: string) {
    if (!student) return
    persist(student.studentId, conversations.filter((c) => c.id !== id))
    if (activeId === id) setActiveId(null)
  }

  function handleResetMyData() {
    if (!student) return
    const ok = confirm('이 학생의 대화 기록과 로그인 정보를 모두 삭제할까요? 되돌릴 수 없습니다.')
    if (!ok) return
    abortRef.current?.abort()
    storage.clearStudentData(student.studentId)
    setConversations([])
    setActiveId(null)
    setStudent(null)
    setArtifact(null)
  }

  function handleSelectProvider(p: LlmProvider) {
    if (!hasProvider(providerInfo, p)) {
      alert(
        `${PROVIDER_LABEL[p]} 모델은 현재 사용할 수 없습니다.\n` +
          `서버(Netlify) 환경변수에 API 키가 설정되어야 합니다.`,
      )
      return
    }
    setSelectedProvider(p)
    storage.setSelectedProvider(p)
  }

  function handleExport() {
    if (!student) return
    const blob = new Blob([JSON.stringify(conversations, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-${student.studentId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport(file: File) {
    if (!student) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Conversation[]
        if (!Array.isArray(parsed)) throw new Error('형식 오류')
        const existing = new Set(conversations.map((c) => c.id))
        const merged = [...conversations, ...parsed.filter((c) => c && c.id && !existing.has(c.id))]
        persist(student.studentId, merged)
      } catch {
        alert('가져오기에 실패했습니다. 올바른 JSON 파일인지 확인하세요.')
      }
    }
    reader.readAsText(file)
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  async function handleSend(content: string, attachments?: Attachment[]) {
    if (!student || isPending) return
    if (!content.trim() && !attachments?.length) return
    if (!selectedProvider || !hasProvider(providerInfo, selectedProvider)) {
      alert('사용 가능한 모델이 없습니다. 선생님/운영자에게 문의하세요.')
      return
    }

    const provider = selectedProvider
    const isNew = !activeId
    const base = isNew ? [] : (conversations.find((c) => c.id === activeId)?.messages ?? [])

    const userMsg: Message = {
      id: newId(),
      role: 'user',
      content,
      createdAt: Date.now(),
      attachments: attachments?.length ? attachments : undefined,
    }
    const assistantMsg: Message = { id: newId(), role: 'assistant', content: '', createdAt: Date.now() }

    const titleSeed = content.trim() || attachments?.[0]?.name || '파일 첨부'

    let convId = activeId
    let working: Conversation[]
    if (isNew) {
      convId = newId()
      const conv: Conversation = {
        id: convId,
        title: truncateTitle(titleSeed),
        provider,
        messages: [userMsg, assistantMsg],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      working = [conv, ...conversations]
      setActiveId(convId)
    } else {
      working = conversations.map((c) =>
        c.id === convId
          ? { ...c, provider, messages: [...c.messages, userMsg, assistantMsg], updatedAt: Date.now() }
          : c,
      )
    }
    setConversations(working)

    // API 로 보낼 히스토리: 이전 메시지 + 이번 사용자 메시지(빈 assistant 자리표시자 제외).
    const apiMessages: Message[] = [...base, userMsg]

    setIsPending(true)
    const controller = new AbortController()
    abortRef.current = controller

    // 어시스턴트 메시지 본문을 절대값으로 설정.
    const setAssistantContent = (text: string) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                updatedAt: Date.now(),
                messages: c.messages.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: text } : m,
                ),
              }
            : c,
        ),
      )
    }

    // 부드러운 스트리밍: 토큰마다 렌더링하지 않고 ~50ms 로 묶어서 반영한다.
    // (토큰마다 setState + 마크다운 재파싱을 하면 버벅인다.)
    let acc = ''
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleFlush = () => {
      if (flushTimer != null) return
      flushTimer = setTimeout(() => {
        flushTimer = null
        setAssistantContent(acc)
      }, 50)
    }

    // 웹 검색 남은 예산: 학생 코드·모델별 누적 상한(20회)에서 사용량을 뺀 값.
    // 0 이면 서버가 검색 도구를 붙이지 않아 이 모델의 검색이 비활성화된다.
    const searchUsed = storage.getSearchUsage(student.studentId, provider)
    const searchMaxUses = Math.max(0, SEARCH_LIMIT_PER_MODEL - searchUsed)

    try {
      await streamChat({
        provider,
        messages: apiMessages,
        signal: controller.signal,
        searchMaxUses,
        onDelta: (t) => {
          acc += t
          scheduleFlush()
        },
        onMeta: ({ searchCount }) => {
          if (searchCount > 0) storage.addSearchUsage(student.studentId, provider, searchCount)
        },
      })
    } catch (err) {
      const aborted =
        controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')
      if (!aborted) {
        const reason = err instanceof Error ? err.message : String(err)
        acc = acc ? acc + `\n\n⚠️ ${reason}` : `⚠️ 응답을 받지 못했어요.\n${reason}`
      }
    } finally {
      if (flushTimer != null) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      setAssistantContent(acc) // 최종본 확정
      // 문서/웹페이지 산출물이 있으면 캔버스 자동 열기.
      const finalArtifact = extractArtifact(acc)
      if (finalArtifact) setArtifact(finalArtifact)
      abortRef.current = null
      setIsPending(false)
      // 최종본을 localStorage 에 저장(스트리밍 중에는 메모리에만 반영).
      setConversations((prev) => {
        storage.setHistory(student.studentId, prev)
        return prev
      })
    }
  }

  function handlePickStarter(s: Starter) {
    void handleSend(s.prompt)
  }

  if (!hydrated) {
    return <div className="min-h-screen bg-slate-50" />
  }

  if (!student) {
    return <StudentLoginModal onLogin={handleLogin} />
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={handleToggleSidebar}
        onNewConversation={handleNewConversation}
        onResetMyData={handleResetMyData}
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={handleSelectConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onExport={handleExport}
        onImport={handleImport}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <p className="text-[11px] font-medium text-indigo-600">{getClassLabel()}</p>
            <p className="text-sm font-semibold text-slate-800">
              {activeConversation?.title ?? '새 대화'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {selectedProvider && (
              <span className="hidden rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-100 sm:inline-flex">
                {PROVIDER_LABEL[selectedProvider]}
              </span>
            )}
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{student.name}</span> 학생
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              학생 변경
            </button>
          </div>
        </header>

        <ChatArea
          student={student}
          messages={messages}
          isPending={isPending}
          onSend={(c, a) => void handleSend(c, a)}
          onStop={handleStop}
          onPickStarter={handlePickStarter}
          onOpenArtifact={setArtifact}
          providerInfo={providerInfo}
          selectedProvider={selectedProvider}
          onSelectProvider={handleSelectProvider}
        />
      </div>

      {artifact && <Canvas artifact={artifact} onClose={() => setArtifact(null)} />}
    </div>
  )
}
