import { describe, expect, test } from "bun:test";
import { UB } from "./bounds.js";
import { Convex } from "./convex.js";
import { UC2 } from "./coords.js";
import type * as CT from "./types.js";

const b = (minX: number, minY: number, maxX: number, maxY: number): CT.Bounds => ({ minX, minY, maxX, maxY });

const SQ2 = Math.SQRT2;

const area2 = (g: CT.C2[]): number => {
	let s = 0;
	for (let i = 0; i < g.length; i++) s += UC2.vect(g[i], g[(i + 1) % g.length]);
	return s;
};

const movePoly = (g: CT.Convex, v: CT.C2): CT.Convex => g.map((p) => UC2.move(p, v));

describe("Convex.create", () => {
	test("Три точки, где одна дубликат → капсула (как для 2 точек)", () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
		];

		const result = Convex.create(points, 10);

		expect(result).toEqual([
			{ x: -10, y: 0 },
			{ x: 0, y: -10 },
			{ x: 100, y: -10 },
			{ x: 110, y: 0 },
			{ x: 100, y: 10 },
			{ x: 0, y: 10 },
			{ x: -10, y: 0 },
		]);
	});

	test("Простая прямая линия из двух точек → капсула", () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
		];

		const result = Convex.create(points, 10);

		expect(result).toEqual([
			{ x: -10, y: 0 },
			{ x: 0, y: -10 },
			{ x: 100, y: -10 },
			{ x: 110, y: 0 },
			{ x: 100, y: 10 },
			{ x: 0, y: 10 },
			{ x: -10, y: 0 },
		]);
	});

	test("Вертикальная линия → капсула", () => {
		const points = [
			{ x: 50, y: 0 },
			{ x: 50, y: 100 },
		];

		const result = Convex.create(points, 10);

		expect(result).toEqual([
			{ x: 50, y: -10 },
			{ x: 60, y: 0 },
			{ x: 60, y: 100 },
			{ x: 50, y: 110 },
			{ x: 40, y: 100 },
			{ x: 40, y: 0 },
			{ x: 50, y: -10 },
		]);
	});

	test("Диагональная линия под 45° → капсула", () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 100, y: 100 },
		];

		const result = Convex.create(points, 10);
		expect(result.length).toBe(7);
		expect(result[6]).toEqual(result[0]);

		const r = 10 / SQ2;
		expect(UC2.eq(result[0], { x: -r, y: -r }, 0.005)).toBe(true);
		expect(UC2.eq(result[1], { x: r, y: -r }, 0.005)).toBe(true);
		expect(UC2.eq(result[2], { x: 100 + r, y: 100 - r }, 0.005)).toBe(true);
		expect(UC2.eq(result[3], { x: 100 + r, y: 100 + r }, 0.005)).toBe(true);
		expect(UC2.eq(result[4], { x: 100 - r, y: 100 + r }, 0.005)).toBe(true);
		expect(UC2.eq(result[5], { x: -r, y: r }, 0.005)).toBe(true);
	});

	test("Все точки на одной прямой → капсула (как для крайних)", () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 50, y: 0 },
			{ x: 100, y: 0 },
		];

		const result = Convex.create(points, 10);

		expect(result).toEqual([
			{ x: -10, y: 0 },
			{ x: 0, y: -10 },
			{ x: 100, y: -10 },
			{ x: 110, y: 0 },
			{ x: 100, y: 10 },
			{ x: 0, y: 10 },
			{ x: -10, y: 0 },
		]);
	});

	test("Сложная ломаная → выпуклая оболочка + offset", () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 8, y: 16 },
			{ x: 17, y: -6 },
			{ x: 28, y: 10 },
			{ x: 8, y: 4 },
		];

		const result = Convex.create(points, 10);
		expect(result.length).toBeGreaterThanOrEqual(3);
		expect(area2(result)).toBeGreaterThan(0);

		for (const p of points) {
			expect(Convex.at(result, p)).toBe(true);
		}
	});

	test("Сложная ломаная c повторением → та же оболочка", () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 8, y: 16 },
			{ x: 17, y: -6 },
			{ x: 28, y: 10 },
			{ x: 8, y: 4 },
			{ x: 17, y: -6 },
		];

		const result = Convex.create(points, 10);
		expect(result.length).toBeGreaterThanOrEqual(3);
		expect(area2(result)).toBeGreaterThan(0);
	});

	test("одна точка → []", () => {
		expect(Convex.create([{ x: 0, y: 0 }], 10)).toEqual([]);
	});

	test("пустой массив → []", () => {
		expect(Convex.create([], 10)).toEqual([]);
	});

	test("radius = 0 → []", () => {
		expect(
			Convex.create(
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
				],
				0,
			),
		).toEqual([]);
	});

	test("radius < 0 → []", () => {
		expect(
			Convex.create(
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
				],
				-5,
			),
		).toEqual([]);
	});

	test("две идентичные точки → []", () => {
		expect(
			Convex.create(
				[
					{ x: 0, y: 0 },
					{ x: 0, y: 0 },
				],
				10,
			),
		).toEqual([]);
	});

	test("результат CCW — положительная ориентированная площадь", () => {
		const result = Convex.create(
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
				{ x: 0, y: 10 },
			],
			5,
		);

		expect(area2(result)).toBeGreaterThan(0);
	});

	test("L-образная ломаная → треугольник (выпуклая оболочка) + offset", () => {
		const result = Convex.create(
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
			],
			5,
		);

		expect(result.length).toBe(4);
		expect(area2(result)).toBeGreaterThan(0);

		expect(UC2.eq(result[0], { x: -5 - 5 * SQ2, y: -5 }, 0.01)).toBe(true);
		expect(UC2.eq(result[1], { x: 15, y: -5 }, 0.01)).toBe(true);
		expect(UC2.eq(result[2], { x: 15, y: 15 + 5 * SQ2 }, 0.01)).toBe(true);
	});

	test("замкнутая ломаная (треугольник) → выпуклая оболочка + offset", () => {
		const result = Convex.create(
			[
				{ x: 0, y: 0 },
				{ x: 20, y: 0 },
				{ x: 10, y: 15 },
				{ x: 0, y: 0 },
			],
			3,
		);

		expect(result.length).toBe(4);
		expect(area2(result)).toBeGreaterThan(0);
	});
});

