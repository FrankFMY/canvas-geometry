import { gte } from "./support/epsilon.js";
import { UC2 } from "./coords.js";
import { UD } from "./depth.js";
import { UE } from "./edge.js";
import type * as CT from "./types.js";

class iUL {
	/** Толерантность сравнения концов (унаследована от `UC2.__eps`). */
	__eps = UC2.__eps;

	/** Толерантность коллинеарности (унаследована от `UC2.__vect_eps`). */
	__vect_eps = UC2.__vect_eps;

	//...

	/**
	 * Фабрика {@link Line} (segment) между `a` и `b`.
	 *
	 * `mode` опционален: см. {@link Line.mode}.
	 */
	zero(mode?: CT.Line["mode"], a?: CT.C2, b?: CT.C2): CT.Line {
		return {
			type: "line",
			points: UE.zero(a, b),
			mode,
		};
	}

	/**
	 * Структурно точное равенство концов c `EPS`.
	 *
	 * Для сравнения с учётом `mode` — {@link iUL.equiv}.
	 */
	eq(a: CT.Line, b: CT.Line, EPS = this.__eps): boolean {
		return a.mode === b.mode && UE.eq(a.points, b.points, EPS);
	}

	/**
	 * Равенство с учётом `mode`:
	 * - `infinity` — через {@link iUL.collinear};
	 * - `ray` — точка старта + {@link iUL.similar};
	 * - `segment` (или `undefined`) — обе точки строго.
	 *
	 * Различающийся `mode` → `false`.
	 * Две пустые линии — `true` (любые `mode`).
	 *
	 * Параметр `EPS` — координатная толерантность для сравнения точек старта луча;
	 * коллинеарность/параллельность всегда проверяются через `__vect_eps` (их корректность
	 * зависит от длин векторов, а не от координатного EPS).
	 */
	equiv(a: CT.Line, b: CT.Line, EPS = this.__eps): boolean {
		if (a.mode !== b.mode) return false;
		if (this.isEmpty(a)) return this.isEmpty(b);
		if (a.mode === "infinity") return this.collinear(a, b, this.__vect_eps);
		if (a.mode === "ray") return UC2.eq(a.points[0], b.points[0], EPS) && this.similar(a, b, this.__vect_eps);
		return this.eq(a, b, EPS);
	}

	//...

	/**
	 * Канон пустоты: линия вырождена в точку (концы совпадают с `EPS`).
	 *
	 * Канонически: точка — базовый примитив, пустая линия ведёт себя как точка.
	 */
	isEmpty(e: CT.Line, EPS = this.__eps): boolean {
		return UE.isEmpty(e.points, EPS);
	}

	/**
	 * Направляющие векторы двух линий: `[v_a, v_b]`, где `v_x = points[1] − points[0]`.
	 *
	 * Делегирует в {@link UE.direct}.
	 */
	direct(a: CT.Line, b: CT.Line): [CT.C2, CT.C2] {
		return UE.direct(a.points, b.points);
	}

	//...

	/**
	 * Предикаты коллинеарности/параллельности. Базовая проверка: направляющие коллинеарны (`|vect(v1, v2)| <= __vect_eps`).
	 *
	 * - **collinear** — линии лежат на одной прямой или параллельны;
	 * - **parallel** — коллинеарны + точки **не** лежат на одной прямой;
	 * - **similar** — коллинеарны + точки лежат на одной прямой.
	 *
	 * Пустая линия (`isEmpty`) считается коллинеарной/параллельной/подобной только самой себе.
	 * Делегируют в {@link UE}.
	 */
	collinear(a: CT.Line, b: CT.Line, EPS = this.__vect_eps): boolean {
		return UE.collinear(a.points, b.points, EPS);
	}

	/**
	 * `collinear` + точки **не** лежат на одной прямой.
	 * Пустая линия считается параллельной только самой себе. См. {@link iUL.collinear}.
	 */
	parallel(a: CT.Line, b: CT.Line, EPS = this.__vect_eps): boolean {
		return UE.parallel(a.points, b.points, EPS);
	}

	/**
	 * `collinear` + точки лежат на одной прямой.
	 * Пустая линия считается подобной только самой себе. См. {@link iUL.collinear}.
	 */
	similar(a: CT.Line, b: CT.Line, EPS = this.__vect_eps): boolean {
		return UE.similar(a.points, b.points, EPS);
	}

	//...

	/**
	 * Алиас к {@link UE.cross}. Возвращает `[point, depth_a, depth_b]`, `true` (коллинеарны) или `false`.
	 *
	 * Подробности формата — в JSDoc {@link UE.cross}.
	 */
	cross(a: CT.Line, b: CT.Line): [CT.C2, CT.Depth, CT.Depth] | true | false {
		return UE.cross(a.points, b.points);
	}

	/**
	 * Принадлежность глубины линии с учётом `mode`:
	 * - `segment` (или `undefined`) — `|depth| ≤ 1` по обеим компонентам ({@link UD.at});
	 * - `ray` — `depth ≥ -1` по обеим компонентам (начало луча включено, `Infinity` → `false`);
	 * - `infinity` — точка на прямой (`depth` конечный, не `Infinity`).
	 */
	shallow(line: CT.Line, depth: CT.Depth, EPS = this.__vect_eps): boolean {
		switch (line.mode) {
			case "ray":
				return UD.isFinite(depth) && gte(depth[0], -1, EPS) && gte(depth[1], -1, EPS);
			case "infinity":
				return UD.isFinite(depth);
			default:
				return UD.at(depth, EPS);
		}
	}

	/**
	 * Единственная точка пересечения линий: {@link iUL.cross} + {@link iUL.shallow} по обоим depth (с учётом `mode` каждой).
	 *
	 * @returns `C2` — точка пересечения внутри обеих линий; `null` — пересечения нет (коллинеарны, мимо, или точка за пределами по `mode`).
	 *
	 * При `cross === true` (бесконечно много точек) возвращает `null` — для проверки факта пересечения используйте {@link iUL.intersect}.
	 */
	joint(a: CT.Line, b: CT.Line): CT.C2 | null {
		const c = this.cross(a, b);
		if (c === true || c === false) return null;
		if (!this.shallow(a, c[1]) || !this.shallow(b, c[2])) return null;
		return c[0];
	}

	/**
	 * Пересечение контуров линий: `true`, если есть хотя бы одна общая точка.
	 *
	 * Канон контура: вся линия **включая концы**.
	 * Касание концами, коллинеарное перекрытие и крестовое пересечение — всё `true`.
	 * Симметричен.
	 */
	intersect(a: CT.Line, b: CT.Line): boolean {
		if (this.joint(a, b) !== null) return true;
		if (this.cross(a, b) !== true) return false;

		const [a0, a1] = a.points;
		const [b0, b1] = b.points;

		const da0 = UE.depth(b.points, a0);
		const da1 = UE.depth(b.points, a1);
		const db0 = UE.depth(a.points, b0);
		const db1 = UE.depth(a.points, b1);

		return this.shallow(b, da0) || this.shallow(b, da1) || this.shallow(a, db0) || this.shallow(a, db1);
	}
}

export const UL = new iUL();
