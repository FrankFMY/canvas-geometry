import { describe, expect, test } from "bun:test";
import { UC2 } from "./coords.js";
import { UE } from "./edge.js";
import type * as CT from "./types.js";

const depthEq = (d: CT.Depth, t: number): boolean => Math.abs(d[0] - t) < 1e-9 && Math.abs(d[1] - t) < 1e-9;
const isTuple = (r: ReturnType<typeof UE.cross>): r is [CT.C2, CT.Depth, CT.Depth] => Array.isArray(r);

const O = { x: 0, y: 0 };
const A10 = { x: 10, y: 0 };
const A5y5 = { x: 0, y: 5 };
const A10y5 = { x: 10, y: 5 };
const A5 = { x: 5, y: 0 };
const A20 = { x: 20, y: 0 };
const A10y10 = { x: 10, y: 10 };
const A0y10 = { x: 0, y: 10 };
const P55 = { x: 5, y: 5 };

const H1: CT.Edge = [O, A10];
const H2: CT.Edge = [A5y5, A10y5];
const H_SAME: CT.Edge = [A5, A20];
const H_REV: CT.Edge = [A10, O];
const DIAG: CT.Edge = [O, A10y10];
const VERT: CT.Edge = [O, A0y10];
const EMPTY1: CT.Edge = [O, O];
const EMPTY2: CT.Edge = [P55, P55];

describe("UE.isEmpty: ребро-точка", () => {
	test("совпадающие концы → true", () => {
		expect(UE.isEmpty([O, O])).toBe(true);
		expect(UE.isEmpty([P55, P55])).toBe(true);
	});

	test("различные концы → false", () => {
		expect(UE.isEmpty(H1)).toBe(false);
		expect(UE.isEmpty(DIAG)).toBe(false);
		expect(UE.isEmpty(VERT)).toBe(false);
	});

	test("в пределах __eps (1e-3) → true", () => {
		expect(
			UE.isEmpty([
				{ x: 0, y: 0 },
				{ x: 0.0001, y: 0 },
			]),
		).toBe(true);
		expect(
			UE.isEmpty([
				{ x: 0, y: 0 },
				{ x: 0, y: 0.0009 },
			]),
		).toBe(true);
	});

	test("за пределами __eps → false", () => {
		expect(
			UE.isEmpty([
				{ x: 0, y: 0 },
				{ x: 0.002, y: 0 },
			]),
		).toBe(false);
		expect(
			UE.isEmpty([
				{ x: 0, y: 0 },
				{ x: 0, y: 0.0011 },
			]),
		).toBe(false);
	});

	test("кастомный EPS ужесточает порог", () => {
		const edge: CT.Edge = [
			{ x: 0, y: 0 },
			{ x: 0.0005, y: 0 },
		];
		expect(UE.isEmpty(edge, 1e-4)).toBe(false);
		expect(UE.isEmpty(edge, 1e-3)).toBe(true);
	});
});

describe("UE.collinear: направляющие коллинеарны (слабейший предикат)", () => {
	test("параллельные на разных прямых → true", () => {
		expect(UE.collinear(H1, H2)).toBe(true);
	});

	test("на одной прямой → true", () => {
		expect(UE.collinear(H1, H_SAME)).toBe(true);
	});

	test("анти-параллельные (противоположно направленные на одной прямой) → true", () => {
		expect(UE.collinear(H1, H_REV)).toBe(true);
	});

	test("пересекающиеся под углом → false", () => {
		expect(UE.collinear(H1, DIAG)).toBe(false);
		expect(UE.collinear(H1, VERT)).toBe(false);
		expect(UE.collinear(DIAG, VERT)).toBe(false);
	});

	test("перпендикулярные → false", () => {
		expect(UE.collinear(H1, VERT)).toBe(false);
	});

	test("обе пустые → true (особый случай)", () => {
		expect(UE.collinear(EMPTY1, EMPTY2)).toBe(true);
	});

	test("одна пустая, другая нет → false (empty первым)", () => {
		expect(UE.collinear(EMPTY1, H1)).toBe(false);
	});

	test("одна пустая, другая нет → false (empty вторым)", () => {
		expect(UE.collinear(H1, EMPTY1)).toBe(false);
	});

	test("симметричность: collinear(a,b) === collinear(b,a)", () => {
		expect(UE.collinear(H1, H2)).toBe(UE.collinear(H2, H1));
		expect(UE.collinear(H1, DIAG)).toBe(UE.collinear(DIAG, H1));
		expect(UE.collinear(EMPTY1, H1)).toBe(UE.collinear(H1, EMPTY1));
	});
});

