import { nanoid } from "nanoid";
import type { ChatSession } from "../store/chat";

export type Marker = { revision: number; hash: string; deleted?: boolean };
export type Remote = { id: string; payload: string; revision: number; deleted: number };

export async function chatHash(value: string): Promise<string> {
  const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(data), (n) => n.toString(16).padStart(2, "0")).join("");
}

export async function reconcileChats(snapshot: ChatSession[], markers: Record<string, Marker>, remote: Remote[]) {
  const sessions = [...snapshot];
  const nextMarkers = { ...markers };
  let conflicts = 0;
  for (const row of remote) {
    const index = sessions.findIndex((s) => s.id === row.id);
    const local = index >= 0 ? sessions[index] : undefined;
    const marker = markers[row.id];
    const localHash = local ? await chatHash(JSON.stringify(local)) : "";
    const remoteHash = row.deleted ? "" : await chatHash(row.payload);
    const localChanged = !!local && (!marker || marker.deleted || marker.hash !== localHash);
    const remoteChanged = !marker || marker.revision !== row.revision;
    if (local && remoteChanged && localChanged && (row.deleted || localHash !== remoteHash)) {
      sessions.push({ ...local, id: nanoid(), topic: `${local.topic} (conflict copy)` });
      conflicts++;
    }
    if (remoteChanged && (!local || !localChanged || row.deleted || localHash !== remoteHash)) {
      if (index >= 0) sessions.splice(index, 1);
      if (!row.deleted) sessions.splice(Math.max(index, 0), 0, JSON.parse(row.payload) as ChatSession);
    }
    if (remoteChanged || !marker) nextMarkers[row.id] = { revision: row.revision, hash: remoteHash, deleted: !!row.deleted };
  }
  return { sessions, markers: nextMarkers, conflicts };
}
