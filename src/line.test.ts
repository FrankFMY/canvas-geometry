import { describe, expect, test } from "bun:test";
import { UE } from "./edge.js";
import { UL } from "./line.js";
import type * as CT from "./types.js";

const seg = (ax: number, ay: number, bx: number, by: number): CT.Line => ({
	type: "line",
	points: [
		{ x: ax, y: ay },
		{ x: bx, y: by },
	],
});
const ray = (ax: number, ay: number, bx: number, by: number): CT.Line => ({
	type: "line",
	points: [
		{ x: ax, y: ay },
		{ x: bx, y: by },
	],
	mode: "ray",
});
const inf = (ax: number, ay: number, bx: number, by: number): CT.Line => ({
	type: "line",
	points: [
		{ x: ax, y: ay },
		{ x: bx, y: by },
	],
	mode: "infinity",
});

describe("UL.cross: алиас к UE.cross", () => {
	test("крест → [точка, depth_a, depth_b]", () => {
		const r = UL.cross(seg(0, 0, 10, 0), seg(5, -5, 5, 5));
		expect(Array.isArray(r)).toBe(true);
		if (!Array.isArray(r)) throw new Error("expected an intersection tuple");
		expect(r[0]).toEqual({ x: 5, y: 0 });
	});

	test("совпадает с UE.cross для тех же points", () => {
		const a = seg(0, 0, 10, 0);
		const b = seg(5, -5, 5, 5);
		expect(UL.cross(a, b)).toEqual(UE.cross(a.points, b.points));
	});

	test("коллинеарные → true", () => {
		expect(UL.cross(seg(0, 0, 10, 0), seg(0, 5, 10, 5))).toBe(false);
		expect(UL.cross(seg(0, 0, 10, 0), seg(2, 0, 8, 0))).toBe(true);
	});
});

describe("UL.shallow: принадлежность глубины линии (mode-aware)", () => {
	test("segment: |depth| ≤ 1 → true", () => {
		expect(UL.shallow(seg(0, 0, 10, 0), [0, 0])).toBe(true);
		expect(UL.shallow(seg(0, 0, 10, 0), [0.5, 0.5])).toBe(true);
		expect(UL.shallow(seg(0, 0, 10, 0), [1, 1])).toBe(true);
		expect(UL.shallow(seg(0, 0, 10, 0), [-1, -1])).toBe(true);
	});

	test("segment: |depth| > 1 → false", () => {
		expect(UL.shallow(seg(0, 0, 10, 0), [1.5, 0])).toBe(false);
		expect(UL.shallow(seg(0, 0, 10, 0), [0, 1.5])).toBe(false);
	});

	test("segment: Infinity → false", () => {
		expect(UL.shallow(seg(0, 0, 10, 0), [0, Infinity])).toBe(false);
	});

	test("ray: depth ≥ -1 → true (включая начало)", () => {
		expect(UL.shallow(ray(0, 0, 10, 0), [-1, -1])).toBe(true);
		expect(UL.shallow(ray(0, 0, 10, 0), [0, 0])).toBe(true);
		expect(UL.shallow(ray(0, 0, 10, 0), [1, 1])).toBe(true);
		expect(UL.shallow(ray(0, 0, 10, 0), [2, 2])).toBe(true);
	});

	test("ray: depth < -1 → false", () => {
		expect(UL.shallow(ray(0, 0, 10, 0), [-1.5, -1.5])).toBe(false);
	});

	test("ray: Infinity → false", () => {
		expect(UL.shallow(ray(0, 0, 10, 0), [0, Infinity])).toBe(false);
	});

	test("infinity: любое finite depth → true", () => {
		expect(UL.shallow(inf(0, 0, 10, 0), [0, 0])).toBe(true);
		expect(UL.shallow(inf(0, 0, 10, 0), [5, 5])).toBe(true);
		expect(UL.shallow(inf(0, 0, 10, 0), [-3, -3])).toBe(true);
	});

	test("infinity: Infinity → false (не на прямой)", () => {
		expect(UL.shallow(inf(0, 0, 10, 0), [0, Infinity])).toBe(false);
	});
});

