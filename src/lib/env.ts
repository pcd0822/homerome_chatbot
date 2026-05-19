// 환경 변수에서 LLM 키 / Drive 서비스 계정 설정을 읽어오는 래퍼.
// 사용자(학생)는 어떤 비밀도 입력하지 않는다. 빌드 시점에 .env(로컬) 또는
// Netlify Environment variables 에서 인라인된 값만 사용한다.

import type { ApiKeys, DriveServiceAccountConfig, NeisConfig } from '@/types'

function read(value: string | undefined): string {
  if (typeof value !== 'string') return ''
  let v = value.trim()
  // dotenv 가 처리 못 한 양쪽 따옴표가 남아 있으면 한 번 더 벗긴다.
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

function normalizeNewlines(key: string): string {
  return key
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .trim()
}

// PRIVATE_KEY 자리에 서비스 계정 JSON 전체를 통째로 붙여넣은 경우도 자동 처리한다.
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
    privateKey = normalizeNewlines(privateKeyRaw)
  }

  if (!clientEmail || !privateKey || !folderId) return null
  return { clientEmail, privateKey, folderId }
}

export function getEnvNeisConfig(): NeisConfig | null {
  const schoolName = read(import.meta.env.VITE_NEIS_SCHOOL_NAME)
  const apiKey = read(import.meta.env.VITE_NEIS_API_KEY)
  if (!schoolName) return null
  return apiKey ? { schoolName, apiKey } : { schoolName }
}
