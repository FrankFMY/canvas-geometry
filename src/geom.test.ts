import { describe, expect, test } from "bun:test";
import { UB } from "./bounds.js";
import { UG } from "./geom.js";
import type * as CT from "./types.js";

const c = (x: number, y: number): CT.C2 => ({ x, y });
const b = (minX: number, minY: number, maxX: number, maxY: number): CT.Bounds => ({ minX, minY, maxX, maxY });

// ─── isPoint / isBounds / isConvex / isPolyline: дискриминация ──────────────

describe("UG.isPoint / isBounds / isConvex / isPolyline: дискриминация Geom", () => {
	test("C2 → isPoint=true, isBounds=false, isConvex=false, isPolyline=false", () => {
		expect(UG.isPoint(c(1, 2))).toBe(true);
		expect(UG.isBounds(c(1, 2))).toBe(false);
		expect(UG.isConvex(c(1, 2))).toBe(false);
		expect(UG.isPolyline(c(1, 2))).toBe(false);
	});

	test("Bounds → isPoint=false, isBounds=true, isConvex=false, isPolyline=false", () => {
		expect(UG.isPoint(b(-10, -20, 30, 40))).toBe(false);
		expect(UG.isBounds(b(-10, -20, 30, 40))).toBe(true);
		expect(UG.isConvex(b(-10, -20, 30, 40))).toBe(false);
		expect(UG.isPolyline(b(-10, -20, 30, 40))).toBe(false);
	});

	test("Convex (замкнутый, length>3, g[0]≈g[n-1]) → isConvex=true, isPolyline=false", () => {
		const sq: CT.Convex = [c(-10, -20), c(30, -20), c(30, 40), c(-10, 40), c(-10, -20)];
		expect(UG.isConvex(sq)).toBe(true);
		expect(UG.isPolyline(sq)).toBe(false);
	});

	test("Polyline (незамкнутый или length<=3) → isPolyline=true, isConvex=false", () => {
		expect(UG.isPolyline([])).toBe(true);
		expect(UG.isConvex([])).toBe(false);
		expect(UG.isPolyline([c(0, 0), c(10, 0)])).toBe(true);
		expect(UG.isConvex([c(0, 0), c(10, 0)])).toBe(false);
		// 3 точки без замыкания → Polyline
		expect(UG.isPolyline([c(0, 0), c(10, 0), c(5, 5)])).toBe(true);
		expect(UG.isConvex([c(0, 0), c(10, 0), c(5, 5)])).toBe(false);
	});

	test("пустой массив → isPolyline=true (не Bounds, не Convex)", () => {
		expect(UG.isPoint([])).toBe(false);
		expect(UG.isBounds([])).toBe(false);
		expect(UG.isConvex([])).toBe(false);
		expect(UG.isPolyline([])).toBe(true);
	});
});

// ─── copy ───────────────────────────────────────────────────────────────────

describe("UG.copy: полиморфная копия", () => {
	test("C2 → копия через UC2.copy", () => {
		const p = c(-10, 20);
		const copied = UG.copy(p) as CT.C2;
		expect(copied).toEqual(p);
		expect(copied).not.toBe(p);
	});

	test("Bounds → копия через UB.copy", () => {
		const bounds = b(-10, -20, 30, 40);
		const copied = UG.copy(bounds) as CT.Bounds;
		expect(copied).toEqual(bounds);
		expect(copied).not.toBe(bounds);
	});

	test("Convex → копия через Convex.copy", () => {
		const convex: CT.Convex = [c(-10, -20), c(30, -20), c(30, 40), c(-10, 40), c(-10, -20)];
		const copied = UG.copy(convex) as CT.Convex;
		expect(copied).toEqual(convex);
		expect(copied).not.toBe(convex);
		expect(copied[0]).not.toBe(convex[0]);
	});

	test("Polyline → копия через UPL.copy", () => {
		const poly: CT.Polyline = [c(-10, -20), c(30, -20), c(10, 40)];
		const copied = UG.copy(poly) as CT.Polyline;
		expect(copied).toEqual(poly);
		expect(copied).not.toBe(poly);
		expect(copied[0]).not.toBe(poly[0]);
	});
});

