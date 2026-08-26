import { describe, expect, test } from "bun:test";
import { US } from "./size.js";
import type * as CT from "./types.js";

describe("US.isEmpty: канон пустого размера", () => {
	test("точка (w=0, h=0) → true (вырожден в точку)", () => {
		expect(US.isEmpty({ w: 0, h: 0 })).toBe(true);
	});

	test("линия по X (w>0, h=0) → true (плоский по одной оси)", () => {
		expect(US.isEmpty({ w: 10, h: 0 })).toBe(true);
		expect(US.isEmpty({ w: 100, h: 0 })).toBe(true);
	});

	test("линия по Y (w=0, h>0) → true (плоский по одной оси)", () => {
		expect(US.isEmpty({ w: 0, h: 10 })).toBe(true);
		expect(US.isEmpty({ w: 0, h: 100 })).toBe(true);
	});

	test("полигон (w>0, h>0) → false (имеет площадь)", () => {
		expect(US.isEmpty({ w: 10, h: 10 })).toBe(false);
		expect(US.isEmpty({ w: 1, h: 1 })).toBe(false);
		expect(US.isEmpty({ w: 100, h: 200 })).toBe(false);
	});

	test("отрицательный размер по любой оси → true", () => {
		expect(US.isEmpty({ w: -5, h: 10 })).toBe(true);
		expect(US.isEmpty({ w: 10, h: -5 })).toBe(true);
		expect(US.isEmpty({ w: -5, h: -5 })).toBe(true);
	});

	test("строгое сравнение с 0 (без EPS): микро-положительный → false", () => {
		expect(US.isEmpty({ w: 0.0001, h: 10 })).toBe(false);
		expect(US.isEmpty({ w: 10, h: 0.0001 })).toBe(false);
	});

	test("строгое сравнение с 0 (без EPS): микро-отрицательный → true", () => {
		expect(US.isEmpty({ w: -0.0001, h: 10 })).toBe(true);
		expect(US.isEmpty({ w: 10, h: -0.0001 })).toBe(true);
	});

	test("нулевой размер через US.zero() → true", () => {
		expect(US.isEmpty(US.zero())).toBe(true);
		expect(US.isEmpty(US.zero(5))).toBe(false);
	});
});

describe("US.center: геометрический центр в локальных координатах", () => {
	test("без padding → {w/2, h/2}", () => {
		expect(US.center({ w: 100, h: 200 })).toEqual({ x: 50, y: 100 });
		expect(US.center({ w: 10, h: 20 })).toEqual({ x: 5, y: 10 });
	});

	test("padding = 0 → геометрический центр (симметрия)", () => {
		expect(US.center({ w: 100, h: 200 }, 0)).toEqual({ x: 50, y: 100 });
	});

	test("симметричный padding (доли) → центр не смещается", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.center(s, [[0.1]])).toEqual({ x: 50, y: 100 });
	});

	test("симметричный padding (пиксели) → центр не смещается", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.center(s, [[10]])).toEqual({ x: 50, y: 100 });
	});

	test("симметричное одиночное число (доля) → центр не смещается", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.center(s, 0.1)).toEqual({ x: 50, y: 100 });
	});

	test("симметричное одиночное число (пиксели) → центр не смещается", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.center(s, 10)).toEqual({ x: 50, y: 100 });
	});

	test("асимметричный P4 из чисел (доли) → смещение по обеим осям", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		const c = US.center(s, [0.1, 0.2, 0.3, 0.4]);
		expect(c.x).toBeCloseTo(60, 10);
		expect(c.y).toBeCloseTo(80, 10);
	});

	test("асимметричный P4 из чисел (пиксели) → смещение по обеим осям", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		const c = US.center(s, [10, 20, 30, 40]);
		expect(c.x).toBeCloseTo(60, 10);
		expect(c.y).toBeCloseTo(90, 10);
	});

	test("асимметричный padding P3 [t, x, b] → смещение по Y: (top - bottom)/2", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		const c = US.center(s, [[0.1], [0.2], [0.3]]);
		expect(c.x).toBeCloseTo(50, 10);
		expect(c.y).toBeCloseTo(80, 10);
	});

	test("асимметричный padding P4 → смещение по обеим осям", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		const c = US.center(s, [[0.1], [0.2], [0.3], [0.4]]);
		expect(c.x).toBeCloseTo(60, 10);
		expect(c.y).toBeCloseTo(80, 10);
	});

	test("center — это локальная точка (без позиции)", () => {
		const s1: CT.S2 = { w: 50, h: 50 };
		const s2: CT.S2 = { w: 100, h: 100 };
		expect(US.center(s1)).toEqual({ x: 25, y: 25 });
		expect(US.center(s2)).toEqual({ x: 50, y: 50 });
	});
});

