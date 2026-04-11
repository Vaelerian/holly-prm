import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    userId?: string
    role: "user" | "admin"
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string
    role?: "user" | "admin"
  }
}
