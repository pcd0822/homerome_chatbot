import rosterRaw from '@/data/roster.json'
import type { ClassInfo, RosterFile, Student } from '@/types'

const roster = rosterRaw as RosterFile

export function getClassInfo(): ClassInfo {
  return roster.classInfo
}

export function getClassLabel(): string {
  const { grade, classNum, year } = roster.classInfo
  return `${year}년 ${grade}학년 ${classNum}반`
}

export function getAllStudents(): Student[] {
  return roster.students
}

// 학번 정규화: 양쪽 공백만 제거. 명세는 숫자 문자열이지만,
// 입력 단계에서 단순 trim만 한 뒤 정확 일치를 검사한다.
export function findStudentById(studentId: string): Student | null {
  const id = studentId.trim()
  if (!id) return null
  return roster.students.find((s) => s.studentId === id) ?? null
}

// 한국 이름에서 성을 떼고 이름만 반환한다.
// 한 글자 성을 기본 가정(한국 명부의 거의 모든 케이스). 두 글자 성(남궁/황보 등)이
// 명부에 들어오면 별도 처리가 필요하다.
export function getGivenName(fullName: string): string {
  const name = fullName.trim()
  if (name.length <= 1) return name
  return name.slice(1)
}

// 한글 음절(가–힣)의 받침 유무. 받침이 있으면 호격 조사로 "아", 없으면 "야".
function hasJongseong(char: string): boolean {
  const code = char.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

// "리헌" → "리헌아", "지효" → "지효야" 처럼 다정한 호격을 만든다.
// 환영 메시지처럼 학생을 부를 때 사용.
export function getVocativeName(fullName: string): string {
  const given = getGivenName(fullName)
  if (!given) return fullName
  const last = given[given.length - 1]!
  return given + (hasJongseong(last) ? '아' : '야')
}
