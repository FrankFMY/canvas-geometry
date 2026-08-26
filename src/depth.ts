import { eq, lt, lte } from "./support/epsilon.js";
import { UC2 } from "./coords.js";
import type * as CT from "./types.js";

class iUD {
	/** Толерантность сравнения компонент глубины (унаследована от `UC2.__eps`). */
	__eps = UC2.__eps;

	//...

	/**
	 * Фабрика нулевой глубины: `[0, 0]` (центр фигуры).
	 */
	zero(): CT.Depth {
		return [0, 0];
	}

	/**
	 * Фабрика бесконечной глубины: `[Infinity, Infinity]` (вне по обеим осям).
	 */
	infinity(): CT.Depth {
		return [Infinity, Infinity];
	}

	/**
	 * Поверхностная копия: новый `[d[0], d[1]]`.
	 */
	copy(d: CT.Depth): CT.Depth {
		return [d[0], d[1]];
	}

	/**
	 * Структурно точное равенство обеих компонент c `EPS`.
	 *
	 * `Infinity` сравнивается строго: `eq(Infinity, Infinity)` → `false` (через `Math.abs(NaN) ≤ EPS`).
	 * Это намеренно — `Infinity` кодирует «вне по этой оси», и две разные позиции «вне» не равны.
	 */
	eq(a: CT.Depth, b: CT.Depth, EPS = this.__eps): boolean {
		return eq(a[0], b[0], EPS) && eq(a[1], b[1], EPS);
	}

	//...

	/**
	 * `true`, если обе компоненты конечны (нет `Infinity`).
	 *
	 * `Infinity` кодирует «точка вне фигуры по этой оси» и используется для раннего reject в предикатах.
	 */
	isFinite(d: CT.Depth): boolean {
		return Number.isFinite(d[0]) && Number.isFinite(d[1]);
	}

	/**
	 * Точка **строго внутри** фигуры (контур исключён): `|d| < 1` с `EPS`.
	 *
	 * `Infinity` в любой компоненте → `false`.
	 * Точка на контуре (`|d| ≈ 1`) → `false`.
	 */
	has(d: CT.Depth, EPS = this.__eps): boolean {
		return lt(Math.abs(d[0]), 1, EPS) && lt(Math.abs(d[1]), 1, EPS);
	}

	/**
	 * Точка **на** фигуре (внутри или на контуре): `|d| ≤ 1` с `EPS`.
	 *
	 * `Infinity` в любой компоненте → `false` (точка вне фигуры по этой оси).
	 */
	at(d: CT.Depth, EPS = this.__eps): boolean {
		return lte(Math.abs(d[0]), 1, EPS) && lte(Math.abs(d[1]), 1, EPS);
	}
}

export const UD = new iUD();
