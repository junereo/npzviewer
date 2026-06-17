# Splat Editor PlayCanvas GSplat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `Splat Editor` tab that uses PlayCanvas/GSplat to load, render, select, edit, and export 3DGS PLY files inside the existing React 19.2 + Vite app.

**Architecture:** Keep the current trajectory, camera, VIPE, video, and PLY Cleaner workflows intact. Add an isolated `features/splat-editor` module that owns the PlayCanvas application lifecycle, GSplat loading, editor state, selection tools, and PLY export. React renders the editor shell and command panels; PlayCanvas owns the high-performance viewport.

**Tech Stack:** Node.js 24, React 19.2, Vite, Tailwind CSS v4, TypeScript, Express, PlayCanvas, `@playcanvas/splat-transform`, optional `@playcanvas/pcui`, existing Python helpers for PLY inspection/export if browser-side export is insufficient.

---

## Source Notes

- SuperSplat package metadata identifies the app as a `3D Gaussian Splat Editor`, MIT licensed, with PlayCanvas and `@playcanvas/splat-transform` dependencies.
- SuperSplat's current `main` source creates a graphics device with `deviceTypes: ['webgl2']`. Treat WebGPU as a later validated option, not the first milestone.
- SuperSplat's `Splat` model wraps `GSplatData` and `GSplatResource`, then adds per-splat state and transform data through GPU textures. That is the right reference shape for our editor state.
- Matt Pocock `grill-with-docs` guidance says project language belongs in `CONTEXT.md`, while hard-to-reverse architectural decisions belong in ADRs.

## Scope

This plan covers:

- A new top-level `Splat Editor` tab.
- Original local 3DGS PLY load as the editor source of truth.
- PlayCanvas GSplat viewport.
- Basic editor camera controls.
- Centers-style selection in the first pass.
- Delete and restore state in the first pass.
- Minimal properties/statistics panel.
- Export edited PLY.
- Clear separation from the existing PLY Cleaner.

This plan does not cover:

- Training new Gaussians.
- AI inpainting or generative splat filling.
- Unreal export.
- Trajectory, Cameras, VIPE, or video overlay inside the Splat Editor.
- Hosted publishing.
- Full SuperSplat feature parity in the first pass.
- Guaranteed WebGPU acceleration before the PlayCanvas device path is verified in this app.
- Rings Mode, brush, lasso, flood selection, transform editing, histogram selection, hide/lock commands, and SOG/LOD export in the first pass.

## Existing Baseline

Current relevant files:

- `trajectory-gui/src/App.tsx` controls top-level tool switching and currently has `trajectory` and `ply` modes.
- `trajectory-gui/src/features/ply-viewer/GaussianViewer.tsx` renders the existing Three.js preview.
- `trajectory-gui/src/features/ply-viewer/useGaussianAsset.ts` loads converted preview chunks.
- `trajectory-gui/src/features/trajectory/api.ts` already contains PLY cleaner and viewer asset client APIs.
- `trajectory-gui/server/index.ts` owns Express endpoints.
- `trajectory-gui/server/python/clean_ply.py` and related helpers process PLY data.

The new editor should not modify the existing `ply-viewer` module beyond navigation labels.

## Target File Structure

Create:

- `trajectory-gui/src/features/splat-editor/types.ts`
  - Shared TypeScript types for editor tools, load status, selection state, splat metadata, and export options.
- `trajectory-gui/src/features/splat-editor/SplatEditorApp.tsx`
  - React shell for the tab, toolbar, panels, file actions, and viewport layout.
- `trajectory-gui/src/features/splat-editor/SplatEditorViewport.tsx`
  - React component that mounts a canvas and owns `PlayCanvasSplatEditor`.
- `trajectory-gui/src/features/splat-editor/playcanvas/PlayCanvasSplatEditor.ts`
  - Imperative PlayCanvas wrapper with `mount`, `destroy`, `loadPly`, `setTool`, `deleteSelection`, `restoreSelection`, and `exportPly`.
- `trajectory-gui/src/features/splat-editor/playcanvas/createPlayCanvasApp.ts`
  - PlayCanvas graphics device and app setup.
- `trajectory-gui/src/features/splat-editor/playcanvas/loadGsplatAsset.ts`
  - PLY file to PlayCanvas asset loading.
