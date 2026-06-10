# 3DGS Viewer And Large-File LOD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 2 and Phase 3 as one integrated workflow: render real 3DGS Gaussian splats in the current cleaner GUI, then add practical large-file conversion, compression, and LOD for 1GB+ PLY files.

**Architecture:** Keep the full-resolution Lyra/3DGS PLY on the Node/Python side and generate browser-friendly viewer assets. The React app loads compact manifest + chunked binary data, renders with Three.js/WebGL first, and keeps cleaner controls, before/after comparison, progress, and preview state in one workflow.

**Tech Stack:** React 19.2, Vite, Tailwind CSS v4, Node/Express, Python/Numpy, Three.js/@react-three/fiber, WebGL2 first, optional WebGPU later.

---

## Scope

This plan covers:
- Phase 2: real 3DGS viewer using `opacity`, `scale_0~2`, `rot_0~3`, `f_dc_*`, and optionally `f_rest_*`.
- Phase 3: large-file conversion/compression/LOD for 1GB+ PLY workflows.
- Integration into the current `trajectory-gui` PLY Cleaner page.
- Original/cleaned toggle and comparison.
- Re-clean loop with opacity/scale/crop controls.

This plan does not cover:
- Full SIBR-quality renderer parity in the first pass.
- Training or editing Gaussian parameters.
- Cloud upload or remote processing.
- Unreal export.

## Current Baseline

Already present:
- PLY cleaner core: `clean_lyra_ply.py`
- GUI wrapper: `trajectory-gui/server/python/clean_ply.py`
- Node API: `trajectory-gui/server/index.ts`
- React PLY Cleaner UI: `trajectory-gui/src/App.tsx`
- Client API: `trajectory-gui/src/features/trajectory/api.ts`
- Progress events and live point-count viewer.
- Large-file mode that skips slow SOR and uses fast voxel cluster filtering.

## Target User Workflow

1. User opens a Lyra/3DGS `.ply`.
2. App generates a viewer asset in the background.
3. User sees an approximate real Gaussian splat render, not just points.
4. User runs cleaner.
5. App shows processing progress and then generates/loads cleaned viewer asset.
6. User toggles:
   - Original
   - Cleaned
   - Removed-only
   - Side-by-side
7. User adjusts opacity/scale/crop parameters.
8. User re-runs cleaner and immediately verifies result in viewer.

## Key Design Decisions

### Renderer Strategy

Use a staged renderer:

- **Renderer v1:** billboard splats with color, opacity, and approximate scale.
- **Renderer v2:** anisotropic screen-space splats using covariance from scale + rotation.
- **Renderer v3:** optional WebGPU or worker-assisted sorting if WebGL sorting becomes the bottleneck.

Reasoning:
- A browser cannot directly render 10M+ true Gaussians interactively from raw PLY.
- A first useful viewer should prioritize “looks like splats enough to inspect cleanup” over perfect photorealism.
- The renderer must degrade gracefully through LOD.

### Asset Strategy

Create a converted viewer asset format:

```text
viewer-manifest.json
chunks/
  chunk_000.bin
  chunk_001.bin
  ...
lod/
  lod_0.bin
  lod_1.bin
  lod_2.bin
```

Manifest stores:
- source file name
- point count
- bounds
- available attributes
- chunk count
- LOD levels
- quantization metadata
- SH degree available
- generated timestamp

Binary chunks store packed attributes:
- position
- opacity
- scale
- rotation
- base color from `f_dc_*`
- optional SH coefficients from `f_rest_*`

### Large-File Strategy

Never send full raw 1GB+ PLY to the browser.

Instead:
- Python extracts and converts attributes.
- Python writes quantized chunks.
- Node serves chunks by URL.
- React loads only current LOD or selected chunks.
- Viewer starts at coarse LOD, then refines.

---

## File Structure

### Python Conversion

- Create: `trajectory-gui/server/python/convert_3dgs_viewer.py`
  - Reads Lyra/3DGS PLY.
  - Extracts Gaussian attributes.
  - Converts SH DC to RGB.
  - Quantizes positions/scales/opacities.
  - Creates manifest and chunk files.
  - Emits progress JSON lines to stderr.

- Modify: `clean_lyra_ply.py`
  - Add reusable PLY metadata helpers if needed.
  - Keep cleaner and converter concerns separate.

