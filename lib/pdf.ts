import fs from "node:fs";
import PDFDocument from "pdfkit";
import type { DiagnosticReport, RiskLevel } from "./types";

const FONT_CANDIDATES = [
  "/Library/Fonts/Arial Unicode.ttf",
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  "/System/Library/Fonts/Hiragino Sans GB.ttc",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"
];

const COLORS = {
  text: "#172033",
  muted: "#667085",
  line: "#d9e0ea",
  softLine: "#edf1f5",
  panel: "#f7f9fc",
  bluePanel: "#eef4ff",
  primary: "#1358d8",
  primaryDark: "#0d3c99",
  good: "#047857",
  warning: "#b45309",
  danger: "#b42318",
  white: "#ffffff"
};

const PAGE = {
  margin: 38,
  width: 595.28,
  height: 841.89
};

function pickFont() {
  return FONT_CANDIDATES.find((fontPath) => fs.existsSync(fontPath));
}

function levelLabel(level: RiskLevel) {
  if (level === "good") return "健康";
  if (level === "warning") return "需复核";
  if (level === "danger") return "高风险";
  return "信息";
}

function toneColor(level: RiskLevel) {
  if (level === "good") return COLORS.good;
  if (level === "warning") return COLORS.warning;
  if (level === "danger") return COLORS.danger;
  return COLORS.muted;
}

function scoreColor(score: number) {
  if (score >= 76) return COLORS.good;
  if (score >= 51) return COLORS.warning;
  return COLORS.danger;
}

function safeFilename(value: string) {
  return value.replace(/^https?:\/\//, "").replace(/[^a-z0-9.-]+/gi, "-").replace(/^-|-$/g, "");
}

function contentWidth(doc: PDFKit.PDFDocument) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function bottomY(doc: PDFKit.PDFDocument) {
  return doc.page.height - doc.page.margins.bottom;
}

function fillPageBackground(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fillColor(COLORS.white).fill();
  doc.restore();
}

function createDoc() {
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE.margin,
    bufferPages: true,
    info: {
      Title: "GEO Readiness Diagnostic Report",
      Author: "URL-only GEO Readiness Grader"
    }
  });
  const fontPath = pickFont();
  if (fontPath) {
    doc.registerFont("ReportFont", fontPath);
    doc.registerFont("ReportFontBold", fontPath);
    doc.font("ReportFont");
  } else {
    doc.registerFont("ReportFont", "Helvetica");
    doc.registerFont("ReportFontBold", "Helvetica-Bold");
    doc.font("ReportFont");
  }
  fillPageBackground(doc);
  doc.on("pageAdded", () => {
    fillPageBackground(doc);
    doc.font("ReportFont");
  });
  return doc;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > bottomY(doc)) {
    doc.addPage();
  }
}

function textHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  options: { size?: number; lineGap?: number; font?: "ReportFont" | "ReportFontBold" } = {}
) {
  doc.font(options.font ?? "ReportFont").fontSize(options.size ?? 9.5);
  return doc.heightOfString(text, {
    width,
    lineGap: options.lineGap ?? 2
  });
}

function writeSmallLabel(doc: PDFKit.PDFDocument, text: string, x: number, y: number, color = COLORS.muted) {
  doc.font("ReportFont").fontSize(7.8).fillColor(color).text(text, x, y, { lineBreak: false });
}

function sectionHeading(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  ensureSpace(doc, 48);
  doc.moveDown(0.65);
  const y = doc.y;
  doc.rect(doc.page.margins.left, y + 3, 4, 14).fillColor(COLORS.primary).fill();
  doc
    .font("ReportFontBold")
    .fontSize(13.2)
    .fillColor(COLORS.text)
    .text(title, doc.page.margins.left + 12, y, { lineBreak: false });
  if (subtitle) {
    doc
      .font("ReportFont")
      .fontSize(8.6)
      .fillColor(COLORS.muted)
      .text(subtitle, doc.page.margins.left + 12, y + 18, { width: contentWidth(doc) - 12 });
    doc.y = y + 36;
  } else {
    doc.y = y + 24;
  }
}

function roundedPanel(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  fill = COLORS.panel,
  stroke = COLORS.line
) {
  doc.roundedRect(x, y, width, height, 8).fillColor(fill).fill();
  doc.roundedRect(x, y, width, height, 8).strokeColor(stroke).lineWidth(0.6).stroke();
}

