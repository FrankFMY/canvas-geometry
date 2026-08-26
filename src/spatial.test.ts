import { describe, expect, test } from "bun:test";
import { UB } from "./bounds.js";
import type { SpatialItem } from "./spatial.js";
import { Spatial } from "./spatial.js";
import type * as CT from "./types.js";

const c = (x: number, y: number): CT.C2 => ({ x, y });
const b = (minX: number, minY: number, maxX: number, maxY: number): CT.Bounds => ({ minX, minY, maxX, maxY });
const item = (id: string, bounds: CT.Bounds): SpatialItem => ({ id, bounds });

// ─── Spatial.geom / Spatial.clone: вариантные хелперы ───────────────────────

describe("Spatial.geom: извлечение голой геометрии из SpatialItem", () => {
	test("SpatialPoint → C2", () => {
		const it: SpatialItem = { id: "p", point: c(1, 2) };
		expect(Spatial.geom(it)).toEqual(c(1, 2));
	});

	test("SpatialBounds → Bounds", () => {
		const it: SpatialItem = { id: "b", bounds: b(-10, -20, 30, 40) };
		expect(Spatial.geom(it)).toEqual(b(-10, -20, 30, 40));
	});

	test("SpatialConvex → Convex", () => {
		const tri: CT.Convex = [c(0, 0), c(40, 0), c(20, 40), c(0, 0)];
		const it: SpatialItem = { id: "t", convex: tri };
		expect(Spatial.geom(it)).toBe(tri);
	});
});

describe("Spatial.clone: глубокая копия варианта", () => {
	test("SpatialPoint → копия с копией point", () => {
		const src: SpatialItem = { id: "p", point: c(1, 2) };
		const cp = Spatial.clone(src);
		expect(cp).toEqual(src);
		expect(cp).not.toBe(src);
		expect("point" in cp && cp.point).not.toBe("point" in src && src.point);
	});

	test("SpatialBounds → копия с копией bounds", () => {
		const src: SpatialItem = { id: "b", bounds: b(-10, -20, 30, 40) };
		const cp = Spatial.clone(src);
		expect(cp).toEqual(src);
		expect(cp).not.toBe(src);
		expect("bounds" in cp && cp.bounds).not.toBe("bounds" in src && src.bounds);
	});

	test("SpatialConvex → копия с глубокой копией вершин", () => {
		const tri: CT.Convex = [c(0, 0), c(40, 0), c(20, 40), c(0, 0)];
		const src: SpatialItem = { id: "t", convex: tri };
		const cp = Spatial.clone(src);
		expect(cp).toEqual(src);
		expect(cp).not.toBe(src);
		expect("convex" in cp && cp.convex).not.toBe(tri);
		expect(("convex" in cp && cp.convex[0]) || null).not.toBe(tri[0]);
	});

	test("clone: внешняя мутация исходника не влияет на копию", () => {
		const src: SpatialItem = { id: "b", bounds: b(-10, -20, 30, 40) };
		const cp = Spatial.clone(src);
		if ("bounds" in src) src.bounds.minX = 999;
		if ("bounds" in cp) expect(cp.bounds.minX).toBe(-10);
	});

	test("clone does not materialize an inherited virtual property", () => {
		const src = Object.assign(Object.create({ virtual: true }), {
			id: "inherited",
			bounds: b(0, 0, 10, 10),
		}) as SpatialItem;
		expect(Object.hasOwn(src, "virtual")).toBe(false);
		expect("virtual" in src).toBe(true);

		const cp = Spatial.clone(src);
		expect(Object.hasOwn(cp, "virtual")).toBe(false);
		expect("virtual" in cp).toBe(false);
	});

	test.each([true, false, undefined])("clone preserves an own virtual value: %p", (virtual: boolean | undefined) => {
		const src = { id: "item", bounds: b(0, 0, 10, 10), virtual } satisfies SpatialItem;
		const cp = Spatial.clone(src);
		expect(Object.hasOwn(cp, "virtual")).toBe(true);
		expect(cp.virtual).toBe(virtual);
	});
});

// ─── Инстанс: upsert, delete, bounds ─────────────────────────────────────────

describe("Spatial: upsert — вставка элементов и расширение bounds", () => {
	test("первая upsert задаёт bounds", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		expect(sp.bounds).toEqual(b(-10, -20, 30, 40));
	});

	test("upsert нескольких элементов → bounds = union", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)), item("b", b(50, 60, 100, 120)));
		expect(sp.bounds.minX).toBe(-10);
		expect(sp.bounds.maxX).toBe(100);
		expect(sp.bounds.minY).toBe(-20);
		expect(sp.bounds.maxY).toBe(120);
	});

	test("upsert с пустым массивом → no-op", () => {
		const sp = new Spatial();
		sp.upsert();
		expect(sp.bounds).toEqual(UB.zero());
	});

	test("upsert элементы копируются (не мутируют исходник)", () => {
		const sp = new Spatial();
		const b0 = b(-10, -20, 30, 40);
		sp.upsert(item("a", b0));
		// изменение исходного bounds не влияет на spatial
		b0.minX = 999;
		expect(sp.bounds.minX).toBe(-10);
	});

	test("добавление Convex-элемента", () => {
		const sp = new Spatial();
		const tri: CT.Convex = [c(-10, -20), c(30, -20), c(10, 40), c(-10, -20)];
		sp.upsert({ id: "tri", convex: tri });
		expect(sp.bounds.minX).toBeCloseTo(-10, 10);
		expect(sp.bounds.maxY).toBeCloseTo(40, 10);
	});
});

describe("Spatial: delete — удаление элементов", () => {
	test("удаление элемента сокращает bounds при необходимости", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));

		// b — exterior элемент (справа), удаление не должно сделать dirty
		sp.delete("b");
		// bounds должны остаться как у "a"
		expect(sp.bounds).toEqual(b(-10, -20, 30, 40));
	});

	test("удаление interior-элемента → dirty = true, bounds пересчитываются при геттере", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(0, 0, 20, 30)));

		sp.delete("a");
		// bounds getter должен пересчитать bounds
		expect(sp.bounds).toEqual(b(0, 0, 20, 30));
	});

	test("удаление несуществующего id → no-op", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.delete("nonexistent");
		expect(sp.bounds).toEqual(b(-10, -20, 30, 40));
	});

	test("удаление пустого списка → no-op", () => {
		const sp = new Spatial();
		sp.delete();
		expect(sp.bounds).toEqual(UB.zero());
	});

	test("удаление из пустого индекса → no-op", () => {
		const sp = new Spatial();
		sp.delete("a");
		expect(sp.bounds).toEqual(UB.zero());
	});

	test("удаление нескольких id", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));
		sp.upsert(item("c", b(-50, -60, -30, -40)));

		sp.delete("b", "c");
		expect(sp.bounds).toEqual(b(-10, -20, 30, 40));
	});
});

describe("Spatial: upsert — замена bounds существующего элемента", () => {
	test("upsert элемента: bounds расширяются при необходимости", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		sp.upsert(item("a", b(-10, -20, 60, 80)));
		expect(sp.bounds).toEqual(b(-10, -20, 60, 80));
	});

	test("upsert сужает interior-элемент → dirty, пересчитывает bounds", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));

		// b примыкает к правой и верхней границе bounds → interior = true
		// сужение interior-элемента вызывает dirty → полный recompute
		sp.upsert(item("b", b(50, 60, 70, 80)));
		expect(sp.bounds).toEqual(b(-10, -20, 70, 80));
	});

	test("upsert несуществующего id добавляет его", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		sp.upsert(item("new_id", b(100, 100, 200, 200)));
		expect(sp.bounds).toEqual(b(-10, -20, 200, 200));
	});

	test("upsert пустого списка → no-op", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert();
		expect(sp.bounds).toEqual(b(-10, -20, 30, 40));
	});

	test("upsert смещает границы в другом направлении", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		sp.upsert(item("a", b(-100, -200, -50, -100)));
		expect(sp.bounds).toEqual(b(-100, -200, -50, -100));
	});
});

