import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { AdminPanel } from "@/components/admin/admin-panel"

export default async function AdminPage() {
  const session = await auth()
  if (session?.role !== "admin") redirect("/login")

  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } })
  const approvedUsers = users.filter(u => u.status === "approved")

  return <AdminPanel users={users} approvedUsers={approvedUsers} />
}
