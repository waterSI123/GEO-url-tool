import { NextResponse } from "next/server";
import { getBundle } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const params = await context.params;
  const bundle = getBundle(params.jobId);

  if (!bundle.job) {
    return NextResponse.json({ error: "诊断任务不存在" }, { status: 404 });
  }

  return NextResponse.json(bundle);
}
