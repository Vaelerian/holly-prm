import { listContacts } from "@/lib/services/contacts"
import { ContactCard } from "@/components/contacts/contact-card"
import Link from "next/link"

interface PageProps { searchParams: Promise<{ q?: string; type?: string; overdue?: string }> }

export default async function ContactsPage({ searchParams }: PageProps) {
  const { q, type, overdue } = await searchParams
  let contacts: Awaited<ReturnType<typeof listContacts>> = []
  let dbError = false
  try {
    contacts = await listContacts({ q, type, overdue: overdue === "true" })
  } catch (e) {
    console.error("[contacts page]", e)
    dbError = true
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      {dbError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Database unavailable. Check server logs.
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Contacts</h1>
        <Link href="/contacts/new" className="bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700">
          + Add contact
        </Link>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search contacts..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" className="bg-gray-100 border border-gray-300 text-sm px-3 py-2 rounded-lg hover:bg-gray-200">Search</button>
      </form>

      {contacts.length === 0 ? (
        <p className="text-sm text-gray-500">No contacts found.</p>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => (
            <ContactCard
              key={c.id}
              id={c.id}
              name={c.name}
              type={c.type}
              healthScore={c.healthScore}
              lastInteraction={c.lastInteraction}
              tags={c.tags}
            />
          ))}
        </div>
      )}
    </div>
  )
}
