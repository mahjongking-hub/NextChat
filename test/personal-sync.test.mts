import assert from "node:assert/strict";
import { chatHash, reconcileChats } from "../app/utils/reconcile-chats";
import type { ChatSession } from "../app/store/chat";

const chat = (text: string) => ({ id: "abc", topic: text, messages: [] } as unknown as ChatSession);
const original = chat("original");
const baseline = { abc: { revision: 1, hash: await chatHash(JSON.stringify(original)) } };
const row = (value: ChatSession, revision: number, deleted = 0) => ({ id: "abc", payload: JSON.stringify(value), revision, deleted });
let result = await reconcileChats([original], baseline, [row(chat("remote edit"), 2)]);
assert.equal(result.sessions[0].topic, "remote edit");
assert.equal(result.conflicts, 0);
result = await reconcileChats([chat("local edit")], baseline, [row(chat("remote edit"), 2)]);
assert.deepEqual(result.sessions.map((s) => s.topic).sort(), ["local edit (conflict copy)", "remote edit"]);
assert.equal(result.conflicts, 1);
assert.notEqual(result.sessions[0].id, result.sessions[1].id);
result = await reconcileChats([chat("local edit")], baseline, [row(original, 2, 1)]);
assert.equal(result.sessions.length, 1);
assert.equal(result.sessions[0].topic, "local edit (conflict copy)");
result = await reconcileChats([], baseline, [row(original, 1)]);
assert.equal(result.sessions.length, 0); // local deletion is handled by the caller
console.log("Chat reconciliation tests passed");