// ─── bound ──────────────────────────────────────────────────────────────────

describe("UG.bound: полиморфный охватывающий Bounds", () => {
	test("C2 → вырожденный Bounds-точка", () => {
		const result = UG.bound(c(15, 25));
		expect(result).toEqual(b(15, 25, 15, 25));
	});

	test("Bounds → копия", () => {
		const bounds = b(-10, -20, 30, 40);
		const result = UG.bound(bounds);
		expect(result).toEqual(bounds);
		expect(result).not.toBe(bounds);
	});

	test("Convex → AABB через Convex.bound", () => {
		const tri: CT.Convex = [c(-10, -20), c(30, -20), c(10, 40), c(-10, -20)];
		const result = UG.bound(tri);
		expect(result.minX).toBeCloseTo(-10, 10);
		expect(result.maxX).toBeCloseTo(30, 10);
		expect(result.minY).toBeCloseTo(-20, 10);
		expect(result.maxY).toBeCloseTo(40, 10);
	});

	test("Polyline → AABB через UPL.bound", () => {
		const poly: CT.Polyline = [c(-10, -20), c(30, -20), c(10, 40)];
		const result = UG.bound(poly);
		expect(result.minX).toBeCloseTo(-10, 10);
		expect(result.maxX).toBeCloseTo(30, 10);
		expect(result.minY).toBeCloseTo(-20, 10);
		expect(result.maxY).toBeCloseTo(40, 10);
	});
});

// ─── convex ─────────────────────────────────────────────────────────────────

describe("UG.convex: полиморфный замкнутый контур", () => {
	test("C2 → [copy, copy] (замкнутый контур-точка)", () => {
		const result = UG.convex(c(15, 25));
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual(c(15, 25));
		expect(result[1]).toEqual(c(15, 25));
	});

	test("Bounds → 4 угла CCW + закрывающий дубль", () => {
		const result = UG.convex(b(-10, -20, 30, 40));
		expect(result).toEqual([c(-10, -20), c(30, -20), c(30, 40), c(-10, 40), c(-10, -20)]);
	});

	test("Convex → копия вершин", () => {
		const tri: CT.Convex = [c(-10, -20), c(30, -20), c(10, 40), c(-10, -20)];
		const result = UG.convex(tri);
		expect(result).toEqual(tri);
		expect(result).not.toBe(tri);
	});

	test("Polyline → копия + закрывающий дубль g[0]", () => {
		const poly: CT.Polyline = [c(-10, -20), c(30, -20), c(10, 40)];
		const result = UG.convex(poly);
		expect(result).toEqual([c(-10, -20), c(30, -20), c(10, 40), c(-10, -20)]);
		expect(result).not.toBe(poly);
	});

	test("Polyline пустая → []", () => {
		expect(UG.convex([])).toEqual([]);
	});
});

// ─── has ────────────────────────────────────────────────────────────────────

