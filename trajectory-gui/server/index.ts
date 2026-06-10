import express from "express";
import multer from "multer";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 256 * 1024 * 1024 } });
const port = Number(process.env.PORT ?? 4174);
const pythonBin =
  process.env.PYTHON_BIN ??
  "C:\\Users\\korea\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

app.use(express.json({ limit: "100mb" }));

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

function runPythonJson(script: string, args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [script, ...args], { cwd: process.cwd(), windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
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
