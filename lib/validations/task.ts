import { z } from "zod"
import { PrioritySchema, ActorSchema } from "@/lib/validations/action-item"

export const CreateTaskSchema = z.object({
  projectId: z.string().uuid().nullable().optional().default(null),
  goalId: z.string().uuid().optional(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().default(""),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).default("todo"),
  priority: PrioritySchema.default("medium"),
  assignedTo: ActorSchema,
  assignedToUserId: z.string().uuid().nullable().optional(),
  dueDate: z.string().date().nullable().default(null),
  isMilestone: z.boolean().default(false),
  importance: z.enum(["undefined_imp", "core", "step", "bonus"]).optional(),
  urgency: z.enum(["undefined_urg", "dated", "asap", "soon", "sometime"]).optional(),
  effortSize: z.enum(["undefined_size", "minutes", "hour", "half_day", "day", "project_size", "milestone"]).optional(),
  effortMinutes: z.number().int().min(0).nullable().optional(),
})

export const UpdateTaskSchema = CreateTaskSchema.omit({ projectId: true }).partial().extend({
  projectId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().optional(),
})

export const UpdateTaskStatusSchema = z.object({
  status: z.enum(["todo", "in_progress", "done", "cancelled"]),
})

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusSchema>
