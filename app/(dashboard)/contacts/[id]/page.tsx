import { getContact } from "@/lib/services/contacts"
import { InteractionList } from "@/components/interactions/interaction-list"
import { HealthScoreBadge } from "@/components/contacts/health-score-badge"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { notFound } from "next/navigation"

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contact = await getContact(id)
  if (!contact) notFound()

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{contact.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge>{contact.type}</Badge>
            <HealthScoreBadge score={contact.healthScore} />
            {contact.isFamilyMember && <Badge variant="info">Family</Badge>}
          </div>
        </div>
        <Link href={`/contacts/${contact.id}/edit`} className="text-sm text-blue-600 hover:text-blue-700">Edit</Link>
      </div>

      {contact.notes && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Interactions</h2>
        </div>
        <InteractionList interactions={contact.interactions as any} />
      </div>
    </div>
  )
}
