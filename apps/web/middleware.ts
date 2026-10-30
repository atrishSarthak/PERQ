import { NextResponse, type NextRequest } from "next/server";

// CORS for the API routes the mobile app calls (handoff §0.8). Native fetch
// in Expo Go ignores CORS; only the Expo *web* preview needs this. `*` is
// safe because these requests authenticate with a Bearer token, and browsers
// never attach cookies to a wildcard-origin request.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: [
    "/api/health",
    "/api/mobile/:path*",
    "/api/cards",
    "/api/recommender/:path*",
    "/api/arsenal/:path*",
    "/api/ember/:path*",
  ],
};
