"use client"

import { Dialog } from "@/components/ui/dialog"
import { InteractionForm } from "./interaction-form"
import { useRouter } from "next/navigation"

interface LogInteractionModalProps {
  open: boolean
  onClose: () => void
  defaultContactId?: string
}

export function LogInteractionModal({ open, onClose, defaultContactId }: LogInteractionModalProps) {
  const router = useRouter()

  function handleSuccess() {
    onClose()
    router.refresh()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Log interaction">
      <InteractionForm onSuccess={handleSuccess} defaultContactId={defaultContactId} />
    </Dialog>
  )
}