### Node API

- Modify: `trajectory-gui/server/index.ts`
  - Add viewer conversion job APIs.
  - Add SSE progress for conversion.
  - Serve generated manifests/chunks from temp job storage.
  - Add cleanup lifecycle for viewer assets.

Suggested routes:

```text
POST /api/ply/viewer/convert
GET  /api/ply/viewer/jobs/:jobId/events
GET  /api/ply/viewer/jobs/:jobId/manifest
GET  /api/ply/viewer/jobs/:jobId/chunks/:chunkName
DELETE /api/ply/viewer/jobs/:jobId
```

### Client API

- Modify: `trajectory-gui/src/features/trajectory/api.ts`
  - Add `convertPlyViewerAsset()`.
  - Add `subscribeViewerProgress()`.
  - Add typed manifest/chunk interfaces.

- Create: `trajectory-gui/src/features/ply-viewer/types.ts`
  - `ViewerManifest`
  - `ViewerChunk`
  - `ViewerMode`
  - `ViewerJob`
  - `GaussianAttributeLayout`

### Viewer Rendering

- Create: `trajectory-gui/src/features/ply-viewer/GaussianViewer.tsx`
  - Top-level viewer component.
  - Owns camera controls, mode, loading state.

- Create: `trajectory-gui/src/features/ply-viewer/useGaussianAsset.ts`
  - Loads manifest.
  - Streams chunk binaries.
  - Chooses LOD.
  - Exposes loading progress.

- Create: `trajectory-gui/src/features/ply-viewer/GaussianPointCloud.tsx`
  - Initial billboard splat renderer.
  - Uses Three.js buffer geometry.

- Create: `trajectory-gui/src/features/ply-viewer/compare.ts`
  - Maps original/cleaned/removed datasets.
  - Computes counts and display masks.

- Modify: `trajectory-gui/src/App.tsx`
  - Replace current live count-only viewer panel with real viewer panel.
  - Keep current processing log.
  - Add original/cleaned/removed/side-by-side controls.

- Modify: `trajectory-gui/src/styles.css`
  - Add viewer layout, toolbar, legend, and responsive behavior.

### Tests

- Create: `trajectory-gui/test/ply-viewer-converter.test.mjs`
  - Verifies converter creates manifest and chunk files.

- Create: `trajectory-gui/test/ply-viewer-api.test.mjs`
  - Verifies Node routes expose manifest/chunks.

- Create: `trajectory-gui/test/ply-viewer-manifest.test.mjs`
  - Verifies manifest schema and counts.

- Create: `trajectory-gui/test/ply-viewer-ui-source.test.mjs`
  - Source-level guard that viewer controls exist.

---

## Phase 2 Tasks: Real 3DGS Viewer

### Task 1: Define Viewer Manifest Contract

**Files:**
- Create: `trajectory-gui/src/features/ply-viewer/types.ts`
- Create: `trajectory-gui/test/ply-viewer-manifest.test.mjs`

- [ ] Write a failing test that validates a manifest has:
  - `version`
  - `sourceName`
  - `pointCount`
  - `bounds`
  - `attributes`
  - `chunks`
  - `lods`

- [ ] Run:
  - `node --test test/ply-viewer-manifest.test.mjs`
  - Expected: FAIL because types/validator do not exist.

- [ ] Add TypeScript types for manifest and chunk metadata.

- [ ] Add a small runtime validator in `api.ts` or a dedicated viewer helper.

- [ ] Run:
  - `node --test test/ply-viewer-manifest.test.mjs`
  - Expected: PASS.

### Task 2: Build Python PLY-To-Viewer Converter

**Files:**
- Create: `trajectory-gui/server/python/convert_3dgs_viewer.py`
- Test: `trajectory-gui/test/ply-viewer-converter.test.mjs`

- [ ] Write a failing test using a small ASCII PLY containing:
  - `x y z`
  - `opacity`
  - `scale_0 scale_1 scale_2`
  - `rot_0 rot_1 rot_2 rot_3`
  - `f_dc_0 f_dc_1 f_dc_2`

- [ ] Test should assert:
  - converter exits with status 0
  - manifest JSON exists
  - at least one binary chunk exists
  - manifest point count equals input vertex count
  - bounds are correct

