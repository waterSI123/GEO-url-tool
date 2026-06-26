import { NextResponse } from "next/server";
import { getReport } from "@/lib/db";
import { renderReportPdf, reportPdfFilename } from "@/lib/pdf";
import type { DiagnosticReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function generatePdfResponse(report: DiagnosticReport) {
  const pdf = await renderReportPdf(report);
  const filename = reportPdfFilename(report);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store"
    }
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const params = await context.params;
  const report = getReport(params.jobId);

  if (!report) {
    return NextResponse.json({ error: "报告不存在或尚未生成" }, { status: 404 });
  }

  return generatePdfResponse(report);
}

export async function POST(request: Request) {
  try {
    const report = (await request.json()) as DiagnosticReport;
    if (!report || !report.jobId || !report.websiteUrl) {
      return NextResponse.json({ error: "报告数据无效" }, { status: 400 });
    }
    return generatePdfResponse(report);
  } catch {
    return NextResponse.json({ error: "PDF 生成失败" }, { status: 500 });
  }
}
