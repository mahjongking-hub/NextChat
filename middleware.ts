import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "./app/lib/access-auth";

// Every API path is protected, including the legacy routes. Keep the legacy
// proxy endpoints disabled so they cannot bypass the provider restrictions.
export async function middleware(request: NextRequest) {
  try {
    const user = await requireAccess(request, {
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUDIENCE,
      ownerEmail: env.ACCESS_OWNER_EMAIL,
    });
    const minute = Math.floor(Date.now() / 60000);
    const limit = await env.DB.prepare("INSERT INTO rate_limits(owner_id, minute, requests) VALUES (?, ?, 1) ON CONFLICT(owner_id) DO UPDATE SET requests=CASE WHEN minute=excluded.minute THEN requests+1 ELSE 1 END, minute=excluded.minute RETURNING requests").bind(user, minute).first<{ requests: number }>();
    if (!limit || limit.requests > 120) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const path = request.nextUrl.pathname;
  // The app framework (vinext) invokes "use server" functions by POSTing to
  // the page path with a framework action header; without this allowance the
  // chat send path blocks forever. Legacy /api/* proxy routes stay disabled
  // regardless of headers.
  const isFrameworkActionPost =
    request.method === "POST" &&
    (request.headers.has("next-action") || request.headers.has("x-rsc-action"));
  if ((path.startsWith("/api/") && !path.startsWith("/api/personal/") && path !== "/api/config") ||
      (!path.startsWith("/api/personal/") && !isFrameworkActionPost && !["GET", "HEAD"].includes(request.method))) {
    return NextResponse.json({ error: "Endpoint disabled" }, { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/:path*" };
