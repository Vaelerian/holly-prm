import { getBriefing } from "@/lib/services/briefing"
import { StatsRow } from "@/components/dashboard/stats-row"
import Link from "next/link"

export default async function DashboardPage() {
  const briefing = await getBriefing()

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Good morning</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <StatsRow
        overdueCount={briefing.overdueContacts.length}
        followUpCount={briefing.pendingFollowUps.length}
        actionCount={briefing.openActionItems.length}
      />

      {briefing.overdueContacts.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Overdue contacts</h2>
          <div className="space-y-2">
            {briefing.overdueContacts.map((c) => (
              <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-400">
                <span className="text-sm font-medium">{c.name}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.healthScore < 30 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {c.healthScore}%
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {briefing.pendingFollowUps.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Pending follow-ups</h2>
          <div className="space-y-2">
            {briefing.pendingFollowUps.map((i) => (
              <Link key={i.id} href={`/contacts/${i.contactId}`} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-400">
                <div>
                  <p className="text-sm font-medium">{(i as any).contact?.name ?? "Unknown"}</p>
                  <p className="text-xs text-gray-500 truncate max-w-xs">{i.summary}</p>
                </div>
                {i.followUpDate && (
                  <span className="text-xs text-gray-500">{new Date(i.followUpDate).toLocaleDateString("en-GB")}</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
