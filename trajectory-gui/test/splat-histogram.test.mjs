import test from "node:test";
import assert from "node:assert/strict";
import { buildAxisHistogram, indicesInAxisRange, selectedBounds } from "../src/features/splat-editor/playcanvas/histogram.mjs";

test("buildAxisHistogram creates fixed bins over center axis values", () => {
  const centers = new Float32Array([0, 0, 0, 5, 0, 0, 10, 0, 0]);
  const histogram = buildAxisHistogram(centers, "x", 5);

  assert.equal(histogram.axis, "x");
  assert.equal(histogram.min, 0);
  assert.equal(histogram.max, 10);
  assert.deepEqual(histogram.bins.map((bin) => bin.count), [1, 0, 1, 0, 1]);
});

test("indicesInAxisRange returns centers within inclusive range", () => {
  const centers = new Float32Array([0, 0, 0, 5, 0, 0, 10, 0, 0]);

  assert.deepEqual(indicesInAxisRange(centers, "x", 4.9, 10), [1, 2]);
});

test("selectedBounds returns min and max for selected center indices", () => {
  const centers = new Float32Array([0, 1, 2, 5, 6, 7, -1, 3, 9]);

  assert.deepEqual(selectedBounds(centers, [1, 2]), { min: [-1, 3, 7], max: [5, 6, 9] });
  assert.equal(selectedBounds(centers, []), null);
});