- `trajectory-gui/src/features/splat-editor/playcanvas/SplatEditState.ts`
  - CPU mirror for selected, deleted, hidden, and locked state.
- `trajectory-gui/src/features/splat-editor/playcanvas/selection.ts`
  - Picking and rectangle selection math.
- `trajectory-gui/src/features/splat-editor/playcanvas/exportEditedPly.ts`
  - Edited PLY export path.
- `trajectory-gui/src/features/splat-editor/useSplatEditorStore.ts`
  - Zustand store for UI-visible editor state.
- `trajectory-gui/src/features/splat-editor/__tests__/SplatEditState.test.ts`
  - Unit tests for state transitions.
- `trajectory-gui/src/features/splat-editor/__tests__/selection.test.ts`
  - Unit tests for selection math that does not require WebGL.

Modify:

- `trajectory-gui/package.json`
  - Add PlayCanvas dependencies and scripts if needed.
- `trajectory-gui/src/App.tsx`
  - Add `splat-editor` as a third tool mode and topbar button.
- `trajectory-gui/src/style.css` or current global CSS file
  - Add editor layout, canvas, toolbar, timeline-free bottom status, and panel styles.
- `trajectory-gui/server/index.ts`
  - Add export fallback endpoint only if browser-side PLY export is not stable enough.

## Domain Model

Use these names consistently:

- `SplatEditorApp`: React shell for the new tab.
- `PlayCanvasSplatEditor`: imperative viewport/controller.
- `SplatEditState`: per-splat UI state.
- `SplatScene`: one loaded PLY plus editor metadata.
- `EditorTool`: current interaction mode.
- `SelectionMode`: centers, rings, or box. Implement centers first.
- `EditedPlyExport`: exported file that excludes non-destructively deleted splats and preserves all supported original properties.

## Confirmed Design Decisions

- The Splat Editor loads the original 3DGS PLY directly. It does not use PLY Cleaner preview assets as its internal source of truth.
- Selection, deletion, hidden, and locked status are editor metadata layered over the original splat data until export.
- Export creates a new edited PLY and should preserve original 3DGS properties wherever the loader/export path supports them.
- First implementation scope is limited to PLY load, PlayCanvas/GSplat render, Centers Mode selection, delete/restore, and edited PLY export.
- First implementation UI does not expose a WebGPU toggle. WebGPU remains a separate investigation gate and can become `Auto / WebGL2 / WebGPU` only after local validation.
- Delete is non-destructive inside the editor. It marks Splats as deleted in `Selection State`; restore clears that mark; export omits marked Splats from the edited PLY.
- First implementation uses CPU Centers Selection: keep splat centers in a CPU-readable array, project them into screen space, and choose the nearest center for click selection. Large box, brush, and lasso selection performance is follow-up work.
- The first Splat Editor milestone is an independent PLY editor. Trajectory, Cameras, VIPE, and video synchronization remain in the existing workflow until a separate coordinate alignment pass is designed.
- Second implementation expands editor metadata with hidden and locked states. Hidden Splats are excluded from editor selection, locked Splats are protected from selection/edit commands, and neither state removes Splats from edited PLY export.
- Second implementation adds Box selection and axis histogram range selection as CPU operations that run only on drag completion or explicit histogram bin selection.

## Dependency Strategy

Install:

```powershell
cd "C:\Users\korea\Documents\New project\trajectory-gui"
pnpm add playcanvas @playcanvas/splat-transform
```

Optional later:

```powershell
pnpm add @playcanvas/pcui
```

Do not add `@playcanvas/pcui` in the first task unless the editor needs PCUI widgets directly. The existing app already has React controls and Tailwind styling.

## Milestone 1: Navigation And Empty Editor Shell

### Task 1: Add Splat Editor types and store

**Files:**

- Create: `trajectory-gui/src/features/splat-editor/types.ts`
- Create: `trajectory-gui/src/features/splat-editor/useSplatEditorStore.ts`

- [ ] **Step 1: Create shared types**

Create `types.ts` with:

