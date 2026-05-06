import { z } from "zod"

const completableRequiresTargetDate = (
  data: { goalType?: "ongoing" | "completable"; targetDate?: string | null }
) => {
  if (data.goalType === "completable" && !data.targetDate) return false
  if (data.goalType === "ongoing" && data.targetDate) return false
  return true
}
const targetDateRefinement = {
  message: "Completable goals require a target date; ongoing goals must not have one.",
  path: ["targetDate"],
}

export const CreateGoalSchema = z
  .object({
    roleId: z.string().uuid(),
    name: z.string().min(1, "Name is required").max(100),
    description: z.string().default(""),
    goalType: z.enum(["ongoing", "completable"]),
    targetDate: z.string().date().nullable().default(null),
  })
  .refine(completableRequiresTargetDate, targetDateRefinement)

export const UpdateGoalSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    goalType: z.enum(["ongoing", "completable"]).optional(),
    status: z.enum(["active", "completed", "archived"]).optional(),
    targetDate: z.string().date().nullable().optional(),
    roleId: z.string().uuid().optional(),
  })
  .refine(completableRequiresTargetDate, targetDateRefinement)

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>
