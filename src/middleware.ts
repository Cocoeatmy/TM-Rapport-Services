import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback-secret");

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Routes publiques
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/client/") ||
    pathname.startsWith("/api/share-link") || // protégé par sa propre clé (SHARE_LINK_KEY)
    pathname.startsWith("/api/reminders") ||
    pathname.startsWith("/api/notion-webhook") || // webhook Notion (pas de cookie auth)
    pathname.startsWith("/client/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/manifest.json" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)"],
};
