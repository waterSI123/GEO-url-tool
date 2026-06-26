const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; GEOReadinessGrader/1.0; +https://example.com)";

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": DEFAULT_USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
        ...(options.headers ?? {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  return `${url.protocol}//${url.host}/`;
}

export function normalizeAnyUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  url.hash = "";
  return url.toString();
}

export function getDomain(rawUrl: string) {
  try {
    return new URL(normalizeAnyUrl(rawUrl)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function sameSite(url: URL, base: URL) {
  return url.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "");
}

export function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