describe("UE.parallel: строго параллельны на разных прямых", () => {
	test("параллельные на разных прямых → true", () => {
		expect(UE.parallel(H1, H2)).toBe(true);
	});

	test("на одной прямой → false (это similar, не parallel)", () => {
		expect(UE.parallel(H1, H_SAME)).toBe(false);
		expect(UE.parallel(H1, H_REV)).toBe(false);
	});

	test("пересекающиеся → false", () => {
		expect(UE.parallel(H1, DIAG)).toBe(false);
		expect(UE.parallel(H1, VERT)).toBe(false);
	});

	test("обе пустые → true (особый случай)", () => {
		expect(UE.parallel(EMPTY1, EMPTY2)).toBe(true);
	});

	test("одна пустая, другая нет → false (empty первым)", () => {
		expect(UE.parallel(EMPTY1, H1)).toBe(false);
	});

	test("одна пустая, другая нет → false (empty вторым)", () => {
		expect(UE.parallel(H1, EMPTY1)).toBe(false);
	});

	test("симметричность: parallel(a,b) === parallel(b,a)", () => {
		expect(UE.parallel(H1, H2)).toBe(UE.parallel(H2, H1));
		expect(UE.parallel(H1, H_SAME)).toBe(UE.parallel(H_SAME, H1));
	});

	test("parallel ⇒ collinear (но не наоборот)", () => {
		expect(UE.parallel(H1, H2)).toBe(true);
		expect(UE.collinear(H1, H2)).toBe(true);
	});
});

describe("UE.similar: на одной прямой", () => {
	test("на одной прямой (сонаправленные) → true", () => {
		expect(UE.similar(H1, H_SAME)).toBe(true);
	});

	test("на одной прямой (противонаправленные) → true", () => {
		expect(UE.similar(H1, H_REV)).toBe(true);
	});

	test("параллельные на разных прямых → false", () => {
		expect(UE.similar(H1, H2)).toBe(false);
	});

	test("пересекающиеся → false", () => {
		expect(UE.similar(H1, DIAG)).toBe(false);
		expect(UE.similar(H1, VERT)).toBe(false);
	});

	test("обе пустые → true (особый случай)", () => {
		expect(UE.similar(EMPTY1, EMPTY2)).toBe(true);
	});

	test("одна пустая, другая нет → false (empty первым)", () => {
		expect(UE.similar(EMPTY1, H1)).toBe(false);
	});

	test("одна пустая, другая нет → false (empty вторым)", () => {
		expect(UE.similar(H1, EMPTY1)).toBe(false);
	});

	test("симметричность: similar(a,b) === similar(b,a)", () => {
		expect(UE.similar(H1, H_SAME)).toBe(UE.similar(H_SAME, H1));
		expect(UE.similar(H1, H2)).toBe(UE.similar(H2, H1));
	});

	test("similar ⇒ collinear (но не наоборот)", () => {
		expect(UE.similar(H1, H_SAME)).toBe(true);
		expect(UE.collinear(H1, H_SAME)).toBe(true);
	});
});

