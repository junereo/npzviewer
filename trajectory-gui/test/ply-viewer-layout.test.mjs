import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("3DGS viewer canvas has bounded height to avoid resize scroll loops", () => {
  const css = readFileSync("src/styles.css", "utf8");

  assert.match(css, /\.gaussian-viewer\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/s);
  assert.match(css, /\.gaussian-canvas\s*\{[^}]*height:\s*clamp\(/s);
  assert.match(css, /\.gaussian-canvas\s*\{[^}]*min-height:\s*0/s);
  assert.match(css, /\.gaussian-canvas\s*\{[^}]*contain:\s*layout paint/s);
});