- [ ] Implement converter with:
  - PLY read using existing parser patterns
  - opacity sigmoid conversion
  - SH DC to RGB approximation
  - scale `exp(scale_i)`
  - rotation preserved as quaternion
  - binary chunk output

- [ ] Emit progress lines:
  - `loaded`
  - `attributes`
  - `quantized`
  - `chunks`
  - `complete`

- [ ] Run:
  - `node --test test/ply-viewer-converter.test.mjs`
  - Expected: PASS.

### Task 3: Add Node Viewer Conversion API

**Files:**
- Modify: `trajectory-gui/server/index.ts`
- Test: `trajectory-gui/test/ply-viewer-api.test.mjs`

- [ ] Write failing API/source test verifying routes:
  - `POST /api/ply/viewer/convert`
  - `GET /api/ply/viewer/jobs/:jobId/events`
  - `GET /api/ply/viewer/jobs/:jobId/manifest`
  - `GET /api/ply/viewer/jobs/:jobId/chunks/:chunkName`

- [ ] Implement disk upload for viewer conversion, separate from cleaner upload.

- [ ] Use same job/progress pattern as cleaner SSE.

- [ ] Store generated viewer assets under temp job directory.

- [ ] Add cleanup:
  - manual delete route
  - automatic timeout cleanup

- [ ] Run:
  - `node --test test/ply-viewer-api.test.mjs`
  - Expected: PASS.

### Task 4: Add Client API For Viewer Assets

**Files:**
- Modify: `trajectory-gui/src/features/trajectory/api.ts`
- Create: `trajectory-gui/src/features/ply-viewer/useGaussianAsset.ts`
- Test: `trajectory-gui/test/ply-viewer-ui-source.test.mjs`

- [ ] Add `convertPlyViewerAsset(file, options, onProgress)`.

- [ ] Add `loadViewerManifest(jobId)`.

- [ ] Add `loadViewerChunk(jobId, chunkName)`.

- [ ] Add hook state:
  - `idle`
  - `converting`
  - `loading`
  - `ready`
  - `error`

- [ ] Add source test checking these exported names exist.

- [ ] Run:
  - `node --test test/ply-viewer-ui-source.test.mjs`
  - Expected: PASS.

### Task 5: Render First Gaussian-Like Viewer

**Files:**
- Create: `trajectory-gui/src/features/ply-viewer/GaussianViewer.tsx`
- Create: `trajectory-gui/src/features/ply-viewer/GaussianPointCloud.tsx`
- Modify: `trajectory-gui/src/App.tsx`
- Modify: `trajectory-gui/src/styles.css`

- [ ] Add viewer panel to PLY Cleaner page.

- [ ] Render chunks as Three.js buffer geometry.

- [ ] Use:
  - position attribute
  - RGB from DC color
  - opacity as alpha
  - scale as approximate point size

- [ ] Add OrbitControls.

- [ ] Add axis/grid/bounds overlay.

- [ ] Add UI stats:
  - loaded points
  - displayed LOD
  - FPS estimate
  - source: original/cleaned

- [ ] Verify manually:
  - load sample PLY
  - rotate camera
  - zoom in/out
  - no blank canvas
  - no UI overlap on 1366x768 and mobile width.

### Task 6: Add Original/Cleaned/Removed Comparison

**Files:**
- Create: `trajectory-gui/src/features/ply-viewer/compare.ts`
- Modify: `trajectory-gui/src/features/ply-viewer/GaussianViewer.tsx`
- Modify: `trajectory-gui/src/App.tsx`

- [ ] Add viewer modes:
  - `original`
  - `cleaned`
  - `removed`
  - `overlay`
  - `side-by-side`

- [ ] After cleaner finishes, automatically convert cleaned PLY to viewer asset.

- [ ] Keep original viewer asset loaded if available.

- [ ] For removed-only mode:
  - initially compute by sampling/hash comparison if exact row identity is unavailable.
  - later improve with cleaner emitting retained row ids.

- [ ] Add visible legend:
  - original: blue/white
  - cleaned: green/white
  - removed: red

- [ ] Verify:
  - toggle modes without re-uploading
  - before/after counts match cleaner stats.

### Task 7: Add Cleaner Controls That Re-Render Result

