import { describe, expect, test } from "bun:test";
import { UB } from "./bounds.js";
import type { SpatialItem } from "./spatial.js";
import { Spatial } from "./spatial.js";
import type * as CT from "./types.js";

const b = (minX: number, minY: number, maxX: number, maxY: number): CT.Bounds => ({ minX, minY, maxX, maxY });

describe("SpatialItem.virtual: role transitions and duplicate batches", () => {
	test("virtual to real with unchanged geometry establishes exact world bounds", () => {
		const spatial = new Spatial(32);
		const box = b(100, 100, 110, 110);
		spatial.upsert({ id: "item", bounds: box, virtual: true });
		expect(spatial.bounds).toEqual(UB.zero());
		expect(spatial.__real).toBe(0);

		spatial.upsert({ id: "item", bounds: box });
		expect(spatial.bounds).toEqual(box);
		expect(spatial.__real).toBe(1);
		expect(spatial.query(box).has("item")).toBe(true);
	});

	test("first distinct real item after virtual-only inserts establishes exact bounds", () => {
		const spatial = new Spatial(32);
		const virtual = b(100, 100, 110, 110);
		const real = b(200, 200, 210, 210);
		spatial.upsert({ id: "virtual", bounds: virtual, virtual: true });

		spatial.upsert({ id: "real", bounds: real });
		expect(spatial.bounds).toEqual(real);
	});

	test("real to virtual with unchanged geometry removes it from world bounds", () => {
		const spatial = new Spatial(32);
		const box = b(100, 100, 110, 110);
		spatial.upsert({ id: "item", bounds: box });

		spatial.upsert({ id: "item", bounds: box, virtual: true });
		expect(spatial.bounds).toEqual(UB.zero());
		expect(spatial.__real).toBe(0);
		expect(spatial.query(box).has("item")).toBe(false);
	});

	test("real to virtual shrinks bounds while another real item remains", () => {
		const spatial = new Spatial(32);
		const kept = b(0, 0, 10, 10);
		const hidden = b(100, 100, 110, 110);
		spatial.upsert({ id: "kept", bounds: kept }, { id: "hidden", bounds: hidden });

		spatial.upsert({ id: "hidden", bounds: hidden, virtual: true });
		expect(spatial.bounds).toEqual(kept);
	});

	test("role transitions notify rebound only when effective world bounds change", () => {
		const spatial = new Spatial(32);
		const box = b(100, 100, 110, 110);
		const rebounds: CT.Bounds[] = [];
		spatial.onrebound((current) => rebounds.push({ ...current.bounds }));

		spatial.upsert({ id: "item", bounds: box, virtual: true });
		expect(rebounds).toEqual([]);
		spatial.upsert({ id: "item", bounds: box });
		expect(rebounds).toEqual([box]);
		spatial.upsert({ id: "item", bounds: box, virtual: true });
		expect(rebounds).toEqual([box, UB.zero()]);
	});

	test("virtual-only upsert does not notify rebound while real bounds are already dirty", () => {
		const spatial = new Spatial(32);
		spatial.upsert({ id: "kept", bounds: b(0, 0, 10, 10) }, { id: "removed", bounds: b(100, 100, 110, 110) });
		let rebounds = 0;
		spatial.onrebound(() => rebounds++);
		spatial.delete("removed");
		expect(spatial.__dirty).toBe(true);
		const after_real_delete = rebounds;

		spatial.upsert({ id: "overlay", bounds: b(200, 200, 210, 210), virtual: true });
		expect(rebounds).toBe(after_real_delete);
	});

	test("initial batch uses the final virtual role for duplicate ids", () => {
		const spatial = new Spatial(32);
		const box = b(100, 100, 110, 110);
		spatial.upsert({ id: "item", bounds: box }, { id: "item", bounds: box, virtual: true });
		expect(spatial.bounds).toEqual(UB.zero());
		expect(spatial.__index.get("item")?.virtual).toBe(true);
	});

	test("initial batch uses only the final geometry for duplicate ids", () => {
		const spatial = new Spatial(32);
		const first = b(0, 0, 10, 10);
		const final = b(100, 100, 110, 110);
		spatial.upsert({ id: "item", bounds: first }, { id: "item", bounds: final });
		expect(spatial.bounds).toEqual(final);
		expect(spatial.query(final).has("item")).toBe(true);
		expect(spatial.query(first).has("item")).toBe(false);
	});

	test("duplicate ids leave grid cells only for the final geometry", () => {
		const spatial = new Spatial(32);
		spatial.upsert({ id: "item", bounds: b(0, 0, 10, 10) }, { id: "item", bounds: b(100, 100, 110, 110) });
		expect(spatial.__cells.size).toBe(1);
		expect([...spatial.__cells.values()].every((cell) => cell.has("item"))).toBe(true);

		spatial.delete("item");
		expect(spatial.__cells.size).toBe(0);
	});

	test("duplicate ids do not emit transient view lifecycle hooks", () => {
		const spatial = new Spatial(32);
		const events: string[] = [];
		const view = spatial.slice(b(0, 0, 50, 50), {
			onmount: (id) => events.push(`mount:${id}`),
			onfrustum: (id) => events.push(`frustum:${id}`),
		});

		spatial.upsert({ id: "item", bounds: b(10, 10, 20, 20) }, { id: "item", bounds: b(100, 100, 110, 110) });
		expect(events).toEqual([]);
		expect(view.items.has("item")).toBe(false);
	});

	test("inherited virtual is ignored consistently by upsert, bounds and hit-query", () => {
		const spatial = new Spatial(32);
		const box = b(100, 100, 110, 110);
		const inherited = Object.assign(Object.create({ virtual: true }), { id: "inherited", bounds: box }) as SpatialItem;

		spatial.upsert(inherited);
		const stored = spatial.__index.get("inherited");
		expect(spatial.__real).toBe(1);
		expect(spatial.bounds).toEqual(box);
		expect(stored && Object.hasOwn(stored, "virtual")).toBe(false);
		expect(spatial.query(box)).toEqual(new Set(["inherited"]));
	});

	test("existing duplicate id emits one mount for the final outside-to-inside state", () => {
		const spatial = new Spatial(32);
		spatial.upsert({ id: "item", bounds: b(100, 100, 110, 110) });
		const events: string[] = [];
		const view = spatial.slice(b(0, 0, 50, 50), { onmount: (id) => events.push(`mount:${id}`) });

		spatial.upsert({ id: "item", bounds: b(200, 200, 210, 210) }, { id: "item", bounds: b(10, 10, 20, 20) });
		expect(events).toEqual(["mount:item"]);
		expect(view.items.has("item")).toBe(true);
	});

	test("dirty duplicate batch does not emit hooks for a superseded inside state", () => {
		const spatial = new Spatial(32);
		spatial.upsert({ id: "kept", bounds: b(0, 0, 10, 10) }, { id: "removed", bounds: b(100, 100, 110, 110) });
		spatial.delete("removed");
		expect(spatial.__dirty).toBe(true);
		const events: string[] = [];
		const view = spatial.slice(b(0, 0, 50, 50), {
			onmount: (id) => events.push(`mount:${id}`),
			onfrustum: (id) => events.push(`frustum:${id}`),
		});
		events.length = 0;

		spatial.upsert({ id: "item", bounds: b(10, 10, 20, 20) }, { id: "item", bounds: b(100, 100, 110, 110) });
		expect(events).toEqual([]);
		expect(view.items.has("item")).toBe(false);
	});
});

