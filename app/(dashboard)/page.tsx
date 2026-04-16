import { getBriefing } from "@/lib/services/briefing"
import { StatsRow } from "@/components/dashboard/stats-row"
import { ActionItemRow } from "@/components/action-items/action-item-row"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.userId) redirect("/login")
  let data: Awaited<ReturnType<typeof getBriefing>> | null = null
  let dbError = false
  try {
    data = await getBriefing(session.userId)
  } catch (e) {
    console.error("[dashboard]", e)
    dbError = true
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-[#c0c0d0]">Dashboard</h1>

      {dbError && (
        <div className="bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.25)] rounded-lg px-4 py-3 text-sm text-red-400">
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
              <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-3">Overdue contacts</h2>
              <div className="space-y-2">
                {data.overdueContacts.map(c => (
                  <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between bg-[#111125] border border-[rgba(255,60,60,0.25)] rounded-lg px-4 py-2.5 hover:border-red-400 transition-colors">
                    <span className="text-sm font-medium text-[#c0c0d0]">{c.name}</span>
                    <span className="text-xs text-red-400">Score: {c.healthScore}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.pendingFollowUps.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-3">Pending follow-ups</h2>
              <div className="space-y-2">
                {data.pendingFollowUps.map(i => (
                  <Link key={i.id} href={`/contacts/${i.contact.id}`} className="flex items-center justify-between bg-[#111125] border border-[rgba(255,200,0,0.2)] rounded-lg px-4 py-2.5 hover:border-yellow-400 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-[#c0c0d0]">{i.contact.name}</p>
                      <p className="text-xs text-[#666688] truncate max-w-xs">{i.summary}</p>
                    </div>
                    {i.followUpDate && (
                      <span className="text-xs text-[#666688] flex-shrink-0">{new Date(i.followUpDate).toLocaleDateString("en-GB")}</span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.upcomingMilestones.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-3">Upcoming milestones</h2>
              <div className="space-y-2">
                {data.upcomingMilestones.map(m => (
                  <Link key={m.id} href={m.project ? `/projects/${m.project.id}` : "#"} className="flex items-center justify-between bg-[#111125] border border-[rgba(160,0,255,0.2)] rounded-lg px-4 py-2.5 hover:border-purple-400 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-[#c0c0d0]">★ {m.title}</p>
                      <p className="text-xs text-[#666688]">{m.project?.title ?? "No project"}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={m.status === "in_progress" ? "info" : "default"}>{m.status.replace("_", " ")}</Badge>
                      {m.dueDate && <span className="text-xs text-[#666688]">{new Date(m.dueDate).toLocaleDateString("en-GB")}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.myActionItems.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-3">My action items</h2>
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
                    taskProjectId={item.task?.projectId ?? undefined}
                  />
                ))}
              </div>
            </section>
          )}

          {data.scheduleAlerts && (data.scheduleAlerts as { taskId?: string; title?: string; reason?: string }[]).length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-[#ff4444] uppercase tracking-wide mb-3">Scheduling alerts</h2>
              <div className="space-y-2">
                {(data.scheduleAlerts as { taskId?: string; title?: string; reason?: string }[]).map((a, i) => (
                  <div key={a.taskId ?? i} className="bg-[#111125] border border-[rgba(255,68,68,0.2)] rounded-lg px-4 py-2.5">
                    <p className="text-sm font-medium text-[#c0c0d0]">{a.title}</p>
                    <p className="text-xs text-[#666688] mt-0.5">{a.reason}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