describe("Spatial: upsert — существующий id (нет хвоста, short-circuit, слайсы)", () => {
	test("upsert существующего id не оставляет хвост в гриде", () => {
		const sp = new Spatial(32);
		sp.upsert(item("a", b(0, 0, 20, 20)));

		// перемещаем далеко — старые ячейки должны очиститься
		sp.upsert(item("a", b(500, 500, 520, 520)));

		expect(sp.query(b(5, 5, 15, 15)).size).toBe(0);
		expect(sp.ray(c(10, 10)).size).toBe(0);
		expect(sp.query(b(505, 505, 515, 515)).has("a")).toBe(true);
		expect(sp.ray(c(510, 510)).has("a")).toBe(true);
	});

	test("upsert в той же ячейке не трогает грид (cell-range short-circuit)", () => {
		const sp = new Spatial(128);
		sp.upsert(item("a", b(0, 0, 10, 10)));
		const cells_before = new Map<number, Set<string>>();
		for (const [k, v] of sp.__cells) cells_before.set(k, new Set(v));

		// сдвиг внутри той же ячейки — грид не должен меняться
		sp.upsert(item("a", b(1, 1, 9, 9)));

		expect(sp.__cells.size).toBe(cells_before.size);
		for (const [k, v] of sp.__cells) {
			const before = cells_before.get(k);
			expect(before).toBeDefined();
			expect([...v].sort()).toEqual([...before!].sort());
		}
		// но геометрия в индексе обновилась
		expect(sp.ray(c(5, 5)).has("a")).toBe(true);
	});

	test("upsert того же AABB — полный no-op грида, не выставляет dirty", () => {
		const sp = new Spatial(32);
		sp.upsert(item("a", b(0, 0, 20, 20)));
		sp.upsert(item("b", b(100, 100, 120, 120)));

		// a касается краёв мира → без AABB-eq guard повторная upsert(a) выставила бы dirty
		sp.upsert(item("a", b(0, 0, 20, 20)));

		expect(sp.__dirty).toBe(false);
		expect(sp.bounds).toEqual(b(0, 0, 120, 120));
	});

	test("upsert того же AABB с тем же id в батче — идемпотентна", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		const bounds_before = { ...sp.bounds };

		sp.upsert(item("a", b(-10, -20, 30, 40)));
		expect(sp.__dirty).toBe(false);
		expect(sp.bounds).toEqual(bounds_before);
	});

	test("upsert сужает interior-элемент → dirty, корректный bounds", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));

		// b примыкает к правой/верхней границе bounds → interior = true
		sp.upsert(item("b", b(50, 60, 70, 80)));
		expect(sp.bounds).toEqual(b(-10, -20, 70, 80));
	});

	test("upsert существующего id в слайсе — ровно один onmount/onfrustum", () => {
		const sp = new Spatial();
		const mounted: string[] = [];
		const frustumed: string[] = [];
		sp.slice(b(0, 0, 50, 50), {
			onmount: (id) => mounted.push(id),
			onfrustum: (id) => frustumed.push(id),
		});

		// войти в слайс
		sp.upsert(item("a", b(10, 10, 30, 30)));
		expect(mounted.filter((x) => x === "a")).toHaveLength(1);
		expect(frustumed).toHaveLength(0);

		// вывести из слайса — один onfrustum, без повторного onmount
		sp.upsert(item("a", b(1000, 1000, 2000, 2000)));
		expect(frustumed.filter((x) => x === "a")).toHaveLength(1);
		expect(mounted.filter((x) => x === "a")).toHaveLength(1);

		// вернуть — один onmount
		sp.upsert(item("a", b(10, 10, 30, 30)));
		expect(mounted.filter((x) => x === "a")).toHaveLength(2);
		expect(frustumed.filter((x) => x === "a")).toHaveLength(1);
	});

	test("upsert существующего id с той же геометрией в слайсе — хуки не дёргаются", () => {
		const sp = new Spatial();
		const mounted: string[] = [];
		const frustumed: string[] = [];
		sp.slice(b(0, 0, 50, 50), {
			onmount: (id) => mounted.push(id),
			onfrustum: (id) => frustumed.push(id),
		});

		sp.upsert(item("a", b(10, 10, 30, 30)));
		mounted.length = 0;
		frustumed.length = 0;

		// идемпотентная перезапись того же AABB — __update всё равно зовётся,
		// но was_in && is_in_after → хуки не триггерятся
		sp.upsert(item("a", b(10, 10, 30, 30)));
		expect(mounted).toHaveLength(0);
		expect(frustumed).toHaveLength(0);
	});
});

describe("Spatial.bounds: геттер с ленивым __recompute", () => {
	test("bounds без элементов → UB.zero()", () => {
		const sp = new Spatial();
		expect(sp.bounds).toEqual(UB.zero());
	});

	test("bounds после upsert и delete interior → пересчитывается корректно", () => {
		const sp = new Spatial();
		sp.upsert(item("outer", b(-10, -20, 30, 40)));
		sp.upsert(item("inner", b(0, 0, 10, 10)));

		sp.delete("outer");
		expect(sp.bounds).toEqual(b(0, 0, 10, 10));
	});

	test("последовательные delete после __dirty", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(0, 0, 20, 30)));

		sp.delete("a");
		sp.delete("b");
		expect(sp.bounds).toEqual(UB.zero());
	});
});

// ─── Инстанс: query, ray ─────────────────────────────────────────────────────

describe("Spatial.query: поиск id по bounds", () => {
	test("bounds запроса не пересекаются с индексом → пустой Set", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));

		const result = sp.query(b(500, 500, 600, 600));
		expect(result.size).toBe(0);
	});

	test("bounds запроса пересекаются с частью элементов", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));

		const result = sp.query(b(-50, -50, 20, 50));
		expect(result.has("a")).toBe(true);
		expect(result.has("b")).toBe(false);
	});

	test("bounds запроса пересекаются с несколькими элементами", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(20, 30, 100, 120)));

		const result = sp.query(b(-5, -5, 35, 35));
		expect(result.has("a")).toBe(true);
		expect(result.has("b")).toBe(true);
	});

	test("query не пересекающийся с bounds индекса → quick-reject", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		// этот запрос никак не пересекается с пространством индекса
		const result = sp.query(b(1000, 1000, 2000, 2000));
		expect(result.size).toBe(0);
	});
});

describe("Spatial.ray: поиск id по точке", () => {
	test("точка внутри элемента → Set с id", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		const result = sp.ray(c(15, 10));
		expect(result.has("a")).toBe(true);
		expect(result.size).toBe(1);
	});

	test("точка снаружи всех элементов → пустой Set", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		const result = sp.ray(c(50, 60));
		expect(result.size).toBe(0);
	});

	test("точка на границе → false (канон владения)", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		const result = sp.ray(c(-10, 10));
		expect(result.size).toBe(0);
	});

	test("точка внутри нескольких элементов", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(0, 0, 50, 50)));

		const result = sp.ray(c(15, 10));
		expect(result.has("a")).toBe(true);
		expect(result.has("b")).toBe(true);
	});

	test("ray с точкой снаружи bounds индекса → quick-reject", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		const result = sp.ray(c(1000, 1000));
		expect(result.size).toBe(0);
	});
});

// ─── Инстанс: slice / SpatialView ───────────────────────────────────────────

