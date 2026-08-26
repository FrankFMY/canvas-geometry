import { describe, expect, test } from "bun:test";
import type { SPN } from "./support/spacing.js";
import { UB } from "./bounds.js";
import { UC2 } from "./coords.js";
import type * as CT from "./types.js";

const b = (minX: number, minY: number, maxX: number, maxY: number): CT.Bounds => ({ minX, minY, maxX, maxY });

/** Проверка согласованности collision и mtv: collision(a,b) === !!mtv(a,b) === result. */
const checkCollision = (a: CT.Bounds, bb: CT.Bounds, result: boolean) => {
	expect(UB.collision(a, bb)).toBe(result);
	expect(!!UB.mtv(a, bb)).toBe(result);
};

/** Симметричность collision и mtv: collision(a,b) === collision(b,a) и !!mtv(a,b) === !!mtv(b,a). */
const checkSymmetry = (a: CT.Bounds, bb: CT.Bounds) => {
	expect(UB.collision(a, bb)).toBe(UB.collision(bb, a));
	expect(!!UB.mtv(a, bb)).toBe(!!UB.mtv(bb, a));
};

describe("UB.center: геометрический центр Bounds", () => {
	test("без padding → {(minX+maxX)/2, (minY+maxY)/2}", () => {
		expect(UB.center(b(0, 0, 100, 200))).toEqual({ x: 50, y: 100 });
		expect(UB.center(b(-10, -20, 30, 40))).toEqual({ x: 10, y: 10 });
	});

	test("padding = 0 → геометрический центр", () => {
		expect(UB.center(b(0, 0, 100, 200), 0)).toEqual({ x: 50, y: 100 });
	});

	test("симметричное число (пиксели) → центр не смещается", () => {
		expect(UB.center(b(0, 0, 100, 200), 10)).toEqual({ x: 50, y: 100 });
	});

	test("симметричное число (доля) → центр не смещается", () => {
		expect(UB.center(b(0, 0, 100, 200), 0.1)).toEqual({ x: 50, y: 100 });
	});

	test("асимметричный P4 (пиксели) → смещение (left-right)/2, (top-bottom)/2", () => {
		const c = UB.center(b(0, 0, 100, 200), [10, 20, 30, 40]);
		expect(c.x).toBeCloseTo(60, 10);
		expect(c.y).toBeCloseTo(90, 10);
	});

	test("асимметричный P4 (доли) → смещение пропорционально размеру оси", () => {
		const c = UB.center(b(0, 0, 100, 200), [0.1, 0.2, 0.3, 0.4]);
		expect(c.x).toBeCloseTo(60, 10);
		expect(c.y).toBeCloseTo(80, 10);
	});

	test("centre с отрицательными Bounds", () => {
		expect(UB.center(b(-50, -100, 50, 100))).toEqual({ x: 0, y: 0 });
	});
});

describe("UB.pad: сжатие по P4 = [top, right, bottom, left]", () => {
	test("нулевой P4 → без изменений", () => {
		const bounds = b(0, 0, 100, 200);
		expect(UB.pad(bounds, [0, 0, 0, 0])).toEqual(bounds);
	});

	test("P4 [10,20,30,40] → minX+=40, maxX-=20, minY+=10, maxY-=30", () => {
		expect(UB.pad(b(0, 0, 100, 200), [10, 20, 30, 40])).toEqual({
			minX: 40,
			maxX: 80,
			minY: 10,
			maxY: 170,
		});
	});

	test("только по X (top=bottom=0)", () => {
		expect(UB.pad(b(0, 0, 100, 200), [0, 20, 0, 40])).toEqual({
			minX: 40,
			maxX: 80,
			minY: 0,
			maxY: 200,
		});
	});

	test("только по Y (left=right=0)", () => {
		expect(UB.pad(b(0, 0, 100, 200), [10, 0, 30, 0])).toEqual({
			minX: 0,
			maxX: 100,
			minY: 10,
			maxY: 170,
		});
	});

	test("может породить отрицательные Bounds (inverted)", () => {
		expect(UB.pad(b(0, 0, 10, 10), [100, 100, 100, 100])).toEqual({
			minX: 100,
			maxX: -90,
			minY: 100,
			maxY: -90,
		});
	});

	test("не мутирует исходный Bounds", () => {
		const bounds = b(0, 0, 100, 200);
		UB.pad(bounds, [10, 20, 30, 40]);
		expect(bounds).toEqual(b(0, 0, 100, 200));
	});
});

describe("UB.deflate: сжатие внутрь на padding", () => {
	test("padding = 0 → копия (не мутирует)", () => {
		const bounds = b(0, 0, 100, 200);
		const d = UB.deflate(bounds, 0);
		expect(d).toEqual(bounds);
		expect(d).not.toBe(bounds);
	});

	test("симметричное число (пиксели) → со всех сторон по n", () => {
		expect(UB.deflate(b(0, 0, 100, 200), 10)).toEqual({
			minX: 10,
			maxX: 90,
			minY: 10,
			maxY: 190,
		});
	});

	test("симметричное число (доля) → пропорционально размеру оси", () => {
		expect(UB.deflate(b(0, 0, 100, 200), 0.1)).toEqual({
			minX: 10,
			maxX: 90,
			minY: 20,
			maxY: 180,
		});
	});

	test("асимметричный P4 (пиксели)", () => {
		expect(UB.deflate(b(0, 0, 100, 200), [10, 20, 30, 40])).toEqual({
			minX: 40,
			maxX: 80,
			minY: 10,
			maxY: 170,
		});
	});

	test("асимметричный P4 (доли)", () => {
		expect(UB.deflate(b(0, 0, 100, 200), [0.1, 0.2, 0.3, 0.4])).toEqual({
			minX: 40,
			maxX: 80,
			minY: 20,
			maxY: 140,
		});
	});

	test("может породить отрицательные Bounds", () => {
		expect(UB.deflate(b(0, 0, 10, 10), 100)).toEqual({
			minX: 100,
			maxX: -90,
			minY: 100,
			maxY: -90,
		});
	});
});

describe("UB.inflate: расширение наружу на margin", () => {
	test("margin = 0 → копия (не мутирует)", () => {
		const bounds = b(0, 0, 100, 200);
		const i = UB.inflate(bounds, 0);
		expect(i).toEqual(bounds);
		expect(i).not.toBe(bounds);
	});

	test("симметричное число (пиксели) → +n со всех сторон", () => {
		expect(UB.inflate(b(0, 0, 100, 200), 10)).toEqual({
			minX: -10,
			maxX: 110,
			minY: -10,
			maxY: 210,
		});
	});

	test("симметричное число (доля) → пропорционально размеру оси", () => {
		expect(UB.inflate(b(0, 0, 100, 200), 0.1)).toEqual({
			minX: -10,
			maxX: 110,
			minY: -20,
			maxY: 220,
		});
	});

	test("асимметричный P4 (пиксели)", () => {
		expect(UB.inflate(b(0, 0, 100, 200), [10, 20, 30, 40])).toEqual({
			minX: -40,
			maxX: 120,
			minY: -10,
			maxY: 230,
		});
	});

	test("inflate — обратная операция к deflate (симметричный)", () => {
		const bounds = b(0, 0, 100, 200);
		const deflated = UB.deflate(bounds, 10);
		const restored = UB.inflate(deflated, 10);
		expect(restored).toEqual(bounds);
	});

	test("inflate — обратная операция к deflate (асимметричный P4 пиксели)", () => {
		const bounds = b(0, 0, 100, 200);
		const padding: SPN = [10, 20, 30, 40];
		const deflated = UB.deflate(bounds, padding);
		const restored = UB.inflate(deflated, padding);
		expect(restored).toEqual(bounds);
	});
});

describe("UB.corners: направление против часовой (CCW, Y-вверх)", () => {
	test("возвращает 4 угла [BL, BR, TR, TL]", () => {
		const c = UB.corners(b(0, 0, 10, 10));
		expect(c).toEqual([
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		]);
	});

	test("все тройки последовательных вершин → CCW (ccw > 0)", () => {
		const c = UB.corners(b(0, 0, 10, 10));
		expect(UC2.ccw(c[0], c[1], c[2])).toBeGreaterThan(0);
		expect(UC2.ccw(c[1], c[2], c[3])).toBeGreaterThan(0);
		expect(UC2.ccw(c[2], c[3], c[0])).toBeGreaterThan(0);
		expect(UC2.ccw(c[3], c[0], c[1])).toBeGreaterThan(0);
	});

	test("CCW для произвольного Bounds", () => {
		const c = UB.corners(b(-50, -100, 30, 20));
		expect(UC2.ccw(c[0], c[1], c[2])).toBeGreaterThan(0);
		expect(UC2.ccw(c[1], c[2], c[3])).toBeGreaterThan(0);
		expect(UC2.ccw(c[2], c[3], c[0])).toBeGreaterThan(0);
		expect(UC2.ccw(c[3], c[0], c[1])).toBeGreaterThan(0);
	});

	test("порядок: BL → BR → TR → TL (математический Y-вверх)", () => {
		const c = UB.corners(b(0, 0, 10, 10));
		expect(c[0]).toEqual({ x: 0, y: 0 });
		expect(c[1]).toEqual({ x: 10, y: 0 });
		expect(c[2]).toEqual({ x: 10, y: 10 });
		expect(c[3]).toEqual({ x: 0, y: 10 });
	});

	test("вырожденный Bounds (точка) → 4 одинаковые точки", () => {
		const c = UB.corners(b(5, 5, 5, 5));
		expect(c).toEqual([
			{ x: 5, y: 5 },
			{ x: 5, y: 5 },
			{ x: 5, y: 5 },
			{ x: 5, y: 5 },
		]);
	});

	test("линия по X (minY === maxY) → вырожденный, ccw = 0", () => {
		const c = UB.corners(b(0, 5, 10, 5));
		expect(UC2.ccw(c[0], c[1], c[2])).toBeCloseTo(0, 10);
	});
});

describe("UB.rhomb: направление против часовой (CCW, Y-вверх)", () => {
	test("возвращает 4 вершины [S, E, N, W]", () => {
		const r = UB.rhomb(b(0, 0, 10, 10));
		expect(r).toEqual([
			{ x: 5, y: 0 },
			{ x: 10, y: 5 },
			{ x: 5, y: 10 },
			{ x: 0, y: 5 },
		]);
	});

	test("все тройки → CCW (ccw > 0)", () => {
		const r = UB.rhomb(b(0, 0, 10, 10));
		expect(UC2.ccw(r[0], r[1], r[2])).toBeGreaterThan(0);
		expect(UC2.ccw(r[1], r[2], r[3])).toBeGreaterThan(0);
		expect(UC2.ccw(r[2], r[3], r[0])).toBeGreaterThan(0);
		expect(UC2.ccw(r[3], r[0], r[1])).toBeGreaterThan(0);
	});

	test("CCW для произвольного Bounds", () => {
		const r = UB.rhomb(b(-50, -100, 30, 20));
		expect(UC2.ccw(r[0], r[1], r[2])).toBeGreaterThan(0);
		expect(UC2.ccw(r[1], r[2], r[3])).toBeGreaterThan(0);
		expect(UC2.ccw(r[2], r[3], r[0])).toBeGreaterThan(0);
		expect(UC2.ccw(r[3], r[0], r[1])).toBeGreaterThan(0);
	});

	test("порядок: S → E → N → W (математический Y-вверх)", () => {
		const r = UB.rhomb(b(0, 0, 10, 10));
		expect(r[0]).toEqual({ x: 5, y: 0 });
		expect(r[1]).toEqual({ x: 10, y: 5 });
		expect(r[2]).toEqual({ x: 5, y: 10 });
		expect(r[3]).toEqual({ x: 0, y: 5 });
	});

	test("неквадратный Bounds → ромб с разными полуосями", () => {
		const r = UB.rhomb(b(0, 0, 100, 20));
		expect(r).toEqual([
			{ x: 50, y: 0 },
			{ x: 100, y: 10 },
			{ x: 50, y: 20 },
			{ x: 0, y: 10 },
		]);
	});
});

describe("UB.edges: направление против часовой (CCW, Y-вверх)", () => {
	test("возвращает 4 ребра [BL→BR, BR→TR, TR→TL, TL→BL]", () => {
		const edges = UB.edges(b(0, 0, 10, 10));
		expect(edges).toEqual([
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
			],
			[
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
			],
			[
				{ x: 10, y: 10 },
				{ x: 0, y: 10 },
			],
			[
				{ x: 0, y: 10 },
				{ x: 0, y: 0 },
			],
		]);
	});

	test("каждое ребро направлено CCW (вдоль обхода corners)", () => {
		const c = UB.corners(b(0, 0, 10, 10));
		const edges = UB.edges(b(0, 0, 10, 10));
		for (let i = 0; i < 4; i++) {
			expect(edges[i][0]).toEqual(c[i]);
			expect(edges[i][1]).toEqual(c[(i + 1) % 4]);
		}
	});

	test("ребра образуют замкнутый контур CCW", () => {
		const c = UB.corners(b(-30, -20, 50, 40));
		const edges = UB.edges(b(-30, -20, 50, 40));
		for (let i = 0; i < 4; i++) {
			const next = (i + 1) % 4;
			const after = (i + 2) % 4;
			expect(UC2.ccw(edges[i][0], edges[i][1], c[after])).toBeGreaterThan(0);
			expect(UC2.ccw(c[i], c[next], c[after])).toBeGreaterThan(0);
		}
	});

	test("рёбра соответствуют сторонам [bottom, right, top, left]", () => {
		const edges = UB.edges(b(0, 0, 10, 10));
		expect(edges[0]).toEqual([
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
		]);
		expect(edges[1]).toEqual([
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
		]);
		expect(edges[2]).toEqual([
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		]);
		expect(edges[3]).toEqual([
			{ x: 0, y: 10 },
			{ x: 0, y: 0 },
		]);
	});
});

describe("UB.interior: b примыкает к a изнутри (общая граница)", () => {
	const A = b(0, 0, 100, 100);

	test("b внутри, касается левой границы (b.minX ≈ a.minX)", () => {
		expect(UB.interior(A, b(0, 10, 50, 90))).toBe(true);
	});

	test("b внутри, касается правой границы (b.maxX ≈ a.maxX)", () => {
		expect(UB.interior(A, b(50, 10, 100, 90))).toBe(true);
	});

	test("b внутри, касается нижней границы (b.minY ≈ a.minY)", () => {
		expect(UB.interior(A, b(10, 0, 90, 50))).toBe(true);
	});

	test("b внутри, касается верхней границы (b.maxY ≈ a.maxY)", () => {
		expect(UB.interior(A, b(10, 50, 90, 100))).toBe(true);
	});

	test("b внутри, не касается границ → false", () => {
		expect(UB.interior(A, b(10, 10, 90, 90))).toBe(false);
	});

	test("b внутри, касается всех 4 границ (идентичные) → true", () => {
		expect(UB.interior(A, A)).toBe(true);
	});

	test("b снаружи a → false", () => {
		expect(UB.interior(A, b(200, 200, 300, 300))).toBe(false);
	});

	test("b касается двух границ (угол) → true", () => {
		expect(UB.interior(A, b(0, 0, 50, 50))).toBe(true);
	});

	test("симметричность: interior(a,b) === interior(b,a)", () => {
		const Bin = b(0, 10, 50, 90);
		expect(UB.interior(A, Bin)).toBe(UB.interior(Bin, A));
	});

	test("EPS-толерантность: касание в пределах EPS → true", () => {
		const eps = UC2.__eps;
		const Bnear = b(0 + eps / 2, 10, 50, 90);
		expect(UB.interior(A, Bnear)).toBe(true);
	});

	test("кастомный EPS ужесточает порог", () => {
		const Bnear = b(0.0005, 10, 50, 90);
		expect(UB.interior(A, Bnear, 1e-4)).toBe(false);
		expect(UB.interior(A, Bnear, 1e-3)).toBe(true);
	});

	test("вырожденный b (точка) на углу a → true", () => {
		expect(UB.interior(A, b(0, 0, 0, 0))).toBe(true);
		expect(UB.interior(A, b(100, 100, 100, 100))).toBe(true);
	});

	test("вырожденный b (точка) строго внутри a → false", () => {
		expect(UB.interior(A, b(50, 50, 50, 50))).toBe(false);
	});
});