describe("UG.has: полиморфное владение точкой (канон владения)", () => {
	test("C2: точка обладает собой → true", () => {
		expect(UG.has(c(15, 10), c(15, 10))).toBe(true);
	});

	test("C2: разные точки → false", () => {
		expect(UG.has(c(15, 10), c(15, 11))).toBe(false);
	});

	test("Bounds + точка внутри → true", () => {
		expect(UG.has(b(-10, -20, 30, 40), c(15, 10))).toBe(true);
	});

	test("Bounds + точка на границе → false", () => {
		expect(UG.has(b(-10, -20, 30, 40), c(-10, 10))).toBe(false);
		expect(UG.has(b(-10, -20, 30, 40), c(15, -20))).toBe(false);
	});

	test("Bounds + точка снаружи → false", () => {
		expect(UG.has(b(-10, -20, 30, 40), c(50, 60))).toBe(false);
	});

	test("Convex + точка внутри → true", () => {
		const sq: CT.Convex = [c(-10, -20), c(30, -20), c(30, 40), c(-10, 40), c(-10, -20)];
		expect(UG.has(sq, c(15, 10))).toBe(true);
	});

	test("Convex + точка на ребре → false (канон владения)", () => {
		const sq: CT.Convex = [c(-10, -20), c(30, -20), c(30, 40), c(-10, 40), c(-10, -20)];
		expect(UG.has(sq, c(-10, 10))).toBe(false);
		expect(UG.has(sq, c(15, -20))).toBe(false);
	});

	test("Convex + точка в углу → false", () => {
		const sq: CT.Convex = [c(-10, -20), c(30, -20), c(30, 40), c(-10, 40), c(-10, -20)];
		expect(UG.has(sq, c(-10, -20))).toBe(false);
		expect(UG.has(sq, c(30, 40))).toBe(false);
	});

	test("Polyline + точка на открытом сегменте → true", () => {
		const poly: CT.Polyline = [c(0, 0), c(20, 0), c(20, 20)];
		expect(UG.has(poly, c(10, 0))).toBe(true);
	});

	test("Polyline + крайний конец → false (канон владения)", () => {
		const poly: CT.Polyline = [c(0, 0), c(20, 0), c(20, 20)];
		expect(UG.has(poly, c(0, 0))).toBe(false);
		expect(UG.has(poly, c(20, 20))).toBe(false);
	});

	test("Polyline + внутренняя вершина → true", () => {
		const poly: CT.Polyline = [c(0, 0), c(20, 0), c(20, 20)];
		expect(UG.has(poly, c(20, 0))).toBe(true);
	});
});

// ─── push ───────────────────────────────────────────────────────────────────

describe("UG.push: полиморфное расширение аккумулятора", () => {
	test("push C2 в пустой аккумулятор → аккумулятор = Bounds-точка", () => {
		const acc = UB.infinity();
		UG.push(acc, c(-10, -20));
		expect(acc).toEqual(b(-10, -20, -10, -20));
	});

	test("push Bounds в пустой аккумулятор → аккумулятор = Bounds", () => {
		const acc = UB.infinity();
		UG.push(acc, b(-10, -20, 30, 40));
		expect(acc).toEqual(b(-10, -20, 30, 40));
	});

	test("push Bounds расширяет существующий аккумулятор", () => {
		const acc = b(0, 0, 10, 10);
		UG.push(acc, b(-10, -20, 5, 5));
		expect(acc).toEqual(b(-10, -20, 10, 10));
	});

	test("push Convex-точек в аккумулятор", () => {
		const acc = UB.infinity();
		const tri: CT.Convex = [c(-10, -20), c(30, -20), c(10, 40), c(-10, -20)];
		UG.push(acc, tri);
		expect(acc.minX).toBeCloseTo(-10, 10);
		expect(acc.maxX).toBeCloseTo(30, 10);
		expect(acc.minY).toBeCloseTo(-20, 10);
		expect(acc.maxY).toBeCloseTo(40, 10);
	});

	test("push Polyline-точек в аккумулятор", () => {
		const acc = UB.infinity();
		const poly: CT.Polyline = [c(-10, -20), c(30, -20), c(10, 40)];
		UG.push(acc, poly);
		expect(acc.minX).toBeCloseTo(-10, 10);
		expect(acc.maxX).toBeCloseTo(30, 10);
		expect(acc.minY).toBeCloseTo(-20, 10);
		expect(acc.maxY).toBeCloseTo(40, 10);
	});

	test("последовательные push разных типов", () => {
		const acc = UB.infinity();
		UG.push(acc, b(-10, -20, 30, 40));
		UG.push(acc, [c(-50, -60), c(-40, -50)]);
		UG.push(acc, c(100, 200));
		expect(acc.minX).toBeCloseTo(-50, 10);
		expect(acc.minY).toBeCloseTo(-60, 10);
		expect(acc.maxX).toBeCloseTo(100, 10);
		expect(acc.maxY).toBeCloseTo(200, 10);
	});
});

