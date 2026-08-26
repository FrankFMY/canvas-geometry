import { describe, expect, test } from "bun:test";
import { UB } from "./bounds.js";
import { UC2 } from "./coords.js";
import { UPL } from "./polyline.js";
import type * as CT from "./types.js";

const c = (x: number, y: number): CT.C2 => ({ x, y });

const eq = (a: CT.C2, b: CT.C2, EPS = 0.001): boolean => UC2.eq(a, b, EPS);

// ─── is: классификация вырожденности ─────────────────────────────────────────

describe("UPL.is: классификация по канону вырожденности", () => {
	test("0 вершин → empty", () => {
		expect(UPL.is([])).toEqual({ type: "empty" });
	});

	test("1 вершина → point", () => {
		expect(UPL.is([c(3, 4)])).toEqual({ type: "point", point: c(3, 4) });
	});

	test("все совпадают → point (первая)", () => {
		expect(UPL.is([c(1, 1), c(1, 1), c(1, 1)])).toEqual({ type: "point", point: c(1, 1) });
	});

	test("2 коллинеарные → edge (концы — сами точки)", () => {
		const g = UPL.is([c(0, 0), c(10, 0)]);
		expect(g.type).toBe("edge");
		if (g.type === "edge") expect(eq(g.edge[0], c(0, 0)) && eq(g.edge[1], c(10, 0))).toBe(true);
	});

	test("3 коллинеарные → edge (концы — наиболее удалённые)", () => {
		const g = UPL.is([c(0, 0), c(5, 0), c(10, 0)]);
		expect(g.type).toBe("edge");
		if (g.type === "edge") {
			expect(eq(g.edge[0], c(0, 0))).toBe(true);
			expect(eq(g.edge[1], c(10, 0))).toBe(true);
		}
	});

	test("3 не коллинеарные → polyline", () => {
		expect(UPL.is([c(0, 0), c(10, 0), c(5, 5)]).type).toBe("polyline");
	});

	test("Z-ломаная → polyline", () => {
		expect(UPL.is([c(0, 0), c(10, 0), c(10, 10), c(0, 10)]).type).toBe("polyline");
	});
});

// ─── isEmpty ─────────────────────────────────────────────────────────────────

describe("UPL.isEmpty", () => {
	test("empty/point/edge → true", () => {
		expect(UPL.isEmpty([])).toBe(true);
		expect(UPL.isEmpty([c(1, 1)])).toBe(true);
		expect(UPL.isEmpty([c(0, 0), c(10, 0)])).toBe(true);
		expect(UPL.isEmpty([c(0, 0), c(5, 0), c(10, 0)])).toBe(true);
	});

	test("polyline → false", () => {
		expect(UPL.isEmpty([c(0, 0), c(10, 0), c(5, 5)])).toBe(false);
	});
});

// ─── edges ────────────────────────────────────────────────────────────────────

describe("UPL.edges", () => {
	test("< 2 вершин → []", () => {
		expect(UPL.edges([])).toEqual([]);
		expect(UPL.edges([c(1, 1)])).toEqual([]);
	});

	test("2 вершины → 1 ребро без замыкания", () => {
		expect(UPL.edges([c(0, 0), c(10, 0)])).toEqual([[c(0, 0), c(10, 0)]]);
	});

	test("3 вершины → 2 ребра без замыкания (нет g[2]→g[0])", () => {
		expect(UPL.edges([c(0, 0), c(10, 0), c(10, 10)])).toEqual([
			[c(0, 0), c(10, 0)],
			[c(10, 0), c(10, 10)],
		]);
	});

	test("нулевые рёбра отбрасываются", () => {
		expect(UPL.edges([c(0, 0), c(0, 0), c(10, 0)])).toEqual([[c(0, 0), c(10, 0)]]);
	});
});

// ─── length ───────────────────────────────────────────────────────────────────

