import type {
  DiagnosticReport,
  FixRecommendation,
  PageAudit,
  RiskLevel,
  RiskSection,
  SiteSnapshot
} from "./types";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function levelForScore(score: number): RiskLevel {
  if (score >= 76) return "good";
  if (score >= 51) return "warning";
  return "danger";
}

function gradeForScore(score: number): DiagnosticReport["grade"] {
  if (score >= 86) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

function yesNo(value: boolean) {
  return value ? "有" : "没有";
}

function homepage(snapshot: SiteSnapshot) {
  return snapshot.pages[0] ?? null;
}

function schemaTypes(page: PageAudit) {
  return page.jsonLdTypes.length ? page.jsonLdTypes.join(", ") : "未检测到可解析 JSON-LD";
}

function buildCrawlSection(snapshot: SiteSnapshot): RiskSection {
  const home = homepage(snapshot);
  const aiCrawlerChecks = snapshot.robots.checks.filter((check) =>
    ["GPTBot", "OAI-SearchBot", "Googlebot", "Bingbot"].includes(check.crawler)
  );
  const blockedCritical = aiCrawlerChecks.filter((check) => !check.allowed);
  const score = clampScore(
    (home?.ok ? 30 : 0) +
      (snapshot.robots.exists ? 18 : 8) +
      (blockedCritical.length === 0 ? 32 : Math.max(0, 32 - blockedCritical.length * 10)) +
      (snapshot.robots.sitemapUrls.length ? 10 : 0) +
      (snapshot.failedUrls.length <= 2 ? 10 : 3)
  );

  return {
    id: "crawl",
    title: "抓取入口",
    score,
    level: levelForScore(score),
    plainLanguage:
      score >= 76
        ? "AI crawler 进入网站的基础路径比较清楚。"
        : score >= 51
          ? "网站不是完全进不去，但 AI crawler 的进入路径存在不稳定因素。"
          : "AI crawler 可能还没开始理解你的网站，就已经在入口处遇到障碍。",
    evidence: [
      `首页访问状态：${home?.status ?? "失败"}。`,
      `robots.txt：${snapshot.robots.exists ? "可访问" : "未检测到可访问文件"}。`,
      `关键 crawler 限制：${blockedCritical.length ? blockedCritical.map((item) => item.label).join("、") : "未发现 GPT/OAI/Google/Bing 关键阻止规则"}。`,
      `抓取失败样本：${snapshot.failedUrls.length} 个。`
    ],
    recommendations: [
      "确认 robots.txt 不误伤 OAI-SearchBot、GPTBot、Googlebot、Bingbot。",
      "把 sitemap 写入 robots.txt，降低 AI 搜索系统发现核心页面的成本。",
      "修复首页和核心页面的 4xx/5xx/跳转异常。"
    ]
  };
}

function pageIndexScore(page: PageAudit) {
  if (!page.ok) return 0;
  return (
    25 +
    (!page.noindex ? 25 : 0) +
    (page.title ? 12 : 0) +
    (page.metaDescription ? 10 : 0) +
    (page.h1.length ? 10 : 0) +
    (page.canonical ? 8 : 4) +
    (page.status === 200 ? 10 : 0)
  );
}

function buildIndexSection(snapshot: SiteSnapshot): RiskSection {
  const pages = snapshot.pages;
  const noindexPages = pages.filter((page) => page.noindex);
  const missingTitle = pages.filter((page) => page.ok && !page.title).length;
  const missingH1 = pages.filter((page) => page.ok && page.h1.length === 0).length;
  const score = clampScore(average(pages.map(pageIndexScore)));

  return {
    id: "index",
    title: "可索引性",
    score,
    level: levelForScore(score),
    plainLanguage:
      score >= 76
        ? "核心页面具备被搜索系统收录和理解的基本条件。"
        : score >= 51
          ? "部分页面可以被访问，但页面级索引信号不够稳。"
          : "搜索和 AI 系统可能收不到你的核心页面，或者收到的是不完整信号。",
    evidence: [
      `检测页面：${pages.length} 个，成功页面：${pages.filter((page) => page.ok).length} 个。`,
      `noindex 页面：${noindexPages.length} 个。`,
      `缺少 title 页面：${missingTitle} 个；缺少 H1 页面：${missingH1} 个。`,
      `首页 canonical：${homepage(snapshot)?.canonical || "未设置"}。`
    ],
    recommendations: [
      "确保首页、产品页、方案页返回 200，并且没有 meta noindex 或 X-Robots-Tag noindex。",
      "每个核心页面补齐唯一 title、description、H1 和合理 canonical。",
      "对多语言/多国家页面单独复核 canonical，避免把海外核心页指回错误版本。"
    ]
  };
}

function buildDiscoverSection(snapshot: SiteSnapshot): RiskSection {
  const score = clampScore(
    (snapshot.sitemap.accessible ? 42 : 0) +
      (snapshot.sitemap.declaredInRobots ? 18 : 0) +
      (snapshot.sitemap.urlCount >= 5 ? 18 : snapshot.sitemap.urlCount > 0 ? 8 : 0) +
      (snapshot.sitemap.lastmodCount > 0 ? 12 : 0) +
      (snapshot.pages.length >= 4 ? 10 : 4)
  );

  return {
    id: "discover",
    title: "页面发现",
    score,
    level: levelForScore(score),
    plainLanguage:
      score >= 76
        ? "网站向搜索和 AI 系统提供了比较清晰的 URL 发现线索。"
        : score >= 51
          ? "AI 仍有机会发现页面，但发现路径不够主动。"
          : "你的重要页面可能藏得太深，AI 不一定知道该去读哪些内容。",
    evidence: [
      `sitemap：${snapshot.sitemap.accessible ? "可访问" : "未发现有效 URL 列表"}。`,
      `robots.txt 声明 sitemap：${yesNo(snapshot.sitemap.declaredInRobots)}。`,
      `sitemap URL 数量：${snapshot.sitemap.urlCount}；lastmod 数量：${snapshot.sitemap.lastmodCount}。`,
      `已检查 sitemap：${snapshot.sitemap.checkedUrls.length ? snapshot.sitemap.checkedUrls.join("、") : "无"}。`
    ],
    recommendations: [
      "提供 /sitemap.xml，并把它声明到 robots.txt。",
      "确保产品页、方案页、案例页、FAQ、博客文章都进入 sitemap。",
      "给 sitemap 核心 URL 补 lastmod，帮助搜索系统判断内容新鲜度。"
    ]
  };
}

function pageUnderstandingScore(page: PageAudit) {
  if (!page.ok) return 0;
  const hasFaqStructure =
    page.faqSignal ||
    page.faqSchema ||
    page.semanticFaqCount > 0 ||
    page.questionAnswerPairCount >= 2 ||
    page.microdataTypes.some((type) => ["FAQPage", "Question", "Answer", "acceptedAnswer"].includes(type));
  return (
    (page.title && page.metaDescription && page.h1.length ? 18 : 6) +
    (page.wordCount >= 500 ? 20 : page.wordCount >= 220 ? 12 : 4) +
    (page.answerBlockCount >= 5 ? 18 : page.answerBlockCount >= 2 ? 10 : 2) +
    (page.h2.length >= 3 ? 10 : 4) +
    (hasFaqStructure ? 12 : 0) +
    (page.tableCount || page.listCount >= 2 ? 10 : 3) +
    (page.productPageSignal || page.caseStudyPageSignal || page.faqPageSignal ? 8 : 0) +
    (page.productSchema || page.faqSchema || page.articleSchema || page.microdataTypes.length ? 12 : 0)
  );
}

function buildUnderstandSection(snapshot: SiteSnapshot): RiskSection {
  const pages = snapshot.pages.filter((page) => page.ok);
  const avgWords = Math.round(average(pages.map((page) => page.wordCount)));
  const answerBlocks = pages.reduce((sum, page) => sum + page.answerBlockCount, 0);
  const faqPages = pages.filter((page) => page.faqSignal || page.faqSchema).length;
  const semanticFaqs = pages.reduce((sum, page) => sum + page.semanticFaqCount, 0);
  const qaPairs = pages.reduce((sum, page) => sum + page.questionAnswerPairCount, 0);
  const microdataPages = pages.filter((page) => page.microdataTypes.length > 0).length;
  const productPages = pages.filter((page) => page.productPageSignal).length;
  const casePages = pages.filter((page) => page.caseStudyPageSignal).length;
  const explicitFaqPages = pages.filter((page) => page.faqPageSignal).length;
  const languageSignals = Array.from(new Set(pages.flatMap((page) => page.detectedLanguageSignals))).slice(0, 8);
  const score = clampScore(average(pages.map(pageUnderstandingScore)));

  return {
    id: "understand",
    title: "AI 可理解性",
    score,
    level: levelForScore(score),
    plainLanguage:
      score >= 76
        ? "页面内容比较适合被 AI 摘取成答案。"
        : score >= 51
          ? "AI 能读到一些内容，但未必能稳定理解你卖什么、适合谁、解决什么问题。"
          : "AI 看完网站后，可能仍然说不清你是谁、卖什么、为什么值得推荐。",
    evidence: [
      `成功页面平均字数：${avgWords}。`,
      `可摘取答案段：${answerBlocks} 个；问答句式对：${qaPairs} 个。`,
      `FAQ/问答信号页面：${faqPages} 个；details/summary 语义 FAQ：${semanticFaqs} 个；Microdata 页面：${microdataPages} 个。`,
      `产品/方案页信号：${productPages} 个；案例页信号：${casePages} 个；FAQ/帮助页信号：${explicitFaqPages} 个。`,
      `多语言信号：${languageSignals.length ? languageSignals.join("、") : "未检测到 html lang / hreflang / 日语或德语等明显信号"}。`,
      `首页 schema：${homepage(snapshot) ? schemaTypes(homepage(snapshot) as PageAudit) : "未检测"}。`
    ],
    recommendations: [
      "明确补齐产品/方案页、客户案例页、FAQ/帮助页三类页面，让 AI 能按“卖什么、谁用过、常见问题”理解网站。",
      "在首页和核心产品页增加 100-200 字的清晰答案段，同时用“问题 + 直接回答”的句式覆盖采购疑问。",
      "FAQ 建议使用可解析结构：details/summary、FAQPage JSON-LD 或 Question/Answer Microdata，不只是一段普通文字。",
      "多语言站点补 html lang、hreflang，并让日语/德语等本地页面也保留产品、案例、FAQ 和证据链。"
    ]
  };
}

function buildTrustSection(snapshot: SiteSnapshot): RiskSection {
  const pages = snapshot.pages.filter((page) => page.ok);
  const hasOrg = pages.some((page) => page.organizationSchema);
  const hasProduct = pages.some((page) => page.productSchema);
  const hasContact = pages.some((page) => page.hasContactSignal);
  const hasAbout = pages.some((page) => page.hasAboutSignal);
  const hasPrivacy = pages.some((page) => page.hasPrivacySignal);
  const hasProof = pages.some((page) => page.hasCustomerProofSignal);
  const hasDate = pages.some((page) => page.hasDateSignal || page.articleSchema);
  const hasCertification = pages.some((page) => page.hasCertificationSignal);
  const hasLogo = pages.some((page) => page.hasCustomerLogoSignal);
  const hasSocial = pages.some((page) => page.hasSocialLinkSignal);
  const hasExternalProfile = pages.some((page) => page.hasExternalProfileSignal);
  const score = clampScore(
    (hasOrg ? 14 : 0) +
      (hasProduct ? 12 : 0) +
      (hasContact ? 12 : 0) +
      (hasAbout ? 10 : 0) +
      (hasPrivacy ? 8 : 0) +
      (hasProof ? 14 : 0) +
      (hasDate ? 8 : 0) +
      (hasCertification ? 10 : 0) +
      (hasLogo ? 6 : 0) +
      (hasSocial ? 6 : 0) +
      (hasExternalProfile ? 6 : 0)
  );

  return {
    id: "trust",
    title: "可信度信号",
    score,
    level: levelForScore(score),
    plainLanguage:
      score >= 76
        ? "网站给 AI 提供了较充分的实体和可信度信号。"
        : score >= 51
          ? "网站有部分可信度信息，但 AI 引用或推荐你的理由还不够强。"
          : "AI 即使抓到你的网站，也可能因为可信度证据不足而不敢引用或推荐。",
    evidence: [
      `Organization schema：${yesNo(hasOrg)}；Product/Service schema：${yesNo(hasProduct)}。`,
      `About：${yesNo(hasAbout)}；Contact：${yesNo(hasContact)}；Privacy/Terms：${yesNo(hasPrivacy)}。`,
      `客户案例/评价/Trusted by 信号：${yesNo(hasProof)}。`,
      `认证/资质/专利信号：${yesNo(hasCertification)}；客户 Logo/合作伙伴信号：${yesNo(hasLogo)}。`,
      `社媒链接：${yesNo(hasSocial)}；外部资料/评测/目录页链接：${yesNo(hasExternalProfile)}。`,
      `发布日期/更新日期/文章信号：${yesNo(hasDate)}。`
    ],
    recommendations: [
      "补齐公司实体信息：About、Contact、隐私政策、服务条款、社媒/外部资料链接。",
      "集中展示认证、资质、专利、测试报告和合规声明，尤其是出海 B2B 客户会问到的信任证据。",
      "增加客户案例、评价、客户 Logo wall、第三方评测或目录站链接，给 AI 推荐你的理由。",
      "给博客/资源页补作者、发布日期、更新日期和 Article schema。"
    ]
  };
}

function buildBotSection(snapshot: SiteSnapshot): RiskSection {
  const blocked = snapshot.botAccessChecks.filter((check) => check.blockedSignal);
  const ok = snapshot.botAccessChecks.filter((check) => check.ok && !check.blockedSignal);
  const providerCount = new Set(blocked.map((check) => check.challengeProvider).filter((provider) => provider !== "未识别")).size;
  const score = clampScore(
    blocked.length
      ? 100 - blocked.length * 24 - providerCount * 10
      : (ok.length / Math.max(1, snapshot.botAccessChecks.length)) * 100
  );

  return {
    id: "bot",
    title: "Bot 防护初筛",
    score,
    level: blocked.length >= 2 || score < 51 ? "danger" : blocked.length ? "warning" : levelForScore(score),
    plainLanguage:
      blocked.length > 0
        ? "外部模拟访问看到疑似 CDN/WAF 挑战页或 Bot 拦截信号，真实 crawler 可能被误伤。"
        : "模拟 crawler 访问没有看到明显拦截，但真实判断仍需看 CDN/WAF 日志。",
    evidence: snapshot.botAccessChecks.map(
      (check) =>
        `${check.label}：${check.status ?? "失败"}，${check.note}${check.challengeSignals.length ? ` 信号：${check.challengeSignals.join("；")}` : ""}`
    ),
    recommendations: [
      "在 Cloudflare、阿里云、Akamai、AWS WAF、DataDome 等安全策略里复核 Googlebot、Bingbot、OAI-SearchBot、GPTBot 的处理规则。",
      "结合服务器日志和 CDN/WAF 安全事件确认真实 crawler 是否被 403/429/挑战页拦截。",
      "不要只依赖 User-Agent 白名单，真实 crawler 验证还应结合官方验证方式和日志。"
    ]
  };
}

function buildTopFixes(snapshot: SiteSnapshot, sections: RiskSection[]): FixRecommendation[] {
  const fixes: FixRecommendation[] = [];
  const criticalBlocked = snapshot.robots.checks.filter(
    (check) => !check.allowed && ["GPTBot", "OAI-SearchBot", "Googlebot", "Bingbot"].includes(check.crawler)
  );
  const hasNoindex = snapshot.pages.some((page) => page.noindex);
  const hasSchema = snapshot.pages.some(
    (page) => page.organizationSchema || page.productSchema || page.faqSchema || page.articleSchema
  );
  const weakUnderstanding = sections.find((section) => section.id === "understand")?.score ?? 0;
  const botBlocked = snapshot.botAccessChecks.filter((check) => check.blockedSignal);

  if (criticalBlocked.length) {
    fixes.push({
      priority: 1,
      title: "先修 robots.txt，不要误伤 AI 和搜索 crawler",
      whyItMatters: `${criticalBlocked.map((item) => item.label).join("、")} 当前存在限制，AI 可能连官网都进不来。`,
      effort: "低",
      ownerHint: "技术/SEO"
    });
  }

  if (botBlocked.length) {
    fixes.push({
      priority: fixes.length + 1,
      title: "复核 CDN/WAF，不要让挑战页挡住搜索和 AI crawler",
      whyItMatters: `${botBlocked.map((item) => item.label).join("、")} 访问时出现疑似拦截或挑战页，AI 可能无法稳定读取官网。`,
      effort: "中",
      ownerHint: "技术/安全"
    });
  }

  if (!snapshot.sitemap.accessible || !snapshot.sitemap.declaredInRobots) {
    fixes.push({
      priority: fixes.length + 1,
      title: "补 sitemap，并声明到 robots.txt",
      whyItMatters: "AI 搜索系统需要先发现核心页面，才有机会理解和引用你的内容。",
      effort: "低",
      ownerHint: "技术/SEO"
    });
  }

  if (hasNoindex) {
    fixes.push({
      priority: fixes.length + 1,
      title: "复核 noindex / X-Robots-Tag",
      whyItMatters: "页面能访问不代表能被索引，noindex 会直接切断搜索和 AI 引用机会。",
      effort: "低",
      ownerHint: "技术/SEO"
    });
  }

  if (weakUnderstanding < 70) {
    fixes.push({
      priority: fixes.length + 1,
      title: "重写首页和产品页的 AI 可摘取答案段",
      whyItMatters: "现在的内容可能更像营销话术，AI 不一定能稳定抽取“你是谁、适合谁、解决什么问题”。",
      effort: "中",
      ownerHint: "内容/市场"
    });
  }

  if (!hasSchema) {
    fixes.push({
      priority: fixes.length + 1,
      title: "补 Organization / Product / FAQ 结构化数据",
      whyItMatters: "Schema 不是万能药，但能帮助 AI 和搜索系统更明确地识别公司、产品和问答内容。",
      effort: "中",
      ownerHint: "前端/SEO"
    });
  }

  if (!snapshot.pages.some((page) => page.hasCustomerProofSignal)) {
    fixes.push({
      priority: fixes.length + 1,
      title: "补客户案例、评价和第三方可信信源",
      whyItMatters: "AI 推荐品牌时需要证据。缺少客户证明时，它更可能引用竞品或第三方目录。",
      effort: "中",
      ownerHint: "市场/销售"
    });
  }

  return fixes.slice(0, 5).map((fix, index) => ({ ...fix, priority: index + 1 }));
}

function summaryTitle(score: number) {
  if (score >= 76) return "这个网站具备较好的 AI 搜索基础，但仍有增强空间";
  if (score >= 51) return "这个网站不是完全不可见，但 AI 搜索基础还不稳";
  return "这个网站很可能没有准备好被 AI 搜索看见";
}

function executiveSummary(snapshot: SiteSnapshot, score: number, weakest: RiskSection) {
  const domain = new URL(snapshot.normalizedUrl).hostname;
  if (score >= 76) {
    return `${domain} 的抓取、索引和内容结构基础相对健康。接下来重点不是大改网站，而是补强 FAQ、结构化数据、案例和第三方信源，让 AI 不只是能看到你，还更愿意引用你。`;
  }
  if (score >= 51) {
    return `${domain} 目前具备部分 AI 搜索可见性基础，但最薄弱的是“${weakest.title}”。这意味着海外买家在 ChatGPT/Gemini/Google AI 里问相关问题时，AI 可能读到一些页面，却不一定能稳定理解和推荐你。`;
  }
  return `${domain} 当前存在明显 GEO 基础风险，最先暴露的是“${weakest.title}”。换句话说，AI 可能在抓取、索引、发现或理解环节就已经掉队，海外买家问相关问题时，系统更容易引用竞品而不是你。`;
}

function problemForSection(section: RiskSection) {
  const messages: Record<RiskSection["id"], string> = {
    crawl: "AI/搜索 crawler 进入官网的路径不够稳，可能在入口处就丢失可见性。",
    index: "部分核心页面的索引信号不完整，搜索和 AI 系统不一定能稳定收录。",
    discover: "产品、案例、FAQ 等关键页面发现路径弱，AI 可能找不到真正该读的内容。",
    understand: "官网内容不够像可摘取答案，AI 难以讲清你是谁、卖什么、为什么值得推荐。",
    trust: "可信证据不足，AI 即使读到官网，也缺少引用和推荐你的理由。",
    bot: "疑似 Bot/WAF 访问风险需要复核，真实 crawler 访问可能不稳定。"
  };
  return messages[section.id];
}

function buildBusinessSummary(sections: RiskSection[], fixes: FixRecommendation[]) {
  const biggestProblems = [...sections]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(problemForSection);
  const priorityActions = fixes.slice(0, 3).map((fix) => fix.title);
  return { biggestProblems, priorityActions };
}

function buildConversionCta(snapshot: SiteSnapshot) {
  const domain = new URL(snapshot.normalizedUrl).hostname;
  return {
    title: "下一步：预约 AI 搜索竞品深度诊断",
    description:
      `${domain} 的免费报告只回答“官网基础是否适合被 AI 搜索理解”。如果要判断真实获客机会，建议继续做一次深度诊断：看 ChatGPT/Perplexity 是否推荐你和竞品，以及 AI 为什么引用竞品。`,
    bullets: [
      "查看核心产品在 ChatGPT / Perplexity 中是否被推荐、被如何描述。",
      "对比 3-5 个竞品的 AI 可见性、Mention、推荐位置和情绪倾向。",
      "分析 Perplexity 引用源，找出竞品依赖的官网、媒体、目录站、评测和社区信源。",
      "输出 Prompt/Citation 分析、内容改造路线图和 30 天复测计划。"
    ]
  };
}

export function buildReport(jobId: string, snapshot: SiteSnapshot): DiagnosticReport {
  const sections = [
    buildCrawlSection(snapshot),
    buildIndexSection(snapshot),
    buildDiscoverSection(snapshot),
    buildUnderstandSection(snapshot),
    buildTrustSection(snapshot),
    buildBotSection(snapshot)
  ];
  const weights: Record<RiskSection["id"], number> = {
    crawl: 0.18,
    index: 0.16,
    discover: 0.14,
    understand: 0.24,
    trust: 0.16,
    bot: 0.12
  };
  const overallScore = clampScore(
    sections.reduce((sum, section) => sum + section.score * weights[section.id], 0)
  );
  const weakest = [...sections].sort((a, b) => a.score - b.score)[0];
  const topFixes = buildTopFixes(snapshot, sections);

  return {
    jobId,
    websiteUrl: snapshot.normalizedUrl,
    finalUrl: homepage(snapshot)?.finalUrl ?? snapshot.normalizedUrl,
    overallScore,
    grade: gradeForScore(overallScore),
    summaryTitle: summaryTitle(overallScore),
    executiveSummary: executiveSummary(snapshot, overallScore, weakest),
    businessSummary: buildBusinessSummary(sections, topFixes),
    riskSections: sections,
    topFixes,
    crawlerSummary: snapshot.robots.checks,
    pageSamples: snapshot.pages,
    sitemap: snapshot.sitemap,
    botAccessChecks: snapshot.botAccessChecks,
    conversionCta: buildConversionCta(snapshot),
    disclaimer:
      "本报告是 URL-only 外部体检，只判断网站是否具备被 AI 搜索抓取、理解、引用的基础条件；不等同于 GPT/Gemini 实时排名承诺。WAF/Bot 结论属于外部初筛，完整判断需要结合 CDN/WAF 和服务器日志。",
    generatedAt: new Date().toISOString()
  };
}
