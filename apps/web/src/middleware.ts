import { NextResponse, type NextRequest } from "next/server";
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

  const response = await updateSession(request);
  // Previews and any other host stay out of search results.
  if (host.endsWith(".vercel.app")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
