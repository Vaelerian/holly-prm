"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const tabs = [
  { href: "/", label: "Home", icon: "⊞" },
  { href: "/contacts", label: "Contacts", icon: "👤" },
  { href: "/log", label: "Log", icon: "+" },
  { href: "/projects", label: "Projects", icon: "📋" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
]

export function BottomNav({ onLogPress }: { onLogPress: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 flex">
      {tabs.map(({ href, label, icon }) =>
        label === "Log" ? (
          <button
            key="log"
            onClick={onLogPress}
            className="flex-1 flex flex-col items-center py-2 text-blue-400"
          >
            <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg mb-0.5">+</span>
            <span className="text-xs">Log</span>
          </button>
        ) : (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center py-2 text-xs ${pathname === href ? "text-blue-400" : "text-gray-400"}`}
          >
            <span className="text-lg mb-0.5">{icon}</span>
            {label}
          </Link>
        )
      )}
    </nav>
  )
}
