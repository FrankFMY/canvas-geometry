# API and lifecycle guide

Use exported package subpaths, not `src`, internal `support` paths or fields prefixed `__`.

| Import suffix | Main export | Responsibility |
| --- | --- | --- |
| package root | `Canvas` | HTML canvas bitmap, DPR, resize and coordinate bridge |
| `/bounds` | `UB` | axis-aligned bounds, strict ownership/contact and transforms |
| `/camera` | `Camera` | state/target interpolation and world/screen projection |
| `/convex` | `Convex` | closed convex chains, collision and hull operations |
| `/coords` | `UC2` | coordinates, vectors, interpolation and distances |
| `/depth` | `UD` | two-axis normalized depth and strict/inclusive tests |
| `/draw` | `Draw` | scoped Canvas 2D paths, styles and camera transforms |
| `/edge` | `UE` | finite two-point edges and intersections |
| `/geom` | `UG` | dispatch across points, bounds, convexes and polylines |
| `/line` | `UL` | finite segments, rays and infinite lines |
| `/polyline` | `UPL` | open chains, length, nearest points and collision |
| `/render` | `Render` | keyed frame jobs and injectable scheduling |
| `/server/render` | `ServerRender` | manual stepping or optional interval driving |
| `/size` | `US` | width/height, padding and layout calculations |
| `/spatial` | `Spatial` | cloned items, grid queries and live views |
| `/types` | types only | `C2`, `S2`, `Bounds`, `Depth`, `Geom`, `Line` and curves |

## Geometry semantics

Coordinates are `{ x, y }`; sizes are `{ w, h }`; bounds are `{ minX, minY, maxX, maxY }`. An edge is a two-coordinate tuple. `Depth` is exactly two numbers. Convexes and polylines are coordinate arrays: closure and degeneracy determine their interpretation, not different runtime tags. Do not treat `has`, inclusive `at`, contact and strict collision as identical. See [conventions](CONVENTIONS.md).

Most arithmetic helpers return new values. Explicit `assign`, accumulation helpers such as `mix`/`push`, mutable camera/render state and spatial operations are exceptions; do not infer universal immutability from a naming rule. Spatial insertion clones item geometry. `Canvas` can retain an explicitly supplied `size` object and changes its fields on resize; do not share that object unintentionally.

## Canvas and camera

`Canvas.toElement(client)` subtracts the element's viewport offset. `toWorld(point, true)` first performs that subtraction, then multiplies by DPR; `unWorld(point, true)` reverses it. Here “world” means bitmap coordinates, not camera space. Use `Camera.refract(camera.state, anchor, bitmapPoint)` for camera-space coordinates; `Camera.unrefract` reverses that transformation. A useful physical anchor is `US.center(canvas.size)`.

`new Camera(initial, { id, render?, onchange? })` copies its initial state. `mutate(target)` interpolates when a render queue is supplied, otherwise applies immediately; `mutate(target, true)` forces the target and drops the queued camera job. `stop()` drops that camera's job, not the whole render queue. Use distinct scheduling IDs for independent jobs.

`Draw.scope`/`Draw.camera` restore drawing state with `finally`. `Draw.px` converts a physical-pixel width through the current transform. `Canvas.resize()` resets the bitmap and context state, then reapplies configured smoothing. CSS dimensions must remain independently controlled. `Canvas.destroy()` disconnects observation; it does not destroy caller-owned listeners or renderer jobs.

## Deterministic server stepping

```ts
import { ServerRender } from "@frankfmy/canvas-geometry/server/render";
let frames = 0;
const render = new ServerRender();
render.push({ id: "example", func: () => ++frames < 3 });
render.settle();
console.log(frames); // 3
render.clear();
```

`push` deduplicates by ID. A frame callback returns true to continue and false to finish. `drop` removes a job; `stop` cancels scheduling without clearing all jobs; `clear` stops and removes jobs. Callback errors are dropped and forwarded to `onerror` when supplied. Caller-provided draw callbacks still own their errors. `settle(max_steps)` is bounded and may leave unfinished jobs when that limit is reached. `start(interval)` introduces a real interval; always `stop()` it during teardown.

## Spatial views and cost

Insert `{ id, point }`, `{ id, bounds }`, `{ id, convex }` or `{ id, polyline }`. Reusing an ID updates that item. `query(geometry)` returns IDs; `ray(point)` uses ownership semantics; `radial(point, radius)` measures distance to item AABBs, an approximation for nonrectangular geometry. Virtual items do not affect world bounds or ordinary queries; `query(..., { includeVirtual: true })` and live slices can include them.

`slice(geometry, { onmount, onfrustum })` tracks entry/exit as parent items change. Destroy a view to unsubscribe it; destroy the parent to clear its views and grid. View `query`/`ray`/`radial` delegate to the parent and are not a permission or frustum restriction.

Cell width must be finite and positive. A nonempty quantized range with nonfinite/unsafe integer indices throws before loops; invalid ranges in an upsert batch are checked before item mutation. Empty geometry sentinels remain valid. Grid work scales with the covered cells, so even finite coordinates require application budgets. Geometry utilities do not validate arbitrary untrusted objects or provide a computational-security boundary.
