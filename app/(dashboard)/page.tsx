import { getBriefing } from "@/lib/services/briefing"
import { StatsRow } from "@/components/dashboard/stats-row"
import { ActionItemRow } from "@/components/action-items/action-item-row"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof getBriefing>> | null = null
  let dbError = false
  try {
    data = await getBriefing()
  } catch (e) {
    console.error("[dashboard]", e)
    dbError = true
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      {dbError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Database unavailable. Check server logs.
        </div>
      )}

      {data && (
        <>
          <StatsRow
            overdueCount={data.overdueContacts.length}
            followUpCount={data.pendingFollowUps.length}
            actionCount={data.openActionItems.length}
            openProjectsCount={data.openProjectsCount}
            tasksDueTodayCount={data.tasksDueTodayCount}
          />

          {data.overdueContacts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Overdue contacts</h2>
              <div className="space-y-2">
                {data.overdueContacts.map(c => (
                  <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between bg-white border border-red-200 rounded-lg px-4 py-2.5 hover:border-red-400 transition-colors">
                    <span className="text-sm font-medium text-gray-900">{c.name}</span>
                    <span className="text-xs text-red-600">Score: {c.healthScore}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.pendingFollowUps.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Pending follow-ups</h2>
              <div className="space-y-2">
                {data.pendingFollowUps.map(i => (
                  <Link key={i.id} href={`/contacts/${i.contact.id}`} className="flex items-center justify-between bg-white border border-yellow-200 rounded-lg px-4 py-2.5 hover:border-yellow-400 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{i.contact.name}</p>
                      <p className="text-xs text-gray-500 truncate max-w-xs">{i.summary}</p>
                    </div>
                    {i.followUpDate && (
                      <span className="text-xs text-gray-400 flex-shrink-0">{new Date(i.followUpDate).toLocaleDateString("en-GB")}</span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.upcomingMilestones.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Upcoming milestones</h2>
              <div className="space-y-2">
                {data.upcomingMilestones.map(m => (
                  <Link key={m.id} href={`/projects/${m.project.id}`} className="flex items-center justify-between bg-white border border-purple-200 rounded-lg px-4 py-2.5 hover:border-purple-400 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">★ {m.title}</p>
                      <p className="text-xs text-gray-500">{m.project.title}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={m.status === "in_progress" ? "info" : "default"}>{m.status.replace("_", " ")}</Badge>
                      {m.dueDate && <span className="text-xs text-gray-400">{new Date(m.dueDate).toLocaleDateString("en-GB")}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.myActionItems.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">My action items</h2>
              <div className="space-y-2">
                {data.myActionItems.map(item => (
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
                    contactId={item.interaction?.contact?.id}
                    taskProjectId={item.task?.projectId}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
