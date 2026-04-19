"use client"

import Link from "next/link"
import { useEffect } from "react"
import { signOut } from "next-auth/react"
import { LogOut } from "lucide-react"
import { NAV_ITEMS, MOBILE_PRIMARY_HREFS } from "./nav-items"

interface MoreSheetProps {
  open: boolean
  onClose: () => void
  isAdmin?: boolean
}

export function MoreSheet({ open, onClose, isAdmin }: MoreSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const overflow = NAV_ITEMS.filter(item => {
    if (MOBILE_PRIMARY_HREFS.has(item.href)) return false
    if (item.adminOnly && !isAdmin) return false
    return true
  })

  return (
    <div
      className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="More"
        onClick={e => e.stopPropagation()}
        className="rounded-t-2xl bg-[#111125] border-t border-[rgba(0,255,136,0.15)] text-[#c0c0d0] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,255,136,0.15)]">
          <h2 className="text-base font-semibold text-[#c0c0d0]">More</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#666688] hover:text-[#c0c0d0] text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="py-2">
          {overflow.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center gap-3 px-5 py-3 text-sm text-[#c0c0d0] hover:bg-[rgba(0,255,136,0.04)] active:bg-[rgba(0,255,136,0.08)]"
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </Link>
          ))}
          <button
            onClick={() => { onClose(); signOut({ callbackUrl: "/login" }) }}
            className="w-full flex items-center gap-3 px-5 py-3 text-sm text-[#ff4444] hover:bg-[rgba(255,68,68,0.06)] active:bg-[rgba(255,68,68,0.12)] border-t border-[rgba(0,255,136,0.15)] mt-2"
          >
            <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
