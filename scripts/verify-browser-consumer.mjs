import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { chromium, webkit } from "playwright";

export async function verifyBrowserConsumer(root, packageRoot, specifiers, installed) {
  const imports = Object.fromEntries(Object.entries(installed.exports).map(([subpath, entry]) => [installed.name + (subpath === "." ? "" : subpath.slice(1)), "/package/" + entry.import.replace(/^\.\//, "")]));
  const html = `<!doctype html><meta charset="utf-8"><style>canvas{position:absolute;left:40px;top:30px;width:120px;height:80px}</style><canvas></canvas><script type="importmap">${JSON.stringify({ imports })}</script><script>window.packageExports=${JSON.stringify(specifiers)}</script><script type="module" src="/consumer.mjs"></script>`;
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (pathname === "/") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(html); return; }
    if (pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    if (pathname === "/consumer.mjs") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(readFileSync(resolve(root, "test/browser-consumer.mjs"))); return; }
    const file = resolve(packageRoot, decodeURIComponent(pathname.replace(/^\/package\//, "")));
    if (!pathname.startsWith("/package/") || !file.startsWith(packageRoot + sep) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
      const browser = await launcher.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 2 });
        const errors = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.consumerReady || window.consumerFailure);
        assert.equal(await page.evaluate(() => window.consumerFailure), undefined);
        await page.waitForFunction(() => window.frameCount === 2 && window.resizeNotifications > 0);
        assert.deepEqual(await page.evaluate(() => ({ ...window.fixture.canvas.size })), { w: 240, h: 160 });
        assert.deepEqual(await page.evaluate(() => window.fixture.pixel()), [0, 0, 255, 255]);
        const roundtrip = await page.evaluate(() => window.fixture.roundtrip()); assert.deepEqual(roundtrip.client, roundtrip.actual);
        await page.locator("canvas").click();
        assert.deepEqual(await page.evaluate(() => window.clickedWorld), { x: 10, y: -4 });
        await page.locator("canvas").evaluate(element => { element.style.width = "200px"; element.style.height = "100px"; });
        await page.waitForFunction(() => window.fixture.canvas.size.w === 400 && window.fixture.canvas.size.h === 200);
        assert.deepEqual(await page.evaluate(() => window.fixture.pixel()), [0, 0, 255, 255]);
        await page.evaluate(() => window.fixture.dispose());
        await page.evaluate(() => new Promise(resolve => {
          const element = document.querySelector("canvas");
          const probe = new ResizeObserver(entries => { if (entries[0].contentRect.width === 220) { probe.disconnect(); resolve(); } });
          probe.observe(element); element.style.width = "220px";
        }));
        assert.deepEqual(await page.evaluate(() => ({ ...window.fixture.canvas.size })), { w: 400, h: 200 });
        assert.deepEqual(errors, []);
        console.log(`installed ${engine} Canvas pixels/DPR/transforms/RAF/resize/disposal: PASS (${browser.version()})`);
      } finally { await browser.close(); }
    }
  } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
