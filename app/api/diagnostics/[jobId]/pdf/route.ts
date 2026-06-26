import { NextResponse } from "next/server";
import { getReport } from "@/lib/db";
import { renderReportPdf, reportPdfFilename } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const params = await context.params;
  const report = getReport(params.jobId);

  if (!report) {
    return NextResponse.json({ error: "报告不存在或尚未生成" }, { status: 404 });
  }

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
