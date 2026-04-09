"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/settings", label: "Settings" },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <nav className="hidden md:flex flex-col w-44 min-h-screen bg-gray-900 text-white flex-shrink-0">
      <div className="px-4 py-5 font-bold text-lg border-b border-gray-700">Holly</div>
      <div className="flex-1 py-2">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block px-4 py-2.5 text-sm ${pathname === href ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <button onClick={() => signOut({ callbackUrl: "/login" })} className="px-4 py-3 text-xs text-gray-500 hover:text-gray-300 text-left border-t border-gray-700">
        Sign out
      </button>
    </nav>
  )
}