describe("UE: иерархия предикатов (collinear ⊃ {parallel, similar})", () => {
	test("parallel и similar взаимно исключают друг друга (для непустых)", () => {
		const pairs: Array<[CT.Edge, CT.Edge]> = [
			[H1, H2],
			[H1, H_SAME],
			[H1, H_REV],
			[H1, DIAG],
			[H1, VERT],
			[
				DIAG,
				[
					{ x: 5, y: 5 },
					{ x: 15, y: 15 },
				],
			],
			[
				DIAG,
				[
					{ x: 0, y: 10 },
					{ x: 10, y: 20 },
				],
			],
		];
		for (const [a, b] of pairs) {
			const isParallel = UE.parallel(a, b);
			const isSimilar = UE.similar(a, b);
			expect(isParallel && isSimilar).toBe(false);
		}
	});

	test("parallel ∨ similar ⇒ collinear", () => {
		const pairs: Array<[CT.Edge, CT.Edge]> = [
			[H1, H2],
			[H1, H_SAME],
			[H1, H_REV],
		];
		for (const [a, b] of pairs) {
			const isParallel = UE.parallel(a, b);
			const isSimilar = UE.similar(a, b);
			const isCollinear = UE.collinear(a, b);
			expect(isCollinear).toBe(isParallel || isSimilar);
		}
	});

	test("для пустых: parallel == similar == collinear == true", () => {
		expect(UE.collinear(EMPTY1, EMPTY2)).toBe(true);
		expect(UE.parallel(EMPTY1, EMPTY2)).toBe(true);
		expect(UE.similar(EMPTY1, EMPTY2)).toBe(true);
	});
});

describe("UE: направленные vs ненаправленные рёбра", () => {
	test("collinear нечувствителен к направлению (H1 vs H_REV → true)", () => {
		expect(UE.collinear(H1, H_REV)).toBe(true);
	});

	test("similar нечувствителен к направлению (та же прямая)", () => {
		expect(UE.similar(H1, H_REV)).toBe(true);
	});

	test("parallel нечувствителен к направлению (H2 vs H_REV от другой прямой)", () => {
		const h2rev: CT.Edge = [A10y5, A5y5];
		expect(UE.parallel(H1, h2rev)).toBe(true);
	});
});

describe("UE.center: геометрический центр ребра", () => {
	test("середина между концами", () => {
		expect(UE.center([O, A10])).toEqual({ x: 5, y: 0 });
		expect(UE.center([O, A0y10])).toEqual({ x: 0, y: 5 });
		expect(UE.center([O, A10y10])).toEqual({ x: 5, y: 5 });
	});

	test("совпадающие концы → та же точка", () => {
		expect(UE.center([P55, P55])).toEqual(P55);
	});

	test("отрицательные координаты", () => {
		expect(UE.center([{ x: -10, y: 0 }, A10])).toEqual(O);
		expect(
			UE.center([
				{ x: -4, y: -2 },
				{ x: 4, y: 2 },
			]),
		).toEqual(O);
	});

	test("не мутирует исходное ребро", () => {
		const e: CT.Edge = [O, A10];
		UE.center(e);
		expect(e).toEqual([O, A10]);
	});
});

