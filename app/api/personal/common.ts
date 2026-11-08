import { env } from "cloudflare:workers";
import { requireAccess } from "@/app/lib/access-auth";

export async function owner(request: Request): Promise<string> {
  return requireAccess(request, {
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    audience: env.ACCESS_AUDIENCE,
    ownerEmail: env.ACCESS_OWNER_EMAIL,
  });
}

// Validation and provider-flow messages that are safe to show to the owner.
// Unknown messages stay generic to avoid leaking internals; only the error
// category is exposed for those.
const SAFE_ERROR_MESSAGES = new Set([
  "Enter a valid HTTPS URL",
  "Provider URL must use HTTPS without credentials, query, fragment or custom port",
  "Provider must be a public hostname",
  "Provider redirects are not allowed",
  "Provider not found",
  "Model unavailable",
  "Invalid request",
  "Invalid models",
  "Invalid provider",
  "Invalid encrypted key",
  "Invalid encryption key",
  "Unexpected model list",
  "Request too large",
  "Missing request body",
]);

export function errorResponse(error: unknown): Response {
  const name = error instanceof Error ? error.name : "unknown";
  const message = error instanceof Error ? error.message : "";
  const safe = SAFE_ERROR_MESSAGES.has(message);
  console.error("[personal API] request failed", name, safe ? message : "(unclassified)");
  const body: Record<string, string> = { error: safe ? message : "Request failed", category: name };
  if (!safe && (name === "TimeoutError" || name === "AbortError")) body.error = "Provider request timed out";
  return Response.json(body, { status: 400, headers: { "Cache-Control": "no-store" } });
}

export async function readJson(request: Request, limit = 32768): Promise<any> {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > limit) throw new Error("Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body");
  let total = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new Error("Request too large"); }
    parts.push(value);
  }
  const data = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) { data.set(part, pos); pos += part.byteLength; }
  return JSON.parse(new TextDecoder().decode(data));
}
