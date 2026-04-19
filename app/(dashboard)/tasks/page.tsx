import { listTasks } from "@/lib/services/tasks"
import { listRoles } from "@/lib/services/roles"
import { TaskRow } from "@/components/tasks/task-row"
import { AddTaskForm } from "@/components/tasks/add-task-form"
import { ScheduleAllButton } from "@/components/tasks/schedule-all-button"
import { FloatBadge } from "@/components/tasks/float-badge"
import { TaskScheduleButton } from "@/components/tasks/task-schedule-button"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

const SCHEDULE_STATE_COLORS: Record<string, string> = {
  floating: "bg-[#00ff88]",
  fixed: "bg-blue-500",
  alert: "bg-[#ff4444]",
  unscheduled: "bg-[#666688]",
}

interface PageProps { searchParams: Promise<{ status?: string; assignedTo?: string; milestoneOnly?: string; roleId?: string; goalId?: string; view?: string }> }

function minutesToTime(m: number): string {
  return `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`
}

export default async function TasksPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.userId) redirect("/login")
  const { status, assignedTo, milestoneOnly, roleId, goalId, view } = await searchParams
  const viewMode = view === "schedule" ? "schedule" : "goal"
  let tasks: Awaited<ReturnType<typeof listTasks>> = []
  let roles: Awaited<ReturnType<typeof listRoles>> = []
  let dbError = false

  try {
    ;[tasks, roles] = await Promise.all([
      listTasks({ status, assignedTo, milestoneOnly: milestoneOnly === "true", roleId, goalId, userId: session.userId, includeSlot: viewMode === "schedule" }),
      listRoles(session.userId),
    ])
  } catch (e) {
    console.error("[tasks page]", e)
    dbError = true
  }

  // Build a colour map from roles
  const roleColourMap: Record<string, string> = {}
  for (const role of roles) {
    roleColourMap[role.name] = role.colour
  }

  // Role colour by id for schedule view
  const roleColourById: Record<string, string> = {}
  for (const role of roles) {
    roleColourById[role.id] = role.colour
  }

  // Build URL preserving existing query params
  function buildUrl(targetView: string): string {
    const params = new URLSearchParams()
    params.set("view", targetView)
    if (status) params.set("status", status)
    if (assignedTo) params.set("assignedTo", assignedTo)
    if (milestoneOnly === "true") params.set("milestoneOnly", "true")
    if (roleId) params.set("roleId", roleId)
    if (goalId) params.set("goalId", goalId)
    return `/tasks?${params.toString()}`
  }

  const activeClass = "px-2 py-1 text-xs rounded bg-[rgba(0,255,136,0.15)] text-[#00ff88]"
  const inactiveClass = "px-2 py-1 text-xs rounded text-[#666688] hover:text-[#c0c0d0]"

  // Group tasks by role > goal > project for "goal" view
  const grouped = new Map<string, Map<string, Map<string, typeof tasks>>>()
  if (viewMode === "goal") {
    for (const task of tasks) {
      const roleName = task.role?.name ?? "No role"
      const goalName = task.goal?.name ?? "No goal"
      const projectTitle = task.project?.title ?? "Direct tasks"

      if (!grouped.has(roleName)) grouped.set(roleName, new Map())
      const goalMap = grouped.get(roleName)!
      if (!goalMap.has(goalName)) goalMap.set(goalName, new Map())
      const projectMap = goalMap.get(goalName)!
      if (!projectMap.has(projectTitle)) projectMap.set(projectTitle, [])
      projectMap.get(projectTitle)!.push(task)
    }
  }

  // Schedule view grouping
  type TaskWithSlot = (typeof tasks)[number] & { timeSlot?: { id: string; date: Date; startMinutes: number; endMinutes: number; title: string } | null }
  const scheduledTasks: TaskWithSlot[] = []
  const alertTasks: TaskWithSlot[] = []
  const unscheduledTasks: TaskWithSlot[] = []

  if (viewMode === "schedule") {
    for (const t of tasks as TaskWithSlot[]) {
      if (t.timeSlotId) {
        scheduledTasks.push(t)
      } else if (t.scheduleState === "alert") {
        alertTasks.push(t)
      } else if (t.importance !== "undefined_imp") {
        unscheduledTasks.push(t)
      }
    }
    // Sort scheduled by slot date then startMinutes
    scheduledTasks.sort((a, b) => {
      const aDate = a.timeSlot?.date ? new Date(a.timeSlot.date).getTime() : 0
      const bDate = b.timeSlot?.date ? new Date(b.timeSlot.date).getTime() : 0
      if (aDate !== bDate) return aDate - bDate
      return (a.timeSlot?.startMinutes ?? 0) - (b.timeSlot?.startMinutes ?? 0)
    })
  }

  // Group scheduled tasks by date
  const scheduledByDate = new Map<string, TaskWithSlot[]>()
  for (const t of scheduledTasks) {
    if (t.timeSlot?.date) {
      const d = new Date(t.timeSlot.date)
      const dateStr = d.toLocaleDateString("en-CA")
      if (!scheduledByDate.has(dateStr)) scheduledByDate.set(dateStr, [])
      scheduledByDate.get(dateStr)!.push(t)
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      {dbError && (
        <div className="bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.25)] rounded-lg px-4 py-3 text-sm text-red-400">
          Database unavailable. Check server logs.
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#c0c0d0]">Tasks</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <a href={buildUrl("goal")} className={viewMode === "goal" ? activeClass : inactiveClass}>By Goal</a>
            <a href={buildUrl("schedule")} className={viewMode === "schedule" ? activeClass : inactiveClass}>By Schedule</a>
          </div>
          <ScheduleAllButton />
        </div>
      </div>

      <form className="flex gap-2 flex-wrap">
        {view && <input type="hidden" name="view" value={view} />}
        <select name="status" defaultValue={status ?? ""} className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none">
          <option value="">All statuses</option>
          <option value="todo">Todo</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select name="assignedTo" defaultValue={assignedTo ?? ""} className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none">
          <option value="">All assignees</option>
          <option value="ian">Ian</option>
          <option value="holly">Holly</option>
        </select>
        <select name="roleId" defaultValue={roleId ?? ""} className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none">
          <option value="">All roles</option>
          {roles.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-[#c0c0d0] border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2">
          <input type="checkbox" name="milestoneOnly" value="true" defaultChecked={milestoneOnly === "true"} />
          Milestones only
        </label>
        <button type="submit" className="bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] text-[#c0c0d0] text-sm px-3 py-2 rounded-lg hover:bg-[rgba(0,255,136,0.08)]">Filter</button>
      </form>

      {tasks.length === 0 ? (
        <p className="text-sm text-[#666688]">No tasks match your filters.</p>
      ) : viewMode === "schedule" ? (
        /* ─── Schedule View ─── */
        <div className="space-y-6">
          {/* Scheduled tasks grouped by date */}
          {scheduledByDate.size > 0 && (
            <div className="space-y-4">
              {Array.from(scheduledByDate.entries()).map(([dateStr, dateTasks]) => (
                <section key={dateStr}>
                  <h2 className="text-sm font-semibold text-[#c0c0d0] mb-2">
                    {new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </h2>
                  <div className="space-y-1.5 ml-2">
                    {dateTasks.map(t => (
                      <div key={t.id} className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: t.role?.colour ?? roleColourById[t.roleId ?? ""] ?? "#666688" }}
                        />
                        {t.timeSlot && (
                          <a href="/calendar" className="text-[10px] text-[#666688] hover:text-[#c0c0d0] flex-shrink-0">
                            {minutesToTime(t.timeSlot.startMinutes)}-{minutesToTime(t.timeSlot.endMinutes)}
                          </a>
                        )}
                        <span className="text-sm text-[#c0c0d0] truncate flex-1">{t.title}</span>
                        {t.effortSize && t.effortSize !== "undefined_size" && (
                          <span className="text-[10px] text-[#444466] flex-shrink-0">{t.effortSize}</span>
                        )}
                        <FloatBadge
                          slotDate={t.timeSlot?.date ? new Date(t.timeSlot.date).toLocaleDateString("en-CA") : null}
                          dueDate={t.dueDate ? t.dueDate.toISOString() : null}
                        />
                        <TaskScheduleButton taskId={t.id} importance={t.importance} scheduleState={t.scheduleState} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* Alert tasks */}
          {alertTasks.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[#ff4444] mb-2">Alerts</h2>
              <div className="space-y-1.5 ml-2">
                {alertTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[#ff4444]" />
                    <span className="text-sm text-[#c0c0d0] truncate flex-1">{t.title}</span>
                    <TaskScheduleButton taskId={t.id} importance={t.importance} scheduleState={t.scheduleState} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Unscheduled tasks */}
          {unscheduledTasks.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[#666688] mb-2">Unscheduled</h2>
              <div className="space-y-1.5 ml-2">
                {unscheduledTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.role?.colour ?? roleColourById[t.roleId ?? ""] ?? "#666688" }}
                    />
                    <span className="text-sm text-[#c0c0d0] truncate flex-1">{t.title}</span>
                    {t.effortSize && t.effortSize !== "undefined_size" && (
                      <span className="text-[10px] text-[#444466] flex-shrink-0">{t.effortSize}</span>
                    )}
                    <FloatBadge slotDate={null} dueDate={t.dueDate ? t.dueDate.toISOString() : null} />
                    <TaskScheduleButton taskId={t.id} importance={t.importance} scheduleState={t.scheduleState} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        /* ─── Goal View ─── */
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([roleName, goalMap]) => (
            <section key={roleName}>
              <h2 className="text-sm font-semibold text-[#c0c0d0] mb-3 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: roleColourMap[roleName] ?? "#666688" }} />
                {roleName}
              </h2>
              <div className="space-y-4 ml-5">
                {Array.from(goalMap.entries()).map(([goalName, projectMap]) => (
                  <div key={goalName}>
                    <h3 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-2">{goalName}</h3>
                    <div className="space-y-3 ml-3">
                      {Array.from(projectMap.entries()).map(([projectTitle, projectTasks]) => (
                        <div key={projectTitle}>
                          <p className="text-xs text-[#666688] mb-1">{projectTitle}</p>
                          <div className="space-y-2">
                            {projectTasks.map(t => (
                              <div key={t.id} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: roleColourMap[roleName] ?? "#666688" }} />
                                {t.importance !== "undefined_imp" && (
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${SCHEDULE_STATE_COLORS[t.scheduleState] ?? "bg-[#666688]"}`} title={t.scheduleState} />
                                )}
                                <div className="flex-1">
                                  <TaskRow
                                    id={t.id}
                                    title={t.title}
                                    status={t.status}
                                    priority={t.priority}
                                    assignedTo={t.assignedTo}
                                    assignedToUser={t.assignedToUser}
                                    dueDate={t.dueDate ? t.dueDate.toISOString() : null}
                                    isMilestone={t.isMilestone}
                                  />
                                </div>
                                <FloatBadge
                                  slotDate={null}
                                  dueDate={t.dueDate ? t.dueDate.toISOString() : null}
                                />
                                <TaskScheduleButton taskId={t.id} importance={t.importance} scheduleState={t.scheduleState} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <AddTaskForm />
    </div>
  )
}
