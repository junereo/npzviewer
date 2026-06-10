import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const python = process.env.PYTHON_BIN ?? "C:\\Users\\korea\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

test("inspect_vipe summarizes VIPE predictions with frame matching and distance", () => {
  const result = spawnSync(python, ["server/python/inspect_vipe.py", "C:\\Users\\korea\\Desktop\\15_gs_ours\\vipe_predictions_15.npz"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.sets.some((set) => set.key === "w2c_vipe" && set.frameCount === 482), true);
  assert.equal(payload.sets.some((set) => set.key === "w2c_da3" && set.frameCount === 128), true);
  assert.equal(payload.hasDepth, false);
  assert.equal(payload.depth, null);
  const vipe = payload.sets.find((set) => set.key === "w2c_vipe");
  assert.equal(vipe.frames[0].sourceFrameIndex, 0);
  assert.equal(vipe.frames[1].cumulativeDistance > 0, true);
});

test("inspect_vipe attaches metric_depth stats to matching source frames", () => {
  const dir = mkdtempSync(join(tmpdir(), "vipe-depth-"));
  const npzPath = join(dir, "vipe_depth.npz");
  const create = spawnSync(
    python,
    [
      "-c",
      [
        "import numpy as np, sys",
        "w2c=np.tile(np.eye(4,dtype=np.float32),(2,1,1))",
        "w2c[1,2,3]=-1.0",
        "intr=np.tile(np.eye(3,dtype=np.float32),(2,1,1))",
        "depth=np.array([[[1,2],[0,4]],[[2,2],[2,6]]],dtype=np.float32)",
        "np.savez(sys.argv[1], frame_ids=np.array([10,12]), w2c_vipe=w2c, intrinsics_vipe=intr, indices_vipe=np.array([10,12]), fps=np.array([2],dtype=np.float32), metric_depth=depth)",
      ].join("; "),
      npzPath,
    ],
    { encoding: "utf8" },
  );
  assert.equal(create.status, 0, create.stderr);

  const result = spawnSync(python, ["server/python/inspect_vipe.py", npzPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.hasDepth, true);
  assert.equal(payload.depth.key, "metric_depth");
  assert.deepEqual(payload.depth.shape, [2, 2, 2]);
  assert.equal(payload.depth.frames[0].sourceFrameIndex, 10);
  assert.equal(Math.abs(payload.depth.frames[0].mean - 7 / 3) < 1e-6, true);
  assert.equal(payload.depth.frames[0].validRatio, 0.75);
  const vipe = payload.sets.find((set) => set.key === "w2c_vipe");
  assert.equal(vipe.frames[1].sourceFrameIndex, 12);
  assert.equal(vipe.frames[1].depthStats.mean, 3);
});
