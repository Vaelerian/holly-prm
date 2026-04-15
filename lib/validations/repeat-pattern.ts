import { z } from "zod"

export const CreateRepeatPatternSchema = z.object({
  roleId: z.string().uuid(),
  repeatType: z.enum(["daily", "weekly", "monthly_by_date", "monthly_by_day", "yearly_by_date", "yearly_by_day"]),
  intervalValue: z.number().int().min(1).default(1),
  startDate: z.string().date(),
  endDate: z.string().date().nullable().default(null),
  dayPattern: z.record(z.unknown()).default({}),
  startMinutes: z.number().int().min(0).max(1439),
  endMinutes: z.number().int().min(0).max(1439),
  title: z.string().default(""),
}).refine(data => data.endMinutes > data.startMinutes, {
  message: "End time must be after start time",
  path: ["endMinutes"],
})

export const UpdateRepeatPatternSchema = z.object({
  roleId: z.string().uuid().optional(),
  repeatType: z.enum(["daily", "weekly", "monthly_by_date", "monthly_by_day", "yearly_by_date", "yearly_by_day"]).optional(),
  intervalValue: z.number().int().min(1).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().nullable().optional(),
  dayPattern: z.record(z.unknown()).optional(),
  startMinutes: z.number().int().min(0).max(1439).optional(),
  endMinutes: z.number().int().min(0).max(1439).optional(),
  title: z.string().optional(),
})

export const ModifyInstanceSchema = z.object({
  startMinutes: z.number().int().min(0).max(1439).optional(),
  endMinutes: z.number().int().min(0).max(1439).optional(),
  title: z.string().optional(),
})

export type CreateRepeatPatternInput = z.infer<typeof CreateRepeatPatternSchema>
export type UpdateRepeatPatternInput = z.infer<typeof UpdateRepeatPatternSchema>
export type ModifyInstanceInput = z.infer<typeof ModifyInstanceSchema>
