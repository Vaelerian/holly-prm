import { AppShell } from "@/components/layout/app-shell"
import { auth } from "@/lib/auth"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return <AppShell isAdmin={session?.role === "admin"}>{children}</AppShell>
}
