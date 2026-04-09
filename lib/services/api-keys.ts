import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { customAlphabet } from "nanoid"

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 32)

export async function generateApiKey(name: string) {
  const plaintext = `hky_${nanoid()}`
  const keyHash = await bcrypt.hash(plaintext, 12)
  await prisma.hollyApiKey.create({ data: { name, keyHash } })
  return plaintext // returned once, never stored in plaintext
}

export async function listApiKeys() {
  return prisma.hollyApiKey.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, lastUsed: true, createdAt: true } })
}

export async function deleteApiKey(id: string) {
  return prisma.hollyApiKey.delete({ where: { id } })
}
