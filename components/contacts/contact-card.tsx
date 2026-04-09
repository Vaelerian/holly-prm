import Link from "next/link"
import { HealthScoreBadge } from "./health-score-badge"
import { Badge } from "@/components/ui/badge"

interface ContactCardProps {
  id: string
  name: string
  type: string
  healthScore: number
  lastInteraction: Date | null
  tags: string[]
}

export function ContactCard({ id, name, type, healthScore, lastInteraction, tags }: ContactCardProps) {
  const daysSince = lastInteraction
    ? Math.floor((Date.now() - new Date(lastInteraction).getTime()) / 86400000)
    : null

  return (
    <Link href={`/contacts/${id}`} className="block bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-400 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {daysSince === null ? "No interactions yet" : daysSince === 0 ? "Today" : `${daysSince}d ago`}
          </p>
          {tags.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-1.5">
              {tags.slice(0, 3).map(t => <Badge key={t}>{t}</Badge>)}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <HealthScoreBadge score={healthScore} />
          <span className="text-xs text-gray-400 capitalize">{type}</span>
        </div>
      </div>
    </Link>
  )
}
