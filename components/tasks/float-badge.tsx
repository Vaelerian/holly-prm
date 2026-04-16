"use client"

interface FloatBadgeProps {
  slotDate: string | null
  dueDate: string | null
}

export function FloatBadge({ slotDate, dueDate }: FloatBadgeProps) {
  if (!slotDate || !dueDate) return null

  const slot = new Date(slotDate + "T00:00:00")
  const due = new Date(dueDate)
  // Normalize due date to midnight for day comparison
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const slotDay = new Date(slot.getFullYear(), slot.getMonth(), slot.getDate())

  const diffMs = dueDay.getTime() - slotDay.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return (
      <span className="text-[10px] font-medium text-[#ff4444]">
        Overdue by {Math.abs(diffDays)}d
      </span>
    )
  }

  if (diffDays === 0) {
    return (
      <span className="text-[10px] font-medium text-[#ffaa00]">
        Due today
      </span>
    )
  }

  if (diffDays <= 2) {
    return (
      <span className="text-[10px] font-medium text-[#ffaa00]">
        Float: {diffDays}d
      </span>
    )
  }

  return (
    <span className="text-[10px] font-medium text-[#00ff88]">
      Float: {diffDays}d
    </span>
  )
}