**Files:**
- Modify: `trajectory-gui/src/App.tsx`
- Modify: `trajectory-gui/src/features/trajectory/api.ts`
- Modify: `trajectory-gui/server/index.ts`

- [ ] Keep existing controls:
  - opacity threshold
  - scale quantile
  - EPS ratio
  - min samples
  - min cluster ratio

- [ ] Add crop box controls:
  - enabled
  - min X/Y/Z
  - max X/Y/Z

- [ ] Add cleaner API fields for crop box.

- [ ] Extend `clean_lyra_ply.py` with crop mask before opacity/scale.

- [ ] After each clean:
  - write cleaned PLY
  - convert cleaned viewer asset
  - switch viewer to cleaned mode

- [ ] Verify:
  - crop box reduces count
  - viewer updates after clean
  - progress log remains visible.

---

## Phase 3 Tasks: Large-File Conversion, Compression, And LOD

### Task 8: Add Quantized Chunk Format

**Files:**
- Modify: `trajectory-gui/server/python/convert_3dgs_viewer.py`
- Modify: `trajectory-gui/src/features/ply-viewer/types.ts`
- Test: `trajectory-gui/test/ply-viewer-converter.test.mjs`

- [ ] Store positions as quantized `uint16` or `int16` relative to chunk bounds.

- [ ] Store color as `uint8 rgb`.

- [ ] Store opacity as `uint8` or `float16`.

- [ ] Store scale as `float16` or logarithmic quantized value.

- [ ] Store rotation as normalized signed 16-bit quaternion.

- [ ] Manifest must describe layout exactly:
  - byte offsets
  - component types
  - stride
  - point count per chunk

- [ ] Test converter output size is smaller than raw float layout for sample data.

### Task 9: Add LOD Generation

**Files:**
- Modify: `trajectory-gui/server/python/convert_3dgs_viewer.py`
- Modify: `trajectory-gui/src/features/ply-viewer/useGaussianAsset.ts`

- [ ] Generate LOD levels:
  - LOD 0: high density
  - LOD 1: medium density
  - LOD 2: low density

- [ ] Sampling strategy:
  - voxel representative sampling
  - prefer high opacity
  - preserve bounds

- [ ] Manifest includes:
  - `lods[].pointCount`
  - `lods[].chunkNames`
  - `lods[].voxelSize`

- [ ] Viewer starts with lowest LOD.

- [ ] Viewer loads higher LOD after camera settles or user requests quality.

- [ ] Verify:
  - initial render appears quickly
  - switching LOD changes displayed point count.

### Task 10: Add Chunk Streaming And View-Frustum Loading

**Files:**
- Modify: `trajectory-gui/src/features/ply-viewer/useGaussianAsset.ts`
- Modify: `trajectory-gui/src/features/ply-viewer/GaussianViewer.tsx`

- [ ] Load only LOD 2 at first.

- [ ] Add chunk bounding boxes.

- [ ] Determine visible chunks from camera frustum.

- [ ] Prioritize chunks near camera center.

- [ ] Keep memory budget:
  - default 512MB browser-side buffer budget
  - evict least recently visible chunks

- [ ] Add UI memory indicator:
  - loaded chunks
  - loaded MB
  - active LOD

### Task 11: Add Worker-Based Decoding

**Files:**
- Create: `trajectory-gui/src/features/ply-viewer/gaussianDecode.worker.ts`
- Modify: `trajectory-gui/src/features/ply-viewer/useGaussianAsset.ts`

- [ ] Move binary decode and dequantization into Web Worker.

- [ ] Transfer ArrayBuffers instead of copying.

- [ ] Main thread receives typed arrays ready for Three.js buffer attributes.

- [ ] Add fallback decode path for environments where worker fails.

- [ ] Verify:
  - camera remains responsive while chunks load
  - no UI freeze on large chunks.

### Task 12: Add Optional SH Shading

**Files:**
- Modify: `trajectory-gui/server/python/convert_3dgs_viewer.py`
- Modify: `trajectory-gui/src/features/ply-viewer/GaussianPointCloud.tsx`

- [ ] Start with DC-only color.

- [ ] If `f_rest_*` exists, preserve coefficients in optional chunk section.

- [ ] Add viewer toggle:
  - DC color
  - SH approximate color

- [ ] Implement approximate view-dependent color only if performance is acceptable.

- [ ] Default remains DC color for speed.

