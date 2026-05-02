"use client"

import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CreateContactSchema, type CreateContactInput } from "@/lib/validations/contact"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useState } from "react"

interface ContactFormProps {
  defaultValues?: Partial<CreateContactInput>
  contactId?: string
}

export function ContactForm({ defaultValues, contactId }: ContactFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const { register, handleSubmit, control, formState: { errors } } = useForm<z.input<typeof CreateContactSchema>, unknown, CreateContactInput>({
    resolver: zodResolver(CreateContactSchema),
    defaultValues: {
      name: "",
      type: "personal",
      emails: [],
      phones: [],
      interactionFreqDays: null,
      isFamilyMember: false,
      tags: [],
      notes: "",
      preferences: {},
      ...defaultValues,
    },
  })

  const emails = useFieldArray({ control, name: "emails" })
  const phones = useFieldArray({ control, name: "phones" })

  async function onSubmit(data: CreateContactInput) {
    setSaving(true)
    setError("")
    const url = contactId ? `/api/v1/contacts/${contactId}` : "/api/v1/contacts"
    const method = contactId ? "PUT" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const contact = await res.json()
      router.push(`/contacts/${contact.id}`)
      router.refresh()
    } else {
      const body = await res.json()
      setError(body.error ?? "Something went wrong")
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-lg">
      <Input label="Name *" error={errors.name?.message} {...register("name")} />

      <div className="space-y-1">
        <label className="block text-sm font-medium text-[#c0c0d0]">Relationship type</label>
        <select {...register("type")} className="block w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0]">
          <option value="personal">Personal</option>
          <option value="work">Work</option>
          <option value="family">Family</option>
          <option value="volunteer">Volunteer</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[#c0c0d0]">Email addresses</label>
        {emails.fields.length === 0 && (
          <p className="text-xs text-[#666688]">No emails. Click Add to include one.</p>
        )}
        {emails.fields.map((field, index) => (
          <div key={field.id} className="flex gap-2 items-start">
            <input
              {...register(`emails.${index}.label` as const)}
              placeholder="Label (e.g. work)"
              className="w-32 border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0]"
            />
            <div className="flex-1">
              <input
                {...register(`emails.${index}.value` as const)}
                type="email"
                placeholder="name@example.com"
                className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0]"
              />
              {errors.emails?.[index]?.value?.message && (
                <p className="text-xs text-red-400 mt-1">{errors.emails[index]?.value?.message}</p>
              )}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => emails.remove(index)}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => emails.append({ label: "", value: "" })}>+ Add email</Button>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[#c0c0d0]">Phone numbers</label>
        {phones.fields.length === 0 && (
          <p className="text-xs text-[#666688]">No phone numbers. Click Add to include one.</p>
        )}
        {phones.fields.map((field, index) => (
          <div key={field.id} className="flex gap-2 items-start">
            <input
              {...register(`phones.${index}.label` as const)}
              placeholder="Label (e.g. mobile)"
              className="w-32 border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0]"
            />
            <input
              {...register(`phones.${index}.value` as const)}
              type="tel"
              placeholder="+44 7700 900000"
              className="flex-1 border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0]"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => phones.remove(index)}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => phones.append({ label: "", value: "" })}>+ Add phone</Button>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-[#c0c0d0]">Contact frequency (days)</label>
        <input type="number" {...register("interactionFreqDays", { setValueAs: v => v === "" ? null : Number(v) })} placeholder="e.g. 30 - leave blank for no alert" className="block w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0]" />
        <p className="text-xs text-[#666688]">Set how often to prompt a catch-up. Leave blank to disable alerts.</p>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" {...register("isFamilyMember")} id="family" className="rounded border-[rgba(0,255,136,0.2)]" />
        <label htmlFor="family" className="text-sm text-[#c0c0d0]">Family member</label>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-[#c0c0d0]">Notes</label>
        <textarea {...register("notes")} rows={4} placeholder="Personal context, preferences, notes..." className="block w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0]" />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : contactId ? "Save changes" : "Create contact"}</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  )
}
