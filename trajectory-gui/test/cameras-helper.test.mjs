import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const python = process.env.PYTHON_BIN ?? "C:\\Users\\korea\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

test("inspect_cameras summarizes cameras.npz overlay sets with direction and fov", () => {
  const result = spawnSync(python, ["server/python/inspect_cameras.py", "C:\\Users\\korea\\Desktop\\15_gs_ours\\cameras.npz"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.sets.some((set) => set.key === "w2c_render" && set.frameCount > 0), true);
  assert.equal(payload.sets.some((set) => set.key === "w2c_da3" && set.frameCount > 0), true);
  const render = payload.sets.find((set) => set.key === "w2c_render");
  assert.equal(render.frames[0].center.length, 3);
  assert.equal(render.frames[0].forward.length, 3);
  assert.equal(render.fov.horizontalDeg > 40, true);
  assert.equal(render.fov.verticalDeg > 40, true);
});