describe("US.depth: нормированная глубина Depth в локальных координатах", () => {
	const s: CT.S2 = { w: 100, h: 200 };

	test("центр → [0, 0]", () => {
		const center = US.center(s);
		expect(US.depth(s, center)).toEqual([0, 0]);
	});

	test("TL-угол (0, 0) → [-1, -1]", () => {
		expect(US.depth(s, { x: 0, y: 0 })).toEqual([-1, -1]);
	});

	test("BR-угол (w, h) → [1, 1]", () => {
		expect(US.depth(s, { x: 100, y: 200 })).toEqual([1, 1]);
	});

	test("середина ребра (w/2, 0) → [0, -1]", () => {
		expect(US.depth(s, { x: 50, y: 0 })).toEqual([0, -1]);
	});

	test("середина ребра (0, h/2) → [-1, 0]", () => {
		expect(US.depth(s, { x: 0, y: 100 })).toEqual([-1, 0]);
	});

	test("снаружи по диагонали → [|x|>1, |y|>1]", () => {
		expect(US.depth(s, { x: 150, y: 300 })).toEqual([2, 2]);
		expect(US.depth(s, { x: -50, y: -100 })).toEqual([-2, -2]);
	});

	test("снаружи по одной оси, внутри по другой", () => {
		expect(US.depth(s, { x: 150, y: 100 })).toEqual([2, 0]);
		expect(US.depth(s, { x: 50, y: 300 })).toEqual([0, 2]);
	});

	test("round-trip: depth → center + depth*half восстанавливает точку", () => {
		const center = US.center(s);
		const half = US.div(s);
		const p: CT.C2 = { x: 30, y: 70 };
		const d = US.depth(s, p);
		const restored: CT.C2 = {
			x: center.x + d[0] * half.w,
			y: center.y + d[1] * half.h,
		};
		expect(restored).toEqual(p);
	});

	test("квадрат: depth симметричен по осям", () => {
		const square: CT.S2 = { w: 100, h: 100 };
		expect(US.depth(square, { x: 25, y: 75 })).toEqual([-0.5, 0.5]);
	});

	test("zero size (w=0, h=0): p в центре → [0, 0]", () => {
		expect(US.depth({ w: 0, h: 0 }, { x: 0, y: 0 })).toEqual([0, 0]);
	});

	test("zero size (w=0, h=0): p не в центре → [Infinity, Infinity]", () => {
		expect(US.depth({ w: 0, h: 0 }, { x: 5, y: 5 })).toEqual([Infinity, Infinity]);
	});

	test("линия по X (h=0): p на линии → [t, 0]", () => {
		const d = US.depth({ w: 10, h: 0 }, { x: 5, y: 0 });
		expect(d[0]).toBe(0);
		expect(d[1]).toBe(0);
	});

	test("линия по X (h=0): p вне по Y → [t, Infinity]", () => {
		const d = US.depth({ w: 10, h: 0 }, { x: 5, y: 5 });
		expect(d[0]).toBe(0);
		expect(d[1]).toBe(Infinity);
	});

	test("линия по Y (w=0): p вне по X → [Infinity, t]", () => {
		const d = US.depth({ w: 0, h: 10 }, { x: 5, y: 5 });
		expect(d[0]).toBe(Infinity);
		expect(d[1]).toBe(0);
	});

	test("линия по Y (w=0): p на линии → [0, t]", () => {
		const d = US.depth({ w: 0, h: 10 }, { x: 0, y: 5 });
		expect(d[0]).toBe(0);
		expect(d[1]).toBe(0);
	});
});

