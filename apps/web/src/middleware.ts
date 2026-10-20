import { NextResponse, type NextRequest } from "next/server";
import { adminHostFor, isAdminHost } from "@/features/admin/portal-url";
import {
  cleanSignupRef,
  SIGNUP_REF_COOKIE,
  SIGNUP_REF_MAX_AGE,
} from "@/features/public/lib/signup-ref";
import { SITE_HOST } from "@/lib/site";
import { updateSession } from "./lib/supabase/middleware";

/** The production deployment's Vercel host: one site for search engines. */
const VERCEL_PRODUCTION_HOST = "octonote-ai.vercel.app";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";

  // The old production URL redirects for good (fragments, e.g. the mobile
  // app's /embed/enter#at=…, survive a redirect in browsers and WebViews).
  if (host === VERCEL_PRODUCTION_HOST) {
    const url = request.nextUrl.clone();
    url.protocol = "https";
    url.host = SITE_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const path = request.nextUrl.pathname;
  const isPortalPath =
    path === "/admin" || path.startsWith("/admin/") || path === "/admin-enter";

  // admin.octonote.ai serves the admin portal and nothing else.
  if (isAdminHost(host) && !isPortalPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // On the main site, /admin opens the portal on its own address (signing in there via the handoff).
  if (
    !isAdminHost(host) &&
    adminHostFor(host) !== host &&
    (path === "/admin" || path.startsWith("/admin/"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/workspace/admin-open";
    url.search = `?to=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  const response = await updateSession(request);
  // Remember where a sign-up came from (e.g. the end of a published page).
  if (path === "/signup" || path === "/login") {
    const ref = cleanSignupRef(
      request.nextUrl.searchParams.get("ref"),
      request.nextUrl.searchParams.get("from"),
    );
    if (ref) {
      response.cookies.set(SIGNUP_REF_COOKIE, ref, {
        maxAge: SIGNUP_REF_MAX_AGE,
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
      });
    }
  }
  if (isAdminHost(host))
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  // Previews and any other host stay out of search results.
  if (host.endsWith(".vercel.app")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|ingest|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
