/**
 * Roughly where this visitor is, for the details attached to a bug report.
 * Vercel works it out from the connection; we never see or keep the IP address
 * here. Empty when running anywhere else.
 */
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function read(request: NextRequest, header: string) {
  const value = request.headers.get(header);
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function GET(request: NextRequest) {
  return NextResponse.json(
    {
      city: read(request, "x-vercel-ip-city"),
      region: read(request, "x-vercel-ip-country-region"),
      country: read(request, "x-vercel-ip-country"),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
