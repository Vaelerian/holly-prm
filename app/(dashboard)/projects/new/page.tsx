import { ProjectForm } from "@/components/projects/project-form"

export default function NewProjectPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold text-[#c0c0d0]">New project</h1>
      <ProjectForm />
    </div>
  )
}