describe("Spatial.__real consistency", () => {
	const box = b(10, 10, 20, 20);
	const item = (virtual: boolean): SpatialItem => ({ id: "item", bounds: box, virtual });
	const transitions: [name: string, before: boolean, after: boolean, expected: number][] = [
		["real to real", false, false, 1],
		["virtual to virtual", true, true, 0],
		["real to virtual", false, true, 0],
		["virtual to real", true, false, 1],
	];

	test.each(transitions)("%s keeps the real count consistent", (_name: string, before: boolean, after: boolean, expected: number) => {
		const spatial = new Spatial(32);
		spatial.upsert(item(before));
		spatial.upsert(item(after));
		expect(spatial.__real).toBe(expected);
	});

	test("duplicate delete, dirty virtual upsert, recompute and destroy preserve the count", () => {
		const spatial = new Spatial(32);
		spatial.upsert({ id: "kept", bounds: b(0, 0, 10, 10) }, { id: "removed", bounds: b(100, 100, 110, 110) });
		expect(spatial.__real).toBe(2);

		spatial.delete("removed", "removed");
		expect(spatial.__real).toBe(1);
		expect(spatial.__dirty).toBe(true);

		spatial.upsert({ id: "overlay", bounds: b(200, 200, 210, 210), virtual: true });
		expect(spatial.__real).toBe(1);
		spatial.__recompute();
		expect(spatial.__real).toBe(1);

		spatial.destroy();
		expect(spatial.__real).toBe(0);
	});
});
