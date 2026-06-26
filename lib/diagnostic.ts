import { getJob, saveReport, saveSiteSnapshot, updateJob } from "./db";
import { buildReport } from "./report";
import { crawlWebsite } from "./site";

const runningJobs = new Set<string>();

export async function runDiagnostic(jobId: string) {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);

  try {
    const job = getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    updateJob(jobId, {
      status: "running",
      progress: 8,
      currentStep: "正在读取 robots.txt、sitemap 和首页..."
    });

    const snapshot = await crawlWebsite(job.websiteUrl);
    saveSiteSnapshot(jobId, snapshot);

    updateJob(jobId, {
      progress: 78,
      currentStep: "正在计算 GEO readiness 风险分..."
    });

    const report = buildReport(jobId, snapshot);
    saveReport(report);

    updateJob(jobId, {
      status: "completed",
      progress: 100,
      currentStep: "URL-only GEO 诊断报告已生成"
    });
  } catch (error) {
    updateJob(jobId, {
      status: "failed",
      progress: 100,
      currentStep: "诊断失败",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  } finally {
    runningJobs.delete(jobId);
  }
}

export function startDiagnosticJob(jobId: string) {
  setTimeout(() => {
    runDiagnostic(jobId).catch((error) => {
      updateJob(jobId, {
        status: "failed",
        progress: 100,
        currentStep: "诊断失败",
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    });
  }, 0);
}
