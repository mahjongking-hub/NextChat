import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

type AccessConfig = { teamDomain: string; audience: string; ownerEmail: string };

/** Fail closed even when the Worker is reached through an unprotected URL. */
export async function requireAccess(request: Request, config: AccessConfig, testKeySet?: JWTVerifyGetKey): Promise<string> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || !config.audience || !config.ownerEmail || !config.teamDomain) throw new Error("Unauthorized");
  const issuer = new URL(config.teamDomain);
  if (issuer.protocol !== "https:" || !issuer.hostname.endsWith(".cloudflareaccess.com") || issuer.pathname !== "/" || issuer.search || issuer.hash || issuer.username || issuer.password || issuer.port) {
    throw new Error("Invalid Access configuration");
  }
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) throw new Error("Invalid origin");
  }
  const keys = testKeySet ?? createRemoteJWKSet(new URL("/cdn-cgi/access/certs", issuer));
  const { payload } = await jwtVerify(token, keys, {
    issuer: issuer.origin,
    audience: config.audience,
    algorithms: ["RS256"],
  });
  if (typeof payload.email !== "string" || payload.email.toLowerCase() !== config.ownerEmail.toLowerCase()) throw new Error("Unauthorized");
  return payload.email.toLowerCase();
}
