import { env } from "cloudflare:workers";
import { errorResponse, owner, readJson } from "../common";

export async function GET(request: Request) {
  try {
    const user = await owner(request);
    const rows = await env.DB.prepare("SELECT id, payload, deleted, revision, updated_at FROM conversations WHERE owner_id=? ORDER BY updated_at DESC").bind(user).all();
    return Response.json({ conversations: rows.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const user = await owner(request);
    const body = await readJson(request, 2_000_000);
    if (typeof body.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.id) || typeof body.payload !== "object" || body.payload === null || body.payload.id !== body.id || !Array.isArray(body.payload.messages) || !Number.isInteger(body.revision) || body.revision < 0) throw new Error("Invalid conversation");
    const payload = JSON.stringify(body.payload);
    let result;
    if (body.revision === 0) {
      result = await env.DB.prepare("INSERT INTO conversations(id,owner_id,payload,revision,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(id) DO NOTHING").bind(body.id, user, payload, Date.now()).run();
    } else {
      result = await env.DB.prepare("UPDATE conversations SET payload=?, revision=revision+1, updated_at=? WHERE id=? AND owner_id=? AND revision=? AND deleted=0").bind(payload, Date.now(), body.id, user, body.revision).run();
    }
    if (result.meta.changes !== 1) return Response.json({ error: "Conversation changed on another device" }, { status: 409 });
    return Response.json({ revision: body.revision + 1 });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await owner(request);
    const body = await readJson(request);
    if (typeof body.id !== "string" || !Number.isInteger(body.revision) || body.revision < 1) throw new Error("Invalid conversation");
    const result = await env.DB.prepare("UPDATE conversations SET payload='{}', deleted=1, revision=revision+1, updated_at=? WHERE id=? AND owner_id=? AND revision=? AND deleted=0").bind(Date.now(), body.id, user, body.revision).run();
    if (result.meta.changes !== 1) return Response.json({ error: "Conversation changed on another device" }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
