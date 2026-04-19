"use client"

import { useEffect } from "react"

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 md:left-44 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl shadow-xl bg-[#111125] border border-[rgba(0,255,136,0.15)] text-[#c0c0d0]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,255,136,0.15)]">
          <h2 className="text-base font-semibold text-[#c0c0d0]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-[#666688] hover:text-[#c0c0d0] text-xl leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
