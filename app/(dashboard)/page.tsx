import { getBriefing } from "@/lib/services/briefing"
import { StatsRow } from "@/components/dashboard/stats-row"
import { TaskMixBar } from "@/components/dashboard/task-mix-bar"
import { ProjectHealthRow } from "@/components/dashboard/project-health-row"
import { GoalCountdownRow } from "@/components/dashboard/goal-countdown-row"
import { WeekTaskList } from "@/components/dashboard/week-task-list"
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
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-[#c0c0d0]">Dashboard</h1>
        {data && (
          <p className="text-xs text-[#666688]">
            Updated {data.generatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>

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
            tasksThisWeekCount={data.tasksThisWeek.length}
          />

          <div className="grid lg:grid-cols-2 gap-6">
            <section>
              <SectionHeader title="Today" subtitle="What needs your attention right now" />
              {data.myActionItems.length === 0 && data.tasksDueTodayCount === 0 ? (
                <EmptyCard text="Nothing due today." />
              ) : (
                <div className="space-y-2">
                  {data.tasksDueTodayCount > 0 && (
                    <Link
                      href="/tasks?view=schedule"
                      className="block bg-[#111125] border border-[rgba(255,140,0,0.25)] rounded-lg px-4 py-2.5 hover:border-orange-400 transition-colors"
                    >
                      <p className="text-sm text-[#c0c0d0]">
                        <span className="font-bold text-orange-300">{data.tasksDueTodayCount}</span> task
                        {data.tasksDueTodayCount === 1 ? "" : "s"} due today
                      </p>
                      <p className="text-xs text-[#666688]">Open the Tasks page to work through them</p>
                    </Link>
                  )}
                  {data.myActionItems.slice(0, 5).map(item => (
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
              )}
            </section>

            <section>
              <SectionHeader
                title="This week"
                subtitle="Tasks due in the next 7 days"
                action={data.tasksThisWeek.length > 0 ? { href: "/tasks?view=schedule", label: "Open tasks" } : undefined}
              />
              {data.tasksThisWeek.length === 0 ? (
                <EmptyCard text="No tasks scheduled in the next 7 days." />
              ) : (
                <WeekTaskList tasks={data.tasksThisWeek} />
              )}
            </section>
          </div>

          <section>
            <SectionHeader title="Project health" subtitle="Active projects, ranked by progress" />
            {data.projectHealth.length === 0 ? (
              <EmptyCard text="No active projects." />
            ) : (
              <div className="space-y-2">
                {data.projectHealth.slice(0, 8).map(p => (
                  <ProjectHealthRow
                    key={p.id}
                    id={p.id}
                    title={p.title}
                    status={p.status}
                    targetDate={p.targetDate ? p.targetDate.toISOString() : null}
                    tasksTotal={p.tasksTotal}
                    tasksCompleted={p.tasksCompleted}
                    percentComplete={p.percentComplete}
                  />
                ))}
              </div>
            )}
          </section>

          <div className="grid lg:grid-cols-2 gap-6">
            <section>
              <SectionHeader title="Goals nearing target" subtitle="Completable goals due within 30 days" />
              {data.goalsNearingCompletion.length === 0 ? (
                <EmptyCard text="No goals due in the next 30 days." />
              ) : (
                <div className="space-y-2">
                  {data.goalsNearingCompletion.map(g => (
                    <GoalCountdownRow
                      key={g.id}
                      name={g.name}
                      targetDate={g.targetDate!.toISOString()}
                      daysRemaining={g.daysRemaining}
                      roleColour={g.role?.colour ?? "#666688"}
                      roleName={g.role?.name ?? null}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <SectionHeader title="Task mix" subtitle="All tasks across your projects" />
              {data.taskTotal === 0 ? (
                <EmptyCard text="No tasks yet." />
              ) : (
                <TaskMixBar mix={data.taskMix} total={data.taskTotal} />
              )}
            </section>
          </div>

          {data.upcomingMilestones.length > 0 && (
            <section>
              <SectionHeader title="Upcoming milestones" subtitle="Within the next 14 days" />
              <div className="space-y-2">
                {data.upcomingMilestones.map(m => (
                  <Link
                    key={m.id}
                    href={m.project ? `/projects/${m.project.id}` : "#"}
                    className="flex items-center justify-between bg-[#111125] border border-[rgba(160,0,255,0.2)] rounded-lg px-4 py-2.5 hover:border-purple-400 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#c0c0d0] truncate">★ {m.title}</p>
                      <p className="text-xs text-[#666688] truncate">{m.project?.title ?? "No project"}</p>
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

          {data.overdueContacts.length > 0 && (
            <section>
              <SectionHeader title="Relationships needing attention" subtitle="Lowest health scores first" />
              <div className="grid sm:grid-cols-2 gap-2">
                {data.overdueContacts.map(c => (
                  <Link
                    key={c.id}
                    href={`/contacts/${c.id}`}
                    className="flex items-center justify-between bg-[#111125] border border-[rgba(255,60,60,0.25)] rounded-lg px-4 py-2.5 hover:border-red-400 transition-colors"
                  >
                    <span className="text-sm font-medium text-[#c0c0d0] truncate">{c.name}</span>
                    <span className="text-xs text-red-400 flex-shrink-0 ml-2">
                      {c.lastInteraction === null ? "First contact" : `${c.healthScore}`}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.pendingFollowUps.length > 0 && (
            <section>
              <SectionHeader title="Pending follow-ups" />
              <div className="space-y-2">
                {data.pendingFollowUps.slice(0, 6).map(i => (
                  <Link
                    key={i.id}
                    href={`/contacts/${i.contact.id}`}
                    className="flex items-center justify-between bg-[#111125] border border-[rgba(255,200,0,0.2)] rounded-lg px-4 py-2.5 hover:border-yellow-400 transition-colors gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#c0c0d0] truncate">{i.contact.name}</p>
                      <p className="text-xs text-[#666688] truncate">{i.summary}</p>
                    </div>
                    {i.followUpDate && (
                      <span className="text-xs text-[#666688] flex-shrink-0">
                        {new Date(i.followUpDate).toLocaleDateString("en-GB")}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.recentInteractions.length > 0 && (
            <section>
              <SectionHeader title="Recent interactions" />
              <div className="space-y-2">
                {data.recentInteractions.map(i => (
                  <Link
                    key={i.id}
                    href={`/contacts/${i.contact.id}`}
                    className="flex items-center justify-between bg-[#111125] border border-[rgba(0,255,136,0.1)] rounded-lg px-4 py-2.5 hover:border-[#00ff88] transition-colors gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-[#c0c0d0] truncate">{i.contact.name}</p>
                      <p className="text-xs text-[#666688] truncate">{i.summary}</p>
                    </div>
                    <span className="text-xs text-[#666688] flex-shrink-0">
                      {new Date(i.occurredAt).toLocaleDateString("en-GB")}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.openActionItems.length > 0 && (
            <section>
              <SectionHeader
                title="Open action items"
                subtitle={`${data.openActionItems.length} outstanding`}
              />
              <div className="space-y-2">
                {data.openActionItems.slice(0, 10).map(item => (
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
              <SectionHeader title="Scheduling alerts" tone="danger" />
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

function SectionHeader({
  title,
  subtitle,
  action,
  tone,
}: {
  title: string
  subtitle?: string
  action?: { href: string; label: string }
  tone?: "danger"
}) {
  return (
    <div className="flex items-end justify-between mb-3 gap-3">
      <div className="min-w-0">
        <h2
          className={`text-xs font-semibold uppercase tracking-wide truncate ${
            tone === "danger" ? "text-[#ff4444]" : "text-[#666688]"
          }`}
        >
          {title}
        </h2>
        {subtitle && <p className="text-xs text-[#444466] mt-0.5">{subtitle}</p>}
      </div>
      {action && (
        <Link href={action.href} className="text-xs text-[#00ff88] hover:text-[#00cc6f] flex-shrink-0">
          {action.label} →
        </Link>
      )}
    </div>
  )
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="bg-[#111125] border border-[rgba(0,255,136,0.08)] rounded-lg px-4 py-3 text-sm text-[#666688]">
      {text}
    </div>
  )
}
