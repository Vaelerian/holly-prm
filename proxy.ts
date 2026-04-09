import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function proxy(req: NextRequest) {
  const isHollyRoute = req.nextUrl.pathname.startsWith("/api/holly")
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth")
  const isLoginPage = req.nextUrl.pathname === "/login"

  if (isHollyRoute || isAuthRoute || isLoginPage) return NextResponse.next()

  return auth((authReq) => {
    if (!authReq.auth) return NextResponse.redirect(new URL("/login", authReq.url))
    return NextResponse.next()
  })(req, {} as never)
}

export const proxyConfig = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)"],
}
