import { useMemo, useState } from 'react'
import hljs from 'highlight.js'

interface Props {
  language: string
  code: string
}

function looksLikeHtml(code: string): boolean {
  return /<!doctype html|<html[\s>]|<body[\s>]|<div[\s>]|<canvas[\s>]|<svg[\s>]|<style[\s>]|<script[\s>]/i.test(
    code,
  )
}

export default function CodeBlock({ language, code }: Props) {
  const lang = (language || '').toLowerCase()
  const isHtml = lang === 'html' || lang === 'htm' || (!lang && looksLikeHtml(code))

  const [tab, setTab] = useState<'code' | 'preview'>('code')
  const [copied, setCopied] = useState(false)
  const [runKey, setRunKey] = useState(0)

  const highlighted = useMemo(() => {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value
      }
      return hljs.highlightAuto(code).value
    } catch {
      // 하이라이팅 실패 시 원문을 그대로(이스케이프해서) 보여준다.
      const div = document.createElement('div')
      div.textContent = code
      return div.innerHTML
    }
  }, [code, lang])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 클립보드 접근 불가(비보안 컨텍스트 등) — 무시
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {lang || (isHtml ? 'html' : 'code')}
          </span>
          {isHtml && (
            <div className="flex overflow-hidden rounded-md border border-slate-600">
              <button
                type="button"
                onClick={() => setTab('code')}
                className={`px-2 py-0.5 text-[11px] transition ${
                  tab === 'code' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                코드
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('preview')
                  setRunKey((k) => k + 1)
                }}
                className={`px-2 py-0.5 text-[11px] transition ${
                  tab === 'preview' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                미리보기
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isHtml && tab === 'preview' && (
            <button
              type="button"
              onClick={() => setRunKey((k) => k + 1)}
              className="text-[11px] text-slate-400 transition hover:text-slate-200"
            >
              ↻ 다시 실행
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            className="text-[11px] text-slate-400 transition hover:text-slate-200"
          >
            {copied ? '복사됨 ✓' : '복사'}
          </button>
        </div>
      </div>

      {isHtml && tab === 'preview' ? (
        // 샌드박스 iframe: allow-scripts 만 부여(allow-same-origin 없음)하여
        // 스크립트는 실행되지만 부모 페이지/오리진에는 접근할 수 없다.
        <iframe
          key={runKey}
          title="코드 미리보기"
          sandbox="allow-scripts"
          srcDoc={code}
          className="h-72 w-full border-0 bg-white"
        />
      ) : (
        <pre className="overflow-x-auto px-3 py-3">
          <code
            className="hljs bg-transparent p-0 text-[13px] leading-relaxed"
            // highlight.js 가 만든 토큰 span 을 주입. 원문은 위에서 이스케이프됨.
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      )}
    </div>
  )
}