describe("UL.joint: единственная точка пересечения (C2 | null)", () => {
	describe("segment vs segment", () => {
		test("крест → точка", () => {
			expect(UL.joint(seg(0, 0, 10, 0), seg(5, -5, 5, 5))).toEqual({ x: 5, y: 0 });
		});

		test("диагонали (X) → точка", () => {
			expect(UL.joint(seg(0, 0, 10, 10), seg(0, 10, 10, 0))).toEqual({ x: 5, y: 5 });
		});

		test("касание концами → точка", () => {
			expect(UL.joint(seg(0, 0, 5, 0), seg(5, 0, 5, 5))).toEqual({ x: 5, y: 0 });
		});

		test("общий начальный конец → точка", () => {
			expect(UL.joint(seg(0, 0, 10, 0), seg(0, 0, 0, 10))).toEqual({ x: 0, y: 0 });
		});

		test("T-образное касание → точка", () => {
			expect(UL.joint(seg(0, 0, 5, 0), seg(5, -5, 5, 5))).toEqual({ x: 5, y: 0 });
		});

		test("мимо по длине → null", () => {
			expect(UL.joint(seg(0, 0, 3, 0), seg(5, -5, 5, 5))).toBeNull();
			expect(UL.joint(seg(0, 0, 10, 0), seg(15, -5, 15, 5))).toBeNull();
		});

		test("параллельные → null", () => {
			expect(UL.joint(seg(0, 0, 10, 0), seg(0, 5, 10, 5))).toBeNull();
		});

		test("коллинеарное перекрытие → null (нет единственной точки)", () => {
			expect(UL.joint(seg(0, 0, 5, 0), seg(3, 0, 10, 0))).toBeNull();
		});

		test("идентичные → null", () => {
			expect(UL.joint(seg(0, 0, 10, 0), seg(0, 0, 10, 0))).toBeNull();
		});

		test("симметричность", () => {
			const a = seg(0, 0, 10, 0);
			const b = seg(5, -5, 5, 5);
			expect(UL.joint(a, b)).toEqual(UL.joint(b, a));
		});
	});

	describe("ray vs segment", () => {
		test("луч пересекает отрезок → точка", () => {
			expect(UL.joint(ray(0, 0, 10, 0), seg(5, -5, 5, 5))).toEqual({ x: 5, y: 0 });
		});

		test("луч назад достигает отрезок → точка", () => {
			expect(UL.joint(ray(10, 0, 0, 0), seg(5, -5, 5, 5))).toEqual({ x: 5, y: 0 });
		});

		test("луч в противоположную сторону → null", () => {
			expect(UL.joint(ray(0, 0, -10, 0), seg(5, -5, 5, 5))).toBeNull();
		});

		test("пересечение за началом луча → null", () => {
			expect(UL.joint(ray(10, 0, 20, 0), seg(5, -5, 5, 5))).toBeNull();
		});

		test("начало луча на отрезке → точка", () => {
			expect(UL.joint(ray(5, 0, 10, 0), seg(5, -5, 5, 5))).toEqual({ x: 5, y: 0 });
		});
	});

	describe("infinity vs segment", () => {
		test("прямая пересекает отрезок → точка", () => {
			expect(UL.joint(inf(0, 0, 10, 0), seg(5, -5, 5, 5))).toEqual({ x: 5, y: 0 });
		});

		test("прямая пересекает отрезок за пределами представителя прямой → точка (прямая бесконечна)", () => {
			expect(UL.joint(inf(0, 0, 10, 0), seg(15, -5, 15, 5))).toEqual({ x: 15, y: 0 });
		});

		test("коллинеарны → null", () => {
			expect(UL.joint(inf(0, 0, 10, 0), seg(3, 0, 7, 0))).toBeNull();
		});
	});

	describe("infinity vs infinity", () => {
		test("крест → точка", () => {
			expect(UL.joint(inf(0, 0, 10, 0), inf(5, -5, 5, 5))).toEqual({ x: 5, y: 0 });
		});

		test("за пределами представителей → точка", () => {
			expect(UL.joint(inf(0, 0, 1, 0), inf(100, -1, 100, 1))).toEqual({ x: 100, y: 0 });
		});

		test("параллельные → null", () => {
			expect(UL.joint(inf(0, 0, 10, 0), inf(0, 5, 10, 5))).toBeNull();
		});
	});

	describe("ray vs ray", () => {
		test("навстречу под углом → точка", () => {
			expect(UL.joint(ray(0, 0, 10, 10), ray(10, 0, 0, 10))).toEqual({ x: 5, y: 5 });
		});

		test("коллинеарны → null", () => {
			expect(UL.joint(ray(0, 0, 10, 0), ray(5, 0, 15, 0))).toBeNull();
		});

		test("крестом → точка", () => {
			expect(UL.joint(ray(0, 0, 10, 0), ray(5, 0, 5, 10))).toEqual({ x: 5, y: 0 });
		});
	});

	describe("вырожденные (точка = пустая линия)", () => {
		test("точка на середине отрезка → точка", () => {
			expect(UL.joint(seg(5, 5, 5, 5), seg(0, 0, 10, 10))).toEqual({ x: 5, y: 5 });
		});

		test("точка на конце отрезка → точка", () => {
			expect(UL.joint(seg(0, 0, 0, 0), seg(0, 0, 10, 0))).toEqual({ x: 0, y: 0 });
		});

		test("точка за пределами отрезка → null", () => {
			expect(UL.joint(seg(20, 0, 20, 0), seg(0, 0, 10, 0))).toBeNull();
		});

		test("точка не на прямой → null", () => {
			expect(UL.joint(seg(7, 7, 7, 7), seg(0, 0, 10, 0))).toBeNull();
		});

		test("точка-точка совпадают → точка", () => {
			expect(UL.joint(seg(5, 5, 5, 5), seg(5, 5, 5, 5))).toEqual({ x: 5, y: 5 });
		});

		test("точка-точка разные → null", () => {
			expect(UL.joint(seg(5, 5, 5, 5), seg(6, 6, 6, 6))).toBeNull();
		});

		test("точка на луче → точка", () => {
			expect(UL.joint(seg(5, 0, 5, 0), ray(0, 0, 10, 0))).toEqual({ x: 5, y: 0 });
		});

		test("точка за началом луча → null", () => {
			expect(UL.joint(seg(-5, 0, -5, 0), ray(0, 0, 10, 0))).toBeNull();
		});

		test("точка на бесконечной прямой → точка", () => {
			expect(UL.joint(seg(100, 0, 100, 0), inf(0, 0, 10, 0))).toEqual({ x: 100, y: 0 });
		});
	});
});