describe("UB.exterior: b примыкает к a снаружи (противоположные границы совпадают)", () => {
	const A = b(0, 0, 100, 100);

	test("b справа от a (b.minX ≈ a.maxX)", () => {
		expect(UB.exterior(A, b(100, 0, 200, 100))).toBe(true);
	});

	test("b сверху от a (b.minY ≈ a.maxY)", () => {
		expect(UB.exterior(A, b(0, 100, 100, 200))).toBe(true);
	});

	test("b слева от a (b.maxX ≈ a.minX)", () => {
		expect(UB.exterior(A, b(-100, 0, 0, 100))).toBe(true);
	});

	test("b снизу от a (b.maxY ≈ a.minY)", () => {
		expect(UB.exterior(A, b(0, -100, 100, 0))).toBe(true);
	});

	test("b снаружи, не примыкает (зазор) → false", () => {
		expect(UB.exterior(A, b(200, 0, 300, 100))).toBe(false);
		expect(UB.exterior(A, b(101, 0, 200, 100))).toBe(false);
	});

	test("идентичные Bounds → false (это interior, не exterior)", () => {
		expect(UB.exterior(A, A)).toBe(false);
	});

	test("b внутри a → false", () => {
		expect(UB.exterior(A, b(10, 10, 90, 90))).toBe(false);
	});

	test("b примыкает углом снаружи (две противоположные границы) → true", () => {
		expect(UB.exterior(A, b(100, 100, 200, 200))).toBe(true);
		expect(UB.exterior(A, b(-100, -100, 0, 0))).toBe(true);
	});

	test("симметричность: exterior(a,b) === exterior(b,a)", () => {
		const B = b(100, 0, 200, 100);
		expect(UB.exterior(A, B)).toBe(UB.exterior(B, A));
	});

	test("EPS-толерантность: примыкание в пределах EPS → true", () => {
		const eps = UC2.__eps;
		const Bnear = b(100 + eps / 2, 0, 200, 100);
		expect(UB.exterior(A, Bnear)).toBe(true);
	});

	test("кастомный EPS ужесточает порог", () => {
		const Bnear = b(100.0005, 0, 200, 100);
		expect(UB.exterior(A, Bnear, 1e-4)).toBe(false);
		expect(UB.exterior(A, Bnear, 1e-3)).toBe(true);
	});
});

describe("UB.neighbour: примыкание границами (interior ∨ exterior)", () => {
	const A = b(0, 0, 100, 100);

	test("interior case (b внутри, касается) → true", () => {
		expect(UB.neighbour(A, b(0, 10, 50, 90))).toBe(true);
	});

	test("exterior case (b снаружи, примыкает) → true", () => {
		expect(UB.neighbour(A, b(100, 0, 200, 100))).toBe(true);
	});

	test("далеко (не interior, не exterior) → false", () => {
		expect(UB.neighbour(A, b(500, 500, 600, 600))).toBe(false);
	});

	test("b строго внутри, не касается → false", () => {
		expect(UB.neighbour(A, b(10, 10, 90, 90))).toBe(false);
	});

	test("идентичные → true (через interior)", () => {
		expect(UB.neighbour(A, A)).toBe(true);
	});

	test("симметричность: neighbour(a,b) === neighbour(b,a)", () => {
		const Bext = b(100, 0, 200, 100);
		const Bin = b(0, 10, 50, 90);
		const Bfar = b(500, 500, 600, 600);
		expect(UB.neighbour(A, Bext)).toBe(UB.neighbour(Bext, A));
		expect(UB.neighbour(A, Bin)).toBe(UB.neighbour(Bin, A));
		expect(UB.neighbour(A, Bfar)).toBe(UB.neighbour(Bfar, A));
	});

	test("neighbour = interior ∨ exterior для набора пар", () => {
		const pairs: Array<[CT.Bounds, CT.Bounds]> = [
			[A, b(0, 10, 50, 90)],
			[A, b(100, 0, 200, 100)],
			[A, b(10, 10, 90, 90)],
			[A, A],
			[A, b(500, 500, 600, 600)],
		];
		for (const [a, bb] of pairs) {
			const expected = UB.interior(a, bb) || UB.exterior(a, bb);
			expect(UB.neighbour(a, bb)).toBe(expected);
		}
	});
});

describe("UB.upgrade: расширение Bounds до target_size", () => {
	test("actual >= target по обеим осям → null (уже достаточно)", () => {
		expect(UB.upgrade(b(0, 0, 100, 100), { w: 50, h: 50 })).toBeNull();
	});

	test("actual === target → null (уже равно)", () => {
		expect(UB.upgrade(b(0, 0, 100, 100), { w: 100, h: 100 })).toBeNull();
	});

	test("actual > target по одной оси, === по другой → null", () => {
		expect(UB.upgrade(b(0, 0, 100, 200), { w: 100, h: 100 })).toBeNull();
	});

	test("расширение по X: центр сохранён, размер по X = target.w", () => {
		const result = UB.upgrade(b(0, 0, 100, 100), { w: 200, h: 100 });
		expect(result).toEqual({ minX: -50, minY: 0, maxX: 150, maxY: 100 });
	});

	test("расширение по Y: центр сохранён, размер по Y = target.h", () => {
		const result = UB.upgrade(b(0, 0, 100, 100), { w: 100, h: 200 });
		expect(result).toEqual({ minX: 0, minY: -50, maxX: 100, maxY: 150 });
	});

	test("расширение по обеим осям: центр сохранён", () => {
		const result = UB.upgrade(b(0, 0, 100, 100), { w: 200, h: 200 });
		expect(result).toEqual({ minX: -50, minY: -50, maxX: 150, maxY: 150 });
	});

	test("центр сохраняется для смещённого Bounds", () => {
		const bounds = b(10, 20, 60, 70);
		const centerBefore = UB.center(bounds);
		const result = UB.upgrade(bounds, { w: 200, h: 200 });
		const centerAfter = UB.center(result!);
		expect(centerAfter).toEqual(centerBefore);
	});

	test("размер результата = max(actual, target) по каждой оси", () => {
		const result = UB.upgrade(b(0, 0, 100, 100), { w: 200, h: 50 });
		const size = UB.size(result!);
		expect(size).toEqual({ w: 200, h: 100 });
	});

	test("не мутирует исходный Bounds", () => {
		const bounds = b(0, 0, 100, 100);
		UB.upgrade(bounds, { w: 200, h: 200 });
		expect(bounds).toEqual(b(0, 0, 100, 100));
	});

	test("target меньше actual по одной оси, больше по другой → расширяет только одну", () => {
		const result = UB.upgrade(b(0, 0, 100, 200), { w: 300, h: 100 });
		expect(result).toEqual({ minX: -100, minY: 0, maxX: 200, maxY: 200 });
	});
});

describe("UB.isPoint: Bounds-точка (minX≈maxX и minY≈maxY)", () => {
	test("все границы совпадают → true", () => {
		expect(UB.isPoint(b(0, 0, 0, 0))).toBe(true);
		expect(UB.isPoint(b(5, 5, 5, 5))).toBe(true);
		expect(UB.isPoint(b(-3, 7, -3, 7))).toBe(true);
	});

	test("линия по X (minY≠maxY) → false", () => {
		expect(UB.isPoint(b(0, 0, 10, 0))).toBe(false);
		expect(UB.isPoint(b(5, 3, 5, 8))).toBe(false);
	});

	test("полигон (обе оси положительны) → false", () => {
		expect(UB.isPoint(b(0, 0, 10, 10))).toBe(false);
		expect(UB.isPoint(b(1, 1, 2, 2))).toBe(false);
	});

	test("EPS-толерантность: расхождение в пределах EPS → true", () => {
		expect(UB.isPoint(b(0, 0, 0.0005, 0))).toBe(true);
		expect(UB.isPoint(b(0, 0, 0, 0.0009))).toBe(true);
		expect(UB.isPoint(b(0, 0, 0.0005, 0.0005))).toBe(true);
	});

	test("за пределами EPS → false", () => {
		expect(UB.isPoint(b(0, 0, 0.002, 0))).toBe(false);
		expect(UB.isPoint(b(0, 0, 0, 0.0011))).toBe(false);
	});

	test("кастомный EPS", () => {
		const bounds = b(0, 0, 0.0005, 0);
		expect(UB.isPoint(bounds, 1e-4)).toBe(false);
		expect(UB.isPoint(bounds, 1e-3)).toBe(true);
	});
});

describe("UB.isEdge: Bounds-линия (ровно одна ось вырождена)", () => {
	test("линия по X (minY≈maxY, minX≠maxX) → true", () => {
		expect(UB.isEdge(b(0, 0, 10, 0))).toBe(true);
		expect(UB.isEdge(b(5, 3, 8, 3))).toBe(true);
	});

	test("линия по Y (minX≈maxX, minY≠maxY) → true", () => {
		expect(UB.isEdge(b(0, 0, 0, 10))).toBe(true);
		expect(UB.isEdge(b(5, 0, 5, 8))).toBe(true);
	});

	test("точка (обе оси вырождены) → false", () => {
		expect(UB.isEdge(b(0, 0, 0, 0))).toBe(false);
		expect(UB.isEdge(b(5, 5, 5, 5))).toBe(false);
	});

	test("полигон (обе оси положительны) → false", () => {
		expect(UB.isEdge(b(0, 0, 10, 10))).toBe(false);
		expect(UB.isEdge(b(1, 1, 2, 2))).toBe(false);
	});

	test("EPS-толерантность по вырожденной оси", () => {
		expect(UB.isEdge(b(0, 0, 10, 0.0005))).toBe(true);
		expect(UB.isEdge(b(0, 0, 0.0005, 10))).toBe(true);
	});

	test("за пределами EPS по вырожденной оси → false (полигон)", () => {
		expect(UB.isEdge(b(0, 0, 10, 0.002))).toBe(false);
	});

	test("isPoint и isEdge взаимно исключают друг друга", () => {
		const cases: CT.Bounds[] = [b(0, 0, 0, 0), b(5, 5, 5, 5), b(0, 0, 10, 0), b(0, 0, 0, 10), b(0, 0, 10, 10), b(-3, 7, 5, 7), b(2, 2, 2, 8)];
		for (const bounds of cases) {
			expect(UB.isPoint(bounds) && UB.isEdge(bounds)).toBe(false);
		}
	});
});

describe("UB.isEmpty: канон пустого Bounds (точка и линия → true, полигон → false)", () => {
	test("точка (обе оси вырождены) → true", () => {
		expect(UB.isEmpty(b(0, 0, 0, 0))).toBe(true);
		expect(UB.isEmpty(b(5, 5, 5, 5))).toBe(true);
	});

	test("линия по X (minY≈maxY) → true", () => {
		expect(UB.isEmpty(b(0, 0, 10, 0))).toBe(true);
		expect(UB.isEmpty(b(5, 3, 8, 3))).toBe(true);
	});

	test("линия по Y (minX≈maxX) → true", () => {
		expect(UB.isEmpty(b(0, 0, 0, 10))).toBe(true);
		expect(UB.isEmpty(b(5, 0, 5, 8))).toBe(true);
	});

	test("полигон (обе оси положительны) → false", () => {
		expect(UB.isEmpty(b(0, 0, 10, 10))).toBe(false);
		expect(UB.isEmpty(b(1, 1, 2, 2))).toBe(false);
		expect(UB.isEmpty(b(-10, -10, 10, 10))).toBe(false);
	});

	test("вывернутый по X (minX > maxX) → true", () => {
		expect(UB.isEmpty(b(10, 0, 0, 10))).toBe(true);
	});

	test("вывернутый по Y (minY > maxY) → true", () => {
		expect(UB.isEmpty(b(0, 10, 10, 0))).toBe(true);
	});

	test("EPS-толерантность: микро-расхождение → true (считается вырожденным)", () => {
		expect(UB.isEmpty(b(0, 0, 0.0005, 10))).toBe(true);
		expect(UB.isEmpty(b(0, 0, 10, 0.0005))).toBe(true);
	});

	test("за пределами EPS → false", () => {
		expect(UB.isEmpty(b(0, 0, 0.002, 10))).toBe(false);
		expect(UB.isEmpty(b(0, 0, 10, 0.002))).toBe(false);
	});

	test("isEmpty = isPoint ∨ isEdge (для невырожденных/невывернутых)", () => {
		const cases: CT.Bounds[] = [
			b(0, 0, 0, 0),
			b(5, 5, 5, 5),
			b(0, 0, 10, 0),
			b(0, 0, 0, 10),
			b(0, 0, 10, 10),
			b(-3, 7, 5, 7),
			b(2, 2, 2, 8),
			b(-10, -10, 10, 10),
		];
		for (const bounds of cases) {
			const expected = UB.isPoint(bounds) || UB.isEdge(bounds);
			expect(UB.isEmpty(bounds)).toBe(expected);
		}
	});

	test("zero() → true (точка в {0,0})", () => {
		expect(UB.isEmpty(UB.zero())).toBe(true);
	});

	test("кастомный EPS", () => {
		const bounds = b(0, 0, 0.0005, 10);
		expect(UB.isEmpty(bounds, 1e-4)).toBe(false);
		expect(UB.isEmpty(bounds, 1e-3)).toBe(true);
	});
});

