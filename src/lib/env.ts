// 환경 변수에서 LLM 키 / 노션 MCP / Drive 서비스 계정 설정을 읽어오는 래퍼.
// 사용자(학생)는 어떤 비밀도 입력하지 않는다. 빌드 시점에 .env(로컬) 또는
// Netlify Environment variables 에서 인라인된 값만 사용한다.

import type {
  ApiKeys,
  DriveServiceAccountConfig,
  McpConfig,
} from '@/types'

function read(value: string | undefined): string {
  if (typeof value !== 'string') return ''
  let v = value.trim()
  // dotenv 가 처리 못 한 양쪽 따옴표가 남아 있으면 한 번 더 벗긴다.
  // (사용자가 .env 에 따옴표를 이중으로 넣었거나, 빌드 도구가 그대로 둔 경우)
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1)
  }
  return v
}

export function getEnvApiKeys(): ApiKeys {
  const keys: ApiKeys = {}
  const claude = read(import.meta.env.VITE_ANTHROPIC_API_KEY)
  if (claude) keys.claude = claude
  const openai = read(import.meta.env.VITE_OPENAI_API_KEY)
  if (openai) keys.openai = openai
  const gemini = read(import.meta.env.VITE_GEMINI_API_KEY)
  if (gemini) keys.gemini = gemini
  return keys
}

export function getEnvMcpConfig(): McpConfig {
  const cfg: McpConfig = {}
  const notionUrl = read(import.meta.env.VITE_NOTION_MCP_URL)
  const notionToken = read(import.meta.env.VITE_NOTION_MCP_TOKEN)
  if (notionUrl && notionToken) {
    cfg.notion = { url: notionUrl, token: notionToken }
  }
  return cfg
}

// 학급 노션 메인 페이지 URL (선택). 시스템 프롬프트에서 Claude 에게 우선 참고할 페이지로 안내.
export function getEnvNotionPageUrl(): string {
  return read(import.meta.env.VITE_NOTION_PAGE_URL)
}

function normalizeNewlines(key: string): string {
  // 이스케이프된 줄바꿈을 실제 줄바꿈으로. 큰따옴표 환경 변수에서는 이미 변환됐을 수 있음(no-op).
  return key
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .trim()
}

// PRIVATE_KEY 자리에 서비스 계정 JSON 전체를 통째로 붙여넣은 경우도 자동 처리한다.
// JSON 파싱 성공 시 private_key / client_email 필드를 꺼내 쓴다.
interface ServiceAccountJsonShape {
  private_key?: string
  client_email?: string
}

function tryParseServiceAccountJson(
  raw: string,
): ServiceAccountJsonShape | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    return JSON.parse(trimmed) as ServiceAccountJsonShape
  } catch {
    return null
  }
}

export function getEnvDriveConfig(): DriveServiceAccountConfig | null {
  let clientEmail = read(import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL)
  const privateKeyRaw = read(
    import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  )
  const folderId = read(import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID)

  // 케이스 1: JSON 전체가 PRIVATE_KEY 자리에 들어온 경우
  let privateKey = ''
  const parsed = tryParseServiceAccountJson(privateKeyRaw)
  if (parsed) {
    if (typeof parsed.private_key === 'string') {
      privateKey = normalizeNewlines(parsed.private_key)
    }
    if (!clientEmail && typeof parsed.client_email === 'string') {
      clientEmail = parsed.client_email.trim()
    }
  } else {
    // 케이스 2: 원래 의도대로 PEM 만 들어온 경우
    privateKey = normalizeNewlines(privateKeyRaw)
  }

  if (!clientEmail || !privateKey || !folderId) return null
  return { clientEmail, privateKey, folderId }
}