describe("Spatial.slice: создание SpatialView", () => {
	test("slice при создании наполняется элементами, пересекающими bounds", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));
		sp.upsert(item("c", b(15, 0, 25, 10)));

		const view = sp.slice(b(0, 0, 50, 50));
		expect(view.items.has("a")).toBe(true);
		expect(view.items.has("c")).toBe(true);
		expect(view.items.has("b")).toBe(false);
	});

	test("хук onmount вызывается для каждого элемента в slice", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(15, 0, 25, 10)));

		const mounted: string[] = [];
		sp.slice(b(0, 0, 50, 50), { onmount: (id) => mounted.push(id) });
		expect(mounted).toContain("a");
		expect(mounted).toContain("b");
	});

	test("slice с bounds не пересекающим индексовые → items пуст", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		const view = sp.slice(b(1000, 1000, 2000, 2000));
		expect(view.items.size).toBe(0);
	});

	test("последующая upsert попадает в slice если пересекается", () => {
		const sp = new Spatial();
		const mounted: string[] = [];
		const view = sp.slice(b(0, 0, 50, 50), { onmount: (id) => mounted.push(id) });

		sp.upsert(item("new_item", b(20, 20, 30, 30)));
		expect(view.items.has("new_item")).toBe(true);
		expect(mounted).toContain("new_item");
	});

	test("последующая upsert не попадает в slice если не пересекается", () => {
		const sp = new Spatial();
		const view = sp.slice(b(0, 0, 50, 50));

		sp.upsert(item("far", b(1000, 1000, 2000, 2000)));
		expect(view.items.has("far")).toBe(false);
	});
});

describe("SpatialView.relocate: пересчёт items под новые bounds", () => {
	test("relocate добавляет новые элементы и вызывает onmount", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));

		const mounted: string[] = [];
		const frustumed: string[] = [];
		const view = sp.slice(b(-5, -5, 35, 35), {
			onmount: (id) => mounted.push(id),
			onfrustum: (id) => frustumed.push(id),
		});

		// "a" уже в items, "b" — нет
		mounted.length = 0;
		frustumed.length = 0;

		view.relocate(b(0, 0, 120, 120));
		expect(view.items.has("b")).toBe(true);
		expect(mounted).toContain("b");
	});

	test("relocate убирает элементы, вышедшие за bounds, и вызывает onfrustum", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));

		const frustumed: string[] = [];
		const view = sp.slice(b(-5, -5, 120, 120), {
			onfrustum: (id) => frustumed.push(id),
		});

		frustumed.length = 0;

		view.relocate(b(-5, -5, 35, 35));
		expect(view.items.has("b")).toBe(false);
		expect(frustumed).toContain("b");
	});
});

describe("SpatialView: upsert/delete в родительском Spatial → авто-обновление вьюхи", () => {
	test("spatial.delete удаляет из slice и вызывает onfrustum", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		const frustumed: string[] = [];
		const view = sp.slice(b(0, 0, 35, 40), { onfrustum: (id) => frustumed.push(id) });

		sp.delete("a");
		expect(view.items.has("a")).toBe(false);
		expect(frustumed).toContain("a");
	});

	test("spatial.upsert: элемент выходит из slice → onfrustum", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		const frustumed: string[] = [];
		const view = sp.slice(b(0, 0, 35, 40), { onfrustum: (id) => frustumed.push(id) });

		// перемещаем элемент далеко за пределы вьюхи
		sp.upsert(item("a", b(1000, 1000, 2000, 2000)));
		expect(view.items.has("a")).toBe(false);
		expect(frustumed).toContain("a");
	});

	test("spatial.upsert: элемент входит в slice → onmount", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(1000, 1000, 2000, 2000)));

		const mounted: string[] = [];
		const view = sp.slice(b(0, 0, 35, 40), { onmount: (id) => mounted.push(id) });

		// перемещаем элемент внутрь вьюхи
		sp.upsert(item("a", b(10, 10, 30, 30)));
		expect(view.items.has("a")).toBe(true);
		expect(mounted).toContain("a");
	});
});

describe("SpatialView.query: быстрый поиск через кэш фрустума", () => {
	test("query внутри bounds вьюхи → проход по items", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));

		const view = sp.slice(b(-20, -30, 120, 130));
		const result = view.query(b(0, 0, 15, 10));
		expect(result.has("a")).toBe(true);
		expect(result.has("b")).toBe(false);
	});

	test("query вне bounds вьюхи → делегирует в Spatial.query", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));

		const view = sp.slice(b(-5, -5, 35, 35));
		// запрос за пределами bounds вьюхи, но пересекает "b"
		const result = view.query(b(50, 60, 80, 80));
		expect(result.has("b")).toBe(true);
	});
});

describe("SpatialView.ray: поиск точки через кэш фрустума", () => {
	test("ray внутри bounds вьюхи → проход по items", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));

		const view = sp.slice(b(-20, -30, 120, 130));
		const result = view.ray(c(15, 10));
		expect(result.has("a")).toBe(true);
		expect(result.has("b")).toBe(false);
	});

	test("ray вне bounds вьюхи → делегирует в Spatial.ray", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));

		const view = sp.slice(b(-5, -5, 35, 35));
		const result = view.ray(c(70, 80));
		expect(result.has("b")).toBe(true);
	});
});

// ─── Инстанс: invalidate, clear, destroy ────────────────────────────────────

describe("Spatial.invalidate: горячая замена элемента с хуками", () => {
	test("invalidate вызывает onfrustum → inject → onmount для элемента в slice", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		const events: string[] = [];
		const _view = sp.slice(b(0, 0, 50, 50), {
			onmount: (id) => events.push(`mount:${id}`),
			onfrustum: (id) => events.push(`frustum:${id}`),
		});

		events.length = 0;
		sp.invalidate("a", () => events.push("inject"));

		expect(events).toEqual(["frustum:a", "inject", "mount:a"]);
	});

	test("invalidate для id не в slice → хуки не вызываются", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(1000, 1000, 2000, 2000)));

		const events: string[] = [];
		sp.slice(b(0, 0, 50, 50), {
			onmount: (id) => events.push(`mount:${id}`),
			onfrustum: (id) => events.push(`frustum:${id}`),
		});

		events.length = 0;
		sp.invalidate("a", () => events.push("inject"));

		expect(events).toEqual([]);
	});
});

describe("Spatial.clear: полный сброс индекса", () => {
	test("clear очищает индекс, bounds и slices", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));
		sp.upsert(item("b", b(50, 60, 100, 120)));

		sp.slice(b(0, 0, 50, 50));

		sp.destroy();
		expect(sp.bounds).toEqual(UB.zero());
		// больше ничего нельзя, но можно заново добавлять
		sp.upsert(item("c", b(5, 5, 15, 15)));
		expect(sp.bounds).toEqual(b(5, 5, 15, 15));
	});
});

describe("SpatialView.destroy: отписка + очистка items", () => {
	test("destroy очищает items и отписывает от Spatial", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		const view = sp.slice(b(0, 0, 50, 50));
		expect(view.items.size).toBeGreaterThan(0);

		view.destroy();
		expect(view.items.size).toBe(0);

		// последующая upsert не должна обновлять вьюху
		sp.upsert(item("b", b(20, 20, 25, 25)));
		expect(view.items.size).toBe(0);
	});

	test("destroy очищает items с отпиской — upsert уже не обновляет", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		const view = sp.slice(b(0, 0, 50, 50));
		view.destroy();
		expect(view.items.size).toBe(0);

		// вьюха всё уже не подписана
		sp.upsert(item("b", b(20, 20, 25, 25)));
		expect(view.items.has("b")).toBe(false);
	});
});

