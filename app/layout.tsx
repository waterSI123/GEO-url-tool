import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "URL-only GEO Readiness Grader",
  description: "只输入官网 URL，检测网站是否具备被 AI 搜索抓取、理解和引用的基础条件。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
