import { getProject } from "@/lib/services/projects"
import { prisma } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { TaskRow } from "@/components/tasks/task-row"
import { AddTaskForm } from "@/components/tasks/add-task-form"
import { DeleteProjectButton } from "@/components/projects/delete-project-button"
import { ProjectMembers } from "@/components/projects/project-members"
import { auth } from "@/lib/auth"
import Link from "next/link"
import { notFound } from "next/navigation"

interface PageProps { params: Promise<{ id: string }> }

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params
  const session = await auth()
  const userId = session?.userId ?? ""
  const project = await getProject(id, userId)
  if (!project) notFound()

  const isOwner = project.userId === userId
  const members = project.members ?? []

  const actionItems = await prisma.actionItem.findMany({
    where: { task: { projectId: id }, status: "todo" },
    include: { task: { select: { id: true, title: true } } },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
  })

  const milestones = project.tasks.filter(t => t.isMilestone)
  const tasks = project.tasks.filter(t => !t.isMilestone)

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#c0c0d0]">{project.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge>{project.category}</Badge>
            <Badge variant={project.status === "active" ? "info" : project.status === "done" ? "success" : "default"}>
              {project.status.replace("_", " ")}
            </Badge>
            <Badge variant={project.priority === "critical" ? "danger" : project.priority === "high" ? "warning" : "default"}>
              {project.priority}
            </Badge>
            <Badge variant={project.visibility === "shared" ? "success" : "default"}>
              {project.visibility === "shared" ? "Shared" : "Personal"}
            </Badge>
            {project.targetDate && (
              <span className="text-xs text-[#666688]">Due {new Date(project.targetDate).toLocaleDateString("en-GB")}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/projects/${id}/edit`} className="text-sm text-[#00ff88] hover:text-[#00cc6f]">Edit</Link>
          <DeleteProjectButton projectId={id} />
        </div>
      </div>

      {project.description && (
        <p className="text-sm text-[#c0c0d0]">{project.description}</p>
      )}

      {milestones.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-3">Milestones</h2>
          <div className="flex gap-4 flex-wrap">
            {milestones.map(m => (
              <div key={m.id} className="flex items-center gap-2 bg-[rgba(160,0,255,0.08)] border border-[rgba(160,0,255,0.2)] rounded-lg px-3 py-2">
                <span className={`w-2 h-2 rounded-full ${m.status === "done" ? "bg-green-500" : m.status === "in_progress" ? "bg-blue-500" : "bg-[#666688]"}`} />
                <span className="text-sm font-medium text-[#c0c0d0]">{m.title}</span>
                {m.dueDate && <span className="text-xs text-[#666688]">{new Date(m.dueDate).toLocaleDateString("en-GB")}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-3">Tasks</h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-[#666688]">No tasks yet.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => (
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
        )}
        <AddTaskForm projectId={id} />
      </section>

      {actionItems.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-3">Action items</h2>
          <div className="space-y-2">
            {actionItems.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-2.5">
                <div>
                  <p className="text-sm text-[#c0c0d0]">{item.title}</p>
                  {item.task && <p className="text-xs text-[#666688]">Task: {item.task.title}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {item.dueDate && <span className="text-xs text-[#666688]">{new Date(item.dueDate).toLocaleDateString("en-GB")}</span>}
                  <Badge>{item.assignedTo}</Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <ProjectMembers projectId={id} members={members} isOwner={isOwner} />
    </div>
  )
}
