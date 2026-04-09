import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const adminEmail = process.env.ADMIN_EMAIL
        const adminHash = process.env.ADMIN_PASSWORD_HASH
        if (!adminEmail || !adminHash) return null
        if (credentials.email !== adminEmail) return null
        const valid = await bcrypt.compare(credentials.password as string, adminHash)
        if (!valid) return null
        return { id: "ian", email: adminEmail, name: "Ian" }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
})
