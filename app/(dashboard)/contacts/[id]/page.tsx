import { auth } from "@/lib/auth"
import { getContact, isContactOwner } from "@/lib/services/contacts"
import { listContactShares } from "@/lib/services/sharing"
import { InteractionList } from "@/components/interactions/interaction-list"
import { ActionItemRow } from "@/components/action-items/action-item-row"
import { AddActionItemForm } from "@/components/action-items/add-action-item-form"
import { HealthScoreBadge } from "@/components/contacts/health-score-badge"
import { SharingSection } from "@/components/contacts/sharing-section"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect("/login")
  const userId = session.userId

  const { id } = await params
  const contact = await getContact(id, userId)
  if (!contact) notFound()

  const owner = isContactOwner(contact.userId, userId)

  // Load shares only for owner (contributors don't manage shares)
  const shares = owner ? await listContactShares(id, userId) ?? [] : []

  const allActionItems = contact.interactions.flatMap(i =>
    (i.actionItems ?? []).map(ai => ({ ...ai, interactionId: i.id }))
  )
  const openActionItems = allActionItems.filter(ai => ai.status === "todo")

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#c0c0d0]">{contact.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge>{contact.type}</Badge>
            <HealthScoreBadge score={contact.healthScore} />
            {contact.isFamilyMember && <Badge variant="info">Family</Badge>}
          </div>
          {!owner && contact.user && (
            <p className="text-xs text-[#4488ff] mt-1">Shared by {contact.user.name}</p>
          )}
        </div>
        {owner && (
          <Link href={`/contacts/${contact.id}/edit`} className="text-sm text-[#00ff88] hover:text-[#00cc6f]">Edit</Link>
        )}
      </div>

      {contact.notes && (
        <div>
          <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-2">Notes</h2>
          <p className="text-sm text-[#c0c0d0] whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      {openActionItems.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-2">Action items</h2>
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
          <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide">Interactions</h2>
        </div>
        <InteractionList interactions={contact.interactions as any} />
        <AddActionItemForm />
      </div>

      {owner && (
        <SharingSection
          contactId={id}
          initialShares={shares.map(s => ({ id: s.id, userId: s.userId, user: (s as any).user, createdAt: s.createdAt.toISOString() }))}
        />
      )}
    </div>
  )
}