```ts
export type EditorTool = "orbit" | "pick" | "box-select" | "lasso" | "brush" | "transform";

export type SelectionMode = "centers" | "rings";

export type SplatLoadStatus = "idle" | "loading" | "ready" | "error";

export type SplatSceneSummary = {
  fileName: string;
  splatCount: number;
  selectedCount: number;
  deletedCount: number;
  hiddenCount: number;
  lockedCount: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  } | null;
};

export type SplatEditorSnapshot = {
  status: SplatLoadStatus;
  error: string | null;
  activeTool: EditorTool;
  selectionMode: SelectionMode;
  scene: SplatSceneSummary | null;
};
```

- [ ] **Step 2: Create the Zustand store**

Create `useSplatEditorStore.ts` with:

```ts
import { create } from "zustand";
import type { EditorTool, SelectionMode, SplatEditorSnapshot, SplatSceneSummary, SplatLoadStatus } from "./types";

type SplatEditorStore = SplatEditorSnapshot & {
  setStatus: (status: SplatLoadStatus, error?: string | null) => void;
  setActiveTool: (tool: EditorTool) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  setScene: (scene: SplatSceneSummary | null) => void;
};

export const useSplatEditorStore = create<SplatEditorStore>((set) => ({
  status: "idle",
  error: null,
  activeTool: "orbit",
  selectionMode: "centers",
  scene: null,
  setStatus: (status, error = null) => set({ status, error }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setSelectionMode: (selectionMode) => set({ selectionMode }),
  setScene: (scene) => set({ scene }),
}));
```

- [ ] **Step 3: Run typecheck**

Run:

```powershell
cd "C:\Users\korea\Documents\New project\trajectory-gui"
pnpm typecheck
```

Expected: TypeScript completes without errors.

### Task 2: Add the tab shell

**Files:**

- Create: `trajectory-gui/src/features/splat-editor/SplatEditorApp.tsx`
- Modify: `trajectory-gui/src/App.tsx`
- Modify: `trajectory-gui/src/style.css` or current global CSS file

- [ ] **Step 1: Create the React shell**

Create `SplatEditorApp.tsx` with a file button, status bar, left scene panel, central viewport placeholder, and right property panel.

- [ ] **Step 2: Modify `App.tsx` tool mode**

Change the `activeTool` union from:

```ts
const [activeTool, setActiveTool] = useState<"trajectory" | "ply">("trajectory");
```

to:

```ts
const [activeTool, setActiveTool] = useState<"trajectory" | "ply" | "splat-editor">("trajectory");
```

Add:

```ts
import { SplatEditorApp } from "./features/splat-editor/SplatEditorApp";
```

Add the mode branch:

```tsx
if (activeTool === "splat-editor") {
  return <SplatEditorApp onSwitchToTrajectory={() => setActiveTool("trajectory")} />;
}
```

Add a topbar button labeled `Splat Editor`.

- [ ] **Step 3: Add layout CSS**

Add classes for:

- `.splat-editor-shell`
- `.splat-editor-toolbar`
- `.splat-editor-workspace`
- `.splat-editor-panel`
- `.splat-editor-viewport`
- `.splat-editor-status`

Use fixed minimum viewport height so the editor remains usable on the current browser window.

- [ ] **Step 4: Run the app**

Run:

```powershell
cd "C:\Users\korea\Documents\New project\trajectory-gui"
pnpm typecheck
pnpm build
```

Expected: build succeeds and the new tab opens without console errors.

## Milestone 2: PlayCanvas Viewport Lifecycle

### Task 3: Install PlayCanvas dependencies

**Files:**

- Modify: `trajectory-gui/package.json`
- Modify: `trajectory-gui/pnpm-lock.yaml`

- [ ] **Step 1: Install packages**

Run:

```powershell
cd "C:\Users\korea\Documents\New project\trajectory-gui"
pnpm add playcanvas @playcanvas/splat-transform
```

Expected:

- `playcanvas` appears in dependencies.
- `@playcanvas/splat-transform` appears in dependencies.
- lockfile updates.

- [ ] **Step 2: Typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: TypeScript still passes.

### Task 4: Create a PlayCanvas app wrapper

**Files:**

- Create: `trajectory-gui/src/features/splat-editor/playcanvas/createPlayCanvasApp.ts`
- Create: `trajectory-gui/src/features/splat-editor/playcanvas/PlayCanvasSplatEditor.ts`
- Create: `trajectory-gui/src/features/splat-editor/SplatEditorViewport.tsx`
- Modify: `trajectory-gui/src/features/splat-editor/SplatEditorApp.tsx`

