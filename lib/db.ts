import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DiagnosticBundle,
  DiagnosticInput,
  DiagnosticJob,
  DiagnosticReport,
  SiteSnapshot
} from "./types";

type Statement = {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
};

type Database = {
  exec: (sql: string) => void;
  prepare: (sql: string) => Statement;
};

let db: Database | null = null;
let useMemory = false;

const memJobs = new Map<string, DiagnosticJob>();
const memSnapshots = new Map<string, SiteSnapshot>();
const memReports = new Map<string, DiagnosticReport>();

function dataPath() {
  const base = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "data");
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, "readiness.sqlite");
}

function now() {
  return new Date().toISOString();
}

function toJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function fromJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function init(database: Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS readiness_jobs (
      id TEXT PRIMARY KEY,
      websiteUrl TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL,
      currentStep TEXT NOT NULL,
      errorMessage TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS site_snapshots (
      jobId TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS readiness_reports (
      jobId TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
}

export function getDb() {
  if (useMemory) return null;
  if (!db) {
    try {
      const { DatabaseSync } = require("node:sqlite") as {
        DatabaseSync: new (filename: string) => Database;
      };
      db = new DatabaseSync(dataPath());
      init(db);
    } catch {
      useMemory = true;
      return null;
    }
  }
  return db;
}

function jobFromRow(row: Record<string, unknown> | undefined): DiagnosticJob | null {
  if (!row) return null;
  return {
    id: String(row.id),
    websiteUrl: String(row.websiteUrl),
    status: row.status as DiagnosticJob["status"],
    progress: Number(row.progress),
    currentStep: String(row.currentStep),
    errorMessage: String(row.errorMessage),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

export function createJob(input: DiagnosticInput): DiagnosticJob {
  const id = `geo_${randomUUID().slice(0, 8)}`;
  const timestamp = now();

  const database = getDb();
  if (database) {
    database
      .prepare(
        `INSERT INTO readiness_jobs
          (id, websiteUrl, status, progress, currentStep, errorMessage, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.websiteUrl, "pending", 0, "等待开始诊断", "", timestamp, timestamp);
    const job = getJob(id);
    if (!job) throw new Error("Failed to create readiness job");
    return job;
  }

  const job: DiagnosticJob = {
    id,
    websiteUrl: input.websiteUrl,
    status: "pending",
    progress: 0,
    currentStep: "等待开始诊断",
    errorMessage: "",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  memJobs.set(id, job);
  return job;
}

export function getJob(jobId: string): DiagnosticJob | null {
  const database = getDb();
  if (database) {
    const row = database.prepare("SELECT * FROM readiness_jobs WHERE id = ?").get(jobId);
    return jobFromRow(row);
  }
  return memJobs.get(jobId) ?? null;
}

export function updateJob(
  jobId: string,
  patch: Partial<Pick<DiagnosticJob, "status" | "progress" | "currentStep" | "errorMessage">>
) {
  const current = getJob(jobId);
  if (!current) return;

  const database = getDb();
  if (database) {
    database
      .prepare(
        `UPDATE readiness_jobs
         SET status = ?, progress = ?, currentStep = ?, errorMessage = ?, updatedAt = ?
         WHERE id = ?`
      )
      .run(
        patch.status ?? current.status,
        patch.progress ?? current.progress,
        patch.currentStep ?? current.currentStep,
        patch.errorMessage ?? current.errorMessage,
        now(),
        jobId
      );
  } else {
    memJobs.set(jobId, {
      ...current,
      status: patch.status ?? current.status,
      progress: patch.progress ?? current.progress,
      currentStep: patch.currentStep ?? current.currentStep,
      errorMessage: patch.errorMessage ?? current.errorMessage,
      updatedAt: now()
    });
  }
}

export function saveSiteSnapshot(jobId: string, snapshot: SiteSnapshot) {
  const database = getDb();
  if (database) {
    database
      .prepare(
        `INSERT INTO site_snapshots (jobId, payload, updatedAt)
         VALUES (?, ?, ?)
         ON CONFLICT(jobId) DO UPDATE SET payload = excluded.payload, updatedAt = excluded.updatedAt`
      )
      .run(jobId, toJson(snapshot), now());
  } else {
    memSnapshots.set(jobId, snapshot);
  }
}

export function getSiteSnapshot(jobId: string): SiteSnapshot | null {
  const database = getDb();
  if (database) {
    const row = database.prepare("SELECT payload FROM site_snapshots WHERE jobId = ?").get(jobId);
    return row ? fromJson<SiteSnapshot>(row.payload, null as unknown as SiteSnapshot) : null;
  }
  return memSnapshots.get(jobId) ?? null;
}

export function saveReport(report: DiagnosticReport) {
  const database = getDb();
  if (database) {
    database
      .prepare(
        `INSERT INTO readiness_reports (jobId, payload, createdAt)
         VALUES (?, ?, ?)
         ON CONFLICT(jobId) DO UPDATE SET payload = excluded.payload, createdAt = excluded.createdAt`
      )
      .run(report.jobId, toJson(report), now());
  } else {
    memReports.set(report.jobId, report);
  }
}

export function getReport(jobId: string): DiagnosticReport | null {
  const database = getDb();
  if (database) {
    const row = database.prepare("SELECT payload FROM readiness_reports WHERE jobId = ?").get(jobId);
    return row ? fromJson<DiagnosticReport>(row.payload, null as unknown as DiagnosticReport) : null;
  }
  return memReports.get(jobId) ?? null;
}

export function getBundle(jobId: string): DiagnosticBundle {
  return {
    job: getJob(jobId),
    snapshot: getSiteSnapshot(jobId),
    report: getReport(jobId)
  };
}
