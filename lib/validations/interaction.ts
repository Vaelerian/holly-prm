import { z } from "zod"

export const InteractionTypeSchema = z.enum(["call", "meeting", "email", "message", "event"])
export const DirectionSchema = z.enum(["inbound", "outbound"])

export const CreateInteractionSchema = z.object({
  contactId: z.string().uuid(),
  type: InteractionTypeSchema,
  direction: DirectionSchema,
  summary: z.string().min(1, "Summary is required").max(2000),
  outcome: z.string().max(2000).nullable().default(null),
  followUpRequired: z.boolean().default(false),
  followUpDate: z.string().datetime().nullable().default(null),
  callbackExpected: z.boolean().default(false),
  location: z.string().max(200).nullable().default(null),
  duration: z.number().int().positive().nullable().default(null),
  occurredAt: z.string().datetime(),
})

export const UpdateInteractionSchema = CreateInteractionSchema.partial().extend({
  followUpCompleted: z.boolean().optional(),
})

export type CreateInteractionInput = z.infer<typeof CreateInteractionSchema>
export type UpdateInteractionInput = z.infer<typeof UpdateInteractionSchema>
