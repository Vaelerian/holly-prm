import { getContact } from "@/lib/services/contacts"
import { ContactForm } from "@/components/contacts/contact-form"
import { notFound } from "next/navigation"

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contact = await getContact(id)
  if (!contact) notFound()

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Edit contact</h1>
      <ContactForm
        contactId={contact.id}
        defaultValues={{ name: contact.name, type: contact.type as any, notes: contact.notes, interactionFreqDays: contact.interactionFreqDays, isFamilyMember: contact.isFamilyMember, tags: contact.tags }}
      />
    </div>
  )
}
