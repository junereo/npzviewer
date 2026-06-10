import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const python = process.env.PYTHON_BIN ?? "C:\\Users\\korea\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

test("inspect_npz summarizes Lyra trajectory files", () => {
  const result = spawnSync(python, ["server/python/inspect_npz.py", "C:\\Users\\korea\\Desktop\\15_gs_ours\\trajectory.npz"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.meta.frameCount, 500);
  assert.equal(payload.meta.imageWidth, 1280);
  assert.equal(payload.meta.imageHeight, 720);
  assert.equal(payload.frames.length, 500);
  assert.equal(payload.frames[0].w2c.length, 4);
  assert.equal(payload.frames[0].intrinsics.length, 3);
});

test("write_npz creates a Lyra-compatible file that inspect_npz can read", () => {
  const dir = mkdtempSync(join(tmpdir(), "trajectory-gui-"));
  const jsonPath = join(dir, "trajectory.json");
  const npzPath = join(dir, "trajectory.npz");
  writeFileSync(
    jsonPath,
    JSON.stringify({
      meta: { frameCount: 1, imageWidth: 1280, imageHeight: 720 },
      frames: [
        {
          w2c: [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
          ],
          intrinsics: [
            [804, 0, 640],
            [0, 804, 360],
            [0, 0, 1],
          ],
        },
      ],
    }),
    "utf8",
  );

  const write = spawnSync(python, ["server/python/write_npz.py", jsonPath, npzPath], { encoding: "utf8" });
  assert.equal(write.status, 0, write.stderr);

  const inspect = spawnSync(python, ["server/python/inspect_npz.py", npzPath], { encoding: "utf8" });
  assert.equal(inspect.status, 0, inspect.stderr);
  const payload = JSON.parse(inspect.stdout);
  assert.equal(payload.meta.frameCount, 1);
  assert.equal(payload.frames[0].intrinsics[0][0], 804);
});

