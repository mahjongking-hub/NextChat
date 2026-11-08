import { env } from "cloudflare:workers";
import { decryptProviderKey } from "@/app/lib/provider-crypto";
import { isRedirect, providerEndpoint, providerUrl } from "@/app/lib/provider-url";
import { errorResponse, owner, readJson } from "../common";

export async function POST(request: Request) {
  try {
    const user = await owner(request);
    const body = await readJson(request, 1_000_000);
    if (typeof body.providerId !== "string" || typeof body.model !== "string" || !Array.isArray(body.messages) || body.messages.length > 500) throw new Error("Invalid request");
    const row = await env.DB.prepare("SELECT p.base_url, p.encrypted_key FROM providers p JOIN provider_models m ON m.provider_id=p.id WHERE p.id=? AND p.owner_id=? AND p.enabled=1 AND m.model_id=? AND m.enabled=1").bind(body.providerId, user, body.model).first<{base_url: string; encrypted_key: string}>();
    if (!row) throw new Error("Model unavailable");
    const base = providerUrl(row.base_url, new URL(request.url).hostname);
    const key = await decryptProviderKey(env.PROVIDER_ENCRYPTION_KEY, `${body.providerId}\0${base}`, row.encrypted_key);
    const payload: Record<string, unknown> = { model: body.model, messages: body.messages, stream: true };
    for (const field of ["temperature", "top_p", "max_tokens", "presence_penalty", "frequency_penalty"]) {
      if (typeof body[field] === "number" && Number.isFinite(body[field])) payload[field] = body[field];
    }
    // workerd rejects redirect: "error", so use "manual" and reject redirects explicitly.
    const response = await fetch(providerEndpoint(base, "chat/completions"), {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(120000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (isRedirect(response)) throw new Error("Provider redirects are not allowed");
    if (!response.ok) return Response.json({ error: `Provider returned HTTP ${response.status}` }, { status: 502 });
    return new Response(response.body, { status: 200, headers: { "Content-Type": response.headers.get("content-type") || "text/event-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
