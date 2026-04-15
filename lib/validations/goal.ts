import { z } from "zod"

export const CreateGoalSchema = z.object({
  roleId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().default(""),
  goalType: z.enum(["ongoing", "completable"]),
  targetDate: z.string().date().nullable().default(null),
})

export const UpdateGoalSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  goalType: z.enum(["ongoing", "completable"]).optional(),
  targetDate: z.string().date().nullable().optional(),
  roleId: z.string().uuid().optional(),
})

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>
