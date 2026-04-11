import { createHash, randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"

function generateToken(): string {
  return randomBytes(32).toString("hex")
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function createResetToken(userId: string): Promise<string> {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } })
  await prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } })

  return token
}

export async function validateResetToken(token: string): Promise<{ id: string; email: string; name: string } | null> {
  const tokenHash = hashToken(token)
  const row = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  })
  if (!row) return null
  return row.user
}

export async function consumeResetToken(token: string, newPassword: string): Promise<boolean> {
  const tokenHash = hashToken(token)
  const row = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  })
  if (!row) return false

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
  ])

  return true
}
