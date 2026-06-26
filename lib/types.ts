export type JobStatus = "pending" | "running" | "completed" | "failed";

export type RiskLevel = "good" | "warning" | "danger" | "neutral";

export interface DiagnosticInput {
  websiteUrl: string;
}

export interface DiagnosticJob extends DiagnosticInput {
  id: string;
  status: JobStatus;
  progress: number;
  currentStep: string;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface HttpFetchResult {
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  redirected: boolean;
  redirectChain: string[];
  contentType: string;
  responseMs: number;
  headers: {
    server: string;
    xRobotsTag: string;
    location: string;
  };
  body: string;
  error?: string;
}

export interface RobotsCrawlerCheck {
  crawler: string;
  label: string;
  allowed: boolean;
  matchedRule: string;
  level: RiskLevel;
  note: string;
}

export interface RobotsAudit {
  url: string;
  exists: boolean;
  status: number | null;
  sitemapUrls: string[];
  crawlDelayAgents: string[];
  checks: RobotsCrawlerCheck[];
  rawTextSample: string;
  error?: string;
}

export interface SitemapAudit {
  checkedUrls: string[];
  accessible: boolean;
  declaredInRobots: boolean;
  urlCount: number;
  sitemapIndexCount: number;
  lastmodCount: number;
  sampledUrls: string[];
  errors: string[];
}

export interface BotAccessCheck {
  userAgent: string;
  label: string;
  status: number | null;
  ok: boolean;
  blockedSignal: boolean;
  challengeProvider: string;
  challengeSignals: string[];
  level: RiskLevel;
  note: string;
}

export interface PageAudit {
  url: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  canonical: string;
  robotsMeta: string;
  xRobotsTag: string;
  noindex: boolean;
  nofollow: boolean;
  wordCount: number;
  answerBlockCount: number;
  questionAnswerPairCount: number;
  semanticFaqCount: number;
  faqSignal: boolean;
  tableCount: number;
  listCount: number;
  jsonLdTypes: string[];
  microdataTypes: string[];
  detectedLanguageSignals: string[];
  organizationSchema: boolean;
  productSchema: boolean;
  faqSchema: boolean;
  articleSchema: boolean;
  productPageSignal: boolean;
  caseStudyPageSignal: boolean;
  faqPageSignal: boolean;
  hasAboutSignal: boolean;
  hasContactSignal: boolean;
  hasPrivacySignal: boolean;
  hasCustomerProofSignal: boolean;
  hasCertificationSignal: boolean;
  hasCustomerLogoSignal: boolean;
  hasSocialLinkSignal: boolean;
  hasExternalProfileSignal: boolean;
  hasDateSignal: boolean;
  internalLinks: string[];
  visibleTextSample: string;
  error?: string;
}

export interface SiteSnapshot {
  requestedUrl: string;
  normalizedUrl: string;
  capturedAt: string;
  robots: RobotsAudit;
  sitemap: SitemapAudit;
  pages: PageAudit[];
  botAccessChecks: BotAccessCheck[];
  failedUrls: string[];
}

export interface RiskSection {
  id: "crawl" | "index" | "discover" | "understand" | "trust" | "bot";
  title: string;
  score: number;
  level: RiskLevel;
  plainLanguage: string;
  evidence: string[];
  recommendations: string[];
}

export interface FixRecommendation {
  priority: number;
  title: string;
  whyItMatters: string;
  effort: "低" | "中" | "高";
  ownerHint: string;
}

export interface DiagnosticReport {
  jobId: string;
  websiteUrl: string;
  finalUrl: string;
  overallScore: number;
  grade: "A" | "B" | "C" | "D";
  summaryTitle: string;
  executiveSummary: string;
  businessSummary: {
    biggestProblems: string[];
    priorityActions: string[];
  };
  riskSections: RiskSection[];
  topFixes: FixRecommendation[];
  crawlerSummary: RobotsCrawlerCheck[];
  pageSamples: PageAudit[];
  sitemap: SitemapAudit;
  botAccessChecks: BotAccessCheck[];
  conversionCta: {
    title: string;
    description: string;
    bullets: string[];
  };
  disclaimer: string;
  generatedAt: string;
}

export interface DiagnosticBundle {
  job: DiagnosticJob | null;
  snapshot: SiteSnapshot | null;
  report: DiagnosticReport | null;
}
