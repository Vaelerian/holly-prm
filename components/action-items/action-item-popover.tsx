"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface ActionItemDetail {
  id: string
  title: string
  status: "todo" | "done" | "cancelled"
  priority: "low" | "medium" | "high" | "critical"
  assignedTo: "ian" | "holly"
  dueDate: string | null
  interactionId: string | null
  interaction?: {
    id: string
    contactId: string
    contact: { id: string; name: string } | null
  } | null
  taskId: string | null
  task?: {
    id: string
    title: string
    projectId: string | null
  } | null
}

interface ActionItemPopoverProps {
  actionId: string
  open: boolean
  onClose: () => void
  /** Optional initial title shown while details load. */
  initialTitle?: string
}

const PRIORITY_COLOUR: Record<string, string> = {
  low: "text-[#666688]",
  medium: "text-[#c0c0d0]",
  high: "text-amber-300",
  critical: "text-red-400",
}

const STATUS_COLOUR: Record<string, string> = {
  todo: "text-[#3b82f6]",
  done: "text-[#00ff88]",
  cancelled: "text-[#666688]",
}

export function ActionItemPopover({ actionId, open, onClose, initialTitle }: ActionItemPopoverProps) {
  const router = useRouter()
  const [item, setItem] = useState<ActionItemDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [updating, setUpdating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/v1/action-items/${actionId}`)
      if (!res.ok) throw new Error(`Failed to load (${res.status})`)
      setItem(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [actionId])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  async function setStatus(status: "done" | "todo" | "cancelled") {
    setUpdating(true)
    setError("")
    try {
      const res = await fetch(`/api/v1/action-items/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error(`Update failed (${res.status})`)
      const updated = await res.json()
      setItem(prev => (prev ? { ...prev, ...updated } : updated))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed")
    } finally {
      setUpdating(false)
    }
  }

  if (!open) return null

  const title = item?.title ?? initialTitle ?? "Action item"
  const parentLink =
    item?.interaction && item.interaction.contact
      ? { href: `/contacts/${item.interaction.contactId}`, label: `Interaction with ${item.interaction.contact.name}` }
      : item?.task
        ? {
            href: item.task.projectId ? `/projects/${item.task.projectId}` : `/tasks/${item.task.id}/edit`,
            label: `Task: ${item.task.title}`,
          }
        : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[rgba(0,0,0,0.55)] flex items-center justify-center p-4"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-[#111125] border border-[rgba(0,255,136,0.25)] rounded-lg shadow-xl max-w-md w-full px-5 py-4 space-y-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-[#666688]">Action item</p>
            <h3 className={`text-lg font-semibold text-[#c0c0d0] mt-0.5 ${item?.status === "done" ? "line-through" : ""}`}>
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#666688] hover:text-[#c0c0d0] text-xl leading-none px-1"
          >
            ×
          </button>
        </div>

        {loading && <p className="text-xs text-[#666688]">Loading...</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}

        {item && (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-[#666688]">Status</p>
                <p className={`font-medium ${STATUS_COLOUR[item.status] ?? "text-[#c0c0d0]"}`}>{item.status}</p>
              </div>
              <div>
                <p className="text-[#666688]">Priority</p>
                <p className={`font-medium ${PRIORITY_COLOUR[item.priority] ?? "text-[#c0c0d0]"}`}>{item.priority}</p>
              </div>
              <div>
                <p className="text-[#666688]">Assigned to</p>
                <p className="text-[#c0c0d0] capitalize">{item.assignedTo}</p>
              </div>
              <div>
                <p className="text-[#666688]">Due</p>
                <p className="text-[#c0c0d0]">
                  {item.dueDate ? new Date(item.dueDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "no date"}
                </p>
              </div>
            </div>

            {parentLink && (
              <Link
                href={parentLink.href}
                onClick={onClose}
                className="block text-xs text-[#00ff88] hover:text-[#00cc6f] truncate"
              >
                {parentLink.label} &rarr;
              </Link>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-[rgba(0,255,136,0.08)]">
              {item.status !== "done" ? (
                <button
                  onClick={() => setStatus("done")}
                  disabled={updating}
                  className="px-3 py-1.5 text-xs rounded bg-[rgba(0,255,136,0.15)] text-[#00ff88] border border-[rgba(0,255,136,0.3)] hover:bg-[rgba(0,255,136,0.25)] disabled:opacity-50"
                >
                  {updating ? "..." : "Mark done"}
                </button>
              ) : (
                <button
                  onClick={() => setStatus("todo")}
                  disabled={updating}
                  className="px-3 py-1.5 text-xs rounded text-[#c0c0d0] border border-[rgba(255,255,255,0.15)] hover:border-[rgba(0,255,136,0.3)] disabled:opacity-50"
                >
                  Reopen
                </button>
              )}
              {item.status !== "cancelled" && (
                <button
                  onClick={() => setStatus("cancelled")}
                  disabled={updating}
                  className="px-3 py-1.5 text-xs rounded text-[#666688] hover:text-red-400 disabled:opacity-50"
                >
                  Cancel item
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
