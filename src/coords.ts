import type { RoundMethod } from "./support/math.js";
import { lerp, round } from "./support/math.js";
import { eq } from "./support/epsilon.js";
import type { RenderTickContext } from "./render.js";
import { Render } from "./render.js";
import type * as CT from "./types.js";

class iUC2 {
	/** Толерантность сравнения координат (`1e-3`, 3 знака). Согласована с {@link __fraction}. */
	__eps = 1e-3;

	/** Толерантность коллинеарности через `vect` (`1e-10`). Абсолютная, зависит от длин векторов. */
	__vect_eps = 1e-10;

	/** Кол-во знаков округления по умолчанию (`3`), согласовано с {@link __eps}. */
	__fraction = 3;

	/** Кэш `zero()` для дефолтных аргументов. */
	__zero = this.zero();

	//...

	/**
	 * Фабрика точки `zero(x = 0, y = x)`.
	 */
	zero(x: number = 0, y: number = x): CT.C2 {
		return { x, y };
	}

	/**
	 * Поверхностная копия: новый объект с теми же `x`/`y`.
	 */
	copy(p: CT.C2): CT.C2 {
		return { x: p.x, y: p.y };
	}

	/**
	 * **Мутирует** `p`: копирует значения из `expected`.
	 * По умолчанию `expected = {0, 0}`.
	 *
	 * Используется в `assign`-семействе (`UB.assign`, `US.assign`, `UE.assign`, `Camera.assign`) — единственный публичный способ мутировать входной объект.
	 */
	assign(p: CT.C2, expected: CT.C2 = this.__zero): void {
		p.x = expected.x;
		p.y = expected.y;
	}

	//...

	/**
	 * Структурно точное равенство c `EPS` по обеим осям.
	 *
	 * `b` по умолчанию `{0, 0}` (проверка «точка ли в origin»).
	 * `EPS` переопределяет порог (см. {@link Camera.__eps_center}, {@link Camera.__eps_scale}).
	 *
	 * Без `round`/трансформаций — просто сравнение полей.
	 * Для сравнения с учётом `mode` (отрезок/луч/прямая) — {@link UL.equiv}.
	 */
	eq(a: CT.C2, b: CT.C2 = this.__zero, EPS = this.__eps): boolean {
		return eq(a.x, b.x, EPS) && eq(a.y, b.y, EPS);
	}

	/**
	 * Округление координат до `fraction` знаков.
	 * По умолчанию `__fraction = 3` (согласовано с `__eps = 1e-3
	 */
	round(p: CT.C2, fraction: number = this.__fraction, method?: RoundMethod): CT.C2 {
		return {
			x: round(p.x, fraction, method),
			y: round(p.y, fraction, method),
		};
	}

	/**
	 * Линейная интерполяция `a + (b - a) * t`.
	 *
	 * **Не ограничена** `t ∈ [0, 1]` — допускает экстраполяцию при `t < 0` или `t > 1`.
	 */
	lerp(a: CT.C2, b: CT.C2, t: number): CT.C2 {
		return {
			x: lerp(a.x, b.x, t),
			y: lerp(a.y, b.y, t),
		};
	}

	//...

	/**
	 * Покомпонентный `Math.abs` — модуль каждой координаты.
	 */
	abs(p: CT.C2): CT.C2 {
		return { x: Math.abs(p.x), y: Math.abs(p.y) };
	}

	/**
	 * Покомпонентное умножение на скаляр.
	 */
	mult(p: CT.C2, c: number): CT.C2 {
		return { x: p.x * c, y: p.y * c };
	}

	/**
	 * Покомпонентное деление на скаляр.
	 */
	div(p: CT.C2, c: number): CT.C2 {
		return { x: p.x / c, y: p.y / c };
	}

	/**
	 * Покомпонентная сумма точек. Без аргументов возвращает `{0, 0}`.
	 */
	sum(...points: CT.C2[]): CT.C2 {
		let sumX = 0;
		let sumY = 0;
		for (const p of points) {
			sumX += p.x;
			sumY += p.y;
		}
		return { x: sumX, y: sumY };
	}

	/**
	 * Покомпонентное вычитание точек.
	 */
	sub(a: CT.C2, ...points: CT.C2[]): CT.C2 {
		let resultX = a.x;
		let resultY = a.y;
		for (const p of points) {
			resultX -= p.x;
			resultY -= p.y;
		}
		return { x: resultX, y: resultY };
	}

	/**
	 * Арифметическое среднее точек.
	 * Без аргументов возвращает `{0, 0}` (избегает деления на ноль — `count = 1`).
	 */
	mid(...points: CT.C2[]): CT.C2 {
		const sum = this.sum(...points);
		const count = points.length || 1;
		return { x: sum.x / count, y: sum.y / count };
	}

	//...

	/**
	 * Математический поворот точки `p` вокруг `origin` на угол `angle` (радианы):
	 * положительный — против часовой, отрицательный — по часовой.
	 */
	rotate(p: CT.C2, origin: CT.C2, angle: number): CT.C2 {
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const dx = p.x - origin.x;
		const dy = p.y - origin.y;
		return {
			x: origin.x + dx * cos - dy * sin,
			y: origin.y + dx * sin + dy * cos,
		};
	}

	/**
	 * Обратный поворот к {@link UC2.rotate}: эквивалент `UC2.rotate(p, origin, -angle)`.
	 */
	unrotate(rotated: CT.C2, origin: CT.C2, angle: number): CT.C2 {
		return this.rotate(rotated, origin, -angle);
	}

