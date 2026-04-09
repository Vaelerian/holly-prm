"use client"

import { useState } from "react"
import { Sidebar } from "./sidebar"
import { BottomNav } from "./bottom-nav"
import { LogInteractionModal } from "@/components/interactions/log-interaction-modal"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [logOpen, setLogOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 pb-20 md:pb-0 overflow-y-auto">
        {children}
      </main>
      <BottomNav onLogPress={() => setLogOpen(true)} />
      <LogInteractionModal open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  )
}