describe("UB.contain: a ⊇ b (допускает совпадение границ)", () => {
	const POLY = b(0, 0, 100, 100);
	const LINE_X = b(0, 50, 100, 50);
	const LINE_Y = b(50, 0, 50, 100);
	const POINT = b(50, 50, 50, 50);

	describe("точка ⊇ ...", () => {
		test("точка ⊇ точка (совпадают) → true", () => {
			expect(UB.contain(POINT, POINT)).toBe(true);
		});

		test("точка ⊇ точка (разные) → false", () => {
			expect(UB.contain(POINT, b(60, 60, 60, 60))).toBe(false);
			expect(UB.contain(POINT, b(50, 60, 50, 60))).toBe(false);
		});

		test("точка ⊇ линия → false", () => {
			expect(UB.contain(POINT, LINE_X)).toBe(false);
			expect(UB.contain(POINT, b(50, 50, 60, 50))).toBe(false);
		});

		test("точка ⊇ полигон → false", () => {
			expect(UB.contain(POINT, POLY)).toBe(false);
		});
	});

	describe("линия ⊇ ...", () => {
		test("линия ⊇ точка (на линии) → true", () => {
			expect(UB.contain(LINE_X, b(50, 50, 50, 50))).toBe(true);
			expect(UB.contain(LINE_X, b(0, 50, 0, 50))).toBe(true);
			expect(UB.contain(LINE_X, b(100, 50, 100, 50))).toBe(true);
		});

		test("линия ⊇ точка (за пределами по длине) → false", () => {
			expect(UB.contain(LINE_X, b(150, 50, 150, 50))).toBe(false);
			expect(UB.contain(LINE_X, b(-10, 50, -10, 50))).toBe(false);
		});

		test("линия ⊇ точка (не на линии) → false", () => {
			expect(UB.contain(LINE_X, b(50, 60, 50, 60))).toBe(false);
			expect(UB.contain(LINE_X, b(50, 40, 50, 40))).toBe(false);
		});

		test("линия ⊇ линия (та же ось, внутри) → true", () => {
			expect(UB.contain(LINE_X, b(20, 50, 80, 50))).toBe(true);
			expect(UB.contain(LINE_X, b(0, 50, 100, 50))).toBe(true);
		});

		test("линия ⊇ линия (та же ось, выступает) → false", () => {
			expect(UB.contain(LINE_X, b(-10, 50, 110, 50))).toBe(false);
			expect(UB.contain(LINE_X, b(50, 50, 150, 50))).toBe(false);
		});

		test("линия ⊇ линия (другая ось) → false", () => {
			expect(UB.contain(LINE_X, LINE_Y)).toBe(false);
			expect(UB.contain(LINE_X, b(50, 0, 50, 100))).toBe(false);
		});

		test("линия ⊇ полигон → false", () => {
			expect(UB.contain(LINE_X, POLY)).toBe(false);
		});
	});

	describe("полигон ⊇ ...", () => {
		test("полигон ⊇ точка (строго внутри) → true", () => {
			expect(UB.contain(POLY, b(50, 50, 50, 50))).toBe(true);
		});

		test("полигон ⊇ точка (на границе) → true", () => {
			expect(UB.contain(POLY, b(0, 0, 0, 0))).toBe(true);
			expect(UB.contain(POLY, b(100, 100, 100, 100))).toBe(true);
			expect(UB.contain(POLY, b(50, 0, 50, 0))).toBe(true);
			expect(UB.contain(POLY, b(0, 50, 0, 50))).toBe(true);
		});

		test("полигон ⊇ точка (снаружи) → false", () => {
			expect(UB.contain(POLY, b(150, 50, 150, 50))).toBe(false);
			expect(UB.contain(POLY, b(-10, 50, -10, 50))).toBe(false);
		});

		test("полигон ⊇ линия (строго внутри) → true", () => {
			expect(UB.contain(POLY, b(20, 50, 80, 50))).toBe(true);
			expect(UB.contain(POLY, b(50, 20, 50, 80))).toBe(true);
		});

		test("полигон ⊇ линия (на границе) → true", () => {
			expect(UB.contain(POLY, b(0, 50, 100, 50))).toBe(true);
			expect(UB.contain(POLY, b(50, 0, 50, 100))).toBe(true);
		});

		test("полигон ⊇ линия (выступает) → false", () => {
			expect(UB.contain(POLY, b(-10, 50, 110, 50))).toBe(false);
			expect(UB.contain(POLY, b(50, -10, 50, 110))).toBe(false);
		});

		test("полигон ⊇ полигон (строго внутри) → true", () => {
			expect(UB.contain(POLY, b(20, 20, 80, 80))).toBe(true);
		});

		test("полигон ⊇ полигон (равные) → true", () => {
			expect(UB.contain(POLY, POLY)).toBe(true);
		});

		test("полигон ⊇ полигон (касается границ) → true", () => {
			expect(UB.contain(POLY, b(0, 0, 50, 50))).toBe(true);
			expect(UB.contain(POLY, b(0, 0, 100, 100))).toBe(true);
		});

		test("полигон ⊇ полигон (выступает) → false", () => {
			expect(UB.contain(POLY, b(-10, -10, 110, 110))).toBe(false);
			expect(UB.contain(POLY, b(50, 50, 150, 150))).toBe(false);
		});
	});

	describe("EPS-толерантность и симметричные случаи", () => {
		const EPS = UC2.__eps;

		test("EPS: b чуть выступает в пределах EPS → true", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(-EPS / 2, 0, 100, 100);
			expect(UB.contain(a, bb)).toBe(true);
		});

		test("EPS: b выступает за пределами EPS → false", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(-EPS * 2, 0, 100, 100);
			expect(UB.contain(a, bb)).toBe(false);
		});

		test("кастомный EPS ужесточает порог", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(-0.0005, 0, 100, 100);
			expect(UB.contain(a, bb, 1e-4)).toBe(false);
			expect(UB.contain(a, bb, 1e-3)).toBe(true);
		});

		test("рефлексивность: contain(a, a) → true", () => {
			expect(UB.contain(POLY, POLY)).toBe(true);
			expect(UB.contain(LINE_X, LINE_X)).toBe(true);
			expect(UB.contain(POINT, POINT)).toBe(true);
		});

		test("антисимметрия: если contain(a,b) и contain(b,a) и a≠b → не бывает", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(0, 0, 100, 100);
			expect(UB.contain(a, bb) && UB.contain(bb, a)).toBe(true);
		});

		test("транзитивность: contain(a,b) ∧ contain(b,c) ⇒ contain(a,c)", () => {
			const a = b(0, 0, 100, 100);
			const mid = b(10, 10, 90, 90);
			const inner = b(20, 20, 80, 80);
			expect(UB.contain(a, mid)).toBe(true);
			expect(UB.contain(mid, inner)).toBe(true);
			expect(UB.contain(a, inner)).toBe(true);
		});
	});
});

describe("UB.owns: a ⊃ b строгое владение (без касания контура)", () => {
	const POLY = b(0, 0, 100, 100);
	const LINE_X = b(0, 50, 100, 50);
	const LINE_Y = b(50, 0, 50, 100);
	const POINT = b(50, 50, 50, 50);

	describe("точка ⊃ ... (всегда false)", () => {
		test("точка ⊃ точка (совпадают) → false (совпадение не строго)", () => {
			expect(UB.owns(POINT, POINT)).toBe(false);
		});

		test("точка ⊃ точка (разные) → false", () => {
			expect(UB.owns(POINT, b(60, 60, 60, 60))).toBe(false);
		});

		test("точка ⊃ линия → false", () => {
			expect(UB.owns(POINT, LINE_X)).toBe(false);
		});

		test("точка ⊃ полигон → false", () => {
			expect(UB.owns(POINT, POLY)).toBe(false);
		});
	});

	describe("линия ⊃ ... (всегда false)", () => {
		test("линияX ⊃ точка (строго между) → false (линия не имеет 2D-внутренности)", () => {
			expect(UB.owns(LINE_X, b(50, 50, 50, 50))).toBe(false);
		});

		test("линияX ⊃ линияX (строго внутри) → false", () => {
			expect(UB.owns(LINE_X, b(20, 50, 80, 50))).toBe(false);
		});

		test("линияY ⊃ точка (строго между) → false", () => {
			expect(UB.owns(LINE_Y, b(50, 50, 50, 50))).toBe(false);
		});

		test("линияX ⊃ полигон → false", () => {
			expect(UB.owns(LINE_X, b(20, 40, 80, 60))).toBe(false);
		});
	});

	describe("полигон ⊃ ...", () => {
		test("полигон ⊃ точка (строго внутри) → true", () => {
			expect(UB.owns(POLY, b(50, 50, 50, 50))).toBe(true);
		});

		test("полигон ⊃ точка (на границе) → false", () => {
			expect(UB.owns(POLY, b(0, 50, 0, 50))).toBe(false);
			expect(UB.owns(POLY, b(100, 50, 100, 50))).toBe(false);
			expect(UB.owns(POLY, b(50, 0, 50, 0))).toBe(false);
			expect(UB.owns(POLY, b(50, 100, 50, 100))).toBe(false);
		});

		test("полигон ⊃ точка (в углу) → false", () => {
			expect(UB.owns(POLY, b(0, 0, 0, 0))).toBe(false);
			expect(UB.owns(POLY, b(100, 100, 100, 100))).toBe(false);
		});

		test("полигон ⊃ точка (снаружи) → false", () => {
			expect(UB.owns(POLY, b(150, 50, 150, 50))).toBe(false);
		});

		test("полигон ⊃ линияX (строго внутри) → true", () => {
			expect(UB.owns(POLY, b(20, 50, 80, 50))).toBe(true);
		});

		test("полигон ⊃ линияX (касается границы по X) → false", () => {
			expect(UB.owns(POLY, b(0, 50, 80, 50))).toBe(false);
			expect(UB.owns(POLY, b(20, 50, 100, 50))).toBe(false);
		});

		test("полигон ⊃ линияX (касается границы по Y) → false", () => {
			expect(UB.owns(POLY, b(20, 0, 80, 0))).toBe(false);
			expect(UB.owns(POLY, b(20, 100, 80, 100))).toBe(false);
		});

		test("полигон ⊃ линияY (строго внутри) → true", () => {
			expect(UB.owns(POLY, b(50, 20, 50, 80))).toBe(true);
		});

		test("полигон ⊃ полигон (строго внутри) → true", () => {
			expect(UB.owns(POLY, b(20, 20, 80, 80))).toBe(true);
		});

		test("полигон ⊃ полигон (равные) → false", () => {
			expect(UB.owns(POLY, POLY)).toBe(false);
		});

		test("полигон ⊃ полигон (касается границы) → false", () => {
			expect(UB.owns(POLY, b(0, 0, 50, 50))).toBe(false);
			expect(UB.owns(POLY, b(0, 0, 100, 50))).toBe(false);
		});

		test("полигон ⊃ полигон (выступает) → false", () => {
			expect(UB.owns(POLY, b(-10, 0, 50, 50))).toBe(false);
		});
	});

	describe("EPS-толерантность и свойства", () => {
		const EPS = UC2.__eps;

		test("EPS: b чуть выступает за границу в пределах EPS → false (строгое)", () => {
			const a = b(0, 0, 100, 100);
			const inner = b(0 - EPS / 2, 20, 80, 80);
			expect(UB.owns(a, inner)).toBe(false);
		});

		test("кастомный EPS: жёсткий пропускает, мягкий режет", () => {
			const a = b(0, 0, 100, 100);
			const inner = b(0.0005, 20, 80, 80);
			expect(UB.owns(a, inner, 1e-4)).toBe(true);
			expect(UB.owns(a, inner, 1e-3)).toBe(false);
		});

		test("owns ⇒ contain (строгое ⇒ нестрогое)", () => {
			const a = b(0, 0, 100, 100);
			const inner = b(20, 20, 80, 80);
			expect(UB.owns(a, inner)).toBe(true);
			expect(UB.contain(a, inner)).toBe(true);
		});

		test("contain не ⇒ owns (допускает касание)", () => {
			const a = b(0, 0, 100, 100);
			const touching = b(0, 0, 50, 50);
			expect(UB.contain(a, touching)).toBe(true);
			expect(UB.owns(a, touching)).toBe(false);
		});

		test("антисимметрия: owns(a,b) ∧ owns(b,a) — невозможно", () => {
			const a = b(0, 0, 100, 100);
			const inner = b(20, 20, 80, 80);
			expect(UB.owns(a, inner)).toBe(true);
			expect(UB.owns(inner, a)).toBe(false);
		});
	});
});

describe("UB.collision: есть общая значащая точка (канон владения)", () => {
	const POLY = b(0, 0, 100, 100);
	const LINE_X = b(0, 50, 100, 50);
	const LINE_Y = b(50, 0, 50, 100);
	const POINT = b(50, 50, 50, 50);

	describe("точка ⋂ точка", () => {
		test("совпадают → true", () => {
			checkCollision(POINT, POINT, true);
			checkCollision(b(5, 5, 5, 5), b(5, 5, 5, 5), true);
		});

		test("разные → false", () => {
			checkCollision(POINT, b(60, 50, 60, 50), false);
			checkCollision(b(5, 5, 5, 5), b(6, 5, 6, 5), false);
		});
	});

	describe("точка ⋂ линия", () => {
		test("точка строго между концами линии → true", () => {
			checkCollision(POINT, LINE_X, true);
			checkCollision(b(50, 50, 50, 50), LINE_Y, true);
		});

		test("точка на конце линии → false", () => {
			checkCollision(b(0, 50, 0, 50), LINE_X, false);
			checkCollision(b(100, 50, 100, 50), LINE_X, false);
		});

		test("точка не на линии (мимо по перпендикулярной оси) → false", () => {
			checkCollision(b(50, 60, 50, 60), LINE_X, false);
			checkCollision(b(60, 50, 60, 50), LINE_Y, false);
		});

		test("точка за пределами по длине → false", () => {
			checkCollision(b(150, 50, 150, 50), LINE_X, false);
		});

		test("симметричность", () => {
			checkSymmetry(POINT, LINE_X);
		});
	});

	describe("точка ⋂ полигон", () => {
		test("строго внутри → true", () => {
			checkCollision(POINT, POLY, true);
		});

		test("на ребре → false", () => {
			checkCollision(b(0, 50, 0, 50), POLY, false);
			checkCollision(b(50, 0, 50, 0), POLY, false);
			checkCollision(b(100, 50, 100, 50), POLY, false);
		});

		test("в углу → false", () => {
			checkCollision(b(0, 0, 0, 0), POLY, false);
			checkCollision(b(100, 100, 100, 100), POLY, false);
		});

		test("снаружи → false", () => {
			checkCollision(b(150, 50, 150, 50), POLY, false);
		});

		test("симметричность", () => {
			checkSymmetry(POINT, POLY);
		});
	});

	describe("линия ⋂ линия", () => {
		test("линияX ⋂ линияX (перекрытие на той же прямой) → true", () => {
			checkCollision(LINE_X, b(50, 50, 150, 50), true);
		});

		test("линияX ⋂ линияX (касание концами) → false", () => {
			checkCollision(b(0, 50, 50, 50), b(50, 50, 100, 50), false);
		});

		test("линияX ⋂ линияX (разные прямые) → false", () => {
			checkCollision(b(0, 50, 100, 50), b(0, 60, 100, 60), false);
		});

		test("идентичные линии → true", () => {
			checkCollision(LINE_X, LINE_X, true);
		});

		test("линияX ⋂ линияY (крест) → true", () => {
			checkCollision(LINE_X, LINE_Y, true);
		});

		test("линияX ⋂ линияY (не пересекаются) → false", () => {
			checkCollision(b(0, 50, 100, 50), b(150, 0, 150, 100), false);
		});

		test("симметричность", () => {
			checkSymmetry(LINE_X, LINE_Y);
		});
	});

	describe("линия ⋂ полигон", () => {
		test("линия внутри полигона → true", () => {
			checkCollision(b(20, 50, 80, 50), POLY, true);
		});

		test("линия пересекает полигон насквозь → true", () => {
			checkCollision(b(-50, 50, 150, 50), POLY, true);
		});

		test("линия на границе полигона → false", () => {
			checkCollision(b(0, 0, 100, 0), POLY, false);
			checkCollision(b(0, 0, 0, 100), POLY, false);
		});

		test("линия снаружи → false", () => {
			checkCollision(b(200, 50, 300, 50), POLY, false);
		});

		test("симметричность", () => {
			checkSymmetry(LINE_X, POLY);
		});
	});

	describe("полигон ⋂ полигон", () => {
		test("строгое перекрытие → true", () => {
			checkCollision(POLY, b(50, 50, 150, 150), true);
		});

		test("идентичные → true", () => {
			checkCollision(POLY, POLY, true);
		});

		test("b строго внутри a → true", () => {
			checkCollision(POLY, b(20, 20, 80, 80), true);
		});

		test("b внутри a и касается границ → true", () => {
			checkCollision(POLY, b(0, 0, 50, 50), true);
			checkCollision(POLY, b(0, 0, 100, 50), true);
		});

		test("a внутри b → true", () => {
			checkCollision(POLY, b(-100, -100, 200, 200), true);
		});

		test("касание стороной → false", () => {
			checkCollision(POLY, b(100, 0, 200, 100), false);
			checkCollision(POLY, b(0, 100, 100, 200), false);
		});

		test("касание углом → false", () => {
			checkCollision(POLY, b(100, 100, 200, 200), false);
		});

		test("полное непересечение → false", () => {
			checkCollision(POLY, b(200, 0, 300, 100), false);
		});

		test("симметричность", () => {
			checkSymmetry(POLY, b(50, 50, 150, 150));
		});
	});

	describe("EPS-толерантность", () => {
		const EPS = UC2.__eps;

		test("EPS: точка в пределах EPS от ребра полигона → false (строгое)", () => {
			checkCollision(POLY, b(100 + EPS / 2, 50, 100 + EPS / 2, 50), false);
		});

		test("EPS: касание границами в пределах EPS → false", () => {
			checkCollision(POLY, b(100 - EPS / 2, 0, 200, 100), false);
		});

		test("кастомный EPS", () => {
			const near = b(100.0005, 50, 100.0005, 50);
			expect(UB.collision(POLY, near, 1e-4)).toBe(false);
			expect(UB.collision(POLY, near, 1e-3)).toBe(false);
		});
	});

	describe("связь с owns и contain", () => {
		test("owns(a,b) ⇒ collision(a,b)", () => {
			const a = b(0, 0, 100, 100);
			const inner = b(20, 20, 80, 80);
			expect(UB.owns(a, inner)).toBe(true);
			checkCollision(a, inner, true);
		});

		test("contain(a,b) не ⇒ collision (касание границ без перекрытия)", () => {
			const a = b(0, 0, 100, 100);
			const touching = b(100, 0, 200, 100);
			expect(UB.contain(a, touching)).toBe(false);
			checkCollision(a, touching, false);
		});

		test("identical: collision=true, contain=true, owns=false", () => {
			const a = b(0, 0, 100, 100);
			checkCollision(a, a, true);
			expect(UB.contain(a, a)).toBe(true);
			expect(UB.owns(a, a)).toBe(false);
		});
	});
});

