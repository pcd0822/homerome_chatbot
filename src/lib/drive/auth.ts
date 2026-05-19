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
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(b64)
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
