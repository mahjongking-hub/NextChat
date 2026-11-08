import { env } from "cloudflare:workers";
import { decryptProviderKey } from "@/app/lib/provider-crypto";
import { isRedirect, providerEndpoint, providerUrl } from "@/app/lib/provider-url";
import { errorResponse, owner, readJson } from "../../../common";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await owner(request);
    const row = await env.DB.prepare("SELECT base_url, encrypted_key FROM providers WHERE id=? AND owner_id=? AND enabled=1").bind(params.id, user).first<{ base_url: string; encrypted_key: string }>();
    if (!row) throw new Error("Provider not found");
    const base = providerUrl(row.base_url, new URL(request.url).hostname);
    const key = await decryptProviderKey(env.PROVIDER_ENCRYPTION_KEY, `${params.id}\0${base}`, row.encrypted_key);
    // workerd rejects redirect: "error", so use "manual" and reject redirects explicitly.
    const response = await fetch(providerEndpoint(base, "models"), { headers: { Authorization: `Bearer ${key}` }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    if (isRedirect(response)) throw new Error("Provider redirects are not allowed");
    if (!response.ok) return Response.json({ error: `Provider returned HTTP ${response.status}` }, { status: 502 });
    const data = await readJson(new Request("https://local.invalid/", { method: "POST", body: response.body, duplex: "half" } as RequestInit), 2_000_000);
    if (!Array.isArray(data.data)) throw new Error("Unexpected model list");
    const models = [...new Set<string>(data.data.map((item: any) => item?.id).filter((id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 256))].slice(0, 5000);
    return Response.json({ models }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await owner(request);
    const body = await readJson(request, 1_000_000);
    if (!Array.isArray(body.models) || body.models.length > 500 || body.models.some((m: unknown) => typeof m !== "string" || !m || m.length > 256)) throw new Error("Invalid models");
    const row = await env.DB.prepare("SELECT id FROM providers WHERE id=? AND owner_id=?").bind(params.id, user).first();
    if (!row) throw new Error("Provider not found");
    const models = [...new Set<string>(body.models)];
    await env.DB.batch([
      env.DB.prepare("DELETE FROM provider_models WHERE provider_id=?").bind(params.id),
      ...models.map((model) => env.DB.prepare("INSERT INTO provider_models (provider_id, model_id) VALUES (?, ?)").bind(params.id, model)),
    ]);
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
