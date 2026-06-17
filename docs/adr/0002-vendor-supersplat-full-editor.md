# ADR 0002: Vendor SuperSplat As The Full Editor Surface

## Status

Accepted

## Context

The project already has a Lyra-specific Splat Editor module for loading 3DGS PLY
files, visual inspection, local selection state, deletion, hide/lock controls,
histograms, and edited PLY export.

The user now wants the public PlayCanvas SuperSplat editor feature set copied
into this app with the same behavior as the upstream editor. SuperSplat is MIT
licensed, built on PlayCanvas and `@playcanvas/splat-transform`, and its public
2.27.4 source currently initializes the graphics device with WebGL2.

Reimplementing every upstream SuperSplat feature inside the local React module
would create immediate drift from upstream behavior and would be slower to
validate than embedding the upstream app as its own editor surface.

## Decision

Vendor the upstream SuperSplat source under:

```text
trajectory-gui/vendor/supersplat
```

Build it as a static sub-app with:

```text
BASE_HREF=/supersplat/
```

Copy the built output into:

```text
trajectory-gui/public/supersplat
```

Expose it in the existing `Splat Editor` tab as the default `SuperSplat` mode
through an iframe pointed at `/supersplat/`.

Keep the existing local implementation as `Lyra Tools` mode so Lyra-specific
PLY editing, export tests, and future trajectory/camera alignment work remain
isolated from upstream SuperSplat.

## Consequences

- Full SuperSplat behavior is preserved by running the actual upstream app.
- Upstream MIT license text is retained in the vendored source and repeated in
  `public/supersplat/THIRD_PARTY_NOTICES.txt`.
- The app now contains a larger static editor bundle and source maps.
- Security and maintenance review must include the vendored SuperSplat
  dependency tree. `npm ci` for upstream SuperSplat currently reports audit
  warnings in development dependencies.
- Future custom Lyra features should be added to `Lyra Tools` unless they are
  intended to become an upstream SuperSplat fork change.