- [ ] **Step 1: Create `createPlayCanvasApp.ts`**

Implement a function that accepts a canvas, creates a PlayCanvas app, sets a dark background, adds a camera, light, grid helper equivalent, and returns `{ app, cameraEntity, destroy }`.

- [ ] **Step 2: Create `PlayCanvasSplatEditor.ts`**

Implement:

```ts
export class PlayCanvasSplatEditor {
  constructor(private canvas: HTMLCanvasElement) {}
  async mount(): Promise<void> {}
  destroy(): void {}
  resize(): void {}
}
```

`mount` creates the PlayCanvas app once. `destroy` removes event listeners and destroys the app.

- [ ] **Step 3: Create `SplatEditorViewport.tsx`**

Use a `canvas` ref and instantiate `PlayCanvasSplatEditor` in `useEffect`.

- [ ] **Step 4: Wire viewport into `SplatEditorApp.tsx`**

Replace the placeholder with `<SplatEditorViewport />`.

- [ ] **Step 5: Browser verification**

Open `http://127.0.0.1:5173/`, switch to `Splat Editor`, and verify:

- canvas is nonblank,
- no duplicate canvases appear after tab switching,
- dev console has no PlayCanvas lifecycle errors.

## Milestone 3: PLY Load And Real GSplat Render

### Task 5: Load a PLY into PlayCanvas GSplat

**Files:**

- Create: `trajectory-gui/src/features/splat-editor/playcanvas/loadGsplatAsset.ts`
- Modify: `trajectory-gui/src/features/splat-editor/playcanvas/PlayCanvasSplatEditor.ts`
- Modify: `trajectory-gui/src/features/splat-editor/SplatEditorApp.tsx`
- Modify: `trajectory-gui/src/features/splat-editor/SplatEditorViewport.tsx`

- [ ] **Step 1: Define the editor API**

Add methods to `PlayCanvasSplatEditor`:

```ts
async loadPly(file: File): Promise<SplatSceneSummary>;
clearScene(): void;
```

- [ ] **Step 2: Create a browser object URL loader**

In `loadGsplatAsset.ts`, create an object URL for the file and load it as a PlayCanvas asset using the GSplat handler. Revoke the object URL after the asset has loaded or failed.

- [ ] **Step 3: Add the entity**

After loading, create an entity with a `gsplat` component using the loaded asset. Fit the camera to the asset bounds.

- [ ] **Step 4: Return scene summary**

Return `fileName`, `splatCount`, bounds, and zeroed state counts.

- [ ] **Step 5: Wire file input**

When the user selects a `.ply`, call `loadPly`, update the store to `loading`, then `ready`.

- [ ] **Step 6: Verify with a small 3DGS PLY**

Expected:

- splat scene appears,
- orbit camera can inspect it,
- summary panel shows file name and count,
- loading another PLY replaces the previous scene cleanly.

## Milestone 4: Editor State And Centers Selection

### Task 6: Add `SplatEditState`

**Files:**

- Create: `trajectory-gui/src/features/splat-editor/playcanvas/SplatEditState.ts`
- Create: `trajectory-gui/src/features/splat-editor/__tests__/SplatEditState.test.ts`

- [ ] **Step 1: Write state tests**

Test:

- new state has zero selected/deleted/hidden/locked,
- `selectOnly([1, 2])` selects exactly two,
- `addSelection([3])` keeps previous selection,
- `removeSelection([2])` removes one,
- `markDeletedSelection()` moves selected splats to deleted,
- `restoreDeleted([1])` clears deleted state.

- [ ] **Step 2: Implement `SplatEditState`**

Use typed arrays:

```ts
const SELECTED = 1 << 0;
const DELETED = 1 << 1;
const HIDDEN = 1 << 2;
const LOCKED = 1 << 3;
```

Expose count getters by maintaining counts during mutations, not by scanning the entire array every render.

- [ ] **Step 3: Run tests**

Run:

```powershell
cd "C:\Users\korea\Documents\New project\trajectory-gui"
pnpm test
```

Expected: new state tests pass.

### Task 7: Implement center picking

**Files:**

- Create: `trajectory-gui/src/features/splat-editor/playcanvas/selection.ts`
- Create: `trajectory-gui/src/features/splat-editor/__tests__/selection.test.ts`
- Modify: `trajectory-gui/src/features/splat-editor/playcanvas/PlayCanvasSplatEditor.ts`

