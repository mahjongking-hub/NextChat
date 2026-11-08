import { useChatStore } from "../store/chat";
import { showToast } from "../components/ui-lib";
import { chatHash, reconcileChats, type Marker, type Remote } from "./reconcile-chats";

const markerKey = "personal-sync-v1";
let running = false;

async function send(method: string, data: unknown): Promise<Response> {
  return fetch("/api/personal/conversations", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

/** Synchronize one snapshot at a time, preserving both sides of conflicts. */
export async function synchronizeChats(): Promise<void> {
  if (running || !useChatStore.getState()._hasHydrated) return;
  running = true;
  try {
    const stored = localStorage.getItem(markerKey);
    const markers: Record<string, Marker> = stored ? JSON.parse(stored) : {};
    const response = await fetch("/api/personal/conversations", { cache: "no-store" });
    if (!response.ok) throw new Error("Chat sync could not reach the server.");
    const result = await response.json() as { conversations: Remote[] };
    const snapshot = useChatStore.getState().sessions;
    if (snapshot.some((s) => s.messages.some((m) => m.streaming))) return;
    const snapshotText = JSON.stringify(snapshot);
    const remoteById = new Map(result.conversations.map((row) => [row.id, row]));
    const { sessions, markers: pendingMarkers, conflicts } = await reconcileChats(snapshot, markers, result.conversations);
    // Don't replace a conversation while the user or a streamed response is editing it.
    if (JSON.stringify(useChatStore.getState().sessions) !== snapshotText) return;
    if (JSON.stringify(sessions) !== snapshotText) {
      useChatStore.setState((state) => {
        const currentId = state.sessions[state.currentSessionIndex]?.id;
        const index = sessions.findIndex((s) => s.id === currentId);
        return { sessions, currentSessionIndex: Math.max(index, 0) };
      });
      if (!sessions.length) useChatStore.getState().newSession();
    }
    localStorage.setItem(markerKey, JSON.stringify(pendingMarkers));
    if (conflicts) showToast("A chat changed on another device; a conflict copy was preserved.");
    for (const session of sessions) {
      if (session.messages.some((m) => m.streaming)) continue;
      const text = JSON.stringify(session);
      const digest = await chatHash(text);
      const marker = pendingMarkers[session.id];
      if (marker && !marker.deleted && marker.hash === digest) continue;
      const saved = await send("PUT", { id: session.id, payload: session, revision: marker?.revision ?? 0 });
      if (saved.status === 409) continue;
      if (!saved.ok) throw new Error("A chat could not be synchronized.");
      const data = await saved.json() as { revision: number };
      pendingMarkers[session.id] = { revision: data.revision, hash: digest };
      localStorage.setItem(markerKey, JSON.stringify(pendingMarkers));
    }
    // Only propagate deletions for items this device previously synchronized.
    for (const [id, marker] of Object.entries(markers)) {
      const remote = remoteById.get(id);
      if (!marker.deleted && !sessions.some((s) => s.id === id) && remote && !remote.deleted && remote.revision === marker.revision) {
        const removed = await send("DELETE", { id, revision: marker.revision });
        if (removed.ok) { pendingMarkers[id] = { revision: marker.revision + 1, hash: "", deleted: true }; localStorage.setItem(markerKey, JSON.stringify(pendingMarkers)); }
      }
    }
  } finally { running = false; }
}