// ─── Инстанс: onrebound ─────────────────────────────────────────────────────

describe("Spatial.onrebound: подписка на изменение bounds", () => {
	test("onrebound вызывается при изменении bounds через upsert", () => {
		const sp = new Spatial();
		const calls: CT.Bounds[] = [];
		sp.onrebound((s) => calls.push({ ...s.bounds }));

		sp.upsert(item("a", b(-10, -20, 30, 40)));
		expect(calls.length).toBe(1);
		expect(calls[0]).toEqual(b(-10, -20, 30, 40));
	});

	test("onrebound вызывается при расширении bounds", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(-10, -20, 30, 40)));

		const calls: CT.Bounds[] = [];
		sp.onrebound((s) => calls.push({ ...s.bounds }));

		sp.upsert(item("b", b(50, 60, 100, 120)));
		expect(calls.length).toBe(1);
		expect(calls[0]).toEqual(b(-10, -20, 100, 120));
	});

	test("отписка: возвращённая функция удаляет подписчика", () => {
		const sp = new Spatial();
		const calls: CT.Bounds[] = [];
		const unsub = sp.onrebound((s) => calls.push({ ...s.bounds }));

		unsub();

		sp.upsert(item("a", b(-10, -20, 30, 40)));
		expect(calls.length).toBe(0);
	});
});

// ─── Грид: корректность broad-phase (мультиячеечная вставка, кластеры, cell size) ──

describe("Spatial: грид — корректность при разных размерах ячейки", () => {
	test("объект больше ячейки (спан по нескольким ячейкам) находится один раз", () => {
		const sp = new Spatial(16);
		// объект 200×200 при cell=16 ложится в ~13×13 ячеек
		sp.upsert(item("big", b(0, 0, 200, 200)));

		const result = sp.query(b(190, 190, 195, 195));
		expect(result.has("big")).toBe(true);
		expect(result.size).toBe(1);
	});

	test("маленький объект попадает ровно в свою ячейку и находится точечным ray", () => {
		const sp = new Spatial(64);
		sp.upsert(item("dot", b(1000, 1000, 1020, 1020)));

		expect(sp.ray(c(1010, 1010)).has("dot")).toBe(true);
		// соседняя ячейка — пусто
		expect(sp.ray(c(900, 900)).size).toBe(0);
	});

	test("плотный кластер: query возвращает только реально пересечённые", () => {
		const sp = new Spatial(32);
		// сетка 10×10 мелких объектов по 20×20 с шагом 30 (не пересекаются)
		for (let i = 0; i < 10; i++) {
			for (let j = 0; j < 10; j++) {
				sp.upsert(item(`o_${i}_${j}`, b(i * 30, j * 30, i * 30 + 20, j * 30 + 20)));
			}
		}
		expect(sp.__index.size).toBe(100);

		// запрос 20×20 вокруг одного объекта — не должен тащить весь кластер
		const result = sp.query(b(5, 5, 15, 15));
		expect(result.has("o_0_0")).toBe(true);
		// объект o_1_1 в (30..50) — не пересекается с (5..15)
		expect(result.has("o_1_1")).toBe(false);
	});

	test("пустые зоны не мешают: query в дырке между кластерами → пусто", () => {
		const sp = new Spatial(64);
		sp.upsert(item("left", b(-1000, 0, -980, 20)));
		sp.upsert(item("right", b(1000, 0, 1020, 20)));

		expect(sp.query(b(-10, -10, 10, 10)).size).toBe(0);
	});
});

describe("Spatial: грид — синхронизация при delete/upsert", () => {
	test("delete убирает из грида: query больше не находит", () => {
		const sp = new Spatial(32);
		sp.upsert(item("a", b(0, 0, 20, 20)));
		expect(sp.query(b(5, 5, 15, 15)).has("a")).toBe(true);

		sp.delete("a");
		expect(sp.query(b(5, 5, 15, 15)).size).toBe(0);
		// грид не оставил пустых ячеек
		expect(sp.__cells.size).toBe(0);
	});

	test("upsert перемещает объект между ячейками: старое место пустеет, новое находит", () => {
		const sp = new Spatial(32);
		sp.upsert(item("a", b(0, 0, 20, 20)));

		sp.upsert(item("a", b(500, 500, 520, 520)));

		expect(sp.query(b(5, 5, 15, 15)).size).toBe(0);
		expect(sp.query(b(505, 505, 515, 515)).has("a")).toBe(true);
	});

	test("upsert, сужающий объект, чистит освободившиеся ячейки", () => {
		const sp = new Spatial(32);
		sp.upsert(item("a", b(0, 0, 200, 200)));
		const cells_before = sp.__cells.size;

		sp.upsert(item("a", b(0, 0, 20, 20)));
		expect(sp.__cells.size).toBeLessThan(cells_before);
		expect(sp.query(b(150, 150, 160, 160)).size).toBe(0);
	});

	test("clear очищает грид", () => {
		const sp = new Spatial(32);
		sp.upsert(item("a", b(0, 0, 20, 20)), item("b", b(100, 100, 120, 120)));
		sp.destroy();
		expect(sp.__cells.size).toBe(0);
		expect(sp.query(b(5, 5, 15, 15)).size).toBe(0);
	});

	test("Convex-объект тоже индексируется гридом по своему AABB", () => {
		const sp = new Spatial(32);
		const tri: CT.Convex = [c(0, 0), c(40, 0), c(20, 40), c(0, 0)];
		sp.upsert({ id: "tri", convex: tri });

		// точка внутри треугольника
		expect(sp.ray(c(20, 10)).has("tri")).toBe(true);
		// query, пересекающий AABB треугольника
		expect(sp.query(b(10, 5, 30, 15)).has("tri")).toBe(true);
	});
});

// ─── radial: ближайшие объекты и расстояния ──────────────────────────────────

describe("Spatial.radial: ближайшие объекты в радиусе", () => {
	test("объект в радиусе → в Map с расстоянием до его AABB", () => {
		const sp = new Spatial(64);
		// объект справа от точки: ближайшая грань на x=100
		sp.upsert(item("a", b(100, -10, 120, 10)));

		const result = sp.radial(c(0, 0), 150);
		expect(result.has("a")).toBe(true);
		expect(result.get("a")).toBeCloseTo(100, 6);
	});

	test("объект вне радиуса → не попадает", () => {
		const sp = new Spatial(64);
		sp.upsert(item("a", b(100, -10, 120, 10)));

		expect(sp.radial(c(0, 0), 50).has("a")).toBe(false);
	});

	test("точка внутри объекта → расстояние 0", () => {
		const sp = new Spatial(64);
		sp.upsert(item("a", b(-10, -10, 10, 10)));

		const result = sp.radial(c(0, 0), 5);
		expect(result.get("a")).toBe(0);
	});

	test("несколько объектов: все в радиусе с корректными расстояниями", () => {
		const sp = new Spatial(64);
		sp.upsert(item("near", b(10, -5, 20, 5)));
		sp.upsert(item("far", b(200, -5, 210, 5)));

		const result = sp.radial(c(0, 0), 100);
		expect(result.has("near")).toBe(true);
		expect(result.has("far")).toBe(false);
		expect(result.get("near")).toBeCloseTo(10, 6);
	});

	test("пустой индекс → пустой Map", () => {
		const sp = new Spatial();
		expect(sp.radial(c(0, 0), 100).size).toBe(0);
	});

	test("отрицательный радиус → пустой Map", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(0, 0, 10, 10)));
		expect(sp.radial(c(5, 5), -1).size).toBe(0);
	});

	test("radius 0: попадают только объекты, владеющие точкой (dist 0)", () => {
		const sp = new Spatial(64);
		sp.upsert(item("under", b(-10, -10, 10, 10)));
		sp.upsert(item("beside", b(20, 20, 30, 30)));

		const result = sp.radial(c(0, 0), 0);
		expect(result.get("under")).toBe(0);
		expect(result.has("beside")).toBe(false);
	});

	test("Convex: расстояние считается до AABB (приближение)", () => {
		const sp = new Spatial(64);
		const tri: CT.Convex = [c(100, 0), c(140, 0), c(120, 40), c(100, 0)];
		sp.upsert({ id: "tri", convex: tri });

		const result = sp.radial(c(0, 0), 150);
		expect(result.has("tri")).toBe(true);
		// AABB треугольника minX=100 → расстояние по X = 100 (точка на оси Y=0 в диапазоне AABB)
		expect(result.get("tri")).toBeCloseTo(100, 6);
	});
});

