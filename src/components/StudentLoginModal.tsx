import { useState, type FormEvent } from 'react'
import { findStudentByCredentials, getClassLabel } from '@/lib/roster'
import type { Student } from '@/types'

interface Props {
  onLogin: (student: Student) => void
}

export default function StudentLoginModal({ onLogin }: Props) {
  const [studentId, setStudentId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const match = findStudentByCredentials(studentId, code)
    if (!match) {
      // 학번과 코드가 함께 맞아야만 통과. 다른 학생 학번만으로는 접속 불가.
      setError('학번과 개인 코드가 일치하지 않습니다. 선생님께 문의하세요.')
      return
    }
    setError(null)
    onLogin(match)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <p className="text-xs font-medium text-indigo-600">{getClassLabel()}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-800">탐구 챗봇</h1>
        <p className="mt-1 text-sm text-slate-500">
          학번과 개인 코드를 입력하면 대화를 시작할 수 있어요.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">학번</span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value)
                if (error) setError(null)
              }}
              placeholder="예: 30501"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">개인 코드</span>
            <input
              type="text"
              autoCapitalize="characters"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                if (error) setError(null)
              }}
              placeholder="예: AB12CD"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm uppercase tracking-widest text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!studentId.trim() || !code.trim()}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            입장하기
          </button>
        </form>

        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
          ⚠️ 대화 내용은 이 기기(브라우저)에만 저장됩니다. 공용 PC를 사용했다면
          사용 후 좌측 하단의 "내 데이터 초기화"를 눌러 기록을 지우세요.
        </p>
      </div>
    </div>
  )
}
