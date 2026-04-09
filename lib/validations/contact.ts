import { z } from "zod"

export const ContactTypeSchema = z.enum(["personal", "work", "family", "volunteer"])

export const CreateContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  type: ContactTypeSchema,
  emails: z.array(z.object({ label: z.string(), value: z.string().email() })).default([]),
  phones: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  interactionFreqDays: z.number().int().positive().nullable().default(null),
  isFamilyMember: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  notes: z.string().default(""),
  preferences: z.record(z.string(), z.unknown()).default({}),
})

export const UpdateContactSchema = CreateContactSchema.partial()

export type CreateContactInput = z.infer<typeof CreateContactSchema>
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>
