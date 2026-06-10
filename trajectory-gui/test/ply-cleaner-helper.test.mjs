import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
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
property float f_dc_0
end_header
0.00 0.00 0.00 4.0 -4.0 -4.0 -4.0 10
0.01 0.00 0.00 4.0 -4.0 -4.0 -4.0 11
0.00 0.01 0.00 4.0 -4.0 -4.0 -4.0 12
0.01 0.01 0.00 4.0 -4.0 -4.0 -4.0 13
5.00 5.00 5.00 4.0 -4.0 -4.0 -4.0 99
0.02 0.02 0.00 -10.0 -4.0 -4.0 -4.0 77
0.03 0.03 0.00 4.0 3.0 3.0 3.0 88
`;

test("clean_ply helper writes cleaned PLY and JSON stats", () => {
  const dir = mkdtempSync(join(tmpdir(), "ply-cleaner-helper-"));
  const inputPath = join(dir, "input.ply");
  const outputPath = join(dir, "cleaned.ply");
  writeFileSync(inputPath, samplePly, "utf8");

  const result = spawnSync(
    python,
    [
      "server/python/clean_ply.py",
      inputPath,
      outputPath,
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
  assert.equal(existsSync(outputPath), true);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.inputPoints, 7);
  assert.equal(payload.outputPoints, 4);
  assert.equal(payload.removedOpacity, 1);
});