describe("US.pad: сжатие по P4 = [top, right, bottom, left]", () => {
	test("нулевой P4 → размер без изменений", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.pad(s, [0, 0, 0, 0])).toEqual(s);
	});

	test("симметричный P4 [10,10,10,10] → w-=20, h-=20", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.pad(s, [10, 10, 10, 10])).toEqual({ w: 80, h: 180 });
	});

	test("асимметричный P4 [10,20,30,40] → w-=60, h-=40", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.pad(s, [10, 20, 30, 40])).toEqual({ w: 40, h: 160 });
	});

	test("только по X (top=bottom=0)", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.pad(s, [0, 20, 0, 40])).toEqual({ w: 40, h: 200 });
	});

	test("только по Y (left=right=0)", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.pad(s, [10, 0, 30, 0])).toEqual({ w: 100, h: 160 });
	});

	test("может породить отрицательные размеры", () => {
		const s: CT.S2 = { w: 10, h: 10 };
		expect(US.pad(s, [100, 100, 100, 100])).toEqual({ w: -190, h: -190 });
	});

	test("не мутирует исходный S2", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		US.pad(s, [10, 20, 30, 40]);
		expect(s).toEqual({ w: 100, h: 200 });
	});
});

describe("US.deflate: сжатие внутрь на padding", () => {
	test("padding = 0 → копия (не мутирует исходник)", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		const d = US.deflate(s, 0);
		expect(d).toEqual(s);
		expect(d).not.toBe(s);
	});

	test("симметричные пиксели [[10]] → w-=20, h-=20", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.deflate(s, [[10]])).toEqual({ w: 80, h: 180 });
	});

	test("асимметричные пиксели P4 → w-=60, h-=40", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.deflate(s, [[10], [20], [30], [40]])).toEqual({ w: 40, h: 160 });
	});

	test("симметричные доли [[0.1]] → 10% с каждой стороны", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.deflate(s, [[0.1]])).toEqual({ w: 80, h: 160 });
	});

	test("доли дают тот же результат, что пропорциональные пиксели", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		const byFraction = US.deflate(s, [[0.1]]);
		const byPixels = US.deflate(s, [[20], [10], [20], [10]]);
		expect(byFraction).toEqual(byPixels);
	});

	test("может породить отрицательные размеры", () => {
		const s: CT.S2 = { w: 10, h: 10 };
		expect(US.deflate(s, [[100]])).toEqual({ w: -190, h: -190 });
	});

	test("одиночное число >= absolute → пиксели с каждой стороны", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.deflate(s, 10)).toEqual({ w: 80, h: 180 });
	});

	test("одиночное число < absolute → доля от размера (10% от w=100 → 10px, от h=200 → 20px)", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.deflate(s, 0.1)).toEqual({ w: 80, h: 160 });
	});

	test("P4 из чисел: каждое независимо (>=1 пиксели, <1 доля)", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.deflate(s, [10, 20, 30, 40])).toEqual({ w: 40, h: 160 });
		expect(US.deflate(s, [0.1, 0.2, 0.3, 0.4])).toEqual({ w: 40, h: 120 });
	});
});

describe("US.inflate: расширение наружу на margin", () => {
	test("margin = 0 → копия (не мутирует исходник)", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		const i = US.inflate(s, 0);
		expect(i).toEqual(s);
		expect(i).not.toBe(s);
	});

	test("симметричные пиксели [[10]] → w+=20, h+=20", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.inflate(s, [[10]])).toEqual({ w: 120, h: 220 });
	});

	test("асимметричные пиксели P4 → w+=60, h+=40", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.inflate(s, [[10], [20], [30], [40]])).toEqual({ w: 160, h: 240 });
	});

	test("симметричные доли [[0.1]] → +10% с каждой стороны", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.inflate(s, [[0.1]])).toEqual({ w: 120, h: 240 });
	});

	test("симметричное одиночное число (пиксели) → +2n с каждой стороны", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.inflate(s, 10)).toEqual({ w: 120, h: 220 });
	});

	test("симметричное одиночное число (доля) → +2·(доля·размер)", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		expect(US.inflate(s, 0.1)).toEqual({ w: 120, h: 240 });
	});

	test("inflate — обратная операция к deflate (симметричный padding)", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		const deflated = US.deflate(s, [[10]]);
		const restored = US.inflate(deflated, [[10]]);
		expect(restored).toEqual(s);
	});

	test("inflate — обратная операция к deflate (асимметричный P4)", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		const padding = [[10], [20], [30], [40]] as unknown as Parameters<typeof US.deflate>[1];
		const deflated = US.deflate(s, padding);
		const restored = US.inflate(deflated, padding);
		expect(restored).toEqual(s);
	});

	test("может дать отрицательные размеры (если inflate «отрицательным» margin)", () => {
		const s: CT.S2 = { w: 100, h: 200 };
		const result = US.inflate(s, [[200], [200], [200], [200]]);
		expect(result).toEqual({ w: 500, h: 600 });
	});
});