// ─── SpatialView: делегирование query/ray/radial в грид ──────────────────────

describe("SpatialView: query/ray/radial делегируют в грид-ускоренный Spatial", () => {
	test("view.query находит объект под курсором даже вне фрустума вьюхи", () => {
		const sp = new Spatial(64);
		sp.upsert(item("out", b(1000, 1000, 1020, 1020)));
		const view = sp.slice(b(0, 0, 100, 100));

		// курсор выехал за экран — объект не в items, но грид его найдёт
		expect(view.items.has("out")).toBe(false);
		expect(view.query(b(1005, 1005, 1015, 1015)).has("out")).toBe(true);
	});

	test("view.radial делегирует в Spatial.radial", () => {
		const sp = new Spatial(64);
		sp.upsert(item("a", b(10, -5, 20, 5)));
		const view = sp.slice(b(-100, -100, 100, 100));

		expect(view.radial(c(0, 0), 100).get("a")).toBeCloseTo(10, 6);
	});
});

// ─── SpatialItem: вариантные C2/Convex + C2/Convex-фрустум ─────────────────

describe("Spatial.upsert/ray/query: SpatialPoint (C2) айтем", () => {
	test("upsert {id, point} и ray по точке-владельцу → true (точка обладает собой)", () => {
		const sp = new Spatial(64);
		sp.upsert({ id: "p", point: c(10, 10) });

		expect(sp.ray(c(10, 10)).has("p")).toBe(true);
	});

	test("ray по точке-не-владельцу → false", () => {
		const sp = new Spatial(64);
		sp.upsert({ id: "p", point: c(10, 10) });

		expect(sp.ray(c(11, 10)).has("p")).toBe(false);
	});

	test("query(C2) находит айтем-point только при совпадении", () => {
		const sp = new Spatial(64);
		sp.upsert({ id: "p", point: c(10, 10) });

		expect(sp.query(c(10, 10)).has("p")).toBe(true);
		expect(sp.query(c(50, 50)).has("p")).toBe(false);
	});

	test("query(Bounds) находит point внутри bounds", () => {
		const sp = new Spatial(64);
		sp.upsert({ id: "p", point: c(10, 10) });

		expect(sp.query(b(0, 0, 20, 20)).has("p")).toBe(true);
		// точка на границе запроса → не владеет (канон владения)
		expect(sp.query(b(0, 0, 10, 20)).has("p")).toBe(false);
	});

	test("bounds мира расширяется точкой", () => {
		const sp = new Spatial();
		sp.upsert({ id: "p", point: c(15, 25) });
		expect(sp.bounds).toEqual(b(15, 25, 15, 25));
	});
});

describe("SpatialView: фрустум как C2", () => {
	test("slice(C2) и relocate(C2) трекают point-айтем", () => {
		const sp = new Spatial(64);
		sp.upsert({ id: "p", point: c(10, 10) });

		const view = sp.slice(c(10, 10));
		expect(view.items.has("p")).toBe(true);
		expect(view.geom).toEqual(c(10, 10));
	});

	test("relocate(C2) в другую точку убирает старый и добавляет новый", () => {
		const sp = new Spatial(64);
		sp.upsert({ id: "a", point: c(10, 10) });
		sp.upsert({ id: "b", point: c(50, 50) });

		const mounted: string[] = [];
		const frustumed: string[] = [];
		const view = sp.slice(c(10, 10), {
			onmount: (id) => mounted.push(id),
			onfrustum: (id) => frustumed.push(id),
		});
		expect(view.items.has("a")).toBe(true);

		mounted.length = 0;
		frustumed.length = 0;
		view.relocate(c(50, 50));
		expect(view.items.has("b")).toBe(true);
		expect(view.items.has("a")).toBe(false);
		expect(frustumed).toContain("a");
		expect(mounted).toContain("b");
	});
});

describe("SpatialView: фрустум как Convex", () => {
	test("slice(Convex) наполняется элементами внутри полигона", () => {
		const sp = new Spatial(64);
		sp.upsert(item("inside", b(10, 10, 20, 20)));
		sp.upsert(item("outside", b(1000, 1000, 1010, 1010)));

		const tri: CT.Convex = [c(0, 0), c(100, 0), c(50, 100), c(0, 0)];
		const view = sp.slice(tri);
		expect(view.items.has("inside")).toBe(true);
		expect(view.items.has("outside")).toBe(false);
		expect(view.geom).toEqual(tri);
	});

	test("relocate(Convex) обновляет items по новому полигону", () => {
		const sp = new Spatial(64);
		sp.upsert(item("a", b(10, 10, 20, 20)));
		sp.upsert(item("b", b(500, 10, 520, 20)));

		const tri_a: CT.Convex = [c(0, 0), c(100, 0), c(50, 100), c(0, 0)];
		const tri_b: CT.Convex = [c(490, 0), c(600, 0), c(540, 100), c(490, 0)];
		const view = sp.slice(tri_a);
		expect(view.items.has("a")).toBe(true);
		expect(view.items.has("b")).toBe(false);

		view.relocate(tri_b);
		expect(view.items.has("b")).toBe(true);
		expect(view.items.has("a")).toBe(false);
		expect(view.geom).toEqual(tri_b);
	});

	test("view.query принимает Convex как геометрию запроса", () => {
		const sp = new Spatial(64);
		sp.upsert(item("hit", b(10, 10, 20, 20)));
		sp.upsert(item("miss", b(1000, 1000, 1010, 1010)));

		const view = sp.slice(b(-100, -100, 2000, 2000));
		const tri: CT.Convex = [c(0, 0), c(100, 0), c(50, 100), c(0, 0)];
		expect(view.query(tri).has("hit")).toBe(true);
		expect(view.query(tri).has("miss")).toBe(false);
	});
});

// ─── SpatialPolyline: ломаная как элемент индекса ─────────────────────────────

describe("Spatial: SpatialPolyline — geom/clone", () => {
	test("Spatial.geom извлекает polyline", () => {
		const it: SpatialItem = { id: "pl", polyline: [c(1, 2), c(3, 4)] };
		expect(Spatial.geom(it)).toEqual([c(1, 2), c(3, 4)]);
	});

	test("Spatial.clone копирует polyline глубоко", () => {
		const src: SpatialItem = { id: "pl", polyline: [c(0, 0), c(10, 0), c(10, 10)] };
		const cp = Spatial.clone(src);
		expect(cp).toEqual(src);
		expect(cp).not.toBe(src);
		if ("polyline" in cp && "polyline" in src) {
			expect(cp.polyline).not.toBe(src.polyline);
			expect(cp.polyline[0]).not.toBe(src.polyline[0]);
		}
	});

	test("clone: внешняя мутация исходника не влияет на копию", () => {
		const src: SpatialItem = { id: "pl", polyline: [c(0, 0), c(10, 0)] };
		const cp = Spatial.clone(src);
		if ("polyline" in src) src.polyline[0] = c(999, 999);
		if ("polyline" in cp) expect(cp.polyline[0]).toEqual(c(0, 0));
	});
});

