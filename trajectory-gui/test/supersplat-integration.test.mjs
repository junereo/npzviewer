import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("vendored SuperSplat source keeps MIT license", async () => {
  const license = await readFile(new URL("../vendor/supersplat/LICENSE", import.meta.url), "utf8");

  assert.match(license, /Copyright \(c\) 2011-2026 PlayCanvas Ltd\./);
  assert.match(license, /Permission is hereby granted, free of charge/);
});

test("built SuperSplat app is served from the Vite public folder", async () => {
  const html = await readFile(new URL("../public/supersplat/index.html", import.meta.url), "utf8");
  const notice = await readFile(new URL("../public/supersplat/THIRD_PARTY_NOTICES.txt", import.meta.url), "utf8");

  assert.match(html, /<base href="\/supersplat\/">/);
  assert.match(html, /SuperSplat/);
  assert.match(notice, /License: MIT/);
});

test("Splat Editor embeds the full SuperSplat sub-app", async () => {
  const source = await readFile(new URL("../src/features/splat-editor/SplatEditorApp.tsx", import.meta.url), "utf8");

  assert.match(source, /src="\/supersplat\/index\.html"/);
  assert.match(source, /SuperSplat Full Editor/);
  assert.match(source, /Lyra Tools/);
});
