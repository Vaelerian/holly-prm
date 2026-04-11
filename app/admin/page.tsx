import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import { AdminPanel } from "@/components/admin/admin-panel"

export default async function AdminPage() {
  const session = await auth()
  // Unauthenticated: redirect to login. Authenticated non-admin: 404 (don't confirm page exists)
  if (!session) redirect("/login")
  if (session.role !== "admin") notFound()

  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } })

  return <AdminPanel users={users} />
}