function drawHeader(doc: PDFKit.PDFDocument, report: DiagnosticReport) {
  const x = doc.page.margins.left;
  const y = doc.y;
  doc
    .font("ReportFontBold")
    .fontSize(21)
    .fillColor(COLORS.text)
    .text("GEO Readiness 诊断报告", x, y, { width: contentWidth(doc) * 0.7 });
  doc
    .font("ReportFont")
    .fontSize(8.6)
    .fillColor(COLORS.muted)
    .text(`${report.websiteUrl} · ${new Date(report.generatedAt).toLocaleString()}`, x, y + 30, {
      width: contentWidth(doc) * 0.72
    });
  doc
    .font("ReportFontBold")
    .fontSize(8.8)
    .fillColor(COLORS.primary)
    .text("URL-only GEO Readiness Grader", x, y + 2, {
      width: contentWidth(doc),
      align: "right"
    });
  doc.y = y + 54;
}

function drawHero(doc: PDFKit.PDFDocument, report: DiagnosticReport) {
  const x = doc.page.margins.left;
  const y = doc.y;
  const width = contentWidth(doc);
  const height = 112;
  ensureSpace(doc, height + 10);
  roundedPanel(doc, x, y, width, height, COLORS.bluePanel, "#c9d9fb");
  doc
    .font("ReportFontBold")
    .fontSize(48)
    .fillColor(scoreColor(report.overallScore))
    .text(String(report.overallScore), x + 18, y + 24, { width: 88, lineBreak: false });
  doc
    .font("ReportFont")
    .fontSize(8.5)
    .fillColor(COLORS.muted)
    .text("Readiness Score", x + 20, y + 78, { width: 90, lineBreak: false });
  doc
    .font("ReportFontBold")
    .fontSize(13.5)
    .fillColor(COLORS.text)
    .text(`等级 ${report.grade} · ${report.summaryTitle}`, x + 122, y + 20, {
      width: width - 146,
      lineGap: 2
    });
  doc
    .font("ReportFont")
    .fontSize(9.4)
    .fillColor(COLORS.text)
    .text(report.executiveSummary, x + 122, y + 48, {
      width: width - 146,
      lineGap: 3
    });
  doc.y = y + height + 8;
}

function drawMetricStrip(doc: PDFKit.PDFDocument, report: DiagnosticReport) {
  const x = doc.page.margins.left;
  const y = doc.y;
  const width = contentWidth(doc);
  const gap = 8;
  const cardWidth = (width - gap * 5) / 6;
  ensureSpace(doc, 66);
  report.riskSections.forEach((section, index) => {
    const cardX = x + index * (cardWidth + gap);
    roundedPanel(doc, cardX, y, cardWidth, 58, COLORS.white, COLORS.line);
    doc
      .font("ReportFontBold")
      .fontSize(15)
      .fillColor(scoreColor(section.score))
      .text(String(section.score), cardX + 8, y + 9, { width: cardWidth - 16, align: "center" });
    doc
      .font("ReportFont")
      .fontSize(7.2)
      .fillColor(COLORS.muted)
      .text(section.title, cardX + 5, y + 34, { width: cardWidth - 10, align: "center" });
  });
  doc.y = y + 68;
}

function drawBusinessSummary(doc: PDFKit.PDFDocument, report: DiagnosticReport) {
  const summary = report.businessSummary ?? {
    biggestProblems: ["官网基础体检已完成，建议结合模块分数优先处理低分项。"],
    priorityActions: report.topFixes.slice(0, 3).map((fix) => fix.title)
  };
  sectionHeading(doc, "老板摘要", "把技术体检翻译成业务上最该关注的问题和下一步动作。");
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const gap = 12;
  const colWidth = (width - gap) / 2;
  const leftLines = summary.biggestProblems.slice(0, 3).map((item, index) => `${index + 1}. ${item}`);
  const rightLines = summary.priorityActions.slice(0, 3).map((item, index) => `${index + 1}. ${item}`);
  const leftText = leftLines.join("\n");
  const rightText = rightLines.join("\n");
  const height =
    Math.max(
      92,
      textHeight(doc, leftText, colWidth - 22, { size: 8.8, lineGap: 3 }) + 44,
      textHeight(doc, rightText, colWidth - 22, { size: 8.8, lineGap: 3 }) + 44
    );
  ensureSpace(doc, height + 10);
  const y = doc.y;

  roundedPanel(doc, x, y, colWidth, height, COLORS.white, COLORS.line);
  roundedPanel(doc, x + colWidth + gap, y, colWidth, height, COLORS.white, COLORS.line);
  doc.font("ReportFontBold").fontSize(10.2).fillColor(COLORS.danger).text("3 个最大问题", x + 12, y + 12, {
    width: colWidth - 24
  });
  doc.font("ReportFont").fontSize(8.8).fillColor(COLORS.text).text(leftText, x + 12, y + 34, {
    width: colWidth - 24,
    lineGap: 3
  });
  doc.font("ReportFontBold").fontSize(10.2).fillColor(COLORS.primary).text("3 个优先动作", x + colWidth + gap + 12, y + 12, {
    width: colWidth - 24
  });
  doc.font("ReportFont").fontSize(8.8).fillColor(COLORS.text).text(rightText, x + colWidth + gap + 12, y + 34, {
    width: colWidth - 24,
    lineGap: 3
  });
  doc.y = y + height + 10;
}

