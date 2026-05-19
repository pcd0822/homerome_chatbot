import startersRaw from '@/data/starters.json'
import type { Starter, StartersFile } from '@/types'

const starters = (startersRaw as StartersFile).starters

interface Props {
  onPick: (s: Starter) => void
  disabled?: boolean
}

export default function ConversationStarters({ onPick, disabled }: Props) {
  return (
    <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
      {starters.map((s) => (
        <button
          key={s.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s)}
          className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="text-xl leading-none">{s.emoji}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">{s.label}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {s.prompt}
            </p>
          </div>
        </button>
      ))}
    </div>
  )
}

export { starters as defaultStarters }
