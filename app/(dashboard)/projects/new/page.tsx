import { ProjectForm } from "@/components/projects/project-form"

export default function NewProjectPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">New project</h1>
      <ProjectForm />
    </div>
  )
}
