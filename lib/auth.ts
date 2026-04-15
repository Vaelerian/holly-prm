import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"

const secret = process.env.AUTH_SECRET
if (!secret) throw new Error("AUTH_SECRET environment variable is not set")

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        // Admin check (env-var based, separate identity from User table)
        const adminEmail = process.env.ADMIN_EMAIL
        const adminHash = process.env.ADMIN_PASSWORD_HASH
        if (adminEmail && adminHash && email === adminEmail) {
          const valid = await bcrypt.compare(password, adminHash)
          if (!valid) return null
          // Ensure admin has a DB User record so they get a real userId in session
          const adminUser = await prisma.user.upsert({
            where: { email: adminEmail },
            create: { email: adminEmail, name: "Admin", status: "approved" },
            update: {},
          })
          void import("@/lib/services/roles").then(m => m.getOrCreateDefaultRole(adminUser.id)).catch(() => {})
          return { id: adminUser.id, email: adminEmail, name: "Admin", role: "admin" } as any
        }

        // Regular user (DB-based)
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || !user.passwordHash || user.status !== "approved") return null
        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null
        return { id: user.id, email: user.email, name: user.name, role: "user" } as any
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google" && profile?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: profile.email } })
        if (!dbUser) {
          // Create pending account -- must be approved before first access
          await prisma.user.create({
            data: {
              email: profile.email,
              name: profile.name ?? profile.email,
              status: "pending",
            },
          })
          return "/login?error=pending"
        }
        if (dbUser.status !== "approved") return "/login?error=pending"
        void import("@/lib/services/roles").then(m => m.getOrCreateDefaultRole(dbUser.id)).catch(() => {})
      }
      return true
    },
    async jwt({ token, user, account }) {
      // user is only present on initial sign-in
      if (user) {
        const role = (user as any).role as "user" | "admin" | undefined
        if (role === "admin") {
          token.role = "admin"
          token.userId = user.id
        } else {
          token.role = "user"
          if (account?.provider === "google" && token.email) {
            // Google OAuth: look up our DB user ID from email
            const dbUser = await prisma.user.findUnique({ where: { email: token.email } })
            if (dbUser) token.userId = dbUser.id
          } else {
            // Credentials: user.id is already our DB user ID
            token.userId = user.id
          }
        }
      }
      return token
    },
    async session({ session, token }) {
      session.role = (token.role as "user" | "admin") ?? "user"
      if (token.userId) session.userId = token.userId as string
      return session
    },
  },
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
})