// ─── collision ──────────────────────────────────────────────────────────────

describe("UG.collision: полиморфная коллизия", () => {
	// ── C2 ⋂ C2 ──
	test("C2 ⋂ C2: совпадают → true", () => {
		expect(UG.collision(c(15, 10), c(15, 10))).toBe(true);
	});

	test("C2 ⋂ C2: различаются → false", () => {
		expect(UG.collision(c(15, 10), c(16, 10))).toBe(false);
	});

	// ── C2 ⋂ Bounds ──
	test("C2 ⋂ Bounds: точка внутри → true", () => {
		expect(UG.collision(c(15, 10), b(-10, -20, 30, 40))).toBe(true);
	});

	test("C2 ⋂ Bounds: точка на границе → false (канон владения)", () => {
		expect(UG.collision(c(-10, 10), b(-10, -20, 30, 40))).toBe(false);
	});

	test("C2 ⋂ Bounds: точка снаружи → false", () => {
		expect(UG.collision(c(100, 100), b(-10, -20, 30, 40))).toBe(false);
	});

	// ── C2 ⋂ Convex ──
	test("C2 ⋂ Convex: точка внутри → true", () => {
		const sq: CT.Convex = [c(-10, -20), c(30, -20), c(30, 40), c(-10, 40), c(-10, -20)];
		expect(UG.collision(c(15, 10), sq)).toBe(true);
	});

	test("C2 ⋂ Convex: точка на ребре → false", () => {
		const sq: CT.Convex = [c(-10, -20), c(30, -20), c(30, 40), c(-10, 40), c(-10, -20)];
		expect(UG.collision(c(-10, 10), sq)).toBe(false);
	});

	// ── C2 ⋂ Polyline ──
	test("C2 ⋂ Polyline: точка во владении ломаной → true", () => {
		const poly: CT.Polyline = [c(0, 0), c(20, 0), c(20, 20)];
		expect(UG.collision(c(10, 0), poly)).toBe(true);
	});

	test("C2 ⋂ Polyline: крайний конец → false", () => {
		const poly: CT.Polyline = [c(0, 0), c(20, 0), c(20, 20)];
		expect(UG.collision(c(0, 0), poly)).toBe(false);
	});

	// ── Bounds ⋂ Bounds ──
	test("Bounds ⋂ Bounds: перекрытие → true", () => {
		expect(UG.collision(b(-10, -20, 30, 40), b(10, 10, 50, 50))).toBe(true);
	});

	test("Bounds ⋂ Bounds: нет перекрытия → false", () => {
		expect(UG.collision(b(-10, -20, 30, 40), b(100, 100, 200, 200))).toBe(false);
	});

	test("Bounds ⋂ Bounds: касание углом → false", () => {
		expect(UG.collision(b(-10, -20, 30, 40), b(30, 40, 60, 80))).toBe(false);
	});

	// ── Bounds ⋂ Convex ──
	test("Bounds ⋂ Convex: перекрытие → true", () => {
		const sq: CT.Convex = [c(10, 10), c(50, 10), c(50, 50), c(10, 50), c(10, 10)];
		expect(UG.collision(b(-10, -20, 30, 40), sq)).toBe(true);
	});

	test("Bounds ⋂ Convex: нет перекрытия → false", () => {
		const sq: CT.Convex = [c(100, 100), c(150, 100), c(150, 150), c(100, 150), c(100, 100)];
		expect(UG.collision(b(-10, -20, 30, 40), sq)).toBe(false);
	});

	// ── Bounds ⋂ Polyline ──
	test("Bounds ⋂ Polyline: сегмент проходит через interior → true", () => {
		// ломаная из (0,0)-(100,0) проходит сквозь bounds (-10,-20,30,40) по X, y=0 внутри
		const poly: CT.Polyline = [c(0, 0), c(100, 0)];
		expect(UG.collision(b(-10, -20, 30, 40), poly)).toBe(true);
	});

	test("Bounds ⋂ Polyline: ломаная снаружи → false", () => {
		const poly: CT.Polyline = [c(100, 100), c(200, 100)];
		expect(UG.collision(b(-10, -20, 30, 40), poly)).toBe(false);
	});

	test("Bounds ⋂ Polyline: касание концом границы → false (граница не владеет)", () => {
		// конец (30,0) на правой границе bounds (-10,-20,30,40) — не строго внутри
		const poly: CT.Polyline = [c(30, 0), c(100, 0)];
		expect(UG.collision(b(-10, -20, 30, 40), poly)).toBe(false);
	});

	// ── Convex ⋂ Convex ──
	test("Convex ⋂ Convex: перекрытие → true", () => {
		const sq1: CT.Convex = [c(-10, -20), c(30, -20), c(30, 40), c(-10, 40), c(-10, -20)];
		const sq2: CT.Convex = [c(10, 10), c(50, 10), c(50, 50), c(10, 50), c(10, 10)];
		expect(UG.collision(sq1, sq2)).toBe(true);
	});

	test("Convex ⋂ Convex: нет перекрытия → false", () => {
		const sq1: CT.Convex = [c(-10, -20), c(30, -20), c(30, 40), c(-10, 40), c(-10, -20)];
		const sq2: CT.Convex = [c(100, 100), c(150, 100), c(150, 150), c(100, 150), c(100, 100)];
		expect(UG.collision(sq1, sq2)).toBe(false);
	});

	// ── Convex ⋂ Polyline ──
	test("Convex ⋂ Polyline: сегмент через interior → true", () => {
		const sq: CT.Convex = [c(0, 0), c(20, 0), c(20, 20), c(0, 20), c(0, 0)];
		const poly: CT.Polyline = [c(-10, 10), c(30, 10)];
		expect(UG.collision(sq, poly)).toBe(true);
	});

	test("Convex ⋂ Polyline: ломаная снаружи → false", () => {
		const sq: CT.Convex = [c(0, 0), c(20, 0), c(20, 20), c(0, 20), c(0, 0)];
		const poly: CT.Polyline = [c(100, 100), c(200, 100)];
		expect(UG.collision(sq, poly)).toBe(false);
	});

	// ── Polyline ⋂ Polyline ──
	test("Polyline ⋂ Polyline: крест сегментов → true", () => {
		const a: CT.Polyline = [c(0, 0), c(20, 0)];
		const bb: CT.Polyline = [c(10, -10), c(10, 10)];
		expect(UG.collision(a, bb)).toBe(true);
	});

	test("Polyline ⋂ Polyline: касание концами → false", () => {
		const a: CT.Polyline = [c(0, 0), c(20, 0)];
		const bb: CT.Polyline = [c(0, 0), c(0, 20)];
		expect(UG.collision(a, bb)).toBe(false);
	});

	// ── Симметричность ──
	test("симметричность для всех комбинаций", () => {
		const p = c(15, 10);
		const bounds = b(-10, -20, 30, 40);
		const convex: CT.Convex = [c(10, 10), c(50, 10), c(50, 50), c(10, 50), c(10, 10)];
		const poly: CT.Polyline = [c(0, 0), c(40, 0), c(40, 40)];

		expect(UG.collision(p, p)).toBe(UG.collision(p, p));
		expect(UG.collision(p, bounds)).toBe(UG.collision(bounds, p));
		expect(UG.collision(p, convex)).toBe(UG.collision(convex, p));
		expect(UG.collision(p, poly)).toBe(UG.collision(poly, p));
		expect(UG.collision(bounds, convex)).toBe(UG.collision(convex, bounds));
		expect(UG.collision(bounds, poly)).toBe(UG.collision(poly, bounds));
		expect(UG.collision(convex, poly)).toBe(UG.collision(poly, convex));
		expect(UG.collision(poly, poly)).toBe(UG.collision(poly, poly));
	});
});
