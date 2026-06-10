import express from "express";
import multer from "multer";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 256 * 1024 * 1024 } });
const plyUpload = multer({
  storage: multer.diskStorage({
    destination: tmpdir(),
    filename: (_req, file, callback) => {
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      callback(null, `trajectory-gui-ply-${suffix}-${safeFileName(file.originalname || "input.ply")}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 * 1024 },
});
const port = Number(process.env.PORT ?? 4174);
const pythonBin =
  process.env.PYTHON_BIN ??
  "C:\\Users\\korea\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

app.use(express.json({ limit: "100mb" }));

type PlyJobPhase = "waiting" | "uploading" | "uploaded" | "processing" | "downloading" | "complete" | "error";

type PlyJob = {
  jobId: string;
  phase: PlyJobPhase;
  message: string;
  startedAt: number;
  updatedAt: number;
  uploadedBytes?: number;
  totalBytes?: number;
  step?: string;
  inputPoints?: number;
  outputPoints?: number;
  removedPoints?: number;
  eps?: number | null;
  stats?: unknown;
  clients: Set<express.Response>;
};

const plyJobs = new Map<string, PlyJob>();

const plyCleanOptionsSchema = z.object({
  preset: z.enum(["light", "medium", "strong"]).default("light"),
  opacityThreshold: z.coerce.number().min(0).max(1).default(0.01),
  scaleQuantile: z.coerce.number().gt(0).lt(1).default(0.995),
  epsRatio: z.coerce.number().gt(0).default(0.004),
  eps: z.coerce.number().gt(0).optional(),
  minSamples: z.coerce.number().int().min(2).max(200).default(8),
  minClusterRatio: z.coerce.number().min(0).max(1).default(0.0005),
  enableSor: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  sorNeighbors: z.coerce.number().int().min(2).max(200).default(12),
  sorStdRatio: z.coerce.number().gt(0).max(10).default(2),
});

app.post("/api/trajectory/inspect", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "file is required" });
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), "trajectory-gui-"));
    const npzPath = join(dir, "trajectory.npz");
    await writeFile(npzPath, req.file.buffer);
    const payload = await runPythonJson("server/python/inspect_npz.py", [npzPath]);
    await rm(dir, { recursive: true, force: true });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/cameras/inspect", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "file is required" });
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), "trajectory-gui-cameras-"));
    const npzPath = join(dir, "cameras.npz");
    await writeFile(npzPath, req.file.buffer);
    const payload = await runPythonJson("server/python/inspect_cameras.py", [npzPath]);
    await rm(dir, { recursive: true, force: true });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/vipe/inspect", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "file is required" });
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), "trajectory-gui-vipe-"));
    const npzPath = join(dir, "vipe_predictions.npz");
    await writeFile(npzPath, req.file.buffer);
    const payload = await runPythonJson("server/python/inspect_vipe.py", [npzPath]);
    await rm(dir, { recursive: true, force: true });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get("/api/ply/jobs/:jobId/events", (req, res) => {
  const jobId = req.params.jobId;
  const job = ensurePlyJob(jobId);
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  job.clients.add(res);
  sendPlyJobEvent(res, job);
  const keepAlive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 15_000);
  req.on("close", () => {
    clearInterval(keepAlive);
    job.clients.delete(res);
  });
});

app.post("/api/ply/clean", trackPlyUploadProgress, plyUpload.single("file"), async (req, res, next) => {
  let dir: string | null = null;
  let inputPath: string | null = null;
  const jobId = getPlyJobId(req);
  try {
    if (!req.file) {
      updatePlyJob(jobId, { phase: "error", message: "No file was received." });
      res.status(400).json({ error: "file is required" });
      return;
    }
    if (!("path" in req.file) || !req.file.path) {
      updatePlyJob(jobId, { phase: "error", message: "Uploaded file path is missing." });
      res.status(400).json({ error: "uploaded file path is missing" });
      return;
    }
    const options = plyCleanOptionsSchema.parse(req.body);
    updatePlyJob(jobId, { phase: "uploaded", message: "Upload finished. Preparing Python cleaner." });
    dir = await mkdtemp(join(tmpdir(), "trajectory-gui-ply-"));
    const outputPath = join(dir, cleanedPlyName(req.file.originalname));
    inputPath = req.file.path;

    const args = [
      inputPath,
      outputPath,
      "--preset",
      options.preset,
      "--opacity-threshold",
      String(options.opacityThreshold),
      "--scale-quantile",
      String(options.scaleQuantile),
      "--eps-ratio",
      String(options.epsRatio),
      "--min-samples",
      String(options.minSamples),
      "--min-cluster-ratio",
      String(options.minClusterRatio),
      "--sor-neighbors",
      String(options.sorNeighbors),
      "--sor-std-ratio",
      String(options.sorStdRatio),
      "--progress",
    ];
    if (options.eps !== undefined) {
      args.push("--eps", String(options.eps));
    }
    if (!options.enableSor) {
      args.push("--no-sor");
    }

    updatePlyJob(jobId, { phase: "processing", message: "Python cleaner is filtering opacity, scale, SOR, and DBSCAN." });
    const stats = await runPythonJson("server/python/clean_ply.py", args, (event) => {
      updatePlyJob(jobId, {
        phase: "processing",
        message: typeof event.message === "string" ? event.message : "Python cleaner is running.",
        step: typeof event.step === "string" ? event.step : undefined,
        inputPoints: typeof event.inputPoints === "number" ? event.inputPoints : undefined,
        outputPoints: typeof event.outputPoints === "number" ? event.outputPoints : undefined,
        removedPoints: typeof event.removedPoints === "number" ? event.removedPoints : undefined,
        eps: typeof event.eps === "number" ? event.eps : null,
      });
    });
    updatePlyJob(jobId, { phase: "downloading", message: "Cleaned PLY is ready. Streaming the download.", stats });
    res.setHeader("content-type", "application/octet-stream");
    res.setHeader("x-ply-clean-stats", encodeURIComponent(JSON.stringify(stats)));
    res.download(outputPath, cleanedPlyName(req.file.originalname), async (error) => {
      await cleanupPlyFiles(inputPath, dir);
      if (error && !res.headersSent) {
        updatePlyJob(jobId, { phase: "error", message: error.message });
        next(error);
        return;
      }
      updatePlyJob(jobId, { phase: "complete", message: "Cleaned PLY download finished.", stats });
      schedulePlyJobCleanup(jobId);
    });
  } catch (error) {
    await cleanupPlyFiles(inputPath, dir);
    updatePlyJob(jobId, { phase: "error", message: error instanceof Error ? error.message : String(error) });
    schedulePlyJobCleanup(jobId);
    next(error);
  }
});

app.post("/api/trajectory/export", async (req, res, next) => {
  try {
    const dir = await mkdtemp(join(tmpdir(), "trajectory-gui-"));
    const jsonPath = join(dir, "trajectory.json");
    const npzPath = join(dir, "trajectory.npz");
    await writeFile(jsonPath, JSON.stringify(req.body), "utf8");
    await runPythonJson("server/python/write_npz.py", [jsonPath, npzPath]);
    const data = await readFile(npzPath);
    await rm(dir, { recursive: true, force: true });
    res.setHeader("content-type", "application/octet-stream");
    res.setHeader("content-disposition", 'attachment; filename="trajectory.npz"');
    res.send(data);
  } catch (error) {
    next(error);
  }
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: error.message });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Trajectory API listening on http://127.0.0.1:${port}`);
});

function runPythonJson(script: string, args: string[], onProgress?: (event: Record<string, unknown>) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [script, ...args], { cwd: process.cwd(), windowsHide: true });
    let stdout = "";
    let stderr = "";
    let stderrLineBuffer = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderrLineBuffer += chunk.toString();
      const lines = stderrLineBuffer.split(/\r?\n/);
      stderrLineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("PROGRESS ")) {
          try {
            onProgress?.(JSON.parse(line.slice("PROGRESS ".length)) as Record<string, unknown>);
          } catch {
            stderr += `${line}\n`;
          }
        } else if (line.trim()) {
          stderr += `${line}\n`;
        }
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (stderrLineBuffer.trim()) {
        if (stderrLineBuffer.startsWith("PROGRESS ")) {
          try {
            onProgress?.(JSON.parse(stderrLineBuffer.slice("PROGRESS ".length)) as Record<string, unknown>);
          } catch {
            stderr += `${stderrLineBuffer}\n`;
          }
        } else {
          stderr += `${stderrLineBuffer}\n`;
        }
      }
      if (code !== 0) {
        reject(new Error(stderr || `Python exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function cleanedPlyName(fileName: string | undefined): string {
  const safeName = safeFileName(fileName || "input.ply");
  return safeName.toLowerCase().endsWith(".ply") ? safeName.replace(/\.ply$/i, "_cleaned.ply") : `${safeName}_cleaned.ply`;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^\w.-]+/g, "_");
}

async function cleanupPlyFiles(inputPath: string | null, outputDir: string | null): Promise<void> {
  await Promise.all([
    inputPath ? rm(inputPath, { force: true }) : Promise.resolve(),
    outputDir ? rm(outputDir, { recursive: true, force: true }) : Promise.resolve(),
  ]);
}

function trackPlyUploadProgress(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  const jobId = getPlyJobId(req);
  const totalBytes = Number(req.headers["content-length"] ?? 0) || undefined;
  let uploadedBytes = 0;
  let lastUpdate = 0;
  updatePlyJob(jobId, { phase: "uploading", message: "Uploading PLY to the local Node server.", totalBytes, uploadedBytes });
  req.on("data", (chunk: Buffer) => {
    uploadedBytes += chunk.length;
    const now = Date.now();
    if (now - lastUpdate > 250 || (totalBytes && uploadedBytes >= totalBytes)) {
      lastUpdate = now;
      updatePlyJob(jobId, { phase: "uploading", message: "Uploading PLY to the local Node server.", totalBytes, uploadedBytes });
    }
  });
  next();
}

function getPlyJobId(req: express.Request): string {
  const value = req.params.jobId ?? req.query.jobId;
  return typeof value === "string" && value ? value : "default";
}

function ensurePlyJob(jobId: string): PlyJob {
  const existing = plyJobs.get(jobId);
  if (existing) return existing;
  const job: PlyJob = {
    jobId,
    phase: "waiting",
    message: "Waiting for PLY upload.",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    clients: new Set(),
  };
  plyJobs.set(jobId, job);
  return job;
}

function updatePlyJob(
  jobId: string,
  patch: Partial<Omit<PlyJob, "jobId" | "startedAt" | "clients">>,
): void {
  const job = ensurePlyJob(jobId);
  Object.assign(job, patch, { updatedAt: Date.now() });
  for (const client of job.clients) {
    sendPlyJobEvent(client, job);
  }
}

function sendPlyJobEvent(res: express.Response, job: PlyJob): void {
  const { clients: _clients, ...payload } = job;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function schedulePlyJobCleanup(jobId: string): void {
  setTimeout(() => {
    const job = plyJobs.get(jobId);
    if (!job) return;
    for (const client of job.clients) {
      client.end();
    }
    plyJobs.delete(jobId);
  }, 30_000);
}