- [ ] **Step 1: Write projection tests**

Test world-to-screen projection with a known camera matrix and a small list of positions.

- [ ] **Step 2: Implement CPU Centers Selection**

For first pass, read splat centers from `GSplatData`, project them to screen, and find the nearest center within a pixel radius.
Do not implement GPU picking in the first pass.

- [ ] **Step 3: Add pointer handling**

When active tool is `pick`, click selects nearest center.

Modifier behavior:

- no modifier: replace selection,
- Shift: add to selection,
- Ctrl: remove from selection.

- [ ] **Step 4: Reflect selection in UI**

Update `selectedCount` in the scene summary.

## Milestone 5: Delete, Hide, Lock, Restore

### Task 8: Add edit commands

**Files:**

- Modify: `trajectory-gui/src/features/splat-editor/playcanvas/PlayCanvasSplatEditor.ts`
- Modify: `trajectory-gui/src/features/splat-editor/SplatEditorApp.tsx`
- Modify: `trajectory-gui/src/features/splat-editor/types.ts`

- [ ] **Step 1: Add command methods**

Add:

```ts
deleteSelection(): SplatSceneSummary;
hideSelection(): SplatSceneSummary;
lockSelection(): SplatSceneSummary;
restoreSelection(): SplatSceneSummary;
clearSelection(): SplatSceneSummary;
```

- [ ] **Step 2: Add toolbar buttons**

Toolbar buttons:

- Pick
- Box Select
- Delete
- Hide
- Lock
- Restore
- Clear Selection

Disable edit buttons when no scene is loaded.

- [ ] **Step 3: Update rendering**

First pass can update visual state by changing a lightweight overlay or tint. If PlayCanvas material patching is not stable yet, reflect counts in UI and block deleted splats from export. Visual masking can be a follow-up task.

## Milestone 6: Box Selection And Property Panel

### Task 9: Add box select

**Files:**

- Modify: `trajectory-gui/src/features/splat-editor/playcanvas/selection.ts`
- Modify: `trajectory-gui/src/features/splat-editor/playcanvas/PlayCanvasSplatEditor.ts`
- Modify: `trajectory-gui/src/features/splat-editor/SplatEditorViewport.tsx`

- [ ] **Step 1: Add drag rectangle overlay**

Use a React overlay div above the canvas while dragging.

- [ ] **Step 2: Select projected centers inside rectangle**

Reuse the projection code from Task 7.

- [ ] **Step 3: Apply modifier behavior**

Same as pick:

- no modifier: replace,
- Shift: add,
- Ctrl: remove.

### Task 10: Add scene and selection properties

**Files:**

- Modify: `trajectory-gui/src/features/splat-editor/SplatEditorApp.tsx`
- Modify: `trajectory-gui/src/features/splat-editor/playcanvas/PlayCanvasSplatEditor.ts`

- [ ] **Step 1: Show scene properties**

Panel displays:

- file name,
- splat count,
- selected count,
- deleted count,
- hidden count,
- locked count,
- bounds min/max.

- [ ] **Step 2: Show selected bounds**

Compute selected bounds in `SplatEditState` or editor wrapper. Show min/max when selection is nonempty.

## Milestone 7: Edited PLY Export

### Task 11: Browser-side export

**Files:**

- Create: `trajectory-gui/src/features/splat-editor/playcanvas/exportEditedPly.ts`
- Modify: `trajectory-gui/src/features/splat-editor/playcanvas/PlayCanvasSplatEditor.ts`
- Modify: `trajectory-gui/src/features/splat-editor/SplatEditorApp.tsx`

- [ ] **Step 1: Preserve original properties**

Read all vertex properties from `GSplatData`. Export every non-deleted splat. Preserve property names and binary layout where possible.

- [ ] **Step 2: Add export button**

Download as `<original-name>.edited.ply`.

- [ ] **Step 3: Round-trip test**

Load exported PLY back into Splat Editor.

Expected:

- it loads,
- deleted splats are gone,
- visible scene still aligns with original.

### Task 12: Server fallback export if needed

**Files:**

- Modify: `trajectory-gui/server/index.ts`
- Create: `trajectory-gui/server/python/export_edited_ply.py`
- Modify: `trajectory-gui/src/features/trajectory/api.ts` or create `trajectory-gui/src/features/splat-editor/api.ts`