describe("Convex.inflate", () => {
	test("точка → ромб CCW", () => {
		const result = Convex.inflate([{ x: 5, y: 5 }], 10);

		expect(result).toEqual([
			{ x: 5, y: -5 },
			{ x: 15, y: 5 },
			{ x: 5, y: 15 },
			{ x: -5, y: 5 },
			{ x: 5, y: -5 },
		]);
		expect(area2(result)).toBeGreaterThan(0);
	});

	test("две идентичные точки → ромб (как точка)", () => {
		const result = Convex.inflate(
			[
				{ x: 5, y: 5 },
				{ x: 5, y: 5 },
			],
			10,
		);

		expect(result).toEqual([
			{ x: 5, y: -5 },
			{ x: 15, y: 5 },
			{ x: 5, y: 15 },
			{ x: -5, y: 5 },
			{ x: 5, y: -5 },
		]);
	});

	test("линия → капсула с крышками", () => {
		const result = Convex.inflate(
			[
				{ x: 0, y: 0 },
				{ x: 100, y: 0 },
			],
			10,
		);

		expect(result).toEqual([
			{ x: -10, y: 0 },
			{ x: 0, y: -10 },
			{ x: 100, y: -10 },
			{ x: 110, y: 0 },
			{ x: 100, y: 10 },
			{ x: 0, y: 10 },
			{ x: -10, y: 0 },
		]);
		expect(area2(result)).toBeGreaterThan(0);
	});

	test("вертикальная линия → капсула", () => {
		const result = Convex.inflate(
			[
				{ x: 50, y: 0 },
				{ x: 50, y: 100 },
			],
			10,
		);

		expect(result).toEqual([
			{ x: 50, y: -10 },
			{ x: 60, y: 0 },
			{ x: 60, y: 100 },
			{ x: 50, y: 110 },
			{ x: 40, y: 100 },
			{ x: 40, y: 0 },
			{ x: 50, y: -10 },
		]);
	});

	test("квадрат → offset (прямоугольник)", () => {
		const result = Convex.inflate(
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
				{ x: 0, y: 10 },
			],
			5,
		);

		expect(result).toEqual([
			{ x: -5, y: -5 },
			{ x: 15, y: -5 },
			{ x: 15, y: 15 },
			{ x: -5, y: 15 },
			{ x: -5, y: -5 },
		]);
		expect(area2(result)).toBeGreaterThan(0);
	});

	test("треугольник → offset (3 точки, CCW)", () => {
		const result = Convex.inflate(
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
				{ x: 0, y: 0 },
			],
			5,
		);

		expect(result.length).toBe(4);
		expect(area2(result)).toBeGreaterThan(0);

		expect(UC2.eq(result[0], { x: -5 - 5 * SQ2, y: -5 }, 0.01)).toBe(true);
		expect(UC2.eq(result[1], { x: 15, y: -5 }, 0.01)).toBe(true);
		expect(UC2.eq(result[2], { x: 15, y: 15 + 5 * SQ2 }, 0.01)).toBe(true);
	});

	test("CW квадрат → результат CCW", () => {
		const cwSquare = [
			{ x: 0, y: 0 },
			{ x: 0, y: 10 },
			{ x: 10, y: 10 },
			{ x: 10, y: 0 },
			{ x: 0, y: 0 },
		];

		const result = Convex.inflate(cwSquare, 5);

		expect(area2(result)).toBeGreaterThan(0);
		expect(result).toEqual([
			{ x: -5, y: -5 },
			{ x: 15, y: -5 },
			{ x: 15, y: 15 },
			{ x: -5, y: 15 },
			{ x: -5, y: -5 },
		]);
	});

	test("radius = 0 → []", () => {
		expect(
			Convex.inflate(
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
				],
				0,
			),
		).toEqual([]);
	});

	test("radius < 0 → []", () => {
		expect(
			Convex.inflate(
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
				],
				-5,
			),
		).toEqual([]);
	});

	test("пустой массив → []", () => {
		expect(Convex.inflate([], 10)).toEqual([]);
	});
});

describe("Convex.hasX: принадлежность X координате проекции фигуры", () => {
	test("пустая фигура → false", () => {
		expect(Convex.hasX([], 0)).toBe(false);
	});

	test("точка: X совпадает → true, иначе → false", () => {
		expect(Convex.hasX([{ x: 5, y: 5 }], 5)).toBe(true);
		expect(Convex.hasX([{ x: 5, y: 5 }], 6)).toBe(false);
	});

	test("горизонтальное ребро: X строго между → true, на конце → false", () => {
		const edge = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
		];
		expect(Convex.hasX(edge, 5)).toBe(true);
		expect(Convex.hasX(edge, 0)).toBe(false);
		expect(Convex.hasX(edge, 10)).toBe(false);
		expect(Convex.hasX(edge, -1)).toBe(false);
		expect(Convex.hasX(edge, 11)).toBe(false);
	});

	test("вертикальное ребро: X совпадает → true, иначе → false", () => {
		const edge = [
			{ x: 5, y: 0 },
			{ x: 5, y: 10 },
		];
		expect(Convex.hasX(edge, 5)).toBe(true);
		expect(Convex.hasX(edge, 6)).toBe(false);
	});

	test("полигон: X строго внутри → true, на границе → false", () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		];
		expect(Convex.hasX(square, 5)).toBe(true);
		expect(Convex.hasX(square, 0)).toBe(false);
		expect(Convex.hasX(square, 10)).toBe(false);
		expect(Convex.hasX(square, -1)).toBe(false);
		expect(Convex.hasX(square, 11)).toBe(false);
	});
});

describe("Convex.hasY: принадлежность Y координате проекции фигуры", () => {
	test("пустая фигура → false", () => {
		expect(Convex.hasY([], 0)).toBe(false);
	});

	test("точка: Y совпадает → true, иначе → false", () => {
		expect(Convex.hasY([{ x: 5, y: 5 }], 5)).toBe(true);
		expect(Convex.hasY([{ x: 5, y: 5 }], 6)).toBe(false);
	});

	test("горизонтальное ребро: Y совпадает (вырождена) → true, иначе → false", () => {
		const edge = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
		];
		expect(Convex.hasY(edge, 0)).toBe(true);
		expect(Convex.hasY(edge, 1)).toBe(false);
		expect(Convex.hasY(edge, -1)).toBe(false);
	});

	test("вертикальное ребро: Y строго между → true, на конце → false", () => {
		const edge = [
			{ x: 5, y: 0 },
			{ x: 5, y: 10 },
		];
		expect(Convex.hasY(edge, 5)).toBe(true);
		expect(Convex.hasY(edge, 0)).toBe(false);
		expect(Convex.hasY(edge, 10)).toBe(false);
	});

	test("полигон: Y строго внутри → true, на границе → false", () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		];
		expect(Convex.hasY(square, 5)).toBe(true);
		expect(Convex.hasY(square, 0)).toBe(false);
		expect(Convex.hasY(square, 10)).toBe(false);
		expect(Convex.hasY(square, 11)).toBe(false);
	});
});