describe("US.puttable: помещается ли размер b в размер a", () => {
	test("b строго меньше → true", () => {
		expect(US.puttable({ w: 100, h: 200 }, { w: 50, h: 100 })).toBe(true);
	});

	test("размеры равны → null", () => {
		expect(US.puttable({ w: 100, h: 200 }, { w: 100, h: 200 })).toBe(null);
	});

	test("b больше по W → false", () => {
		expect(US.puttable({ w: 100, h: 200 }, { w: 150, h: 100 })).toBe(false);
	});

	test("b больше по H → false", () => {
		expect(US.puttable({ w: 100, h: 200 }, { w: 100, h: 250 })).toBe(false);
	});

	test("b равен по W, меньше по H → true", () => {
		expect(US.puttable({ w: 100, h: 200 }, { w: 100, h: 100 })).toBe(true);
	});

	test("b равен по H, больше по W → false", () => {
		expect(US.puttable({ w: 100, h: 200 }, { w: 150, h: 200 })).toBe(false);
	});

	test("b равен по W, больше по H → false", () => {
		expect(US.puttable({ w: 100, h: 200 }, { w: 100, h: 250 })).toBe(false);
	});

	test("b строго больше по обеим → false", () => {
		expect(US.puttable({ w: 100, h: 200 }, { w: 150, h: 250 })).toBe(false);
	});

	test("EPS: размеры в пределах EPS → null", () => {
		expect(US.puttable({ w: 100, h: 200 }, { w: 100.0005, h: 200.0005 })).toBe(null);
	});

	test("кастомный EPS", () => {
		expect(US.puttable({ w: 100, h: 200 }, { w: 100.0005, h: 200 }, 1e-4)).not.toBe(null);
		expect(US.puttable({ w: 100, h: 200 }, { w: 100.0005, h: 200 }, 1e-3)).toBe(null);
	});
});

// =============================================================================
// Асимметричные размеры: защита от перепутывания w↔h, padding-индексов и т.п.
// Используются размеры и padding с разными значениями по X и Y, чтобы свап давал
// другой результат.
// =============================================================================

describe("US.center: защита от перепутывания w↔h и P4 индексов", () => {
	test("центр: w=10, h=20 (w≠h, без padding)", () => {
		expect(US.center({ w: 10, h: 20 })).toEqual({ x: 5, y: 10 });
	});

	test("padding P4 [t, r, b, l] (доли): w=10, h=20 — центр смещается асимметрично", () => {
		// [0.1, 0.2, 0.3, 0.4] = [w*0.1=1, h*0.2=4, w*0.3=3, h*0.4=8] ... wait, top/bottom → s.h, left/right → s.w
		// s = {w:10, h:20}
		// pt = s.h * 0.1 = 2; pr = s.w * 0.2 = 2; pb = s.h * 0.3 = 6; pl = s.w * 0.4 = 4
		// center.x = s.w/2 + (pl - pr)/2 = 5 + (4-2)/2 = 6
		// center.y = s.h/2 + (pt - pb)/2 = 10 + (2-6)/2 = 8
		expect(US.center({ w: 10, h: 20 }, [0.1, 0.2, 0.3, 0.4])).toEqual({ x: 6, y: 8 });
	});

	test("padding P4 (пиксели): асимметричные значения разные по X и Y", () => {
		// s = {w:10, h:20}
		// pt=1, pr=2, pb=3, pl=4 (пиксели, |p|<1 ложь → абсолют)
		// center.x = 5 + (4-2)/2 = 6
		// center.y = 10 + (1-3)/2 = 9
		expect(US.center({ w: 10, h: 20 }, [1, 2, 3, 4])).toEqual({ x: 6, y: 9 });
	});

	test("P4 с разными top/bottom и left/right (доли): смещение по обеим осям", () => {
		// s = {w:10, h:20}
		// [0.3, 0.1, 0.1, 0.3] (top=0.3, right=0.1, bottom=0.1, left=0.3)
		// pt = h*0.3 = 6; pr = w*0.1 = 1; pb = h*0.1 = 2; pl = w*0.3 = 3
		// center.x = 5 + (3-1)/2 = 6
		// center.y = 10 + (6-2)/2 = 12
		expect(US.center({ w: 10, h: 20 }, [0.3, 0.1, 0.1, 0.3])).toEqual({ x: 6, y: 12 });
	});

	test("отрицательные размеры (w=-10, h=-20) и padding", () => {
		// s = {w:-10, h:-20}
		// pt = -20 * 0.1 = -2; pr = -10 * 0.2 = -2; pb = -20 * 0.3 = -6; pl = -10 * 0.4 = -4
		// center.x = -5 + (-4 - (-2))/2 = -5 - 1 = -6
		// center.y = -10 + (-2 - (-6))/2 = -10 + 2 = -8
		expect(US.center({ w: -10, h: -20 }, [0.1, 0.2, 0.3, 0.4])).toEqual({ x: -6, y: -8 });
	});
});

