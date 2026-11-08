import { env } from "cloudflare:workers";
import { encryptProviderKey } from "@/app/lib/provider-crypto";
import { providerUrl } from "@/app/lib/provider-url";
import { errorResponse, owner, readJson } from "../../common";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await owner(request);
    const body = await readJson(request);
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 100 || typeof body.baseUrl !== "string" || body.baseUrl.length > 2048 || typeof body.enabled !== "boolean" || (body.apiKey !== undefined && (typeof body.apiKey !== "string" || !body.apiKey || body.apiKey.length > 4096))) throw new Error("Invalid provider");
    const url = providerUrl(body.baseUrl, new URL(request.url).hostname);
    // Changing an endpoint must also replace its credential to avoid sending a
    // saved key to a new destination by accident.
    const current = await env.DB.prepare("SELECT base_url FROM providers WHERE id=? AND owner_id=?").bind(params.id, user).first<{ base_url: string }>();
    if (!current || (current.base_url !== url && !body.apiKey)) throw new Error("Provider or key missing");
    if (body.apiKey) {
      const key = await encryptProviderKey(env.PROVIDER_ENCRYPTION_KEY, `${params.id}\0${url}`, body.apiKey);
      await env.DB.prepare("UPDATE providers SET name=?, base_url=?, enabled=?, encrypted_key=?, updated_at=? WHERE id=? AND owner_id=?").bind(body.name.trim(), url, Number(body.enabled), key, Date.now(), params.id, user).run();
    } else {
      await env.DB.prepare("UPDATE providers SET name=?, enabled=?, updated_at=? WHERE id=? AND owner_id=?").bind(body.name.trim(), Number(body.enabled), Date.now(), params.id, user).run();
    }
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await owner(request);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM provider_models WHERE provider_id IN (SELECT id FROM providers WHERE id=? AND owner_id=?)").bind(params.id, user),
      env.DB.prepare("DELETE FROM providers WHERE id=? AND owner_id=?").bind(params.id, user),
    ]);
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