describe("UB.mtv: вектор переноса для устранения коллизии", () => {
	test("перекрытие → вектор по минимальной оси, move(a, mtv) устраняет коллизию", () => {
		const a: CT.Bounds = { minX: -1, minY: 1, maxX: 7, maxY: 8 };
		const bb: CT.Bounds = { minX: 3, minY: -5, maxX: 12, maxY: 2 };
		expect(UB.collision(a, bb)).toBe(true);
		const mtv = UB.mtv(a, bb);
		// escape_left=4, escape_down=1 → min выбирает Y (1 < 4), a ниже b → +y
		expect(mtv).toEqual({ x: 0, y: 1 });
		const moveA = UB.move(a, mtv!);
		expect(UB.collision(moveA, bb)).toBe(false);
		expect(UB.exterior(moveA, bb)).toBe(true);
		expect(UB.interior(moveA, bb)).toBe(false);
	});

	test("без пересечения → null", () => {
		const a = b(-10, -20, 30, 40);
		const bb = b(100, 100, 200, 200);
		expect(UB.collision(a, bb)).toBe(false);
		expect(UB.mtv(a, bb)).toBeNull();
	});

	test("min: move(a, mtv) устраняет коллизию (перекрытие по двум осям)", () => {
		const a = b(0, 0, 100, 100);
		const bb = b(50, 50, 150, 150);
		expect(UB.collision(a, bb)).toBe(true);
		const mtv = UB.mtv(a, bb);
		expect(mtv).not.toBeNull();
		// min выбирает одну ось (escape_right=50, escape_up=50 — равны → X по tie)
		expect(mtv!.x === 0 || mtv!.y === 0).toBe(true);
		const moveA = UB.move(a, mtv!);
		expect(UB.collision(moveA, bb)).toBe(false);
		expect(!!UB.mtv(moveA, bb)).toBe(false);
	});

	test("a внутри b → mtv выталкивает a наружу", () => {
		const a = b(40, 40, 60, 60);
		const bb = b(0, 0, 100, 100);
		expect(UB.collision(a, bb)).toBe(true);
		const mtv = UB.mtv(a, bb);
		expect(mtv).not.toBeNull();
		const moveA = UB.move(a, mtv!);
		expect(UB.collision(moveA, bb)).toBe(false);
		expect(!!UB.mtv(moveA, bb)).toBe(false);
	});

	test("b внутри a → mtv выталкивает a (центр a ≈ центр b)", () => {
		const a = b(0, 0, 100, 100);
		const bb = b(40, 40, 60, 60);
		expect(UB.collision(a, bb)).toBe(true);
		const mtv = UB.mtv(a, bb);
		expect(mtv).not.toBeNull();
		const moveA = UB.move(a, mtv!);
		expect(UB.collision(moveA, bb)).toBe(false);
		expect(!!UB.mtv(moveA, bb)).toBe(false);
	});

	test("идентичные bounds → mtv ≠ null, move устраняет коллизию", () => {
		const a = b(0, 0, 100, 100);
		expect(UB.collision(a, a)).toBe(true);
		const mtv = UB.mtv(a, a);
		expect(mtv).not.toBeNull();
		const moveA = UB.move(a, mtv!);
		expect(UB.collision(moveA, a)).toBe(false);
		expect(!!UB.mtv(moveA, a)).toBe(false);
	});

	test("перекрытие только по X (линии по Y) → mtv по X, mtv.y = 0", () => {
		const a = b(0, 5, 100, 5);
		const bb = b(50, 5, 150, 5);
		expect(UB.collision(a, bb)).toBe(true);
		const mtv = UB.mtv(a, bb);
		expect(mtv).not.toBeNull();
		expect(mtv!.y).toBe(0);
		expect(mtv!.x).not.toBe(0);
		const moveA = UB.move(a, mtv!);
		expect(UB.collision(moveA, bb)).toBe(false);
		expect(!!UB.mtv(moveA, bb)).toBe(false);
	});

	test("направление: a правее b → x > 0 (a выталкивается вправо)", () => {
		const a = b(60, 0, 100, 100);
		const bb = b(0, 0, 70, 100);
		expect(UB.collision(a, bb)).toBe(true);
		const mtv = UB.mtv(a, bb);
		expect(mtv).not.toBeNull();
		expect(mtv!.x).toBeGreaterThan(0);
	});

	test("направление: a левее b → x < 0 (a выталкивается влево)", () => {
		const a = b(0, 0, 40, 100);
		const bb = b(30, 0, 70, 100);
		expect(UB.collision(a, bb)).toBe(true);
		const mtv = UB.mtv(a, bb);
		expect(mtv).not.toBeNull();
		expect(mtv!.x).toBeLessThan(0);
	});
});

describe("UB.mtv: direction — направленный выталкивающий вектор", () => {
	const a = b(0, 0, 100, 100);
	const bb = b(50, 50, 150, 150);

	test("без коллизии → null для любого direction", () => {
		const far = b(1000, 1000, 1100, 1100);
		expect(UB.mtv(far, a, "right")).toBeNull();
		expect(UB.mtv(far, a, "left")).toBeNull();
		expect(UB.mtv(far, a, "top")).toBeNull();
		expect(UB.mtv(far, a, "bottom")).toBeNull();
		expect(UB.mtv(far, a, "min")).toBeNull();
	});

	test("right → только +x, move(a) устраняет коллизию", () => {
		const mtv = UB.mtv(a, bb, "right");
		expect(mtv).not.toBeNull();
		expect(mtv!.x).toBeGreaterThan(0);
		expect(mtv!.y).toBe(0);
		expect(UB.collision(UB.move(a, mtv!), bb)).toBe(false);
	});

	test("left → только -x, move(a) устраняет коллизию", () => {
		const mtv = UB.mtv(a, bb, "left");
		expect(mtv).not.toBeNull();
		expect(mtv!.x).toBeLessThan(0);
		expect(mtv!.y).toBe(0);
		expect(UB.collision(UB.move(a, mtv!), bb)).toBe(false);
	});

	test("bottom → только +y (Y-вниз), move(a) устраняет коллизию", () => {
		const mtv = UB.mtv(a, bb, "bottom");
		expect(mtv).not.toBeNull();
		expect(mtv!.y).toBeGreaterThan(0);
		expect(mtv!.x).toBe(0);
		expect(UB.collision(UB.move(a, mtv!), bb)).toBe(false);
	});

	test("top → только -y (Y-вниз), move(a) устраняет коллизию", () => {
		const mtv = UB.mtv(a, bb, "top");
		expect(mtv).not.toBeNull();
		expect(mtv!.y).toBeLessThan(0);
		expect(mtv!.x).toBe(0);
		expect(UB.collision(UB.move(a, mtv!), bb)).toBe(false);
	});

	test("min выбирает ось с минимальным escape, возвращает односный вектор", () => {
		const mtv = UB.mtv(a, bb, "min");
		expect(mtv).not.toBeNull();
		expect(mtv!.x === 0 || mtv!.y === 0).toBe(true);
		expect(UC2.eq(mtv!, UC2.zero()) === false).toBe(true);
		expect(UB.collision(UB.move(a, mtv!), bb)).toBe(false);
	});
});

describe("UB.hasX: принадлежность по оси X (канон владения)", () => {
	test("точка (вырождена по X) → eq", () => {
		const pt = b(5, 5, 5, 10);
		expect(UB.hasX(pt, 5)).toBe(true);
		expect(UB.hasX(pt, 6)).toBe(false);
	});

	test("линия по X / полигон → строго внутри", () => {
		const poly = b(0, 0, 10, 10);
		expect(UB.hasX(poly, 5)).toBe(true);
		expect(UB.hasX(poly, 0)).toBe(false);
		expect(UB.hasX(poly, 10)).toBe(false);
		expect(UB.hasX(poly, -1)).toBe(false);
		expect(UB.hasX(poly, 11)).toBe(false);
	});

	test("EPS-толерантность для точки", () => {
		const pt = b(5, 5, 5, 10);
		expect(UB.hasX(pt, 5.0005)).toBe(true);
		expect(UB.hasX(pt, 5.002)).toBe(false);
	});

	test("EPS-толерантность для полигона (строгое lt/gt)", () => {
		const poly = b(0, 0, 10, 10);
		expect(UB.hasX(poly, 0.0005)).toBe(false);
		expect(UB.hasX(poly, 9.9995)).toBe(false);
		expect(UB.hasX(poly, 0.002)).toBe(true);
	});

	test("кастомный EPS", () => {
		const pt = b(5, 5, 5, 10);
		expect(UB.hasX(pt, 5.0005, 1e-4)).toBe(false);
		expect(UB.hasX(pt, 5.0005, 1e-3)).toBe(true);
	});
});

describe("UB.hasY: принадлежность по оси Y (канон владения)", () => {
	test("точка (вырождена по Y) → eq", () => {
		const pt = b(5, 5, 10, 5);
		expect(UB.hasY(pt, 5)).toBe(true);
		expect(UB.hasY(pt, 6)).toBe(false);
	});

	test("линия по Y / полигон → строго внутри", () => {
		const poly = b(0, 0, 10, 10);
		expect(UB.hasY(poly, 5)).toBe(true);
		expect(UB.hasY(poly, 0)).toBe(false);
		expect(UB.hasY(poly, 10)).toBe(false);
		expect(UB.hasY(poly, -1)).toBe(false);
		expect(UB.hasY(poly, 11)).toBe(false);
	});

	test("EPS-толерантность для точки", () => {
		const pt = b(5, 5, 10, 5);
		expect(UB.hasY(pt, 5.0005)).toBe(true);
		expect(UB.hasY(pt, 5.002)).toBe(false);
	});

	test("EPS-толерантность для полигона (строгое lt/gt)", () => {
		const poly = b(0, 0, 10, 10);
		expect(UB.hasY(poly, 0.0005)).toBe(false);
		expect(UB.hasY(poly, 9.9995)).toBe(false);
		expect(UB.hasY(poly, 0.002)).toBe(true);
	});
});

describe("UB.has: принадлежность точки Bounds (канон владения)", () => {
	describe("точка обладает собой", () => {
		const pt = b(5, 5, 5, 5);

		test("совпадающая точка → true", () => {
			expect(UB.has(pt, { x: 5, y: 5 })).toBe(true);
		});

		test("другая точка → false", () => {
			expect(UB.has(pt, { x: 6, y: 5 })).toBe(false);
			expect(UB.has(pt, { x: 5, y: 6 })).toBe(false);
			expect(UB.has(pt, { x: 6, y: 6 })).toBe(false);
		});

		test("EPS-толерантность: точка в пределах EPS → true", () => {
			expect(UB.has(pt, { x: 5.0005, y: 5.0005 })).toBe(true);
			expect(UB.has(pt, { x: 4.9995, y: 5.0005 })).toBe(true);
		});

		test("EPS-толерантность: точка за пределами EPS → false", () => {
			expect(UB.has(pt, { x: 5.002, y: 5 })).toBe(false);
			expect(UB.has(pt, { x: 5, y: 5.002 })).toBe(false);
		});
	});

	describe("линия обладает точками строго между концами", () => {
		const lineX = b(0, 5, 10, 5);
		const lineY = b(5, 0, 5, 10);

		test("точка строго между концами (линия X) → true", () => {
			expect(UB.has(lineX, { x: 5, y: 5 })).toBe(true);
			expect(UB.has(lineX, { x: 2, y: 5 })).toBe(true);
			expect(UB.has(lineX, { x: 8, y: 5 })).toBe(true);
		});

		test("концы линии X → false (строго между)", () => {
			expect(UB.has(lineX, { x: 0, y: 5 })).toBe(false);
			expect(UB.has(lineX, { x: 10, y: 5 })).toBe(false);
		});

		test("точка не на линии X (мимо по Y) → false", () => {
			expect(UB.has(lineX, { x: 5, y: 6 })).toBe(false);
			expect(UB.has(lineX, { x: 5, y: 4 })).toBe(false);
		});

		test("точка за пределами линии X по длине → false", () => {
			expect(UB.has(lineX, { x: -1, y: 5 })).toBe(false);
			expect(UB.has(lineX, { x: 11, y: 5 })).toBe(false);
		});

		test("точка строго между концами (линия Y) → true", () => {
			expect(UB.has(lineY, { x: 5, y: 5 })).toBe(true);
			expect(UB.has(lineY, { x: 5, y: 2 })).toBe(true);
		});

		test("концы линии Y → false", () => {
			expect(UB.has(lineY, { x: 5, y: 0 })).toBe(false);
			expect(UB.has(lineY, { x: 5, y: 10 })).toBe(false);
		});

		test("точка не на линии Y (мимо по X) → false", () => {
			expect(UB.has(lineY, { x: 6, y: 5 })).toBe(false);
			expect(UB.has(lineY, { x: 4, y: 5 })).toBe(false);
		});
	});

	describe("полигон обладает точками строго внутри контура", () => {
		const poly = b(0, 0, 10, 10);

		test("точка строго внутри → true", () => {
			expect(UB.has(poly, { x: 5, y: 5 })).toBe(true);
			expect(UB.has(poly, { x: 1, y: 1 })).toBe(true);
			expect(UB.has(poly, { x: 9, y: 9 })).toBe(true);
		});

		test("точка на ребре → false", () => {
			expect(UB.has(poly, { x: 5, y: 0 })).toBe(false);
			expect(UB.has(poly, { x: 5, y: 10 })).toBe(false);
			expect(UB.has(poly, { x: 0, y: 5 })).toBe(false);
			expect(UB.has(poly, { x: 10, y: 5 })).toBe(false);
		});

		test("точка в углу → false", () => {
			expect(UB.has(poly, { x: 0, y: 0 })).toBe(false);
			expect(UB.has(poly, { x: 10, y: 0 })).toBe(false);
			expect(UB.has(poly, { x: 10, y: 10 })).toBe(false);
			expect(UB.has(poly, { x: 0, y: 10 })).toBe(false);
		});

		test("точка снаружи → false", () => {
			expect(UB.has(poly, { x: 15, y: 5 })).toBe(false);
			expect(UB.has(poly, { x: -1, y: 5 })).toBe(false);
			expect(UB.has(poly, { x: 5, y: 15 })).toBe(false);
			expect(UB.has(poly, { x: 5, y: -1 })).toBe(false);
		});

		test("EPS-толерантность: граница в пределах EPS → false (строгое)", () => {
			expect(UB.has(poly, { x: 0.0005, y: 5 })).toBe(false);
			expect(UB.has(poly, { x: 9.9995, y: 5 })).toBe(false);
		});

		test("EPS-толерантность: чуть глубже EPS от границы → true", () => {
			expect(UB.has(poly, { x: 0.002, y: 5 })).toBe(true);
			expect(UB.has(poly, { x: 9.998, y: 5 })).toBe(true);
		});
	});

	describe("вырожденные границы: точка и линия вместе", () => {
		test("линия X и точка на вырожденной оси → true только при совпадении Y", () => {
			const lineX = b(0, 5, 10, 5);
			expect(UB.has(lineX, { x: 5, y: 5 })).toBe(true);
			expect(UB.has(lineX, { x: 5, y: 5.002 })).toBe(false);
		});

		test("кастомный EPS для точки", () => {
			const pt = b(5, 5, 5, 5);
			expect(UB.has(pt, { x: 5.0005, y: 5 }, 1e-4)).toBe(false);
			expect(UB.has(pt, { x: 5.0005, y: 5 }, 1e-3)).toBe(true);
		});
	});

	describe("has = hasX ∧ hasY", () => {
		test("для набора Bounds/точек согласовано с hasX ∧ hasY", () => {
			const cases: Array<[CT.Bounds, CT.C2]> = [
				[b(5, 5, 5, 5), { x: 5, y: 5 }],
				[b(5, 5, 5, 5), { x: 6, y: 5 }],
				[b(0, 5, 10, 5), { x: 5, y: 5 }],
				[b(0, 5, 10, 5), { x: 0, y: 5 }],
				[b(5, 0, 5, 10), { x: 5, y: 5 }],
				[b(0, 0, 10, 10), { x: 5, y: 5 }],
				[b(0, 0, 10, 10), { x: 0, y: 0 }],
				[b(0, 0, 10, 10), { x: 15, y: 5 }],
			];
			for (const [bounds, point] of cases) {
				const expected = UB.hasX(bounds, point.x) && UB.hasY(bounds, point.y);
				expect(UB.has(bounds, point)).toBe(expected);
			}
		});
	});
});

