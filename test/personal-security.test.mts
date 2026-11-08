import assert from "node:assert/strict";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { requireAccess } from "../app/lib/access-auth";
import { encryptProviderKey, decryptProviderKey } from "../app/lib/provider-crypto";
import { providerEndpoint, providerUrl } from "../app/lib/provider-url";

const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const encrypted = await encryptProviderKey(secret, "provider-a", "test-key");
assert.notEqual(encrypted, await encryptProviderKey(secret, "provider-a", "test-key"));
assert.ok(!encrypted.includes("test-key"));
assert.equal(await decryptProviderKey(secret, "provider-a", encrypted), "test-key");
await assert.rejects(() => decryptProviderKey(secret, "provider-b", encrypted));
await assert.rejects(() => encryptProviderKey(btoa("short"), "provider-a", "test-key"));
await assert.rejects(() => decryptProviderKey(secret, "provider-a", encrypted.slice(0, -4) + "AAAA"));

const config = { teamDomain: "https://example.cloudflareaccess.com", audience: "test-audience", ownerEmail: "owner@example.com" };
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey); jwk.kid = "test"; jwk.alg = "RS256";
const keys = createLocalJWKSet({ keys: [jwk] });
async function token(email: string, audience = config.audience) {
  return new SignJWT({ email }).setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer(config.teamDomain).setAudience(audience).setIssuedAt().setExpirationTime("5m").sign(privateKey);
}
const request = (jwt: string, origin = "https://app.example") => new Request("https://app.example/api/personal/chat", { method: "POST", headers: { "cf-access-jwt-assertion": jwt, origin } });
assert.equal(await requireAccess(request(await token(config.ownerEmail)), config, keys), config.ownerEmail);
await assert.rejects(() => requireAccess(request("invalid"), config, keys));
await assert.rejects(async () => requireAccess(request(await token("other@example.com")), config, keys));
await assert.rejects(async () => requireAccess(request(await token(config.ownerEmail, "wrong-audience")), config, keys));
await assert.rejects(async () => requireAccess(request(await token(config.ownerEmail), "https://evil.example"), config, keys));

const base = providerUrl("https://maas-api.antdigital.com/v1/", "chat.example.com");
assert.equal(providerEndpoint(base, "chat/completions"), "https://maas-api.antdigital.com/v1/chat/completions");
for (const invalid of ["http://example.com", "https://127.0.0.1", "https://[::1]", "https://foo.local", "https://chat.example.com", "https://a.workers.dev", "https://user:pass@example.com", "https://example.com/?x=y"]) {
  assert.throws(() => providerUrl(invalid, "chat.example.com"));
}
console.log("Personal security tests passed");
