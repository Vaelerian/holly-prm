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
  isShared?: boolean
  ownerName?: string | null
}

export function ContactCard({ id, name, type, healthScore, lastInteraction, tags, isShared, ownerName }: ContactCardProps) {
  const daysSince = lastInteraction
    ? Math.floor((Date.now() - new Date(lastInteraction).getTime()) / 86400000)
    : null

  return (
    <Link href={`/contacts/${id}`} className="block bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 hover:border-[#00ff88] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#c0c0d0] truncate">{name}</p>
          {isShared && ownerName && (
            <p className="text-xs text-[#4488ff] mt-0.5">Shared by {ownerName}</p>
          )}
          <p className="text-xs text-[#666688] mt-0.5">
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
          <span className="text-xs text-[#666688] capitalize">{type}</span>
        </div>
      </div>
    </Link>
  )
}