describe("UB.at: нестрогая принадлежность точки Bounds (канон контура)", () => {
	describe("точка", () => {
		const pt = b(5, 5, 5, 5);

		test("совпадающая точка → true", () => {
			expect(UB.at(pt, { x: 5, y: 5 })).toBe(true);
		});

		test("другая точка → false", () => {
			expect(UB.at(pt, { x: 6, y: 5 })).toBe(false);
			expect(UB.at(pt, { x: 5, y: 6 })).toBe(false);
		});

		test("EPS-толерантность", () => {
			expect(UB.at(pt, { x: 5.0005, y: 5.0005 })).toBe(true);
			expect(UB.at(pt, { x: 5.002, y: 5 })).toBe(false);
		});
	});

	describe("линия", () => {
		const lineX = b(0, 5, 10, 5);
		const lineY = b(5, 0, 5, 10);

		test("точка строго между концами → true", () => {
			expect(UB.at(lineX, { x: 5, y: 5 })).toBe(true);
			expect(UB.at(lineY, { x: 5, y: 5 })).toBe(true);
		});

		test("концы линии → true (нестрого, контур включён)", () => {
			expect(UB.at(lineX, { x: 0, y: 5 })).toBe(true);
			expect(UB.at(lineX, { x: 10, y: 5 })).toBe(true);
			expect(UB.at(lineY, { x: 5, y: 0 })).toBe(true);
			expect(UB.at(lineY, { x: 5, y: 10 })).toBe(true);
		});

		test("точка мимо линии → false", () => {
			expect(UB.at(lineX, { x: 5, y: 6 })).toBe(false);
			expect(UB.at(lineY, { x: 6, y: 5 })).toBe(false);
		});

		test("точка за пределами по длине → false", () => {
			expect(UB.at(lineX, { x: -1, y: 5 })).toBe(false);
			expect(UB.at(lineX, { x: 11, y: 5 })).toBe(false);
		});
	});

	describe("полигон", () => {
		const poly = b(0, 0, 10, 10);

		test("строго внутри → true", () => {
			expect(UB.at(poly, { x: 5, y: 5 })).toBe(true);
			expect(UB.at(poly, { x: 1, y: 1 })).toBe(true);
		});

		test("на ребре → true (контур включён)", () => {
			expect(UB.at(poly, { x: 5, y: 0 })).toBe(true);
			expect(UB.at(poly, { x: 5, y: 10 })).toBe(true);
			expect(UB.at(poly, { x: 0, y: 5 })).toBe(true);
			expect(UB.at(poly, { x: 10, y: 5 })).toBe(true);
		});

		test("в углу → true (контур включён)", () => {
			expect(UB.at(poly, { x: 0, y: 0 })).toBe(true);
			expect(UB.at(poly, { x: 10, y: 0 })).toBe(true);
			expect(UB.at(poly, { x: 10, y: 10 })).toBe(true);
			expect(UB.at(poly, { x: 0, y: 10 })).toBe(true);
		});

		test("снаружи → false", () => {
			expect(UB.at(poly, { x: -1, y: 5 })).toBe(false);
			expect(UB.at(poly, { x: 11, y: 5 })).toBe(false);
			expect(UB.at(poly, { x: 5, y: -1 })).toBe(false);
			expect(UB.at(poly, { x: 5, y: 11 })).toBe(false);
		});

		test("EPS: точка в пределах EPS от границы → true", () => {
			expect(UB.at(poly, { x: -0.0005, y: 5 })).toBe(true);
			expect(UB.at(poly, { x: 10.0005, y: 5 })).toBe(true);
		});
	});

	describe("at ⊇ has (нестрогое включает строгое)", () => {
		test("has ⇒ at для всех комбинаций", () => {
			const cases: Array<[CT.Bounds, CT.C2]> = [
				[b(5, 5, 5, 5), { x: 5, y: 5 }],
				[b(0, 5, 10, 5), { x: 5, y: 5 }],
				[b(0, 0, 10, 10), { x: 5, y: 5 }],
				[b(0, 0, 10, 10), { x: 0, y: 0 }],
				[b(0, 0, 10, 10), { x: 5, y: 0 }],
			];
			for (const [bounds, point] of cases) {
				if (UB.has(bounds, point)) {
					expect(UB.at(bounds, point)).toBe(true);
				}
			}
		});

		test("at true, has false на границе", () => {
			const poly = b(0, 0, 10, 10);
			expect(UB.at(poly, { x: 0, y: 0 })).toBe(true);
			expect(UB.has(poly, { x: 0, y: 0 })).toBe(false);
			expect(UB.at(poly, { x: 5, y: 10 })).toBe(true);
			expect(UB.has(poly, { x: 5, y: 10 })).toBe(false);
		});
	});
});

const ln = (ax: number, ay: number, bx: number, by: number, mode?: "ray" | "infinity"): CT.Line => ({
	type: "line",
	points: [
		{ x: ax, y: ay },
		{ x: bx, y: by },
	],
	mode,
});

describe("UB.overlap: пересечение значимых точек", () => {
	const POLY = b(0, 0, 100, 100);
	const LINE_X = b(0, 50, 100, 50);
	const LINE_Y = b(50, 0, 50, 100);
	const POINT = b(50, 50, 50, 50);

	describe("полигон ⋂ полигон", () => {
		test("строгое перекрытие → Bounds пересечения", () => {
			expect(UB.overlap(POLY, b(50, 0, 150, 100))).toEqual({ minX: 50, minY: 0, maxX: 100, maxY: 100 });
		});

		test("b внутри a → b (копия)", () => {
			expect(UB.overlap(POLY, b(20, 20, 80, 80))).toEqual({ minX: 20, minY: 20, maxX: 80, maxY: 80 });
		});

		test("идентичные → a", () => {
			expect(UB.overlap(POLY, POLY)).toEqual(POLY);
		});

		test("касание стороной → null (нет значимых точек)", () => {
			expect(UB.overlap(POLY, b(100, 0, 200, 100))).toBeNull();
		});

		test("касание углом → null", () => {
			expect(UB.overlap(POLY, b(100, 100, 200, 200))).toBeNull();
		});

		test("полное непересечение → null", () => {
			expect(UB.overlap(POLY, b(200, 0, 300, 100))).toBeNull();
		});

		test("a внутри b → a", () => {
			expect(UB.overlap(POLY, b(-100, -100, 200, 200))).toEqual(POLY);
		});
	});

	describe("точка ⋂ ...", () => {
		test("точка строго внутри полигона → точка", () => {
			expect(UB.overlap(POLY, POINT)).toEqual(POINT);
		});

		test("точка на границе полигона → null", () => {
			expect(UB.overlap(POLY, b(0, 50, 0, 50))).toBeNull();
			expect(UB.overlap(POLY, b(100, 50, 100, 50))).toBeNull();
		});

		test("точка-точка совпадают → точка", () => {
			expect(UB.overlap(POINT, POINT)).toEqual(POINT);
		});

		test("точка-точка разные → null", () => {
			expect(UB.overlap(POINT, b(60, 60, 60, 60))).toBeNull();
		});

		test("точка на линии (строго между) → точка", () => {
			expect(UB.overlap(LINE_X, POINT)).toEqual(POINT);
		});

		test("точка на конце линии → null (конец не значим)", () => {
			expect(UB.overlap(LINE_X, b(0, 50, 0, 50))).toBeNull();
			expect(UB.overlap(LINE_X, b(100, 50, 100, 50))).toBeNull();
		});

		test("точка не на линии → null", () => {
			expect(UB.overlap(LINE_X, b(50, 60, 50, 60))).toBeNull();
		});
	});

	describe("линия ⋂ ...", () => {
		test("линияX ⋂ линияX перекрытие → линия", () => {
			expect(UB.overlap(LINE_X, b(30, 50, 70, 50))).toEqual({ minX: 30, minY: 50, maxX: 70, maxY: 50 });
		});

		test("линияX ⋂ линияY крест → точка", () => {
			expect(UB.overlap(LINE_X, LINE_Y)).toEqual({ minX: 50, minY: 50, maxX: 50, maxY: 50 });
		});

		test("линияX ⋂ линияX касание концами → null", () => {
			expect(UB.overlap(b(0, 50, 50, 50), b(50, 50, 100, 50))).toBeNull();
		});

		test("линияX ⋂ линияX разные прямые → null", () => {
			expect(UB.overlap(LINE_X, b(0, 60, 100, 60))).toBeNull();
		});

		test("линия внутри полигона → линия", () => {
			expect(UB.overlap(POLY, b(20, 50, 80, 50))).toEqual({ minX: 20, minY: 50, maxX: 80, maxY: 50 });
		});

		test("линия на границе полигона → null (граница не значима)", () => {
			expect(UB.overlap(POLY, b(0, 0, 100, 0))).toBeNull();
		});
	});

	describe("симметричность", () => {
		test("overlap(a,b) ≡ overlap(b,a) по факту null/не-null", () => {
			const pairs: Array<[CT.Bounds, CT.Bounds]> = [
				[POLY, b(50, 0, 150, 100)],
				[POLY, b(100, 0, 200, 100)],
				[LINE_X, LINE_Y],
				[POINT, POLY],
				[LINE_X, b(0, 60, 100, 60)],
			];
			for (const [a, bb] of pairs) {
				const r1 = UB.overlap(a, bb);
				const r2 = UB.overlap(bb, a);
				expect(r1 === null).toBe(r2 === null);
			}
		});
	});
});

describe("UB.intersect: пересечение линии с контуром Bounds", () => {
	const POLY = b(0, 0, 100, 100);
	const LINE_X = b(0, 50, 100, 50);
	const LINE_Y = b(50, 0, 50, 100);
	const POINT = b(50, 50, 50, 50);

	describe("полигон: контур = рёбра + углы", () => {
		test("линия пересекает два ребра насквозь → true", () => {
			expect(UB.intersect(POLY, ln(-10, 50, 110, 50))).toBe(true);
		});

		test("линия пересекает ребро по диагонали → true", () => {
			expect(UB.intersect(POLY, ln(-10, -10, 110, 110))).toBe(true);
		});

		test("линия проходит через угол → true (контур включает углы)", () => {
			expect(UB.intersect(POLY, ln(-10, -10, 0, 0))).toBe(true);
			expect(UB.intersect(POLY, ln(100, 100, 110, 110))).toBe(true);
		});

		test("линия касается угла, но не пересекает рёбер → true", () => {
			expect(UB.intersect(POLY, ln(-5, -5, 0, 0))).toBe(true);
		});

		test("линия лежит на ребре (коллинеарное перекрытие) → true", () => {
			expect(UB.intersect(POLY, ln(20, 0, 80, 0))).toBe(true);
		});

		test("линия снаружи, не касается → false", () => {
			expect(UB.intersect(POLY, ln(200, 0, 300, 0))).toBe(false);
			expect(UB.intersect(POLY, ln(-50, -50, -10, -10))).toBe(false);
		});

		test("линия вдоль ребра, но не перекрывается → false", () => {
			expect(UB.intersect(POLY, ln(120, 0, 180, 0))).toBe(false);
		});

		test("идентичная линии по ребру → true (полное перекрытие)", () => {
			expect(UB.intersect(POLY, ln(0, 0, 100, 0))).toBe(true);
		});
	});

	describe("линия: контур = вся линия включая концы", () => {
		test("крест с другой линией → true", () => {
			expect(UB.intersect(LINE_X, ln(50, 0, 50, 100))).toBe(true);
		});

		test("коллинеарное перекрытие (на той же прямой) → true", () => {
			expect(UB.intersect(LINE_X, ln(20, 50, 80, 50))).toBe(true);
		});

		test("частичное перекрытие с выходом → true", () => {
			expect(UB.intersect(LINE_X, ln(50, 50, 150, 50))).toBe(true);
		});

		test("идентичные линии → true", () => {
			expect(UB.intersect(LINE_X, ln(0, 50, 100, 50))).toBe(true);
		});

		test("касание концом → true (контур включает концы)", () => {
			expect(UB.intersect(LINE_X, ln(100, 50, 150, 50))).toBe(true);
			expect(UB.intersect(LINE_X, ln(-50, 50, 0, 50))).toBe(true);
		});

		test("коллинеарны, но не перекрываются → false", () => {
			expect(UB.intersect(LINE_X, ln(150, 50, 200, 50))).toBe(false);
		});

		test("параллельны на разных прямых → false", () => {
			expect(UB.intersect(LINE_X, ln(0, 60, 100, 60))).toBe(false);
		});

		test("вертикальная линия: крест → true", () => {
			expect(UB.intersect(LINE_Y, ln(0, 50, 100, 50))).toBe(true);
		});
	});

	describe("точка: контур = сама точка", () => {
		test("линия проходит через точку → true", () => {
			expect(UB.intersect(POINT, ln(0, 0, 100, 100))).toBe(true);
			expect(UB.intersect(POINT, ln(0, 50, 100, 50))).toBe(true);
		});

		test("линия не проходит через точку → false", () => {
			expect(UB.intersect(POINT, ln(0, 0, 100, 0))).toBe(false);
			expect(UB.intersect(POINT, ln(0, 60, 100, 60))).toBe(false);
		});

		test("line-точка совпадает с точкой-b → true", () => {
			expect(UB.intersect(POINT, ln(50, 50, 50, 50))).toBe(true);
		});

		test("line-точка другая → false", () => {
			expect(UB.intersect(POINT, ln(60, 60, 60, 60))).toBe(false);
		});

		test("line касается точки концом → true", () => {
			expect(UB.intersect(POINT, ln(0, 0, 50, 50))).toBe(true);
		});
	});

	describe("mode линии (ray, infinity)", () => {
		test("infinity по ребру полигона → true", () => {
			expect(UB.intersect(POLY, ln(-100, 0, 200, 0, "infinity"))).toBe(true);
		});

		test("infinity мимо полигона → false", () => {
			expect(UB.intersect(POLY, ln(-100, 200, 200, 200, "infinity"))).toBe(false);
		});

		test("ray касается угла полигона (начало луча в углу) → true", () => {
			expect(UB.intersect(POLY, ln(0, 0, 50, 50, "ray"))).toBe(true);
		});

		test("ray начало в углу полигона, направление наружу → true (ray включает начало)", () => {
			expect(UB.intersect(POLY, ln(0, 0, -50, -50, "ray"))).toBe(true);
		});

		test("ray направление от полигона, нет общих точек → false", () => {
			expect(UB.intersect(POLY, ln(-10, -10, -50, -50, "ray"))).toBe(false);
		});

		test("ray коллинеарен ребру, перекрывается → true", () => {
			expect(UB.intersect(POLY, ln(20, 0, 50, 0, "ray"))).toBe(true);
		});

		test("infinity коллинеарна ребру → true", () => {
			expect(UB.intersect(POLY, ln(-50, 0, 50, 0, "infinity"))).toBe(true);
		});
	});

	describe("вырожденная line (точка)", () => {
		test("line-точка на ребре полигона → true", () => {
			expect(UB.intersect(POLY, ln(50, 0, 50, 0))).toBe(true);
		});

		test("line-точка в углу полигона → true", () => {
			expect(UB.intersect(POLY, ln(0, 0, 0, 0))).toBe(true);
		});

		test("line-точка строго внутри полигона (не на контуре) → false", () => {
			expect(UB.intersect(POLY, ln(50, 50, 50, 50))).toBe(false);
		});

		test("line-точка снаружи → false", () => {
			expect(UB.intersect(POLY, ln(200, 200, 200, 200))).toBe(false);
		});

		test("line-точка на линии-b → true", () => {
			expect(UB.intersect(LINE_X, ln(50, 50, 50, 50))).toBe(true);
		});

		test("line-точка на конце линии-b → true (контур включает концы)", () => {
			expect(UB.intersect(LINE_X, ln(0, 50, 0, 50))).toBe(true);
		});

		test("line-точка совпадает с точкой-b → true", () => {
			expect(UB.intersect(POINT, ln(50, 50, 50, 50))).toBe(true);
		});
	});
});

