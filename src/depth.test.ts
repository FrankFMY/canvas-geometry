import { describe, expect, test } from "bun:test";
import { UD } from "./depth.js";

describe("UD.at: точка на фигуре (|d| ≤ 1 с EPS)", () => {
	test("центр [0, 0] → true", () => {
		expect(UD.at([0, 0])).toBe(true);
	});

	test("внутри [|d| < 1] → true", () => {
		expect(UD.at([0.5, 0.5])).toBe(true);
		expect(UD.at([-0.5, -0.5])).toBe(true);
		expect(UD.at([0.9, 0.9])).toBe(true);
		expect(UD.at([-0.9, 0.9])).toBe(true);
	});

	test("контур [|d| = 1] → true (граница включена)", () => {
		expect(UD.at([1, 1])).toBe(true);
		expect(UD.at([-1, -1])).toBe(true);
		expect(UD.at([1, 0])).toBe(true);
		expect(UD.at([0, 1])).toBe(true);
		expect(UD.at([-1, 0.5])).toBe(true);
	});

	test("снаружи [|d| > 1] → false", () => {
		expect(UD.at([1.5, 0])).toBe(false);
		expect(UD.at([0, 1.5])).toBe(false);
		expect(UD.at([-2, 0])).toBe(false);
		expect(UD.at([0, -2])).toBe(false);
		expect(UD.at([2, 2])).toBe(false);
	});

	test("Infinity в любой компоненте → false", () => {
		expect(UD.at([Infinity, 0])).toBe(false);
		expect(UD.at([0, Infinity])).toBe(false);
		expect(UD.at([Infinity, Infinity])).toBe(false);
		expect(UD.at([-Infinity, 0])).toBe(false);
	});

	test("EPS-толерантность: 1 + EPS/2 → true (в пределах)", () => {
		expect(UD.at([1.0005, 1.0005])).toBe(true);
		expect(UD.at([-1.0005, 0])).toBe(true);
	});

	test("EPS-толерантность: 1 + EPS*2 → false (за пределами)", () => {
		expect(UD.at([1.002, 0])).toBe(false);
		expect(UD.at([0, 1.002])).toBe(false);
	});

	test("кастомный EPS: жёсткий режит границу", () => {
		expect(UD.at([1.0005, 0], 1e-4)).toBe(false);
		expect(UD.at([1.0005, 0], 1e-3)).toBe(true);
	});

	test("только одна компонента снаружи → false", () => {
		expect(UD.at([0.5, 1.5])).toBe(false);
		expect(UD.at([1.5, 0.5])).toBe(false);
	});
});

describe("UD.in: точка строго внутри (|d| < 1 с EPS)", () => {
	test("центр [0, 0] → true", () => {
		expect(UD.has([0, 0])).toBe(true);
	});

	test("внутри [|d| < 1] → true", () => {
		expect(UD.has([0.5, 0.5])).toBe(true);
		expect(UD.has([-0.5, -0.5])).toBe(true);
		expect(UD.has([0.9, 0.9])).toBe(true);
		expect(UD.has([-0.9, 0.9])).toBe(true);
	});

	test("контур [|d| = 1] → false (граница исключена)", () => {
		expect(UD.has([1, 1])).toBe(false);
		expect(UD.has([-1, -1])).toBe(false);
		expect(UD.has([1, 0])).toBe(false);
		expect(UD.has([0, 1])).toBe(false);
		expect(UD.has([-1, 0.5])).toBe(false);
	});

	test("снаружи [|d| > 1] → false", () => {
		expect(UD.has([1.5, 0])).toBe(false);
		expect(UD.has([0, 1.5])).toBe(false);
		expect(UD.has([2, 2])).toBe(false);
	});

	test("Infinity в любой компоненте → false", () => {
		expect(UD.has([Infinity, 0])).toBe(false);
		expect(UD.has([0, Infinity])).toBe(false);
		expect(UD.has([Infinity, Infinity])).toBe(false);
	});

	test("EPS-толерантность: 1 - EPS/2 → false (близко к контуру)", () => {
		expect(UD.has([0.9995, 0.9995])).toBe(false);
		expect(UD.has([-0.9995, 0])).toBe(false);
	});

	test("EPS-толерантность: 1 - EPS*2 → true (достаточно глубоко)", () => {
		expect(UD.has([0.998, 0.998])).toBe(true);
		expect(UD.has([0.998, 0])).toBe(true);
	});

	test("кастомный EPS: мягкий пропускает ближе к контуру", () => {
		expect(UD.has([0.9995, 0], 1e-3)).toBe(false);
		expect(UD.has([0.9995, 0], 1e-4)).toBe(true);
	});

	test("только одна компонента на контуре → false", () => {
		expect(UD.has([0.5, 1])).toBe(false);
		expect(UD.has([1, 0.5])).toBe(false);
	});

	test("in ⇒ at (строгое ⇒ нестрогое)", () => {
		const depths: [number, number][] = [
			[0, 0],
			[0.5, 0.5],
			[-0.9, 0.9],
			[1, 1],
			[1.5, 0],
			[Infinity, 0],
		];
		for (const d of depths) {
			expect(UD.has(d) && !UD.at(d)).toBe(false);
		}
	});
});
