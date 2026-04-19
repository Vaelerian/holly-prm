"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus, MoreHorizontal } from "lucide-react"
import { NAV_ITEMS, MOBILE_PRIMARY_HREFS } from "./nav-items"

interface BottomNavProps {
  onLogPress: () => void
  onMorePress: () => void
  isAdmin?: boolean
}

export function BottomNav({ onLogPress, onMorePress, isAdmin }: BottomNavProps) {
  const pathname = usePathname()
  const primary = NAV_ITEMS.filter(item => MOBILE_PRIMARY_HREFS.has(item.href))
  // First two primary items go on the left of the log button, the rest on the
  // right. With four primary items this is a balanced 2-1-2 layout.
  const left = primary.slice(0, 2)
  const right = primary.slice(2)

  // Whether "More" should be highlighted as the active tab. True when the
  // current route is a nav destination that isn't in the primary set.
  const moreActive = NAV_ITEMS.some(item => item.href === pathname && !MOBILE_PRIMARY_HREFS.has(item.href) && (!item.adminOnly || isAdmin))

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#111125] border-t border-[rgba(0,255,136,0.15)] flex pb-[env(safe-area-inset-bottom)]">
      {left.map(({ href, shortLabel, label, Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center py-2 text-[11px] transition-colors ${active ? "text-[#00ff88]" : "text-[#666688]"}`}
          >
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="mt-0.5">{shortLabel ?? label}</span>
          </Link>
        )
      })}
      <button
        onClick={onLogPress}
        aria-label="Log interaction"
        className="flex-1 flex flex-col items-center py-2 text-[#00ff88]"
      >
        <span className="w-8 h-8 rounded-full bg-[#00ff88] text-[#0a0a1a] flex items-center justify-center mb-0.5">
          <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
        </span>
        <span className="text-[11px]">Log</span>
      </button>
      {right.map(({ href, shortLabel, label, Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center py-2 text-[11px] transition-colors ${active ? "text-[#00ff88]" : "text-[#666688]"}`}
          >
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="mt-0.5">{shortLabel ?? label}</span>
          </Link>
        )
      })}
      <button
        onClick={onMorePress}
        aria-label="More"
        className={`flex-1 flex flex-col items-center py-2 text-[11px] transition-colors ${moreActive ? "text-[#00ff88]" : "text-[#666688]"}`}
      >
        <MoreHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
        <span className="mt-0.5">More</span>
      </button>
    </nav>
  )
}
