import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { ProfileForm } from "@/components/profile/profile-form"

export default async function ProfilePage() {
  const session = await auth()
  const userId = session?.userId
  if (!userId) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, passwordHash: true },
  })
  if (!user) redirect("/login")

  return (
    <div className="p-6 space-y-6 max-w-lg">
      <h1 className="text-xl font-semibold text-[#c0c0d0]">Profile</h1>
      <ProfileForm
        initialName={user.name}
        initialEmail={user.email}
        hasPassword={user.passwordHash !== null}
      />
    </div>
  )
}
