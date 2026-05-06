import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import Link from "next/link"
import { TaskEditForm, type TaskEditInitial } from "@/components/tasks/task-edit-form"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditTaskPage({ params }: PageProps) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) redirect("/login")

  const { id } = await params

  const task = await prisma.task.findFirst({
    where: {
      id,
      OR: [
        { project: { OR: [{ userId }, { members: { some: { userId } } }, { visibility: "shared" }] } },
        { projectId: null, goal: { userId } },
      ],
    },
    include: {
      project: { select: { id: true, title: true, visibility: true } },
      goal: { select: { id: true, name: true } },
      role: { select: { id: true, name: true } },
    },
  })
  if (!task) notFound()

  const initial: TaskEditInitial = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignedTo: task.assignedTo,
    assignedToUserId: task.assignedToUserId,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    isMilestone: task.isMilestone,
    importance: task.importance,
    urgency: task.urgency,
    effortSize: task.effortSize,
    effortMinutes: task.effortMinutes,
    roleId: task.roleId,
    goalId: task.goalId,
    projectId: task.projectId,
    projectVisibility: task.project?.visibility ?? null,
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/tasks" className="text-sm text-[#666688] hover:text-[#c0c0d0]">&larr; Tasks</Link>
          <h1 className="text-xl font-semibold text-[#c0c0d0] mt-1">Edit task</h1>
          <p className="text-xs text-[#666688]">
            {task.role?.name} &middot; {task.goal?.name}
            {task.project ? ` · ${task.project.title}` : ""}
          </p>
        </div>
      </div>
      <TaskEditForm task={initial} />
    </div>
  )
}