describe("UB.depth: глубина Depth от центра до контура", () => {
	test("полигон: центр → [0, 0]", () => {
		expect(UB.depth(b(0, 0, 100, 200), { x: 50, y: 100 })).toEqual([0, 0]);
	});

	test("полигон: углы → [±1, ±1]", () => {
		expect(UB.depth(b(0, 0, 100, 200), { x: 0, y: 0 })).toEqual([-1, -1]);
		expect(UB.depth(b(0, 0, 100, 200), { x: 100, y: 200 })).toEqual([1, 1]);
	});

	test("полигон: середина ребра → [0, -1] / [-1, 0]", () => {
		expect(UB.depth(b(0, 0, 100, 200), { x: 50, y: 0 })).toEqual([0, -1]);
		expect(UB.depth(b(0, 0, 100, 200), { x: 0, y: 100 })).toEqual([-1, 0]);
	});

	test("полигон: снаружи → [|x|>1, |y|>1]", () => {
		expect(UB.depth(b(0, 0, 100, 200), { x: 150, y: 300 })).toEqual([2, 2]);
	});

	test("полигон: смещённый Bounds", () => {
		const bounds = b(10, 20, 110, 220);
		expect(UB.depth(bounds, { x: 60, y: 120 })).toEqual([0, 0]);
		expect(UB.depth(bounds, { x: 10, y: 20 })).toEqual([-1, -1]);
	});

	test("точка-Bounds: p в точке → [0, 0]", () => {
		expect(UB.depth(b(5, 5, 5, 5), { x: 5, y: 5 })).toEqual([0, 0]);
	});

	test("точка-Bounds: p не в точке → [Infinity, Infinity]", () => {
		expect(UB.depth(b(5, 5, 5, 5), { x: 6, y: 5 })).toEqual([Infinity, 0]);
		expect(UB.depth(b(5, 5, 5, 5), { x: 5, y: 6 })).toEqual([0, Infinity]);
		expect(UB.depth(b(5, 5, 5, 5), { x: 6, y: 6 })).toEqual([Infinity, Infinity]);
	});

	test("линия-Bounds по X (minY=maxY): p на линии → [t, 0]", () => {
		const lineX = b(0, 5, 10, 5);
		expect(UB.depth(lineX, { x: 5, y: 5 })).toEqual([0, 0]);
		expect(UB.depth(lineX, { x: 0, y: 5 })).toEqual([-1, 0]);
		expect(UB.depth(lineX, { x: 10, y: 5 })).toEqual([1, 0]);
	});

	test("линия-Bounds по X (minY=maxY): p вне по Y → [t, Infinity]", () => {
		const lineX = b(0, 5, 10, 5);
		expect(UB.depth(lineX, { x: 5, y: 6 })).toEqual([0, Infinity]);
		expect(UB.depth(lineX, { x: 5, y: 4 })).toEqual([0, Infinity]);
	});

	test("линия-Bounds по Y (minX=maxX): p на линии → [0, t]", () => {
		const lineY = b(5, 0, 5, 10);
		expect(UB.depth(lineY, { x: 5, y: 5 })).toEqual([0, 0]);
		expect(UB.depth(lineY, { x: 5, y: 0 })).toEqual([0, -1]);
		expect(UB.depth(lineY, { x: 5, y: 10 })).toEqual([0, 1]);
	});

	test("линия-Bounds по Y (minX=maxX): p вне по X → [Infinity, t]", () => {
		const lineY = b(5, 0, 5, 10);
		expect(UB.depth(lineY, { x: 6, y: 5 })).toEqual([Infinity, 0]);
		expect(UB.depth(lineY, { x: 4, y: 5 })).toEqual([Infinity, 0]);
	});

	test("round-trip: center + depth*half восстанавливает точку", () => {
		const bounds = b(0, 0, 100, 200);
		const center = UB.center(bounds);
		const half = { w: 50, h: 100 };
		const p: CT.C2 = { x: 30, y: 70 };
		const d = UB.depth(bounds, p);
		const restored: CT.C2 = {
			x: center.x + d[0] * half.w,
			y: center.y + d[1] * half.h,
		};
		expect(restored).toEqual(p);
	});
});

