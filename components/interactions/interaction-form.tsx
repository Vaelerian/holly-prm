"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CreateInteractionSchema, type CreateInteractionInput } from "@/lib/validations/interaction"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"

interface Contact { id: string; name: string }

interface InteractionFormProps {
  onSuccess: () => void
  defaultContactId?: string
}

const inputClass = "block w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded-lg px-3 py-2 text-sm text-[#c0c0d0] placeholder:text-[#444466] focus:outline-none focus:ring-2 focus:ring-[#00ff88]"
const selectClass = inputClass
const labelClass = "block text-sm font-medium text-[#c0c0d0]"

export function InteractionForm({ onSuccess, defaultContactId }: InteractionFormProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof CreateInteractionSchema>, unknown, CreateInteractionInput>({
    resolver: zodResolver(CreateInteractionSchema),
    defaultValues: {
      contactId: defaultContactId ?? "",
      type: "call",
      direction: "outbound",
      summary: "",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      occurredAt: new Date().toISOString(),
    },
  })

  useEffect(() => {
    fetch("/api/v1/contacts").then(r => r.json()).then(setContacts)
  }, [])

  async function onSubmit(data: CreateInteractionInput) {
    setSaving(true)
    setError("")
    const res = await fetch("/api/v1/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      onSuccess()
    } else {
      const body = await res.json()
      setError(body.error ?? "Something went wrong")
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <label className={labelClass}>Contact</label>
        <select {...register("contactId")} className={selectClass}>
          <option value="">Select a contact...</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {errors.contactId && <p className="text-[#ff4444] text-xs">{errors.contactId.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={labelClass}>Type</label>
          <select {...register("type")} className={selectClass}>
            <option value="call">Call</option>
            <option value="meeting">Meeting</option>
            <option value="email">Email</option>
            <option value="message">Message</option>
            <option value="event">Event</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Direction</label>
          <select {...register("direction")} className={selectClass}>
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className={labelClass}>Summary *</label>
        <textarea {...register("summary")} rows={3} placeholder="What was discussed?" className={inputClass} />
        {errors.summary && <p className="text-[#ff4444] text-xs">{errors.summary.message}</p>}
      </div>

      <div className="space-y-1">
        <label className={labelClass}>Location</label>
        <input {...register("location")} placeholder="e.g. walking football, work meeting" className={inputClass} />
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" {...register("followUpRequired")} id="followUpRequired" className="rounded border-[rgba(0,255,136,0.15)] accent-[#00ff88]" />
        <label htmlFor="followUpRequired" className="text-sm text-[#c0c0d0]">Follow-up required</label>
      </div>

      {error && <p className="text-[#ff4444] text-sm">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Log interaction"}</Button>
      </div>
    </form>
  )
}
