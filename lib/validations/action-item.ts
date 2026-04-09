import { z } from "zod"

export const PrioritySchema = z.enum(["low", "medium", "high", "critical"])
export const ActorSchema = z.enum(["ian", "holly"])

export const CreateActionItemSchema = z.object({
  interactionId: z.string().uuid().nullable().default(null),
  taskId: z.string().uuid().nullable().default(null),
  title: z.string().min(1).max(500),
  priority: PrioritySchema.default("medium"),
  assignedTo: ActorSchema,
  dueDate: z.string().datetime().nullable().default(null),
})

export const UpdateActionItemSchema = z.object({
  status: z.enum(["todo", "done", "cancelled"]),
})

export type CreateActionItemInput = z.infer<typeof CreateActionItemSchema>
export type UpdateActionItemInput = z.infer<typeof UpdateActionItemSchema>