describe("UL.intersect: пересечение контуров (boolean)", () => {
	describe("базовые: совпадает с joint для единственной точки", () => {
		test("крест → true", () => {
			expect(UL.intersect(seg(0, 0, 10, 0), seg(5, -5, 5, 5))).toBe(true);
		});

		test("касание концами → true", () => {
			expect(UL.intersect(seg(0, 0, 5, 0), seg(5, 0, 5, 5))).toBe(true);
		});

		test("мимо → false", () => {
			expect(UL.intersect(seg(0, 0, 3, 0), seg(5, -5, 5, 5))).toBe(false);
		});

		test("параллельные → false", () => {
			expect(UL.intersect(seg(0, 0, 10, 0), seg(0, 5, 10, 5))).toBe(false);
		});
	});

	describe("коллинеарное перекрытие → true (контур включает перекрытие)", () => {
		test("частичное перекрытие → true", () => {
			expect(UL.intersect(seg(0, 0, 5, 0), seg(3, 0, 10, 0))).toBe(true);
		});

		test("полное вложение → true", () => {
			expect(UL.intersect(seg(0, 0, 10, 0), seg(2, 0, 8, 0))).toBe(true);
		});

		test("идентичные → true", () => {
			expect(UL.intersect(seg(0, 0, 10, 0), seg(0, 0, 10, 0))).toBe(true);
		});

		test("касание концами на одной прямой → true", () => {
			expect(UL.intersect(seg(0, 0, 5, 0), seg(5, 0, 10, 0))).toBe(true);
		});

		test("коллинеарны, не перекрываются → false", () => {
			expect(UL.intersect(seg(0, 0, 5, 0), seg(10, 0, 15, 0))).toBe(false);
		});
	});

	describe("mode: ray и infinity", () => {
		test("ray коллинеарен segment, перекрытие → true", () => {
			expect(UL.intersect(ray(0, 0, 10, 0), seg(5, 0, 15, 0))).toBe(true);
		});

		test("ray коллинеарен segment, нет перекрытия → false", () => {
			expect(UL.intersect(ray(0, 0, -10, 0), seg(5, 0, 15, 0))).toBe(false);
		});

		test("infinity коллинеарна segment, перекрытие → true", () => {
			expect(UL.intersect(inf(0, 0, 10, 0), seg(5, 0, 15, 0))).toBe(true);
		});

		test("infinity коллинеарна segment, нет перекрытия → false", () => {
			expect(UL.intersect(inf(0, 0, 10, 0), seg(50, 5, 60, 5))).toBe(false);
		});

		test("infinity пересекает segment → true", () => {
			expect(UL.intersect(inf(0, 0, 10, 0), seg(15, -5, 15, 5))).toBe(true);
		});

		test("infinity vs infinity крест → true", () => {
			expect(UL.intersect(inf(0, 0, 10, 0), inf(5, -5, 5, 5))).toBe(true);
		});
	});

	describe("вырожденные (точка)", () => {
		test("точка на отрезке → true", () => {
			expect(UL.intersect(seg(5, 5, 5, 5), seg(0, 0, 10, 10))).toBe(true);
		});

		test("точка на конце отрезка → true", () => {
			expect(UL.intersect(seg(0, 0, 0, 0), seg(0, 0, 10, 0))).toBe(true);
		});

		test("точка за пределами → false", () => {
			expect(UL.intersect(seg(20, 0, 20, 0), seg(0, 0, 10, 0))).toBe(false);
		});

		test("точка-точка совпадают → true", () => {
			expect(UL.intersect(seg(5, 5, 5, 5), seg(5, 5, 5, 5))).toBe(true);
		});

		test("точка-точка разные → false", () => {
			expect(UL.intersect(seg(5, 5, 5, 5), seg(6, 6, 6, 6))).toBe(false);
		});

		test("точка коллинеарна отрезку, на конце → true", () => {
			expect(UL.intersect(seg(10, 0, 10, 0), seg(0, 0, 10, 0))).toBe(true);
		});
	});

	describe("симметричность", () => {
		test("intersect(a,b) === intersect(b,a)", () => {
			const pairs: Array<[CT.Line, CT.Line]> = [
				[seg(0, 0, 10, 0), seg(5, -5, 5, 5)],
				[seg(0, 0, 3, 0), seg(5, -5, 5, 5)],
				[seg(0, 0, 5, 0), seg(3, 0, 10, 0)],
				[ray(0, 0, 10, 0), inf(5, -5, 5, 5)],
				[seg(5, 5, 5, 5), seg(0, 0, 10, 10)],
			];
			for (const [a, b] of pairs) {
				expect(UL.intersect(a, b)).toBe(UL.intersect(b, a));
			}
		});
	});

	describe("регрессия: коллинеарные ray/infinity (mode-aware intersect)", () => {
		test("infinity коллинеарна segment, отрезок за пределами представителя → true", () => {
			expect(UL.intersect(inf(0, 0, 3, 0), seg(5, 0, 10, 0))).toBe(true);
		});
		test("infinity коллинеарна segment, отрезок не на прямой → false", () => {
			expect(UL.intersect(inf(0, 0, 10, 0), seg(50, 5, 60, 5))).toBe(false);
		});
		test("ray коллинеарен segment, луч покрывает отрезок → true", () => {
			expect(UL.intersect(ray(0, 0, -3, 0), seg(-5, 0, -10, 0))).toBe(true);
		});
		test("ray коллинеарен segment, отрезок в противоположную сторону от луча → false", () => {
			expect(UL.intersect(ray(0, 0, 10, 0), seg(-5, 0, -10, 0))).toBe(false);
		});
	});
});