describe("Spatial: SpatialPolyline — upsert/delete/bounds", () => {
	test("upsert ломаной расширяет bounds по AABB вершин", () => {
		const sp = new Spatial();
		sp.upsert({ id: "pl", polyline: [c(-10, -20), c(30, -20), c(10, 40)] });
		expect(sp.bounds.minX).toBeCloseTo(-10, 10);
		expect(sp.bounds.maxX).toBeCloseTo(30, 10);
		expect(sp.bounds.minY).toBeCloseTo(-20, 10);
		expect(sp.bounds.maxY).toBeCloseTo(40, 10);
	});

	test("upsert копирует ломаную (внешняя мутация не влияет)", () => {
		const sp = new Spatial();
		const poly = [c(-10, -20), c(30, -20), c(10, 40)];
		sp.upsert({ id: "pl", polyline: poly });
		poly[0] = c(999, 999);
		expect(sp.bounds.minX).toBeCloseTo(-10, 10);
	});

	test("delete ломаной сокращает bounds", () => {
		const sp = new Spatial();
		sp.upsert(item("a", b(0, 0, 10, 10)));
		sp.upsert({ id: "pl", polyline: [c(100, 100), c(200, 100), c(150, 200)] });
		sp.delete("pl");
		expect(sp.bounds).toEqual(b(0, 0, 10, 10));
	});
});

describe("Spatial: SpatialPolyline — query/ray/radial", () => {
	test("query находит ломаную, пересекающую запрос-Bounds", () => {
		const sp = new Spatial(32);
		// ломаная (0,0)-(100,0): проходит через bounds (10,−5,30,5)
		sp.upsert({ id: "pl", polyline: [c(0, 0), c(100, 0)] });
		expect(sp.query(b(10, -5, 30, 5)).has("pl")).toBe(true);
	});

	test("ray находит ломаную, владеющую точкой (точка на открытом сегменте)", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "pl", polyline: [c(0, 0), c(100, 0)] });
		// (50,0) строго внутри сегмента → владеет
		expect(sp.ray(c(50, 0)).has("pl")).toBe(true);
	});

	test("ray не находит ломаную, если точка — крайний конец (не владеет)", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "pl", polyline: [c(0, 0), c(100, 0)] });
		expect(sp.ray(c(0, 0)).has("pl")).toBe(false);
		expect(sp.ray(c(100, 0)).has("pl")).toBe(false);
	});

	test("radial меряет расстояние до AABB ломаной", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "pl", polyline: [c(100, 100), c(200, 100)] });
		const res = sp.radial(c(100, 0), 150);
		expect(res.has("pl")).toBe(true);
	});
});

describe("SpatialView: фрустум как Polyline", () => {
	test("slice(Polyline) наполняется элементами, пересекающими ломаную", () => {
		const sp = new Spatial(32);
		// bounds внутри области ломаной не пересекают саму ломаную (она 1D),
		// но bounds, задевающий сегмент — пересекает.
		sp.upsert(item("hit", b(5, -5, 15, 5))); // bounds пересекает сегмент (0,0)-(100,0)
		sp.upsert(item("miss", b(1000, 1000, 1010, 1010)));

		const poly: CT.Polyline = [c(0, 0), c(100, 0)];
		const view = sp.slice(poly);
		expect(view.items.has("hit")).toBe(true);
		expect(view.items.has("miss")).toBe(false);
		expect(view.geom).toEqual(poly);
	});

	test("relocate(Polyline) обновляет items по новой ломаной", () => {
		const sp = new Spatial(32);
		sp.upsert(item("a", b(5, -5, 15, 5)));
		sp.upsert(item("b", b(505, -5, 515, 5)));

		const pl_a: CT.Polyline = [c(0, 0), c(100, 0)];
		const pl_b: CT.Polyline = [c(500, 0), c(600, 0)];
		const view = sp.slice(pl_a);
		expect(view.items.has("a")).toBe(true);
		expect(view.items.has("b")).toBe(false);

		view.relocate(pl_b);
		expect(view.items.has("b")).toBe(true);
		expect(view.items.has("a")).toBe(false);
	});

	test("view.query принимает Polyline как геометрию запроса", () => {
		const sp = new Spatial(32);
		sp.upsert(item("hit", b(5, -5, 15, 5)));
		sp.upsert(item("miss", b(1000, 1000, 1010, 1010)));

		const view = sp.slice(b(-100, -100, 2000, 2000));
		const poly: CT.Polyline = [c(0, 0), c(100, 0)];
		expect(view.query(poly).has("hit")).toBe(true);
		expect(view.query(poly).has("miss")).toBe(false);
	});
});

// ─── SpatialItem.virtual: оверлейная видимость ─────────────────────────────────
//
// virtual-элемент лежит в __index и __cells, участвует в slice onmount/onfrustum,
// но НЕ находится через query/ray/radial и НЕ влияет на мировой bounds/onrebound.

describe("SpatialItem.virtual: тип и копирование", () => {
	test("virtual?: boolean присутствует во всех вариантах SpatialItem", () => {
		const p: SpatialItem = { id: "p", point: c(0, 0), virtual: true };
		const bx: SpatialItem = { id: "bx", bounds: b(0, 0, 10, 10), virtual: true };
		const cx: SpatialItem = { id: "cx", convex: [c(0, 0), c(10, 0), c(5, 10), c(0, 0)], virtual: true };
		const pl: SpatialItem = { id: "pl", polyline: [c(0, 0), c(10, 0)], virtual: true };
		expect(p.virtual).toBe(true);
		expect(bx.virtual).toBe(true);
		expect(cx.virtual).toBe(true);
		expect(pl.virtual).toBe(true);
	});

	test("virtual?: undefined по умолчанию (опциональный флаг)", () => {
		const it: SpatialItem = { id: "x", bounds: b(0, 0, 10, 10) };
		expect(it.virtual).toBeUndefined();
	});

	test("Spatial.clone сохраняет virtual: true", () => {
		const src: SpatialItem = { id: "v", bounds: b(0, 0, 10, 10), virtual: true };
		const cp = Spatial.clone(src);
		expect(cp).not.toBe(src);
		expect(cp.virtual).toBe(true);
	});

	test("Spatial.clone сохраняет virtual: undefined (не превращает в true)", () => {
		const src: SpatialItem = { id: "v", bounds: b(0, 0, 10, 10) };
		const cp = Spatial.clone(src);
		expect(cp.virtual).toBeUndefined();
	});

	test("Spatial.clone не материализует отсутствующий optional virtual key", () => {
		const src: SpatialItem = { id: "source", bounds: b(0, 0, 10, 10) };
		const cp = Spatial.clone(src);
		expect("virtual" in cp).toBe(false);
		expect(Object.keys(cp)).toEqual(["id", "bounds"]);
	});
});

