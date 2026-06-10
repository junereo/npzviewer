import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const python = process.env.PYTHON_BIN ?? "C:\\Users\\korea\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

const samplePly = `ply
format ascii 1.0
element vertex 7
property float x
property float y
property float z
property float opacity
property float scale_0
property float scale_1
property float scale_2
end_header
0.00 0.00 0.00 4.0 -4.0 -4.0 -4.0
0.01 0.00 0.00 4.0 -4.0 -4.0 -4.0
0.00 0.01 0.00 4.0 -4.0 -4.0 -4.0
0.01 0.01 0.00 4.0 -4.0 -4.0 -4.0
5.00 5.00 5.00 4.0 -4.0 -4.0 -4.0
0.02 0.02 0.00 -10.0 -4.0 -4.0 -4.0
0.03 0.03 0.00 4.0 3.0 3.0 3.0
`;

test("clean_ply helper emits stage progress with remaining point counts", () => {
  const dir = mkdtempSync(join(tmpdir(), "ply-progress-helper-"));
  const inputPath = join(dir, "input.ply");
  const outputPath = join(dir, "cleaned.ply");
  writeFileSync(inputPath, samplePly, "utf8");

  const result = spawnSync(
    python,
    [
      "server/python/clean_ply.py",
      inputPath,
      outputPath,
      "--progress",
      "--opacity-threshold",
      "0.01",
      "--scale-quantile",
      "0.85",
      "--eps",
      "0.05",
      "--min-samples",
      "2",
      "--min-cluster-ratio",
      "0",
      "--no-sor",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  const events = result.stderr
    .split(/\r?\n/)
    .filter((line) => line.startsWith("PROGRESS "))
    .map((line) => JSON.parse(line.slice("PROGRESS ".length)));

  assert.deepEqual(
    events.map((event) => event.step),
    ["loaded", "opacity", "scale", "sor", "dbscan", "writing", "complete"],
  );
  assert.equal(events[0].inputPoints, 7);
  assert.equal(events[1].outputPoints, 6);
  assert.equal(events[2].outputPoints, 5);
  assert.equal(events[4].outputPoints, 4);
});
