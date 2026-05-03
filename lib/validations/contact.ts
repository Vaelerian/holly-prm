import { z } from "zod"

export const ContactTypeSchema = z.enum(["personal", "work", "family", "volunteer"])

export const AddressSchema = z.object({
  label: z.string().default(""),
  line1: z.string().min(1, "Address line 1 is required").max(200),
  line2: z.string().default(""),
  city: z.string().default(""),
  region: z.string().default(""),
  postcode: z.string().default(""),
  country: z.string().default(""),
})

export const CreateContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  type: ContactTypeSchema,
  emails: z.array(z.object({ label: z.string(), value: z.string().email() })).default([]),
  phones: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  addresses: z.array(AddressSchema).default([]),
  interactionFreqDays: z.number().int().positive().nullable().default(null),
  isFamilyMember: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  notes: z.string().default(""),
  preferences: z.record(z.string(), z.unknown()).default({}),
})

export const UpdateContactSchema = CreateContactSchema.partial()

export type Address = z.infer<typeof AddressSchema>
export type CreateContactInput = z.infer<typeof CreateContactSchema>
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>
