"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/v1/projects/${projectId}`, { method: "DELETE" })
    if (res.ok) router.push("/projects")
    setDeleting(false)
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-sm text-red-400 hover:text-red-300">Delete</button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#c0c0d0]">Delete project and all tasks?</span>
      <button onClick={handleDelete} disabled={deleting} className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50">
        {deleting ? "Deleting..." : "Yes, delete"}
      </button>
      <button onClick={() => setConfirming(false)} className="text-xs text-[#666688] hover:text-[#c0c0d0]">Cancel</button>
    </div>
  )
}
