import ReportClient from "./report-client";

export default async function ReportPage({
  params
}: {
  params: Promise<{ jobId: string }>;
}) {
  const resolvedParams = await params;
  return <ReportClient jobId={resolvedParams.jobId} />;
}