describe("UPL.length", () => {
	test("< 2 вершин → 0", () => {
		expect(UPL.length([])).toBe(0);
		expect(UPL.length([c(1, 1)])).toBe(0);
	});

	test("сумма длин сегментов", () => {
		expect(UPL.length([c(0, 0), c(10, 0)])).toBe(10);
		expect(UPL.length([c(0, 0), c(10, 0), c(10, 10)])).toBe(20);
		expect(UPL.length([c(0, 0), c(3, 0), c(3, 4)])).toBe(7);
	});

	test("нулевые сегменты не добавляют длины", () => {
		expect(UPL.length([c(0, 0), c(0, 0), c(10, 0)])).toBe(10);
	});
});

// ─── center ───────────────────────────────────────────────────────────────────

describe("UPL.center: дуговой центроид", () => {
	test("0 вершин → {0,0}", () => {
		expect(UPL.center([])).toEqual(c(0, 0));
	});

	test("1 вершина → копия", () => {
		expect(UPL.center([c(3, 4)])).toEqual(c(3, 4));
	});

	test("все совпадают → первая", () => {
		expect(UPL.center([c(5, 5), c(5, 5), c(5, 5)])).toEqual(c(5, 5));
	});

	test("2 точки → середина (как Edge)", () => {
		const ctr = UPL.center([c(0, 0), c(10, 0)]);
		expect(eq(ctr, c(5, 0))).toBe(true);
	});

	test("равные сегменты → среднее середин", () => {
		// (0,0)-(10,0) и (10,0)-(10,10): середины (5,0) и (10,5), равные длины → (7.5, 2.5)
		const ctr = UPL.center([c(0, 0), c(10, 0), c(10, 10)]);
		expect(eq(ctr, c(7.5, 2.5))).toBe(true);
	});

	test("неравные сегменты → взвешено к длинному", () => {
		// сегмент (0,0)-(100,0) длина 100, середина (50,0); сегмент (100,0)-(100,1) длина 1, середина (100,0.5)
		// центр = (50*100 + 100*1)/101, (0*100 + 0.5*1)/101 ≈ (59.406, 0.00495)
		const ctr = UPL.center([c(0, 0), c(100, 0), c(100, 1)]);
		expect(ctr.x).toBeCloseTo((50 * 100 + 100) / 101, 6);
		expect(ctr.y).toBeCloseTo(0.5 / 101, 6);
	});
});

// ─── has: владение (1D-interior) ──────────────────────────────────────────────

