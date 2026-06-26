"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiagnosticBundle, DiagnosticReport, RiskLevel } from "@/lib/types";

type LoadState = "loading" | "ready" | "failed";

function scoreTone(score: number) {
  if (score >= 76) return "var(--good)";
  if (score >= 51) return "#b45309";
  return "var(--danger)";
}

function levelLabel(level: RiskLevel) {
  if (level === "good") return "健康";
  if (level === "warning") return "需复核";
  if (level === "danger") return "高风险";
  return "信息";
}

function statusText(status: number | null) {
  return status === null ? "失败" : String(status);
}

function downloadPdf(report: DiagnosticReport) {
  fetch(`/api/diagnostics/${report.jobId}/pdf`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report)
  })
    .then((res) => {
      if (!res.ok) throw new Error("PDF 生成失败");
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.websiteUrl.replace(/^https?:\/\//, "").replace(/[^a-z0-9.-]+/gi, "-")}-geo-readiness.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => {
      alert("PDF 下载失败，请重试");
    });
}

function ReportContent({ report }: { report: DiagnosticReport }) {
  const businessSummary = report.businessSummary ?? {
    biggestProblems: ["官网基础体检已完成，建议结合模块分数优先处理低分项。"],
    priorityActions: report.topFixes.slice(0, 3).map((fix) => fix.title)
  };
  const conversionCta = report.conversionCta ?? {
    title: "下一步：预约 AI 搜索竞品深度诊断",
    description: "继续查看 ChatGPT / Perplexity 是否推荐你和竞品，以及 AI 为什么引用竞品。",
    bullets: ["竞品 AI 可见性对比", "Prompt / Citation 分析", "内容改造路线图和复测计划"]
  };

  return (
    <main className="shell report-shell">
      <div className="report-header">
        <div>
          <h1>GEO Readiness 诊断报告</h1>
          <p>
            {report.websiteUrl} · 生成时间 {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
        <button className="secondary-btn no-print" type="button" onClick={() => downloadPdf(report)}>
          下载 PDF
        </button>
      </div>

      <section className="report-overview">
        <div className="overview-score">
          <span>Readiness Score</span>
          <strong style={{ color: scoreTone(report.overallScore) }}>{report.overallScore}</strong>
          <p>等级 {report.grade}</p>
        </div>
        <div className="overview-copy">
          <h2>{report.summaryTitle}</h2>
          <p>{report.executiveSummary}</p>
        </div>
        <div className="overview-metrics">
          <div>
            <strong>{report.riskSections.length}</strong>
            <span>风险模块</span>
          </div>
          <div>
            <strong>{report.topFixes.length}</strong>
            <span>优先修复</span>
          </div>
          <div>
            <strong>{report.pageSamples.length}</strong>
            <span>页面样本</span>
          </div>
        </div>
      </section>

      <section className="panel business-summary">
        <div>
          <span className="section-kicker">老板摘要</span>
          <h2>3 个最大问题</h2>
          <ol className="summary-list problem">
            {businessSummary.biggestProblems.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
        <div>
          <span className="section-kicker">下一步动作</span>
          <h2>3 个优先动作</h2>
          <ol className="summary-list action">
            {businessSummary.priorityActions.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </section>

      <div className="report-grid">
        <aside className="panel score-card">
          <h2>模块分数</h2>
          <div className="section-score-list">
            {report.riskSections.map((section) => (
              <a href={`#section-${section.id}`} key={section.id}>
                <span>{section.title}</span>
                <strong style={{ color: scoreTone(section.score) }}>{section.score}</strong>
              </a>
            ))}
          </div>
        </aside>

        <section>
          <div className="panel section">
            <h2>优先修复项</h2>
            <ol className="fix-list">
              {report.topFixes.map((fix) => (
                <li key={fix.title}>
                  <div>
                    <strong>{fix.title}</strong>
                    <p>{fix.whyItMatters}</p>
                    <span className="muted">
                      工作量：{fix.effort} · 建议负责人：{fix.ownerHint}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="risk-grid">
            {report.riskSections.map((section) => (
              <article className={`panel risk-card ${section.level}`} key={section.id} id={`section-${section.id}`}>
                <div className="risk-card-head">
                  <div>
                    <span className="badge">{levelLabel(section.level)}</span>
                    <h2>{section.title}</h2>
                  </div>
                  <strong style={{ color: scoreTone(section.score) }}>{section.score}</strong>
                </div>
                <p>{section.plainLanguage}</p>
                <h3>证据</h3>
                <ul className="compact-list">
                  {section.evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <h3>建议</h3>
                <ul className="compact-list">
                  {section.recommendations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="panel section">
            <h2>Robots 与 AI Crawler</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Crawler</th>
                  <th>结论</th>
                  <th>匹配规则</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {report.crawlerSummary.map((check) => (
                  <tr key={check.crawler}>
                    <td>{check.label}</td>
                    <td>{check.allowed ? "允许" : "存在限制"}</td>
                    <td>{check.matchedRule}</td>
                    <td>{check.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="table-note">提示：PDF 会使用单独排版，不会截断这些表格内容。</p>
          </div>

          <div className="panel section">
            <h2>Sitemap</h2>
            <div className="metric-grid">
              <div>
                <strong>{report.sitemap.accessible ? "可访问" : "未发现有效 URL"}</strong>
                <span>状态</span>
              </div>
              <div>
                <strong>{report.sitemap.urlCount}</strong>
                <span>URL 数量</span>
              </div>
              <div>
                <strong>{report.sitemap.lastmodCount}</strong>
                <span>lastmod</span>
              </div>
              <div>
                <strong>{report.sitemap.declaredInRobots ? "有" : "无"}</strong>
                <span>robots 声明</span>
              </div>
            </div>
            {report.sitemap.sampledUrls.length ? (
              <ul className="source-list">
                {report.sitemap.sampledUrls.slice(0, 8).map((url) => (
                  <li key={url}>{url}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">没有可展示的 sitemap URL 样本。</p>
            )}
          </div>

          <div className="panel section">
            <h2>页面样本</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>状态</th>
                  <th>Title / H1</th>
                  <th>索引</th>
                  <th>内容信号</th>
                  <th>Schema</th>
                </tr>
              </thead>
              <tbody>
                {report.pageSamples.map((page) => (
                  <tr key={page.finalUrl || page.url}>
                    <td className="url-cell">{page.finalUrl || page.url}</td>
                    <td>{statusText(page.status)}</td>
                    <td>
                      <strong>{page.title || "缺少 title"}</strong>
                      <br />
                      <span className="muted">{page.h1[0] || "缺少 H1"}</span>
                    </td>
                    <td>{page.noindex ? "noindex" : "可索引"}</td>
                    <td>
                      {page.wordCount} 词 · {page.answerBlockCount} 个答案段 ·{" "}
                      {page.questionAnswerPairCount ?? 0} 个问答对 ·{" "}
                      {page.faqSignal ? "有 FAQ" : "无 FAQ"}
                      <br />
                      <span className="muted">
                        details/summary：{page.semanticFaqCount ?? 0} ·{" "}
                        {page.productPageSignal ? "产品/方案页" : "缺产品页信号"} ·{" "}
                        {page.caseStudyPageSignal ? "案例页" : "缺案例页信号"} ·{" "}
                        {page.faqPageSignal ? "FAQ/帮助页" : "缺 FAQ 页信号"}
                      </span>
                      {(page.detectedLanguageSignals?.length ?? 0) > 0 ? (
                        <>
                          <br />
                          <span className="muted">语言信号：{page.detectedLanguageSignals.join("、")}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {page.jsonLdTypes.length ? page.jsonLdTypes.join(", ") : "无"}
                      {(page.microdataTypes?.length ?? 0) > 0 ? (
                        <>
                          <br />
                          <span className="muted">Microdata：{page.microdataTypes.join(", ")}</span>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="table-note">PDF 中页面样本会转为纵向信息块，避免长 URL 和 Schema 被遮挡。</p>
          </div>

          <div className="panel section">
            <h2>Bot 防护外部初筛</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>模拟访问</th>
                  <th>状态码</th>
                  <th>拦截信号</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {report.botAccessChecks.map((check) => (
                  <tr key={check.label}>
                    <td>{check.label}</td>
                    <td>{statusText(check.status)}</td>
                    <td>
                      {check.blockedSignal ? "疑似存在" : "未见明显信号"}
                      {check.challengeProvider && check.challengeProvider !== "未识别" ? (
                        <>
                          <br />
                          <span className="muted">{check.challengeProvider}</span>
                        </>
                      ) : null}
                    </td>
                    <td>{check.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel section conversion-panel">
            <span className="section-kicker">转化建议</span>
            <h2>{conversionCta.title}</h2>
            <p>{conversionCta.description}</p>
            <ul className="compact-list">
              {conversionCta.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="panel section cta">
            <h2>报告边界</h2>
            <p>{report.disclaimer}</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusView({ bundle }: { bundle: DiagnosticBundle | null }) {
  const job = bundle?.job;
  const status = job?.currentStep ?? "正在读取任务状态...";
  const progress = job?.progress ?? 4;

  return (
    <main className="shell report-shell">
      <div className="panel status-panel">
        <span className="badge">{job?.status === "failed" ? "诊断失败" : "诊断进行中"}</span>
        <h1>{job?.websiteUrl ?? "GEO Readiness 诊断"}</h1>
        <p className="muted">{status}</p>
        <div className="progress-track" aria-label="诊断进度">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <p className="muted">{progress}%</p>
        {job?.errorMessage ? <p className="error">{job.errorMessage}</p> : null}
      </div>
    </main>
  );
}

export default function ReportClient({ jobId }: { jobId: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [bundle, setBundle] = useState<DiagnosticBundle | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const cached = sessionStorage.getItem(`geo_report_${jobId}`);
        if (cached) {
          sessionStorage.removeItem(`geo_report_${jobId}`);
          const payload = JSON.parse(cached);
          if (!alive) return;
          setBundle(payload);
          if (payload.job?.status === "completed") {
            setState("ready");
            return;
          }
          if (payload.job?.status === "failed") {
            setState("failed");
            return;
          }
        }

        const response = await fetch(`/api/diagnostics/${jobId}`, {
          cache: "no-store"
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "读取报告失败");
        if (!alive) return;
        setBundle(payload);
        if (payload.job?.status === "completed") {
          setState("ready");
          return;
        }
        if (payload.job?.status === "failed") {
          setState("failed");
          return;
        }
        setState("loading");
        timer = setTimeout(load, 3000);
      } catch (loadError) {
        if (!alive) return;
        setError(loadError instanceof Error ? loadError.message : "读取报告失败");
        setState("failed");
      }
    }

    load();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  const report = useMemo(() => bundle?.report ?? null, [bundle]);

  if (state === "ready" && report) return <ReportContent report={report} />;
  if (state === "failed") {
    return (
      <main className="shell report-shell">
        <div className="panel status-panel">
          <span className="badge">诊断失败</span>
          <h1>报告暂时无法生成</h1>
          <p className="error">{error || bundle?.job?.errorMessage || "请检查目标网站是否可访问。"}</p>
        </div>
      </main>
    );
  }

  return <StatusView bundle={bundle} />;
}
