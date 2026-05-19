// 환경 변수에서 LLM 키 / 노션 MCP / Drive 서비스 계정 설정을 읽어오는 래퍼.
// 사용자(학생)는 어떤 비밀도 입력하지 않는다. 빌드 시점에 .env(로컬) 또는
// Netlify Environment variables 에서 인라인된 값만 사용한다.

import type {
  ApiKeys,
  DriveServiceAccountConfig,
  McpConfig,
} from '@/types'

function read(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
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

export function getEnvDriveConfig(): DriveServiceAccountConfig | null {
  const clientEmail = read(import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL)
  // .env 에서는 줄바꿈을 \n 이스케이프로 한 줄에 적는 경우가 흔하므로
  // 실제 줄바꿈으로 복원한다. Netlify에서는 줄바꿈 그대로 입력 가능(이 경우 no-op).
  const privateKey = read(
    import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  ).replace(/\\n/g, '\n')
  const folderId = read(import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID)
  if (!clientEmail || !privateKey || !folderId) return null
  return { clientEmail, privateKey, folderId }
}
