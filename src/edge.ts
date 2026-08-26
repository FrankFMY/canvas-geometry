import type { RoundMethod } from "./support/math.js";
import { UC2 } from "./coords.js";
import { UD } from "./depth.js";
import type * as CT from "./types.js";

class iUE {
	/** Толерантность сравнения концов (унаследована от `UC2.__eps`). */
	__eps = UC2.__eps;

	/** Толерантность коллинеарности (унаследована от `UC2.__vect_eps`). */
	__vect_eps = UC2.__vect_eps;

	/** Кол-во знаков округления по умолчанию (унаследовано от `UC2.__fraction`). */
	__fraction = UC2.__fraction;

	/** Кэш `zero()` для дефолтных аргументов. */
	__zero = this.zero();

	//...

	/**
	 * Фабрика ребра `zero(a = {0,0}, b = a)`.
	 */
	zero(a: CT.C2 = UC2.__zero, b: CT.C2 = a): CT.Edge {
		return [UC2.copy(a), UC2.copy(b)];
	}

	/**
	 * Поверхностная копия: новый `[copy(e[0]), copy(e[1])]`.
	 */
	copy(e: CT.Edge): CT.Edge {
		return [UC2.copy(e[0]), UC2.copy(e[1])];
	}

	/**
	 * **Мутирует** `e`: копирует значения из `expected`.
	 * По умолчанию `expected` — вырожденное ребро-точка в origin.
	 */
	assign(e: CT.Edge, expected: CT.Edge = this.__zero): void {
		e[0] = UC2.copy(expected[0]);
		e[1] = UC2.copy(expected[1]);
	}

	//...

	/**
	 * Структурно точное равенство концов c `EPS`: `e[0] ≈ b[0]` и `e[1] ≈ b[1]`.
	 */
	eq(a: CT.Edge, b: CT.Edge, EPS = this.__eps): boolean {
		return UC2.eq(a[0], b[0], EPS) && UC2.eq(a[1], b[1], EPS);
	}

	/**
	 * Округление концов до `fraction` знаков.
	 * По умолчанию `__fraction = 3`, согласовано с `__eps`.
	 */
	round(a: CT.Edge, fraction: number = this.__fraction, method?: RoundMethod): CT.Edge {
		return [UC2.round(a[0], fraction, method), UC2.round(a[1], fraction, method)];
	}

	/**
	 * Линейная интерполяция концов.
	 * **Не ограничена** `t ∈ [0, 1]` — экстраполяция допускается.
	 */
	lerp(a: CT.Edge, b: CT.Edge, t: number): CT.Edge {
		return [UC2.lerp(a[0], b[0], t), UC2.lerp(a[1], b[1], t)];
	}

	//...

	/**
	 * Канон пустоты: ребро вырождено в точку (концы совпадают с `EPS`).
	 *
	 * Канонически: точка — самый базовый примитив, и ребро с совпавшими концами ведёт себя как точка.
	 */
	isEmpty(e: CT.Edge, EPS = this.__eps): boolean {
		return UC2.eq(e[0], e[1], EPS);
	}

	/**
	 * Направляющие векторы двух линий: `[v_a, v_b]`, где `v_x = points[1] − points[0]`.
	 */
	direct(a: CT.Edge, b: CT.Edge): [CT.C2, CT.C2] {
		const [a1, a2] = a;
		const [b1, b2] = b;
		return [UC2.direct(a1, a2), UC2.direct(b1, b2)];
	}

	/**
	 * Геометрический центр ребра: середина между `e[0]` и `e[1]`. Эквивалент `UC2.lerp(e[0], e[1], 0.5)`.
	 *
	 * Канон: «точка между максимально удалёнными точками, описывающими линию» — для ребра это и есть его концы.
	 */
	center(e: CT.Edge): CT.C2 {
		return UC2.mid(e[0], e[1]);
	}

	//...

	/**
	 * Предикаты коллинеарности/параллельности. Базовая проверка: направляющие коллинеарны (`|vect(v1, v2)| <= __vect_eps`).
	 *
	 * - **collinear** — линии лежат на одной прямой или параллельны (самый слабый предикат);
	 * - **parallel** — коллинеарны + точки **не** лежат на одной прямой (строго параллельны на разных прямых);
	 * - **similar** — коллинеарны + точки лежат на одной прямой.
	 *
	 * Пустая линия (`isEmpty`) считается подобной самой себе и **не** подобной непустой; иначе пустая даёт неопределённый `direct`.
	 */
	collinear(a: CT.Edge, b: CT.Edge, EPS = this.__vect_eps): boolean {
		if (this.isEmpty(a)) return this.isEmpty(b);
		if (this.isEmpty(b)) return false;
		const [v1, v2] = this.direct(a, b);
		return Math.abs(UC2.vect(v1, v2)) <= EPS;
	}

	/**
	 * `collinear` + точки **не** лежат на одной прямой.
	 * Пустая линия считается параллельной только самой себе. См. {@link iUE.collinear}.
	 */
	parallel(a: CT.Edge, b: CT.Edge, EPS = this.__vect_eps): boolean {
		if (this.isEmpty(a)) return this.isEmpty(b);
		if (this.isEmpty(b)) return false;
		const [v1, v2] = this.direct(a, b);
		if (Math.abs(UC2.vect(v1, v2)) > EPS) return false;
		const d3 = UC2.direct(a[0], b[0]);
		return Math.abs(UC2.vect(d3, v1)) > EPS;
	}

