# Canvas Geometry

Low-level 2D geometry, transforms, spatial indexing, and Canvas rendering for TypeScript.

I built this package for editors, diagrams, spatial interfaces, CAD-like tools, and canvas-heavy applications that need one explicit geometry model across browser rendering, hit testing, camera transforms, collision checks, and deterministic server-side animation stepping.

## Capabilities

- points, vectors, sizes, bounds, edges, lines, polylines, and convex polygons;
- coordinate arithmetic, interpolation, projection, rotation, depth, and transforms;
- open-boundary ownership and inclusive contour predicates;
- collision and nearest-point operations across geometry kinds;
- camera world/screen transforms;
- a uniform-grid spatial index with virtual items and lifecycle hooks;
- fluent Canvas 2D drawing helpers;
- device-pixel-ratio-aware `HTMLCanvasElement` wrapper;
- browser render loop and deterministic server render loop;
- DOM and `OffscreenCanvasRenderingContext2D` typing;
- 1,627 behavior tests covering geometry, degenerate cases, spatial lifecycle, rendering, and coordinate round trips.

## Coordinate conventions

Geometry uses a mathematical plane:

- positive X points right;
- positive Y points up;
- positive rotation is counter-clockwise;
- polygon winding is counter-clockwise;
- the default epsilon is `1e-5` where tolerant comparisons are used.

The DOM Canvas wrapper explicitly converts viewport/element coordinates into device-pixel world coordinates, so browser top-left layout coordinates do not silently redefine the geometry model.

See [docs/CONVENTIONS.md](docs/CONVENTIONS.md) before integrating collision or ownership semantics.

## Examples

### Coordinates and bounds

```ts
import { UC2 } from "@frankfmy/canvas-geometry/coords";
import { UB } from "@frankfmy/canvas-geometry/bounds";

const direction = UC2.direct({ x: 2, y: 3 }, { x: 7, y: 11 });
const rotated = UC2.rotate({ x: 3, y: 7 }, { x: 0, y: 0 }, Math.PI / 2);
const bounds = UB.fromPoints([
  { x: -2, y: 4 },
  { x: 8, y: 12 },
]);
```

### Spatial index

```ts
import { Spatial } from "@frankfmy/canvas-geometry/spatial";

const spatial = new Spatial({ cell: { w: 128, h: 128 } });
spatial.upsert({
  id: "node-1",
  geom: { minX: 10, minY: 20, maxX: 90, maxY: 80 },
});
```

### Canvas wrapper

```ts
import { Canvas } from "@frankfmy/canvas-geometry";

const element = document.querySelector("canvas");
if (!(element instanceof HTMLCanvasElement)) throw new Error("canvas missing");

const canvas = new Canvas(element, {
  smoothing: { imageSmoothingEnabled: true, imageSmoothingQuality: "high" },
});

canvas.clear();
canvas.drw.scope((draw) => {
  // draw with explicit transform/style scope
});
```

## Entry points

The root exports the browser `Canvas` wrapper. Focused entry points expose:

`bounds`, `camera`, `convex`, `coords`, `depth`, `draw`, `edge`, `geom`, `line`, `polyline`, `render`, `server/render`, `size`, `spatial`, and `types`.

## Package status

The GitHub repository is public. Registry publication is intentionally deferred; the npm package remains marked private until a separate release gate is completed.

## Development

```bash
git clone https://github.com/FrankFMY/canvas-geometry.git
cd canvas-geometry
bun install --frozen-lockfile
bun run verify
```

## Author

**Artem Prianishnikov**

- GitHub: https://github.com/FrankFMY
- Website: https://frankfmy.com
- Email: Pryanishnikovartem@gmail.com

## License

MIT © 2026 Artem Prianishnikov. See [LICENSE](LICENSE).
