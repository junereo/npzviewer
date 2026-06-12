import test from "node:test";
import assert from "node:assert/strict";
import { findNearestProjectedCenter, projectPointToScreen } from "../src/features/splat-editor/playcanvas/selection.mjs";

test("projectPointToScreen maps clip-space center to viewport center", () => {
  const projected = projectPointToScreen([0, 0, 0], identityMatrix(), { width: 800, height: 600 });

  assert.deepEqual(roundPoint(projected), { x: 400, y: 300, depth: 0 });
});

test("projectPointToScreen returns null for points behind the camera", () => {
  const matrix = identityMatrix();
  matrix[15] = -1;

  assert.equal(projectPointToScreen([0, 0, 0], matrix, { width: 800, height: 600 }), null);
});

test("findNearestProjectedCenter picks the closest center inside radius", () => {
  const centers = new Float32Array([
    -0.5, 0, 0,
    0.25, 0, 0,
    0.75, 0, 0,
  ]);

  const match = findNearestProjectedCenter(centers, identityMatrix(), { width: 800, height: 600 }, { x: 505, y: 302 }, 20);

  assert.equal(match?.index, 1);
  assert.equal(Math.abs(match.distancePx - Math.hypot(5, 2)) < 1e-9, true);
});

test("findNearestProjectedCenter returns null when no projected center is inside radius", () => {
  const centers = new Float32Array([0, 0, 0]);

  const match = findNearestProjectedCenter(centers, identityMatrix(), { width: 800, height: 600 }, { x: 50, y: 50 }, 10);

  assert.equal(match, null);
});

function identityMatrix() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function roundPoint(point) {
  return point ? { x: Math.round(point.x), y: Math.round(point.y), depth: Math.round(point.depth) } : null;
}
