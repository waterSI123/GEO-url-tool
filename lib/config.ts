export const config = {
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 20000),
  maxPagesToAudit: Number(process.env.MAX_PAGES_TO_AUDIT ?? 8),
  maxSitemapUrlsToSample: Number(process.env.MAX_SITEMAP_URLS_TO_SAMPLE ?? 8),
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000"
};
