import { listProjects } from "@/lib/services/projects"
import { ProjectCard } from "@/components/projects/project-card"
import Link from "next/link"

interface PageProps { searchParams: Promise<{ status?: string }> }

export default async function ProjectsPage({ searchParams }: PageProps) {
  const { status } = await searchParams
  let projects: Awaited<ReturnType<typeof listProjects>> = []
  let dbError = false
  try {
    projects = await listProjects({ status })
  } catch (e) {
    console.error("[projects page]", e)
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
        <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
        <Link href="/projects/new" className="bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700">
          + New project
        </Link>
      </div>

      <form className="flex gap-2">
        <select name="status" defaultValue={status ?? ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All statuses</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button type="submit" className="bg-gray-100 border border-gray-300 text-sm px-3 py-2 rounded-lg hover:bg-gray-200">Filter</button>
      </form>

      {projects.length === 0 ? (
        <p className="text-sm text-gray-500">No projects yet. Create your first project.</p>
      ) : (
        <div className="space-y-2">
          {projects.map(p => {
            const regularTasks = p.tasks.filter(t => !t.isMilestone)
            const taskDoneCount = regularTasks.filter(t => t.status === "done").length
            return (
              <ProjectCard
                key={p.id}
                id={p.id}
                title={p.title}
                category={p.category}
                status={p.status}
                priority={p.priority}
                targetDate={p.targetDate}
                taskDoneCount={taskDoneCount}
                taskTotalCount={regularTasks.length}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
