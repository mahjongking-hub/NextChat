// The encryption key is a 32-byte, base64-encoded Cloudflare Worker secret.
// The provider ID and endpoint are bound to the ciphertext to prevent swapping.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function importKey(secret: string): Promise<CryptoKey> {
  const raw = decode(secret);
  if (raw.byteLength !== 32) throw new Error("Invalid encryption key");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptProviderKey(secret: string, providerId: string, apiKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(providerId) },
    await importKey(secret), encoder.encode(apiKey),
  );
  return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}

export async function decryptProviderKey(secret: string, providerId: string, value: string): Promise<string> {
  const [version, iv, ciphertext, extra] = value.split(".");
  if (version !== "v1" || !iv || !ciphertext || extra) throw new Error("Invalid encrypted key");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(iv), additionalData: encoder.encode(providerId) },
    await importKey(secret), decode(ciphertext),
  );
  return decoder.decode(plaintext);
}