describe("UE.depth: глубина Depth от центра до контура", () => {
	test("e[0] → [-1, -1]", () => {
		expect(UE.depth(H1, O)).toEqual([-1, -1]);
	});

	test("e[1] → [1, 1]", () => {
		expect(UE.depth(H1, A10)).toEqual([1, 1]);
	});

	test("center → [0, 0]", () => {
		expect(UE.depth(H1, UE.center(H1))).toEqual([0, 0]);
	});

	test("четверть от a → [-0.5, -0.5]", () => {
		expect(UE.depth(H1, { x: 2.5, y: 0 })).toEqual([-0.5, -0.5]);
	});

	test("три четверти → [0.5, 0.5]", () => {
		expect(UE.depth(H1, { x: 7.5, y: 0 })).toEqual([0.5, 0.5]);
	});

	test("снаружи за e[0] (на прямой) → [t, t], |t| > 1", () => {
		const d = UE.depth(H1, { x: -5, y: 0 });
		expect(d[0]).toBe(-2);
		expect(d[1]).toBe(-2);
	});

	test("снаружи за e[1] (на прямой) → [t, t], |t| > 1", () => {
		const d = UE.depth(H1, { x: 15, y: 0 });
		expect(d[0]).toBe(2);
		expect(d[1]).toBe(2);
	});

	test("не на прямой → [t, Infinity] (t — проекция)", () => {
		const d = UE.depth(H1, { x: 5, y: 5 });
		expect(d[0]).toBe(0);
		expect(d[1]).toBe(Infinity);
	});

	test("не на прямой, другая проекция → [t, Infinity]", () => {
		const d = UE.depth(H1, { x: 15, y: 1 });
		expect(d[0]).toBe(2);
		expect(d[1]).toBe(Infinity);
	});

	test("точка в пределах EPS от прямой → [t, t] (на прямой)", () => {
		const d = UE.depth(H1, { x: 5, y: 0.0005 });
		expect(d[1]).not.toBe(Infinity);
		expect(d[0]).toBeCloseTo(0, 10);
	});

	test("точка за пределами EPS от прямой → [t, Infinity]", () => {
		const d = UE.depth(H1, { x: 5, y: 0.002 });
		expect(d[1]).toBe(Infinity);
	});

	test("пустое ребро (точка): p в точке → [0, 0]", () => {
		expect(UE.depth(EMPTY2, P55)).toEqual([0, 0]);
	});

	test("пустое ребро (точка): p не в точке → [Infinity, Infinity]", () => {
		expect(UE.depth(EMPTY2, { x: 6, y: 5 })).toEqual([Infinity, Infinity]);
	});

	test("вертикальное ребро: [t, t]", () => {
		expect(UE.depth(VERT, O)).toEqual([-1, -1]);
		expect(UE.depth(VERT, A0y10)).toEqual([1, 1]);
		expect(UE.depth(VERT, { x: 0, y: 5 })).toEqual([0, 0]);
		expect(UE.depth(VERT, { x: 0, y: 2.5 })).toEqual([-0.5, -0.5]);
	});

	test("диагональное ребро: [t, t]", () => {
		expect(UE.depth(DIAG, O)).toEqual([-1, -1]);
		expect(UE.depth(DIAG, A10y10)).toEqual([1, 1]);
		expect(UE.depth(DIAG, { x: 5, y: 5 })).toEqual([0, 0]);
		expect(UE.depth(DIAG, { x: 2.5, y: 2.5 })).toEqual([-0.5, -0.5]);
	});

	test("диагональное ребро: не на прямой → [t, Infinity]", () => {
		const d = UE.depth(DIAG, { x: 5, y: 0 });
		expect(d[1]).toBe(Infinity);
	});

	test("round-trip: center + t*half → depth === [t, t]", () => {
		const a: CT.C2 = { x: 3, y: 7 };
		const b: CT.C2 = { x: 11, y: 1 };
		const edge: CT.Edge = [a, b];
		const center = UE.center(edge);
		const half = UC2.mult(UC2.direct(a, b), 0.5);
		for (const t of [-2, -1, -0.5, 0, 0.5, 1, 1.5]) {
			const scaled = UC2.mult(half, t);
			const p = UC2.move(center, scaled);
			const d = UE.depth(edge, p);
			expect(d[0]).toBeCloseTo(t, 10);
			expect(d[1]).toBeCloseTo(t, 10);
		}
	});

	test("порог EPS = __eps (1e-3): точка в пределах → [t, t]", () => {
		const e: CT.Edge = [O, A10];
		const p: CT.C2 = { x: 5, y: 0.0005 };
		expect(UE.depth(e, p)[1]).not.toBe(Infinity);
	});

	test("порог EPS = __eps (1e-3): точка за пределами → [t, Infinity]", () => {
		const e: CT.Edge = [O, A10];
		const p: CT.C2 = { x: 5, y: 0.002 };
		expect(UE.depth(e, p)[1]).toBe(Infinity);
	});
});