describe("SpatialItem.virtual: query/ray/radial не находят virtual", () => {
	test("query(Bounds) пропускает virtual — возвращает только реальные", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "real", bounds: b(0, 0, 20, 20) });
		sp.upsert({ id: "virt", bounds: b(0, 0, 20, 20), virtual: true });

		const result = sp.query(b(5, 5, 15, 15));
		expect(result.has("real")).toBe(true);
		expect(result.has("virt")).toBe(false);
	});

	test("ray(p) пропускает virtual", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "real", bounds: b(0, 0, 20, 20) });
		sp.upsert({ id: "virt", bounds: b(0, 0, 20, 20), virtual: true });

		expect(sp.ray(c(10, 10)).has("real")).toBe(true);
		expect(sp.ray(c(10, 10)).has("virt")).toBe(false);
	});

	test("radial пропускает virtual", () => {
		const sp = new Spatial(64);
		sp.upsert({ id: "real", bounds: b(10, -5, 20, 5) });
		sp.upsert({ id: "virt", bounds: b(10, -5, 20, 5), virtual: true });

		const result = sp.radial(c(0, 0), 100);
		expect(result.has("real")).toBe(true);
		expect(result.has("virt")).toBe(false);
	});

	test("query(Point/SpatialPoint) тоже фильтрует virtual", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "rp", point: c(10, 10) });
		sp.upsert({ id: "vp", point: c(10, 10), virtual: true });

		expect(sp.query(c(10, 10)).has("rp")).toBe(true);
		expect(sp.query(c(10, 10)).has("vp")).toBe(false);
	});

	test("query(Convex) фильтрует virtual", () => {
		const sp = new Spatial(32);
		const tri: CT.Convex = [c(0, 0), c(20, 0), c(10, 20), c(0, 0)];
		sp.upsert({ id: "rc", convex: tri });
		sp.upsert({ id: "vc", convex: tri, virtual: true });

		expect(sp.query(tri).has("rc")).toBe(true);
		expect(sp.query(tri).has("vc")).toBe(false);
	});

	test("query(Polyline) фильтрует virtual", () => {
		const sp = new Spatial(32);
		const poly: CT.Polyline = [c(0, 0), c(100, 0)];
		sp.upsert({ id: "rp", polyline: poly });
		sp.upsert({ id: "vp", polyline: poly, virtual: true });

		expect(sp.query(poly).has("rp")).toBe(true);
		expect(sp.query(poly).has("vp")).toBe(false);
	});

	test("opts.includeVirtual: true возвращает virtual в query", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "real", bounds: b(0, 0, 20, 20) });
		sp.upsert({ id: "virt", bounds: b(0, 0, 20, 20), virtual: true });

		const result = sp.query(b(5, 5, 15, 15), { includeVirtual: true });
		expect(result.has("real")).toBe(true);
		expect(result.has("virt")).toBe(true);
	});

	test("opts.includeVirtual: false (по умолчанию) — фильтрует", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(0, 0, 20, 20), virtual: true });

		expect(sp.query(b(5, 5, 15, 15), { includeVirtual: false }).has("virt")).toBe(false);
	});
});

describe("SpatialItem.virtual: не влияет на мировой bounds", () => {
	test("upsert только virtual — bounds остаётся zero()", () => {
		const sp = new Spatial();
		sp.upsert({ id: "v1", bounds: b(0, 0, 10, 10), virtual: true });
		sp.upsert({ id: "v2", bounds: b(100, 100, 110, 110), virtual: true });
		expect(sp.bounds).toEqual(UB.zero());
	});

	test("upsert virtual + реальный — bounds определяется только реальным", () => {
		const sp = new Spatial();
		sp.upsert({ id: "real", bounds: b(0, 0, 50, 50) });
		sp.upsert({ id: "virt", bounds: b(1000, 1000, 1100, 1100), virtual: true });
		expect(sp.bounds).toEqual(b(0, 0, 50, 50));
	});

	test("upsert реальный, потом virtual — bounds не расширяется", () => {
		const sp = new Spatial();
		sp.upsert({ id: "real", bounds: b(0, 0, 50, 50) });
		const before = sp.bounds;
		sp.upsert({ id: "virt", bounds: b(1000, 1000, 1100, 1100), virtual: true });
		const after = sp.bounds;
		expect(after).toEqual(before);
	});

	test("delete виртуального не помечает __dirty и не меняет bounds", () => {
		const sp = new Spatial();
		sp.upsert({ id: "real", bounds: b(0, 0, 10, 10) });
		sp.upsert({ id: "virt", bounds: b(1000, 1000, 1010, 1010), virtual: true });
		const bounds_before = sp.bounds;

		sp.delete("virt");
		expect(sp.bounds).toEqual(bounds_before);
		expect(sp.__dirty).toBe(false);
	});

	test("delete последнего real сбрасывает world bounds, сохраняя virtual в индексе", () => {
		const sp = new Spatial();
		sp.upsert({ id: "real", bounds: b(0, 0, 10, 10) });
		sp.upsert({ id: "virt", bounds: b(1000, 1000, 1010, 1010), virtual: true });
		const rebounds: CT.Bounds[] = [];
		sp.onrebound((current) => rebounds.push({ ...current.bounds }));

		sp.delete("real");
		expect(sp.bounds).toEqual(UB.zero());
		expect(sp.__index.has("virt")).toBe(true);
		expect(sp.__real).toBe(0);
		expect(rebounds).toEqual([UB.zero()]);
	});

	test("onrebound не срабатывает от upsert/delete виртуальных", () => {
		const sp = new Spatial();
		const calls: CT.Bounds[] = [];
		sp.onrebound((s) => calls.push({ ...s.bounds }));

		sp.upsert({ id: "v1", bounds: b(100, 100, 200, 200), virtual: true });
		sp.upsert({ id: "v2", bounds: b(300, 300, 400, 400), virtual: true });
		sp.delete("v1");
		expect(calls.length).toBe(0);
	});

	test("upsert виртуального в новый id не помечает __dirty", () => {
		const sp = new Spatial();
		sp.upsert({ id: "real", bounds: b(0, 0, 10, 10) });
		sp.upsert({ id: "virt", bounds: b(1000, 1000, 1010, 1010), virtual: true });
		expect(sp.__dirty).toBe(false);
	});

	test("upsert существующего virtual с изменением геометрии — __dirty не выставляется", () => {
		const sp = new Spatial();
		sp.upsert({ id: "real", bounds: b(0, 0, 10, 10) });
		sp.upsert({ id: "virt", bounds: b(100, 100, 110, 110), virtual: true });
		sp.upsert({ id: "virt", bounds: b(200, 200, 210, 210), virtual: true });
		expect(sp.__dirty).toBe(false);
		expect(sp.bounds).toEqual(b(0, 0, 10, 10));
	});

	test("__recompute: только виртуальные → bounds становится zero()", () => {
		const sp = new Spatial();
		sp.upsert({ id: "real", bounds: b(0, 0, 50, 50) });
		sp.delete("real"); // помечает __dirty, bounds пока (0,0,50,50)
		sp.upsert({ id: "v1", bounds: b(1000, 1000, 1100, 1100), virtual: true });
		// __bounds ещё не пересчитан (никто не дёрнул .bounds)
		// теперь дёрнем — должно стать zero()
		expect(sp.bounds).toEqual(UB.zero());
	});
});

describe("SpatialItem.virtual: лежит в гриде и __index", () => {
	test("virtual присутствует в __index", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(0, 0, 10, 10), virtual: true });
		expect(sp.__index.has("virt")).toBe(true);
	});

	test("virtual присутствует в __cells (slice initial/relocate находят его)", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(10, 10, 20, 20), virtual: true });
		// хоть одна ячейка должна содержать "virt"
		let found = false;
		for (const cell of sp.__cells.values()) {
			if (cell.has("virt")) {
				found = true;
				break;
			}
		}
		expect(found).toBe(true);
	});

	test("delete виртуального убирает из грида (опустевшая ячейка удаляется)", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(10, 10, 20, 20), virtual: true });
		sp.delete("virt");
		expect(sp.__index.has("virt")).toBe(false);
		expect(sp.__cells.size).toBe(0);
	});

	test("upsert виртуального с перемещением чистит старые ячейки", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(0, 0, 10, 10), virtual: true });
		const cells_before = sp.__cells.size;
		sp.upsert({ id: "virt", bounds: b(500, 500, 510, 510), virtual: true });
		// новая ячейка появилась, старая освободилась — для одного объекта в новом месте остаётся 1 ячейка
		expect(sp.__cells.size).toBeLessThanOrEqual(cells_before);
	});
});