describe("Convex.has: принадлежность точки фигуре по канону владения", () => {
	const POINT: CT.C2[] = [{ x: 5, y: 5 }];
	const EDGE: CT.C2[] = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
	];
	const SQUARE: CT.C2[] = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 },
		{ x: 0, y: 10 },
		{ x: 0, y: 0 },
	];
	const TRIANGLE: CT.C2[] = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 },
		{ x: 0, y: 0 },
	];

	describe("пустая фигура", () => {
		test("всегда → false", () => {
			expect(Convex.has([], { x: 0, y: 0 })).toBe(false);
		});
	});

	describe("точка (1 вершина)", () => {
		test("совпадает → true", () => {
			expect(Convex.has(POINT, { x: 5, y: 5 })).toBe(true);
		});

		test("не совпадает → false", () => {
			expect(Convex.has(POINT, { x: 6, y: 5 })).toBe(false);
			expect(Convex.has(POINT, { x: 5, y: 6 })).toBe(false);
		});
	});

	describe("ребро (2 вершины)", () => {
		test("строго между концами → true", () => {
			expect(Convex.has(EDGE, { x: 5, y: 0 })).toBe(true);
		});

		test("на конце → false", () => {
			expect(Convex.has(EDGE, { x: 0, y: 0 })).toBe(false);
			expect(Convex.has(EDGE, { x: 10, y: 0 })).toBe(false);
		});

		test("вне отрезка → false", () => {
			expect(Convex.has(EDGE, { x: -1, y: 0 })).toBe(false);
			expect(Convex.has(EDGE, { x: 11, y: 0 })).toBe(false);
		});

		test("вне линии (мимо) → false", () => {
			expect(Convex.has(EDGE, { x: 5, y: 1 })).toBe(false);
		});

		test("вертикальное ребро: строго между → true", () => {
			const vEdge = [
				{ x: 5, y: 0 },
				{ x: 5, y: 10 },
			];
			expect(Convex.has(vEdge, { x: 5, y: 5 })).toBe(true);
			expect(Convex.has(vEdge, { x: 5, y: 0 })).toBe(false);
			expect(Convex.has(vEdge, { x: 5, y: 10 })).toBe(false);
			expect(Convex.has(vEdge, { x: 6, y: 5 })).toBe(false);
		});

		test("вырожденное ребро (точка): eq → true", () => {
			const degEdge = [
				{ x: 5, y: 5 },
				{ x: 5, y: 5 },
			];
			expect(Convex.has(degEdge, { x: 5, y: 5 })).toBe(true);
			expect(Convex.has(degEdge, { x: 6, y: 5 })).toBe(false);
		});
	});

	describe("полигон (квадрат, CCW)", () => {
		test("строго внутри → true", () => {
			expect(Convex.has(SQUARE, { x: 5, y: 5 })).toBe(true);
		});

		test("на ребре → false", () => {
			expect(Convex.has(SQUARE, { x: 5, y: 0 })).toBe(false);
			expect(Convex.has(SQUARE, { x: 0, y: 5 })).toBe(false);
			expect(Convex.has(SQUARE, { x: 5, y: 10 })).toBe(false);
			expect(Convex.has(SQUARE, { x: 10, y: 5 })).toBe(false);
		});

		test("в углу → false", () => {
			expect(Convex.has(SQUARE, { x: 0, y: 0 })).toBe(false);
			expect(Convex.has(SQUARE, { x: 10, y: 0 })).toBe(false);
			expect(Convex.has(SQUARE, { x: 10, y: 10 })).toBe(false);
			expect(Convex.has(SQUARE, { x: 0, y: 10 })).toBe(false);
		});

		test("снаружи → false", () => {
			expect(Convex.has(SQUARE, { x: -1, y: 5 })).toBe(false);
			expect(Convex.has(SQUARE, { x: 5, y: 11 })).toBe(false);
			expect(Convex.has(SQUARE, { x: 15, y: 15 })).toBe(false);
		});
	});

	describe("полигон (треугольник, CCW)", () => {
		test("строго внутри → true", () => {
			expect(Convex.has(TRIANGLE, { x: 8, y: 3 })).toBe(true);
		});

		test("на ребре → false", () => {
			expect(Convex.has(TRIANGLE, { x: 5, y: 0 })).toBe(false);
			expect(Convex.has(TRIANGLE, { x: 10, y: 5 })).toBe(false);
		});

		test("в углу → false", () => {
			expect(Convex.has(TRIANGLE, { x: 0, y: 0 })).toBe(false);
			expect(Convex.has(TRIANGLE, { x: 10, y: 0 })).toBe(false);
			expect(Convex.has(TRIANGLE, { x: 10, y: 10 })).toBe(false);
		});

		test("снаружи → false", () => {
			expect(Convex.has(TRIANGLE, { x: -1, y: 5 })).toBe(false);
			expect(Convex.has(TRIANGLE, { x: 5, y: 8 })).toBe(false);
		});
	});
});

describe("Convex.at: нестрогая принадлежность точки фигуре (канон контура)", () => {
	const POINT: CT.Convex = [{ x: 5, y: 5 }];
	const EDGE: CT.Convex = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
	];
	const SQUARE: CT.Convex = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 },
		{ x: 0, y: 10 },
		{ x: 0, y: 0 },
	];

	describe("пустая фигура", () => {
		test("всегда → false", () => {
			expect(Convex.at([], { x: 0, y: 0 })).toBe(false);
		});
	});

	describe("точка", () => {
		test("совпадает → true", () => {
			expect(Convex.at(POINT, { x: 5, y: 5 })).toBe(true);
		});

		test("не совпадает → false", () => {
			expect(Convex.at(POINT, { x: 6, y: 5 })).toBe(false);
		});
	});

	describe("ребро", () => {
		test("строго между концами → true", () => {
			expect(Convex.at(EDGE, { x: 5, y: 0 })).toBe(true);
		});

		test("на конце → true (контур включён)", () => {
			expect(Convex.at(EDGE, { x: 0, y: 0 })).toBe(true);
			expect(Convex.at(EDGE, { x: 10, y: 0 })).toBe(true);
		});

		test("за пределами по длине → false", () => {
			expect(Convex.at(EDGE, { x: -1, y: 0 })).toBe(false);
			expect(Convex.at(EDGE, { x: 11, y: 0 })).toBe(false);
		});

		test("мимо линии → false", () => {
			expect(Convex.at(EDGE, { x: 5, y: 1 })).toBe(false);
		});
	});

	describe("полигон (квадрат)", () => {
		test("строго внутри → true", () => {
			expect(Convex.at(SQUARE, { x: 5, y: 5 })).toBe(true);
		});

		test("на ребре → true (контур включён)", () => {
			expect(Convex.at(SQUARE, { x: 5, y: 0 })).toBe(true);
			expect(Convex.at(SQUARE, { x: 0, y: 5 })).toBe(true);
			expect(Convex.at(SQUARE, { x: 5, y: 10 })).toBe(true);
			expect(Convex.at(SQUARE, { x: 10, y: 5 })).toBe(true);
		});

		test("в углу → true (контур включён)", () => {
			expect(Convex.at(SQUARE, { x: 0, y: 0 })).toBe(true);
			expect(Convex.at(SQUARE, { x: 10, y: 0 })).toBe(true);
			expect(Convex.at(SQUARE, { x: 10, y: 10 })).toBe(true);
			expect(Convex.at(SQUARE, { x: 0, y: 10 })).toBe(true);
		});

		test("снаружи → false", () => {
			expect(Convex.at(SQUARE, { x: -1, y: 5 })).toBe(false);
			expect(Convex.at(SQUARE, { x: 5, y: 11 })).toBe(false);
		});
	});

	describe("вырожденные фигуры", () => {
		test("полигон-точка: совпадение → true", () => {
			expect(
				Convex.at(
					[
						{ x: 5, y: 5 },
						{ x: 5, y: 5 },
						{ x: 5, y: 5 },
					],
					{ x: 5, y: 5 },
				),
			).toBe(true);
		});

		test("полигон-точка: не совпадает → false", () => {
			expect(
				Convex.at(
					[
						{ x: 5, y: 5 },
						{ x: 5, y: 5 },
						{ x: 5, y: 5 },
					],
					{ x: 6, y: 5 },
				),
			).toBe(false);
		});

		test("полигон-линия: точка на конце → true", () => {
			expect(
				Convex.at(
					[
						{ x: 0, y: 0 },
						{ x: 5, y: 0 },
						{ x: 10, y: 0 },
					],
					{ x: 0, y: 0 },
				),
			).toBe(true);
			expect(
				Convex.at(
					[
						{ x: 0, y: 0 },
						{ x: 5, y: 0 },
						{ x: 10, y: 0 },
					],
					{ x: 10, y: 0 },
				),
			).toBe(true);
		});

		test("полигон-линия: точка между концами → true", () => {
			expect(
				Convex.at(
					[
						{ x: 0, y: 0 },
						{ x: 5, y: 0 },
						{ x: 10, y: 0 },
					],
					{ x: 5, y: 0 },
				),
			).toBe(true);
		});

		test("полигон-линия: точка мимо → false", () => {
			expect(
				Convex.at(
					[
						{ x: 0, y: 0 },
						{ x: 5, y: 0 },
						{ x: 10, y: 0 },
					],
					{ x: 5, y: 1 },
				),
			).toBe(false);
		});
	});

	describe("at ⊇ has (нестрогое включает строгое)", () => {
		test("has ⇒ at для всех комбинаций", () => {
			const cases: Array<[CT.Convex, CT.C2]> = [
				[POINT, { x: 5, y: 5 }],
				[EDGE, { x: 5, y: 0 }],
				[SQUARE, { x: 5, y: 5 }],
				[SQUARE, { x: 0, y: 0 }],
			];
			for (const [g, p] of cases) {
				if (Convex.has(g, p)) {
					expect(Convex.at(g, p)).toBe(true);
				}
			}
		});

		test("at true, has false на контуре", () => {
			expect(Convex.at(SQUARE, { x: 0, y: 0 })).toBe(true);
			expect(Convex.has(SQUARE, { x: 0, y: 0 })).toBe(false);
			expect(Convex.at(EDGE, { x: 0, y: 0 })).toBe(true);
			expect(Convex.has(EDGE, { x: 0, y: 0 })).toBe(false);
		});
	});
});

