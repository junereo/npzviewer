import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("viewer API and React components are wired into PLY cleaner", () => {
  const server = readFileSync("server/index.ts", "utf8");
  const api = readFileSync("src/features/trajectory/api.ts", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");

  assert.match(server, /app\.post\("\/api\/ply\/viewer\/convert"/);
  assert.match(server, /app\.get\("\/api\/ply\/viewer\/jobs\/:jobId\/manifest"/);
  assert.match(server, /app\.get\("\/api\/ply\/viewer\/jobs\/:jobId\/chunks\/:chunkName"/);
  assert.match(api, /convertPlyViewerAsset/);
  assert.match(api, /loadViewerManifest/);
  assert.match(api, /loadViewerChunk/);
  assert.match(app, /GaussianViewer/);
  assert.match(app, /viewerJob/);
});
