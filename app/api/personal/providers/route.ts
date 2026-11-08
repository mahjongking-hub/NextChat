import { env } from "cloudflare:workers";
import { encryptProviderKey } from "@/app/lib/provider-crypto";
import { providerUrl } from "@/app/lib/provider-url";
import { errorResponse, owner, readJson } from "../common";

export async function GET(request: Request) {
  try {
    const user = await owner(request);
    const result = await env.DB.prepare("SELECT id, name, base_url, enabled, updated_at FROM providers WHERE owner_id = ? ORDER BY name").bind(user).all();
    const models = await env.DB.prepare("SELECT m.provider_id, m.model_id, m.enabled FROM provider_models m JOIN providers p ON p.id=m.provider_id WHERE p.owner_id=? ORDER BY m.model_id").bind(user).all();
    return Response.json({ providers: result.results, models: models.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await owner(request);
    const body = await readJson(request);
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 100 || typeof body.baseUrl !== "string" || body.baseUrl.length > 2048 || typeof body.apiKey !== "string" || !body.apiKey || body.apiKey.length > 4096) throw new Error("Invalid provider");
    const url = providerUrl(body.baseUrl, new URL(request.url).hostname);
    const id = crypto.randomUUID();
    const key = await encryptProviderKey(env.PROVIDER_ENCRYPTION_KEY, `${id}\0${url}`, body.apiKey);
    const now = Date.now();
    await env.DB.prepare("INSERT INTO providers (id, owner_id, name, base_url, encrypted_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, user, body.name.trim(), url, key, now, now).run();
    return Response.json({ id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
