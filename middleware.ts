import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isHollyRoute = req.nextUrl.pathname.startsWith("/api/holly")
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth")
  const isLoginPage = req.nextUrl.pathname === "/login"

  if (isHollyRoute || isAuthRoute || isLoginPage) return NextResponse.next()
  if (!req.auth) return NextResponse.redirect(new URL("/login", req.url))
  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)"],
}
