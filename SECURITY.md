# Security and input boundaries

Report a suspected vulnerability privately to [frankfmy@proton.me](mailto:frankfmy@proton.me) or [Pryanishnikovartem@gmail.com](mailto:Pryanishnikovartem@gmail.com). Do not post credentials or private application data in an issue.

This is a computational geometry/drawing library, not an input sanitizer, authorization system or sandbox. Validate external coordinates, item counts, extents, camera scales and workload budgets. Spatial grids reject invalid cells and nonterminating index ranges, but do not cap every finite query's cost. Keep untrusted code away from callbacks and mutable internal fields. Canvas/browser/context availability, layout, event listener cleanup and application permissions belong to callers. Importing a DOM-safe module is not proof that constructing Canvas is supported in SSR or a worker.