describe("canon-sync: UB.at ↔ Convex.at (Bounds как частный случай Convex)", () => {
	const cases: Array<[string, CT.Bounds, CT.C2]> = [
		["точка: совпадение", b(5, 5, 5, 5), { x: 5, y: 5 }],
		["точка: не совпадает", b(5, 5, 5, 5), { x: 6, y: 5 }],
		["линия: строго между", b(0, 5, 10, 5), { x: 5, y: 5 }],
		["линия: на конце", b(0, 5, 10, 5), { x: 0, y: 5 }],
		["линия: мимо", b(0, 5, 10, 5), { x: 5, y: 6 }],
		["полигон: внутри", b(0, 0, 10, 10), { x: 5, y: 5 }],
		["полигон: на ребре", b(0, 0, 10, 10), { x: 5, y: 0 }],
		["полигон: в углу", b(0, 0, 10, 10), { x: 0, y: 0 }],
		["полигон: снаружи", b(0, 0, 10, 10), { x: 15, y: 5 }],
		["полигон: EPS у границы", b(0, 0, 10, 10), { x: -0.0005, y: 5 }],
	];

	test.each(cases)("%s", (_name, bounds, p) => {
		const ubResult = UB.at(bounds, p);
		const uhResult = Convex.at(UB.corners(bounds), p);
		expect(uhResult).toBe(ubResult);
	});
});

describe("Convex.center: центроид фигуры", () => {
	test("пустая фигура → {0, 0}", () => {
		expect(Convex.center([])).toEqual({ x: 0, y: 0 });
	});

	test("одна точка → сама точка", () => {
		expect(Convex.center([{ x: 3, y: 7 }])).toEqual({ x: 3, y: 7 });
	});

	test("две точки → середина", () => {
		expect(
			Convex.center([
				{ x: 0, y: 0 },
				{ x: 10, y: 20 },
			]),
		).toEqual({ x: 5, y: 10 });
	});

	test("треугольник → среднее вершин", () => {
		const tri = [
			{ x: 0, y: 0 },
			{ x: 6, y: 0 },
			{ x: 0, y: 6 },
		];
		expect(Convex.center(tri)).toEqual({ x: 2, y: 2 });
	});

	test("квадрат CCW → центр", () => {
		const sq = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		];
		expect(Convex.center(sq)).toEqual({ x: 5, y: 5 });
	});

	test("квадрат CW → тот же центр", () => {
		const sq = [
			{ x: 0, y: 0 },
			{ x: 0, y: 10 },
			{ x: 10, y: 10 },
			{ x: 10, y: 0 },
		];
		expect(Convex.center(sq)).toEqual({ x: 5, y: 5 });
	});

	test("прямоугольник → центр", () => {
		const rect = [
			{ x: 0, y: 0 },
			{ x: 20, y: 0 },
			{ x: 20, y: 10 },
			{ x: 0, y: 10 },
		];
		expect(Convex.center(rect)).toEqual({ x: 10, y: 5 });
	});

	test("домик (пятиугольник) → известный центроид", () => {
		const house = [
			{ x: 0, y: 0 },
			{ x: 4, y: 0 },
			{ x: 4, y: 3 },
			{ x: 2, y: 5 },
			{ x: 0, y: 3 },
		];
		expect(Convex.center(house)).toEqual({ x: 2, y: 49 / 24 });
	});

	test("вырожденный (коллинеарные точки) → среднее", () => {
		const deg = [
			{ x: 0, y: 0 },
			{ x: 3, y: 3 },
			{ x: 5, y: 5 },
			{ x: 10, y: 10 },
		];
		expect(Convex.center(deg)).toEqual({ x: 4.5, y: 4.5 });
	});

	test("треугольник с коллинеарными точками (вырожденный) → среднее", () => {
		const deg = [
			{ x: 0, y: 0 },
			{ x: 5, y: 5 },
			{ x: 10, y: 10 },
		];
		expect(Convex.center(deg)).toEqual({ x: 5, y: 5 });
	});
});

