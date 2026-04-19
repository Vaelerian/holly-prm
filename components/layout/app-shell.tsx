"use client"

import { useState } from "react"
import { Sidebar } from "./sidebar"
import { BottomNav } from "./bottom-nav"
import { LogInteractionModal } from "@/components/interactions/log-interaction-modal"

export function AppShell({ children, isAdmin }: { children: React.ReactNode; isAdmin?: boolean }) {
  const [logOpen, setLogOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-[#0a0a1a]">
      <Sidebar isAdmin={isAdmin} onLogPress={() => setLogOpen(true)} />
      <main className="flex-1 pb-20 md:pb-0 overflow-y-auto">
        {children}
      </main>
      <BottomNav onLogPress={() => setLogOpen(true)} />
      <LogInteractionModal open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  )
}
