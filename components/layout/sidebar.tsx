"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Plus, LogOut } from "lucide-react"
import { NAV_ITEMS } from "./nav-items"

interface SidebarProps {
  isAdmin?: boolean
  onLogPress?: () => void
}

export function Sidebar({ isAdmin, onLogPress }: SidebarProps = {}) {
  const pathname = usePathname()
  const visible = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin)

  return (
    <nav className="hidden md:flex flex-col w-44 min-h-screen bg-[#111125] border-r border-[rgba(0,255,136,0.15)] flex-shrink-0">
      <div className="px-4 py-5 font-bold text-lg border-b border-[rgba(0,255,136,0.15)] text-[#00ff88] tracking-wide">Holly</div>
      <div className="flex-1 py-2">
        {visible.map(({ href, label, Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                active
                  ? "text-[#00ff88] bg-[rgba(0,255,136,0.08)] border-l-2 border-[#00ff88]"
                  : "text-[#666688] hover:text-[#c0c0d0] hover:bg-[rgba(0,255,136,0.04)]"
              }`}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </div>
      {onLogPress && (
        <button
          onClick={onLogPress}
          className="mx-3 mb-2 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[#0a0a1a] bg-[#00ff88] hover:bg-[#00cc6f] rounded-lg transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          Log interaction
        </button>
      )}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex items-center gap-2 px-4 py-3 text-xs text-[#666688] hover:text-[#c0c0d0] text-left border-t border-[rgba(0,255,136,0.15)] transition-colors"
      >
        <LogOut size={14} strokeWidth={1.75} aria-hidden="true" />
        Sign out
      </button>
    </nav>
  )
}