function drawFixes(doc: PDFKit.PDFDocument, report: DiagnosticReport) {
  sectionHeading(doc, "优先修复项", "适合直接放进客户沟通和后续服务报价里的前三到五个动作。");
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  report.topFixes.slice(0, 5).forEach((fix, index) => {
    const body = `${fix.whyItMatters}\n工作量：${fix.effort} · 建议负责人：${fix.ownerHint}`;
    const height = Math.max(54, textHeight(doc, body, width - 68, { size: 8.9, lineGap: 2 }) + 28);
    ensureSpace(doc, height + 6);
    const y = doc.y;
    doc.roundedRect(x, y, width, height, 7).strokeColor(COLORS.softLine).lineWidth(0.6).stroke();
    doc.circle(x + 22, y + 23, 12).fillColor(index === 0 ? COLORS.primary : "#e8eef9").fill();
    doc
      .font("ReportFontBold")
      .fontSize(9)
      .fillColor(index === 0 ? COLORS.white : COLORS.primaryDark)
      .text(String(index + 1), x + 18.5, y + 17.5, { width: 8, align: "center", lineBreak: false });
    doc
      .font("ReportFontBold")
      .fontSize(10.2)
      .fillColor(COLORS.text)
      .text(fix.title, x + 50, y + 12, { width: width - 68 });
    doc
      .font("ReportFont")
      .fontSize(8.8)
      .fillColor(COLORS.muted)
      .text(body, x + 50, y + 29, { width: width - 68, lineGap: 2 });
    doc.y = y + height + 6;
  });
}

function drawRiskRows(doc: PDFKit.PDFDocument, report: DiagnosticReport) {
  sectionHeading(doc, "风险模块明细", "每个模块保留核心结论、关键证据和第一优先级建议，减少无效篇幅。");
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  report.riskSections.forEach((section) => {
    const evidence = section.evidence.slice(0, 1).join("\n");
    const recommendation = section.recommendations.slice(0, 1).join("\n");
    const body = `${section.plainLanguage}\n证据：${evidence}\n建议：${recommendation}`;
    const height = Math.max(76, textHeight(doc, body, width - 104, { size: 8.1, lineGap: 1.6 }) + 26);
    ensureSpace(doc, height + 8);
    const y = doc.y;
    roundedPanel(doc, x, y, width, height, COLORS.white, COLORS.line);
    doc.rect(x, y, 5, height).fillColor(toneColor(section.level)).fill();
    doc
      .font("ReportFontBold")
      .fontSize(18)
      .fillColor(scoreColor(section.score))
      .text(String(section.score), x + 18, y + 17, { width: 46, align: "center" });
    writeSmallLabel(doc, levelLabel(section.level), x + 18, y + 43, toneColor(section.level));
    doc
      .font("ReportFontBold")
      .fontSize(10.8)
      .fillColor(COLORS.text)
      .text(section.title, x + 82, y + 13, { width: width - 104 });
    doc
      .font("ReportFont")
      .fontSize(8.1)
      .fillColor(COLORS.text)
      .text(body, x + 82, y + 30, { width: width - 104, lineGap: 1.6 });
    doc.y = y + height + 8;
  });
}

