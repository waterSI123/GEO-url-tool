import { NextResponse } from "next/server";
import { createJob, getBundle } from "@/lib/db";
import { normalizeUrl } from "@/lib/http";
import { runDiagnostic } from "@/lib/diagnostic";
import type { DiagnosticInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validate(payload: Record<string, unknown>): DiagnosticInput {
  const websiteUrl = cleanText(payload.websiteUrl);
  if (!websiteUrl) throw new Error("请填写网站 URL");

  let normalizedUrl = "";
  try {
    normalizedUrl = normalizeUrl(websiteUrl);
  } catch {
    throw new Error("网站 URL 格式不正确");
  }

  return {
    websiteUrl: normalizedUrl
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const input = validate(payload);
    const job = createJob(input);
    await runDiagnostic(job.id);

    const bundle = getBundle(job.id);

    return NextResponse.json({
      jobId: job.id,
      status: "completed",
      reportUrl: `/report/${job.id}`,
      bundle
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "创建诊断任务失败"
      },
      { status: 400 }
    );
  }
}
