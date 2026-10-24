import { Canvas } from "@frankfmy/canvas-geometry";
import { UB } from "@frankfmy/canvas-geometry/bounds";
import { Camera } from "@frankfmy/canvas-geometry/camera";
import { UC2 } from "@frankfmy/canvas-geometry/coords";
import { UD } from "@frankfmy/canvas-geometry/depth";
import { UPL } from "@frankfmy/canvas-geometry/polyline";
import { ServerRender } from "@frankfmy/canvas-geometry/server/render";
import { Spatial } from "@frankfmy/canvas-geometry/spatial";
import type { Bounds, C2, Depth, Geom } from "@frankfmy/canvas-geometry/types";
const point: C2 = UC2.sum({ x: 1, y: 2 }, { x: 3, y: 4 });
const bounds: Bounds = UB.zero(0, 0);
const geom: Geom = [point, { x: 5, y: 6 }];
const depth: Depth = [0, 0]; UD.at(depth);
const renderer = new ServerRender();
new Camera(Camera.zero(), { id: "camera", render: renderer });
const spatial = new Spatial(); spatial.upsert({ id: "point", point }, { id: "line", polyline: geom as C2[] });
new Canvas(document.createElement("canvas"), { size: { w: 10, h: 20 } });
// @ts-expect-error points require both coordinates
UC2.sum({ x: 1 }, point);
// @ts-expect-error bounds are structured numeric values
UB.contain("bounds", bounds);
// @ts-expect-error depth is an exact two-number tuple
UD.at([0, 0, 0]);
// @ts-expect-error Canvas requires an HTMLCanvasElement, not a selector
new Canvas("canvas");
// @ts-expect-error a render scheduling ID is required
new Camera(Camera.zero(), {});
// @ts-expect-error indexed bounds require maxY
spatial.upsert({ id: "invalid", bounds: { minX: 0, minY: 0, maxX: 1 } });
// @ts-expect-error frame continuation must be boolean
renderer.push({ id: "invalid", func: () => "again" });
// @ts-expect-error a polyline is an array of complete coordinates
UPL.copy("line");
void [point, bounds, geom];
