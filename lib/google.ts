import { OAuth2Client } from "google-auth-library"
import { prisma } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/encryption"

export class GoogleNotConnectedError extends Error {
  constructor() {
    super("Google account not connected")
    this.name = "GoogleNotConnectedError"
  }
}

export async function getGoogleClient(): Promise<OAuth2Client> {
  const token = await prisma.googleToken.findFirst()
  if (!token) throw new GoogleNotConnectedError()

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  client.setCredentials({
    access_token: decrypt(token.accessToken),
    refresh_token: decrypt(token.refreshToken),
    expiry_date: token.expiresAt.getTime(),
  })

  // Refresh if within 5 minutes of expiry
  const fiveMinutes = 5 * 60 * 1000
  if (token.expiresAt.getTime() - Date.now() < fiveMinutes) {
    const { credentials } = await client.refreshAccessToken()
    if (credentials.access_token && credentials.expiry_date) {
      await prisma.googleToken.update({
        where: { id: token.id },
        data: {
          accessToken: encrypt(credentials.access_token),
          expiresAt: new Date(credentials.expiry_date),
        },
      })
      client.setCredentials(credentials)
    }
  }

  return client
}

export async function isGoogleConnected(): Promise<boolean> {
  const token = await prisma.googleToken.findFirst({ select: { id: true, email: true } })
  return token !== null
}

export async function getConnectedEmail(): Promise<string | null> {
  const token = await prisma.googleToken.findFirst({ select: { email: true } })
  return token?.email ?? null
}
