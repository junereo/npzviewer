# NPZ And Splat Editor Context

This context defines the camera, VIPE, and 3D Gaussian editing language used by
the trajectory GUI. It is a glossary only; implementation decisions live in ADRs
and plans.

## Language

**Trajectory**:
The user-authored Lyra input camera path stored as `trajectory.npz`. It is the
source camera path that the user can inspect and edit.
_Avoid_: input cameras, original cameras

**Cameras**:
The Lyra output camera file stored as `cameras.npz` or `cameras_15.npz`. It is
not the same artifact as Trajectory and can contain render, VIPE, or DA3 pose
sets in Lyra's internal coordinate system.
_Avoid_: trajectory cameras

**VIPE**:
The prediction output stored as `vipe_predictions_15.npz`. It can contain frame
ids, camera intrinsics, camera poses or extrinsics, and optional metric depth.
_Avoid_: depth file, prediction file

**Splat**:
One 3D Gaussian from a 3DGS PLY file. A Splat normally has position, opacity,
scale, rotation, and color or spherical harmonic properties.
_Avoid_: point, vertex, mesh

**PLY Cleaner**:
The existing cleanup and preview tool for Lyra or 3DGS PLY files. It is not the
full authoring surface for Gaussian editing.
_Avoid_: editor, splat editor

**Splat Editor**:
The planned PlayCanvas and GSplat based authoring surface for 3DGS PLY files. It
loads Splats, renders them as Gaussian splats, tracks edit state, and exports an
edited result.
_Avoid_: PLY cleaner, viewer

**Selection State**:
Per-Splat editor state such as selected or deleted. It is metadata layered over
the original Splat data until export, and delete means a non-destructive mark
that excludes the Splat from the edited PLY.
_Avoid_: vertex flags, PLY properties

**Transform Palette**:
A GPU-friendly table of transforms applied to selected Splats or Splat groups.
It lets the editor move groups without rewriting every Gaussian property during
interactive editing.
_Avoid_: transform list, edit matrix array

**Centers Mode**:
An edit overlay that selects Splats by projected Gaussian centers.
_Avoid_: point mode

**Rings Mode**:
An edit overlay that selects visible Gaussian screen-space boundaries.
_Avoid_: outline mode

**SOG**:
SuperSplat's optimized published splat format for streaming and LOD workflows.
It is not the first editable source format for this project.
_Avoid_: exported PLY, source PLY

**Editor View**:
The interactive authoring viewport with overlays, grids, selected colors, and
edit controls.
_Avoid_: final render

**Render View**:
The visual preview of the Splat scene without editing overlays.
_Avoid_: editor viewport
