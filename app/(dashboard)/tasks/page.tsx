import { listTasks } from "@/lib/services/tasks"
import { TaskRow } from "@/components/tasks/task-row"

interface PageProps { searchParams: Promise<{ status?: string; assignedTo?: string; milestoneOnly?: string }> }

export default async function TasksPage({ searchParams }: PageProps) {
  const { status, assignedTo, milestoneOnly } = await searchParams
  let tasks: Awaited<ReturnType<typeof listTasks>> = []
  let dbError = false

  try {
    tasks = await listTasks({ status, assignedTo, milestoneOnly: milestoneOnly === "true" })
  } catch (e) {
    console.error("[tasks page]", e)
    dbError = true
  }

  // Group tasks by project (project relation already included in listTasks)
  const grouped = new Map<string, typeof tasks>()
  for (const task of tasks) {
    const projectTitle = task.project.title
    if (!grouped.has(projectTitle)) grouped.set(projectTitle, [])
    grouped.get(projectTitle)!.push(task)
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      {dbError && (
        <div className="bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.25)] rounded-lg px-4 py-3 text-sm text-red-400">
          Database unavailable. Check server logs.
        </div>
      )}
      <h1 className="text-xl font-semibold text-[#c0c0d0]">Tasks</h1>

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
          {Array.from(grouped.entries()).map(([projectTitle, projectTasks]) => (
            <section key={projectTitle}>
              <h2 className="text-sm font-semibold text-[#c0c0d0] mb-2">{projectTitle}</h2>
              <div className="space-y-2">
                {projectTasks.map(t => (
                  <TaskRow
                    key={t.id}
                    id={t.id}
                    title={t.title}
                    status={t.status}
                    priority={t.priority}
                    assignedTo={t.assignedTo}
                    dueDate={t.dueDate ? t.dueDate.toISOString() : null}
                    isMilestone={t.isMilestone}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