### Task 13: Improve Splat Rendering Quality

**Files:**
- Modify: `trajectory-gui/src/features/ply-viewer/GaussianPointCloud.tsx`
- Create: `trajectory-gui/src/features/ply-viewer/shaders/gaussianBillboard.ts`

- [ ] Replace plain points with billboard quads.

- [ ] Use opacity falloff in fragment shader.

- [ ] Approximate projected scale from Gaussian scale.

- [ ] Add quality modes:
  - Fast points
  - Soft splats
  - Anisotropic splats

- [ ] Default to Fast points for 1GB+ files.

- [ ] Verify:
  - no blank render
  - stable FPS on medium data
  - visually smoother than point preview.

### Task 14: Add Viewer Persistence And Cleanup

**Files:**
- Modify: `trajectory-gui/server/index.ts`
- Modify: `trajectory-gui/src/features/trajectory/api.ts`
- Modify: `trajectory-gui/src/App.tsx`

- [ ] Add delete route call when user clears file.

- [ ] Cleanup temp viewer assets after timeout.

- [ ] Keep latest original/cleaned job ids in React state only.

- [ ] Do not persist 1GB derived assets in repo.

- [ ] Add visible warning when temp viewer assets expire.

---

## Performance Targets

### Small PLY

- Under 500k Gaussians:
  - direct high LOD render
  - conversion under 10 seconds
  - viewer interaction above 30 FPS

### Medium PLY

- 500k to 3M Gaussians:
  - initial LOD under 10 seconds after conversion
  - full quality optional
  - viewer interaction above 20 FPS

### Large PLY

- 3M to 30M Gaussians / 1GB+:
  - conversion may take minutes
  - visible conversion progress required
  - first low LOD viewer should load quickly after conversion
  - browser memory should stay under configured budget

---

## Risk Register

### Risk: Browser memory blowup

Mitigation:
- chunked assets
- low LOD first
- memory budget and eviction
- worker decode

### Risk: Rendering quality worse than SIBR

Mitigation:
- label viewer as inspection preview
- add quality modes
- use soft splats before full anisotropic splats

### Risk: Conversion too slow

Mitigation:
- progress events
- chunked writes
- quantization in vectorized Numpy
- skip expensive SH work by default

### Risk: Original vs cleaned row matching is hard

Mitigation:
- cleaner should optionally emit retained row ids or removed row ids.
- until then, use cleaned/original toggle and count comparison.

---

## Verification Checklist

- [ ] Existing cleaner still works.
- [ ] Large-file cleaner still avoids slow SOR by default.
- [ ] Viewer conversion works on sample ASCII PLY.
- [ ] Viewer conversion works on real Lyra binary PLY.
- [ ] Viewer shows original splats.
- [ ] Viewer shows cleaned splats.
- [ ] Toggle does not re-upload files.
- [ ] Progress logs show conversion and cleaning separately.
- [ ] Low LOD loads before high LOD.
- [ ] Browser does not freeze on 1GB+ source.
- [ ] Temp files are cleaned up.
- [ ] `node --test` passes.
- [ ] `tsc --noEmit` passes.
- [ ] `vite build` passes.

## Recommended Execution Order

1. Viewer manifest contract.
2. Python converter for small PLY.
3. Node viewer asset API.
4. React client API and hook.
5. First viewer using fast point/splat approximation.
6. Original/cleaned toggle.
7. Automatic cleaned viewer conversion after cleaning.
8. Quantized chunk format.
9. LOD generation.
10. Chunk streaming.
11. Worker decode.
12. Soft/anisotropic splat shader.

## Self-Review

Spec coverage:
- Real 3DGS attributes are covered in Tasks 2, 8, 12, and 13.
- Orbit controls and camera movement are covered in Task 5.
- Before/after comparison is covered in Task 6.
- Cleaner integration and re-clean loop are covered in Task 7.
- Large-file conversion/compression/LOD is covered in Tasks 8-11.

Placeholder scan:
- No task depends on an undefined future system.
- Every subsystem has named files and tests.
- Lower-quality renderer modes are explicit, not hidden as final quality.

Type consistency:
- `ViewerManifest`, `ViewerChunk`, `PlyProgressEvent`, and viewer job concepts are introduced before use.
- Node routes and client API names are consistent across tasks.
