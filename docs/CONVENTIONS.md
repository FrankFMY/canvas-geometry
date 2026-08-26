# Geometry Conventions

## Plane and winding

The geometry layer uses a mathematical Y-up plane. Positive angles rotate counter-clockwise. Convex polygon contours are represented counter-clockwise and may include a closing duplicate of the first vertex where an API requires an explicit closed contour.

## Epsilon comparisons

Tolerant comparisons use an explicit epsilon, normally `1e-5`. They intentionally return `false` for `NaN`. Callers handling measured or very large coordinates should select an epsilon appropriate to their scale rather than relying blindly on the default.

## Ownership versus contour

The package distinguishes a geometry owning an interior point from a point lying on its contour.

- `has`-style predicates model ownership and generally exclude external boundaries.
- `at`-style predicates model contour membership and include endpoints/boundaries where documented.
- endpoint-only contact is therefore not automatically an interior collision.

This distinction prevents adjacent shapes from both claiming the same boundary while still allowing explicit snapping and contour queries.

## Degenerate geometry

Degenerate inputs are first-class:

- zero points form an empty polyline;
- repeated points may collapse to a point;
- collinear vertices may collapse to an edge;
- zero-size bounds remain representable;
- empty/point/edge/polyline classifications are deterministic.

Callers should not pre-normalize these cases differently unless they deliberately want different semantics.

## Browser coordinates

DOM events use viewport coordinates and CSS Y-down layout. `Canvas.toElement`, `toWorld`, `unElement`, and `unWorld` make this conversion explicit and account for the current device pixel ratio. The wrapper refreshes DPR during resize so browser zoom and cross-monitor movement do not leave stale transforms.

## Spatial virtual items

Virtual items participate in lifecycle hooks but do not expand authoritative world bounds. Duplicate IDs inside one batch resolve to the final submitted state and must not emit transient mount/unmount transitions for superseded states.