describe("UE.joint: единственная точка пересечения отрезков", () => {
	const A5neg5 = { x: 5, y: -5 };
	const A5y5up = { x: 5, y: 5 };
	const A3 = { x: 3, y: 0 };

	test("крест → точка", () => {
		expect(UE.joint([O, A10], [A5neg5, A5y5up])).toEqual({ x: 5, y: 0 });
	});

	test("диагонали (X) → точка", () => {
		expect(
			UE.joint(
				[O, A10y10],
				[
					{ x: 0, y: 10 },
					{ x: 10, y: 0 },
				],
			),
		).toEqual({ x: 5, y: 5 });
	});

	test("касание концами → точка (контур включает концы)", () => {
		expect(UE.joint([O, A5], [A5, A5y5up])).toEqual(A5);
	});

	test("T-образное касание (конец на ребре) → точка", () => {
		expect(UE.joint([O, A5], [A5neg5, A5y5up])).toEqual({ x: 5, y: 0 });
	});

	test("мимо по длине a → null (depth > 1)", () => {
		expect(UE.joint([O, A3], [A5neg5, A5y5up])).toBeNull();
	});

	test("мимо по длине b → null", () => {
		expect(
			UE.joint(
				[O, A10],
				[
					{ x: 15, y: -5 },
					{ x: 15, y: 5 },
				],
			),
		).toBeNull();
	});

	test("параллельные → null", () => {
		expect(UE.joint([O, A10], [A5y5, A10y5])).toBeNull();
	});

	test("коллинеарное перекрытие → null (нет единственной точки)", () => {
		expect(UE.joint([O, A5], [A3, A10])).toBeNull();
	});

	test("точка-точка совпадают → точка", () => {
		expect(UE.joint([P55, P55], [P55, P55])).toEqual(P55);
	});

	test("точка-точка разные → null", () => {
		expect(UE.joint([P55, P55], [A10, A10])).toBeNull();
	});

	test("точка на отрезке (строго внутри) → точка", () => {
		expect(UE.joint([P55, P55], [O, A10y10])).toEqual(P55);
	});

	test("точка на конце отрезка → точка (контур включает концы)", () => {
		expect(UE.joint([O, O], [O, A10])).toEqual(O);
	});

	test("точка за пределами отрезка (на прямой) → null (depth > 1)", () => {
		expect(
			UE.joint(
				[
					{ x: 20, y: 0 },
					{ x: 20, y: 0 },
				],
				[O, A10],
			),
		).toBeNull();
	});

	test("точка не на прямой отрезка → null (depth Infinity)", () => {
		expect(
			UE.joint(
				[
					{ x: 7, y: 7 },
					{ x: 7, y: 7 },
				],
				[O, A10],
			),
		).toBeNull();
	});

	test("симметричность: joint(a,b) ≡ joint(b,a)", () => {
		const a: CT.Edge = [O, A10];
		const b: CT.Edge = [A5neg5, A5y5up];
		expect(UE.joint(a, b)).toEqual(UE.joint(b, a));
	});
});

