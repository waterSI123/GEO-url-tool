import * as cheerio from "cheerio";
import { config } from "./config";
import { compactText, fetchWithTimeout, normalizeUrl, sameSite } from "./http";
import type {
  BotAccessCheck,
  HttpFetchResult,
  PageAudit,
  RiskLevel,
  RobotsAudit,
  RobotsCrawlerCheck,
  SitemapAudit,
  SiteSnapshot
} from "./types";

type RobotsRule = {
  type: "allow" | "disallow";
  path: string;
};

type RobotsGroup = {
  agents: string[];
  rules: RobotsRule[];
  crawlDelay?: string;
};

const CRAWLERS = [
  {
    crawler: "GPTBot",
    label: "OpenAI GPTBot",
    note: "影响 OpenAI 训练/内容理解相关抓取，阻止后可能减少未来模型理解站点内容的机会。"
  },
  {
    crawler: "OAI-SearchBot",
    label: "OpenAI SearchBot",
    note: "影响 ChatGPT 搜索类体验抓取和引用官网内容的机会。"
  },
  {
    crawler: "ChatGPT-User",
    label: "ChatGPT User",
    note: "影响用户在 ChatGPT 内触发访问时读取页面的可能性，和自动 crawler 不是一回事。"
  },
  {
    crawler: "Googlebot",
    label: "Googlebot",
    note: "影响 Google 搜索和 Google AI 体验发现页面的基础条件。"
  },
  {
    crawler: "Google-Extended",
    label: "Google-Extended",
    note: "主要是 Google AI 训练/产品控制信号，不等同于 Google Search 是否收录。"
  },
  {
    crawler: "Bingbot",
    label: "Bingbot",
    note: "影响 Bing 生态发现页面，也可能间接影响部分 AI 搜索引用来源。"
  }
];

const BOT_UA_CHECKS = [
  {
    userAgent:
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    label: "模拟 Googlebot"
  },
  {
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.0",
    label: "模拟 GPTBot"
  },
  {
    userAgent:
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0",
    label: "模拟 OAI-SearchBot"
  },
  {
    userAgent:
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; bingbot/2.0",
    label: "模拟 Bingbot"
  }
];

const DEFAULT_PATHS = [
  "/",
  "/about",
  "/product",
  "/products",
  "/solutions",
  "/features",
  "/pricing",
  "/customers",
  "/case-studies",
  "/blog",
  "/resources",
  "/faq",
  "/contact"
];

const MULTILINGUAL_PATTERNS = {
  faq: [
    /\bfaq\b/i,
    /\bfrequently asked questions\b/i,
    /\bquestions?\b/i,
    /常见问题/,
    /问答/,
    /よくある質問/,
    /質問と回答/,
    /ヘルプ/,
    /サポート/,
    /\bhäufige fragen\b/i,
    /\bfragen und antworten\b/i,
    /\bhilfe\b/i,
    /\bpreguntas frecuentes\b/i,
    /\bfoire aux questions\b/i
  ],
  product: [
    /\bproduct(s)?\b/i,
    /\bsolution(s)?\b/i,
    /\bservice(s)?\b/i,
    /\bspecification(s)?\b/i,
    /\bfeature(s)?\b/i,
    /产品/,
    /解决方案/,
    /参数/,
    /规格/,
    /製品/,
    /商品/,
    /仕様/,
    /ソリューション/,
    /\bprodukt(e)?\b/i,
    /\blösung(en)?\b/i,
    /\bspezifikation(en)?\b/i,
    /\bfunktion(en)?\b/i
  ],
  caseStudy: [
    /\bcase stud(y|ies)\b/i,
    /\bcustomer stor(y|ies)\b/i,
    /\bsuccess stor(y|ies)\b/i,
    /\btestimonial(s)?\b/i,
    /客户案例/,
    /成功案例/,
    /应用案例/,
    /導入事例/,
    /事例/,
    /お客様の声/,
    /\bfallstudie(n)?\b/i,
    /\berfolgsgeschichte(n)?\b/i,
    /\breferenz(en)?\b/i
  ],
  about: [/\babout\b/i, /\bcompany\b/i, /关于我们/, /会社概要/, /企業情報/, /\büber uns\b/i, /\bunternehmen\b/i],
  contact: [/\bcontact\b/i, /\bemail\b/i, /\bsupport\b/i, /联系我们/, /お問い合わせ/, /連絡先/, /\bkontakt\b/i],
  privacy: [/\bprivacy\b/i, /\bterms\b/i, /隐私/, /利用規約/, /プライバシー/, /\bdatenschutz\b/i, /\bimpressum\b/i, /\bagb\b/i],
  customerProof: [
    /\bcustomer(s)?\b/i,
    /\bclient(s)?\b/i,
    /\breview(s)?\b/i,
    /\btestimonial(s)?\b/i,
    /\btrusted by\b/i,
    /客户案例/,
    /導入企業/,
    /お客様/,
    /取引先/,
    /\bkunden\b/i,
    /\bkundenreferenz(en)?\b/i,
    /\bbewertung(en)?\b/i
  ],
  certification: [
    /\biso\s?\d{3,5}\b/i,
    /\bce\b/i,
    /\bfda\b/i,
    /\brohs\b/i,
    /\bul\b/i,
    /\bcertified\b/i,
    /\bcertification(s)?\b/i,
    /\bcompliance\b/i,
    /\baccreditation\b/i,
    /\bpatent(s)?\b/i,
    /认证/,
    /资质/,
    /证书/,
    /合规/,
    /专利/,
    /認証/,
    /規格/,
    /特許/,
    /\bzertifizier(t|ung)\b/i,
    /\bkonformität\b/i,
    /\bpatent(e)?\b/i
  ],
  customerLogo: [
    /\blogo wall\b/i,
    /\btrusted by\b/i,
    /\bour customers\b/i,
    /\bour clients\b/i,
    /\bpartners\b/i,
    /合作客户/,
    /合作伙伴/,
    /導入企業/,
    /パートナー/,
    /\bpartner\b/i,
    /\bkunden\b/i
  ]
};

