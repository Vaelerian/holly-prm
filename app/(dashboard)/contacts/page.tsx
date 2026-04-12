import { auth } from "@/lib/auth"
import { listContacts } from "@/lib/services/contacts"
import { ContactCard } from "@/components/contacts/contact-card"
import Link from "next/link"
import { redirect } from "next/navigation"

interface PageProps { searchParams: Promise<{ q?: string; type?: string; overdue?: string }> }

export default async function ContactsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.userId) redirect("/login")
  const userId = session.userId

  const { q, type, overdue } = await searchParams
  let contacts: Awaited<ReturnType<typeof listContacts>> = []
  let dbError = false
  try {
    contacts = await listContacts({ q, type, overdue: overdue === "true", userId })
  } catch (e) {
    console.error("[contacts page]", e)
    dbError = true
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      {dbError && (
        <div className="bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.25)] rounded-lg px-4 py-3 text-sm text-red-400">
          Database unavailable. Check server logs.
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#c0c0d0]">Contacts</h1>
        <Link href="/contacts/new" className="bg-[#00ff88] text-[#0a0a1a] text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-[#00cc6f]">
          + Add contact
        </Link>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search contacts..."
          className="flex-1 border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]"
        />
        <button type="submit" className="bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] text-[#c0c0d0] text-sm px-3 py-2 rounded-lg hover:bg-[rgba(0,255,136,0.08)]">Search</button>
      </form>

      {contacts.length === 0 ? (
        <p className="text-sm text-[#666688]">No contacts found.</p>
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
              isShared={c.userId !== userId}
              ownerName={c.userId !== userId ? (c.user?.name ?? null) : null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