describe("UE.cross: пересечение прямых с глубинами Depth", () => {
	const A5neg5 = { x: 5, y: -5 };
	const A5y5up = { x: 5, y: 5 };
	const A3 = { x: 3, y: 0 };

	describe("базовое крестовое пересечение", () => {
		test("крест: горизонталь × вертикаль → [точка, [0,0], [0,0]]", () => {
			const r = UE.cross([O, A10], [A5neg5, A5y5up]);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			expect(r[0]).toEqual({ x: 5, y: 0 });
			expect(depthEq(r[1], 0)).toBe(true);
			expect(depthEq(r[2], 0)).toBe(true);
		});

		test("диагонали (X) → [точка (5,5), [0,0], [0,0]]", () => {
			const r = UE.cross(
				[O, A10y10],
				[
					{ x: 0, y: 10 },
					{ x: 10, y: 0 },
				],
			);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			expect(r[0]).toEqual({ x: 5, y: 5 });
			expect(depthEq(r[1], 0)).toBe(true);
			expect(depthEq(r[2], 0)).toBe(true);
		});

		test("несимметричное: depth_a = [-0.4, -0.4], depth_b = [0,0]", () => {
			const r = UE.cross(
				[O, A10],
				[
					{ x: 3, y: -5 },
					{ x: 3, y: 5 },
				],
			);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			expect(r[0]).toEqual({ x: 3, y: 0 });
			expect(depthEq(r[1], -0.4)).toBe(true);
			expect(depthEq(r[2], 0)).toBe(true);
		});
	});

	describe("касание концами (контур включает концы)", () => {
		test("конец a на конце b (L) → depth [1,1], [-1,-1]", () => {
			const r = UE.cross([O, A5], [A5, A5y5up]);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			expect(r[0]).toEqual(A5);
			expect(depthEq(r[1], 1)).toBe(true);
			expect(depthEq(r[2], -1)).toBe(true);
		});

		test("общий начальный конец → depth [-1,-1], [-1,-1]", () => {
			const r = UE.cross([O, A10], [O, A0y10]);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			expect(r[0]).toEqual(O);
			expect(depthEq(r[1], -1)).toBe(true);
			expect(depthEq(r[2], -1)).toBe(true);
		});

		test("точка-ребро: точка на середине → depth_a [0,0], depth_b [0,0]", () => {
			const r = UE.cross([P55, P55], [O, A10y10]);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			expect(r[0]).toEqual(P55);
			expect(depthEq(r[1], 0)).toBe(true);
			expect(depthEq(r[2], 0)).toBe(true);
		});

		test("точка-ребро: точка на конце → depth_a [0,0], depth_b [-1,-1]", () => {
			const r = UE.cross([O, O], [O, A10]);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			expect(r[0]).toEqual(O);
			expect(depthEq(r[1], 0)).toBe(true);
			expect(depthEq(r[2], -1)).toBe(true);
		});
	});

	describe("similar (на одной прямой) → true", () => {
		test("коллинеарное перекрытие → true", () => {
			expect(UE.cross([O, A5], [A3, A10])).toBe(true);
		});

		test("идентичные → true", () => {
			expect(UE.cross([O, A10], [O, A10])).toBe(true);
		});

		test("антипараллельные → true", () => {
			expect(UE.cross([O, A10], [A10, O])).toBe(true);
		});
	});

	describe("parallel (разные прямые) → false", () => {
		test("параллельные → false", () => {
			expect(UE.cross([O, A10], [A5y5, A10y5])).toBe(false);
		});
	});

	describe("мимо (|depth| > 1) — tuple, не false", () => {
		test("мимо по длине a: depth_a [>1, >1]", () => {
			const r = UE.cross([O, A3], [A5neg5, A5y5up]);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			expect(r[0]).toEqual({ x: 5, y: 0 });
			expect(r[1][0]).toBeGreaterThan(1);
			expect(depthEq(r[2], 0)).toBe(true);
		});

		test("мимо по длине b: depth_b [>1, >1]", () => {
			const r = UE.cross(
				[O, A10],
				[
					{ x: 15, y: -5 },
					{ x: 15, y: 5 },
				],
			);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			expect(r[0]).toEqual({ x: 15, y: 0 });
			expect(r[1][0]).toBeGreaterThan(1);
			expect(depthEq(r[2], 0)).toBe(true);
		});
	});

	describe("вырожденные: точка vs точка", () => {
		test("совпадающие → [точка, [0,0], [0,0]]", () => {
			const r = UE.cross([P55, P55], [P55, P55]);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			expect(r[0]).toEqual(P55);
			expect(r[1]).toEqual([0, 0]);
			expect(r[2]).toEqual([0, 0]);
		});

		test("разные → false", () => {
			expect(UE.cross([P55, P55], [A10, A10])).toBe(false);
		});

		test("точка не на прямой отрезка → false (depth[1] = Infinity)", () => {
			expect(
				UE.cross(
					[
						{ x: 7, y: 7 },
						{ x: 7, y: 7 },
					],
					[O, A10],
				),
			).toBe(false);
		});

		test("точка на прямой, но за концом → tuple, depth_b [>1, >1]", () => {
			const r = UE.cross(
				[
					{ x: 20, y: 0 },
					{ x: 20, y: 0 },
				],
				[O, A10],
			);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			expect(r[1]).toEqual([0, 0]);
			expect(r[2][0]).toBeGreaterThan(1);
		});
	});

	describe("симметричность и свойства", () => {
		test("cross(a,b) и cross(b,a): точка та же, depth_a↔depth_b", () => {
			const r1 = UE.cross([O, A10], [A5neg5, A5y5up]);
			const r2 = UE.cross([A5neg5, A5y5up], [O, A10]);
			expect(isTuple(r1)).toBe(true);
			expect(isTuple(r2)).toBe(true);
			if (!isTuple(r1) || !isTuple(r2)) return;
			expect(r1[0]).toEqual(r2[0]);
			expect(r1[1]).toEqual(r2[2]);
			expect(r1[2]).toEqual(r2[1]);
		});

		test("возвращаемая точка корректна: a[0] + (depth[0]+1)/2 * dir", () => {
			const a: CT.Edge = [O, A10];
			const b: CT.Edge = [A5neg5, A5y5up];
			const r = UE.cross(a, b);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			const dir = UC2.direct(a[0], a[1]);
			const t01 = (r[1][0] + 1) / 2;
			const expected: CT.C2 = { x: a[0].x + t01 * dir.x, y: a[0].y + t01 * dir.y };
			expect(UC2.eq(r[0], expected, 1e-9)).toBe(true);
		});

		test("симметричность по типу возврата", () => {
			const pairs: Array<[CT.Edge, CT.Edge]> = [
				[
					[O, A10],
					[A5neg5, A5y5up],
				],
				[
					[O, A3],
					[A5neg5, A5y5up],
				],
				[
					[O, A10],
					[A5y5, A10y5],
				],
				[
					[P55, P55],
					[P55, P55],
				],
				[
					[P55, P55],
					[O, A10y10],
				],
				[
					[O, A5],
					[A3, A10],
				],
			];
			for (const [a, b] of pairs) {
				const r1 = UE.cross(a, b);
				const r2 = UE.cross(b, a);
				expect(typeof r1).toBe(typeof r2);
				expect(Array.isArray(r1)).toBe(Array.isArray(r2));
			}
		});
	});

	describe("EPS-толерантность", () => {
		test("точка в пределах __eps от прямой → tuple, depth_b ≈ [0,0]", () => {
			const r = UE.cross(
				[
					{ x: 5, y: 0.0005 },
					{ x: 5, y: 0.0005 },
				],
				[O, A10],
			);
			expect(isTuple(r)).toBe(true);
			if (!isTuple(r)) return;
			expect(r[1]).toEqual([0, 0]);
			expect(r[2][0]).toBeCloseTo(0, 3);
		});

		test("точка за пределами __eps от прямой → false", () => {
			expect(
				UE.cross(
					[
						{ x: 5, y: 0.002 },
						{ x: 5, y: 0.002 },
					],
					[O, A10],
				),
			).toBe(false);
		});
	});
});

