// 어시스턴트 답변에서 "문서 산출물(아티팩트)"을 추출한다.
// 규칙: 완성된 문서/웹페이지는 하나의 코드펜스로 온다(시스템 프롬프트로 유도).
//   - ```html … ```           → 웹페이지(미리보기 가능)
//   - ```markdown / ```md …    → 문서(마크다운 렌더링)
// 캔버스에 표시하고 PDF/Word/HTML 로 내려받는다.

export type ArtifactType = 'html' | 'markdown'

export interface Artifact {
  type: ArtifactType
  title: string
  content: string
  /** 원본 메시지에서 이 블록이 차지한 펜스 전체(말풍선 표시에서 제거하는 데 사용) */
  raw: string
}

const FENCE = /```([A-Za-z0-9_-]+)?[ \t]*\r?\n([\s\S]*?)```/g
const MD_LANGS = new Set(['markdown', 'md', 'document', 'doc', 'report', '문서'])

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function htmlTitle(html: string): string {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (t && stripTags(t[1]!)) return stripTags(t[1]!)
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  if (h1 && stripTags(h1[1]!)) return stripTags(h1[1]!)
  return '문서'
}

function mdTitle(md: string): string {
  const h = /^\s{0,3}#{1,3}\s+(.+?)\s*#*\s*$/m.exec(md)
  if (h && h[1]!.trim()) return h[1]!.trim()
  const firstLine = md.trim().split('\n')[0]?.trim()
  return firstLine ? firstLine.slice(0, 40) : '문서'
}

// 메시지 본문에서 마지막 아티팩트 후보를 반환(없으면 null).
export function extractArtifact(content: string): Artifact | null {
  FENCE.lastIndex = 0
  let m: RegExpExecArray | null
  let picked: { type: ArtifactType; body: string; raw: string } | null = null
  while ((m = FENCE.exec(content)) !== null) {
    const lang = (m[1] ?? '').toLowerCase()
    const body = m[2] ?? ''
    if (lang === 'html' || lang === 'htm') {
      picked = { type: 'html', body, raw: m[0] }
    } else if (MD_LANGS.has(lang) && body.trim().length > 0) {
      picked = { type: 'markdown', body, raw: m[0] }
    }
  }
  if (!picked) return null
  const clean = picked.body.replace(/\n$/, '')
  return {
    type: picked.type,
    title: picked.type === 'html' ? htmlTitle(clean) : mdTitle(clean),
    content: clean,
    raw: picked.raw,
  }
}
