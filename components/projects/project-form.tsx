"use client"

import { useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { CreateProjectSchema } from "@/lib/validations/project"

type FormInput = z.input<typeof CreateProjectSchema>
type FormOutput = z.infer<typeof CreateProjectSchema>

interface RoleOption { id: string; name: string; colour: string }
interface GoalOption { id: string; name: string; goalType: string }

interface ProjectFormProps {
  defaultValues?: Partial<FormInput> & { roleId?: string }
  projectId?: string
}

export function ProjectForm({ defaultValues, projectId }: ProjectFormProps) {
  const router = useRouter()
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: defaultValues ?? {
      title: "",
      description: "",
      category: "personal",
      status: "planning",
      priority: "medium",
      targetDate: null,
      notes: "",
      visibility: "personal",
    },
  })

  const [roles, setRoles] = useState<RoleOption[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string>(defaultValues?.roleId ?? "")
  const [goals, setGoals] = useState<GoalOption[]>([])
  const [selectedGoalId, setSelectedGoalId] = useState<string>(defaultValues?.goalId ?? "")

  const fetchGoals = useCallback(async (roleId: string) => {
    if (!roleId) { setGoals([]); return }
    const res = await fetch(`/api/v1/goals?roleId=${roleId}`)
    if (res.ok) {
      const data: GoalOption[] = await res.json()
      setGoals(data)
      // If editing and the current goalId belongs to this role, keep it
      if (defaultValues?.goalId && data.some(g => g.id === defaultValues.goalId)) {
        setSelectedGoalId(defaultValues.goalId)
        setValue("goalId", defaultValues.goalId)
      } else if (data.length > 0) {
        setSelectedGoalId(data[0].id)
        setValue("goalId", data[0].id)
      }
    }
  }, [defaultValues?.goalId, setValue])

  useEffect(() => {
    async function loadRoles() {
      const res = await fetch("/api/v1/roles")
      if (res.ok) {
        const data: RoleOption[] = await res.json()
        setRoles(data)
        // If editing, pre-select the role
        if (defaultValues?.roleId) {
          setSelectedRoleId(defaultValues.roleId)
          fetchGoals(defaultValues.roleId)
        } else if (data.length > 0) {
          setSelectedRoleId(data[0].id)
          fetchGoals(data[0].id)
        }
      }
    }
    loadRoles()
  }, [defaultValues?.roleId, fetchGoals])

  function handleRoleChange(roleId: string) {
    setSelectedRoleId(roleId)
    setSelectedGoalId("")
    fetchGoals(roleId)
  }

  function handleGoalChange(goalId: string) {
    setSelectedGoalId(goalId)
    setValue("goalId", goalId)
  }

  async function onSubmit(data: FormOutput) {
    const url = projectId ? `/api/v1/projects/${projectId}` : "/api/v1/projects"
    const method = projectId ? "PUT" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const project = await res.json()
      router.push(`/projects/${project.id}`)
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-[#c0c0d0] mb-1">Role</label>
          <select
            value={selectedRoleId}
            onChange={e => handleRoleChange(e.target.value)}
            className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]"
          >
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#c0c0d0] mb-1">Goal</label>
          <select
            value={selectedGoalId}
            onChange={e => handleGoalChange(e.target.value)}
            className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]"
          >
            {goals.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <input type="hidden" {...register("goalId")} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#c0c0d0] mb-1">Title *</label>
        <input {...register("title")} className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]" />
        {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-[#c0c0d0] mb-1">Description</label>
        <textarea {...register("description")} rows={3} className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-[#c0c0d0] mb-1">Category</label>
          <select {...register("category")} className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]">
            <option value="personal">Personal</option>
            <option value="work">Work</option>
            <option value="volunteer">Volunteer</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#c0c0d0] mb-1">Status</label>
          <select {...register("status")} className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]">
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#c0c0d0] mb-1">Priority</label>
          <select {...register("priority")} className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#c0c0d0] mb-1">Visibility</label>
        <select {...register("visibility")} className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]">
          <option value="personal">Personal</option>
          <option value="shared">Shared</option>
        </select>
        <p className="text-xs text-[#666688] mt-1">Personal projects are only visible to you. Shared projects are visible to all approved users who can also add tasks.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#c0c0d0] mb-1">Scheduling priority</label>
        <select {...register("projectImportance")} className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]">
          <option value="same">Same</option>
          <option value="more">More Important</option>
          <option value="less">Less Important</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#c0c0d0] mb-1">Target date</label>
        <input type="date" {...register("targetDate")} className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]" />
      </div>

      <div>
        <label className="block text-sm font-medium text-[#c0c0d0] mb-1">Notes</label>
        <textarea {...register("notes")} rows={3} className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]" />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={isSubmitting} className="bg-[#00ff88] text-[#0a0a1a] text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#00cc6f] disabled:opacity-50">
          {isSubmitting ? "Saving..." : (projectId ? "Save changes" : "Create project")}
        </button>
        <button type="button" onClick={() => router.back()} className="text-sm text-[#c0c0d0] hover:text-[#00ff88]">Cancel</button>
      </div>
    </form>
  )
}
