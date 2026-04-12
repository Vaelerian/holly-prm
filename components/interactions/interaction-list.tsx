import { Badge } from "@/components/ui/badge"

interface Interaction {
  id: string
  type: string
  direction: string
  summary: string
  outcome: string | null
  followUpRequired: boolean
  followUpCompleted: boolean
  location: string | null
  occurredAt: Date
  createdByHolly: boolean
  createdByUser?: { name: string } | null
}

export function InteractionList({ interactions }: { interactions: Interaction[] }) {
  if (interactions.length === 0) {
    return <p className="text-sm text-[#666688]">No interactions recorded yet.</p>
  }

  return (
    <div className="space-y-3">
      {interactions.map(i => (
        <div key={i.id} className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="info">{i.type}</Badge>
              <Badge>{i.direction}</Badge>
              {i.createdByHolly && <Badge variant="warning">Holly</Badge>}
              {i.followUpRequired && !i.followUpCompleted && <Badge variant="danger">Follow-up</Badge>}
              {i.location && <span className="text-xs text-[#666688]">{i.location}</span>}
            </div>
            <span className="text-xs text-[#666688] flex-shrink-0">
              {new Date(i.occurredAt).toLocaleDateString("en-GB")}
            </span>
          </div>
          <p className="text-sm text-[#c0c0d0] mt-2">{i.summary}</p>
          {i.outcome && <p className="text-sm text-[#c0c0d0] mt-1 italic">{i.outcome}</p>}
          {i.createdByUser && (
            <p className="text-xs text-[#666688] mt-1">Logged by {i.createdByUser.name}</p>
          )}
        </div>
      ))}
    </div>
  )
}
