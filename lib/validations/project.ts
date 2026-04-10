import { z } from "zod"
import { PrioritySchema } from "@/lib/validations/action-item"

export const CreateProjectSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().default(""),
  category: z.enum(["personal", "work", "volunteer"]),
  status: z.enum(["planning", "active", "on_hold", "done", "cancelled"]).default("planning"),
  priority: PrioritySchema.default("medium"),
  targetDate: z.string().date().nullable().default(null),
  notes: z.string().default(""),
})

export const UpdateProjectSchema = CreateProjectSchema.partial()

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