describe("UPL.has: канон владения", () => {
	test("empty → false", () => {
		expect(UPL.has([], c(1, 1))).toBe(false);
	});

	test("point → eq с собой", () => {
		expect(UPL.has([c(3, 4)], c(3, 4))).toBe(true);
		expect(UPL.has([c(3, 4)], c(3, 5))).toBe(false);
	});

	test("point (все совпадают) → eq", () => {
		expect(UPL.has([c(1, 1), c(1, 1), c(1, 1)], c(1, 1))).toBe(true);
	});

	test("edge → строго между концами", () => {
		expect(UPL.has([c(0, 0), c(10, 0)], c(5, 0))).toBe(true);
		expect(UPL.has([c(0, 0), c(10, 0)], c(0, 0))).toBe(false);
		expect(UPL.has([c(0, 0), c(10, 0)], c(10, 0))).toBe(false);
		expect(UPL.has([c(0, 0), c(10, 0)], c(11, 0))).toBe(false);
		expect(UPL.has([c(0, 0), c(10, 0)], c(5, 1))).toBe(false);
	});

	test("edge с промежуточной вершиной → строго между концами", () => {
		// [a, b, c] коллинеарны, b между a и c → владеет открытым интервалом (a,c)
		expect(UPL.has([c(0, 0), c(5, 0), c(10, 0)], c(5, 0))).toBe(true);
		expect(UPL.has([c(0, 0), c(5, 0), c(10, 0)], c(0, 0))).toBe(false);
		expect(UPL.has([c(0, 0), c(5, 0), c(10, 0)], c(10, 0))).toBe(false);
	});

	test("polyline → точка на открытом сегменте", () => {
		const g = [c(0, 0), c(10, 0), c(10, 10)];
		expect(UPL.has(g, c(5, 0))).toBe(true);
		expect(UPL.has(g, c(10, 5))).toBe(true);
	});

	test("polyline → внутренняя вершина владеет", () => {
		const g = [c(0, 0), c(10, 0), c(10, 10)];
		// b=(10,0) — внутренняя вершина
		expect(UPL.has(g, c(10, 0))).toBe(true);
	});

	test("polyline → крайние концы НЕ владеют", () => {
		const g = [c(0, 0), c(10, 0), c(10, 10)];
		expect(UPL.has(g, c(0, 0))).toBe(false);
		expect(UPL.has(g, c(10, 10))).toBe(false);
	});

	test("polyline → точка снаружи сегментов → false", () => {
		const g = [c(0, 0), c(10, 0), c(10, 10)];
		expect(UPL.has(g, c(5, 5))).toBe(false);
		expect(UPL.has(g, c(-1, 0))).toBe(false);
	});

	test("совпадающая внутренняя вершина (нулевое ребро) → владеет", () => {
		// [a, b, b, c]: внутренние b(1) и b(2) совпадают
		const g = [c(0, 0), c(5, 0), c(5, 0), c(10, 0)];
		expect(UPL.has(g, c(5, 0))).toBe(true);
	});
});

// ─── at: контур (включая крайние) ──────────────────────────────────────────────

describe("UPL.at: канон контура (включая крайние концы)", () => {
	test("empty → false", () => {
		expect(UPL.at([], c(1, 1))).toBe(false);
	});

	test("point → eq", () => {
		expect(UPL.at([c(3, 4)], c(3, 4))).toBe(true);
		expect(UPL.at([c(3, 4)], c(3, 5))).toBe(false);
	});

	test("edge → на отрезке включая концы", () => {
		expect(UPL.at([c(0, 0), c(10, 0)], c(0, 0))).toBe(true);
		expect(UPL.at([c(0, 0), c(10, 0)], c(10, 0))).toBe(true);
		expect(UPL.at([c(0, 0), c(10, 0)], c(5, 0))).toBe(true);
		expect(UPL.at([c(0, 0), c(10, 0)], c(11, 0))).toBe(false);
	});

	test("polyline → крайние концы включены (в отличие от has)", () => {
		const g = [c(0, 0), c(10, 0), c(10, 10)];
		expect(UPL.at(g, c(0, 0))).toBe(true);
		expect(UPL.at(g, c(10, 10))).toBe(true);
		expect(UPL.at(g, c(10, 0))).toBe(true);
		expect(UPL.at(g, c(5, 0))).toBe(true);
		expect(UPL.at(g, c(5, 5))).toBe(false);
	});
});

// ─── collision ────────────────────────────────────────────────────────────────