function drawTechnicalDetails(doc: PDFKit.PDFDocument, report: DiagnosticReport) {
  sectionHeading(doc, "技术证据摘要", "用于给内部技术、SEO 或市场同事复核，不追求穷尽，只保留决策相关信号。");

  const crawlerLines = report.crawlerSummary.map(
    (check) => `${check.label}：${check.allowed ? "允许" : "存在限制"} · ${check.matchedRule}`
  );
  writeCompactList(doc, "Robots 与 AI Crawler", crawlerLines, 6);

  writeCompactList(
    doc,
    "Sitemap",
    [
      `状态：${report.sitemap.accessible ? "可访问" : "未发现有效 URL"}`,
      `robots.txt 声明：${report.sitemap.declaredInRobots ? "有" : "无"}`,
      `URL 数量：${report.sitemap.urlCount}`,
      `lastmod 数量：${report.sitemap.lastmodCount}`,
      `样本：${report.sitemap.sampledUrls.slice(0, 4).join("；") || "无"}`
    ],
    5
  );

  const pageLines = report.pageSamples.slice(0, 4).map((page, index) =>
    [
      `${index + 1}. ${page.finalUrl || page.url}`,
      `状态 ${page.status ?? "失败"} · ${page.noindex ? "noindex" : "可索引"} · ${page.wordCount} 词 · ${page.answerBlockCount} 个答案段 · ${page.questionAnswerPairCount ?? 0} 个问答对`,
      `页面信号：${page.productPageSignal ? "产品/方案页" : "缺产品页"}；${page.caseStudyPageSignal ? "案例页" : "缺案例页"}；${page.faqPageSignal ? "FAQ/帮助页" : "缺 FAQ 页"}；details/summary：${page.semanticFaqCount ?? 0}`,
      `Title：${page.title || "缺少"}；H1：${page.h1[0] || "缺少"}；Schema：${page.jsonLdTypes.join(", ") || "无"}；Microdata：${page.microdataTypes?.join(", ") || "无"}`,
      `语言信号：${page.detectedLanguageSignals?.join("、") || "未检测"}`
    ].join("\n")
  );
  writeCompactList(doc, "页面样本", pageLines, 4);

  const botLines = report.botAccessChecks.map(
    (check) =>
      `${check.label}：${check.status ?? "失败"} · ${check.blockedSignal ? "疑似存在拦截信号" : "未见明显拦截"}${check.challengeProvider && check.challengeProvider !== "未识别" ? ` · ${check.challengeProvider}` : ""}${check.challengeSignals?.length ? ` · ${check.challengeSignals.join("；")}` : ""}`
  );
  writeCompactList(doc, "Bot 防护外部初筛", botLines, 4);

  drawConversionCta(doc, report);

  sectionHeading(doc, "报告边界");
  doc.font("ReportFont").fontSize(8.6).fillColor(COLORS.muted).text(report.disclaimer, {
    width: contentWidth(doc),
    lineGap: 3
  });
}

function drawConversionCta(doc: PDFKit.PDFDocument, report: DiagnosticReport) {
  const cta = report.conversionCta ?? {
    title: "下一步：预约 AI 搜索竞品深度诊断",
    description: "继续查看 ChatGPT / Perplexity 是否推荐你和竞品，以及 AI 为什么引用竞品。",
    bullets: ["竞品 AI 可见性对比", "Prompt / Citation 分析", "内容改造路线图和复测计划"]
  };
  sectionHeading(doc, cta.title, "免费报告之后的建议动作。");
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const body = [cta.description, ...cta.bullets.map((item) => `• ${item}`)].join("\n");
  const height = Math.max(110, textHeight(doc, body, width - 28, { size: 8.8, lineGap: 3 }) + 32);
  ensureSpace(doc, height + 8);
  const y = doc.y;
  roundedPanel(doc, x, y, width, height, COLORS.bluePanel, "#c9d9fb");
  doc.font("ReportFont").fontSize(8.8).fillColor(COLORS.text).text(body, x + 14, y + 16, {
    width: width - 28,
    lineGap: 3
  });
  doc.y = y + height + 8;
}

function writeCompactList(doc: PDFKit.PDFDocument, title: string, items: string[], maxItems: number) {
  sectionHeading(doc, title);
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  items.slice(0, maxItems).forEach((item) => {
    const height = Math.max(28, textHeight(doc, item, width - 18, { size: 8.3, lineGap: 2 }) + 12);
    ensureSpace(doc, height + 3);
    const y = doc.y;
    doc.moveTo(x, y).lineTo(x + width, y).strokeColor(COLORS.softLine).lineWidth(0.5).stroke();
    doc.circle(x + 4, y + 13, 2).fillColor(COLORS.primary).fill();
    doc.font("ReportFont").fontSize(8.3).fillColor(COLORS.text).text(item, x + 16, y + 7, {
      width: width - 18,
      lineGap: 2
    });
    doc.y = y + height + 2;
  });
}

function writePageNumbers(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc
      .font("ReportFont")
      .fontSize(7.6)
      .fillColor(COLORS.muted)
      .text(`URL-only GEO Readiness Grader · ${i + 1} / ${range.count}`, PAGE.margin, PAGE.height - 26, {
        width: PAGE.width - PAGE.margin * 2,
        align: "center"
      });
  }
}

export function reportPdfFilename(report: DiagnosticReport) {
  return `${safeFilename(report.websiteUrl) || "geo-readiness"}-geo-readiness.pdf`;
}

export async function renderReportPdf(report: DiagnosticReport) {
  const doc = createDoc();
  const chunks: Buffer[] = [];

  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawHeader(doc, report);
  drawHero(doc, report);
  drawMetricStrip(doc, report);
  drawBusinessSummary(doc, report);
  drawFixes(doc, report);
  drawRiskRows(doc, report);
  drawTechnicalDetails(doc, report);
  writePageNumbers(doc);
  doc.end();

  return result;
}
