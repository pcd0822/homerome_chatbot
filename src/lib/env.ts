// 환경 변수에서 LLM 키와 MCP 설정을 읽어오는 래퍼.
// 사용자(학생)는 키를 입력하지 않는다. 배포 시 Netlify Environment variables
// 또는 로컬 `.env` 에 등록된 값만 사용된다.

import type { ApiKeys, McpConfig } from '@/types'

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
  const driveUrl = read(import.meta.env.VITE_GOOGLE_DRIVE_MCP_URL)
  const driveToken = read(import.meta.env.VITE_GOOGLE_DRIVE_MCP_TOKEN)
  if (driveUrl && driveToken) {
    cfg.googleDrive = { url: driveUrl, token: driveToken }
  }
  return cfg
}
