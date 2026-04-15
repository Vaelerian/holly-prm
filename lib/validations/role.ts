import { z } from "zod"

export const CreateRoleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().default(""),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex colour").default("#6366F1"),
  icon: z.string().default(""),
})

export const UpdateRoleSchema = CreateRoleSchema.partial()

export type CreateRoleInput = z.infer<typeof CreateRoleSchema>
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>
