import test from "node:test";
import assert from "node:assert/strict";
import { exportEditedAsciiPly, exportEditedPlyBytes } from "../src/features/splat-editor/playcanvas/exportEditedPly.mjs";

test("exportEditedAsciiPly removes deleted vertices and preserves properties", () => {
  const source = [
    "ply",
    "format ascii 1.0",
    "element vertex 3",
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    "end_header",
    "0 0 0 255 0 0",
    "1 0 0 0 255 0",
    "2 0 0 0 0 255",
    "",
  ].join("\n");

  const exported = exportEditedAsciiPly(source, new Set([1]));

  assert.match(exported, /element vertex 2/);
  assert.match(exported, /0 0 0 255 0 0/);
  assert.doesNotMatch(exported, /1 0 0 0 255 0/);
  assert.match(exported, /2 0 0 0 0 255/);
});

test("exportEditedAsciiPly rejects non-ascii PLY in browser path", () => {
  const source = ["ply", "format binary_little_endian 1.0", "element vertex 1", "end_header", ""].join("\n");

  assert.throws(() => exportEditedAsciiPly(source, new Set()), /Only ascii PLY export/);
});

test("exportEditedPlyBytes removes deleted binary little endian vertex records", () => {
  const header = [
    "ply",
    "format binary_little_endian 1.0",
    "element vertex 3",
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "end_header",
    "",
  ].join("\n");
  const headerBytes = new TextEncoder().encode(header);
  const vertexStride = 13;
  const source = new Uint8Array(headerBytes.length + vertexStride * 3);
  source.set(headerBytes);
  const view = new DataView(source.buffer);
  for (let index = 0; index < 3; index += 1) {
    const offset = headerBytes.length + index * vertexStride;
    view.setFloat32(offset, index, true);
    view.setFloat32(offset + 4, index + 10, true);
    view.setFloat32(offset + 8, index + 20, true);
    view.setUint8(offset + 12, index + 30);
  }

  const exported = exportEditedPlyBytes(source.buffer, new Set([1]));
  const exportedText = new TextDecoder().decode(exported.slice(0, headerBytes.length));
  const exportedView = new DataView(exported);
  const exportedHeaderLength = exportedText.indexOf("end_header\n") + "end_header\n".length;

  assert.match(exportedText, /element vertex 2/);
  assert.equal(exported.byteLength, exportedHeaderLength + vertexStride * 2);
  assert.equal(exportedView.getFloat32(exportedHeaderLength, true), 0);
  assert.equal(exportedView.getFloat32(exportedHeaderLength + vertexStride, true), 2);
});
