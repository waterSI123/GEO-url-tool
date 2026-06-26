# URL-only GEO Readiness Grader

内部 MVP 工具。用户只输入官网 URL，系统自动检测网站是否具备被 AI 搜索抓取、理解、引用的基础条件，并生成一份可打印为 PDF 的大白话诊断报告。

## 能力范围

- robots.txt 检测：GPTBot、OAI-SearchBot、ChatGPT-User、Googlebot、Google-Extended、Bingbot。
- 页面可索引性检测：HTTP 状态、noindex、canonical、title、description、H1。
- sitemap 检测：是否存在、是否在 robots.txt 声明、URL 数量、lastmod。
- 内容可抽取性检测：答案段、问答句式、details/summary 语义 FAQ、Microdata、列表/表格、JSON-LD schema。
- 多语言信号检测：html lang、hreflang，以及日语、德语等出海常见语言内容信号。
- 可信度检测：Organization/Product/FAQ/Article schema、About、Contact、Privacy、客户案例信号。
- Bot/WAF 外部初筛：模拟常见 crawler User-Agent 访问首页，并识别 Cloudflare、阿里云、Akamai、AWS WAF、DataDome 等疑似 CDN/WAF 挑战页。
- 报告导出：报告页点击“下载 PDF”，服务端直接生成并下载 PDF 文件。

## 本地启动

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。

## 注意

这个工具是 URL-only 外部体检，不承诺 GPT/Gemini 实时排名，也不需要 OpenAI/Gemini API Key。WAF/Bot 判断只能做外部初筛，完整判断需要客户提供 CDN/WAF 或服务器日志。
