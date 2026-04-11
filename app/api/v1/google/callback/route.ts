import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { OAuth2Client } from "google-auth-library"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import { encrypt } from "@/lib/encryption"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.redirect(new URL("/login", req.url))

  const { searchParams } = req.nextUrl
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/settings?error=oauth_failed", req.url))
  }

  const stateKey = `google:oauth:state:${state}`
  const storedUserId = await redis.get(stateKey).catch(() => null)
  if (!storedUserId) {
    return NextResponse.redirect(new URL("/settings?error=oauth_failed", req.url))
  }
  await redis.del(stateKey).catch(() => {})

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const { tokens } = await client.getToken(code)
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    return NextResponse.redirect(new URL("/settings?error=oauth_failed", req.url))
  }

  // Get the email address from the id_token
  client.setCredentials(tokens)
  let email = "unknown"
  try {
    const tokenInfo = await client.getTokenInfo(tokens.access_token)
    email = tokenInfo.email ?? "unknown"
  } catch {
    // Non-fatal: token is still valid, email is cosmetic display only
  }

  const scopes = Array.isArray(tokens.scope) ? tokens.scope : (tokens.scope ?? "").split(" ")

  // Upsert - delete existing token for this user and recreate
  await prisma.googleToken.deleteMany({ where: { userId: storedUserId } })
  await prisma.googleToken.create({
    data: {
      email,
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      expiresAt: new Date(tokens.expiry_date),
      scopes,
      userId: storedUserId,
    },
  })

  return NextResponse.redirect(new URL("/settings?connected=google", req.url))
}
