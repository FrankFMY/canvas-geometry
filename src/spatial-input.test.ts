import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { Spatial } from "./spatial.js";

test("rejects invalid spatial cell sizes before indexing", () => {
	for (const cell of [0, -1, NaN, Infinity, -Infinity]) {
		expect(() => new Spatial(cell)).toThrow(RangeError);
	}
});

test("rejects non-iterable cell ranges instead of blocking the process", () => {
	for (const operation of [
		'new Spatial().upsert({ id: "invalid", point: { x: Infinity, y: 0 } })',
		'new Spatial(Number.MIN_VALUE).upsert({ id: "overflow", point: { x: 1, y: 0 } })',
		'(() => { const spatial = new Spatial(); spatial.upsert({ id: "owned", point: { x: 0, y: 0 } }); spatial.query({ minX: Infinity, minY: 0, maxX: Infinity, maxY: 1 }); })()',
	]) {
		const code = `import { Spatial } from ${JSON.stringify(new URL("./spatial.ts", import.meta.url).href)}; try { ${operation}; process.exit(1); } catch (error) { process.exit(error instanceof RangeError ? 0 : 2); }`;
		const child = spawnSync(process.execPath, ["--eval", code], { timeout: 1500, encoding: "utf8" });
		expect(child.error).toBeUndefined();
		expect(child.status).toBe(0);
	}
});
