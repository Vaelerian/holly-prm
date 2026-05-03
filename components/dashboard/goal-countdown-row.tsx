import Link from "next/link"

interface GoalCountdownRowProps {
  name: string
  targetDate: string
  daysRemaining: number
  roleColour: string
  roleName: string | null
}

export function GoalCountdownRow({ name, targetDate, daysRemaining, roleColour, roleName }: GoalCountdownRowProps) {
  const overdue = daysRemaining < 0
  const urgent = daysRemaining >= 0 && daysRemaining <= 7
  const targetLabel = new Date(targetDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  const daysLabel = overdue
    ? `${Math.abs(daysRemaining)}d overdue`
    : daysRemaining === 0
    ? "today"
    : `${daysRemaining}d left`

  return (
    <Link
      href="/goals"
      className="flex items-center justify-between bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-2.5 hover:border-[#00ff88] transition-colors gap-3"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: roleColour }} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#c0c0d0] truncate">{name}</p>
          <p className="text-xs text-[#666688] truncate">
            {roleName ? `${roleName} · ` : ""}target {targetLabel}
          </p>
        </div>
      </div>
      <span
        className={`text-xs font-semibold flex-shrink-0 ${
          overdue ? "text-red-400" : urgent ? "text-orange-300" : "text-[#c0c0d0]"
        }`}
      >
        {daysLabel}
      </span>
    </Link>
  )
}
