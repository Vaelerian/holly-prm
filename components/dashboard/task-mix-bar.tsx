interface TaskMixBarProps {
  mix: Record<string, number>
  total: number
}

const SEGMENTS: { key: string; label: string; colour: string }[] = [
  { key: "in_progress", label: "In progress", colour: "#00ff88" },
  { key: "todo", label: "To do", colour: "#3b82f6" },
  { key: "blocked", label: "Blocked", colour: "#ef4444" },
  { key: "done", label: "Done", colour: "#a855f7" },
  { key: "cancelled", label: "Cancelled", colour: "#666688" },
]

export function TaskMixBar({ mix, total }: TaskMixBarProps) {
  return (
    <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 space-y-3">
      <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-[#0a0a1a]">
        {SEGMENTS.map(s => {
          const count = mix[s.key] ?? 0
          if (count === 0) return null
          const width = (count / total) * 100
          return (
            <div
              key={s.key}
              style={{ width: `${width}%`, background: s.colour }}
              title={`${s.label}: ${count}`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {SEGMENTS.map(s => {
          const count = mix[s.key] ?? 0
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: s.colour }}
              />
              <span className="text-[#c0c0d0]">{s.label}</span>
              <span className="text-[#666688]">{count}</span>
            </div>
          )
        })}
        <div className="ml-auto text-[#666688]">{total} total</div>
      </div>
    </div>
  )
}
