import { z } from "zod"

export const CreateTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assignedTo: z.enum(["ian", "holly"]),
  dueDate: z.string().datetime().nullable().default(null),
  isMilestone: z.boolean().default(false),
})

export const UpdateTaskSchema = CreateTaskSchema.omit({ projectId: true }).partial()

export const UpdateTaskStatusSchema = z.object({
  status: z.enum(["todo", "in_progress", "done", "cancelled"]),
})

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusSchema>
