import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { UB } from "./bounds.js";
import { Convex } from "./convex.js";
import { UC2 } from "./coords.js";
import { UG } from "./geom.js";
import { Spatial } from "./spatial.js";
import type * as CT from "./types.js";

describe("release regressions: exact spatial cell migration", () => {
	test.each([false, true])("migrates epsilon-close positions with dirty bounds = %s", (dirty) => {
		for (const [before, after] of [
			[{ x: 127.9999, y: 1 }, { x: 128.0001, y: 1 }],
			[{ x: 1, y: 128.0001 }, { x: 1, y: 127.9999 }],
			[{ x: -0.0001, y: 1 }, { x: 0.0001, y: 1 }],
		]) {
			const spatial = new Spatial(128);
			spatial.upsert({ id: "moving", point: before });
			if (dirty) {
				spatial.upsert({ id: "extent", point: { x: 256, y: 256 } });
				spatial.delete("extent");
			}
			expect(spatial.__dirty).toBe(dirty);
			const submitted = { id: "moving", point: { ...after } };
			spatial.upsert(submitted);
			submitted.point.x = 1000;
			expect(spatial.ray(after)).toEqual(new Set(["moving"]));
			expect(spatial.query(after)).toEqual(new Set(["moving"]));
			expect(spatial.__cells.size).toBe(1);
			spatial.delete("moving");
			expect(spatial.__cells.size).toBe(0);
		}
	});

	test("migrates virtual items for newly created slices", () => {
		const spatial = new Spatial(128);
		spatial.upsert({ id: "virtual", point: { x: 127.9999, y: 1 }, virtual: true });
		const point = { x: 128.0001, y: 1 };
		spatial.upsert({ id: "virtual", point, virtual: true });
		const mounted: string[] = [];
		const view = spatial.slice(point, { onmount: (id) => mounted.push(id) });
		expect(view.items).toEqual(new Set(["virtual"]));
		expect(mounted).toEqual(["virtual"]);
		expect(spatial.query(point, { includeVirtual: true })).toEqual(new Set(["virtual"]));
		expect(spatial.ray(point).size).toBe(0);
		expect(spatial.query(point).size).toBe(0);
		expect(spatial.bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
	});

	test("reuses the cell bucket for updates within the same cell", () => {
		const spatial = new Spatial(128);
		spatial.upsert({ id: "moving", point: { x: 127.9, y: 1 } });
		const bucket = [...spatial.__cells.values()][0];
		spatial.upsert({ id: "moving", point: { x: 127.9001, y: 1 } });
		expect([...spatial.__cells.values()]).toEqual([bucket]);
		expect([...spatial.__cells.values()][0]).toBe(bucket);
		expect(spatial.__dirty).toBe(false);
		expect(spatial.ray({ x: 127.9001, y: 1 })).toEqual(new Set(["moving"]));
	});
});

describe("release regressions: cross-cell epsilon ownership", () => {
	const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
	const witnesses = (dx: number, dy: number) => [-128, 0, 128].flatMap((boundary) => [0, UG.__eps / 10].map((offset) => ({
		query: { x: dx ? boundary + dx * offset : 1, y: dy ? boundary + dy * offset : 1 },
		point: { x: dx ? boundary - dx * UG.__eps / 10 : 1, y: dy ? boundary - dy * UG.__eps / 10 : 1 },
		outside: { x: dx ? boundary - dx * UG.__eps * 2 : 1, y: dy ? boundary - dy * UG.__eps * 2 : 1 },
	})));
	const geometries = (p: CT.C2): CT.Geom[] => [p, UB.zero(p.x, p.y), [p], [p, p, p, p]];
	const itemFor = (geom: CT.Geom) => UG.isPoint(geom) ? { id: "p", point: geom }
		: UG.isBounds(geom) ? { id: "p", bounds: geom } : { id: "p", polyline: geom };

	test.each(directions)("query preserves epsilon ownership across (%s, %s) cell boundaries", (dx, dy) => {
		for (const { query, point, outside } of witnesses(dx, dy)) {
			for (const geom of geometries(point)) {
				const spatial = new Spatial(128);
				spatial.upsert(itemFor(geom));
				for (const shape of geometries(query)) {
					expect(UG.collision(geom, shape)).toBe(true);
					expect(spatial.query(shape)).toEqual(new Set(["p"]));
				}
				expect(UG.collision(geom, outside)).toBe(false);
				expect(spatial.query(outside)).toEqual(new Set<string>());
			}
		}
	});

	test.each(directions)("ray preserves epsilon ownership across (%s, %s) cell boundaries", (dx, dy) => {
		for (const { query, point, outside } of witnesses(dx, dy)) {
			for (const geom of geometries(point)) {
				const spatial = new Spatial(128);
				spatial.upsert(itemFor(geom));
				expect(UG.has(geom, query)).toBe(true);
				expect(spatial.ray(query)).toEqual(new Set(["p"]));
				expect(UG.has(geom, outside)).toBe(false);
				expect(spatial.ray(outside)).toEqual(new Set<string>());
			}
		}
	});

	test("bounds epsilon expansion on tiny cells without bypassing original range guards", () => {
		const code = `
			import assert from "node:assert/strict";
			import { Spatial } from ${JSON.stringify(new URL("./spatial.ts", import.meta.url).href)};
			import { UG } from ${JSON.stringify(new URL("./geom.ts", import.meta.url).href)};
			for (const size of [UG.__eps / 10000, Number.MIN_VALUE]) {
				const spatial = new Spatial(size);
				spatial.upsert({ id: "p", point: { x: 0, y: 0 } });
				let probes = 0;
				const key = spatial.__key.bind(spatial);
				spatial.__key = (x, y) => { probes++; return key(x, y); };
				assert.deepEqual([...spatial.query({ x: 0, y: 0 })], ["p"]);
				assert.deepEqual([...spatial.ray({ x: 0, y: 0 })], ["p"]);
				assert.ok(probes <= 18);
				assert.throws(() => spatial.query({ x: Infinity, y: 0 }), RangeError);
				assert.throws(() => spatial.ray({ x: Infinity, y: 0 }), RangeError);
				assert.equal(spatial.query({ minX: -Infinity, maxX: Infinity, minY: 1, maxY: 0 }).size, 0);
			}
			process.stdout.write("completed");
		`;
		const child = spawnSync(process.execPath, ["--eval", code], { timeout: 1500, killSignal: "SIGKILL", encoding: "utf8" });
		expect(child.error).toBeUndefined();
		expect(child.status).toBe(0);
		expect(child.stdout).toBe("completed");
	});

	test("ordinary epsilon queries stay local and radial keeps its unpadded candidate policy", () => {
		const spatial = new Spatial(128);
		const p = { x: 128 - UG.__eps / 10, y: 128 - UG.__eps / 10 };
		spatial.upsert({ id: "p", point: p });
		for (let i = 0; i < 100; i++) spatial.upsert({ id: `remote:${i}`, point: { x: 1024 + i * 128, y: 1024 } });
		const key = spatial.__key.bind(spatial);
		let probes = 0;
		spatial.__key = (x, y) => { probes++; return key(x, y); };
		const query = { x: 128, y: 128 };
		expect(spatial.query(query)).toEqual(new Set(["p"]));
		expect(spatial.ray(query)).toEqual(new Set(["p"]));
		expect(probes).toBe(8);
		expect(spatial.radial(query, 0)).toEqual(new Map<string, number>());
		// UB.nearest preserves its existing tolerant ownership shortcut; radial's precise phase is unchanged.
		expect(UB.nearest(UB.zero(p.x, p.y), query)).toEqual(query);
		expect(spatial.radial(query, UG.__eps).get("p")).toBe(0);
		expect(spatial.__cells.size).toBe(101);
	});

	test.each(directions)("slice lifecycle stays stable across (%s, %s) cell boundaries", (dx, dy) => {
		for (const { query, point, outside } of witnesses(dx, dy)) {
			for (const virtual of [false, true]) {
				const spatial = new Spatial(128);
				const events: string[] = [];
				const view = spatial.slice(query, {
					onmount: (id) => events.push(`mount:${id}`),
					onfrustum: (id) => events.push(`frustum:${id}`),
				});
				const item = { id: "p", point, virtual };
				spatial.upsert(item);
				expect(UG.collision(point, query)).toBe(true);
				expect(view.items).toEqual(new Set(["p"]));
				for (let repeat = 0; repeat < 3; repeat++) {
					view.relocate(query);
					expect(view.items).toEqual(new Set(["p"]));
					spatial.upsert(item);
					expect(view.items).toEqual(spatial.query(query, { includeVirtual: true }));
					expect(spatial.query(query)).toEqual(new Set(virtual ? [] : ["p"]));
					expect(spatial.ray(query)).toEqual(new Set(virtual ? [] : ["p"]));
					expect(events).toEqual(["mount:p"]);
				}
				const initialEvents: string[] = [];
				const initial = spatial.slice(query, { onmount: (id) => initialEvents.push(id) });
				expect(initial.items).toEqual(new Set(["p"]));
				expect(initialEvents).toEqual(["p"]);
				initial.destroy();
				view.relocate(outside);
				expect(UG.collision(point, outside)).toBe(false);
				expect(view.items).toEqual(new Set<string>());
				spatial.upsert(item);
				expect(events).toEqual(["mount:p", "frustum:p"]);
				view.relocate(query);
				expect(view.items).toEqual(new Set(["p"]));
				expect(events).toEqual(["mount:p", "frustum:p", "mount:p"]);
				spatial.delete("p");
				expect(view.items).toEqual(new Set<string>());
				expect(events).toEqual(["mount:p", "frustum:p", "mount:p", "frustum:p"]);
			}
		}
	});
});

describe("release regressions: empty spatial ranges", () => {
	test.each([
		["insert", 'spatial.upsert({ id: "empty", bounds, virtual: true }); spatial.delete("empty");'],
		["remove", 'spatial.__removeRange("owned", bounds);'],
		["query", 'assert.equal(spatial.query(bounds).size, 0);'],
	])("%s skips every loop when either axis is empty", (_name, operation) => {
		const code = `
			import assert from "node:assert/strict";
			import { Spatial } from ${JSON.stringify(new URL("./spatial.ts", import.meta.url).href)};
			import { UB } from ${JSON.stringify(new URL("./bounds.ts", import.meta.url).href)};
			const spatial = new Spatial(1);
			spatial.upsert({ id: "owned", point: { x: 0, y: 0 } });
			for (const bounds of [
				{ minX: Infinity, maxX: Infinity, minY: 1, maxY: 0 },
				{ minX: -Infinity, maxX: Infinity, minY: 1, maxY: 0 },
				{ minX: 2 ** 53, maxX: 2 ** 53, minY: 1, maxY: 0 },
				{ minX: -1e12, maxX: 1e12, minY: 1, maxY: 0 },
				{ minX: 1, maxX: 0, minY: -Infinity, maxY: Infinity },
				UB.infinity(),
			]) {
				${operation}
				assert.equal(spatial.__cells.size, 1);
				assert.deepEqual([...spatial.ray({ x: 0, y: 0 })], ["owned"]);
			}
			process.stdout.write("completed");
		`;
		const child = spawnSync(process.execPath, ["--eval", code], {
			timeout: 1500, killSignal: "SIGKILL", encoding: "utf8",
		});
		expect(child.error).toBeUndefined();
		expect(child.status).toBe(0);
		expect(child.stdout).toBe("completed");
	});

	test("retains the safe early return for empty-index queries", () => {
		expect(new Spatial().query({ minX: Infinity, minY: 0, maxX: Infinity, maxY: 1 }).size).toBe(0);
	});
});

describe("release regressions: MTV moves the first polygon out", () => {
	test.each([
		[8, 0], [-8, 0], [0, 8], [0, -8], [8, 3], [-8, -3],
	])("separates closed polygons with offset (%s, %s)", (x, y) => {
		const square = UG.convex({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
		for (const angle of [0, Math.PI / 5]) {
			const rotate = (p: CT.C2): CT.C2 => ({
				x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
				y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
			});
			for (const reversed of [false, true]) {
				const a = square.map(rotate);
				const b = square.map((p) => rotate(UC2.move(p, { x, y })));
				if (reversed) { a.reverse(); b.reverse(); }
				const original = [a.map((p) => ({ ...p })), b.map((p) => ({ ...p }))];
				expect(Convex.collision(a, b)).toBe(true);
				const mtv = Convex.mtv(a, b);
				expect(mtv).not.toBeNull();
				if (!mtv) throw new Error("Overlapping polygons require a translation");
				const moved = a.map((p) => UC2.move(p, mtv));
				expect(Convex.collision(moved, b)).toBe(false);
				if (angle === 0) expect(UB.collision(Convex.bound(moved), Convex.bound(b))).toBe(false);
				expect(Convex.collision(a.map((p) => UC2.move(p, { x: -mtv.x, y: -mtv.y })), b)).toBe(true);
				expect([a, b]).toEqual(original);
			}
		}
	});
});

describe("release regressions: mixed query ownership", () => {
	const bounds: CT.Bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
	const cases: [string, CT.Polyline, boolean][] = [
		["corner diagonal", [{ x: 0, y: 0 }, { x: 10, y: 10 }], true],
		["asymmetric corner crossing", [{ x: -100, y: -100 }, { x: 11, y: 11 }], true],
		["reversed corner crossing", [{ x: 11, y: 11 }, { x: -100, y: -100 }], true],
		["singleton", [{ x: 5, y: 5 }], true],
		["repeated point", [{ x: 5, y: 5 }, { x: 5, y: 5 }], true],
		["internal vertex", [{ x: -5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 15 }], true],
		["empty", [], false],
		["corner tangent", [{ x: -10, y: 10 }, { x: 10, y: -10 }], false],
		["boundary overlap", [{ x: -100, y: 0 }, { x: 11, y: 0 }], false],
		["boundary singleton", [{ x: 0, y: 5 }], false],
		["endpoint contact", [{ x: -10, y: -10 }, { x: 0, y: 0 }], false],
	];

	test.each(cases)("%s agrees for bounds, convexes and indexed polylines", (_name, polyline, expected) => {
		const convex = UG.convex(bounds);
		for (const query of [bounds, convex, [...convex].reverse()]) {
			expect(UG.collision(query, polyline)).toBe(expected);
			expect(UG.collision(polyline, query)).toBe(expected);
			const spatial = new Spatial();
			spatial.upsert({ id: "polyline", polyline });
			expect(spatial.query(query).has("polyline")).toBe(expected);
		}
	});

	test("bounds query finds both geometries already found by a center ray", () => {
		const spatial = new Spatial();
		spatial.upsert(
			{ id: "diagonal", polyline: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
			{ id: "singleton", polyline: [{ x: 5, y: 5 }] },
		);
		expect(spatial.ray({ x: 5, y: 5 })).toEqual(new Set(["diagonal", "singleton"]));
		expect(spatial.query(bounds)).toEqual(new Set(["diagonal", "singleton"]));
	});

	test("clips asymmetric spans before checking an interior point", () => {
		const rectangle: CT.Bounds = { minX: -3, minY: 2, maxX: 9, maxY: 8 };
		const polyline = [{ x: -103, y: -48 }, { x: 21, y: 14 }];
		expect(UB.has(rectangle, { x: -41, y: -17 })).toBe(false);
		for (const query of [rectangle, UG.convex(rectangle)]) {
			expect(UG.collision(query, polyline)).toBe(true);
			expect(UG.collision(polyline, query)).toBe(true);
		}
	});

	test("retains point and edge ownership for degenerate bounds", () => {
		const line = { minX: 0, minY: 5, maxX: 10, maxY: 5 };
		expect(UG.collision(line, [{ x: 5, y: 5 }])).toBe(true);
		expect(UG.collision(line, [{ x: 0, y: 5 }])).toBe(false);
		expect(UG.collision(line, [{ x: 5, y: 0 }, { x: 5, y: 10 }])).toBe(true);
		expect(UG.collision(UB.zero(5, 5), [{ x: 0, y: 5 }, { x: 10, y: 5 }])).toBe(true);
		expect(UG.collision(UB.zero(0, 5), [{ x: 0, y: 5 }, { x: 10, y: 5 }])).toBe(false);
	});
});

describe("release regressions: closed inflation", () => {
	test.each([
		["capsule", [{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 5, y: 0 }, true],
		["point", [{ x: 5, y: 3 }], { x: 5, y: 3 }, false],
		["repeated point", [{ x: 5, y: 3 }, { x: 5, y: 3 }], { x: 5, y: 3 }, false],
	] satisfies [string, CT.C2[], CT.C2, boolean][])("%s owns its center through every dispatch", (_name, input, center, create) => {
		const original = input.map((p) => ({ ...p }));
		const inflated = create ? Convex.create(input, 2) : Convex.inflate(input, 2);
		expect(Convex.has(inflated, center)).toBe(true);
		expect(UG.has(inflated, center)).toBe(true);
		expect(UG.isConvex(inflated)).toBe(true);
		expect(inflated.at(-1)).toEqual(inflated[0]);
		expect(inflated.at(-1)).not.toBe(inflated[0]);
		expect(UG.has(inflated, inflated[0])).toBe(false);
		const spatial = new Spatial();
		spatial.upsert({ id: "inflated", convex: inflated });
		expect(spatial.ray(center)).toEqual(new Set(["inflated"]));
		expect(spatial.query(center)).toEqual(new Set(["inflated"]));
		inflated[0].x += 100;
		expect(input).toEqual(original);
	});

	test("preserves empty and nonpositive-radius degeneracy", () => {
		expect(Convex.inflate([], 2)).toEqual([]);
		expect(Convex.create([{ x: 0, y: 0 }], 2)).toEqual([]);
		expect(Convex.create([{ x: 0, y: 0 }, { x: 0, y: 0 }], 2)).toEqual([]);
		for (const radius of [0, -2]) {
			expect(Convex.inflate([{ x: 0, y: 0 }], radius)).toEqual([]);
			expect(Convex.create([{ x: 0, y: 0 }, { x: 10, y: 0 }], radius)).toEqual([]);
		}
	});
});

describe("release regressions: contained polygon MTV", () => {
	test.each([
		["centered", UG.convex({ minX: 4, minY: 4, maxX: 6, maxY: 6 }), 6],
		["left", UG.convex({ minX: 1, minY: 4, maxX: 3, maxY: 6 }), 3],
		["right", UG.convex({ minX: 7, minY: 4, maxX: 9, maxY: 6 }), 3],
		["top", UG.convex({ minX: 4, minY: 1, maxX: 6, maxY: 3 }), 3],
		["bottom", UG.convex({ minX: 4, minY: 7, maxX: 6, maxY: 9 }), 3],
		["unequal axis widths", UG.convex({ minX: 2, minY: 4, maxX: 8, maxY: 6 }), 6],
		["different edge axes", [{ x: 5, y: 3 }, { x: 7, y: 5 }, { x: 5, y: 7 }, { x: 3, y: 5 }, { x: 5, y: 3 }], 7],
	] satisfies [string, CT.Convex, number][])("%s separates the inner or outer first polygon minimally", (_name, inner, distance) => {
		const outer = UG.convex({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
		for (const angle of [0, Math.PI / 5]) {
			const rotate = (p: CT.C2): CT.C2 => ({
				x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
				y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
			});
			for (const reversed of [false, true]) {
				for (const swap of [false, true]) {
					const a = (swap ? outer : inner).map(rotate);
					const b = (swap ? inner : outer).map(rotate);
					if (reversed) { a.reverse(); b.reverse(); }
					const original = [a.map((p) => ({ ...p })), b.map((p) => ({ ...p }))];
					expect(Convex.collision(a, b)).toBe(true);
					const mtv = Convex.mtv(a, b);
					if (!mtv) throw new Error("Contained polygons require a translation");
					const moved = a.map((p) => UC2.move(p, mtv));
					expect(Convex.collision(moved, b)).toBe(false);
					expect(Math.hypot(mtv.x, mtv.y)).toBeCloseTo(distance, 10);
					expect(Convex.mtv(a, b, "min")).toEqual(mtv);
					expect(Convex.mtv(moved, b)).toBeNull();
					expect(Convex.collision(a.map((p) => UC2.move(p, { x: mtv.x * 0.999, y: mtv.y * 0.999 })), b)).toBe(true);
					expect([a, b]).toEqual(original);
				}
			}
		}
	});

	test.each([
		["top", { x: 0, y: -6 }, { x: 0, y: -6 }],
		["bottom", { x: 0, y: 6 }, { x: 0, y: 6 }],
		["left", { x: -3, y: 0 }, { x: -9, y: 0 }],
		["right", { x: 9, y: 0 }, { x: 3, y: 0 }],
	] satisfies ["top" | "bottom" | "left" | "right", CT.C2, CT.C2][])("preserves the explicit %s direction", (direction, innerMove, outerMove) => {
		const inner = UG.convex({ minX: 1, minY: 4, maxX: 3, maxY: 6 });
		const outer = UG.convex({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
		expect(Convex.mtv(inner, outer, direction)).toEqual(innerMove);
		expect(Convex.mtv(outer, inner, direction)).toEqual(outerMove);
		expect(Convex.collision(inner.map((p) => UC2.move(p, innerMove)), outer)).toBe(false);
		expect(Convex.collision(outer.map((p) => UC2.move(p, outerMove)), inner)).toBe(false);
	});

	test.each([10, 11])("returns no MTV for contact or separation at x = %s", (minX) => {
		const a = UG.convex({ minX, minY: 4, maxX: minX + 2, maxY: 6 });
		const b = UG.convex({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
		expect(Convex.collision(a, b)).toBe(false);
		expect(Convex.mtv(a, b)).toBeNull();
	});
});

describe("release regressions: slice query ownership on upsert", () => {
	test.each([
		["open polyline", [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], { x: 5, y: 0 }, { x: 8, y: 2 }],
		["convex", UG.convex({ minX: 0, minY: 0, maxX: 10, maxY: 10 }), { x: 5, y: 5 }, { x: 10, y: 5 }],
		["bounds", { minX: 0, minY: 0, maxX: 10, maxY: 10 }, { x: 5, y: 5 }, { x: 10, y: 5 }],
		["point", { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }],
	] satisfies [string, CT.Geom, CT.C2, CT.C2][])("%s preserves membership and lifecycle within the same cell", (_name, geom, inside, outside) => {
		for (const virtual of [false, true]) {
			const spatial = new Spatial();
			const item = { id: "p", point: { ...inside }, virtual };
			spatial.upsert(item);
			const bucket = [...spatial.__cells.values()][0];
			const events: string[] = [];
			const view = spatial.slice(geom, {
				onmount: (id) => events.push(`mount:${id}`),
				onfrustum: (id) => events.push(`frustum:${id}`),
			});
			const expectMembership = (present: boolean) => {
				const expected = new Set(present ? ["p"] : []);
				expect(spatial.query(geom, { includeVirtual: true })).toEqual(expected);
				expect(view.items).toEqual(expected);
				expect(spatial.query(geom)).toEqual(virtual ? new Set<string>() : expected);
				expect(spatial.__cells.size).toBe(1);
				expect([...spatial.__cells.values()][0]).toBe(bucket);
			};
			expectMembership(true);
			expect(events).toEqual(["mount:p"]);
			for (let repeat = 0; repeat < 3; repeat++) {
				spatial.upsert(item);
				expectMembership(true);
				expect(events).toEqual(["mount:p"]);
			}
			const outsideItem = { ...item, point: { ...outside } };
			for (let repeat = 0; repeat < 3; repeat++) {
				spatial.upsert(outsideItem);
				expectMembership(false);
				expect(events).toEqual(["mount:p", "frustum:p"]);
			}
			for (let repeat = 0; repeat < 3; repeat++) {
				spatial.upsert(item);
				expectMembership(true);
				expect(events).toEqual(["mount:p", "frustum:p", "mount:p"]);
			}
			spatial.delete("p");
			expect(view.items).toEqual(new Set<string>());
			expect(spatial.query(geom, { includeVirtual: true })).toEqual(new Set<string>());
			expect(events).toEqual(["mount:p", "frustum:p", "mount:p", "frustum:p"]);
			spatial.upsert(item);
			expect(view.items).toEqual(new Set(["p"]));
			expect(spatial.query(geom, { includeVirtual: true })).toEqual(view.items);
			expect(events).toEqual(["mount:p", "frustum:p", "mount:p", "frustum:p", "mount:p"]);
		}
	});

	test("uses owned open geometry after construction and relocation", () => {
		const spatial = new Spatial();
		const item = { id: "p", point: { x: 5, y: 0 } };
		spatial.upsert(item);
		const geom = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
		const original = geom.map((p) => ({ ...p }));
		const events: string[] = [];
		const view = spatial.slice(geom, {
			onmount: (id) => events.push(`mount:${id}`),
			onfrustum: (id) => events.push(`frustum:${id}`),
		});
		for (const point of geom) point.y += 30;
		expect(view.geom).toEqual(original);
		spatial.upsert(item);
		expect(spatial.query(original)).toEqual(new Set(["p"]));
		expect(view.items).toEqual(new Set(["p"]));
		expect(events).toEqual(["mount:p"]);

		const relocated = original.map((p) => ({ x: p.x, y: p.y + 1 }));
		const query = relocated.map((p) => ({ ...p }));
		view.relocate(relocated);
		expect(view.items).toEqual(new Set<string>());
		expect(spatial.query(query)).toEqual(view.items);
		expect(events).toEqual(["mount:p", "frustum:p"]);
		for (const point of relocated) point.x += 100;
		expect(view.geom).toEqual(query);
		const moved = { id: "p", point: { x: 5, y: 1 } };
		for (let repeat = 0; repeat < 3; repeat++) {
			spatial.upsert(moved);
			expect(spatial.query(query)).toEqual(new Set(["p"]));
			expect(view.items).toEqual(new Set(["p"]));
			expect(events).toEqual(["mount:p", "frustum:p", "mount:p"]);
		}
		view.relocate(query);
		expect(view.items).toEqual(spatial.query(query));
		expect(events).toEqual(["mount:p", "frustum:p", "mount:p"]);
	});
});