describe("US.depth: защита от перепутывания w↔h", () => {
	test("w=10, h=20: depth центральной точки", () => {
		// center = (5, 10), half = (5, 10)
		// p = (5, 10) → [0, 0]
		expect(US.depth({ w: 10, h: 20 }, { x: 5, y: 10 })).toEqual([0, 0]);
	});

	test("w=10, h=20: углы (0, 0) → [-1, -1] (BL), (10, 20) → [1, 1] (TR)", () => {
		expect(US.depth({ w: 10, h: 20 }, { x: 0, y: 0 })).toEqual([-1, -1]);
		expect(US.depth({ w: 10, h: 20 }, { x: 10, y: 20 })).toEqual([1, 1]);
	});

	test("w=10, h=20: середина ребра по X (5, 0) → [0, -1]", () => {
		expect(US.depth({ w: 10, h: 20 }, { x: 5, y: 0 })).toEqual([0, -1]);
	});

	test("w=10, h=20: середина ребра по Y (0, 10) → [-1, 0]", () => {
		expect(US.depth({ w: 10, h: 20 }, { x: 0, y: 10 })).toEqual([-1, 0]);
	});

	test("w=10, h=20: точка (3, 5) → [-0.4, -0.5] (асимметричные depth)", () => {
		// (3-5)/5 = -0.4; (5-10)/10 = -0.5
		expect(US.depth({ w: 10, h: 20 }, { x: 3, y: 5 })).toEqual([-0.4, -0.5]);
	});

	test("w=10, h=20: точка (7, 14) → [0.4, 0.4]", () => {
		// (7-5)/5 = 0.4; (14-10)/10 = 0.4
		expect(US.depth({ w: 10, h: 20 }, { x: 7, y: 14 })).toEqual([0.4, 0.4]);
	});

	test("w=10, h=20: снаружи по X (12, 10) → [1.4, 0]", () => {
		// (12-5)/5 = 1.4
		expect(US.depth({ w: 10, h: 20 }, { x: 12, y: 10 })).toEqual([1.4, 0]);
	});

	test("w=10, h=20: снаружи по Y (5, 25) → [0, 1.5]", () => {
		// (25-10)/10 = 1.5
		expect(US.depth({ w: 10, h: 20 }, { x: 5, y: 25 })).toEqual([0, 1.5]);
	});

	test("w=10, h=20: снаружи по диагонали (12, 25) → [1.4, 1.5]", () => {
		expect(US.depth({ w: 10, h: 20 }, { x: 12, y: 25 })).toEqual([1.4, 1.5]);
	});

	test("w=10, h=20: round-trip: p = center + depth*half", () => {
		const s: CT.S2 = { w: 10, h: 20 };
		const center = US.center(s);
		const half = US.div(s);
		const p: CT.C2 = { x: 3, y: 7 };
		const d = US.depth(s, p);
		const restored: CT.C2 = {
			x: center.x + d[0] * half.w,
			y: center.y + d[1] * half.h,
		};
		expect(restored.x).toBeCloseTo(p.x, 10);
		expect(restored.y).toBeCloseTo(p.y, 10);
	});

	test("zero по X (w=0, h=20): точка вне по X → [Infinity, 0]", () => {
		expect(US.depth({ w: 0, h: 20 }, { x: 5, y: 10 })).toEqual([Infinity, 0]);
	});

	test("zero по Y (w=10, h=0): точка вне по Y → [0, Infinity]", () => {
		expect(US.depth({ w: 10, h: 0 }, { x: 5, y: 10 })).toEqual([0, Infinity]);
	});

	test("w=10, h=20: точка отрицательная (-3, -5) → [-1.6, -1.5]", () => {
		// (-3-5)/5 = -1.6; (-5-10)/10 = -1.5
		expect(US.depth({ w: 10, h: 20 }, { x: -3, y: -5 })).toEqual([-1.6, -1.5]);
	});
});