	/**
	 * `collinear` + точки лежат на одной прямой.
	 * Пустая линия считается подобной только самой себе. См. {@link iUE.collinear}.
	 */
	similar(a: CT.Edge, b: CT.Edge, EPS = this.__vect_eps): boolean {
		if (this.isEmpty(a)) return this.isEmpty(b);
		if (this.isEmpty(b)) return false;
		const [v1, v2] = this.direct(a, b);
		if (Math.abs(UC2.vect(v1, v2)) > EPS) return false;
		const d3 = UC2.direct(a[0], b[0]);
		return Math.abs(UC2.vect(d3, v1)) <= EPS;
	}

	//...

	/**
	 * Глубина точки `p` относительно ребра `e` как `Depth = [number, number]`.
	 *
	 * Канон: 0 = центр, ±1 = контур, `Infinity` = вне. У линии одна ось:
	 *
	 * - **линия** (не пустая): `[t, t]` если `p` на прямой (`t` — параметр вдоль, `0` = центр, `±1` = концы, `|t| > 1` за концом); `[t, Infinity]` если `p` не на прямой (`t` — проекция, `Infinity` — перпендикулярное отклонение);
	 * - **точка** (`isEmpty`): `[0, 0]` если `p ≈ e[0]`, иначе `[Infinity, Infinity]`.
	 *
	 * `Infinity` позволяет {@link UD.at} единообразно давать `false` для точек вне фигуры без передачи контекста типа.
	 * Перпендикулярное расстояние вычисляется с порогом `__eps` (1e-3).
	 */
	depth(e: CT.Edge, p: CT.C2): CT.Depth {
		if (this.isEmpty(e)) return UC2.eq(e[0], p) ? [0, 0] : [Infinity, Infinity];
		const dir = UC2.direct(e[0], e[1]);
		const len2 = dir.x * dir.x + dir.y * dir.y;
		const center = this.center(e);
		const rel = UC2.local(center, p);
		const perp = Math.abs(UC2.vect(dir, rel)) / Math.sqrt(len2);
		const dot = rel.x * dir.x + rel.y * dir.y;
		const t = (2 * dot) / len2;
		if (perp > this.__eps) return [t, Infinity];
		return [t, t];
	}

	/**
	 * Единственная точка пересечения рёбер как отрезков.
	 *
	 * Делегирует в {@link iUE.cross} + фильтрует через {@link UD.at} по обоим depth (точка должна лежать внутри обоих отрезков: `|depth| ≤ 1`).
	 *
	 * @returns `C2` — точка пересечения; `null` — коллинеарны, не пересекаются, или точка за пределами одного из отрезков.
	 */
	joint(a: CT.Edge, b: CT.Edge): CT.C2 | null {
		const c = this.cross(a, b);
		if (c === true || c === false) return null;
		if (!UD.at(c[1]) || !UD.at(c[2])) return null;
		return c[0];
	}

	/**
	 * Точка пересечения прямых, на которых лежат рёбра, с глубинами по каждому.
	 *
	 * @returns
	 * - `[point, depth_a, depth_b]` — единственная точка пересечения прямых (без проверки принадлежности отрезкам);
	 * - `true` — рёбра коллинеарны ({@link iUE.similar}), бесконечно много точек;
	 * - `false` — параллельны на разных прямых, либо точка-точка не совпадают.
	 */
	cross(a: CT.Edge, b: CT.Edge): [CT.C2, CT.Depth, CT.Depth] | true | false {
		if (this.isEmpty(a)) {
			if (this.isEmpty(b)) {
				return UC2.eq(a[0], b[0]) ? [UC2.copy(a[0]), [0, 0], [0, 0]] : false;
			}
			const p = a[0];
			const depth = this.depth(b, p);
			if (!Number.isFinite(depth[1])) return false;
			return [UC2.copy(p), [0, 0], depth];
		}
		if (this.isEmpty(b)) {
			const p = b[0];
			const depth = this.depth(a, p);
			if (!Number.isFinite(depth[1])) return false;
			return [UC2.copy(p), depth, [0, 0]];
		}

		const [v1, v2] = this.direct(a, b);
		const vect = UC2.vect(v1, v2);
		if (Math.abs(vect) <= this.__vect_eps) {
			return !!this.similar(a, b);
		}

		const [a0] = a;
		const [b0] = b;

		const ac = UC2.direct(a0, b0);
		const t = UC2.vect(ac, v2) / vect;
		const u = UC2.vect(ac, v1) / vect;

		return [{ x: a0.x + t * v1.x, y: a0.y + t * v1.y }, [t * 2 - 1, t * 2 - 1], [u * 2 - 1, u * 2 - 1]];
	}

	/**
	 * Пересекаются ли контуры рёбер хотя бы в одной точке (boolean).
	 *
	 * Канон контура: вся линия **включая концы**.
	 * Касание концами, коллинеарное перекрытие и крестовое пересечение — всё `true`.
	 * Симметричен.
	 */
	intersect(a: CT.Edge, b: CT.Edge): boolean {
		if (this.joint(a, b) !== null) return true;
		if (this.cross(a, b) !== true) return false;

		const da0 = this.depth(b, a[0]);
		const da1 = this.depth(b, a[1]);
		const db0 = this.depth(a, b[0]);
		const db1 = this.depth(a, b[1]);
		return UD.at(da0) || UD.at(da1) || UD.at(db0) || UD.at(db1);
	}
}

export const UE = new iUE();
