import { describe, expect, test } from "bun:test";
import { UC2 } from "./coords.js";
import type * as CT from "./types.js";

const PI = Math.PI;

describe("UC2.direct", () => {
	test("вектор направления от a к b: b - a", () => {
		expect(UC2.direct({ x: 0, y: 0 }, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
		expect(UC2.direct({ x: 1, y: 2 }, { x: 4, y: 6 })).toEqual({ x: 3, y: 4 });
	});

	test("нулевое направление для совпадающих точек", () => {
		expect(UC2.direct({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
	});

	test("антикоммутативность: direct(b, a) === -direct(a, b)", () => {
		const a = { x: 1, y: 2 };
		const b = { x: 4, y: 6 };
		expect(UC2.direct(b, a)).toEqual({ x: -3, y: -4 });
	});

	test("round-trip с move: move(a, direct(a, b)) ≈ b", () => {
		const a: CT.C2 = { x: 1, y: 2 };
		const b: CT.C2 = { x: 4, y: 6 };
		const moved = UC2.move(a, UC2.direct(a, b));
		expect(UC2.eq(moved, b)).toBe(true);
	});
});

describe("UC2.move", () => {
	test("смещение точки на вектор: a + vec", () => {
		expect(UC2.move({ x: 0, y: 0 }, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
		expect(UC2.move({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
	});

	test("нулевой вектор не меняет точку", () => {
		expect(UC2.move({ x: 5, y: 7 }, { x: 0, y: 0 })).toEqual({ x: 5, y: 7 });
	});

	test("коммутативность сложения: move(a, v) и move(v-base, a) совпадают при a=(0,0)", () => {
		const v: CT.C2 = { x: 3, y: 4 };
		expect(UC2.move({ x: 0, y: 0 }, v)).toEqual(v);
	});

	test("обратная операция: move(b, invert(direct(a, b))) ≈ a", () => {
		const a: CT.C2 = { x: 2, y: 8 };
		const b: CT.C2 = { x: 9, y: -1 };
		const back = UC2.move(b, UC2.invert(UC2.direct(a, b)));
		expect(UC2.eq(back, a)).toBe(true);
	});
});

describe("UC2.vect: векторное произведение в математической плоскости (Y-вверх)", () => {
	test("CCW (против часовой) от v1 к v2 → положительный", () => {
		expect(UC2.vect({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeGreaterThan(0);
		expect(UC2.vect({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(1, 10);
	});

	test("CW (по часовой) от v1 к v2 → отрицательный", () => {
		expect(UC2.vect({ x: 0, y: 1 }, { x: 1, y: 0 })).toBeLessThan(0);
		expect(UC2.vect({ x: 0, y: 1 }, { x: 1, y: 0 })).toBeCloseTo(-1, 10);
	});

	test("коллинеарные сонаправленные векторы → 0", () => {
		expect(UC2.vect({ x: 1, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(0, 10);
	});

	test("коллинеарные противоположно направленные векторы → 0", () => {
		expect(UC2.vect({ x: 1, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(0, 10);
	});

	test("площадь параллелограмма = |vect(v1, v2)|", () => {
		expect(Math.abs(UC2.vect({ x: 3, y: 0 }, { x: 0, y: 4 }))).toBeCloseTo(12, 10);
	});

	test("CCW для произвольной пары (3,1) → (1,3)", () => {
		const v1: CT.C2 = { x: 3, y: 1 };
		const v2: CT.C2 = { x: 1, y: 3 };
		expect(UC2.vect(v1, v2)).toBeGreaterThan(0);
		expect(UC2.vect(v2, v1)).toBeLessThan(0);
	});
});

describe("UC2.ccw: ориентированная площадь в математической плоскости (Y-вверх)", () => {
	test("CCW (против часовой) треугольник → положительный", () => {
		const a: CT.C2 = { x: 0, y: 0 };
		const b: CT.C2 = { x: 1, y: 0 };
		const c: CT.C2 = { x: 0, y: 1 };
		expect(UC2.ccw(a, b, c)).toBeGreaterThan(0);
		expect(UC2.ccw(a, b, c)).toBeCloseTo(1, 10);
	});

	test("CW (по часовой) треугольник → отрицательный", () => {
		const a: CT.C2 = { x: 0, y: 0 };
		const b: CT.C2 = { x: 0, y: 1 };
		const c: CT.C2 = { x: 1, y: 0 };
		expect(UC2.ccw(a, b, c)).toBeLessThan(0);
		expect(UC2.ccw(a, b, c)).toBeCloseTo(-1, 10);
	});

	test("коллинеарные точки → ≈ 0", () => {
		expect(UC2.ccw({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeCloseTo(0, 10);
	});

	test("масштаб: удвоенная площадь пропорциональна треугольнику", () => {
		const a: CT.C2 = { x: 0, y: 0 };
		const ccw1 = UC2.ccw(a, { x: 2, y: 0 }, { x: 0, y: 2 });
		const ccw2 = UC2.ccw(a, { x: 4, y: 0 }, { x: 0, y: 4 });
		expect(ccw2).toBeCloseTo(ccw1 * 4, 10);
	});

	test("знак инвертируется при перестановке b и c", () => {
		const a: CT.C2 = { x: 0, y: 0 };
		const b: CT.C2 = { x: 1, y: 0 };
		const c: CT.C2 = { x: 0, y: 1 };
		const s1 = UC2.ccw(a, b, c);
		const s2 = UC2.ccw(a, c, b);
		expect(s1).toBeCloseTo(-s2, 10);
	});

	test("канон: ccw(a,b,c) === vect(direct(a,b), direct(a,c))", () => {
		const a: CT.C2 = { x: 1, y: 2 };
		const b: CT.C2 = { x: 4, y: 6 };
		const c: CT.C2 = { x: -2, y: 5 };
		const ab = UC2.direct(a, b);
		const ac = UC2.direct(a, c);
		expect(UC2.ccw(a, b, c)).toBeCloseTo(UC2.vect(ab, ac), 10);
	});

	test("согласованность с vect: CCW даёт тот же знак, что vect(ab, ac)", () => {
		const a: CT.C2 = { x: 0, y: 0 };
		const b: CT.C2 = { x: 3, y: 1 };
		const c: CT.C2 = { x: 1, y: 3 };
		const ab = UC2.direct(a, b);
		const ac = UC2.direct(a, c);
		const signCcw = Math.sign(UC2.ccw(a, b, c));
		const signVect = Math.sign(UC2.vect(ab, ac));
		expect(signCcw).toBe(signVect);
	});
});

describe("UC2.rotate: математический поворот (Y-вверх, angle > 0 = CCW)", () => {
	test("поворот (1,0) на +π/2 вокруг origin → (0,1) (восток → север)", () => {
		expect(UC2.eq(UC2.rotate({ x: 1, y: 0 }, { x: 0, y: 0 }, PI / 2), { x: 0, y: 1 })).toBe(true);
	});

	test("поворот (1,0) на +π вокруг origin → (-1,0)", () => {
		expect(UC2.eq(UC2.rotate({ x: 1, y: 0 }, { x: 0, y: 0 }, PI), { x: -1, y: 0 })).toBe(true);
	});

	test("поворот (1,0) на -π/2 вокруг origin → (0,-1) (восток → юг, CW)", () => {
		expect(UC2.eq(UC2.rotate({ x: 1, y: 0 }, { x: 0, y: 0 }, -PI / 2), { x: 0, y: -1 })).toBe(true);
	});

	test("поворот точки вокруг себя → та же точка", () => {
		const p: CT.C2 = { x: 2, y: 3 };
		expect(UC2.eq(UC2.rotate(p, p, PI / 4), p)).toBe(true);
	});

	test("поворот с ненулевым origin: (2,0) вокруг (1,0) на +π/2 → (1,1)", () => {
		expect(UC2.eq(UC2.rotate({ x: 2, y: 0 }, { x: 1, y: 0 }, PI / 2), { x: 1, y: 1 })).toBe(true);
	});

	test("поворот (1,1) на +π/2 вокруг (0,0) → (-1,1)", () => {
		expect(UC2.eq(UC2.rotate({ x: 1, y: 1 }, { x: 0, y: 0 }, PI / 2), { x: -1, y: 1 })).toBe(true);
	});

	test("поворот на 2π → исходная точка", () => {
		expect(UC2.eq(UC2.rotate({ x: 3, y: 5 }, { x: 1, y: 2 }, 2 * PI), { x: 3, y: 5 })).toBe(true);
	});
});

describe("UC2.unrotate: обратный поворот", () => {
	test("unrotate === rotate(p, origin, -angle)", () => {
		const p: CT.C2 = { x: 3, y: 5 };
		const origin: CT.C2 = { x: 1, y: 2 };
		const angle = 0.7;
		expect(UC2.eq(UC2.unrotate(p, origin, angle), UC2.rotate(p, origin, -angle))).toBe(true);
	});

	test("round-trip: unrotate(rotate(p, origin, θ), origin, θ) ≈ p", () => {
		const p: CT.C2 = { x: 3, y: 5 };
		const origin: CT.C2 = { x: 1, y: 2 };
		const angle = 0.7;
		const rotated = UC2.rotate(p, origin, angle);
		const back = UC2.unrotate(rotated, origin, angle);
		expect(UC2.eq(back, p)).toBe(true);
	});

	test("round-trip для набора углов", () => {
		const p: CT.C2 = { x: -4, y: 9 };
		const origin: CT.C2 = { x: 2, y: -3 };
		for (const angle of [0, PI / 6, PI / 4, PI / 3, PI / 2, PI, -PI / 2, 2.5]) {
			const rotated = UC2.rotate(p, origin, angle);
			const back = UC2.unrotate(rotated, origin, angle);
			expect(UC2.eq(back, p)).toBe(true);
		}
	});

	test("round-trip для набора точек и origins", () => {
		const angle = 1.3;
		const cases: Array<[CT.C2, CT.C2]> = [
			[
				{ x: 0, y: 0 },
				{ x: 0, y: 0 },
			],
			[
				{ x: 5, y: 0 },
				{ x: 0, y: 0 },
			],
			[
				{ x: -3, y: 7 },
				{ x: 2, y: 1 },
			],
			[
				{ x: 100, y: -50 },
				{ x: -20, y: 80 },
			],
		];
		for (const [p, origin] of cases) {
			const back = UC2.unrotate(UC2.rotate(p, origin, angle), origin, angle);
			expect(UC2.eq(back, p)).toBe(true);
		}
	});
});

describe("UC2.angle: направление в математической плоскости (Y-вверх)", () => {
	test("восток (1,0) → 0", () => {
		expect(UC2.angle({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 10);
	});

	test("север (0,1) → +π/2 (CCW от востока)", () => {
		expect(UC2.angle({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(PI / 2, 10);
	});

	test("запад (-1,0) → π", () => {
		expect(UC2.angle({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(PI, 10);
	});

	test("юг (0,-1) → -π/2 (CW от востока)", () => {
		expect(UC2.angle({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(-PI / 2, 10);
	});

	test("северо-восток (1,1) → π/4", () => {
		expect(UC2.angle({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(PI / 4, 10);
	});

	test("диапазон (-π, π]: северо-запад → (π/2, π]", () => {
		const a = UC2.angle({ x: 0, y: 0 }, { x: -1, y: 1 });
		expect(a).toBeGreaterThan(PI / 2);
		expect(a).toBeLessThanOrEqual(PI);
	});

	test("диапазон (-π, π]: юго-запад → (-π, -π/2)", () => {
		const a = UC2.angle({ x: 0, y: 0 }, { x: -1, y: -1 });
		expect(a).toBeLessThan(-PI / 2);
		expect(a).toBeGreaterThan(-PI);
	});

	test("не зависит от длины вектора (только направление)", () => {
		expect(UC2.angle({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(UC2.angle({ x: 0, y: 0 }, { x: 6, y: 8 }), 10);
	});

	test("не зависит от origin (только направление от origin к point)", () => {
		expect(UC2.angle({ x: 1, y: 1 }, { x: 4, y: 5 })).toBeCloseTo(UC2.angle({ x: 0, y: 0 }, { x: 3, y: 4 }), 10);
	});

	test("round-trip с rotate: угол сохраняется при повороте", () => {
		const origin: CT.C2 = { x: 1, y: 2 };
		const p: CT.C2 = { x: 5, y: 7 };
		const theta = 0.6;
		const before = UC2.angle(origin, p);
		const rotated = UC2.rotate(p, origin, theta);
		const after = UC2.angle(origin, rotated);
		let diff = after - before - theta;
		while (diff > PI) diff -= 2 * PI;
		while (diff < -PI) diff += 2 * PI;
		expect(Math.abs(diff)).toBeLessThan(1e-9);
	});
});

describe("UC2.local / UC2.unlocal", () => {
	test("local: p - anchor", () => {
		expect(UC2.local({ x: 1, y: 2 }, { x: 4, y: 6 })).toEqual({ x: 3, y: 4 });
	});

	test("unlocal: p + anchor", () => {
		expect(UC2.unlocal({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
	});

	test("local с anchor = (0,0) → p без изменений", () => {
		expect(UC2.local({ x: 0, y: 0 }, { x: 5, y: 7 })).toEqual({ x: 5, y: 7 });
	});

	test("unlocal с anchor = (0,0) → p без изменений", () => {
		expect(UC2.unlocal({ x: 0, y: 0 }, { x: 5, y: 7 })).toEqual({ x: 5, y: 7 });
	});

	test("round-trip: unlocal(anchor, local(anchor, p)) ≈ p", () => {
		const anchor: CT.C2 = { x: 3, y: -2 };
		const p: CT.C2 = { x: 7, y: 11 };
		const local = UC2.local(anchor, p);
		expect(UC2.eq(UC2.unlocal(anchor, local), p)).toBe(true);
	});

	test("round-trip: local(anchor, unlocal(anchor, p)) ≈ p", () => {
		const anchor: CT.C2 = { x: -4, y: 9 };
		const p: CT.C2 = { x: 2, y: -6 };
		const unlocal = UC2.unlocal(anchor, p);
		expect(UC2.eq(UC2.local(anchor, unlocal), p)).toBe(true);
	});

	test("round-trip для набора anchor/p", () => {
		const cases: Array<[CT.C2, CT.C2]> = [
			[
				{ x: 0, y: 0 },
				{ x: 0, y: 0 },
			],
			[
				{ x: 10, y: 20 },
				{ x: 0, y: 0 },
			],
			[
				{ x: -5, y: 3 },
				{ x: 8, y: -1 },
			],
			[
				{ x: 100, y: 200 },
				{ x: -50, y: -75 },
			],
		];
		for (const [anchor, p] of cases) {
			const local = UC2.local(anchor, p);
			const unlocal = UC2.unlocal(anchor, p);
			expect(UC2.eq(UC2.unlocal(anchor, local), p)).toBe(true);
			expect(UC2.eq(UC2.local(anchor, unlocal), p)).toBe(true);
		}
	});
});

// =============================================================================
// Защита от перепутывания x↔y в UC2: каждая операция проверяется с асимметричными
// точками (например, {3, 7} ≠ {7, 3}), чтобы swap давал другой результат.
// =============================================================================

describe("UC2.vect: защита от перепутывания x↔y", () => {
	test("vect({1, 2}, {3, 4}) = 1*4 - 2*3 = -2", () => {
		expect(UC2.vect({ x: 1, y: 2 }, { x: 3, y: 4 })).toBeCloseTo(-2, 10);
	});

	test("vect({3, 4}, {1, 2}) = 3*2 - 4*1 = 2 (антикоммутативность)", () => {
		expect(UC2.vect({ x: 3, y: 4 }, { x: 1, y: 2 })).toBeCloseTo(2, 10);
	});

	test("vect с асимметричными точками и неравными длинами: vect({5, 3}, {2, 8})", () => {
		// 5*8 - 3*2 = 40 - 6 = 34
		expect(UC2.vect({ x: 5, y: 3 }, { x: 2, y: 8 })).toBeCloseTo(34, 10);
	});

	test("vect({2, 8}, {5, 3}) = 2*3 - 8*5 = -34", () => {
		expect(UC2.vect({ x: 2, y: 8 }, { x: 5, y: 3 })).toBeCloseTo(-34, 10);
	});

	test("vect({0, 0}, точка) = 0", () => {
		expect(UC2.vect({ x: 0, y: 0 }, { x: 5, y: 3 })).toBe(0);
	});

	test("vect на отрицательных координатах: vect({-2, 3}, {4, -1})", () => {
		// -2 * -1 - 3 * 4 = 2 - 12 = -10
		expect(UC2.vect({ x: -2, y: 3 }, { x: 4, y: -1 })).toBeCloseTo(-10, 10);
	});
});

describe("UC2.ccw: защита от перепутывания x↔y", () => {
	test("ccw асимметричный треугольник: ccw({0,0}, {3, 0}, {0, 7})", () => {
		// CCW: положительная площадь
		// area2 = (0*0 - 0*3) + (3*7 - 0*0) + (0*0 - 7*0) = 0 + 21 + 0 = 21
		expect(UC2.ccw({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 7 })).toBeCloseTo(21, 10);
	});

	test("ccw CW для того же треугольника (b↔c): ccw({0,0}, {0, 7}, {3, 0})", () => {
		// -21 (обратный знак)
		expect(UC2.ccw({ x: 0, y: 0 }, { x: 0, y: 7 }, { x: 3, y: 0 })).toBeCloseTo(-21, 10);
	});

	test("ccw({2, 3}, {5, 0}, {1, 8}) = 2*0-3*5 + 5*8-0*1 + 1*3-8*2 = -15+40-13 = 12", () => {
		expect(UC2.ccw({ x: 2, y: 3 }, { x: 5, y: 0 }, { x: 1, y: 8 })).toBeCloseTo(12, 10);
	});

	test("ccw коллинеарные точки: ccw({0, 0}, {3, 0}, {6, 0}) = 0", () => {
		expect(UC2.ccw({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 })).toBeCloseTo(0, 10);
	});

	test("ccw коллинеарные по диагонали: ccw({0, 0}, {2, 3}, {4, 6}) = 0", () => {
		expect(UC2.ccw({ x: 0, y: 0 }, { x: 2, y: 3 }, { x: 4, y: 6 })).toBeCloseTo(0, 10);
	});
});

describe("UC2.rotate: защита от перепутывания x↔y (асимметричные точки)", () => {
	test("rotate({3, 7}, {0, 0}, PI/2) = {-7, 3} (Y-вверх CCW)", () => {
		// dx=3, dy=7; x' = 0 + 3*cos(π/2) - 7*sin(π/2) = 0 - 7 = -7
		// y' = 0 + 3*sin(π/2) + 7*cos(π/2) = 3 + 0 = 3
		expect(UC2.eq(UC2.rotate({ x: 3, y: 7 }, { x: 0, y: 0 }, Math.PI / 2), { x: -7, y: 3 })).toBe(true);
	});

	test("rotate({3, 7}, {0, 0}, -PI/2) = {7, -3} (CW)", () => {
		expect(UC2.eq(UC2.rotate({ x: 3, y: 7 }, { x: 0, y: 0 }, -Math.PI / 2), { x: 7, y: -3 })).toBe(true);
	});

	test("rotate({5, -2}, {1, 3}, PI/4) сохраняет расстояние до origin", () => {
		// |p - origin| = |{4, -5}| = √(16+25) = √41
		const p: CT.C2 = { x: 5, y: -2 };
		const origin: CT.C2 = { x: 1, y: 3 };
		const rotated = UC2.rotate(p, origin, Math.PI / 4);
		const dist_before = Math.hypot(p.x - origin.x, p.y - origin.y);
		const dist_after = Math.hypot(rotated.x - origin.x, rotated.y - origin.y);
		expect(dist_after).toBeCloseTo(dist_before, 10);
	});

	test("rotate({3, 7}, {0, 0}, PI) = {-3, -7} (180°)", () => {
		expect(UC2.eq(UC2.rotate({ x: 3, y: 7 }, { x: 0, y: 0 }, Math.PI), { x: -3, y: -7 })).toBe(true);
	});
});

describe("UC2.unrotate: защита от перепутывания x↔y (round-trip асимметрия)", () => {
	test("round-trip: unrotate(rotate({5, -3}, {2, 4}, 1.2)) ≈ {5, -3}", () => {
		const p: CT.C2 = { x: 5, y: -3 };
		const origin: CT.C2 = { x: 2, y: 4 };
		const angle = 1.2;
		const rotated = UC2.rotate(p, origin, angle);
		const back = UC2.unrotate(rotated, origin, angle);
		expect(UC2.eq(back, p)).toBe(true);
	});

	test("round-trip для набора асимметричных точек и углов", () => {
		const cases: Array<[CT.C2, CT.C2, number]> = [
			[{ x: 5, y: -3 }, { x: 2, y: 4 }, 1.2],
			[{ x: -7, y: 11 }, { x: 0, y: 0 }, -0.8],
			[{ x: 100, y: -50 }, { x: 25, y: 75 }, Math.PI / 3],
			[{ x: 1, y: 2 }, { x: 0, y: 0 }, Math.PI / 6],
		];
		for (const [p, origin, angle] of cases) {
			const back = UC2.unrotate(UC2.rotate(p, origin, angle), origin, angle);
			expect(UC2.eq(back, p)).toBe(true);
		}
	});
});

describe("UC2.angle: защита от перепутывания x↔y (асимметрия)", () => {
	test("angle({0,0}, {3, 4}) ≠ angle({0,0}, {4, 3})", () => {
		// atan2(4, 3) ≈ 0.9273; atan2(3, 4) ≈ 0.6435
		const a1 = UC2.angle({ x: 0, y: 0 }, { x: 3, y: 4 });
		const a2 = UC2.angle({ x: 0, y: 0 }, { x: 4, y: 3 });
		expect(a1).not.toBeCloseTo(a2, 5);
	});

	test("angle({0,0}, {3, 4}) ≈ atan2(4, 3)", () => {
		expect(UC2.angle({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(Math.atan2(4, 3), 10);
	});

	test("angle({0,0}, {4, 3}) ≈ atan2(3, 4)", () => {
		expect(UC2.angle({ x: 0, y: 0 }, { x: 4, y: 3 })).toBeCloseTo(Math.atan2(3, 4), 10);
	});

	test("angle с отрицательными: angle({0,0}, {-3, -4}) ≈ atan2(-4, -3) = -π + atan2(4, 3)", () => {
		// atan2(-4, -3) ≈ -π + atan2(4, 3) ≈ -2.2143
		const expected = Math.atan2(-4, -3);
		expect(UC2.angle({ x: 0, y: 0 }, { x: -3, y: -4 })).toBeCloseTo(expected, 10);
	});

	test("angle с anchor: angle({2, 3}, {5, 7}) ≈ atan2(7-3, 5-2) = atan2(4, 3)", () => {
		expect(UC2.angle({ x: 2, y: 3 }, { x: 5, y: 7 })).toBeCloseTo(Math.atan2(4, 3), 10);
	});
});

describe("UC2.direct: защита от перепутывания x↔y", () => {
	test("direct({2, 3}, {5, 7}) = {3, 4} (x и y разные)", () => {
		expect(UC2.direct({ x: 2, y: 3 }, { x: 5, y: 7 })).toEqual({ x: 3, y: 4 });
	});

	test("direct с отрицательными: direct({-5, -10}, {-2, 3}) = {3, 13}", () => {
		expect(UC2.direct({ x: -5, y: -10 }, { x: -2, y: 3 })).toEqual({ x: 3, y: 13 });
	});

	test("direct({7, 11}, {2, 3}) = {-5, -8} (обратное направление)", () => {
		expect(UC2.direct({ x: 7, y: 11 }, { x: 2, y: 3 })).toEqual({ x: -5, y: -8 });
	});
});

describe("UC2.move: защита от перепутывания x↔y", () => {
	test("move({2, 3}, {5, 7}) = {7, 10}", () => {
		expect(UC2.move({ x: 2, y: 3 }, { x: 5, y: 7 })).toEqual({ x: 7, y: 10 });
	});

	test("move с отрицательными: move({-2, 3}, {-5, 7}) = {-7, 10}", () => {
		expect(UC2.move({ x: -2, y: 3 }, { x: -5, y: 7 })).toEqual({ x: -7, y: 10 });
	});

	test("move({0, 0}, {x, y}) = {x, y}", () => {
		expect(UC2.move({ x: 0, y: 0 }, { x: 5, y: 7 })).toEqual({ x: 5, y: 7 });
	});
});

describe("UC2.local/unlocal: защита от перепутывания x↔y", () => {
	test("local({2, 3}, {5, 7}) = {3, 4}", () => {
		expect(UC2.local({ x: 2, y: 3 }, { x: 5, y: 7 })).toEqual({ x: 3, y: 4 });
	});

	test("unlocal({2, 3}, {5, 7}) = {7, 10}", () => {
		expect(UC2.unlocal({ x: 2, y: 3 }, { x: 5, y: 7 })).toEqual({ x: 7, y: 10 });
	});

	test("local с отрицательными: local({-2, 3}, {-5, 7}) = {-3, 4}", () => {
		expect(UC2.local({ x: -2, y: 3 }, { x: -5, y: 7 })).toEqual({ x: -3, y: 4 });
	});

	test("unlocal с отрицательными: unlocal({-2, 3}, {-5, 7}) = {-7, 10}", () => {
		expect(UC2.unlocal({ x: -2, y: 3 }, { x: -5, y: 7 })).toEqual({ x: -7, y: 10 });
	});
});

describe("UC2.sum/sub/mid: защита от перепутывания x↔y (асимметричные)", () => {
	test("sum({1, 2}, {3, 4}, {5, 6}) = {9, 12}", () => {
		expect(UC2.sum({ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 })).toEqual({ x: 9, y: 12 });
	});

	test("sum с одним аргументом", () => {
		expect(UC2.sum({ x: 5, y: 7 })).toEqual({ x: 5, y: 7 });
	});

	test("sub({10, 20}, {3, 4}, {2, 1}) = {5, 15}", () => {
		expect(UC2.sub({ x: 10, y: 20 }, { x: 3, y: 4 }, { x: 2, y: 1 })).toEqual({ x: 5, y: 15 });
	});

	test("mid({0, 0}, {10, 20}, {30, 40}) = {(0+10+30)/3, (0+20+40)/3}", () => {
		expect(UC2.mid({ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30, y: 40 })).toEqual({ x: 40 / 3, y: 60 / 3 });
	});
});

describe("UC2.abs/mult/div: защита от перепутывания x↔y", () => {
	test("abs({-3, 5}) = {3, 5}", () => {
		expect(UC2.abs({ x: -3, y: 5 })).toEqual({ x: 3, y: 5 });
	});

	test("abs({-2, -7}) = {2, 7}", () => {
		expect(UC2.abs({ x: -2, y: -7 })).toEqual({ x: 2, y: 7 });
	});

	test("mult({3, 5}, 2) = {6, 10}", () => {
		expect(UC2.mult({ x: 3, y: 5 }, 2)).toEqual({ x: 6, y: 10 });
	});

	test("mult({-2, 4}, 3) = {-6, 12}", () => {
		expect(UC2.mult({ x: -2, y: 4 }, 3)).toEqual({ x: -6, y: 12 });
	});

	test("div({10, 20}, 2) = {5, 10}", () => {
		expect(UC2.div({ x: 10, y: 20 }, 2)).toEqual({ x: 5, y: 10 });
	});

	test("div({-12, 8}, 4) = {-3, 2}", () => {
		expect(UC2.div({ x: -12, y: 8 }, 4)).toEqual({ x: -3, y: 2 });
	});
});

describe("UC2.invert/perpend/normal: защита от перепутывания x↔y", () => {
	test("invert({3, 5}) = {-3, -5}", () => {
		expect(UC2.invert({ x: 3, y: 5 })).toEqual({ x: -3, y: -5 });
	});

	test("invert({-2, 7}) = {2, -7}", () => {
		expect(UC2.invert({ x: -2, y: 7 })).toEqual({ x: 2, y: -7 });
	});

	test("perpend({3, 5}) = {-5, 3} (поворот на 90° CCW: (-y, x))", () => {
		expect(UC2.perpend({ x: 3, y: 5 })).toEqual({ x: -5, y: 3 });
	});

	test("perpend({-2, 4}) = {-4, -2}", () => {
		expect(UC2.perpend({ x: -2, y: 4 })).toEqual({ x: -4, y: -2 });
	});

	test("perpend({a, b}) ⊥ perpend: dot product = 0", () => {
		const v: CT.C2 = { x: 3, y: 5 };
		const p = UC2.perpend(v);
		const dot = v.x * p.x + v.y * p.y;
		expect(dot).toBeCloseTo(0, 10);
	});

	test("normal({3, 4}) — единичная нормаль: {-4/5, 3/5}", () => {
		const n = UC2.normal({ x: 3, y: 4 });
		expect(n.x).toBeCloseTo(-4 / 5, 10);
		expect(n.y).toBeCloseTo(3 / 5, 10);
		// |n| = 1
		expect(Math.hypot(n.x, n.y)).toBeCloseTo(1, 10);
	});

	test("normal({0, 0}) → {0, 0} (нулевой вектор)", () => {
		expect(UC2.normal({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
	});

	test("normal({-2, 3}) — единичная нормаль: {-3/√13, -2/√13}", () => {
		const n = UC2.normal({ x: -2, y: 3 });
		const len = Math.hypot(-2, 3);
		expect(n.x).toBeCloseTo(-3 / len, 10);
		expect(n.y).toBeCloseTo(-2 / len, 10);
	});
});

describe("UC2.len/dist: защита от перепутывания x↔y", () => {
	test("len({3, 4}) = 5", () => {
		expect(UC2.len({ x: 3, y: 4 })).toBeCloseTo(5, 10);
	});

	test("len({5, 12}) = 13", () => {
		expect(UC2.len({ x: 5, y: 12 })).toBeCloseTo(13, 10);
	});

	test("len({-3, 4}) = 5 (длина не зависит от знака)", () => {
		expect(UC2.len({ x: -3, y: 4 })).toBeCloseTo(5, 10);
	});

	test("len({0, 0}) = 0", () => {
		expect(UC2.len({ x: 0, y: 0 })).toBe(0);
	});

	test("dist({1, 2}, {4, 6}) = 5", () => {
		expect(UC2.dist({ x: 1, y: 2 }, { x: 4, y: 6 })).toBeCloseTo(5, 10);
	});

	test("dist({-2, 3}, {4, -1}) = √(36+16) = √52", () => {
		expect(UC2.dist({ x: -2, y: 3 }, { x: 4, y: -1 })).toBeCloseTo(Math.sqrt(52), 10);
	});
});

describe("UC2.lerp: защита от перепутывания x↔y", () => {
	test("lerp({0, 0}, {10, 20}, 0.3) = {3, 6}", () => {
		expect(UC2.lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.3)).toEqual({ x: 3, y: 6 });
	});

	test("lerp({-5, 3}, {5, 7}, 0.5) = {0, 5}", () => {
		expect(UC2.lerp({ x: -5, y: 3 }, { x: 5, y: 7 }, 0.5)).toEqual({ x: 0, y: 5 });
	});

	test("lerp экстраполяция: lerp({0, 0}, {10, 20}, 1.5) = {15, 30}", () => {
		expect(UC2.lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 1.5)).toEqual({ x: 15, y: 30 });
	});
});
