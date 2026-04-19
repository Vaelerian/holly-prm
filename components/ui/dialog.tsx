"use client"

import { useEffect, useRef } from "react"

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="rounded-xl shadow-xl p-0 w-full max-w-lg bg-[#111125] border border-[rgba(0,255,136,0.15)] text-[#c0c0d0] backdrop:bg-black/60 open:flex open:flex-col"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,255,136,0.15)]">
        <h2 className="text-base font-semibold text-[#c0c0d0]">{title}</h2>
        <button onClick={onClose} className="text-[#666688] hover:text-[#c0c0d0] text-xl leading-none">&times;</button>
      </div>
      <div className="px-5 py-4 overflow-y-auto">{children}</div>
    </dialog>
  )
}
