import { useState } from 'react'
import { marked } from 'marked'
import Markdown from './Markdown'
import type { Artifact } from '@/lib/artifact'

interface Props {
  artifact: Artifact
  onClose: () => void
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 인쇄/HTML/Word 공용 문서 스타일(캔버스와 별개로 독립 실행되는 문서용).
const DOC_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Pretendard', -apple-system, 'Malgun Gothic', sans-serif;
    line-height: 1.7; color: #1e293b; max-width: 800px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 1.8em; margin: 0.6em 0 0.4em; }
  h2 { font-size: 1.4em; margin: 0.6em 0 0.3em; }
  h3 { font-size: 1.15em; margin: 0.5em 0 0.3em; }
  p { margin: 0.5em 0; }
  ul, ol { padding-left: 1.4em; margin: 0.5em 0; }
  table { border-collapse: collapse; margin: 0.8em 0; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
  th { background: #f1f5f9; }
  code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #0f172a; color: #e2e8f0; padding: 14px; border-radius: 8px; overflow-x: auto; }
  pre code { background: transparent; color: inherit; padding: 0; }
  blockquote { border-left: 3px solid #cbd5e1; padding-left: 12px; color: #64748b; margin: 0.6em 0; }
  img { max-width: 100%; }
  @media print { body { margin: 0; max-width: none; } }
`

// 아티팩트를 독립 실행 가능한 완결된 HTML 문자열로.
function toFullHtml(artifact: Artifact): string {
  if (artifact.type === 'html') return artifact.content
  const body = String(marked.parse(artifact.content))
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(
    artifact.title,
  )}</title><style>${DOC_CSS}</style></head><body>${body}</body></html>`
}

// Word(.doc): Word 는 HTML 을 열 수 있으므로 HTML 을 .doc 로 저장한다.
function toWordDoc(artifact: Artifact): string {
  const body = artifact.type === 'html' ? artifact.content : String(marked.parse(artifact.content))
  return (
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(artifact.title)}</title><style>${DOC_CSS}</style></head>` +
    `<body>${body}</body></html>`
  )
}

function download(filename: string, mime: string, text: string) {
  const blob = new Blob(['﻿' + text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function openPrint(fullHtml: string) {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) {
    alert('팝업이 차단되어 PDF 인쇄 창을 열 수 없습니다.\n브라우저에서 이 사이트의 팝업을 허용한 뒤 다시 시도하세요.')
    return
  }
  w.document.open()
  w.document.write(fullHtml)
  w.document.close()
  w.focus()
  const go = () => {
    try {
      w.print()
    } catch {
      // 무시
    }
  }
  // 이미지/폰트 로드 후 인쇄
  setTimeout(go, 400)
}

function safeName(title: string): string {
  return (title || '문서').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
}

export default function Canvas({ artifact, onClose }: Props) {
  const [tab, setTab] = useState<'view' | 'source'>('view')
  const isHtml = artifact.type === 'html'
  const name = safeName(artifact.title)

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-200 bg-white md:w-[46%] md:min-w-[380px] md:max-w-[720px]">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-lg">{isHtml ? '🌐' : '📄'}</span>
          <p className="truncate text-sm font-semibold text-slate-800" title={artifact.title}>
            {artifact.title}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="캔버스 닫기"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          ✕
        </button>
      </div>

      {/* 다운로드 + 보기 전환 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setTab('view')}
            className={`px-3 py-1 transition ${tab === 'view' ? 'bg-slate-100 font-medium text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {isHtml ? '미리보기' : '문서'}
          </button>
          <button
            type="button"
            onClick={() => setTab('source')}
            className={`px-3 py-1 transition ${tab === 'source' ? 'bg-slate-100 font-medium text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {isHtml ? '코드' : '원본'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400">다운로드</span>
          <button
            type="button"
            onClick={() => openPrint(toFullHtml(artifact))}
            className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-indigo-700"
            title="브라우저 인쇄로 PDF 저장"
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() => download(`${name}.doc`, 'application/msword', toWordDoc(artifact))}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100"
            title="Word(.doc) — Google 문서로도 열 수 있어요"
          >
            Word
          </button>
          <button
            type="button"
            onClick={() =>
              isHtml
                ? download(`${name}.html`, 'text/html', artifact.content)
                : download(`${name}.html`, 'text/html', toFullHtml(artifact))
            }
            className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100"
          >
            HTML
          </button>
          {!isHtml && (
            <button
              type="button"
              onClick={() => download(`${name}.md`, 'text/markdown', artifact.content)}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100"
            >
              MD
            </button>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="min-h-0 flex-1 overflow-auto bg-slate-50">
        {tab === 'source' ? (
          <pre className="m-0 h-full overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-relaxed text-slate-700">
            {artifact.content}
          </pre>
        ) : isHtml ? (
          <iframe
            title={artifact.title}
            sandbox="allow-scripts"
            srcDoc={artifact.content}
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <div className="mx-auto max-w-3xl bg-white p-6 text-sm leading-relaxed text-slate-800 shadow-sm">
            <Markdown content={artifact.content} />
          </div>
        )}
      </div>
    </aside>
  )
}
