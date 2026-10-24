import { Canvas } from "@frankfmy/canvas-geometry";
import { Camera } from "@frankfmy/canvas-geometry/camera";
import { Render } from "@frankfmy/canvas-geometry/render";
import { ServerRender } from "@frankfmy/canvas-geometry/server/render";
import { US } from "@frankfmy/canvas-geometry/size";
try {
  for (const specifier of window.packageExports) await import(specifier);
  const element = document.querySelector("canvas");
  const manual = new ServerRender();
  const camera = new Camera(Camera.zero(), { id: "camera", render: manual });
  camera.mutate({ center: { x: 10, y: -4 }, scale: 2 }); manual.settle();
  if (!Camera.eq(camera.state, camera.target)) throw new Error("camera did not settle");
  window.resizeNotifications = 0;
  const canvas = new Canvas(element, { observe: () => { window.resizeNotifications++; draw(); } });
  function draw() {
    canvas.fill("#ffffff");
    const { x, y } = camera.state.center;
    canvas.drw.camera(camera.state, US.center(canvas.size), drw => {
      if (drw.px(2) !== 1) throw new Error("transformed physical-pixel scale");
      drw.bounds({ minX: x - 4, minY: y - 4, maxX: x + 4, maxY: y + 4 }).fill({ color: "#0000ff" });
    });
    if (canvas.drw.ctx.getTransform().a !== 1) throw new Error("drawing scope leaked transform");
  }
  draw();
  const click = event => {
    window.clickedWorld = Camera.refract(camera.state, US.center(canvas.size), canvas.toWorld({ x: event.clientX, y: event.clientY }, true));
  };
  element.addEventListener("click", click);
  window.frameCount = 0;
  const animated = new Render();
  animated.push({ id: "browser-rAF", func: () => ++window.frameCount < 2 });
  window.fixture = {
    canvas,
    pixel() { const p = US.center(canvas.size); return [...canvas.drw.ctx.getImageData(p.x, p.y, 1, 1).data]; },
    roundtrip() {
      const client = { x: element.getBoundingClientRect().left + 13, y: element.getBoundingClientRect().top + 7 };
      return { client, actual: canvas.unWorld(canvas.toWorld(client, true), true) };
    },
    dispose() { element.removeEventListener("click", click); camera.stop(); manual.clear(); animated.clear(); canvas.destroy(); canvas.destroy(); },
  };
  window.consumerReady = true;
} catch (error) { window.consumerFailure = error.stack ?? String(error); throw error; }
