import { listTasks } from "@/lib/services/tasks"
import { listRoles } from "@/lib/services/roles"
import { TaskRow } from "@/components/tasks/task-row"
import { AddTaskForm } from "@/components/tasks/add-task-form"
import { ScheduleAllButton } from "@/components/tasks/schedule-all-button"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

const SCHEDULE_STATE_COLORS: Record<string, string> = {
  floating: "bg-[#00ff88]",
  fixed: "bg-blue-500",
  alert: "bg-[#ff4444]",
  unscheduled: "bg-[#666688]",
}

interface PageProps { searchParams: Promise<{ status?: string; assignedTo?: string; milestoneOnly?: string; roleId?: string; goalId?: string }> }

export default async function TasksPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.userId) redirect("/login")
  const { status, assignedTo, milestoneOnly, roleId, goalId } = await searchParams
  let tasks: Awaited<ReturnType<typeof listTasks>> = []
  let roles: Awaited<ReturnType<typeof listRoles>> = []
  let dbError = false

  try {
    ;[tasks, roles] = await Promise.all([
      listTasks({ status, assignedTo, milestoneOnly: milestoneOnly === "true", roleId, goalId, userId: session.userId }),
      listRoles(session.userId),
    ])
  } catch (e) {
    console.error("[tasks page]", e)
    dbError = true
  }

  // Group tasks by role > goal > project
  const grouped = new Map<string, Map<string, Map<string, typeof tasks>>>()
  for (const task of tasks) {
    const roleName = task.role?.name ?? "No role"
    const roleColour = task.role?.name ? undefined : "#666688"
    const goalName = task.goal?.name ?? "No goal"
    const projectTitle = task.project?.title ?? "Direct tasks"

    if (!grouped.has(roleName)) grouped.set(roleName, new Map())
    const goalMap = grouped.get(roleName)!
    if (!goalMap.has(goalName)) goalMap.set(goalName, new Map())
    const projectMap = goalMap.get(goalName)!
    if (!projectMap.has(projectTitle)) projectMap.set(projectTitle, [])
    projectMap.get(projectTitle)!.push(task)

    // Store colour for lookup
    if (task.role && !roleColour) {
      // We use the role relation data from the task
    }
  }

  // Build a colour map from tasks
  const roleColourMap: Record<string, string> = {}
  for (const task of tasks) {
    if (task.role) {
      // The role select only includes id and name, not colour.
      // We will use roles list to get colours.
    }
  }
  for (const role of roles) {
    roleColourMap[role.name] = role.colour
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
        <ScheduleAllButton />
      </div>

      <form className="flex gap-2 flex-wrap">
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
      ) : (
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
                                    dueDate={t.dueDate ? t.dueDate.toISOString() : null}
                                    isMilestone={t.isMilestone}
                                  />
                                </div>
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
