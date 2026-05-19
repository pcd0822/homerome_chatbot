// NEIS Open API 통합. 학교 정보(검색) + 학사일정 + 급식 메뉴.
// 명세서: https://open.neis.go.kr
// - schoolInfo:       학교 기본 정보 검색 (학교명 → 코드)
// - SchoolSchedule:   학사일정
// - mealServiceDietInfo: 급식 식단 정보
//
// CORS: Access-Control-Allow-Origin: * — 브라우저 직접 호출 가능.

import type { NeisConfig } from '@/types'

const BASE = 'https://open.neis.go.kr/hub'

export interface NeisSchool {
  officeCode: string
  officeName: string
  schoolCode: string
  schoolName: string
  englishName?: string
  kind?: string
  address?: string
  phone?: string
  homepage?: string
  foundation?: string
}

export interface ScheduleEvent {
  date: string // YYYYMMDD
  eventName: string
  eventContent?: string
  schoolCourse?: string
}

export interface MealMenu {
  date: string // YYYYMMDD
  mealType: string
  dishes: string[]
  calories?: string
}

export interface NeisContext {
  school: NeisSchool
  schedule: ScheduleEvent[]
  meals: MealMenu[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>

async function callNeis(path: string, params: Record<string, string>): Promise<AnyObj> {
  const url = new URL(`${BASE}/${path}`)
  url.searchParams.set('Type', 'json')
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`NEIS ${path} HTTP ${res.status}`)
  }
  return (await res.json()) as AnyObj
}

// 응답 구조: { <serviceName>: [{ head: [...] }, { row: [...] }] }
// 데이터 없음(INFO-200) 시 { RESULT: { CODE: "INFO-200", ... } }
function extractRows(data: AnyObj, serviceName: string): AnyObj[] {
  const arr = data?.[serviceName]
  if (!Array.isArray(arr)) return []
  for (const part of arr) {
    if (part && Array.isArray(part.row)) return part.row as AnyObj[]
  }
  return []
}

export async function searchSchool(
  schoolName: string,
  apiKey?: string,
): Promise<NeisSchool | null> {
  const params: Record<string, string> = {
    pIndex: '1',
    pSize: '5',
    SCHUL_NM: schoolName,
  }
  if (apiKey) params.KEY = apiKey

  const data = await callNeis('schoolInfo', params)
  const rows = extractRows(data, 'schoolInfo')
  const r = rows[0]
  if (!r) return null
  return {
    officeCode: String(r.ATPT_OFCDC_SC_CODE ?? ''),
    officeName: String(r.ATPT_OFCDC_SC_NM ?? ''),
    schoolCode: String(r.SD_SCHUL_CODE ?? ''),
    schoolName: String(r.SCHUL_NM ?? ''),
    englishName: r.ENG_SCHUL_NM ? String(r.ENG_SCHUL_NM).trim() : undefined,
    kind: r.SCHUL_KND_SC_NM ? String(r.SCHUL_KND_SC_NM).trim() : undefined,
    address: r.ORG_RDNMA ? String(r.ORG_RDNMA).trim() : undefined,
    phone: r.ORG_TELNO ? String(r.ORG_TELNO).trim() : undefined,
    homepage: r.HMPG_ADRES ? String(r.HMPG_ADRES).trim() : undefined,
    foundation: r.FOND_SC_NM ? String(r.FOND_SC_NM).trim() : undefined,
  }
}