describe("UL.equiv: mode-aware равенство", () => {
	test("segment: eq без учёта mode → близкие концы в пределах EPS → true", () => {
		expect(UL.equiv(seg(0, 0, 10, 0), seg(0, 0, 10, 0))).toBe(true);
		expect(UL.equiv(seg(0, 0, 10, 0), seg(0.0005, 0, 10.0005, 0))).toBe(true);
	});
	test("infinity: коллинеарны через __vect_eps, разница концов > __eps (1e-3) → true", () => {
		expect(UL.equiv(inf(0, 0, 10, 0), inf(0, 0.01, 5, 0.01))).toBe(true);
	});
	test("infinity: не коллинеарны → false", () => {
		expect(UL.equiv(inf(0, 0, 10, 0), inf(0, 5, 10, 0))).toBe(false);
	});
	test("ray: одинаковый старт + similar → true", () => {
		expect(UL.equiv(ray(0, 0, 10, 0), ray(0, 0, 5, 0))).toBe(true);
	});
	test("ray: разный старт → false", () => {
		expect(UL.equiv(ray(0, 0, 10, 0), ray(1, 0, 5, 0))).toBe(false);
	});
	test("разный mode → false", () => {
		expect(UL.equiv(seg(0, 0, 10, 0), ray(0, 0, 10, 0))).toBe(false);
		expect(UL.equiv(inf(0, 0, 10, 0), seg(0, 0, 10, 0))).toBe(false);
	});
});
