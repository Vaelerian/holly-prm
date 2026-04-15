import { z } from "zod"

export const CreateTimeSlotSchema = z.object({
  roleId: z.string().uuid(),
  date: z.string().date(),
  startMinutes: z.number().int().min(0).max(1439),
  endMinutes: z.number().int().min(0).max(1439),
  title: z.string().default(""),
}).refine(data => data.endMinutes > data.startMinutes, {
  message: "End time must be after start time",
  path: ["endMinutes"],
})

export const UpdateTimeSlotSchema = z.object({
  roleId: z.string().uuid().optional(),
  startMinutes: z.number().int().min(0).max(1439).optional(),
  endMinutes: z.number().int().min(0).max(1439).optional(),
  title: z.string().optional(),
})

export type CreateTimeSlotInput = z.infer<typeof CreateTimeSlotSchema>
export type UpdateTimeSlotInput = z.infer<typeof UpdateTimeSlotSchema>
