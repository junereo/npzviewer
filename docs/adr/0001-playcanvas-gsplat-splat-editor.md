# ADR 0001: Add a PlayCanvas GSplat Splat Editor Tab

## Status

Accepted

## Context

The current app already supports trajectory inspection, camera overlay analysis,
VIPE/video synchronization, and a PLY cleaner/viewer workflow. The existing PLY
viewer is useful for inspection, but it is not a full Gaussian splat editor.

The target workflow is closer to SuperSplat: load a 3DGS PLY, render actual
Gaussian splats, select parts of the capture, hide/delete/transform them, inspect
properties, and export an edited result.

SuperSplat is MIT licensed and built around PlayCanvas, GSplat data, selection
state, transform palettes, and editor overlays. The public source currently
initializes the editor graphics device with WebGL2. PlayCanvas itself can evolve
toward WebGPU, but the first integration should not depend on WebGPU-only
behavior.

## Decision

Add a new top-level `Splat Editor` tab to the React app and build it as an
isolated PlayCanvas/GSplat feature module.

The first milestone will:

- use PlayCanvas and GSplat for real splat loading and rendering,
- load original local 3DGS PLY files directly as the editor source of truth,
- show a full editor viewport with grid, camera controls, and scene status,
- maintain per-splat selection/deleted/hidden state,
- implement basic selection and delete/restore flows,
- export an edited PLY while preserving original 3DGS properties where possible.

The existing `PLY Cleaner` remains as a cleanup and preview tool. It can produce
files that users later open in the Splat Editor, but its converted preview assets
are not the editor's source of truth. The Splat Editor becomes the authoring
surface and tracks edits as metadata layered over the original PLY until export.
Trajectory, Cameras, VIPE, and video synchronization stay in the existing
trajectory workflow for the first milestone. Camera overlays inside the Splat
Editor require an explicit coordinate alignment pass and are deferred.

## Consequences

Positive:

- We align the app with a proven SuperSplat-style architecture instead of
  extending the current Three.js preview into a complex editor.
- PlayCanvas GSplat gives us a closer representation of real 3D Gaussian data.
- Editor state can be GPU-backed later without changing the user-facing model.

Negative:

- The app will contain both Three.js and PlayCanvas renderers.
- React lifecycle and PlayCanvas app lifecycle must be isolated carefully.
- WebGPU acceleration cannot be promised in the first pass because the referenced
  SuperSplat source path uses WebGL2 for editor initialization today.
- The first Splat Editor UI will not expose a WebGPU toggle. WebGPU remains an
  investigation gate until the PlayCanvas GSplat path is verified on the user's
  browser and hardware.

## Alternatives Considered

1. Extend the current Three.js PLY viewer into an editor.

   Rejected for the first full editor because it would require recreating too
   much of the GSplat pipeline, selection overlays, sorting, and export behavior.

2. Embed SuperSplat wholesale in an iframe or copied app.

   Rejected because the app needs tight integration with the existing NPZ,
   cameras, VIPE, video, and cleanup workflows.

3. Replace the entire app with SuperSplat.

   Rejected because the trajectory and Lyra-specific tools are the core value of
   the current app.
