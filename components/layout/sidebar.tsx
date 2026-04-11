"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/calendar", label: "Calendar" },
  { href: "/reports", label: "Reports" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <nav className="hidden md:flex flex-col w-44 min-h-screen bg-[#111125] border-r border-[rgba(0,255,136,0.15)] flex-shrink-0">
      <div className="px-4 py-5 font-bold text-lg border-b border-[rgba(0,255,136,0.15)] text-[#00ff88] tracking-wide">Holly</div>
      <div className="flex-1 py-2">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block px-4 py-2.5 text-sm transition-colors ${
              pathname === href
                ? "text-[#00ff88] bg-[rgba(0,255,136,0.08)] border-l-2 border-[#00ff88]"
                : "text-[#666688] hover:text-[#c0c0d0] hover:bg-[rgba(0,255,136,0.04)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="px-4 py-3 text-xs text-[#666688] hover:text-[#c0c0d0] text-left border-t border-[rgba(0,255,136,0.15)] transition-colors"
      >
        Sign out
      </button>
    </nav>
  )
}
