import test from "node:test";
import assert from "node:assert/strict";
import { parsePlySceneData } from "../src/features/splat-editor/playcanvas/plyData.mjs";

test("parsePlySceneData reads ascii center positions and bounds", () => {
  const source = [
    "ply",
    "format ascii 1.0",
    "element vertex 2",
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "end_header",
    "1 2 3 255",
    "-1 4 5 128",
    "",
  ].join("\n");

  const data = parsePlySceneData(new TextEncoder().encode(source).buffer);

  assert.equal(data.splatCount, 2);
  assert.deepEqual(Array.from(data.centers), [1, 2, 3, -1, 4, 5]);
  assert.deepEqual(data.bounds, { min: [-1, 2, 3], max: [1, 4, 5] });
});

test("parsePlySceneData reads binary little endian center positions", () => {
  const header = [
    "ply",
    "format binary_little_endian 1.0",
    "element vertex 2",
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "end_header",
    "",
  ].join("\n");
  const headerBytes = new TextEncoder().encode(header);
  const source = new Uint8Array(headerBytes.length + 13 * 2);
  source.set(headerBytes);
  const view = new DataView(source.buffer);
  view.setFloat32(headerBytes.length, 1.5, true);
  view.setFloat32(headerBytes.length + 4, -2, true);
  view.setFloat32(headerBytes.length + 8, 3, true);
  view.setUint8(headerBytes.length + 12, 255);
  view.setFloat32(headerBytes.length + 13, -4, true);
  view.setFloat32(headerBytes.length + 17, 5, true);
  view.setFloat32(headerBytes.length + 21, 6.25, true);
  view.setUint8(headerBytes.length + 25, 128);

  const data = parsePlySceneData(source.buffer);

  assert.equal(data.splatCount, 2);
  assert.deepEqual(Array.from(data.centers), [1.5, -2, 3, -4, 5, 6.25]);
  assert.deepEqual(data.bounds, { min: [-4, -2, 3], max: [1.5, 5, 6.25] });
});
