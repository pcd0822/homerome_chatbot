// Google Service Account → OAuth access_token 발급.
// 표준 흐름: JWT(RS256) 서명 → POST https://oauth2.googleapis.com/token
// (grant_type=jwt-bearer) → access_token + expires_in. 만료 60초 전부터는 재발급.

import type { DriveServiceAccountConfig } from '@/types'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

interface CachedToken {
  token: string
  expiresAt: number
  forEmail: string
}

let cached: CachedToken | null = null

function pemToArrayBuffer(pem: string): ArrayBuffer {
  if (!pem.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error(
      'Private key 가 PKCS8 PEM 형식이 아닙니다. ' +
        '"-----BEGIN PRIVATE KEY-----" 헤더로 시작해야 합니다. ' +
        'Google Cloud Console 에서 받은 JSON 키 파일의 private_key 값을 그대로 사용하세요.',
    )
  }
  if (!pem.includes('-----END PRIVATE KEY-----')) {
    throw new Error(
      'Private key 의 "-----END PRIVATE KEY-----" 푸터가 누락되었습니다. ' +
        '.env 에서 값이 중간에 잘렸을 수 있습니다(따옴표로 감쌌는지 확인하세요).',
    )
  }

  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')

  if (b64.length === 0) {
    throw new Error(
      'Private key 본문이 비어 있습니다. .env 의 값이 손상되었습니다.',
    )
  }

  // base64 표준 알파벳(A-Z, a-z, 0-9, +, /, =) 만 허용. 그 외 문자가 있으면
  // \n 이스케이프 미처리 또는 따옴표 혼입 등이 원인이라 명확히 알린다.
  const invalidMatch = b64.match(/[^A-Za-z0-9+/=]/)
  if (invalidMatch) {
    const offset = b64.indexOf(invalidMatch[0])
    const context = b64.slice(Math.max(0, offset - 10), offset + 10)
    throw new Error(
      `Private key 본문에 base64 가 아닌 문자가 포함되었습니다. ` +
        `(문제 문자: "${invalidMatch[0]}", 주변: "${context}"). ` +
        '대부분의 경우 .env 의 줄바꿈(\\n) 이스케이프가 풀리지 않은 상태입니다. ' +
        'private_key 값을 큰따옴표로 감싸고 줄바꿈을 \\n 으로 적어 주세요.',
    )
  }

  let binary: string
  try {
    binary = atob(b64)
  } catch {
    throw new Error(
      'Private key base64 디코딩 실패. .env 의 private_key 가 손상된 듯합니다.',
    )
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    )
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlFromString(s: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(s))
}

export async function getDriveAccessToken(
  cfg: DriveServiceAccountConfig,
): Promise<string> {
  // 동일 서비스 계정에 대해 토큰 캐시(만료 60초 전까지 유효)
  if (
    cached &&
    cached.forEmail === cfg.clientEmail &&
    cached.expiresAt > Date.now() + 60_000
  ) {
    return cached.token
  }

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: cfg.clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }
  const signingInput =
    base64UrlFromString(JSON.stringify(header)) +
    '.' +
    base64UrlFromString(JSON.stringify(claim))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(cfg.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  )
  const jwt = signingInput + '.' + base64UrlFromBytes(new Uint8Array(signature))

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Google OAuth 토큰 발급 실패 (${res.status}). 서비스 계정 이메일/키와 폴더 공유 권한을 확인하세요. ${text}`,
    )
  }
  const data = (await res.json()) as {
    access_token: string
    expires_in: number
    token_type: string
  }
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    forEmail: cfg.clientEmail,
  }
  return cached.token
}
