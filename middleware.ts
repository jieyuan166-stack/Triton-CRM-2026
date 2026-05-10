import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth"];
const CANONICAL_HOST = "crm.tritonwealth.ca";
const LEGACY_NAS_HOSTS = new Set([
  "192.168.50.158",
  "192.168.50.158:3000",
  "192.168.50.158:3001",
]);

function hasAuthCookie(request: NextRequest) {
  return (
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token") ||
    request.cookies.has("next-auth.session-token") ||
    request.cookies.has("__Secure-next-auth.session-token")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  if (
    LEGACY_NAS_HOSTS.has(host) &&
    pathname !== "/api/health" &&
    pathname !== "/api/ready"
  ) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(url, 308);
  }

  if (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const protectedPage =
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/policies") ||
    pathname.startsWith("/settings");

  const protectedApi =
    pathname.startsWith("/api/clients") ||
    pathname.startsWith("/api/send-email") ||
    pathname.startsWith("/api/email") ||
    pathname.startsWith("/api/settings") ||
    pathname.startsWith("/api/account");

  if ((protectedPage || protectedApi) && !hasAuthCookie(request)) {
    if (protectedApi) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