describe("UE.intersect: пересечение контуров отрезков (boolean)", () => {
	const A5neg5 = { x: 5, y: -5 };
	const A5y5up = { x: 5, y: 5 };
	const A3 = { x: 3, y: 0 };

	describe("единственная точка пересечения", () => {
		test("крест → true", () => {
			expect(UE.intersect([O, A10], [A5neg5, A5y5up])).toBe(true);
		});

		test("диагонали (X) → true", () => {
			expect(
				UE.intersect(
					[O, A10y10],
					[
						{ x: 0, y: 10 },
						{ x: 10, y: 0 },
					],
				),
			).toBe(true);
		});

		test("касание концами → true", () => {
			expect(UE.intersect([O, A5], [A5, A5y5up])).toBe(true);
		});

		test("T-образное касание → true", () => {
			expect(UE.intersect([O, A5], [A5neg5, A5y5up])).toBe(true);
		});

		test("мимо по длине → false", () => {
			expect(UE.intersect([O, A3], [A5neg5, A5y5up])).toBe(false);
			expect(
				UE.intersect(
					[O, A10],
					[
						{ x: 15, y: -5 },
						{ x: 15, y: 5 },
					],
				),
			).toBe(false);
		});
	});

	describe("коллинеарное перекрытие (similar)", () => {
		test("частичное перекрытие → true", () => {
			expect(UE.intersect([O, A5], [A3, A10])).toBe(true);
		});

		test("полное вложение → true", () => {
			expect(UE.intersect([O, A10], [A3, A5])).toBe(true);
		});

		test("идентичные → true", () => {
			expect(UE.intersect([O, A10], [O, A10])).toBe(true);
		});

		test("касание концами на одной прямой → true", () => {
			expect(UE.intersect([O, A5], [A5, A10])).toBe(true);
		});

		test("коллинеарны, не перекрываются → false", () => {
			expect(
				UE.intersect(
					[O, A5],
					[
						{ x: 10, y: 0 },
						{ x: 15, y: 0 },
					],
				),
			).toBe(false);
		});
	});

	describe("параллельные", () => {
		test("параллельные на разных прямых → false", () => {
			expect(UE.intersect([O, A10], [A5y5, A10y5])).toBe(false);
		});
	});

	describe("вырожденные (точка)", () => {
		test("точка-точка совпадают → true", () => {
			expect(UE.intersect([P55, P55], [P55, P55])).toBe(true);
		});

		test("точка-точка разные → false", () => {
			expect(UE.intersect([P55, P55], [A10, A10])).toBe(false);
		});

		test("точка на отрезке (строго внутри) → true", () => {
			expect(UE.intersect([P55, P55], [O, A10y10])).toBe(true);
		});

		test("точка на конце отрезка → true", () => {
			expect(UE.intersect([O, O], [O, A10])).toBe(true);
		});

		test("точка за пределами отрезка (на прямой) → false", () => {
			expect(
				UE.intersect(
					[
						{ x: 20, y: 0 },
						{ x: 20, y: 0 },
					],
					[O, A10],
				),
			).toBe(false);
		});

		test("точка не на прямой → false", () => {
			expect(
				UE.intersect(
					[
						{ x: 7, y: 7 },
						{ x: 7, y: 7 },
					],
					[O, A10],
				),
			).toBe(false);
		});
	});

	describe("симметричность", () => {
		test("intersect(a,b) === intersect(b,a)", () => {
			const pairs: Array<[CT.Edge, CT.Edge]> = [
				[
					[O, A10],
					[A5neg5, A5y5up],
				],
				[
					[O, A3],
					[A5neg5, A5y5up],
				],
				[
					[O, A5],
					[A3, A10],
				],
				[
					[P55, P55],
					[P55, P55],
				],
				[
					[P55, P55],
					[O, A10y10],
				],
			];
			for (const [a, b] of pairs) {
				expect(UE.intersect(a, b)).toBe(UE.intersect(b, a));
			}
		});
	});
});