describe("UPL.collision: пересечение 1D-interior", () => {
	test("empty ⋂ X → false", () => {
		expect(UPL.collision([], [])).toBe(false);
		expect(UPL.collision([], [c(0, 0)])).toBe(false);
		expect(UPL.collision([], [c(0, 0), c(10, 0)])).toBe(false);
	});

	test("point ⋂ point: совпадают → true", () => {
		expect(UPL.collision([c(1, 1)], [c(1, 1)])).toBe(true);
		expect(UPL.collision([c(1, 1)], [c(1, 2)])).toBe(false);
	});

	test("point ⋂ polyline: точка во владении ломаной → true", () => {
		expect(UPL.collision([c(5, 0)], [c(0, 0), c(10, 0)])).toBe(true);
		expect(UPL.collision([c(0, 0)], [c(0, 0), c(10, 0)])).toBe(false); // край — не владеет
	});

	test("edge ⋂ edge: перекрытие интервалов → true", () => {
		expect(UPL.collision([c(0, 0), c(10, 0)], [c(5, 0), c(15, 0)])).toBe(true);
	});

	test("edge ⋂ edge: касание концами → false", () => {
		expect(UPL.collision([c(0, 0), c(10, 0)], [c(10, 0), c(20, 0)])).toBe(false);
	});

	test("edge ⋂ edge: непересекающиеся → false", () => {
		expect(UPL.collision([c(0, 0), c(10, 0)], [c(20, 0), c(30, 0)])).toBe(false);
	});

	test("polyline ⋂ polyline: крестовое пересечение сегментов → true", () => {
		// вертикаль (0,-5)-(0,5) и горизонталь (-5,0)-(5,0) пересекаются в (0,0)
		const v = [c(0, -5), c(0, 5)];
		const h = [c(-5, 0), c(5, 0)];
		expect(UPL.collision(v, h)).toBe(true);
	});

	test("polyline ⋂ polyline: внутренняя вершина одной на сегменте другой → true", () => {
		// (0,0)-(10,0)-(10,10) и горизонталь (5,-5)-(5,5): вершина (10,0) нет... возьмём (5,0) на первом сегменте
		const a = [c(0, 0), c(10, 0), c(10, 10)];
		const b = [c(5, -5), c(5, 5)];
		// сегмент (5,-5)-(5,5) пересекает (0,0)-(10,0) в (5,0) строго внутри обеих → true
		expect(UPL.collision(a, b)).toBe(true);
	});

	test("polyline ⋂ polyline: касание крайними концами → false", () => {
		// обе ломаные кончаются в (0,0), но концы не владеют
		const a = [c(0, 0), c(10, 0)];
		const b = [c(0, 0), c(0, 10)];
		expect(UPL.collision(a, b)).toBe(false);
	});

	test("polyline ⋂ polyline: общая внутренняя вершина → true", () => {
		// обе проходят через (10,0) как внутреннюю
		const a = [c(0, 0), c(10, 0), c(10, 10)];
		const b = [c(20, 0), c(10, 0), c(10, -10)];
		expect(UPL.collision(a, b)).toBe(true);
	});

	test("polyline ⋂ polyline: непересекающиеся → false", () => {
		expect(UPL.collision([c(0, 0), c(10, 0)], [c(0, 100), c(10, 100)])).toBe(false);
	});

	test("симметричность", () => {
		const a = [c(0, 0), c(10, 0), c(10, 10)];
		const b = [c(5, -5), c(5, 5)];
		expect(UPL.collision(a, b)).toBe(UPL.collision(b, a));
	});
});

// ─── projection / nearest ─────────────────────────────────────────────────────

describe("UPL.projection", () => {
	test("empty → сама точка", () => {
		expect(UPL.projection([], c(3, 4))).toEqual(c(3, 4));
	});

	test("point → сама точка", () => {
		expect(UPL.projection([c(1, 1)], c(3, 4))).toEqual(c(1, 1));
	});

	test("edge → ближайшая точка отрезка (clamp)", () => {
		expect(UPL.projection([c(0, 0), c(10, 0)], c(5, 5))).toEqual(c(5, 0));
		expect(UPL.projection([c(0, 0), c(10, 0)], c(-5, 0))).toEqual(c(0, 0)); // clamp к концу
		expect(UPL.projection([c(0, 0), c(10, 0)], c(15, 0))).toEqual(c(10, 0)); // clamp к концу
	});

	test("polyline → ближайший сегмент", () => {
		// (0,0)-(10,0)-(10,10): точка (12, 5) ближе ко второму сегменту → (10,5)
		expect(UPL.projection([c(0, 0), c(10, 0), c(10, 10)], c(12, 5))).toEqual(c(10, 5));
	});
});

