"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/diagnostics", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ websiteUrl })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "创建诊断任务失败");
      if (payload.bundle) {
        sessionStorage.setItem(`geo_report_${payload.jobId}`, JSON.stringify(payload.bundle));
      }
      router.push(payload.reportUrl);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "创建诊断任务失败");
      setLoading(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <div className="brand-lockup">
            <strong>URL-only GEO Readiness Grader</strong>
            <span>海外 AI 搜索可见性基础体检</span>
          </div>
          <div className="topbar-actions">
            <span className="badge">只需官网 URL</span>
            <span className="badge subtle">无需 API Key</span>
          </div>
        </div>
      </header>

      <main className="shell app-shell">
        <section className="diagnostic-console">
          <div className="console-copy">
            <div className="eyebrow">GEO Readiness Audit</div>
            <h1>判断网站是否已经准备好被 AI 搜索看见。</h1>
            <p className="lead">
              只输入官网 URL，自动检查抓取入口、索引信号、页面发现、内容可抽取性、
              实体可信度和 Bot 防护初筛，输出一份可直接发给客户的诊断报告。
            </p>
          </div>
          <form onSubmit={onSubmit}>
            <label className="search-label" htmlFor="websiteUrl">
              官网 URL
            </label>
            <div className="url-submit">
              <input
                id="websiteUrl"
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
                placeholder="https://example.com"
                required
              />
              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? "正在诊断中..." : "生成报告"}
              </button>
            </div>
            <p className="form-hint">可以不带 https://。报告生成后支持直接下载 PDF 文件。</p>
            {error ? <p className="error">{error}</p> : null}
          </form>
        </section>

        <section className="signal-board" aria-label="诊断模块">
          <div className="signal-item">
            <span>01</span>
            <strong>抓取入口</strong>
            <p>robots.txt、AI crawler 规则、首页访问和跳转。</p>
          </div>
          <div className="signal-item">
            <span>02</span>
            <strong>索引基础</strong>
            <p>状态码、noindex、canonical、title、description、H1。</p>
          </div>
          <div className="signal-item">
            <span>03</span>
            <strong>页面发现</strong>
            <p>sitemap、lastmod、核心页面样本和 URL 可发现性。</p>
          </div>
          <div className="signal-item">
            <span>04</span>
            <strong>AI 理解</strong>
            <p>答案段、问答句式、details/summary、Microdata、多语言页面和 Schema。</p>
          </div>
          <div className="signal-item">
            <span>05</span>
            <strong>可信信号</strong>
            <p>公司信息、联系方式、认证资质、客户 Logo、社媒和外部资料页。</p>
          </div>
          <div className="signal-item">
            <span>06</span>
            <strong>Bot 初筛</strong>
            <p>模拟常见 crawler 访问，提示 Cloudflare、阿里云等 CDN/WAF 挑战页风险。</p>
          </div>
        </section>
      </main>
    </>
  );
}