describe("Convex.collision: общая точка по канону владения", () => {
	const POINT_A: CT.Convex = [{ x: 5, y: 5 }];
	const POINT_B: CT.Convex = [{ x: 50, y: 50 }];
	const EDGE_H: CT.Convex = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
	];
	const EDGE_V: CT.Convex = [
		{ x: 5, y: -5 },
		{ x: 5, y: 5 },
	];
	const EDGE_DIAG: CT.Convex = [
		{ x: 0, y: 0 },
		{ x: 10, y: 10 },
	];
	const SQUARE: CT.Convex = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 },
		{ x: 0, y: 10 },
		{ x: 0, y: 0 },
	];
	const SQUARE_B: CT.Convex = [
		{ x: 50, y: 50 },
		{ x: 60, y: 50 },
		{ x: 60, y: 60 },
		{ x: 50, y: 60 },
		{ x: 50, y: 50 },
	];
	const TRIANGLE: CT.Convex = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 },
		{ x: 0, y: 0 },
	];

	describe("пустая фигура", () => {
		test("пустая ⋂ что угодно → false", () => {
			expect(Convex.collision([], POINT_A)).toBe(false);
			expect(Convex.collision(POINT_A, [])).toBe(false);
			expect(Convex.collision([], [])).toBe(false);
			expect(Convex.collision([], SQUARE)).toBe(false);
		});
	});

	describe("точка ⋂ точка", () => {
		test("совпадают → true", () => {
			expect(Convex.collision(POINT_A, POINT_A)).toBe(true);
			expect(Convex.collision([{ x: 3, y: 7 }], [{ x: 3, y: 7 }])).toBe(true);
		});

		test("разные → false", () => {
			expect(Convex.collision(POINT_A, POINT_B)).toBe(false);
		});

		test("EPS-совпадение → true", () => {
			expect(Convex.collision([{ x: 5, y: 5 }], [{ x: 5.0001, y: 5.0001 }])).toBe(true);
		});
	});

	describe("точка ⋂ линия", () => {
		test("точка строго между концами → true", () => {
			expect(Convex.collision([{ x: 5, y: 0 }], EDGE_H)).toBe(true);
			expect(Convex.collision([{ x: 5, y: 0 }], EDGE_V)).toBe(true);
		});

		test("точка на конце линии → false", () => {
			expect(Convex.collision([{ x: 0, y: 0 }], EDGE_H)).toBe(false);
			expect(Convex.collision([{ x: 10, y: 0 }], EDGE_H)).toBe(false);
		});

		test("точка мимо линии (перпендикуляр) → false", () => {
			expect(Convex.collision([{ x: 5, y: 1 }], EDGE_H)).toBe(false);
		});

		test("точка за пределами по длине → false", () => {
			expect(Convex.collision([{ x: 15, y: 0 }], EDGE_H)).toBe(false);
		});

		test("симметричность", () => {
			expect(Convex.collision(POINT_A, EDGE_H)).toBe(Convex.collision(EDGE_H, POINT_A));
		});
	});

	describe("точка ⋂ полигон", () => {
		test("строго внутри → true", () => {
			expect(Convex.collision(POINT_A, SQUARE)).toBe(true);
		});

		test("на ребре → false", () => {
			expect(Convex.collision([{ x: 5, y: 0 }], SQUARE)).toBe(false);
			expect(Convex.collision([{ x: 0, y: 5 }], SQUARE)).toBe(false);
		});

		test("в углу → false", () => {
			expect(Convex.collision([{ x: 0, y: 0 }], SQUARE)).toBe(false);
			expect(Convex.collision([{ x: 10, y: 10 }], SQUARE)).toBe(false);
		});

		test("снаружи → false", () => {
			expect(Convex.collision(POINT_B, SQUARE)).toBe(false);
		});

		test("симметричность", () => {
			expect(Convex.collision(POINT_A, SQUARE)).toBe(Convex.collision(SQUARE, POINT_A));
		});
	});

	describe("линия ⋂ линия", () => {
		test("крест (одна точка пересечения) → true", () => {
			expect(Convex.collision(EDGE_H, EDGE_V)).toBe(true);
		});

		test("перекрытие на одной прямой → true", () => {
			expect(
				Convex.collision(EDGE_H, [
					{ x: 5, y: 0 },
					{ x: 15, y: 0 },
				]),
			).toBe(true);
		});

		test("касание концами (одна точка) → false", () => {
			expect(
				Convex.collision(
					[
						{ x: 0, y: 0 },
						{ x: 5, y: 0 },
					],
					[
						{ x: 5, y: 0 },
						{ x: 10, y: 0 },
					],
				),
			).toBe(false);
		});

		test("параллельные на разных прямых → false", () => {
			expect(
				Convex.collision(EDGE_H, [
					{ x: 0, y: 1 },
					{ x: 10, y: 1 },
				]),
			).toBe(false);
		});

		test("идентичные → true", () => {
			expect(Convex.collision(EDGE_H, EDGE_H)).toBe(true);
			expect(
				Convex.collision(EDGE_DIAG, [
					{ x: 10, y: 10 },
					{ x: 0, y: 0 },
				]),
			).toBe(true);
		});

		test("не пересекаются → false", () => {
			expect(
				Convex.collision(EDGE_H, [
					{ x: 50, y: 0 },
					{ x: 60, y: 0 },
				]),
			).toBe(false);
		});

		test("симметричность", () => {
			expect(Convex.collision(EDGE_H, EDGE_V)).toBe(Convex.collision(EDGE_V, EDGE_H));
			expect(Convex.collision(EDGE_H, EDGE_DIAG)).toBe(Convex.collision(EDGE_DIAG, EDGE_H));
		});
	});

	describe("линия ⋂ полигон", () => {
		test("линия строго внутри полигона → true", () => {
			expect(
				Convex.collision(
					[
						{ x: 2, y: 5 },
						{ x: 8, y: 5 },
					],
					SQUARE,
				),
			).toBe(true);
		});

		test("линия пересекает полигон насквозь → true", () => {
			expect(
				Convex.collision(
					[
						{ x: -5, y: 5 },
						{ x: 15, y: 5 },
					],
					SQUARE,
				),
			).toBe(true);
		});

		test("линия на ребре полигона → false", () => {
			expect(
				Convex.collision(
					[
						{ x: 0, y: 0 },
						{ x: 10, y: 0 },
					],
					SQUARE,
				),
			).toBe(false);
			expect(
				Convex.collision(
					[
						{ x: 0, y: 0 },
						{ x: 0, y: 10 },
					],
					SQUARE,
				),
			).toBe(false);
		});

		test("конец линии в углу полигона, линия наружу → false", () => {
			expect(
				Convex.collision(
					[
						{ x: 0, y: 0 },
						{ x: -5, y: -5 },
					],
					SQUARE,
				),
			).toBe(false);
		});

		test("конец линии в углу полигона, линия внутрь → true", () => {
			expect(
				Convex.collision(
					[
						{ x: 0, y: 0 },
						{ x: 5, y: 5 },
					],
					SQUARE,
				),
			).toBe(true);
		});

		test("конец линии строго внутри полигона → true", () => {
			expect(
				Convex.collision(
					[
						{ x: 5, y: 5 },
						{ x: 20, y: 5 },
					],
					SQUARE,
				),
			).toBe(true);
		});

		test("линия снаружи → false", () => {
			expect(
				Convex.collision(
					[
						{ x: 20, y: 5 },
						{ x: 30, y: 5 },
					],
					SQUARE,
				),
			).toBe(false);
		});

		test("симметричность", () => {
			expect(Convex.collision(EDGE_H, SQUARE)).toBe(Convex.collision(SQUARE, EDGE_H));
		});
	});

	describe("полигон ⋂ полигон", () => {
		test("строгое перекрытие → true", () => {
			expect(
				Convex.collision(SQUARE, [
					{ x: 5, y: 5 },
					{ x: 15, y: 5 },
					{ x: 15, y: 15 },
					{ x: 5, y: 15 },
				]),
			).toBe(true);
		});

		test("идентичные → true", () => {
			expect(Convex.collision(SQUARE, SQUARE)).toBe(true);
		});

		test("b строго внутри a → true", () => {
			expect(
				Convex.collision(SQUARE, [
					{ x: 2, y: 2 },
					{ x: 8, y: 2 },
					{ x: 8, y: 8 },
					{ x: 2, y: 8 },
				]),
			).toBe(true);
		});

		test("a внутри b → true", () => {
			expect(
				Convex.collision(SQUARE, [
					{ x: -10, y: -10 },
					{ x: 20, y: -10 },
					{ x: 20, y: 20 },
					{ x: -10, y: 20 },
				]),
			).toBe(true);
		});

		test("b внутри a и касается границ → true", () => {
			expect(
				Convex.collision(SQUARE, [
					{ x: 0, y: 0 },
					{ x: 5, y: 0 },
					{ x: 5, y: 5 },
					{ x: 0, y: 5 },
				]),
			).toBe(true);
		});

		test("касание стороной → false", () => {
			expect(
				Convex.collision(SQUARE, [
					{ x: 10, y: 0 },
					{ x: 20, y: 0 },
					{ x: 20, y: 10 },
					{ x: 10, y: 10 },
				]),
			).toBe(false);
		});

		test("касание углом → false", () => {
			expect(
				Convex.collision(SQUARE, [
					{ x: 10, y: 10 },
					{ x: 20, y: 10 },
					{ x: 20, y: 20 },
					{ x: 10, y: 20 },
				]),
			).toBe(false);
		});

		test("полное непересечение → false", () => {
			expect(Convex.collision(SQUARE, SQUARE_B)).toBe(false);
		});

		test("квадрат ⋂ треугольник (перекрытие) → true", () => {
			expect(Convex.collision(SQUARE, TRIANGLE)).toBe(true);
		});

		test("симметричность", () => {
			expect(Convex.collision(SQUARE, SQUARE_B)).toBe(Convex.collision(SQUARE_B, SQUARE));
			expect(Convex.collision(SQUARE, TRIANGLE)).toBe(Convex.collision(TRIANGLE, SQUARE));
		});
	});

	describe("вырожденные фигуры", () => {
		test("полигон-точка (все вершины равны) ⋂ точка → true", () => {
			expect(
				Convex.collision(
					[
						{ x: 5, y: 5 },
						{ x: 5, y: 5 },
						{ x: 5, y: 5 },
					],
					POINT_A,
				),
			).toBe(true);
		});

		test("полигон-точка ⋂ другая точка → false", () => {
			expect(
				Convex.collision(
					[
						{ x: 5, y: 5 },
						{ x: 5, y: 5 },
						{ x: 5, y: 5 },
					],
					POINT_B,
				),
			).toBe(false);
		});

		test("полигон-линия (коллинеарные) ⋂ точка между концами → true", () => {
			expect(
				Convex.collision(
					[
						{ x: 0, y: 0 },
						{ x: 5, y: 0 },
						{ x: 10, y: 0 },
					],
					[{ x: 5, y: 0 }],
				),
			).toBe(true);
		});

		test("полигон-линия ⋂ точка на конце → false", () => {
			expect(
				Convex.collision(
					[
						{ x: 0, y: 0 },
						{ x: 5, y: 0 },
						{ x: 10, y: 0 },
					],
					[{ x: 0, y: 0 }],
				),
			).toBe(false);
		});

		test("полигон-линия ⋂ линия с перекрытием → true", () => {
			expect(
				Convex.collision(
					[
						{ x: 0, y: 0 },
						{ x: 5, y: 0 },
						{ x: 10, y: 0 },
					],
					[
						{ x: 3, y: 0 },
						{ x: 7, y: 0 },
					],
				),
			).toBe(true);
		});

		test("полигон-линия ⋂ перпендикулярная линия (крест) → true", () => {
			expect(
				Convex.collision(
					[
						{ x: 0, y: 0 },
						{ x: 5, y: 0 },
						{ x: 10, y: 0 },
					],
					[
						{ x: 5, y: -5 },
						{ x: 5, y: 5 },
					],
				),
			).toBe(true);
		});

		test("полигон-линия ⋂ полигон (через interior) → true", () => {
			expect(
				Convex.collision(
					[
						{ x: 2, y: 5 },
						{ x: 5, y: 5 },
						{ x: 8, y: 5 },
					],
					SQUARE,
				),
			).toBe(true);
		});

		test("полигон-линия на ребре полигона → false", () => {
			expect(
				Convex.collision(
					[
						{ x: 0, y: 0 },
						{ x: 5, y: 0 },
						{ x: 10, y: 0 },
					],
					SQUARE,
				),
			).toBe(false);
		});

		test("полигон-точка ⋂ полигон (точка внутри) → true", () => {
			expect(
				Convex.collision(
					[
						{ x: 5, y: 5 },
						{ x: 5, y: 5 },
						{ x: 5, y: 5 },
					],
					SQUARE,
				),
			).toBe(true);
		});

		test("полигон-точка ⋂ полигон (точка снаружи) → false", () => {
			expect(
				Convex.collision(
					[
						{ x: 50, y: 50 },
						{ x: 50, y: 50 },
						{ x: 50, y: 50 },
					],
					SQUARE,
				),
			).toBe(false);
		});
	});

	describe("свойства", () => {
		test("симметричность для всех комбинаций", () => {
			const figures: Array<[string, CT.Convex]> = [
				["point", POINT_A],
				["edge_h", EDGE_H],
				["edge_v", EDGE_V],
				["edge_diag", EDGE_DIAG],
				["square", SQUARE],
				["triangle", TRIANGLE],
			];
			for (let i = 0; i < figures.length; i++) {
				for (let j = i; j < figures.length; j++) {
					const [na, fa] = figures[i];
					const [nb, fb] = figures[j];
					const ab = Convex.collision(fa, fb);
					const ba = Convex.collision(fb, fa);
					expect(ab).toBe(ba);
					if (ab !== ba) throw new Error(`${na} ⋂ ${nb} симметричность нарушена`);
				}
			}
		});
	});
});