describe("UB.projection: проекция на контур Bounds", () => {
	const poly = b(0, 0, 10, 10);

	test("внутри, ближайшая грань — левая → {minX, p.y}", () => {
		expect(UB.projection(poly, { x: 2, y: 5 })).toEqual({ x: 0, y: 5 });
	});

	test("внутри, ближайшая грань — правая → {maxX, p.y}", () => {
		expect(UB.projection(poly, { x: 8, y: 5 })).toEqual({ x: 10, y: 5 });
	});

	test("внутри, ближайшая грань — нижняя → {p.x, minY}", () => {
		expect(UB.projection(poly, { x: 5, y: 2 })).toEqual({ x: 5, y: 0 });
	});

	test("внутри, ближайшая грань — верхняя → {p.x, maxY}", () => {
		expect(UB.projection(poly, { x: 5, y: 8 })).toEqual({ x: 5, y: 10 });
	});

	test("внутри, центр (равноудалён от всех) → левая (приоритет)", () => {
		expect(UB.projection(poly, { x: 5, y: 5 })).toEqual({ x: 0, y: 5 });
	});

	test("снаружи по X → clamp X к ближайшей грани", () => {
		expect(UB.projection(poly, { x: 15, y: 5 })).toEqual({ x: 10, y: 5 });
		expect(UB.projection(poly, { x: -5, y: 5 })).toEqual({ x: 0, y: 5 });
	});

	test("снаружи по Y → clamp Y к ближайшей грани", () => {
		expect(UB.projection(poly, { x: 5, y: 15 })).toEqual({ x: 5, y: 10 });
		expect(UB.projection(poly, { x: 5, y: -5 })).toEqual({ x: 5, y: 0 });
	});

	test("снаружи по диагонали → угол", () => {
		expect(UB.projection(poly, { x: 15, y: 15 })).toEqual({ x: 10, y: 10 });
		expect(UB.projection(poly, { x: -5, y: -5 })).toEqual({ x: 0, y: 0 });
	});

	test("точка-Bounds: p в точке → точка", () => {
		expect(UB.projection(b(5, 5, 5, 5), { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
	});

	test("точка-Bounds: p снаружи → точка", () => {
		expect(UB.projection(b(5, 5, 5, 5), { x: 10, y: 10 })).toEqual({ x: 5, y: 5 });
	});

	test("линия-Bounds по X: p на линии → p (ближайшая вырожденная грань)", () => {
		expect(UB.projection(b(0, 5, 10, 5), { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
	});

	test("линия-Bounds по X: p снаружи по X → ближайший конец", () => {
		expect(UB.projection(b(0, 5, 10, 5), { x: 15, y: 10 })).toEqual({ x: 10, y: 5 });
		expect(UB.projection(b(0, 5, 10, 5), { x: -5, y: 10 })).toEqual({ x: 0, y: 5 });
	});

	test("не мутирует исходный Bounds", () => {
		const bounds = b(0, 0, 10, 10);
		UB.projection(bounds, { x: 5, y: 5 });
		expect(bounds).toEqual(b(0, 0, 10, 10));
	});
});

describe("UB.nearest: ближайшая значащая точка", () => {
	const poly = b(0, 0, 10, 10);

	test("внутри → p (уже значащая)", () => {
		expect(UB.nearest(poly, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
		expect(UB.nearest(poly, { x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
	});

	test("снаружи по X → clamp к грани", () => {
		expect(UB.nearest(poly, { x: 15, y: 5 })).toEqual({ x: 10, y: 5 });
		expect(UB.nearest(poly, { x: -5, y: 5 })).toEqual({ x: 0, y: 5 });
	});

	test("снаружи по Y → clamp к грани", () => {
		expect(UB.nearest(poly, { x: 5, y: 15 })).toEqual({ x: 5, y: 10 });
		expect(UB.nearest(poly, { x: 5, y: -5 })).toEqual({ x: 5, y: 0 });
	});

	test("снаружи по диагонали → угол", () => {
		expect(UB.nearest(poly, { x: 15, y: 15 })).toEqual({ x: 10, y: 10 });
		expect(UB.nearest(poly, { x: -5, y: -5 })).toEqual({ x: 0, y: 0 });
	});

	test("точка-Bounds: p в точке → точка", () => {
		expect(UB.nearest(b(5, 5, 5, 5), { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
	});

	test("точка-Bounds: p снаружи → точка", () => {
		expect(UB.nearest(b(5, 5, 5, 5), { x: 10, y: 10 })).toEqual({ x: 5, y: 5 });
	});

	test("линия-Bounds по X: p на линии (строго между) → p", () => {
		expect(UB.nearest(b(0, 5, 10, 5), { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
	});

	test("линия-Bounds по X: p снаружи → ближайшая точка отрезка", () => {
		expect(UB.nearest(b(0, 5, 10, 5), { x: 15, y: 10 })).toEqual({ x: 10, y: 5 });
		expect(UB.nearest(b(0, 5, 10, 5), { x: -5, y: 10 })).toEqual({ x: 0, y: 5 });
	});

	test("nearest возвращает копию p для внутренних точек", () => {
		const p: CT.C2 = { x: 5, y: 5 };
		const result = UB.nearest(poly, p);
		expect(result).toEqual(p);
		expect(result).not.toBe(p);
	});
});

describe("UB.puttable: помещается ли b в a по размеру", () => {
	test("b строго меньше → true", () => {
		expect(UB.puttable(b(0, 0, 100, 200), b(0, 0, 50, 100))).toBe(true);
	});

	test("размеры равны → null", () => {
		expect(UB.puttable(b(0, 0, 100, 200), b(10, 20, 110, 220))).toBe(null);
	});

	test("b больше по X → false", () => {
		expect(UB.puttable(b(0, 0, 100, 200), b(0, 0, 150, 100))).toBe(false);
	});

	test("b больше по Y → false", () => {
		expect(UB.puttable(b(0, 0, 100, 200), b(0, 0, 100, 250))).toBe(false);
	});

	test("b равен по X, меньше по Y → true", () => {
		expect(UB.puttable(b(0, 0, 100, 200), b(0, 0, 100, 100))).toBe(true);
	});

	test("b равен по Y, больше по X → false", () => {
		expect(UB.puttable(b(0, 0, 100, 200), b(0, 0, 150, 200))).toBe(false);
	});

	test("позиция не влияет (только размер)", () => {
		expect(UB.puttable(b(0, 0, 100, 200), b(1000, 1000, 1030, 1080))).toBe(true);
	});

	test("вырожденные: точка в полигон → true", () => {
		expect(UB.puttable(b(0, 0, 100, 100), b(50, 50, 50, 50))).toBe(true);
	});

	test("вырожденные: две точки равного размера → null", () => {
		expect(UB.puttable(b(0, 0, 0, 0), b(5, 5, 5, 5))).toBe(null);
	});
});

describe("UB.put: разместить b внутри a сдвигом", () => {
	describe("mode: nearest", () => {
		test("b уже внутри → без сдвига (копия b)", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(10, 10, 50, 50);
			expect(UB.put(a, bb, "nearest")).toEqual(b(10, 10, 50, 50));
		});

		test("b снаружи слева → сдвиг вправо", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(-50, 10, 0, 50);
			expect(UB.put(a, bb, "nearest")).toEqual(b(0, 10, 50, 50));
		});

		test("b снаружи справа → сдвиг влево", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(80, 10, 130, 50);
			expect(UB.put(a, bb, "nearest")).toEqual(b(50, 10, 100, 50));
		});

		test("b снаружи снизу → сдвиг вверх", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(10, -50, 50, 0);
			expect(UB.put(a, bb, "nearest")).toEqual(b(10, 0, 50, 50));
		});

		test("b снаружи сверху → сдвиг вниз", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(10, 80, 50, 130);
			expect(UB.put(a, bb, "nearest")).toEqual(b(10, 50, 50, 100));
		});

		test("b снаружи по обеим осям → сдвиг по обеим", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(-50, -50, 0, 0);
			expect(UB.put(a, bb, "nearest")).toEqual(b(0, 0, 50, 50));
		});

		test("не мутирует исходный b", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(-50, 10, 0, 50);
			UB.put(a, bb, "nearest");
			expect(bb).toEqual(b(-50, 10, 0, 50));
		});
	});

	describe("mode: center", () => {
		test("центр b совмещается с центром a", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(10, 10, 50, 50);
			const result = UB.put(a, bb, "center");
			expect(UB.center(result)).toEqual(UB.center(a));
		});

		test("b уже отцентрован → без сдвига", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(25, 25, 75, 75);
			expect(UB.put(a, bb, "center")).toEqual(b(25, 25, 75, 75));
		});

		test("b далеко → центр совмещается", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(1000, 1000, 1020, 1020);
			const result = UB.put(a, bb, "center");
			expect(UB.center(result)).toEqual({ x: 50, y: 50 });
		});

		test("не мутирует исходный b", () => {
			const a = b(0, 0, 100, 100);
			const bb = b(10, 10, 50, 50);
			UB.put(a, bb, "center");
			expect(bb).toEqual(b(10, 10, 50, 50));
		});
	});
});

// =============================================================================
// Асимметричные bounds: защита от перепутывания minX↔minY, maxX↔maxY, minX↔maxX, minY↔maxY.
// Каждый кейс ниже использует A = b(-10, -20, 30, 40) — разные значения по всем 4 границам.
// При любом свапе осей результат становится другим (что и ловит тест).
// =============================================================================

describe("UB.isPoint: защита от перепутывания осей (asymmetric bounds)", () => {
	test("minX≠minY, maxX≠maxY, разные по X и Y → isPoint = false", () => {
		// b(-10, -20, -10, -20): «точка», но minX≠minY, maxX≠maxY
		// (если свапнуть, minX=-20, maxX=-10 → eq(minX, maxX) = false → isPoint = false
		//  vs оригинал eq(-10, -10) = true → isPoint = true)
		expect(UB.isPoint(b(-10, -20, -10, -20))).toBe(true);
	});

	test("только по X: minX≈maxX, но minY≠maxY → не точка", () => {
		expect(UB.isPoint(b(-10, 5, -10, 20))).toBe(false);
	});

	test("только по Y: minY≈maxY, но minX≠maxX → не точка", () => {
		expect(UB.isPoint(b(5, -20, 20, -20))).toBe(false);
	});

	test("asymmetric point: minX=minY=maxX=maxY (но разные по обоим осям) → true", () => {
		expect(UB.isPoint(b(7, 13, 7, 13))).toBe(true);
	});

	test("EPS-расхождение только по X → true", () => {
		expect(UB.isPoint(b(0, 0, 0.0005, 0))).toBe(true);
	});

	test("EPS-расхождение только по Y → true", () => {
		expect(UB.isPoint(b(0, 0, 0, 0.0005))).toBe(true);
	});

	test("EPS-расхождение по обеим осям (X≈0, Y≈0) → true", () => {
		expect(UB.isPoint(b(0, 0, 0.0005, 0.0005))).toBe(true);
	});

	test("asymmetric: minX=0, maxX=0.002, minY=5, maxY=5 (точка по Y, линия по X) → false", () => {
		// При свапе minX↔minY: b(5, 0, 0.002, 5) → eq(minX=5, maxX=0.002) = false, eq(minY=0, maxY=5) = false → false.
		// При свапе maxX↔maxY: b(0, 5, 5, 0.002) → eq(0, 5) = false, eq(5, 0.002) = false → false.
		// Оригинал: eq(0, 0.002) ≈ false (за EPS), eq(5, 5) = true → AND = false. Совпадает со свапом.
		// Дополнительная проверка с бОльшим расхождением:
		expect(UB.isPoint(b(0, 5, 0.002, 5))).toBe(false);
		expect(UB.isPoint(b(5, 0, 5, 0.002))).toBe(false);
	});
});

describe("UB.interior: защита от перепутывания осей (asymmetric A)", () => {
	// A асимметричный: minX=-10 ≠ minY=-20, maxX=30 ≠ maxY=40.
	// Если в реализации перепутать minX↔minY, результат «касание по X» изменится.
	const A = b(-10, -20, 30, 40);

	test("касание A.minX: b.minX == A.minX, но не A.minY → true", () => {
		// b.minX=-10 = A.minX=-10, b.minY=5 ≠ A.minY=-20
		// Свап minX↔minY: проверилось бы b.minX=-10 vs A.minY=-20 → false → результат = false (другой)
		expect(UB.interior(A, b(-10, 5, 0, 20))).toBe(true);
	});

	test("касание A.minY: b.minY == A.minY, но не A.minX → true", () => {
		// b.minY=-20 = A.minY=-20, b.minX=5 ≠ A.minX=-10
		// Свап minX↔minY: b.minX=5 vs A.minY=-20 → false → результат изменится
		expect(UB.interior(A, b(5, -20, 20, 0))).toBe(true);
	});

	test("касание A.maxX: b.maxX == A.maxX, но не A.maxY → true", () => {
		expect(UB.interior(A, b(20, 0, 30, 20))).toBe(true);
	});

	test("касание A.maxY: b.maxY == A.maxY, но не A.maxX → true", () => {
		expect(UB.interior(A, b(0, 20, 20, 40))).toBe(true);
	});

	test("b касается «чужой» оси (b.maxX = A.minY, несуществующая связь) → false", () => {
		// b.maxX=-20 = A.minY=-20 — но это не «касание» в каноне interior (maxX с minY не связаны).
		// Свап maxX↔maxY: проверилось бы b.maxX=-20 vs A.maxY=40 → false (не совпали, а должны).
		expect(UB.interior(A, b(-50, -50, -20, 0))).toBe(false);
	});

	test("b строго внутри, не касается → false (асимметрия не меняет результат)", () => {
		expect(UB.interior(A, b(-5, -15, 25, 35))).toBe(false);
	});
});

describe("UB.exterior: защита от перепутывания осей (asymmetric A)", () => {
	const A = b(-10, -20, 30, 40);

	test("b справа: b.minX = A.maxX, но b.minY ≠ A.maxY → true", () => {
		// b.minX=30 = A.maxX=30, b.minY=0 ≠ A.maxY=40
		// Свап minX↔maxX в проверке (b.minX vs a.maxX): всё равно b.minX=30= A.maxX → true (не ловится, но и не нужно).
		// Свап minX↔minY (b.minX vs a.minY): b.minX=30 vs a.minY=-20 → false → результат = false (ловится!)
		expect(UB.exterior(A, b(30, 0, 50, 20))).toBe(true);
	});

	test("b сверху: b.minY = A.maxY, но b.minX ≠ A.maxX → true", () => {
		// b.minY=40 = A.maxY=40
		// Свап minY↔maxY в проверке (b.minY vs a.maxY): b.minY=40=A.maxY → true.
		// Свап minX↔minY (b.minX vs a.minY): b.minX=0 vs a.minY=-20 → false → результат = false.
		expect(UB.exterior(A, b(0, 40, 20, 60))).toBe(true);
	});

	test("b слева: b.maxX = A.minX → true (асимметрия)", () => {
		// A.minX=-10, b.maxX=-10
		expect(UB.exterior(A, b(-50, 0, -10, 20))).toBe(true);
	});

	test("b снизу: b.maxY = A.minY → true (асимметрия)", () => {
		// A.minY=-20, b.maxY=-20
		expect(UB.exterior(A, b(0, -50, 20, -20))).toBe(true);
	});

	test("b примыкает углом: b.maxX=A.minX И b.maxY=A.minY → true", () => {
		expect(UB.exterior(A, b(-50, -50, -10, -20))).toBe(true);
	});

	test("b примыкает, но к «чужой» оси (b.maxX = A.minY) → false", () => {
		// b.maxX=-20 = A.minY=-20 — но это не exterior-касание (maxX и minY не связаны).
		// Свап maxX↔minY в проверке (b.maxX vs a.minY): b.maxX=-20=A.minY → true (неправильно).
		expect(UB.exterior(A, b(-30, -50, -20, 0))).toBe(false);
	});
});

describe("UB.neighbour: защита от перепутывания осей (asymmetric A)", () => {
	const A = b(-10, -20, 30, 40);

	test("interior на асимметричной грани (b.minX = A.minX) → true", () => {
		expect(UB.neighbour(A, b(-10, 5, 0, 20))).toBe(true);
	});

	test("interior на другой асимметричной грани (b.minY = A.minY) → true", () => {
		expect(UB.neighbour(A, b(5, -20, 20, 0))).toBe(true);
	});

	test("exterior на асимметричной грани (b.minX = A.maxX) → true", () => {
		expect(UB.neighbour(A, b(30, 0, 50, 20))).toBe(true);
	});

	test("exterior на другой асимметричной грани (b.minY = A.maxY) → true", () => {
		expect(UB.neighbour(A, b(0, 40, 20, 60))).toBe(true);
	});

	test("далеко (не касается ни одной асимметричной грани) → false", () => {
		expect(UB.neighbour(A, b(500, 500, 600, 600))).toBe(false);
	});
});

describe("UB.contain: защита от перепутывания осей (asymmetric a)", () => {
	// a асимметричный: -10, -20, 30, 40
	const a = b(-10, -20, 30, 40);

	test("b строго внутри, неравномерно по осям → true", () => {
		expect(UB.contain(a, b(0, 0, 20, 30))).toBe(true);
	});

	test("b выходит за a.maxX (но не за a.maxY) → false", () => {
		// b.maxX=50 > a.maxX=30
		// Свап maxX↔maxY в проверке (b.maxX vs a.maxX): b.maxX=50, a.maxX=30 → gte(50, 30)=true, lte(50, 30)=false → false.
		// Свап maxX↔minX (b.maxX vs a.minX): b.maxX=50, a.minX=-10 → gte(50, -10)=true, lte(50, -10)=false → false.
		expect(UB.contain(a, b(0, 0, 50, 30))).toBe(false);
	});

	test("b выходит за a.maxY (но не за a.maxX) → false", () => {
		// b.maxY=60 > a.maxY=40
		expect(UB.contain(a, b(0, 0, 20, 60))).toBe(false);
	});

	test("b выходит за a.minX (но не за a.minY) → false", () => {
		// b.minX=-50 < a.minX=-10
		expect(UB.contain(a, b(-50, 0, 20, 30))).toBe(false);
	});

	test("b выходит за a.minY (но не за a.minX) → false", () => {
		// b.minY=-50 < a.minY=-20
		expect(UB.contain(a, b(0, -50, 20, 30))).toBe(false);
	});

	test("b с разным выходом за каждую ось → false (и свап даст другой результат)", () => {
		// b.minX=-50 < a.minX=-10, b.maxY=60 > a.maxY=40
		// При свапе minX↔minY: проверяется b.minX=-50 vs a.minY=-20 → gte(-50, -20) = false → раньше «вылетает».
		expect(UB.contain(a, b(-50, 0, 20, 60))).toBe(false);
	});

	test("b касается всех 4 асимметричных граней → true", () => {
		// a = b, равенство
		expect(UB.contain(a, b(-10, -20, 30, 40))).toBe(true);
	});

	test("b точка в (-9, -19) — строго внутри a, не на границе → true", () => {
		expect(UB.contain(a, b(-9, -19, -9, -19))).toBe(true);
	});
});

describe("UB.owns: защита от перепутывания осей (asymmetric POLY)", () => {
	// POLY асимметричный: -10, -20, 30, 40
	const POLY = b(-10, -20, 30, 40);

	test("точка строго внутри, не на асимметричных гранях → true", () => {
		expect(UB.owns(POLY, b(5, 5, 5, 5))).toBe(true);
	});

	test("точка на POLY.minX, но строго внутри по Y → false (касание)", () => {
		// b.minX = -10 = POLY.minX → касание по X
		// Свап minX↔minY: b.minX=-10 vs POLY.minY=-20 → gte(-10, -20)=true, gt(-10, -20)=true — НЕ ловится напрямую,
		// но при свапе minX↔minY в `gt(b.minX, a.minX)` будет gt(-10, -20)=true (для b.minX=-10 vs a.minX=-10 в оригинале — gt(-10, -10)=false).
		// В асимметричном POLY: оригинал ожидает false (касание), свап дал бы true → ловится.
		expect(UB.owns(POLY, b(-10, 5, -10, 20))).toBe(false);
	});

	test("точка на POLY.minY, но строго внутри по X → false (касание)", () => {
		expect(UB.owns(POLY, b(5, -20, 20, -20))).toBe(false);
	});

	test("точка на POLY.maxX → false (касание по X)", () => {
		expect(UB.owns(POLY, b(30, 5, 30, 20))).toBe(false);
	});

	test("точка на POLY.maxY → false (касание по Y)", () => {
		expect(UB.owns(POLY, b(5, 40, 20, 40))).toBe(false);
	});

	test("строго внутренний прямоугольник (зазор по обеим асимметричным осям) → true", () => {
		expect(UB.owns(POLY, b(0, 0, 20, 30))).toBe(true);
	});

	test("полигон с зазором только по X (касание по Y) → false", () => {
		expect(UB.owns(POLY, b(0, -20, 20, 30))).toBe(false);
	});

	test("полигон с зазором только по Y (касание по X) → false", () => {
		expect(UB.owns(POLY, b(-10, 0, 20, 30))).toBe(false);
	});
});

describe("UB.collision: защита от перепутывания осей (asymmetric A)", () => {
	const A = b(-10, -20, 30, 40);

	test("точка на A.maxX (граница) → false (по канону владения)", () => {
		// b(30, 5, 30, 5): точка на maxX=30, внутри по Y
		// граница не считается «внутренней» → collision = false
		expect(UB.collision(A, b(30, 5, 30, 5))).toBe(false);
	});

	test("точка на A.maxY (граница) → false (по канону владения)", () => {
		// b(5, 40, 5, 40): точка на maxY=40, внутри по X
		expect(UB.collision(A, b(5, 40, 5, 40))).toBe(false);
	});

	test("точка на A.minX (граница) → false", () => {
		expect(UB.collision(A, b(-10, 5, -10, 5))).toBe(false);
	});

	test("точка на A.minY (граница) → false", () => {
		expect(UB.collision(A, b(5, -20, 5, -20))).toBe(false);
	});

	test("точка в углу A (на maxX и maxY) → false", () => {
		expect(UB.collision(A, b(30, 40, 30, 40))).toBe(false);
	});

	test("точка строго внутри, не на асимметричных гранях → true", () => {
		// b(5, 5, 5, 5): X=5 ∈ (-10, 30), Y=5 ∈ (-20, 40)
		expect(UB.collision(A, b(5, 5, 5, 5))).toBe(true);
	});

	test("точка строго внутри, близко к maxX (X=29) → true", () => {
		// отступ от maxX=30 и maxY=40 разный → асимметричное расположение
		expect(UB.collision(A, b(29, 39, 29, 39))).toBe(true);
		expect(UB.collision(A, b(29, 35, 29, 35))).toBe(true);
	});

	test("точка строго внутри, близко к maxY (Y=39) → true", () => {
		expect(UB.collision(A, b(5, 39, 5, 39))).toBe(true);
	});

	test("точка вне по X, внутри по Y → false", () => {
		// b(100, 5, 100, 5): X=100 > A.maxX=30, Y=5 ∈ (-20, 40)
		expect(UB.collision(A, b(100, 5, 100, 5))).toBe(false);
	});

	test("точка вне по Y, внутри по X → false", () => {
		// b(5, 100, 5, 100): X=5 ∈ (-10, 30), Y=100 > A.maxY=40
		expect(UB.collision(A, b(5, 100, 5, 100))).toBe(false);
	});

	test("точка вне по обеим осям → false", () => {
		expect(UB.collision(A, b(100, 100, 100, 100))).toBe(false);
	});

	test("полигон с пересечением по X, но не по Y → false (асимметрия)", () => {
		// b(0, 100, 20, 200): X=[0,20] внутри A.X=[-10,30], Y=[100,200] снаружи A.Y=[-20,40]
		expect(UB.collision(A, b(0, 100, 20, 200))).toBe(false);
	});

	test("полигон с пересечением по Y, но не по X → false (асимметрия)", () => {
		// b(100, 0, 200, 30): X=[100,200] снаружи A.X=[-10,30], Y=[0,30] внутри A.Y=[-20,40]
		expect(UB.collision(A, b(100, 0, 200, 30))).toBe(false);
	});

	test("полигон с пересечением по обеим асимметричным осям → true", () => {
		expect(UB.collision(A, b(0, 0, 20, 30))).toBe(true);
	});
});

describe("UB.overlap: защита от перепутывания осей (asymmetric)", () => {
	const A = b(-10, -20, 30, 40);

	test("перекрытие асимметричное: b=[-5, -10, 20, 30] → копия b", () => {
		// X=[-5, 20] внутри [-10, 30], Y=[-10, 30] внутри [-20, 40]
		const bb = b(-5, -10, 20, 30);
		expect(UB.overlap(A, bb)).toEqual(b(-5, -10, 20, 30));
	});

	test("строгое перекрытие: b=[0, 0, 20, 30] → b", () => {
		expect(UB.overlap(A, b(0, 0, 20, 30))).toEqual(b(0, 0, 20, 30));
	});

	test("касание по maxX (b.minX = A.maxX) → null (нет значащих общих точек)", () => {
		// b=[30, 0, 100, 30]: X касается в 30, Y внутри [0,30]
		// collision: X axis max=30, min=30 → lt(30, 30) = false → collision=false → overlap=null
		expect(UB.overlap(A, b(30, 0, 100, 30))).toBeNull();
	});

	test("касание по maxY (b.minY = A.maxY) → null", () => {
		// b=[0, 40, 20, 100]: Y касается в 40, X внутри
		expect(UB.overlap(A, b(0, 40, 20, 100))).toBeNull();
	});

	test("касание по minX (b.maxX = A.minX) → null", () => {
		// b=[-100, 0, -10, 30]: X касается в -10, Y внутри
		expect(UB.overlap(A, b(-100, 0, -10, 30))).toBeNull();
	});

	test("касание по minY (b.maxY = A.minY) → null", () => {
		expect(UB.overlap(A, b(0, -100, 20, -20))).toBeNull();
	});

	test("b полностью вне по X, пересекает по Y → null", () => {
		// b=[100, 0, 200, 30]: X=[100,200] снаружи, Y=[0,30] внутри
		// collision: X axis нет overlap → collision=false → null
		expect(UB.overlap(A, b(100, 0, 200, 30))).toBeNull();
	});

	test("b полностью вне по Y, пересекает по X → null", () => {
		expect(UB.overlap(A, b(0, 100, 20, 200))).toBeNull();
	});

	test("b полностью вне по обеим осям → null", () => {
		expect(UB.overlap(A, b(100, 100, 200, 200))).toBeNull();
	});

	test("асимметричный overlap: разные minX/minY после пересечения", () => {
		// b=[-5, 0, 100, 50]: X=[-5, 30] ∩ A.X=[-10, 30] = [-5, 30], Y=[0, 40] ∩ A.Y=[-20, 40] = [0, 40]
		expect(UB.overlap(A, b(-5, 0, 100, 50))).toEqual(b(-5, 0, 30, 40));
	});
});

describe("UB.intersect: защита от перепутывания осей (asymmetric POLY)", () => {
	const POLY = b(-10, -20, 30, 40);

	test("линия пересекает POLY.maxX вертикально → true", () => {
		// вертикальная линия на x=30 (POLY.maxX), от y=-50 до y=50
		expect(UB.intersect(POLY, ln(30, -50, 30, 50))).toBe(true);
	});

	test("линия пересекает POLY.maxY горизонтально → true", () => {
		// горизонтальная линия на y=40 (POLY.maxY), от x=-50 до x=50
		expect(UB.intersect(POLY, ln(-50, 40, 50, 40))).toBe(true);
	});

	test("линия пересекает POLY.minX вертикально → true", () => {
		expect(UB.intersect(POLY, ln(-10, -50, -10, 50))).toBe(true);
	});

	test("линия пересекает POLY.minY горизонтально → true", () => {
		expect(UB.intersect(POLY, ln(-50, -20, 50, -20))).toBe(true);
	});

	test("диагональ сквозь POLY: x: -50→50, y: -50→50 → true", () => {
		expect(UB.intersect(POLY, ln(-50, -50, 50, 50))).toBe(true);
	});

	test("линия мимо по X (вертикаль на x=100, далеко) → false", () => {
		expect(UB.intersect(POLY, ln(100, -50, 100, 50))).toBe(false);
	});

	test("линия мимо по Y (горизонталь на y=100) → false", () => {
		expect(UB.intersect(POLY, ln(-50, 100, 50, 100))).toBe(false);
	});

	test("линия вдоль ребра POLY.maxX за пределами (горизонталь на y=40, но X=120) → false", () => {
		// горизонталь на y=40, но X=[120, 180] — за пределами POLY.maxX=30
		expect(UB.intersect(POLY, ln(120, 40, 180, 40))).toBe(false);
	});

	test("линия вдоль ребра POLY.maxY за пределами (вертикаль на x=30, но Y=120) → false", () => {
		expect(UB.intersect(POLY, ln(30, 120, 30, 180))).toBe(false);
	});
});

describe("UB.projection: защита от перепутывания осей (asymmetric bounds)", () => {
	const poly = b(-10, -20, 30, 40);

	test("снаружи за poly.maxX: clamp по X к 30, Y не меняется", () => {
		expect(UB.projection(poly, { x: 100, y: 5 })).toEqual({ x: 30, y: 5 });
	});

	test("снаружи за poly.maxY: clamp по Y к 40, X не меняется", () => {
		expect(UB.projection(poly, { x: 5, y: 100 })).toEqual({ x: 5, y: 40 });
	});

	test("снаружи за poly.minX (-100) → clamp к -10", () => {
		expect(UB.projection(poly, { x: -100, y: 5 })).toEqual({ x: -10, y: 5 });
	});

	test("снаружи за poly.minY (-100) → clamp к -20", () => {
		expect(UB.projection(poly, { x: 5, y: -100 })).toEqual({ x: 5, y: -20 });
	});

	test("снаружи за разные грани по X и Y → разные проекции", () => {
		// за poly.maxX (X=100) и poly.minY (Y=-100)
		expect(UB.projection(poly, { x: 100, y: -100 })).toEqual({ x: 30, y: -20 });
		// за poly.minX (X=-100) и poly.maxY (Y=100)
		expect(UB.projection(poly, { x: -100, y: 100 })).toEqual({ x: -10, y: 40 });
	});

	test("внутри, ближайшая грань — poly.maxX → {30, p.y}", () => {
		// p = (25, 5): dist to maxX = 30-25 = 5, dist to minX = 25-(-10) = 35, dist to maxY = 40-5 = 35, dist to minY = 5-(-20) = 25
		// min = 5 → maxX
		expect(UB.projection(poly, { x: 25, y: 5 })).toEqual({ x: 30, y: 5 });
	});

	test("внутри, ближайшая грань — poly.minY → {p.x, -20}", () => {
		// p = (0, -15): dist to minX=10, to maxX=30, to minY=5, to maxY=55
		// min = 5 → minY
		expect(UB.projection(poly, { x: 0, y: -15 })).toEqual({ x: 0, y: -20 });
	});

	test("внутри, ближайшая грань — poly.maxY → {p.x, 40}", () => {
		// p = (0, 35): dist to minX=10, to maxX=30, to minY=55, to maxY=5
		// min = 5 → maxY
		expect(UB.projection(poly, { x: 0, y: 35 })).toEqual({ x: 0, y: 40 });
	});

	test("внутри, ближайшая грань — poly.minX → {-10, p.y}", () => {
		// p = (-5, 0): dist to minX=5, to maxX=35, to minY=20, to maxY=40
		// min = 5 → minX
		expect(UB.projection(poly, { x: -5, y: 0 })).toEqual({ x: -10, y: 0 });
	});

	test("диагональ за разные грани → угол (разные значения)", () => {
		// за maxX и maxY
		expect(UB.projection(poly, { x: 100, y: 100 })).toEqual({ x: 30, y: 40 });
		// за minX и minY
		expect(UB.projection(poly, { x: -100, y: -100 })).toEqual({ x: -10, y: -20 });
	});
});

describe("UB.nearest: защита от перепутывания осей (asymmetric bounds)", () => {
	const poly = b(-10, -20, 30, 40);

	test("снаружи за poly.maxX: clamp по X к 30, Y не меняется", () => {
		expect(UB.nearest(poly, { x: 100, y: 5 })).toEqual({ x: 30, y: 5 });
	});

	test("снаружи за poly.maxY: clamp по Y к 40, X не меняется", () => {
		expect(UB.nearest(poly, { x: 5, y: 100 })).toEqual({ x: 5, y: 40 });
	});

	test("снаружи за poly.minX (-100) → clamp к -10", () => {
		expect(UB.nearest(poly, { x: -100, y: 5 })).toEqual({ x: -10, y: 5 });
	});

	test("снаружи за poly.minY (-100) → clamp к -20", () => {
		expect(UB.nearest(poly, { x: 5, y: -100 })).toEqual({ x: 5, y: -20 });
	});

	test("снаружи за разные грани по X и Y → разные результаты", () => {
		expect(UB.nearest(poly, { x: 100, y: -100 })).toEqual({ x: 30, y: -20 });
		expect(UB.nearest(poly, { x: -100, y: 100 })).toEqual({ x: -10, y: 40 });
	});

	test("внутри → p (без изменений)", () => {
		expect(UB.nearest(poly, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
		expect(UB.nearest(poly, { x: 25, y: 35 })).toEqual({ x: 25, y: 35 });
	});

	test("диагональ → угол (разные значения)", () => {
		expect(UB.nearest(poly, { x: 100, y: 100 })).toEqual({ x: 30, y: 40 });
		expect(UB.nearest(poly, { x: -100, y: -100 })).toEqual({ x: -10, y: -20 });
	});
});

describe("UB.put: защита от перепутывания осей (asymmetric bounds)", () => {
	const a = b(-10, -20, 100, 80); // center = {45, 30}, size = {110, 100}

	test("mode center: центр b совмещён с центром a (асимметричные)", () => {
		const bb = b(50, 30, 90, 70); // center = {70, 50}
		const result = UB.put(a, bb, "center");
		// center a = {45, 30}; центр b после сдвига должен быть {45, 30}
		expect(UB.center(result)).toEqual(UB.center(a));
		// Свап осей в `sub(a_center, b_center)`: вместо {a.x - b.x, a.y - b.y} → {a.y - b.y, a.x - b.x} — другой результат
		// Размер b не меняется
		const size_b = { w: bb.maxX - bb.minX, h: bb.maxY - bb.minY };
		const size_result = { w: result.maxX - result.minX, h: result.maxY - result.minY };
		expect(size_result).toEqual(size_b);
	});

	test("mode nearest: b снаружи справа → сдвиг влево (асимметрия)", () => {
		// a = b(-10, -20, 100, 80), bb = b(150, 30, 200, 70)
		// bb.minX=150 > a.minX=-10 → проверяем bb.maxX=200 > a.maxX=100 → dx = a.maxX - bb.maxX = 100 - 200 = -100
		// bb.minY=30 ∈ [a.minY=-20, a.maxY=80] → dy = 0
		const bb = b(150, 30, 200, 70);
		const result = UB.put(a, bb, "nearest");
		expect(result).toEqual(b(50, 30, 100, 70));
	});

	test("mode nearest: b снаружи сверху → сдвиг вниз (асимметрия)", () => {
		// bb = b(50, 150, 90, 200): bb.minY=150 > a.maxY=80
		// bb.minX=50 ∈ [a.minX, a.maxX] → dx=0
		// bb.minY > a.maxY → dy = a.maxY - bb.maxY = 80 - 200 = -120
		const bb = b(50, 150, 90, 200);
		const result = UB.put(a, bb, "nearest");
		expect(result).toEqual(b(50, 30, 90, 80));
	});

	test("mode nearest: b снаружи слева → сдвиг вправо (асимметрия)", () => {
		// bb = b(-200, 30, -150, 70): bb.minX=-200 < a.minX=-10
		// bb.minX < a.minX → dx = a.minX - bb.minX = -10 - (-200) = 190
		// bb.minY ∈ [a.minY, a.maxY] → dy=0
		const bb = b(-200, 30, -150, 70);
		const result = UB.put(a, bb, "nearest");
		expect(result).toEqual(b(-10, 30, 40, 70));
	});

	test("mode nearest: b снаружи снизу → сдвиг вверх (асимметрия)", () => {
		// bb = b(50, -200, 90, -150): bb.minY=-200 < a.minY=-20
		// bb.minY < a.minY → dy = a.minY - bb.minY = -20 - (-200) = 180
		const bb = b(50, -200, 90, -150);
		const result = UB.put(a, bb, "nearest");
		expect(result).toEqual(b(50, -20, 90, 30));
	});

	test("mode nearest: b по обеим осям снаружи (асимметрично) → сдвиг по обеим", () => {
		// bb = b(-200, -200, -150, -150): bb.minX=-200 < a.minX=-10, bb.minY=-200 < a.minY=-20
		// dx = -10 - (-200) = 190; dy = -20 - (-200) = 180
		const bb = b(-200, -200, -150, -150);
		const result = UB.put(a, bb, "nearest");
		expect(result).toEqual(b(-10, -20, 40, 30));
	});
});

describe("UB.puttable: защита от перепутывания осей (asymmetric)", () => {
	const A = b(-10, -20, 100, 80); // size = {110, 100}

	test("b больше только по X → false", () => {
		// b = (0, 0, 200, 50): width=200 > A.width=110, height=50 < A.height=100
		expect(UB.puttable(A, b(0, 0, 200, 50))).toBe(false);
	});

	test("b больше только по Y → false", () => {
		// b = (0, 0, 50, 200): width=50 < A.width=110, height=200 > A.height=100
		expect(UB.puttable(A, b(0, 0, 50, 200))).toBe(false);
	});

	test("b меньше по обеим осям (но разный размер) → true", () => {
		expect(UB.puttable(A, b(0, 0, 50, 50))).toBe(true);
	});

	test("b равен по размеру (но асимметричная позиция) → null", () => {
		// размеры равны, но b позиция другая
		expect(UB.puttable(A, b(500, 500, 610, 600))).toBe(null);
	});

	test("b равен только по X, меньше по Y → true", () => {
		// b.width = 110, b.height = 50
		expect(UB.puttable(A, b(0, 0, 110, 50))).toBe(true);
	});

	test("b равен только по Y, меньше по X → true", () => {
		// b.width = 50, b.height = 100
		expect(UB.puttable(A, b(0, 0, 50, 100))).toBe(true);
	});
});

describe("UB.size/width/height: защита от перепутывания осей (asymmetric bounds)", () => {
	test("size асимметричных bounds: w ≠ h", () => {
		expect(UB.size(b(-10, -20, 30, 40))).toEqual({ w: 40, h: 60 });
	});

	test("width асимметричных bounds", () => {
		expect(UB.width(b(-10, -20, 30, 40))).toBe(40);
	});

	test("height асимметричных bounds", () => {
		expect(UB.height(b(-10, -20, 30, 40))).toBe(60);
	});

	test("size асимметричных по-другому: maxX > maxY", () => {
		expect(UB.size(b(-10, -20, 100, 30))).toEqual({ w: 110, h: 50 });
	});

	test("size асимметричных: maxX < maxY", () => {
		expect(UB.size(b(-10, -20, 30, 100))).toEqual({ w: 40, h: 120 });
	});
});
