import rosterRaw from '@/data/roster.json'
import type { ClassInfo, RosterFile, RosterStudent, Student } from '@/types'

const roster = rosterRaw as RosterFile

export function getClassInfo(): ClassInfo {
  return roster.classInfo
}

export function getClassLabel(): string {
  const { grade, classNum, year } = roster.classInfo
  return `${year}년 ${grade}학년 ${classNum}반`
}

export function getAllStudents(): RosterStudent[] {
  return roster.students
}

// 학번 + 개별 코드 2-factor 인증.
// 다른 학생의 학번만으로는 접속할 수 없도록, 학번과 매칭되는 코드가 정확히
// 일치해야 통과한다. 코드는 대소문자 무시(입력 편의), 학번/코드 모두 trim.
// 반환값에는 code 를 제외한 Student 만 담아 이후 저장에 코드가 남지 않게 한다.
export function findStudentByCredentials(
  studentId: string,
  code: string,
): Student | null {
  const id = studentId.trim()
  const c = code.trim().toUpperCase()
  if (!id || !c) return null
  const match = roster.students.find(
    (s) => s.studentId === id && s.code.toUpperCase() === c,
  )
  if (!match) return null
  return { studentId: match.studentId, name: match.name }
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
export function getVocativeName(fullName: string): string {
  const given = getGivenName(fullName)
  if (!given) return fullName
  const last = given[given.length - 1]!
  return given + (hasJongseong(last) ? '아' : '야')
}