describe("canon-sync: UB.collision ↔ Convex.collision (Bounds как частный случай Convex)", () => {
	const cases: Array<[string, CT.Bounds, CT.Bounds]> = [
		["точка ⋂ точка (совпадают)", b(5, 5, 5, 5), b(5, 5, 5, 5)],
		["точка ⋂ точка (разные)", b(5, 5, 5, 5), b(6, 6, 6, 6)],
		["точка ⋂ горизонтальная линия (мимо)", b(5, 5, 5, 5), b(0, 0, 10, 0)],
		["точка ⋂ горизонтальная линия (на конце)", b(0, 0, 0, 0), b(0, 0, 10, 0)],
		["точка ⋂ вертикальная линия (строго между)", b(5, 5, 5, 5), b(5, 0, 5, 10)],
		["точка ⋂ полигон (строго внутри)", b(5, 5, 5, 5), b(0, 0, 10, 10)],
		["точка ⋂ полигон (на ребре)", b(5, 0, 5, 0), b(0, 0, 10, 10)],
		["точка ⋂ полигон (в углу)", b(0, 0, 0, 0), b(0, 0, 10, 10)],
		["точка ⋂ полигон (снаружи)", b(50, 50, 50, 50), b(0, 0, 10, 10)],
		["линия ⋂ линия (крест)", b(0, 5, 10, 5), b(5, 0, 5, 10)],
		["линия ⋂ линия (перекрытие)", b(0, 0, 10, 0), b(5, 0, 15, 0)],
		["линия ⋂ линия (касание концами)", b(0, 0, 5, 0), b(5, 0, 10, 0)],
		["линия ⋂ линия (параллельные)", b(0, 0, 10, 0), b(0, 1, 10, 1)],
		["линия ⋂ линия (идентичные)", b(0, 0, 10, 0), b(0, 0, 10, 0)],
		["линия ⋂ полигон (внутри)", b(2, 5, 8, 5), b(0, 0, 10, 10)],
		["линия ⋂ полигон (насквозь)", b(-5, 5, 15, 5), b(0, 0, 10, 10)],
		["линия ⋂ полигон (на ребре)", b(0, 0, 10, 0), b(0, 0, 10, 10)],
		["линия ⋂ полигон (снаружи)", b(20, 5, 30, 5), b(0, 0, 10, 10)],
		["полигон ⋂ полигон (перекрытие)", b(0, 0, 10, 10), b(5, 5, 15, 15)],
		["полигон ⋂ полигон (идентичные)", b(0, 0, 10, 10), b(0, 0, 10, 10)],
		["полигон ⋂ полигон (b внутри a)", b(0, 0, 10, 10), b(2, 2, 8, 8)],
		["полигон ⋂ полигон (a внутри b)", b(2, 2, 8, 8), b(0, 0, 10, 10)],
		["полигон ⋂ полигон (b внутри, касается границ)", b(0, 0, 10, 10), b(0, 0, 5, 5)],
		["полигон ⋂ полигон (касание стороной)", b(0, 0, 10, 10), b(10, 0, 20, 10)],
		["полигон ⋂ полигон (касание углом)", b(0, 0, 10, 10), b(10, 10, 20, 20)],
		["полигон ⋂ полигон (непересечение)", b(0, 0, 10, 10), b(50, 50, 60, 60)],
		["вырожденный: точка-линия ⋂ полигон (на ребре)", b(0, 0, 0, 0), b(0, 0, 0, 10)],
	];

	test.each(cases)("%s", (_name, a, bb) => {
		const ubResult = UB.collision(a, bb);
		const uhResult = Convex.collision(UB.corners(a), UB.corners(bb));
		expect(uhResult).toBe(ubResult);
	});

	test("симметричность обоих методов согласована", () => {
		for (const [, a, bb] of cases) {
			const ubSym = UB.collision(a, bb) === UB.collision(bb, a);
			const uhSym = Convex.collision(UB.corners(a), UB.corners(bb)) === Convex.collision(UB.corners(bb), UB.corners(a));
			expect(uhSym).toBe(ubSym);
		}
	});
});

