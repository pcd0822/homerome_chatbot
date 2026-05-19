import { useEffect, useMemo, useState } from 'react'
import StudentLoginModal from '@/components/StudentLoginModal'
import Sidebar from '@/components/Sidebar'
import ChatArea from '@/components/ChatArea'
import { storage, newId } from '@/lib/storage'
import {
  getEnvApiKeys,
  getEnvDriveConfig,
  getEnvNeisConfig,
} from '@/lib/env'
import { getClassLabel } from '@/lib/roster'
import {
  DEFAULT_SYSTEM_PROMPT,
  hasKey,
  pickInitialProvider,
  sendMessage,
  type PdfAttachment,
} from '@/lib/llm'
import { fetchDriveContext, formatDriveFilesAsContext } from '@/lib/drive'
import { fetchNeisContext, formatNeisContextAsText } from '@/lib/neis'
import { PROVIDER_LABEL } from '@/types'
import type {
  Conversation,
  LlmProvider,
  Message,
  Starter,
  Student,
} from '@/types'

function truncateTitle(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= 20) return trimmed
  return trimmed.slice(0, 20) + '…'
}

export default function App() {
  // 환경 변수에서 한 번만 읽는다. 학생 PC에는 키가 저장되지 않는다.
  const apiKeys = useMemo(() => getEnvApiKeys(), [])
  const driveConfig = useMemo(() => getEnvDriveConfig(), [])
  const neisConfig = useMemo(() => getEnvNeisConfig(), [])

  const [student, setStudent] = useState<Student | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [selectedProvider, setSelectedProvider] = useState<LlmProvider | null>(
    null,
  )

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )
  const messages: Message[] = activeConversation?.messages ?? []

  useEffect(() => {
    const initialStudent = storage.getCurrentStudent()
    setStudent(initialStudent)
    setSidebarCollapsed(storage.getSidebarCollapsed())
    setSelectedProvider(
      pickInitialProvider(apiKeys, storage.getSelectedProvider()),
    )
    if (initialStudent) {
      setConversations(storage.getHistory(initialStudent.studentId))
    }
    setHydrated(true)
  }, [apiKeys])

  function persistConversations(
    studentId: string,
    next: Conversation[],
  ): void {
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
    storage.clearCurrentStudent()
    setStudent(null)
    setConversations([])
    setActiveId(null)
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
  }

  function handleSelectConversation(id: string) {
    setActiveId(id)
    const conv = conversations.find((c) => c.id === id)
    if (conv && hasKey(apiKeys, conv.provider)) {
      setSelectedProvider(conv.provider)
      storage.setSelectedProvider(conv.provider)
    }
  }

  function handleDeleteConversation(id: string) {
    if (!student) return
    const next = conversations.filter((c) => c.id !== id)
    persistConversations(student.studentId, next)
    if (activeId === id) setActiveId(null)
  }

  function handleResetMyData() {
    if (!student) return
    const ok = confirm(
      '이 학생의 대화 기록과 로그인 정보를 모두 삭제할까요? 되돌릴 수 없습니다.',
    )
    if (!ok) return
    storage.clearStudentData(student.studentId)
    setConversations([])
    setActiveId(null)
    setStudent(null)
  }

  function handleSelectProvider(p: LlmProvider) {
    if (!hasKey(apiKeys, p)) {
      alert(
        `${PROVIDER_LABEL[p]} 키가 환경 변수에 설정되어 있지 않습니다.\n` +
          `Netlify Site settings → Environment variables 에 키를 추가한 뒤 다시 배포하세요.`,
      )
      return
    }
    setSelectedProvider(p)
    storage.setSelectedProvider(p)
  }

  // Drive PDF 본문 첨부 여부 휴리스틱.
  // 매 메시지마다 PDF 를 첨부하면 토큰 한도(rate limit) 를 빠르게 소진하므로,
  // 학생 메시지에 자료 관련 키워드가 있을 때 또는 스타터 강제 옵션일 때만 첨부.
  function shouldAttachDrivePdf(content: string): boolean {
    const triggers = [
      '평가계획',
      '평가 기준',
      '평가기준',
      '평가 방법',
      '평가방법',
      '평가 비중',
      '평가비중',
      '수행평가',
      '수행 평가',
      '수행',
      '탐구활동',
      '탐구 활동',
      '탐구',
      '계획서',
      '보고서',
      '활동 자료',
      '활동자료',
    ]
    return triggers.some((t) => content.includes(t))
  }

  async function handleSend(
    content: string,
    options: { forceDrivePdf?: boolean } = {},
  ) {
    if (!student || isPending) return
    if (!selectedProvider || !hasKey(apiKeys, selectedProvider)) {
      alert('사용 가능한 LLM 키가 없습니다. 교사/운영자에게 문의하세요.')
      return
    }

    let convId = activeId
    let working: Conversation[] = conversations
    if (!convId) {
      const newConv: Conversation = {
        id: newId(),
        title: truncateTitle(content),
        provider: selectedProvider,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      convId = newConv.id
      working = [newConv, ...conversations]
      setActiveId(convId)
    }

    const userMsg: Message = {
      id: newId(),
      role: 'user',
      content,
      createdAt: Date.now(),
    }
    working = working.map((c) =>
      c.id === convId
        ? { ...c, messages: [...c.messages, userMsg], updatedAt: Date.now() }
        : c,
    )
    persistConversations(student.studentId, working)

    setIsPending(true)
    try {
      // 1) NEIS (학교 정보 + 학사일정 + 급식) — 매 메시지 자동 첨부, 토큰 작음
      let neisAddon = ''
      if (neisConfig) {
        try {
          const ctx = await fetchNeisContext(neisConfig)
          neisAddon = '\n\n' + formatNeisContextAsText(ctx)
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          // eslint-disable-next-line no-console
          console.error('[neis] fetchNeisContext 실패:', reason, err)
          neisAddon = `\n\n(참고: NEIS 학교 데이터를 가져오지 못했습니다. 사유: ${reason})`
        }
      }

      // 2) Drive 컨텍스트
      //    - 파일 목록(텍스트)은 매번 첨부 (가벼움)
      //    - PDF 본문 첨부는 스타터 강제 또는 학생 메시지에 자료 키워드가 있을 때만
      //      (rate limit 30k tpm 보호)
      let driveSystemAddon = ''
      let pdfAttachments: PdfAttachment[] | undefined
      if (driveConfig) {
        try {
          const onClaude = selectedProvider === 'claude'
          const wantsPdf =
            (options.forceDrivePdf ?? false) || shouldAttachDrivePdf(content)
          const ctx = await fetchDriveContext(driveConfig, {
            maxPdfCount: onClaude && wantsPdf ? 5 : 0,
            maxTotalBytes: 10 * 1024 * 1024,
          })
          // eslint-disable-next-line no-console
          console.info('[drive] context attached', {
            총_파일수: ctx.allFiles.length,
            PDF_첨부_요청: wantsPdf,
            첨부된_PDF: ctx.attachments.map((a) => a.file.name),
            제외된_파일: ctx.skipped.map((s) => `${s.file.name}(${s.reason})`),
          })
          const listText = formatDriveFilesAsContext(ctx.allFiles)
          driveSystemAddon = `\n\n## 학급 Google Drive 폴더 자료 목록\n${listText}`
          if (onClaude && ctx.attachments.length > 0) {
            pdfAttachments = ctx.attachments.map((a) => ({
              title: a.file.name,
              base64: a.base64,
            }))
            driveSystemAddon += `\n\n위 PDF ${ctx.attachments.length}개가 이번 메시지에 실제 첨부되었습니다. 내용을 직접 인용·요약해 답하세요.`
          } else if (wantsPdf && !onClaude) {
            driveSystemAddon +=
              '\n\n(PDF 직접 첨부는 Claude 모델에서만 가능합니다. 지금은 파일 목록만 보고 학생을 안내해 주세요.)'
          } else if (!wantsPdf) {
            driveSystemAddon +=
              '\n\n(이 질문은 PDF 본문을 첨부하지 않았습니다. 학생이 평가·수행평가·탐구 등 자료 관련 질문을 명시할 때 본문이 추가됩니다.)'
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          // eslint-disable-next-line no-console
          console.error('[drive] fetchDriveContext 실패:', reason, err)
          driveSystemAddon = `\n\n(참고: 학급 Drive 자료를 가져오지 못했습니다. 사유: ${reason})`
        }
      }

      const driveAndNeis = neisAddon + driveSystemAddon

      // LLM 호출
      const apiKey = apiKeys[selectedProvider]!
      const conv = working.find((c) => c.id === convId)!
      const res = await sendMessage({
        provider: selectedProvider,
        apiKey,
        messages: conv.messages,
        systemPrompt: DEFAULT_SYSTEM_PROMPT + driveAndNeis,
        pdfAttachments,
      })

      const assistantMsg: Message = {
        id: newId(),
        role: 'assistant',
        content: res.content,
        createdAt: Date.now(),
      }
      const next = working.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [...c.messages, assistantMsg],
              updatedAt: Date.now(),
            }
          : c,
      )
      persistConversations(student.studentId, next)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      const errMsg: Message = {
        id: newId(),
        role: 'assistant',
        content: `⚠️ 응답을 받지 못했어요.\n원인: ${reason}\n\n네트워크 또는 API 키 설정을 확인해 주세요.`,
        createdAt: Date.now(),
      }
      const next = working.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [...c.messages, errMsg],
              updatedAt: Date.now(),
            }
          : c,
      )
      persistConversations(student.studentId, next)
    } finally {
      setIsPending(false)
    }
  }

  function handlePickStarter(s: Starter) {
    // Drive 관련 스타터(평가계획서/탐구활동)는 PDF 본문 강제 첨부.
    // 일반 스타터는 NEIS/파일목록만으로 답변 가능.
    void handleSend(s.prompt, { forceDrivePdf: s.requiresDrive ?? false })
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
        onDeleteConversation={handleDeleteConversation}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <p className="text-[11px] font-medium text-indigo-600">
              {getClassLabel()}
            </p>
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
              <span className="font-semibold text-slate-800">
                {student.name}
              </span>{' '}
              학생
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
          onSend={(c) => void handleSend(c)}
          onPickStarter={handlePickStarter}
          apiKeys={apiKeys}
          selectedProvider={selectedProvider}
          onSelectProvider={handleSelectProvider}
        />
      </div>
    </div>
  )
}
