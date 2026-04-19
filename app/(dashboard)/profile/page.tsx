import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { ProfileForm } from "@/components/profile/profile-form"
import { getVaultConfig, isCouchDbAccessible } from "@/lib/services/vault"

export default async function ProfilePage() {
  const session = await auth()
  const userId = session?.userId
  if (!userId) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, passwordHash: true },
  })
  if (!user) redirect("/login")

  // Vault status is non-critical - don't let failures break the profile page
  let vaultStatus = { configured: false, accessible: false, lastSyncAt: null as string | null }
  try {
    const vaultConfig = await getVaultConfig(userId)
    if (vaultConfig) {
      let accessible = false
      try {
        accessible = await isCouchDbAccessible(userId)
      } catch {
        accessible = false
      }
      vaultStatus = {
        configured: true,
        accessible,
        lastSyncAt: vaultConfig.lastSyncAt ? vaultConfig.lastSyncAt.toISOString() : null,
      }
    }
  } catch (e) {
    console.error("[profile] vault status lookup failed", e)
  }

  return (
    <div className="p-6 space-y-6 max-w-lg">
      <h1 className="text-xl font-semibold text-[#c0c0d0]">Profile</h1>
      <ProfileForm
        initialName={user.name}
        initialEmail={user.email}
        hasPassword={user.passwordHash !== null}
        vaultStatus={vaultStatus}
      />
    </div>
  )
}