Only implement this if browser-side export cannot preserve binary PLY attributes reliably.

Expected endpoint:

```text
POST /api/splat-editor/export
multipart:
  ply: original file
  deletedIndices: JSON array or binary index buffer
```

Expected response: edited PLY blob.

## Milestone 8: SuperSplat-Like Polish

### Task 13: Add overlay modes

**Files:**

- Modify: `trajectory-gui/src/features/splat-editor/types.ts`
- Modify: `trajectory-gui/src/features/splat-editor/SplatEditorApp.tsx`
- Modify: `trajectory-gui/src/features/splat-editor/playcanvas/PlayCanvasSplatEditor.ts`

Add toggles:

- Render View
- Centers Overlay
- Rings Overlay

Implement Centers first. Rings can be approximate until material patching is stable.

### Task 14: Add histogram panel

**Files:**

- Create: `trajectory-gui/src/features/splat-editor/SplatHistogramPanel.tsx`
- Modify: `trajectory-gui/src/features/splat-editor/SplatEditorApp.tsx`

Properties:

- opacity,
- scale max,
- distance from camera,
- RGB brightness.

Selection from histogram should create an index list and pass it to `SplatEditState`.

### Task 15: Add WebGPU investigation gate

**Files:**

- Create: `trajectory-gui/docs/splat-editor/webgpu-investigation.md`

Checklist:

- Confirm PlayCanvas version supports the required WebGPU GSplat path.
- Confirm browser supports WebGPU on the user's machine.
- Compare FPS and memory against WebGL2 on the same PLY.
- Keep WebGL2 fallback.

Do not replace the first implementation with WebGPU until this gate is completed.
Do not add a WebGPU UI toggle in the first implementation.

## Testing Strategy

Run after each milestone:

```powershell
cd "C:\Users\korea\Documents\New project\trajectory-gui"
pnpm typecheck
pnpm test
pnpm build
```

Browser checks:

- app opens at `http://127.0.0.1:5173/`,
- Splat Editor tab opens,
- canvas is nonblank,
- loading a PLY renders a scene,
- selecting splats updates counts,
- delete then export produces a loadable edited PLY,
- switching tabs destroys and recreates PlayCanvas cleanly.

Performance checks:

- Small PLY under 500k splats should load interactively.
- Large PLY should not freeze the whole React UI during file read.
- If a file is too large, show a clear message and route user to PLY Cleaner/LOD workflow.

## Risks And Mitigations

- **Renderer duplication:** The app will have both Three.js and PlayCanvas. Mitigate by keeping the Splat Editor isolated under `features/splat-editor`.
- **PLY export fidelity:** Browser export may fail for some binary property layouts. Mitigate with server fallback export.
- **Selection performance:** CPU projection of all splats can be slow on multi-million files. First pass only promises click picking. Mitigate large box, brush, and lasso selection later with coarse spatial bins or screen tile caches.
- **WebGPU assumption:** Public SuperSplat editor source currently uses WebGL2 initialization. Mitigate by treating WebGPU as a gated follow-up.
- **Memory pressure:** 3DGS PLY files can exceed browser memory. Mitigate with existing cleaner/LOD conversion and clear file size warnings.

## Development Order

1. Install PlayCanvas dependencies.
2. Add empty tab and editor shell.
3. Mount/destroy PlayCanvas viewport safely.
4. Load and render one PLY.
5. Add `SplatEditState` with tests.
6. Add center picking.
7. Add delete/restore commands.
8. Add edited PLY export.
9. Add box select, hide/lock, transform, histogram, and overlay polish as follow-up work.
10. Investigate WebGPU acceleration.

## Acceptance Criteria

- The app has a `Splat Editor` tab alongside the existing trajectory and PLY cleaner workflows.
- A local 3DGS PLY can be loaded directly into the editor.
- The viewport uses PlayCanvas/GSplat rather than the existing Three.js preview.
- The user can select splats by center picking.
- The user can delete selected splats and export an edited PLY.
- The user can restore deleted splats before export.
- The existing trajectory, camera, VIPE, video, and PLY Cleaner flows still work.
- `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- The Splat Editor does not claim trajectory, camera, VIPE, or video alignment in the first milestone.
