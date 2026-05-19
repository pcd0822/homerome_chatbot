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
