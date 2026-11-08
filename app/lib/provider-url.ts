/** Validate a user-configured OpenAI-compatible API root.
 * Outbound requests must also use redirect: "manual" and reject redirect
 * responses via isRedirect(). Workers must not have VPC bindings, and
 * callers must authenticate before invoking this helper.
 */
export function providerUrl(input: string, appHostname: string): string {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Enter a valid HTTPS URL"); }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port) {
    throw new Error("Provider URL must use HTTPS without credentials, query, fragment or custom port");
  }
  const appParts = appHostname.toLowerCase().split(".");
  const ownZone = appParts.length > 2 ? appParts.slice(1).join(".") : appHostname.toLowerCase();
  if (!host.includes(".") || host === ownZone || host.endsWith(`.${ownZone}`) || host.endsWith(".local") ||
      host.endsWith(".internal") || host.endsWith(".localhost") || host.endsWith(".workers.dev") ||
      host.startsWith("[") || /^[\d.]+$/.test(host)) {
    throw new Error("Provider must be a public hostname");
  }
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

export function providerEndpoint(base: string, operation: "models" | "chat/completions"): string {
  // Most providers document a base ending in /v1; preserve custom API paths.
  return `${base}/${operation}`;
}

/** Detect a redirect response from a fetch made with redirect: "manual".
 * Unlike browsers, workerd returns the raw 3xx response instead of an
 * opaque-redirect, so follow-the-leader SSRF bypasses must be rejected here.
 */
export function isRedirect(response: Response): boolean {
  return (response.status >= 300 && response.status < 400) || response.headers.has("location");
}
