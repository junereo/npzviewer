import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("PLY cleaner exposes progress events for long-running files", () => {
  const server = readFileSync("server/index.ts", "utf8");
  const api = readFileSync("src/features/trajectory/api.ts", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");

  assert.match(server, /app\.get\("\/api\/ply\/jobs\/:jobId\/events"/);
  assert.match(server, /trackPlyUploadProgress/);
  assert.match(server, /updatePlyJob\(jobId,\s*\{\s*phase:\s*"processing"/);
  assert.match(server, /outputPoints:\s*typeof event\.outputPoints === "number"/);
  assert.match(api, /new EventSource\(`\/api\/ply\/jobs\/\$\{jobId\}\/events`\)/);
  assert.match(api, /onProgress\?:\s*\(event:\s*PlyProgressEvent\)\s*=>\s*void/);
  assert.match(api, /outputPoints\?:\s*number/);
  assert.match(app, /progressEvents/);
  assert.match(app, /Processing Log/);
  assert.match(app, /Live Point Viewer/);
});