describe("US.puttable: защита от перепутывания w↔h", () => {
	test("a и b с разными w и h: b больше только по w → false", () => {
		// a = (10, 20), b = (15, 5): b.w > a.w, b.h < a.h
		expect(US.puttable({ w: 10, h: 20 }, { w: 15, h: 5 })).toBe(false);
	});

	test("a и b с разными w и h: b больше только по h → false", () => {
		// a = (10, 20), b = (5, 25): b.w < a.w, b.h > a.h
		expect(US.puttable({ w: 10, h: 20 }, { w: 5, h: 25 })).toBe(false);
	});

	test("a и b с разными w и h: b меньше по обеим → true", () => {
		// a = (10, 20), b = (5, 5)
		expect(US.puttable({ w: 10, h: 20 }, { w: 5, h: 5 })).toBe(true);
	});

	test("a и b: равны по w, разные по h → b больше по h → false", () => {
		// a = (10, 20), b = (10, 25)
		expect(US.puttable({ w: 10, h: 20 }, { w: 10, h: 25 })).toBe(false);
	});

	test("a и b: равны по h, разные по w → b больше по w → false", () => {
		// a = (10, 20), b = (15, 20)
		expect(US.puttable({ w: 10, h: 20 }, { w: 15, h: 20 })).toBe(false);
	});

	test("a и b: размеры равны, но разные значения → null", () => {
		// a = (10, 20), b = (10, 20)
		expect(US.puttable({ w: 10, h: 20 }, { w: 10, h: 20 })).toBe(null);
	});

	test("a и b: b равно a → null (асимметрия)", () => {
		expect(US.puttable({ w: 30, h: 70 }, { w: 30, h: 70 })).toBe(null);
	});

	test("a и b: b строго меньше по обеим → true (асимметрия)", () => {
		expect(US.puttable({ w: 30, h: 70 }, { w: 10, h: 50 })).toBe(true);
	});

	test("EPS: размеры в пределах EPS → null (асимметрия)", () => {
		expect(US.puttable({ w: 30, h: 70 }, { w: 30.0005, h: 70.0005 })).toBe(null);
	});

	test("EPS: только w в пределах EPS → null (асимметрия)", () => {
		// b.w=30.0005 ≈ a.w=30, b.h=70.0005 ≈ a.h=70
		expect(US.puttable({ w: 30, h: 70 }, { w: 30.0005, h: 70.0005 })).toBe(null);
	});

	test("EPS: только по w в пределах EPS, по h сильно больше → false", () => {
		// b.w=30.0005 ≈ a.w=30, b.h=80 > a.h=70
		expect(US.puttable({ w: 30, h: 70 }, { w: 30.0005, h: 80 })).toBe(false);
	});
});

