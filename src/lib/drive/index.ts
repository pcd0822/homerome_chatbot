// Google Drive API v3 호출 래퍼.
// 학급 자료 폴더 안의 파일 목록 조회 + 선택 PDF 다운로드(base64).

import type { DriveServiceAccountConfig } from '@/types'
import { getDriveAccessToken } from './auth'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  description?: string
  size?: string
  webViewLink?: string
}

const API = 'https://www.googleapis.com/drive/v3'

export async function listFolderFiles(
  cfg: DriveServiceAccountConfig,
): Promise<DriveFile[]> {
  const token = await getDriveAccessToken(cfg)
  const url = new URL(`${API}/files`)
  url.searchParams.set(
    'q',
    `'${cfg.folderId}' in parents and trashed = false`,
  )
  url.searchParams.set(
    'fields',
    'files(id,name,mimeType,modifiedTime,description,size,webViewLink)',
  )
  url.searchParams.set('pageSize', '100')
  url.searchParams.set('orderBy', 'modifiedTime desc')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Drive 파일 목록 조회 실패 (${res.status}). 폴더 ID 와 서비스 계정 공유 권한을 확인하세요. ${text}`,
    )
  }
  const data = (await res.json()) as { files?: DriveFile[] }
  return data.files ?? []
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    )
  }
  return btoa(binary)
}

export async function downloadFileBase64(
  cfg: DriveServiceAccountConfig,
  fileId: string,
): Promise<{ base64: string; byteLength: number }> {
  const token = await getDriveAccessToken(cfg)
  const url = `${API}/files/${encodeURIComponent(fileId)}?alt=media`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Drive 파일 다운로드 실패 (${res.status}). ${text}`)
  }
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  return { base64: bytesToBase64(bytes), byteLength: bytes.byteLength }
}

// 폴더 안에서 PDF 만 골라 합계 size/개수 제한 안에서 base64로 다운로드한다.
// LLM 컨텍스트 폭주 방지를 위한 안전망.
export interface DriveAttachment {
  file: DriveFile
  base64: string
  byteLength: number
}

export interface FetchDriveContextOptions {
  maxPdfCount?: number
  maxTotalBytes?: number
}

export interface DriveContext {
  allFiles: DriveFile[]
  attachments: DriveAttachment[]
  skipped: Array<{ file: DriveFile; reason: string }>
}

export async function fetchDriveContext(
  cfg: DriveServiceAccountConfig,
  options: FetchDriveContextOptions = {},
): Promise<DriveContext> {
  const maxPdfCount = options.maxPdfCount ?? 5
  const maxTotalBytes = options.maxTotalBytes ?? 10 * 1024 * 1024 // 10MB

  const allFiles = await listFolderFiles(cfg)
  const pdfs = allFiles.filter((f) => f.mimeType === 'application/pdf')

  const attachments: DriveAttachment[] = []
  const skipped: Array<{ file: DriveFile; reason: string }> = []
  let total = 0

  for (const f of pdfs) {
    if (attachments.length >= maxPdfCount) {
      skipped.push({ file: f, reason: `첨부 개수 한도(${maxPdfCount}개) 초과` })
      continue
    }
    const expected = Number(f.size ?? 0)
    if (expected && total + expected > maxTotalBytes) {
      skipped.push({
        file: f,
        reason: `누적 크기 한도(${Math.round(maxTotalBytes / 1024 / 1024)}MB) 초과`,
      })
      continue
    }
    try {
      const dl = await downloadFileBase64(cfg, f.id)
      if (total + dl.byteLength > maxTotalBytes) {
        skipped.push({ file: f, reason: '누적 크기 한도 초과' })
        continue
      }
      attachments.push({ file: f, base64: dl.base64, byteLength: dl.byteLength })
      total += dl.byteLength
    } catch (err) {
      skipped.push({
        file: f,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { allFiles, attachments, skipped }
}

// LLM systemPrompt 에 prepend 할 텍스트.
export function formatDriveFilesAsContext(files: DriveFile[]): string {
  if (files.length === 0) {
    return '학급 Drive 폴더에 자료가 아직 없습니다.'
  }
  const lines = files.map((f) => {
    const parts: string[] = [`- "${f.name}"`]
    parts.push(`(${f.mimeType})`)
    if (f.modifiedTime) {
      parts.push(`수정일: ${f.modifiedTime.slice(0, 10)}`)
    }
    if (f.size) {
      const kb = Math.round(Number(f.size) / 1024)
      if (kb > 0) parts.push(`${kb}KB`)
    }
    if (f.description) {
      parts.push(`설명: ${f.description}`)
    }
    return parts.join(' · ')
  })
  return lines.join('\n')
}