const QUESTION_PATTERNS = [
  /\?$/,
  /？$/,
  /^(what|why|how|where|when|who|which|can|do|does|is|are|should|will)\b/i,
  /\b(what|why|how|where|when|who|which)\b.+\?$/i,
  /(什么|如何|怎么|为什么|是否|哪些|哪种|多少钱|吗|呢|？)/,
  /(何|なぜ|どう|どの|いつ|どこ|できますか|ですか|ますか|でしょうか|？)/,
  /^(was|wie|warum|wo|wann|wer|welche|kann|ist|sind|kostet)\b/i
];

function headerValue(response: Response, name: string) {
  return response.headers.get(name) ?? "";
}

export async function fetchUrlSnapshot(
  rawUrl: string,
  options: {
    userAgent?: string;
    timeoutMs?: number;
    maxRedirects?: number;
    maxBodyChars?: number;
  } = {}
): Promise<HttpFetchResult> {
  const requestedUrl = rawUrl;
  let currentUrl = rawUrl;
  const redirectChain: string[] = [];
  const startedAt = Date.now();
  const maxRedirects = options.maxRedirects ?? 5;

  try {
    for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
      const response = await fetchWithTimeout(
        currentUrl,
        {
          redirect: "manual",
          headers: options.userAgent ? { "user-agent": options.userAgent } : undefined
        },
        options.timeoutMs ?? config.requestTimeoutMs
      );
      const location = headerValue(response, "location");
      if ([301, 302, 303, 307, 308].includes(response.status) && location && redirects < maxRedirects) {
        currentUrl = new URL(location, currentUrl).toString();
        redirectChain.push(currentUrl);
        continue;
      }

      let body = "";
      try {
        body = await response.text();
      } catch {
        body = "";
      }

      return {
        requestedUrl,
        finalUrl: currentUrl,
        status: response.status,
        ok: response.ok,
        redirected: redirectChain.length > 0,
        redirectChain,
        contentType: headerValue(response, "content-type"),
        responseMs: Date.now() - startedAt,
        headers: {
          server: headerValue(response, "server"),
          xRobotsTag: headerValue(response, "x-robots-tag"),
          location
        },
        body: body.slice(0, options.maxBodyChars ?? 600000)
      };
    }

    return {
      requestedUrl,
      finalUrl: currentUrl,
      status: null,
      ok: false,
      redirected: redirectChain.length > 0,
      redirectChain,
      contentType: "",
      responseMs: Date.now() - startedAt,
      headers: { server: "", xRobotsTag: "", location: "" },
      body: "",
      error: "Redirect chain exceeded"
    };
  } catch (error) {
    return {
      requestedUrl,
      finalUrl: currentUrl,
      status: null,
      ok: false,
      redirected: redirectChain.length > 0,
      redirectChain,
      contentType: "",
      responseMs: Date.now() - startedAt,
      headers: { server: "", xRobotsTag: "", location: "" },
      body: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function stripComment(line: string) {
  const index = line.indexOf("#");
  return (index >= 0 ? line.slice(0, index) : line).trim();
}

function parseRobotsGroups(text: string) {
  const groups: RobotsGroup[] = [];
  const sitemapUrls: string[] = [];
  let current: RobotsGroup | null = null;
  let hasRules = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "sitemap") {
      sitemapUrls.push(value);
      continue;
    }

    if (field === "user-agent") {
      if (!current || hasRules) {
        current = { agents: [], rules: [] };
        groups.push(current);
        hasRules = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;
    if (field === "allow" || field === "disallow") {
      current.rules.push({ type: field, path: value });
      hasRules = true;
    }
    if (field === "crawl-delay") {
      current.crawlDelay = value;
      hasRules = true;
    }
  }

  return { groups, sitemapUrls };
}

function matchSpecificity(agentRule: string, crawler: string) {
  if (agentRule === "*") return 0;
  const normalizedCrawler = crawler.toLowerCase();
  if (normalizedCrawler.includes(agentRule) || agentRule.includes(normalizedCrawler)) {
    return agentRule.length;
  }
  return -1;
}

function ruleMatchesPath(rulePath: string, path: string) {
  if (!rulePath) return false;
  const escaped = rulePath
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\\\$/g, "$");
  return new RegExp(`^${escaped}`).test(path);
}

function evaluateRobotsPath(groups: RobotsGroup[], crawler: string, path = "/") {
  let bestSpecificity = -1;
  let candidateRules: RobotsRule[] = [];

  for (const group of groups) {
    const specificity = Math.max(...group.agents.map((agent) => matchSpecificity(agent, crawler)));
    if (specificity < 0) continue;
    if (specificity > bestSpecificity) {
      bestSpecificity = specificity;
      candidateRules = group.rules;
    } else if (specificity === bestSpecificity) {
      candidateRules = [...candidateRules, ...group.rules];
    }
  }

  if (bestSpecificity < 0 || candidateRules.length === 0) {
    return { allowed: true, matchedRule: "未匹配到限制规则" };
  }

  const matches = candidateRules
    .filter((rule) => rule.path === "" || ruleMatchesPath(rule.path, path))
    .sort((a, b) => {
      const byLength = b.path.length - a.path.length;
      if (byLength !== 0) return byLength;
      if (a.type === b.type) return 0;
      return a.type === "allow" ? -1 : 1;
    });

  const winner = matches[0];
  if (!winner || winner.path === "") {
    return { allowed: true, matchedRule: "未匹配到限制规则" };
  }

  return {
    allowed: winner.type === "allow",
    matchedRule: `${winner.type}: ${winner.path}`
  };
}

function crawlerLevel(crawler: string, allowed: boolean): RiskLevel {
  if (allowed) return "good";
  if (crawler === "Google-Extended" || crawler === "ChatGPT-User") return "warning";
  return "danger";
}

export async function auditRobots(rootUrl: string): Promise<RobotsAudit> {
  const robotsUrl = new URL("/robots.txt", rootUrl).toString();
  const response = await fetchUrlSnapshot(robotsUrl, {
    timeoutMs: Math.min(config.requestTimeoutMs, 12000),
    maxBodyChars: 200000
  });

  if (!response.ok) {
    return {
      url: robotsUrl,
      exists: false,
      status: response.status,
      sitemapUrls: [],
      crawlDelayAgents: [],
      checks: CRAWLERS.map((item) => ({
        crawler: item.crawler,
        label: item.label,
        allowed: true,
        matchedRule: "robots.txt 不可访问或不存在",
        level: "neutral",
        note: "没有检测到可解析的 robots.txt；这不一定是错误，但会降低抓取策略的可解释性。"
      })),
      rawTextSample: "",
      error: response.error
    };
  }

  const { groups, sitemapUrls } = parseRobotsGroups(response.body);
  const checks: RobotsCrawlerCheck[] = CRAWLERS.map((item) => {
    const result = evaluateRobotsPath(groups, item.crawler);
    return {
      crawler: item.crawler,
      label: item.label,
      allowed: result.allowed,
      matchedRule: result.matchedRule,
      level: crawlerLevel(item.crawler, result.allowed),
      note: result.allowed ? `${item.label} 当前没有被 robots.txt 阻止。` : item.note
    };
  });

  return {
    url: robotsUrl,
    exists: true,
    status: response.status,
    sitemapUrls: Array.from(new Set(sitemapUrls)).slice(0, 20),
    crawlDelayAgents: groups
      .filter((group) => group.crawlDelay)
      .flatMap((group) => group.agents.map((agent) => `${agent}: ${group.crawlDelay}`)),
    checks,
    rawTextSample: response.body.slice(0, 5000)
  };
}

function extractJsonLdTypes(value: unknown): string[] {
  const types: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    if (Array.isArray(type)) {
      type.forEach((item) => {
        if (typeof item === "string") types.push(item);
      });
    } else if (typeof type === "string") {
      types.push(type);
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return types;
}

function detectJsonLdTypes($: cheerio.CheerioAPI) {
  const types: string[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const text = $(element).text().trim();
    if (!text) return;
    try {
      types.push(...extractJsonLdTypes(JSON.parse(text)));
    } catch {
      // Ignore malformed schema; the report should be based on parseable signals.
    }
  });
  return Array.from(new Set(types));
}

function detectMicrodataTypes($: cheerio.CheerioAPI) {
  const types: string[] = [];
  $("[itemscope], [itemtype], [itemprop]").each((_, element) => {
    const itemType = String($(element).attr("itemtype") ?? "");
    const itemProp = String($(element).attr("itemprop") ?? "");
    if (itemType) {
      itemType
        .split(/\s+/)
        .map((type) => type.split("/").filter(Boolean).pop() ?? type)
        .filter(Boolean)
        .forEach((type) => types.push(type));
    }
    if (["mainEntity", "acceptedAnswer", "suggestedAnswer", "question", "answer"].includes(itemProp)) {
      types.push(itemProp);
    }
  });
  return Array.from(new Set(types));
}

function countWords(text: string) {
  const latinWords = text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? [];
  const cjkChars = text.match(/[\u4e00-\u9fff]/g) ?? [];
  const kanaChars = text.match(/[\u3040-\u30ff]/g) ?? [];
  return latinWords.length + cjkChars.length + kanaChars.length;
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasType(types: string[], expected: string[]) {
  const normalized = types.map((type) => type.toLowerCase());
  return expected.some((item) => normalized.includes(item.toLowerCase()));
}

function looksLikeQuestion(text: string) {
  const compact = compactText(text);
  return compact.length >= 6 && compact.length <= 220 && hasAny(compact, QUESTION_PATTERNS);
}

function detectAnswerSignals($: cheerio.CheerioAPI) {
  const lengthBasedCount = $("p, li")
    .map((_, element) => compactText($(element).text()))
    .get()
    .filter((text) => text.length >= 70 && text.length <= 320).length;
  const detailsSummaryCount = $("details > summary").length;
  let questionAnswerPairCount = 0;

  $("h2, h3, h4, summary, dt, strong, p, li").each((_, element) => {
    const question = compactText($(element).text());
    if (!looksLikeQuestion(question)) return;
    const nextAnswer = compactText(
      $(element).nextAll("p, div, dd, li").first().text() || $(element).parent().text()
    );
    if (nextAnswer.length >= question.length + 28 || (nextAnswer.length >= 40 && nextAnswer.length <= 900)) {
      questionAnswerPairCount += 1;
    }
  });

  const answerBlockCount = Math.min(80, lengthBasedCount + questionAnswerPairCount + detailsSummaryCount);
  return {
    answerBlockCount,
    questionAnswerPairCount,
    semanticFaqCount: detailsSummaryCount
  };
}

function detectLanguageSignals($: cheerio.CheerioAPI, text: string) {
  const signals = new Set<string>();
  const htmlLang = $("html").attr("lang");
  if (htmlLang) signals.add(`html lang=${htmlLang}`);
  const hreflangs = $('link[rel="alternate"][hreflang]')
    .map((_, element) => String($(element).attr("hreflang") ?? ""))
    .get()
    .filter(Boolean)
    .slice(0, 8);
  hreflangs.forEach((lang) => signals.add(`hreflang=${lang}`));
  if (/[\u3040-\u30ff]/.test(text)) signals.add("日语假名内容");
  if (/[äöüß]/i.test(text) || hasAny(text, [/\bdatenschutz\b/i, /\büber uns\b/i, /\bprodukt(e)?\b/i])) {
    signals.add("德语内容");
  }
  if (/[éèêàçùœ]/i.test(text) || hasAny(text, [/\bfoire aux questions\b/i])) signals.add("法语内容");
  if (/[áéíóúñ¿¡]/i.test(text) || hasAny(text, [/\bpreguntas frecuentes\b/i])) signals.add("西语内容");
  return Array.from(signals);
}

function extractPage(fetchResult: HttpFetchResult): PageAudit {
  if (!fetchResult.ok || !fetchResult.body) {
    return {
      url: fetchResult.requestedUrl,
      finalUrl: fetchResult.finalUrl,
      status: fetchResult.status,
      ok: false,
      title: "",
      metaDescription: "",
      h1: [],
      h2: [],
      canonical: "",
      robotsMeta: "",
      xRobotsTag: fetchResult.headers.xRobotsTag,
      noindex: false,
      nofollow: false,
      wordCount: 0,
      answerBlockCount: 0,
      questionAnswerPairCount: 0,
      semanticFaqCount: 0,
      faqSignal: false,
      tableCount: 0,
      listCount: 0,
      jsonLdTypes: [],
      microdataTypes: [],
      detectedLanguageSignals: [],
      organizationSchema: false,
      productSchema: false,
      faqSchema: false,
      articleSchema: false,
      productPageSignal: false,
      caseStudyPageSignal: false,
      faqPageSignal: false,
      hasAboutSignal: false,
      hasContactSignal: false,
      hasPrivacySignal: false,
      hasCustomerProofSignal: false,
      hasCertificationSignal: false,
      hasCustomerLogoSignal: false,
      hasSocialLinkSignal: false,
      hasExternalProfileSignal: false,
      hasDateSignal: false,
      internalLinks: [],
      visibleTextSample: "",
      error: fetchResult.error
    };
  }

  const $ = cheerio.load(fetchResult.body);
  $("script, style, noscript, svg, iframe").remove();

  const title = compactText($("title").first().text());
  const metaDescription = compactText(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content") ??
      ""
  );
  const h1 = $("h1")
    .map((_, element) => compactText($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 8);
  const h2 = $("h2")
    .map((_, element) => compactText($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 20);
  const robotsMeta = [
    $('meta[name="robots"]').attr("content") ?? "",
    $('meta[name="googlebot"]').attr("content") ?? ""
  ]
    .filter(Boolean)
    .join(", ");
  const robotsControl = `${robotsMeta}, ${fetchResult.headers.xRobotsTag}`.toLowerCase();
  const visibleText = compactText($("body").text());
  const lowerText = visibleText.toLowerCase();
  const jsonLdTypes = detectJsonLdTypes($);
  const microdataTypes = detectMicrodataTypes($);
  const normalizedTypes = jsonLdTypes.map((type) => type.toLowerCase());
  const normalizedMicrodataTypes = microdataTypes.map((type) => type.toLowerCase());
  const baseUrl = new URL(fetchResult.finalUrl);
  const internalLinks = $("a[href]")
    .map((_, element) => {
      const href = String($(element).attr("href") ?? "");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return "";
      }
      try {
        const next = new URL(href, baseUrl);
        return sameSite(next, baseUrl) ? next.toString() : "";
      } catch {
        return "";
      }
    })
    .get()
    .filter(Boolean);
  const links = $("a[href]")
    .map((_, element) => {
      const href = String($(element).attr("href") ?? "");
      try {
        return new URL(href, baseUrl).toString().toLowerCase();
      } catch {
        return "";
      }
    })
    .get()
    .filter(Boolean);
  const pathname = baseUrl.pathname.toLowerCase();
  const answerSignals = detectAnswerSignals($);
  const faqByMicrodata = hasType(microdataTypes, ["FAQPage", "Question", "Answer", "mainEntity", "acceptedAnswer"]);
  const faqBySemanticHtml = answerSignals.semanticFaqCount > 0;
  const faqByQuestionPairs = answerSignals.questionAnswerPairCount >= 2;
  const hasDateSignal =
    $("time").length > 0 ||
    hasAny(fetchResult.body, [/datePublished/i, /dateModified/i, /published/i, /updated/i]);
  const detectedLanguageSignals = detectLanguageSignals($, visibleText);

  return {
    url: fetchResult.requestedUrl,
    finalUrl: fetchResult.finalUrl,
    status: fetchResult.status,
    ok: true,
    title,
    metaDescription,
    h1,
    h2,
    canonical: $('link[rel="canonical"]').attr("href") ?? "",
    robotsMeta,
    xRobotsTag: fetchResult.headers.xRobotsTag,
    noindex: robotsControl.includes("noindex"),
    nofollow: robotsControl.includes("nofollow"),
    wordCount: countWords(visibleText),
    answerBlockCount: answerSignals.answerBlockCount,
    questionAnswerPairCount: answerSignals.questionAnswerPairCount,
    semanticFaqCount: answerSignals.semanticFaqCount,
    faqSignal:
      normalizedTypes.includes("faqpage") ||
      faqByMicrodata ||
      faqBySemanticHtml ||
      faqByQuestionPairs ||
      hasAny(lowerText, MULTILINGUAL_PATTERNS.faq),
    tableCount: $("table").length,
    listCount: $("ul, ol").length,
    jsonLdTypes,
    microdataTypes,
    detectedLanguageSignals,
    organizationSchema:
      normalizedTypes.includes("organization") ||
      normalizedTypes.includes("localbusiness") ||
      normalizedMicrodataTypes.includes("organization") ||
      normalizedMicrodataTypes.includes("localbusiness"),
    productSchema:
      normalizedTypes.includes("product") ||
      normalizedTypes.includes("softwareapplication") ||
      normalizedTypes.includes("service") ||
      normalizedMicrodataTypes.includes("product") ||
      normalizedMicrodataTypes.includes("softwareapplication") ||
      normalizedMicrodataTypes.includes("service"),
    faqSchema: normalizedTypes.includes("faqpage") || faqByMicrodata,
    articleSchema:
      normalizedTypes.includes("article") ||
      normalizedTypes.includes("blogposting") ||
      normalizedTypes.includes("newsarticle") ||
      normalizedMicrodataTypes.includes("article") ||
      normalizedMicrodataTypes.includes("blogposting") ||
      normalizedMicrodataTypes.includes("newsarticle"),
    productPageSignal:
      normalizedTypes.includes("product") ||
      normalizedTypes.includes("softwareapplication") ||
      normalizedTypes.includes("service") ||
      hasAny(pathname, [/product/, /solution/, /service/, /feature/, /application/, /produkt/, /loesung/, /lösung/]) ||
      hasAny(lowerText, MULTILINGUAL_PATTERNS.product),
    caseStudyPageSignal:
      hasAny(pathname, [/case/, /customer/, /success-stor/, /testimonial/, /reference/, /referenz/]) ||
      hasAny(lowerText, MULTILINGUAL_PATTERNS.caseStudy),
    faqPageSignal:
      normalizedTypes.includes("faqpage") ||
      faqByMicrodata ||
      faqBySemanticHtml ||
      hasAny(pathname, [/faq/, /help/, /support/, /question/, /hilfe/, /fragen/]) ||
      hasAny(lowerText, MULTILINGUAL_PATTERNS.faq),
    hasAboutSignal: hasAny(lowerText, MULTILINGUAL_PATTERNS.about),
    hasContactSignal: hasAny(lowerText, MULTILINGUAL_PATTERNS.contact),
    hasPrivacySignal: hasAny(lowerText, MULTILINGUAL_PATTERNS.privacy),
    hasCustomerProofSignal: hasAny(lowerText, MULTILINGUAL_PATTERNS.customerProof),
    hasCertificationSignal: hasAny(lowerText, MULTILINGUAL_PATTERNS.certification),
    hasCustomerLogoSignal: hasAny(lowerText, MULTILINGUAL_PATTERNS.customerLogo),
    hasSocialLinkSignal: links.some((link) =>
      [
        "linkedin.com",
        "youtube.com",
        "facebook.com",
        "twitter.com",
        "x.com",
        "instagram.com",
        "tiktok.com"
      ].some((domain) => link.includes(domain))
    ),
    hasExternalProfileSignal: links.some((link) =>
      [
        "g2.com",
        "capterra.com",
        "trustradius.com",
        "trustpilot.com",
        "clutch.co",
        "crunchbase.com",
        "wikipedia.org",
        "made-in-china.com",
        "alibaba.com",
        "globalsources.com",
        "thomasnet.com",
        "github.com"
      ].some((domain) => link.includes(domain))
    ),
    hasDateSignal,
    internalLinks: Array.from(new Set(internalLinks)).slice(0, 80),
    visibleTextSample: visibleText.slice(0, 1200)
  };
}

async function auditPage(url: string) {
  const result = await fetchUrlSnapshot(url, {
    timeoutMs: Math.min(config.requestTimeoutMs, 15000),
    maxBodyChars: 600000
  });
  return extractPage(result);
}

function normalizeSitemapUrl(url: string, rootUrl: string) {
  try {
    return new URL(url, rootUrl).toString();
  } catch {
    return "";
  }
}

function parseSitemapXml(xml: string) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const sitemapUrls = $("sitemap > loc")
    .map((_, element) => compactText($(element).text()))
    .get()
    .filter(Boolean);
  const pageUrls = $("url > loc")
    .map((_, element) => compactText($(element).text()))
    .get()
    .filter(Boolean);
  const lastmodCount = $("url > lastmod").length;
  return { sitemapUrls, pageUrls, lastmodCount };
}

export async function auditSitemap(rootUrl: string, robots: RobotsAudit): Promise<SitemapAudit> {
  const checkedUrls: string[] = [];
  const errors: string[] = [];
  const root = new URL(rootUrl);
  const candidates = Array.from(
    new Set([
      ...robots.sitemapUrls.map((url) => normalizeSitemapUrl(url, rootUrl)).filter(Boolean),
      new URL("/sitemap.xml", root).toString(),
      new URL("/sitemap_index.xml", root).toString()
    ])
  );
  let sitemapIndexCount = 0;
  let lastmodCount = 0;
  const pageUrls: string[] = [];

  async function readSitemap(url: string, depth = 0) {
    if (checkedUrls.includes(url) || checkedUrls.length >= 8 || depth > 1) return;
    checkedUrls.push(url);
    const response = await fetchUrlSnapshot(url, {
      timeoutMs: Math.min(config.requestTimeoutMs, 15000),
      maxBodyChars: 900000
    });
    if (!response.ok || !response.body) {
      errors.push(`${url} 返回 ${response.status ?? "错误"}`);
      return;
    }
    const parsed = parseSitemapXml(response.body);
    sitemapIndexCount += parsed.sitemapUrls.length;
    lastmodCount += parsed.lastmodCount;
    pageUrls.push(...parsed.pageUrls);
    for (const nestedUrl of parsed.sitemapUrls.slice(0, 3)) {
      const normalized = normalizeSitemapUrl(nestedUrl, rootUrl);
      if (normalized) await readSitemap(normalized, depth + 1);
    }
  }

  for (const candidate of candidates.slice(0, 5)) {
    await readSitemap(candidate);
    if (pageUrls.length >= config.maxSitemapUrlsToSample) break;
  }

  const sameSiteUrls = Array.from(
    new Set(
      pageUrls.filter((url) => {
        try {
          return sameSite(new URL(url), root);
        } catch {
          return false;
        }
      })
    )
  );

  return {
    checkedUrls,
    accessible: sameSiteUrls.length > 0,
    declaredInRobots: robots.sitemapUrls.length > 0,
    urlCount: sameSiteUrls.length,
    sitemapIndexCount,
    lastmodCount,
    sampledUrls: sameSiteUrls.slice(0, config.maxSitemapUrlsToSample),
    errors: errors.slice(0, 6)
  };
}

function pickImportantLinks(homepage: PageAudit, rootUrl: string) {
  const keywords = [
    "about",
    "product",
    "solution",
    "feature",
    "pricing",
    "customer",
    "case",
    "blog",
    "resource",
    "faq",
    "contact"
  ];
  return homepage.internalLinks.filter((link) => {
    const pathname = new URL(link).pathname.toLowerCase();
    return keywords.some((keyword) => pathname.includes(keyword)) && link.startsWith(rootUrl);
  });
}

function detectBotChallenge(result: HttpFetchResult) {
  const body = result.body.toLowerCase();
  const headers = `${result.headers.server} ${result.headers.location}`.toLowerCase();
  const signals: string[] = [];
  let provider = "";

  const mark = (nextProvider: string, signal: string) => {
    provider ||= nextProvider;
    signals.push(signal);
  };

  const sensitiveStatus = [401, 403, 429, 503].includes(result.status ?? 0);
  if (sensitiveStatus) {
    signals.push(`敏感状态码 ${result.status}`);
  }
  if (body.includes("captcha") || body.includes("recaptcha") || body.includes("hcaptcha")) {
    signals.push("出现 captcha/人机验证文案");
  }
  if (body.includes("access denied") || body.includes("forbidden") || body.includes("request blocked")) {
    signals.push("出现 access denied / request blocked 文案");
  }
  if (
    body.includes("cf-chl") ||
    body.includes("cf-browser-verification") ||
    body.includes("checking your browser") ||
    body.includes("turnstile") ||
    (sensitiveStatus && (body.includes("cloudflare") || headers.includes("cloudflare")))
  ) {
    mark("Cloudflare", "Cloudflare 挑战页/验证脚本特征");
  }
  if (
    body.includes("acw_tc") ||
    body.includes("aliyunwaf") ||
    body.includes("yundun") ||
    body.includes("云盾") ||
    (sensitiveStatus &&
      (body.includes("aliyun") ||
        body.includes("alibaba cloud") ||
        headers.includes("aliyun") ||
        headers.includes("alibaba")))
  ) {
    mark("Alibaba Cloud / Aliyun", "阿里云 WAF/CDN 挑战或访问控制特征");
  }
  if (body.includes("tencentcloud") || body.includes("tencent waf") || body.includes("tencent-captcha")) {
    mark("Tencent Cloud", "腾讯云 WAF/验证码特征");
  }
  if (body.includes("akamai") || body.includes("_abck") || body.includes("akamai bot manager")) {
    mark("Akamai", "Akamai Bot Manager 特征");
  }
  if (body.includes("incapsula") || body.includes("imperva")) {
    mark("Imperva", "Imperva/Incapsula 防护特征");
  }
  if (body.includes("datadome")) {
    mark("DataDome", "DataDome bot detection 特征");
  }
  if (body.includes("aws waf") || body.includes("x-amzn-waf") || body.includes("request blocked by aws")) {
    mark("AWS WAF", "AWS WAF 拦截特征");
  }
  if (body.includes("bot detection") || body.includes("bot protection") || body.includes("browser verification")) {
    signals.push("出现 bot detection / browser verification 文案");
  }

  return {
    blockedSignal: signals.length > 0,
    challengeProvider: provider || "未识别",
    challengeSignals: Array.from(new Set(signals)).slice(0, 6)
  };
}

async function auditBotAccess(rootUrl: string): Promise<BotAccessCheck[]> {
  const checks: BotAccessCheck[] = [];
  for (const item of BOT_UA_CHECKS) {
    const result = await fetchUrlSnapshot(rootUrl, {
      userAgent: item.userAgent,
      timeoutMs: Math.min(config.requestTimeoutMs, 12000),
      maxBodyChars: 80000
    });
    const challenge = detectBotChallenge(result);
    const level: RiskLevel = challenge.blockedSignal ? "warning" : result.ok ? "good" : "neutral";
    checks.push({
      userAgent: item.userAgent,
      label: item.label,
      status: result.status,
      ok: result.ok,
      blockedSignal: challenge.blockedSignal,
      challengeProvider: challenge.challengeProvider,
      challengeSignals: challenge.challengeSignals,
      level,
      note: challenge.blockedSignal
        ? `外部访问出现疑似 Bot/WAF 拦截信号${challenge.challengeProvider !== "未识别" ? `（${challenge.challengeProvider}）` : ""}；真实判断仍需要结合 CDN/WAF 日志。`
        : result.ok
          ? "模拟 User-Agent 可以访问首页；这不能证明真实 crawler 一定可访问，但初筛未见明显拦截。"
          : "该模拟访问没有成功，建议人工复核。"
    });
  }
  return checks;
}

export async function crawlWebsite(rawUrl: string): Promise<SiteSnapshot> {
  const normalizedUrl = normalizeUrl(rawUrl);
  const root = new URL(normalizedUrl);
  const robots = await auditRobots(normalizedUrl);
  const sitemap = await auditSitemap(normalizedUrl, robots);
  const homepage = await auditPage(normalizedUrl);
  const defaultCandidates = DEFAULT_PATHS.map((path) => new URL(path, root).toString());
  const linkCandidates = homepage.ok ? pickImportantLinks(homepage, normalizedUrl) : [];
  const candidates = Array.from(
    new Set([normalizedUrl, ...sitemap.sampledUrls, ...defaultCandidates, ...linkCandidates])
  ).filter((url) => {
    try {
      return sameSite(new URL(url), root);
    } catch {
      return false;
    }
  });

  const pages: PageAudit[] = [homepage];
  const failedUrls: string[] = homepage.ok ? [] : [homepage.url];
  for (const url of candidates.slice(1)) {
    if (pages.length >= config.maxPagesToAudit) break;
    const page = await auditPage(url);
    if (!page.ok) {
      failedUrls.push(url);
      continue;
    }
    if (pages.some((item) => item.finalUrl === page.finalUrl)) continue;
    pages.push(page);
  }

  const botAccessChecks = await auditBotAccess(normalizedUrl);

  return {
    requestedUrl: rawUrl,
    normalizedUrl,
    capturedAt: new Date().toISOString(),
    robots,
    sitemap,
    pages,
    botAccessChecks,
    failedUrls: failedUrls.slice(0, 12)
  };
}