describe("SpatialView + SpatialItem.virtual: onmount/onfrustum", () => {
	test("virtual в фрустуме при создании slice → onmount в конструкторе", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(10, 10, 20, 20), virtual: true });

		const mounted: string[] = [];
		sp.slice(b(0, 0, 50, 50), { onmount: (id) => mounted.push(id) });
		expect(mounted).toContain("virt");
	});

	test("virtual вне фрустума при создании slice → onmount не вызывается", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(1000, 1000, 1010, 1010), virtual: true });

		const mounted: string[] = [];
		sp.slice(b(0, 0, 50, 50), { onmount: (id) => mounted.push(id) });
		expect(mounted).not.toContain("virt");
	});

	test("upsert virtual внутрь фрустума → onmount", () => {
		const sp = new Spatial(32);
		const mounted: string[] = [];
		const view = sp.slice(b(0, 0, 50, 50), { onmount: (id) => mounted.push(id) });

		sp.upsert({ id: "virt", bounds: b(10, 10, 20, 20), virtual: true });
		expect(view.items.has("virt")).toBe(true);
		expect(mounted).toContain("virt");
	});

	test("upsert virtual снаружи фрустума → onmount не вызывается, в items нет", () => {
		const sp = new Spatial(32);
		const mounted: string[] = [];
		const view = sp.slice(b(0, 0, 50, 50), { onmount: (id) => mounted.push(id) });

		sp.upsert({ id: "virt", bounds: b(1000, 1000, 1010, 1010), virtual: true });
		expect(view.items.has("virt")).toBe(false);
		expect(mounted).not.toContain("virt");
	});

	test("upsert виртуального, двигающий его за фрустум → onfrustum", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(10, 10, 20, 20), virtual: true });
		const frustumed: string[] = [];
		const view = sp.slice(b(0, 0, 50, 50), { onfrustum: (id) => frustumed.push(id) });

		sp.upsert({ id: "virt", bounds: b(1000, 1000, 1010, 1010), virtual: true });
		expect(view.items.has("virt")).toBe(false);
		expect(frustumed).toContain("virt");
	});

	test("delete виртуального из items → onfrustum", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(10, 10, 20, 20), virtual: true });
		const frustumed: string[] = [];
		sp.slice(b(0, 0, 50, 50), { onfrustum: (id) => frustumed.push(id) });

		sp.delete("virt");
		expect(frustumed).toContain("virt");
	});

	test("relocate, переносящий virtual в новый фрустум → onmount в новой позиции", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(10, 10, 20, 20), virtual: true });

		const mounted: string[] = [];
		const frustumed: string[] = [];
		const view = sp.slice(b(0, 0, 50, 50), {
			onmount: (id) => mounted.push(id),
			onfrustum: (id) => frustumed.push(id),
		});
		// после конструктора virt в items
		expect(view.items.has("virt")).toBe(true);

		mounted.length = 0;
		frustumed.length = 0;
		// перекладка камеры — virt остаётся в новой области
		view.relocate(b(0, 0, 100, 100));
		expect(view.items.has("virt")).toBe(true);
		expect(frustumed).not.toContain("virt");
		expect(mounted).not.toContain("virt"); // не было события — элемент и до и после в фрустуме
	});

	test("relocate, выкидывающий virtual за фрустум → onfrustum", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(10, 10, 20, 20), virtual: true });

		const frustumed: string[] = [];
		const view = sp.slice(b(0, 0, 50, 50), { onfrustum: (id) => frustumed.push(id) });

		view.relocate(b(1000, 1000, 1100, 1100));
		expect(view.items.has("virt")).toBe(false);
		expect(frustumed).toContain("virt");
	});

	test("invalidate виртуального в items → onfrustum → inject → onmount", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(10, 10, 20, 20), virtual: true });

		const events: string[] = [];
		sp.slice(b(0, 0, 50, 50), {
			onmount: (id) => events.push(`mount:${id}`),
			onfrustum: (id) => events.push(`frustum:${id}`),
		});

		events.length = 0;
		sp.invalidate("virt", () => events.push("inject"));
		expect(events).toEqual(["frustum:virt", "inject", "mount:virt"]);
	});

	test("invalidate виртуального вне items → хуки не вызываются", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "virt", bounds: b(1000, 1000, 1010, 1010), virtual: true });

		const events: string[] = [];
		sp.slice(b(0, 0, 50, 50), {
			onmount: (id) => events.push(`mount:${id}`),
			onfrustum: (id) => events.push(`frustum:${id}`),
		});

		events.length = 0;
		sp.invalidate("virt", () => events.push("inject"));
		expect(events).toEqual([]);
	});

	test("destroy slice с virtual в items → onfrustum для virtual", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "real", bounds: b(10, 10, 20, 20) });
		sp.upsert({ id: "virt", bounds: b(30, 30, 40, 40), virtual: true });

		const frustumed: string[] = [];
		const view = sp.slice(b(0, 0, 50, 50), { onfrustum: (id) => frustumed.push(id) });

		view.destroy();
		expect(frustumed).toContain("real");
		expect(frustumed).toContain("virt");
	});

	test("user-facing view.query/ray/radial не возвращают virtual", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "real", bounds: b(0, 0, 20, 20) });
		sp.upsert({ id: "virt", bounds: b(0, 0, 20, 20), virtual: true });

		const view = sp.slice(b(-100, -100, 1000, 1000));

		expect(view.query(b(5, 5, 15, 15)).has("virt")).toBe(false);
		expect(view.query(b(5, 5, 15, 15)).has("real")).toBe(true);
		expect(view.ray(c(10, 10)).has("virt")).toBe(false);
		expect(view.ray(c(10, 10)).has("real")).toBe(true);
		expect(view.radial(c(10, 10), 50).has("virt")).toBe(false);
		expect(view.radial(c(10, 10), 50).has("real")).toBe(true);
	});
});

describe("SpatialItem.virtual: mixed upsert real + virtual", () => {
	test("upsert(real) потом upsert(virtual) в одном вызове — bounds корректен, virtual в гриде", () => {
		const sp = new Spatial(32);
		sp.upsert(item("real", b(0, 0, 50, 50)), { id: "virt", bounds: b(100, 100, 150, 150), virtual: true });

		expect(sp.bounds).toEqual(b(0, 0, 50, 50));
		expect(sp.__index.has("virt")).toBe(true);
		expect(sp.query(b(110, 110, 140, 140)).has("virt")).toBe(false);
	});

	test("delete всех реальных → bounds = zero(), виртуальные остаются в __index", () => {
		const sp = new Spatial(32);
		sp.upsert(item("real", b(0, 0, 50, 50)));
		sp.upsert({ id: "virt", bounds: b(100, 100, 150, 150), virtual: true });

		sp.delete("real");
		expect(sp.bounds).toEqual(UB.zero());
		expect(sp.__index.has("virt")).toBe(true);
		expect(sp.__index.size).toBe(1);
	});

	test("все виртуальные → destroy очищает грид и индекс", () => {
		const sp = new Spatial(32);
		sp.upsert({ id: "v1", bounds: b(0, 0, 10, 10), virtual: true }, { id: "v2", bounds: b(100, 100, 110, 110), virtual: true });

		sp.destroy();
		expect(sp.__index.size).toBe(0);
		expect(sp.__cells.size).toBe(0);
	});
});