describe("US.pad/deflate/inflate: защита от перепутывания P4 индексов", () => {
	test("pad асимметричный: s = (w:10, h:20), P4 = [1, 2, 3, 4] (пиксели)", () => {
		// s.w=10, s.h=20; P4 [top=1, right=2, bottom=3, left=4]
		// s.w -= 4 + 2 = 8
		// s.h -= 1 + 3 = 16
		expect(US.pad({ w: 10, h: 20 }, [1, 2, 3, 4])).toEqual({ w: 4, h: 16 });
	});

	test("pad с P4 (доли < 1 трактуются как пиксели в raw-вызове): w=10, h=20", () => {
		// US.pad принимает уже-посчитанные пиксели (без spn-конвертации)
		// P4 [top=1, right=2, bottom=3, left=4] — простые пиксели, без float
		// s.w = 10, s.h = 20
		// w = 10 - 4 - 2 = 4
		// h = 20 - 1 - 3 = 16
		expect(US.pad({ w: 10, h: 20 }, [1, 2, 3, 4])).toEqual({ w: 4, h: 16 });
	});

	test("pad с P4 пикселей: pt=2, pr=3, pb=4, pl=5 → асимметричное уменьшение", () => {
		// s.w=10, s.h=20; pt=2, pr=3, pb=4, pl=5
		// w = 10 - 5 - 3 = 2
		// h = 20 - 2 - 4 = 14
		expect(US.pad({ w: 10, h: 20 }, [2, 3, 4, 5])).toEqual({ w: 2, h: 14 });
	});

	test("pad: разный padding по осям даёт разные w и h", () => {
		// s.w=10, s.h=20; P4 = [0, 5, 0, 8] — только горизонтальные отступы
		// w = 10 - 8 - 5 = -3
		// h = 20 - 0 - 0 = 20
		expect(US.pad({ w: 10, h: 20 }, [0, 5, 0, 8])).toEqual({ w: -3, h: 20 });
	});

	test("deflate: padding P4 пиксели, разные по осям", () => {
		expect(US.deflate({ w: 10, h: 20 }, [1, 2, 3, 4])).toEqual({ w: 4, h: 16 });
	});

	test("deflate: padding P4 доли, разные по осям", () => {
		expect(US.deflate({ w: 10, h: 20 }, [0.1, 0.2, 0.3, 0.4])).toEqual({ w: 4, h: 12 });
	});

	test("inflate: padding P4 пиксели, разные по осям → w+=6, h+=4", () => {
		// inflate использует -margin: s.w -= -(4+2) = +6, s.h -= -(1+3) = +4
		expect(US.inflate({ w: 10, h: 20 }, [1, 2, 3, 4])).toEqual({ w: 16, h: 24 });
	});

	test("inflate: padding P4 доли → w+=6, h+=8", () => {
		// pr=2, pl=4 → s.w -= -(4+2) = +6; pt=2, pb=6 → s.h -= -(2+6) = +8
		expect(US.inflate({ w: 10, h: 20 }, [0.1, 0.2, 0.3, 0.4])).toEqual({ w: 16, h: 28 });
	});

	test("deflate/inflate round-trip: P4 пиксели, асимметричный", () => {
		const s: CT.S2 = { w: 10, h: 20 };
		const padding = [1, 2, 3, 4] as [number, number, number, number];
		const deflated = US.deflate(s, padding);
		const restored = US.inflate(deflated, padding);
		expect(restored).toEqual(s);
	});
});

describe("US.bound: mode 'anchor' = p как TL (minX/minY = p, max = p + s)", () => {
	test("p = (5, 7), s = (10, 20) → { minX: 5, minY: 7, maxX: 15, maxY: 27 }", () => {
		expect(US.bound({ w: 10, h: 20 }, { x: 5, y: 7 }, "anchor")).toEqual({
			minX: 5,
			minY: 7,
			maxX: 15,
			maxY: 27,
		});
	});
	test("p = (0, 0) → результат = S2 по тем же координатам", () => {
		expect(US.bound({ w: 10, h: 20 }, { x: 0, y: 0 }, "anchor")).toEqual({
			minX: 0,
			minY: 0,
			maxX: 10,
			maxY: 20,
		});
	});
	test("размер s = zero → вырожденный Bounds-точка в p", () => {
		expect(US.bound({ w: 0, h: 0 }, { x: 5, y: 7 }, "anchor")).toEqual({
			minX: 5,
			minY: 7,
			maxX: 5,
			maxY: 7,
		});
	});
	test("отрицательные p и s — корректно откладываются", () => {
		expect(US.bound({ w: 10, h: 20 }, { x: -5, y: -7 }, "anchor")).toEqual({
			minX: -5,
			minY: -7,
			maxX: 5,
			maxY: 13,
		});
	});
	test("дефолтный mode — center", () => {
		expect(US.bound({ w: 10, h: 20 }, { x: 5, y: 7 })).toEqual(US.bound({ w: 10, h: 20 }, { x: 5, y: 7 }, "center"));
	});
});