export async function fetchSchedule(
  school: NeisSchool,
  fromYmd: string,
  toYmd: string,
  apiKey?: string,
): Promise<ScheduleEvent[]> {
  const params: Record<string, string> = {
    pIndex: '1',
    pSize: '500',
    ATPT_OFCDC_SC_CODE: school.officeCode,
    SD_SCHUL_CODE: school.schoolCode,
    AA_FROM_YMD: fromYmd,
    AA_TO_YMD: toYmd,
  }
  if (apiKey) params.KEY = apiKey

  const data = await callNeis('SchoolSchedule', params)
  const rows = extractRows(data, 'SchoolSchedule')
  return rows
    .map((r) => ({
      date: String(r.AA_YMD ?? ''),
      eventName: String(r.EVENT_NM ?? '').trim(),
      eventContent: r.EVENT_CNTNT ? String(r.EVENT_CNTNT).trim() : undefined,
      schoolCourse: r.SCHUL_CRSE_SC_NM
        ? String(r.SCHUL_CRSE_SC_NM).trim()
        : undefined,
    }))
    .filter((e) => e.date && e.eventName)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchMeals(
  school: NeisSchool,
  fromYmd: string,
  toYmd: string,
  apiKey?: string,
): Promise<MealMenu[]> {
  const params: Record<string, string> = {
    pIndex: '1',
    pSize: '100',
    ATPT_OFCDC_SC_CODE: school.officeCode,
    SD_SCHUL_CODE: school.schoolCode,
    MLSV_FROM_YMD: fromYmd,
    MLSV_TO_YMD: toYmd,
  }
  if (apiKey) params.KEY = apiKey

  const data = await callNeis('mealServiceDietInfo', params)
  const rows = extractRows(data, 'mealServiceDietInfo')
  return rows
    .map((r) => {
      const raw = String(r.DDISH_NM ?? '')
      // DDISH_NM 은 메뉴 사이를 "<br/>" 로 구분. 괄호 안 숫자(.) 는 알레르기 코드.
      // 알레르기 정보를 보존해야 학생이 자신의 알레르기 유발 식품을 식별할 수 있다.
      const dishes = raw
        .split(/<br\s*\/?>/i)
        .map((s) => s.trim())
        .filter(Boolean)
      return {
        date: String(r.MLSV_YMD ?? ''),
        mealType: String(r.MMEAL_SC_NM ?? '').trim(),
        dishes,
        calories: r.CAL_INFO ? String(r.CAL_INFO).trim() : undefined,
      }
    })
    .filter((m) => m.date && m.dishes.length > 0)
    .sort((a, b) =>
      a.date === b.date
        ? a.mealType.localeCompare(b.mealType)
        : a.date.localeCompare(b.date),
    )
}

// ---- 캐시 ----

interface CachedContext {
  context: NeisContext
  cachedAt: number
  schoolNameKey: string
  windowKey: string
}

let cached: CachedContext | null = null
let schoolCache: { school: NeisSchool; name: string } | null = null
const TTL_MS = 30 * 60 * 1000 // 30분

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

export function clearNeisCache(): void {
  cached = null
  schoolCache = null
}

export interface FetchNeisOptions {
  scheduleDaysAhead?: number
  mealDaysAhead?: number
}

export async function fetchNeisContext(
  cfg: NeisConfig,
  options: FetchNeisOptions = {},
): Promise<NeisContext> {
  const scheduleDaysAhead = options.scheduleDaysAhead ?? 90
  const mealDaysAhead = options.mealDaysAhead ?? 14

  const today = new Date()
  const todayYmd = ymd(today)
  const scheduleUntil = ymd(
    new Date(today.getTime() + scheduleDaysAhead * 24 * 60 * 60 * 1000),
  )
  const mealUntil = ymd(
    new Date(today.getTime() + mealDaysAhead * 24 * 60 * 60 * 1000),
  )

  const windowKey = `${todayYmd}-${scheduleDaysAhead}-${mealDaysAhead}`

  // 통합 캐시 hit
  if (
    cached &&
    cached.schoolNameKey === cfg.schoolName &&
    cached.windowKey === windowKey &&
    Date.now() - cached.cachedAt < TTL_MS
  ) {
    return cached.context
  }

  // 학교 정보: 학교명 바뀌지 않는 한 영구 캐시
  let school: NeisSchool | null = null
  if (schoolCache && schoolCache.name === cfg.schoolName) {
    school = schoolCache.school
  } else {
    school = await searchSchool(cfg.schoolName, cfg.apiKey)
    if (!school) {
      throw new Error(
        `NEIS 학교 검색 실패: "${cfg.schoolName}". 학교명을 다시 확인하세요.`,
      )
    }
    schoolCache = { school, name: cfg.schoolName }
  }

  // 학사일정 + 급식은 병렬 호출. 빈 결과는 빈 배열로(에러 아님).
  const [schedule, meals] = await Promise.all([
    fetchSchedule(school, todayYmd, scheduleUntil, cfg.apiKey).catch(() => []),
    fetchMeals(school, todayYmd, mealUntil, cfg.apiKey).catch(() => []),
  ])

  const context: NeisContext = { school, schedule, meals }
  cached = {
    context,
    cachedAt: Date.now(),
    schoolNameKey: cfg.schoolName,
    windowKey,
  }
  return context
}

// ---- LLM 컨텍스트용 텍스트 포맷 ----

function formatYmd(s: string): string {
  if (s.length !== 8) return s
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

export function formatNeisContextAsText(ctx: NeisContext): string {
  const lines: string[] = []
  const s = ctx.school

  lines.push('## 학교 기본 정보 (NEIS)')
  lines.push(`- 학교명: ${s.schoolName}`)
  if (s.kind) lines.push(`- 학교급: ${s.kind}`)
  if (s.officeName) lines.push(`- 시도교육청: ${s.officeName}`)
  if (s.address) lines.push(`- 주소: ${s.address}`)
  if (s.phone) lines.push(`- 전화: ${s.phone}`)
  if (s.homepage) lines.push(`- 홈페이지: ${s.homepage}`)
  if (s.foundation) lines.push(`- 설립구분: ${s.foundation}`)

  if (ctx.schedule.length > 0) {
    lines.push('')
    lines.push(`## 학사일정 (오늘부터 90일, ${ctx.schedule.length}건)`)
    for (const ev of ctx.schedule) {
      const courseTag =
        ev.schoolCourse && ev.schoolCourse !== '전체'
          ? ` [${ev.schoolCourse}]`
          : ''
      const content = ev.eventContent ? ` — ${ev.eventContent}` : ''
      lines.push(`- ${formatYmd(ev.date)}${courseTag}: ${ev.eventName}${content}`)
    }
  } else {
    lines.push('\n(학사일정: 90일 이내 등록된 일정이 없습니다)')
  }

  if (ctx.meals.length > 0) {
    lines.push('')
    lines.push(`## 급식 메뉴 (오늘부터 14일, ${ctx.meals.length}건)`)
    for (const m of ctx.meals) {
      const cal = m.calories ? ` (${m.calories})` : ''
      lines.push(
        `- ${formatYmd(m.date)} ${m.mealType}${cal}: ${m.dishes.join(', ')}`,
      )
    }
  }

  return lines.join('\n')
}
