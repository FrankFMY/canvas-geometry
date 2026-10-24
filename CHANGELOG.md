# Changelog

## 0.1.1

- Reject invalid spatial cells and nonterminating/unsafe index ranges before loops or batch mutation; retain empty geometries and ownership semantics.
- Preserve exact cell migration across epsilon-close positions, close inflated capsules/diamonds consistently, handle mixed polyline/bounds interior crossings and orient MTVs to separate the first polygon.
- Inflated closed contours now repeat their first vertex; existing vertices and order are unchanged. Consumers counting vertices should exclude that closing repeat. Empty ranges skip every cell loop.
- Qualify all sixteen installed subpaths, pure Node/Bun/SSR behavior, eight negative TypeScript uses and real Chromium/WebKit canvas/DPR/resize/lifecycle behavior.
- Add English API/runtime/security guides, complete verified owner contacts and canonical package/source links. Keep runtime dependencies, MIT grant and existing exports unchanged.

## 0.1.0

- Initial public source release.
- 2D geometry and collision primitives.
- Camera, Canvas, drawing, render-loop, and server-render utilities.
- Uniform-grid spatial index with virtual-item lifecycle.
- 1,627 behavior tests.