	/**
	 * Угол в радианах от направления `anchor → point`.
	 * Положительный — против часовой стрелки, диапазон `(-π, π]`.
	 *
	 * Эквивалент `Math.atan2(dy, dx)`.
	 */
	angle(anchor: CT.C2, point: CT.C2): number {
		return Math.atan2(point.y - anchor.y, point.x - anchor.x);
	}

	//...

	/**
	 * `p` в локальных координатах с origin = `anchor`: `p − anchor`.
	 * Парный к {@link UC2.unlocal}.
	 */
	local(anchor: CT.C2, p: CT.C2): CT.C2 {
		return { x: p.x - anchor.x, y: p.y - anchor.y };
	}

	/**
	 * Обратный к {@link UC2.local}: `p + anchor` (возврат из локальных координат).
	 */
	unlocal(anchor: CT.C2, p: CT.C2): CT.C2 {
		return { x: p.x + anchor.x, y: p.y + anchor.y };
	}

	//...

	/**
	 * Вектор направления от `a` к `b`: `b − a`.
	 *
	 * Если `a` подвинуть на этот вектор — точки совпадут.
	 * Парный к {@link UC2.move}.
	 */
	direct(a: CT.C2, b: CT.C2): CT.C2 {
		return { x: b.x - a.x, y: b.y - a.y };
	}

	/**
	 * Сдвиг точки на вектор: `a + vec`. Возвращает новый объект, не мутирует `a`.
	 *
	 * Парный к {@link UC2.direct}: `move(a, direct(a, b)) ≈ b` (с `EPS`).
	 */
	move(a: CT.C2, vec: CT.C2): CT.C2 {
		return { x: a.x + vec.x, y: a.y + vec.y };
	}

	//...

	/**
	 * Длина (модуль) вектора. Эквивалент `Math.hypot(v.x, v.y)`.
	 */
	len(v: CT.C2): number {
		return Math.hypot(v.x, v.y);
	}

	/**
	 * Евклидово расстояние между двумя точками.
	 */
	dist(a: CT.C2, b: CT.C2): number {
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	//...

	/**
	 * Зеркалирование относительно начала координат (умножение на `-1`).
	 */
	invert(p: CT.C2): CT.C2 {
		return { x: -p.x, y: -p.y };
	}

	/**
	 * Перпендикулярный вектор — поворот на 90° против часовой: `(-y, x)`.
	 *
	 * Длина сохраняется: `|UC2.perpend(v)| === |v|`. Не нормализует.
	 * Используется для нормалей к рёбрам, направления «вбок» от вектора, построения локального базиса «вперёд + вбок».
	 */
	perpend(p: CT.C2): CT.C2 {
		return { x: -p.y, y: p.x };
	}

	/**
	 * Единичная нормаль к вектору: `{ -v.y / |v|, v.x / |v| }`.
	 *
	 * Эквивалент `UC2.perpend(UC2.mult(v, 1 / UC2.len(v)))` без промежуточных объектов.
	 *
	 * @returns `{0, 0}` для нулевого вектора (`|v| === 0`).
	 */
	normal(v: CT.C2): CT.C2 {
		const len = Math.hypot(v.x, v.y);
		if (len === 0) return { x: 0, y: 0 };
		return { x: -v.y / len, y: v.x / len };
	}

	//...

	/**
	 * Векторное (косое) произведение `v1 × v2 = v1.x * v2.y - v1.y * v2.x`.
	 *
	 * Знак определяет ориентацию кратчайшего поворота от `v1` к `v2`:
	 * `> 0` — против часовой,
	 * `< 0` — по часовой,
	 * `≈ 0` — коллинеарны.
	 *
	 * Используется в SAT-проекциях ({@link Convex.mtv}), классификации Convex ({@link Convex.is}), предикатах коллинеарности ({@link UL.similar}) и подсчёте площади.
	 *
	 * В предикатах применяется с порогом `__vect_eps`.
	 */
	vect(v1: CT.C2, v2: CT.C2): number {
		return v1.x * v2.y - v1.y * v2.x;
	}

	/**
	 * Удвоенная ориентированная площадь треугольника `a, b, c` (Y-вверх, правая система): `vect(a, b) + vect(b, c) + vect(c, a)`.
	 *
	 * Шорткат для «веерного» разбиения полигона на треугольники с общей вершиной `a`: сумма `ccw` по всем `c` ∈ polygon (без `a`) даёт удвоенную площадь.
	 *
	 * Знак канонический для математической плоскости: `> 0` — CCW, `< 0` — CW, `≈ 0` — коллинеарны.
	 * Инвертируется при перестановке любых двух точек.
	 */
	ccw(a: CT.C2, b: CT.C2, c: CT.C2): number {
		return this.vect(a, b) + this.vect(b, c) + this.vect(c, a);
	}

	tick(ctx: RenderTickContext<CT.C2>, hook?: (current: CT.C2) => void): boolean {
		if (this.eq(ctx.current, ctx.target, ctx.eps)) return false;

		const a = Render.alpha(ctx.dt, ctx.tau);
		const lerped = this.lerp(ctx.current, ctx.target, a);

		this.assign(ctx.current, this.eq(ctx.target, lerped, ctx.eps) ? ctx.target : lerped);
		hook?.(ctx.current);
		return true;
	}
}

export const UC2 = new iUC2();
