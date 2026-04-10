import { getProject } from "@/lib/services/projects"
import { ProjectForm } from "@/components/projects/project-form"
import { notFound } from "next/navigation"

interface PageProps { params: Promise<{ id: string }> }

export default async function EditProjectPage({ params }: PageProps) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Edit project</h1>
      <ProjectForm
        projectId={id}
        defaultValues={{
          title: project.title,
          description: project.description,
          category: project.category,
          status: project.status,
          priority: project.priority,
          targetDate: project.targetDate ? project.targetDate.toISOString().slice(0, 10) : null,
          notes: project.notes,
        }}
      />
    </div>
  )
}
