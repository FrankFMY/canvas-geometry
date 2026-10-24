# Canvas Geometry

Low-level TypeScript tools for 2D geometry, ownership-aware hit testing, spatial indexing, camera transforms and Canvas 2D drawing. Dependency-free at runtime; ESM JavaScript and declarations, with focused subpath imports.

[API guide](docs/API.md) · [Geometry conventions](docs/CONVENTIONS.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md) · [npm package](https://www.npmjs.com/package/@frankfmy/canvas-geometry)

## Installation

When the desired version is available on npm:

```sh
npm install @frankfmy/canvas-geometry@0.1.1
```

The source checkout works independently of registry publication:

```sh
git clone https://github.com/FrankFMY/canvas-geometry.git
cd canvas-geometry
bun install --frozen-lockfile
bun run verify
npm pack
```

## Geometry and spatial queries

```ts
import { Spatial } from "@frankfmy/canvas-geometry/spatial";
import { UB } from "@frankfmy/canvas-geometry/bounds";

const scene = new Spatial(128);
const box = { minX: 0, minY: 0, maxX: 100, maxY: 60 };
scene.upsert({ id: "panel", bounds: box });
console.log([...scene.ray({ x: 20, y: 20 })]); // ["panel"]
console.log(UB.has(box, { x: 0, y: 20 }));     // false: boundary is not owned
console.log(UB.at(box, { x: 0, y: 20 }));      // true: boundary contact
scene.destroy();
```

Ownership is intentional: `has` is not interchangeable with inclusive `at`. Closed polygons repeat their first vertex; open arrays represent polylines. Read the conventions before adapting generic intersection code.

## Browser drawing

Give the HTML canvas a CSS-controlled size, then construct the wrapper after it is mounted. CSS layout and bitmap resolution are separate; do not rely on the bitmap's intrinsic dimensions to control a high-DPI layout.

```html
<canvas id="scene" style="width: 320px; height: 180px"></canvas>
```

```ts
import { Canvas } from "@frankfmy/canvas-geometry";

const element = document.querySelector<HTMLCanvasElement>("#scene");
if (!element) throw new Error("Canvas is not mounted");
const canvas = new Canvas(element);
canvas.fill("#ffffff");
canvas.drw.bounds({ minX: 20, minY: 20, maxX: 100, maxY: 70 })
  .fill({ color: "#2563eb" });
// Component teardown:
canvas.destroy();
```

`Canvas.size` is the physical bitmap size; drawing uses the current Canvas 2D transform, not automatic CSS-pixel scaling. Resize clears the bitmap, so redraw through `observe` when needed. `destroy()` disconnects the wrapper's ResizeObserver; callers own their event listeners, render queues and canvas element.

## Runtime and support

- Pure geometry, all exported module imports, spatial queries and `ServerRender` work without `window` in Node 20/22/24 and Bun. Import safety is not server-side canvas rendering.
- `Canvas` requires a real `HTMLCanvasElement`, `window`, a 2D context and (unless disabled) `ResizeObserver`. Construct it only after browser mounting. It does not accept an OffscreenCanvas or provide a worker/Node DOM shim.
- `Draw` accepts Canvas 2D contexts, including an `OffscreenCanvasRenderingContext2D`; the `Canvas` wrapper remains HTML-only.
- Real Chromium and WebKit package consumers exercise pixels, DPR, pointer conversion, camera transforms, animation frames, native resize and disposal. This is not a blanket browser/OS compatibility claim.
- ESM only. No CommonJS entry, WebGL renderer, complete scene graph or arbitrary-precision geometry. Inputs, workload limits and positive camera scales remain caller responsibilities.

`Spatial` requires finite positive cells. Nonempty cell ranges must have safe integer indices; unsafe/nonterminating ranges throw `RangeError` before indexing. Finite but enormous grids can still be expensive: bound scene extents and query cost.

## Development

`bun run verify` runs the owning type check, complete unit suite, build and separate-project installed Node/Bun/type consumers. Browser acceptance is explicit:

```sh
bunx playwright install --with-deps chromium webkit
RUN_BROWSER=1 bun run package:check
bun audit
```

CI keeps Node 20/22/24 checks and a real installed Chromium/WebKit lane. Publishing is manual-only; tests do not publish packages.

## Author

Artem Prianishnikov / FrankFMY.

- Email: [Pryanishnikovartem@gmail.com](mailto:Pryanishnikovartem@gmail.com), [frankfmy@proton.me](mailto:frankfmy@proton.me)
- [Telegram](https://t.me/FrankFMY) · [LinkedIn](https://www.linkedin.com/in/frankfmy/) · [X](https://x.com/FrankFMY)
- [Website](https://frankfmy.com) · [GitHub](https://github.com/FrankFMY) · [npm](https://www.npmjs.com/~frankfmy)

## License

[MIT](LICENSE). See the canonical license distributed with the package.
