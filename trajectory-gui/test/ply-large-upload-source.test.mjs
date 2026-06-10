import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("PLY cleaner route uses disk upload and streamed download for large files", () => {
  const source = readFileSync("server/index.ts", "utf8");

  assert.match(source, /plyUpload\s*=\s*multer\(\{\s*storage:\s*multer\.diskStorage/s);
  assert.match(source, /fileSize:\s*8\s*\*\s*1024\s*\*\s*1024\s*\*\s*1024/);
  assert.match(source, /app\.post\("\/api\/ply\/clean",\s*trackPlyUploadProgress,\s*plyUpload\.single\("file"\)/);
  assert.match(source, /res\.download\(outputPath/);
  assert.doesNotMatch(source, /const data = await readFile\(outputPath\);\s*res\.send\(data\);/);
});
