import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const python = process.env.PYTHON_BIN ?? "C:\\Users\\korea\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

const samplePly = `ply
format ascii 1.0
element vertex 4
property float x
property float y
property float z
property float opacity
property float scale_0
property float scale_1
property float scale_2
property float rot_0
property float rot_1
property float rot_2
property float rot_3
property float f_dc_0
property float f_dc_1
property float f_dc_2
end_header
0 0 0 4 -4 -4 -4 1 0 0 0 0.2 0.1 0.0
1 0 0 4 -4 -4 -4 1 0 0 0 0.0 0.2 0.1
0 1 0 4 -4 -4 -4 1 0 0 0 0.1 0.0 0.2
0 0 1 4 -4 -4 -4 1 0 0 0 0.2 0.2 0.2
`;

test("convert_3dgs_viewer creates manifest and chunk for Gaussian attributes", () => {
  const dir = mkdtempSync(join(tmpdir(), "ply-viewer-converter-"));
  const inputPath = join(dir, "input.ply");
  const outputDir = join(dir, "viewer");
  mkdirSync(outputDir);
  writeFileSync(inputPath, samplePly, "utf8");

  const result = spawnSync(python, ["server/python/convert_3dgs_viewer.py", inputPath, outputDir, "--max-points", "4", "--progress"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const manifestPath = join(outputDir, "viewer-manifest.json");
  const chunkPath = join(outputDir, "chunks", "chunk_000.bin");
  assert.equal(existsSync(manifestPath), true);
  assert.equal(existsSync(chunkPath), true);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.pointCount, 4);
  assert.equal(manifest.attributes.position.itemSize, 3);
  assert.equal(manifest.attributes.color.itemSize, 3);
  assert.equal(manifest.attributes.opacity.itemSize, 1);
  assert.equal(manifest.attributes.scale.itemSize, 3);
  assert.deepEqual(manifest.bounds.min, [0, 0, 0]);
  assert.deepEqual(manifest.bounds.max, [1, 1, 1]);
  assert.equal(manifest.chunks[0].pointCount, 4);
  assert.match(result.stderr, /PROGRESS .*"step": "complete"/);
});
