interface HealthScoreBadgeProps { score: number }

export function HealthScoreBadge({ score }: HealthScoreBadgeProps) {
  const colour =
    score >= 80 ? "bg-green-100 text-green-800" :
    score >= 50 ? "bg-yellow-100 text-yellow-800" :
    "bg-red-100 text-red-800"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colour}`}>
      {score}%
    </span>
  )
}
