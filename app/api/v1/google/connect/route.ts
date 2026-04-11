import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { OAuth2Client } from "google-auth-library"
import { redis } from "@/lib/redis"
import { randomUUID } from "crypto"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.redirect(new URL("/login", req.url))
  const userId = session?.userId
  if (!userId) return NextResponse.redirect(new URL("/login", req.url))

  const state = randomUUID()
  await redis.set(`google:oauth:state:${state}`, userId, "EX", 600)

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar",
      "email",
    ],
    state,
  })

  return NextResponse.redirect(url)
}
