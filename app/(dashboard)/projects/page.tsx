import { listProjects } from "@/lib/services/projects"
import { ProjectCard } from "@/components/projects/project-card"
import { auth } from "@/lib/auth"
import Link from "next/link"

interface PageProps { searchParams: Promise<{ status?: string; roleId?: string; goalId?: string }> }

export default async function ProjectsPage({ searchParams }: PageProps) {
  const { status, roleId, goalId } = await searchParams
  const session = await auth()
  const userId = session?.userId ?? ""
  let projects: Awaited<ReturnType<typeof listProjects>> = []
  let dbError = false
  try {
    projects = await listProjects({ status, roleId, goalId, userId })
  } catch (e) {
    console.error("[projects page]", e)
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
        <h1 className="text-xl font-semibold text-[#c0c0d0]">Projects</h1>
        <Link href="/projects/new" className="bg-[#00ff88] text-[#0a0a1a] text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-[#00cc6f]">
          + New project
        </Link>
      </div>

      <form className="flex gap-2">
        <select name="status" defaultValue={status ?? ""} className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]">
          <option value="">All statuses</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button type="submit" className="bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] text-[#c0c0d0] text-sm px-3 py-2 rounded-lg hover:bg-[rgba(0,255,136,0.08)]">Filter</button>
      </form>

      {projects.length === 0 ? (
        <p className="text-sm text-[#666688]">No projects yet. Create your first project.</p>
      ) : (
        <div className="space-y-2">
          {projects.map(p => {
            const regularTasks = p.tasks.filter(t => !t.isMilestone)
            const taskDoneCount = regularTasks.filter(t => t.status === "done").length
            const isShared = p.userId !== userId
            return (
              <div key={p.id} className="relative">
                {isShared && (
                  <span className="absolute top-2 right-2 z-10 text-xs bg-[rgba(0,255,136,0.1)] border border-[rgba(0,255,136,0.2)] text-[#00ff88] px-2 py-0.5 rounded-full">
                    Shared
                  </span>
                )}
                <ProjectCard
                  id={p.id}
                  title={p.title}
                  category={p.category}
                  status={p.status}
                  priority={p.priority}
                  targetDate={p.targetDate}
                  taskDoneCount={taskDoneCount}
                  taskTotalCount={regularTasks.length}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
