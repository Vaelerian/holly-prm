"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const tabs = [
  { href: "/", label: "Home", icon: "⊞" },
  { href: "/contacts", label: "Contacts", icon: "👤" },
  { href: "/log", label: "Log", icon: "+" },
  { href: "/projects", label: "Projects", icon: "📋" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/calendar", label: "Cal", icon: "▦" },
  { href: "/reports", label: "Reports", icon: "◈" },
]

export function BottomNav({ onLogPress }: { onLogPress: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#111125] border-t border-[rgba(0,255,136,0.15)] flex">
      {tabs.map(({ href, label, icon }) =>
        label === "Log" ? (
          <button
            key="log"
            onClick={onLogPress}
            className="flex-1 flex flex-col items-center py-2 text-[#00ff88]"
          >
            <span className="w-8 h-8 rounded-full bg-[#00ff88] text-[#0a0a1a] flex items-center justify-center text-lg font-bold mb-0.5">+</span>
            <span className="text-xs">Log</span>
          </button>
        ) : (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${pathname === href ? "text-[#00ff88]" : "text-[#666688]"}`}
          >
            <span className="text-lg mb-0.5">{icon}</span>
            {label}
          </Link>
        )
      )}
    </nav>
  )
}