describe("Convex.mtv: вектор переноса для устранения коллизии", () => {
	const SQUARE_A: CT.Convex = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 },
		{ x: 0, y: 10 },
	];
	const SQUARE_B: CT.Convex = [
		{ x: 5, y: 5 },
		{ x: 15, y: 5 },
		{ x: 15, y: 15 },
		{ x: 5, y: 15 },
	];
	const TRIANGLE: CT.Convex = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 },
	];

	test("без коллизии → null для любого direction", () => {
		const far: CT.Convex = [
			{ x: 1000, y: 1000 },
			{ x: 1100, y: 1000 },
			{ x: 1100, y: 1100 },
			{ x: 1000, y: 1100 },
		];
		expect(Convex.mtv(far, SQUARE_A, "right")).toBeNull();
		expect(Convex.mtv(far, SQUARE_A, "left")).toBeNull();
		expect(Convex.mtv(far, SQUARE_A, "top")).toBeNull();
		expect(Convex.mtv(far, SQUARE_A, "bottom")).toBeNull();
		expect(Convex.mtv(far, SQUARE_A, "min")).toBeNull();
	});

	test("min: два перекрывающихся квадрата → односный вектор, move устраняет коллизию", () => {
		const mtv = Convex.mtv(SQUARE_A, SQUARE_B, "min");
		expect(mtv).not.toBeNull();
		expect(mtv!.x === 0 || mtv!.y === 0).toBe(true);
		expect(UC2.eq(mtv!, UC2.zero()) === false).toBe(true);
		const moved = movePoly(SQUARE_A, mtv!);
		expect(Convex.collision(moved, SQUARE_B)).toBe(false);
	});

	test("min: треугольники → односный вектор, move устраняет коллизию", () => {
		const triA = TRIANGLE;
		const triB: CT.Convex = [
			{ x: 5, y: 5 },
			{ x: 15, y: 5 },
			{ x: 15, y: 15 },
		];
		const mtv = Convex.mtv(triA, triB, "min");
		expect(mtv).not.toBeNull();
		expect(UC2.eq(mtv!, UC2.zero()) === false).toBe(true);
		const moved = movePoly(triA, mtv!);
		expect(Convex.collision(moved, triB)).toBe(false);
	});

	test("right → только +x, move устраняет коллизию", () => {
		const mtv = Convex.mtv(SQUARE_A, SQUARE_B, "right");
		expect(mtv).not.toBeNull();
		expect(mtv!.x).toBeGreaterThan(0);
		expect(mtv!.y).toBe(0);
		expect(Convex.collision(movePoly(SQUARE_A, mtv!), SQUARE_B)).toBe(false);
	});

	test("left → только -x, move устраняет коллизию", () => {
		const mtv = Convex.mtv(SQUARE_A, SQUARE_B, "left");
		expect(mtv).not.toBeNull();
		expect(mtv!.x).toBeLessThan(0);
		expect(mtv!.y).toBe(0);
		expect(Convex.collision(movePoly(SQUARE_A, mtv!), SQUARE_B)).toBe(false);
	});

	test("bottom → только +y (Y-вниз), move устраняет коллизию", () => {
		const mtv = Convex.mtv(SQUARE_A, SQUARE_B, "bottom");
		expect(mtv).not.toBeNull();
		expect(mtv!.y).toBeGreaterThan(0);
		expect(mtv!.x).toBe(0);
		expect(Convex.collision(movePoly(SQUARE_A, mtv!), SQUARE_B)).toBe(false);
	});

	test("top → только -y (Y-вниз), move устраняет коллизию", () => {
		const mtv = Convex.mtv(SQUARE_A, SQUARE_B, "top");
		expect(mtv).not.toBeNull();
		expect(mtv!.y).toBeLessThan(0);
		expect(mtv!.x).toBe(0);
		expect(Convex.collision(movePoly(SQUARE_A, mtv!), SQUARE_B)).toBe(false);
	});

	test("идентичные полигоны → non-null, move устраняет коллизию", () => {
		const mtv = Convex.mtv(SQUARE_A, SQUARE_A, "min");
		expect(mtv).not.toBeNull();
		const moved = movePoly(SQUARE_A, mtv!);
		expect(Convex.collision(moved, SQUARE_A)).toBe(false);
	});

	test("вырожденные: точка ⋂ полигон → fallback к AABB-min, move устраняет", () => {
		const mtv = Convex.mtv([{ x: 5, y: 5 }], SQUARE_A, "min");
		expect(mtv).not.toBeNull();
		const moved = movePoly([{ x: 5, y: 5 }], mtv!);
		expect(Convex.collision(moved, SQUARE_A)).toBe(false);
	});

	test("вырожденные: линия ⋂ полигон → fallback к AABB-min, move устраняет", () => {
		const line: CT.Convex = [
			{ x: 2, y: 5 },
			{ x: 8, y: 5 },
		];
		const mtv = Convex.mtv(line, SQUARE_A, "min");
		expect(mtv).not.toBeNull();
		const moved = movePoly(line, mtv!);
		expect(Convex.collision(moved, SQUARE_A)).toBe(false);
	});

	test("direction: b правее a → right даёт +x (a выталкивается вправо)", () => {
		const a: CT.Convex = [
			{ x: 60, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 },
			{ x: 60, y: 100 },
		];
		const bb: CT.Convex = [
			{ x: 0, y: 0 },
			{ x: 70, y: 0 },
			{ x: 70, y: 100 },
			{ x: 0, y: 100 },
		];
		const mtv = Convex.mtv(a, bb, "right");
		expect(mtv).not.toBeNull();
		expect(mtv!.x).toBeGreaterThan(0);
		expect(mtv!.y).toBe(0);
	});
});

// =============================================================================
// Асимметричные фигуры: защита от перепутывания x↔y в half-plane test и в других геометрических операциях.
// Используются прямоугольники с разными X и Y размерами и положением (например, w=20, h=10).
// При свапе x↔y в реализации результат становится другим.
// =============================================================================

