interface HealthScoreBadgeProps { score: number }

export function HealthScoreBadge({ score }: HealthScoreBadgeProps) {
  const colour =
    score >= 80 ? "bg-[rgba(0,255,136,0.08)] text-[#00ff88]" :
    score >= 50 ? "bg-[rgba(255,200,0,0.08)] text-yellow-300" :
    "bg-[rgba(255,60,60,0.1)] text-red-400"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colour}`}>
      {score}%
    </span>
  )
}
