import { getContact } from "@/lib/services/contacts"
import { InteractionList } from "@/components/interactions/interaction-list"
import { ActionItemRow } from "@/components/action-items/action-item-row"
import { AddActionItemForm } from "@/components/action-items/add-action-item-form"
import { HealthScoreBadge } from "@/components/contacts/health-score-badge"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { notFound } from "next/navigation"

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contact = await getContact(id)
  if (!contact) notFound()

  // Flatten all action items from all interactions for this contact
  const allActionItems = contact.interactions.flatMap(i =>
    (i.actionItems ?? []).map(ai => ({ ...ai, interactionId: i.id }))
  )
  const openActionItems = allActionItems.filter(ai => ai.status === "todo")

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

      {openActionItems.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Action items</h2>
          <div className="space-y-2">
            {openActionItems.map(item => (
              <ActionItemRow
                key={item.id}
                id={item.id}
                title={item.title}
                status={item.status}
                priority={item.priority}
                assignedTo={item.assignedTo}
                dueDate={item.dueDate ? item.dueDate.toISOString() : null}
                interactionId={item.interactionId}
                taskId={item.taskId}
                contactId={id}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Interactions</h2>
        </div>
        <InteractionList interactions={contact.interactions as any} />
        <AddActionItemForm />
      </div>
    </div>
  )
}