describe("UPL.nearest", () => {
	test("если владеет → сама точка", () => {
		// (5,0) на открытом сегменте (0,0)-(10,0) → владеет → nearest = (5,0)
		expect(UPL.nearest([c(0, 0), c(10, 0)], c(5, 0))).toEqual(c(5, 0));
	});

	test("если не владеет → projection", () => {
		// (5,5) вне → projection на сегмент = (5,0)
		expect(UPL.nearest([c(0, 0), c(10, 0)], c(5, 5))).toEqual(c(5, 0));
	});

	test("крайний конец не владеет → nearest через projection возвращает конец", () => {
		expect(UPL.nearest([c(0, 0), c(10, 0)], c(-5, 0))).toEqual(c(0, 0));
	});
});

// ─── copy / eq / zero / assign / move / lerp / round ──────────────────────────

describe("UPL.copy", () => {
	test("глубокая копия вершин", () => {
		const g: CT.Polyline = [c(1, 2), c(3, 4)];
		const cp = UPL.copy(g);
		expect(cp).toEqual(g);
		expect(cp).not.toBe(g);
		expect(cp[0]).not.toBe(g[0]);
	});
});

describe("UPL.eq", () => {
	test("длины/порядок значимы", () => {
		expect(UPL.eq([c(0, 0), c(1, 1)], [c(0, 0), c(1, 1)])).toBe(true);
		expect(UPL.eq([c(0, 0), c(1, 1)], [c(1, 1), c(0, 0)])).toBe(false);
		expect(UPL.eq([c(0, 0), c(1, 1)], [c(0, 0)])).toBe(false);
	});
});

describe("UPL.zero / assign", () => {
	test("zero → []", () => {
		expect(UPL.zero()).toEqual([]);
	});

	test("assign мутирует в содержимое expected", () => {
		const g: CT.Polyline = [c(9, 9)];
		UPL.assign(g, [c(1, 2), c(3, 4)]);
		expect(g).toEqual([c(1, 2), c(3, 4)]);
	});

	test("assign по умолчанию → пустая", () => {
		const g: CT.Polyline = [c(1, 2)];
		UPL.assign(g);
		expect(g).toEqual([]);
	});
});

describe("UPL.move", () => {
	test("сдвиг каждой вершины", () => {
		expect(UPL.move([c(0, 0), c(10, 0)], c(2, 3))).toEqual([c(2, 3), c(12, 3)]);
	});
});

describe("UPL.lerp", () => {
	test("интерполяция по min длине", () => {
		expect(UPL.lerp([c(0, 0), c(10, 0)], [c(0, 10), c(10, 10)], 0.5)).toEqual([c(0, 5), c(10, 5)]);
	});
	test("лишние вершины отбрасываются", () => {
		expect(UPL.lerp([c(0, 0), c(10, 0)], [c(0, 10)], 0.5)).toEqual([c(0, 5)]);
	});
});

// ─── bound ────────────────────────────────────────────────────────────────────

describe("UPL.bound", () => {
	test("AABB от вершин", () => {
		expect(UPL.bound([c(0, 0), c(10, 0), c(10, 10)])).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
	});
	test("пустая → zero", () => {
		expect(UPL.bound([])).toEqual(UB.zero());
	});
});

// ─── hasX / hasY ──────────────────────────────────────────────────────────────

describe("UPL.hasX / hasY", () => {
	test("empty → false", () => {
		expect(UPL.hasX([], 5)).toBe(false);
		expect(UPL.hasY([], 5)).toBe(false);
	});
	test("по bbox: строго внутри проекции", () => {
		const g = [c(0, 0), c(10, 0), c(10, 10)];
		expect(UPL.hasX(g, 5)).toBe(true);
		expect(UPL.hasX(g, 0)).toBe(false); // граница
		expect(UPL.hasY(g, 5)).toBe(true);
	});
});