describe("Convex.has: защита от перепутывания x↔y (asymmetric rect)", () => {
	// Прямоугольник 20×10, Y-вверх, CCW: w=20, h=10
	const RECT: CT.Convex = [
		{ x: 0, y: 0 },
		{ x: 20, y: 0 },
		{ x: 20, y: 10 },
		{ x: 0, y: 10 },
	];

	test("строго внутри (5, 5) → true", () => {
		expect(Convex.has(RECT, { x: 5, y: 5 })).toBe(true);
	});

	test("близко к «правому» ребру (X=19, Y=5) → true (строго внутри)", () => {
		// x=19 < 20, y=5 ∈ (0, 10) → строго внутри
		expect(Convex.has(RECT, { x: 19, y: 5 })).toBe(true);
	});

	test("близко к «верхнему» ребру (X=5, Y=9) → true (строго внутри)", () => {
		expect(Convex.has(RECT, { x: 5, y: 9 })).toBe(true);
	});

	test("на «правом» ребре (X=20, Y=5) → false (граница)", () => {
		expect(Convex.has(RECT, { x: 20, y: 5 })).toBe(false);
	});

	test("на «верхнем» ребре (X=5, Y=10) → false (граница)", () => {
		expect(Convex.has(RECT, { x: 5, y: 10 })).toBe(false);
	});

	test("в «правом-верхнем» углу (X=20, Y=10) → false (граница)", () => {
		expect(Convex.has(RECT, { x: 20, y: 10 })).toBe(false);
	});

	test("снаружи по X (X=25) → false", () => {
		expect(Convex.has(RECT, { x: 25, y: 5 })).toBe(false);
	});

	test("снаружи по Y (Y=15) → false", () => {
		expect(Convex.has(RECT, { x: 5, y: 15 })).toBe(false);
	});

	test("за X и Y (X=25, Y=15) → false (диагональ)", () => {
		expect(Convex.has(RECT, { x: 25, y: 15 })).toBe(false);
	});

	test("асимметричный rect с отрицательным началом: w=30, h=15, начало (-10, -20)", () => {
		const RECT2: CT.Convex = [
			{ x: -10, y: -20 },
			{ x: 20, y: -20 },
			{ x: 20, y: -5 },
			{ x: -10, y: -5 },
		];
		// строго внутри (5, -10)
		expect(Convex.has(RECT2, { x: 5, y: -10 })).toBe(true);
		// на «правом» ребре (X=20, Y=-10)
		expect(Convex.has(RECT2, { x: 20, y: -10 })).toBe(false);
		// на «верхнем» ребре (X=5, Y=-5)
		expect(Convex.has(RECT2, { x: 5, y: -5 })).toBe(false);
		// снаружи по X (X=25)
		expect(Convex.has(RECT2, { x: 25, y: -10 })).toBe(false);
		// снаружи по Y (Y=-25)
		expect(Convex.has(RECT2, { x: 5, y: -25 })).toBe(false);
	});
});

describe("Convex.at: защита от перепутывания x↔y (asymmetric rect)", () => {
	const RECT: CT.Convex = [
		{ x: 0, y: 0 },
		{ x: 20, y: 0 },
		{ x: 20, y: 10 },
		{ x: 0, y: 10 },
	];

	test("строго внутри (5, 5) → true", () => {
		expect(Convex.at(RECT, { x: 5, y: 5 })).toBe(true);
	});

	test("на «правом» ребре (X=20) → true (контур)", () => {
		expect(Convex.at(RECT, { x: 20, y: 5 })).toBe(true);
	});

	test("на «верхнем» ребре (Y=10) → true (контур)", () => {
		expect(Convex.at(RECT, { x: 5, y: 10 })).toBe(true);
	});

	test("в «правом-верхнем» углу → true (контур)", () => {
		expect(Convex.at(RECT, { x: 20, y: 10 })).toBe(true);
	});

	test("снаружи по X → false", () => {
		expect(Convex.at(RECT, { x: 25, y: 5 })).toBe(false);
	});

	test("снаружи по Y → false", () => {
		expect(Convex.at(RECT, { x: 5, y: 15 })).toBe(false);
	});

	test("снаружи по диагонали → false", () => {
		expect(Convex.at(RECT, { x: 25, y: 15 })).toBe(false);
	});
});

describe("Convex.collision: защита от перепутывания x↔y (asymmetric rect)", () => {
	const R1: CT.Convex = [
		{ x: 0, y: 0 },
		{ x: 20, y: 0 },
		{ x: 20, y: 10 },
		{ x: 0, y: 10 },
	];
	// R2 — другой асимметричный прямоугольник, пересекающийся с R1 в подобласти [15, 20] × [5, 10]
	const R2: CT.Convex = [
		{ x: 15, y: 5 },
		{ x: 30, y: 5 },
		{ x: 30, y: 15 },
		{ x: 15, y: 15 },
	];

	test("R1 ⋂ R2: пересечение → true", () => {
		expect(Convex.collision(R1, R2)).toBe(true);
	});

	test("симметричность: R1 ⋂ R2 === R2 ⋂ R1", () => {
		expect(Convex.collision(R1, R2)).toBe(Convex.collision(R2, R1));
	});

	test("R1 касается R2 по правой стороне (X=20) → false (касание стороной)", () => {
		// R3: X=[20, 30], Y=[0, 10] — касание R1 по X=20
		const R3: CT.Convex = [
			{ x: 20, y: 0 },
			{ x: 30, y: 0 },
			{ x: 30, y: 10 },
			{ x: 20, y: 10 },
		];
		expect(Convex.collision(R1, R3)).toBe(false);
	});

	test("R1 касается R2 по верхней стороне (Y=10) → false", () => {
		// R3: X=[0, 20], Y=[10, 20] — касание R1 по Y=10
		const R3: CT.Convex = [
			{ x: 0, y: 10 },
			{ x: 20, y: 10 },
			{ x: 20, y: 20 },
			{ x: 0, y: 20 },
		];
		expect(Convex.collision(R1, R3)).toBe(false);
	});

	test("R1 касается R2 углом (X=20, Y=10) → false", () => {
		// R3 в правом-верхнем углу
		const R3: CT.Convex = [
			{ x: 20, y: 10 },
			{ x: 30, y: 10 },
			{ x: 30, y: 20 },
			{ x: 20, y: 20 },
		];
		expect(Convex.collision(R1, R3)).toBe(false);
	});

	test("R1 вне R2 (далеко по X) → false", () => {
		const R3: CT.Convex = [
			{ x: 100, y: 0 },
			{ x: 200, y: 0 },
			{ x: 200, y: 10 },
			{ x: 100, y: 10 },
		];
		expect(Convex.collision(R1, R3)).toBe(false);
	});

	test("R1 вне R2 (далеко по Y) → false", () => {
		const R3: CT.Convex = [
			{ x: 0, y: 100 },
			{ x: 20, y: 100 },
			{ x: 20, y: 200 },
			{ x: 0, y: 200 },
		];
		expect(Convex.collision(R1, R3)).toBe(false);
	});

	test("R1 вне R2 (далеко по обеим осям) → false", () => {
		const R3: CT.Convex = [
			{ x: 100, y: 100 },
			{ x: 200, y: 100 },
			{ x: 200, y: 200 },
			{ x: 100, y: 200 },
		];
		expect(Convex.collision(R1, R3)).toBe(false);
	});

	test("R1 строго внутри R2 (R2 больше по обеим осям) → true", () => {
		const R3: CT.Convex = [
			{ x: -10, y: -10 },
			{ x: 30, y: -10 },
			{ x: 30, y: 20 },
			{ x: -10, y: 20 },
		];
		expect(Convex.collision(R1, R3)).toBe(true);
	});

	test("R2 строго внутри R1 (R1 больше) → true", () => {
		const R3: CT.Convex = [
			{ x: 5, y: 2 },
			{ x: 15, y: 2 },
			{ x: 15, y: 8 },
			{ x: 5, y: 8 },
		];
		expect(Convex.collision(R1, R3)).toBe(true);
	});
});
