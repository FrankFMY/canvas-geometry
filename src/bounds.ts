import type { P4, SPN } from "./support/spacing.js";
import type { RoundMethod } from "./support/math.js";
import { clamp, lerp, round } from "./support/math.js";
import { eq, gt, gte, lt, lte } from "./support/epsilon.js";
import { UC2 } from "./coords.js";
import { UL } from "./line.js";
import { US } from "./size.js";
import type * as CT from "./types.js";

class iUB {
	/** Толерантность сравнения границ (унаследована от `UC2.__eps`). */
	__eps = UC2.__eps;

	/** Толерантность коллинеарности (унаследована от `UC2.__vect_eps`). */
	__vect_eps = UC2.__vect_eps;

	/** Кол-во знаков округления по умолчанию (унаследовано от `UC2.__fraction`). */
	__fraction = UC2.__fraction;

	/** Кэш `zero()` для дефолтных аргументов. */
	__zero = this.zero();

	//...

	/**
	 * Фабрика `zero(x = 0, y = x)`.
	 */
	zero(x: number = 0, y: number = x): CT.Bounds {
		return { minX: x, minY: y, maxX: x, maxY: y };
	}

	/**
	 * Бесконечно малые `Bounds`.
	 * Являются нейтральным стартовым аккумулятором.
	 */
	infinity(): CT.Bounds {
		return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
	}

	/**
	 * Поверхностная копия: новый объект с теми же границами.
	 */
	copy(b: CT.Bounds): CT.Bounds {
		return {
			minX: b.minX,
			minY: b.minY,
			maxX: b.maxX,
			maxY: b.maxY,
		};
	}

	/**
	 * **Мутирует** `b`: копирует границы из `expected`.
	 * По умолчанию `expected = {0, 0}`-точка.
	 *
	 * Канон: `assign` — единственный метод, мутирующий входной объект.
	 */
	assign(b: CT.Bounds, expected: CT.Bounds = this.__zero): void {
		b.minX = expected.minX;
		b.minY = expected.minY;
		b.maxX = expected.maxX;
		b.maxY = expected.maxY;
	}

	//...

	/**
	 * Структурно точное равенство c `EPS` по всем 4 границам.
	 * `b` по умолчанию `zero()`.
	 */
	eq(a: CT.Bounds, b: CT.Bounds = this.__zero, EPS = this.__eps): boolean {
		return eq(a.minX, b.minX, EPS) && eq(a.minY, b.minY, EPS) && eq(a.maxX, b.maxX, EPS) && eq(a.maxY, b.maxY, EPS);
	}

	/**
	 * Округление границ до `fraction` знаков.
	 * По умолчанию `__fraction = 3`, согласовано с `__eps`.
	 */
	round(b: CT.Bounds, fraction: number = this.__fraction, method?: RoundMethod): CT.Bounds {
		return {
			minX: round(b.minX, fraction, method),
			minY: round(b.minY, fraction, method),
			maxX: round(b.maxX, fraction, method),
			maxY: round(b.maxY, fraction, method),
		};
	}

	/**
	 * Линейная интерполяция границ.
	 * **Не ограничена** `t ∈ [0, 1]` — допускает экстраполяцию.
	 */
	lerp(a: CT.Bounds, b: CT.Bounds, t: number): CT.Bounds {
		return {
			minX: lerp(a.minX, b.minX, t),
			minY: lerp(a.minY, b.minY, t),
			maxX: lerp(a.maxX, b.maxX, t),
			maxY: lerp(a.maxY, b.maxY, t),
		};
	}

	/**
	 * Сдвиг `Bounds` на вектор: все 4 границы сдвигаются на `vec`. Возвращает новый объект.
	 *
	 * Парный к {@link Convex.mtv}: `move(a, mtv(a, b))` гасит коллизию.
	 */
	move(b: CT.Bounds, vec: CT.C2): CT.Bounds {
		return {
			minX: b.minX + vec.x,
			minY: b.minY + vec.y,
			maxX: b.maxX + vec.x,
			maxY: b.maxY + vec.y,
		};
	}

	//...

	/**
	 * **Мутирует** аккумулятор `b`: расширяет его, чтобы включить `points`.
	 *
	 * Используется для построения `Bounds` из набора точек ({@link iUB.from}).
	 */
	push(b: CT.Bounds, ...points: CT.C2[]): void {
		for (const { x, y } of points) {
			if (x < b.minX) b.minX = x;
			if (y < b.minY) b.minY = y;
			if (x > b.maxX) b.maxX = x;
			if (y > b.maxY) b.maxY = y;
		}
	}

	/**
	 * `Bounds`, охватывающий все точки. Пустой массив → `zero()`-точка в {0,0}.
	 *
	 * Стартует от {@link iUB.infinity}-аккумулятора и {@link iUB.push}-ит точки.
	 */
	from(points: CT.C2[]): CT.Bounds {
		if (points.length === 0) return this.zero();
		const acc = this.infinity();
		this.push(acc, ...points);
		return acc;
	}

	/**
	 * Обёртка {@link iUB.from} для вариадик-вызова: `UB.create(p1, p2, ...)`.
	 */
	create(...points: CT.C2[]): CT.Bounds {
		return this.from(points);
	}

	//...

	/**
	 * **Мутирует** аккумулятор `a`: расширяет его, чтобы включить `bounds`.
	 *
	 * Используется для объединения `Bounds` в {@link iUB.combine}.
	 */
	mix(a: CT.Bounds, ...bounds: CT.Bounds[]): void {
		for (const b of bounds) {
			if (b.minX < a.minX) a.minX = b.minX;
			if (b.minY < a.minY) a.minY = b.minY;
			if (b.maxX > a.maxX) a.maxX = b.maxX;
			if (b.maxY > a.maxY) a.maxY = b.maxY;
		}
	}

	/**
	 * Объединение списка `Bounds` в один охватывающий. Пустой список → `zero()`.
	 *
	 * Не мутирует входные объекты — работает с копией-аккумулятором.
	 */
	combine(list: CT.Bounds[]): CT.Bounds {
		if (list.length === 0) return this.zero();
		const acc: CT.Bounds = this.infinity();
		this.mix(acc, ...list);
		return acc;
	}

	/**
	 * Обёртка {@link iUB.combine} для вариадик-вызова: `UB.union(b1, b2, ...)`.
	 */
	union(...bounds: CT.Bounds[]): CT.Bounds {
		return this.combine(bounds);
	}

	//...

	/**
	 * `true`, если обе оси вырождены (`min ≈ max` по X и по Y) — `Bounds`-точка.
	 *
	 * Канон: точка — самый базовый примитив.
	 */
	isPoint(a: CT.Bounds, EPS = this.__eps): boolean {
		return eq(a.minX, a.maxX, EPS) && eq(a.minY, a.maxY, EPS);
	}

	/**
	 * `true`, если ровно одна ось вырождена (`min ≈ max`) — `Bounds`-линия.
	 *
	 * Взаимно исключает {@link iUB.isPoint} (обе оси вырождены).
	 */
	isEdge(a: CT.Bounds, EPS = this.__eps): boolean {
		return (eq(a.minX, a.maxX, EPS) && !eq(a.minY, a.maxY, EPS)) || (!eq(a.minX, a.maxX, EPS) && eq(a.minY, a.maxY, EPS));
	}

	/**
	 * Канон пустоты: `w <= 0` ИЛИ `h <= 0` (с `EPS`). Эквивалентно `minX >= maxX` ИЛИ `minY >= maxY`.
	 *
	 * «Вывернутый» `Bounds` (min > max по оси) тоже считается пустым.
	 * Для нормализованных Bounds работает как проверка вырождения хотя бы одной оси.
	 */
	isEmpty(a: CT.Bounds, EPS = this.__eps): boolean {
		return gte(a.minX, a.maxX, EPS) || gte(a.minY, a.maxY, EPS);
	}

	//...

	/**
	 * Ширина `Bounds` (`maxX - minX`). Отрицательное значение для вывернутого `Bounds` (min > max).
	 */
	width(b: CT.Bounds): number {
		return b.maxX - b.minX;
	}

	/**
	 * Высота `Bounds` (`maxY - minY`). Отрицательное значение для вывернутого `Bounds` (min > max).
	 */
	height(b: CT.Bounds): number {
		return b.maxY - b.minY;
	}

	/**
	 * Размер `Bounds` как `S2`. Допускает отрицательные компоненты (см. {@link width}).
	 */
	size(b: CT.Bounds): CT.S2 {
		return {
			w: b.maxX - b.minX,
			h: b.maxY - b.minY,
		};
	}

	//...

	/**
	 * Левый-верхний угол (`minX`, `minY`) как `C2`.
	 * Для Y-вверх это «юго-западный» угол (по экранной конвенции — верхний).
	 */
	anchor({ minX, minY }: CT.Bounds): CT.C2 {
		return { x: minX, y: minY };
	}

	/**
	 * Геометрический центр `Bounds` со смещением
	 * при асимметричном `padding`: `(left − right) / 2`, `(top − bottom) / 2`.
	 *
	 * При симметричном `padding` (или нулевом) — чистый центр `(min+max)/2`.
	 */
	center(b: CT.Bounds, padding: SPN = 0, absolute: number = 1): CT.C2 {
		const center: CT.C2 = {
			x: (b.minX + b.maxX) / 2,
			y: (b.minY + b.maxY) / 2,
		};
		const [pt, pr, pb, pl] = US.spn(this.size(b), padding, absolute);
		return {
			x: center.x + (pl - pr) / 2,
			y: center.y + (pt - pb) / 2,
		};
	}

	/**
	 * Глубина точки `p` относительно `Bounds` как `Depth = [number, number]`.
	 *
	 * Канон: 0 = центр, ±1 = контур, |val| > 1 — снаружи. `[0]` — глубина по X, `[1]` — по Y.
	 * При `half = 0` (вырожденная ось — точка или линия): `0` если `p` совпадает с центром по этой оси, иначе `Infinity`.
	 *
	 * - точка-Bounds: `[0, 0]` если `p` совпадает, иначе `[Infinity, Infinity]`;
	 * - линия-Bounds: `[t, 0]` если на линии, `[t, Infinity]` если мимо по перпендикулярной оси;
	 * - полигон: `|val| < 1` внутри, `|val| > 1` снаружи.
	 */
	depth(b: CT.Bounds, p: CT.C2): CT.Depth {
		const c = this.center(b);
		const rel = UC2.local(c, p);
		const half = US.div(this.size(b));
		return [half.w === 0 ? (rel.x === 0 ? 0 : Infinity) : rel.x / half.w, half.h === 0 ? (rel.y === 0 ? 0 : Infinity) : rel.y / half.h];
	}

	//...

	/**
	 * 4 угла против часовой (Y-вверх): `[TL, TR, BR, BL]`, где TL = `(minX, minY)`.
	 */
	corners(b: CT.Bounds): CT.Convex {
		return [
			{ x: b.minX, y: b.minY },
			{ x: b.maxX, y: b.minY },
			{ x: b.maxX, y: b.maxY },
			{ x: b.minX, y: b.maxY },
		];
	}

	/**
	 * 4 точки ромба, вписанного в `Bounds` через центр: `[N, E, S, W]` против часовой.
	 *
	 * `N` = top, `W` = left, `E` = right, `S` = bottom.
	 */
	rhomb(b: CT.Bounds): CT.Convex {
		const c = this.center(b);
		return [
			{ x: c.x, y: b.minY },
			{ x: b.maxX, y: c.y },
			{ x: c.x, y: b.maxY },
			{ x: b.minX, y: c.y },
		];
	}

	/**
	 * 4 ребра по часовой от {@link iUB.corners}: `top → right → bottom → left`.
	 *
	 * Каждое — `Edge = [p_start, p_end]`.
	 */
	edges(b: CT.Bounds): CT.Edge[] {
		const c = this.corners(b);
		return [
			[c[0], c[1]],
			[c[1], c[2]],
			[c[2], c[3]],
			[c[3], c[0]],
		];
	}

	//...

	/**
	 * Применяет `P4 = [top, right, bottom, left]` к границам: `minX += left`, `maxX -= right`, `minY += top`, `maxY -= bottom`.
	 *
	 * Может породить отрицательные Bounds.
	 *
	 * Не предназначен для вывернутых Bounds — направление сдвига (прибавить к min, отнять от max) предполагает `min <= max` по каждой оси.
	 */
	pad(b: CT.Bounds, padding: P4): CT.Bounds {
		const [pt, pr, pb, pl] = padding;
		return {
			minX: b.minX + pl,
			maxX: b.maxX - pr,
			minY: b.minY + pt,
			maxY: b.maxY - pb,
		};
	}

	/**
	 * Сжатие `Bounds` на `padding` (отступ «внутрь»). Может породить отрицательные Bounds.
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	deflate(b: CT.Bounds, padding: SPN = 0, absolute: number = 1): CT.Bounds {
		if (padding === 0) return this.copy(b);
		return this.pad(b, US.spn(this.size(b), padding, absolute));
	}

	/**
	 * Расширение `Bounds` на `margin` (отступ «наружу»). Может породить отрицательные Bounds.
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	inflate(b: CT.Bounds, margin: SPN = 0, absolute: number = 1): CT.Bounds {
		if (margin === 0) return this.copy(b);
		const [mt, mr, mb, ml] = US.spn(this.size(b), margin, absolute);
		return this.pad(b, [-mt, -mr, -mb, -ml]);
	}

	//...

	/**
	 * `true`, если хотя бы одна граница `b` совпадает (с `EPS`) с соответствующей границей `a` «изнутри»: `b.min ≈ a.min` и т.д.
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	interior(a: CT.Bounds, b: CT.Bounds, EPS = this.__eps): boolean {
		return eq(b.minX, a.minX, EPS) || eq(b.minY, a.minY, EPS) || eq(b.maxX, a.maxX, EPS) || eq(b.maxY, a.maxY, EPS);
	}

	/**
	 * `true`, если хотя бы одна граница `b` совпадает (с `EPS`) с границей `a` «снаружи».
	 * В Y-вверх: `b.minX ≈ a.maxX` → b справа; `b.minY ≈ a.maxY` → b сверху;
	 * `b.maxX ≈ a.minX` → b слева; `b.maxY ≈ a.minY` → b снизу.
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	exterior(a: CT.Bounds, b: CT.Bounds, EPS = this.__eps): boolean {
		return eq(b.minX, a.maxX, EPS) || eq(b.minY, a.maxY, EPS) || eq(b.maxX, a.minX, EPS) || eq(b.maxY, a.minY, EPS);
	}

	/**
	 * Примыкание границами: {@link iUB.interior} или {@link iUB.exterior}.
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	neighbour(a: CT.Bounds, b: CT.Bounds, EPS = this.__eps): boolean {
		return this.interior(a, b, EPS) || this.exterior(a, b, EPS);
	}

	//...

	/**
	 * Канон владения по оси X.
	 *
	 * Точка (вырождена по X) → `eq` (точка обладает собой).
	 * Линия/полигон (есть протяжённость) → строго внутри (`lt(min) && gt(max)`, касание границы исключается).
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	hasX(b: CT.Bounds, x: number, EPS = this.__eps): boolean {
		if (eq(b.minX, b.maxX, EPS)) return eq(b.minX, x, EPS);
		return lt(b.minX, x, EPS) && gt(b.maxX, x, EPS);
	}

	/**
	 * Канон владения по оси Y. Симметрично {@link iUB.hasX}.
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	hasY(b: CT.Bounds, y: number, EPS = this.__eps): boolean {
		if (eq(b.minY, b.maxY, EPS)) return eq(b.minY, y, EPS);
		return lt(b.minY, y, EPS) && gt(b.maxY, y, EPS);
	}

	/**
	 * Строго внутри по обеим осям по канону владения (`hasX && hasY`):
	 *
	 * - точка-Bounds обладает собой (`has(pt, pt)` → `true`);
	 * - линия-Bounds: точка строго между концами по направляющей оси, `eq` по вырожденной;
	 * - полигон-Bounds: точка строго внутри контура (касание границы = `false`).
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	has(b: CT.Bounds, p: CT.C2, EPS = this.__eps): boolean {
		return this.hasX(b, p.x, EPS) && this.hasY(b, p.y, EPS);
	}

	/**
	 * Канон контура: точка внутри **или на границе** (контур включён).
	 *
	 * - точка → `eq` (совпадение);
	 * - линия → `lte(min) && gte(max)` по обеим: точка на конце линии → `true`;
	 * - полигон → `gte(min) && lte(max)` по обеим осям (включая рёбра и углы).
	 *
	 * В отличие от {@link iUB.has}, включает границу.
	 * Не предназначен для вывернутых Bounds.
	 */
	at(b: CT.Bounds, p: CT.C2, EPS = this.__eps): boolean {
		return gte(p.x, b.minX, EPS) && lte(p.x, b.maxX, EPS) && gte(p.y, b.minY, EPS) && lte(p.y, b.maxY, EPS);
	}

	//...

	/**
	 * Проекция точки `p` на контур `Bounds` (грани + углы).
	 *
	 * - если `p` **внутри** (по канону владения, {@link iUB.has}) — ближайшая грань: одна из координат заменяется на `min`/`max` по ближайшей оси;
	 * - если `p` **снаружи** — `clamp` по каждой оси (проекция на ближайшую грань или угол).
	 *
	 * Для вырожденных Bounds (точка/линия) работает корректно: clamp по вырожденной оси возвращает границу, по направляющей — ближайшую точку отрезка.
	 */
	projection(b: CT.Bounds, p: CT.C2): CT.C2 {
		if (this.has(b, p)) {
			const dist_to_left = p.x - b.minX;
			const dist_to_right = b.maxX - p.x;
			const dist_to_top = p.y - b.minY;
			const dist_to_bottom = b.maxY - p.y;

			const min_dist = Math.min(dist_to_left, dist_to_right, dist_to_top, dist_to_bottom);

			if (min_dist === dist_to_left) return { x: b.minX, y: p.y };
			if (min_dist === dist_to_right) return { x: b.maxX, y: p.y };
			if (min_dist === dist_to_top) return { x: p.x, y: b.minY };
			return { x: p.x, y: b.maxY };
		}
		return {
			x: clamp(b.minX, p.x, b.maxX),
			y: clamp(b.minY, p.y, b.maxY),
		};
	}

	/**
	 * Ближайшая значащая точка `Bounds` к `p` (по канону владения):
	 *
	 * - `p` **внутри** ({@link iUB.has}) → `p` (уже значащая);
	 * - `p` **снаружи** → `clamp` по каждой оси (ближайшая граничная точка).
	 *
	 * Для вырожденных Bounds: точка → сама точка; линия → ближайшая точка отрезка (включая концы); полигон → ближайшая точка на рёбрах.
	 *
	 * @remarks
	 * В отличие от {@link iUB.projection}, на внутренних точках возвращает саму `p`, а не ближайшую грань.
	 */
	nearest(b: CT.Bounds, p: CT.C2): CT.C2 {
		if (this.has(b, p)) return UC2.copy(p);
		return {
			x: clamp(b.minX, p.x, b.maxX),
			y: clamp(b.minY, p.y, b.maxY),
		};
	}

	//...

	/**
	 * `a ⊇ b` (с `EPS`): все значащие точки `b` — значащие точки `a`. Допускает совпадение контуров.
	 *
	 * Формула `gte` по всем 4 границам покрывает все комбинации типов (точка/линия/полигон):
	 * по вырожденной оси `a` (min ≈ max) условие `b.min ≥ a.min && b.max ≤ a.max` вынуждает `b` тоже быть вырожденным по этой оси и совпадать.
	 * То есть точка содержит только точку, линия — только коллинеарные подотрезки, полигон — всё внутри.
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	contain(a: CT.Bounds, b: CT.Bounds, EPS = this.__eps): boolean {
		return gte(b.minX, a.minX, EPS) && gte(b.minY, a.minY, EPS) && gte(a.maxX, b.maxX, EPS) && gte(a.maxY, b.maxY, EPS);
	}

	/**
	 * `a ⊃ b` (с `EPS`): все значащие точки `b` — значащие точки `a`, **без** совпадения контуров (зазор по обоим осям: `gt(b.min, a.min) && gt(a.max, b.max)`).
	 *
	 * Работает только когда `a` — полигон (имеет 2D-внутренность).
	 * Если `a` — точка или линия → всегда `false`: их границы не пропустят никакой `b` внутрь как 2D-область (строгое владение для младших размерностей не определено).
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	owns(a: CT.Bounds, b: CT.Bounds, EPS = this.__eps): boolean {
		if (this.isPoint(a, EPS)) return false;
		if (this.isEdge(a, EPS)) return false;
		return gt(b.minX, a.minX, EPS) && gt(a.maxX, b.maxX, EPS) && gt(b.minY, a.minY, EPS) && gt(a.maxY, b.maxY, EPS);
	}

	/**
	 * Есть ли общая значащая точка (по канону владения) между `a` и `b`:
	 *
	 * - идентичные фигуры → `true`;
	 * - касание общей гранью (без перекрытия внутренностей) → `false`;
	 * - симметричен: `collision(a, b) === collision(b, a)`.
	 *
	 * Корректно покрывает все 9 комбинаций типов (точка/линия/полигон × X).
	 * Не предназначен для вывернутых Bounds.
	 */
	collision(a: CT.Bounds, b: CT.Bounds, EPS = this.__eps): boolean {
		return this.__overlap_axis(a.minX, a.maxX, b.minX, b.maxX, EPS) && this.__overlap_axis(a.minY, a.maxY, b.minY, b.maxY, EPS);
	}

	/**
	 * Перекрытие по одной оси с учётом вырождения.
	 * Обе оси вырождены → `eq` значений;
	 * одна вырождена → значение строго внутри интервала другой;
	 * обе протяжённые → строгое перекрытие `lt(max(min), min(max))`.
	 *
	 * Используется в {@link iUB.collision}.
	 */
	__overlap_axis(minA: number, maxA: number, minB: number, maxB: number, EPS: number): boolean {
		const degA = eq(minA, maxA, EPS);
		const degB = eq(minB, maxB, EPS);
		if (degA && degB) return eq(minA, minB, EPS);
		if (degA) return gt(minA, minB, EPS) && lt(minA, maxB, EPS);
		if (degB) return gt(minB, minA, EPS) && lt(minB, maxA, EPS);
		return lt(Math.max(minA, minB), Math.min(maxA, maxB), EPS);
	}

	/**
	 * Minimum Translation Vector: вектор, на который нужно сдвинуть `a`,
	 * чтобы его коллизия с `b` исчезла (по канону владения).
	 *
	 * @param direction - направление выталкивания `a`:
	 * - `"top"` — вверх (`{0, -escape}`, экранная Y-вниз: top = −y);
	 * - `"bottom"` — вниз (`{0, +escape}`);
	 * - `"left"` / `"right"` — по оси X.
	 * - `"min"` (по умолчанию) — ось с минимальным перекрытием;
	 * `a` выталкивается «наружу» от центра `b` к центру `a`.
	 * Возвращает вектор только по одной оси;
	 *
	 * @returns `null`, если коллизии нет ({@link iUB.collision} → `false`).
	 *
	 * Парный к {@link iUB.move}: `move(a, mtv(a, b))` гасит коллизию.
	 */
	mtv(a: CT.Bounds, b: CT.Bounds, direction: "min" | "top" | "left" | "bottom" | "right" = "min"): CT.C2 | null {
		if (!this.collision(a, b, this.__eps)) return null;

		const escape_right = b.maxX - a.minX;
		const escape_left = a.maxX - b.minX;
		const escape_down = b.maxY - a.minY;
		const escape_up = a.maxY - b.minY;

		switch (direction) {
			case "right":
				return { x: escape_right, y: 0 };
			case "left":
				return { x: -escape_left, y: 0 };
			case "bottom":
				return { x: 0, y: escape_down };
			case "top":
				return { x: 0, y: -escape_up };
		}

		const cx = a.minX + a.maxX - (b.minX + b.maxX);
		const cy = a.minY + a.maxY - (b.minY + b.maxY);

		const x_cand = cx > 0 ? escape_right : -escape_left;
		const y_cand = cy > 0 ? escape_down : -escape_up;

		const ax = Math.abs(x_cand);
		const ay = Math.abs(y_cand);

		if (ax <= this.__eps && ay <= this.__eps) return { x: 0, y: 0 };
		if (ax <= this.__eps) return { x: 0, y: y_cand || 0 };
		if (ay <= this.__eps) return { x: x_cand || 0, y: 0 };

		return ax <= ay ? { x: x_cand || 0, y: 0 } : { x: 0, y: y_cand || 0 };
	}

	//...

	/**
	 * Охватывающий `Bounds` для пересечения значащих точек `a` и `b`, либо `null` если пересечения нет (включая касание границами).
	 *
	 * Границы результата **не** являются сами значащими точками (как и у любого `Bounds` — значимо только строгое внутреннее).
	 * Исключение — вырожденные результаты (точка/линия), где контур ≡ значащие точки.
	 * Результат может быть точкой (крест линий) или линией (коллинеарное перекрытие).
	 *
	 * Реализация через `Math.max(min) / Math.min(max)` корректна, т.к. {@link iUB.collision} уже отфильтровал касания.
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	overlap(a: CT.Bounds, b: CT.Bounds, EPS = this.__eps): CT.Bounds | null {
		if (!this.collision(a, b, EPS)) return null;
		return {
			minX: Math.max(a.minX, b.minX),
			minY: Math.max(a.minY, b.minY),
			maxX: Math.min(a.maxX, b.maxX),
			maxY: Math.min(a.maxY, b.maxY),
		};
	}

	/**
	 * Пересекает ли `line` контур `b`.
	 *
	 * Контур по канону:
	 * - **точка** (`isPoint`) — сама точка;
	 * - **линия** (`isEdge`) — вся линия **включая концы**;
	 * - **полигон** — рёбра (углы включены как концы рёбер).
	 *
	 * Делегирует в {@link UL.intersect} для каждого ненулевого ребра `b`.
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	intersect(b: CT.Bounds, line: CT.Line): boolean {
		if (this.isPoint(b)) {
			const pt: CT.C2 = { x: b.minX, y: b.minY };
			const pointLine: CT.Line = { type: "line", points: [pt, pt] };
			return UL.intersect(line, pointLine);
		}
		for (const edge of this.edges(b)) {
			if (UL.isEmpty({ type: "line", points: edge })) continue;
			const edgeLine: CT.Line = { type: "line", points: edge };
			if (UL.intersect(line, edgeLine)) return true;
		}
		return false;
	}

	//...

	/**
	 * Дискретный индекс `Bounds` в регулярной сетке размера `size`: `floor(coord / size)` по каждой оси.
	 *
	 * Используется для пространственных хэш-индексов.
	 * Может быть отрицательным.
	 *
	 * Не предназначен для вывернутых Bounds — `floor` от вывернутого интервала даёт мусор.
	 */
	index(b: CT.Bounds, size: number): CT.Bounds {
		return {
			minX: Math.floor(b.minX / size),
			maxX: Math.floor(b.maxX / size),
			minY: Math.floor(b.minY / size),
			maxY: Math.floor(b.maxY / size),
		};
	}

	/**
	 * Диапазон ячеек сетки с шагом `step`, целиком лежащих **внутри** `b`:
	 * `min` → `ceil`, `max` → `floor` (отсекает частичные ячейки на границах).
	 *
	 * Используется для итерации «полных» ячеек грид-индекса.
	 *
	 * Не предназначен для вывернутых Bounds.
	 */
	grid(b: CT.Bounds, step: number): CT.Bounds {
		return {
			minX: Math.ceil(b.minX / step),
			maxX: Math.floor(b.maxX / step),
			minY: Math.ceil(b.minY / step),
			maxY: Math.floor(b.maxY / step),
		};
	}

	/**
	 * Расширение `bounds` так, чтобы его размер был не меньше `target_size`, с сохранением центра.
	 *
	 * Если `bounds` уже достаточно — `null` (без изменений).
	 * По каждой оси независимо берётся `max(actual, target)`.
	 */
	upgrade(bounds: CT.Bounds, target_size: CT.S2): CT.Bounds | null {
		const actual_size = UB.size(bounds);
		if (actual_size.w >= target_size.w && actual_size.h >= target_size.h) {
			return null;
		}
		const target: CT.S2 = {
			w: Math.max(actual_size.w, target_size.w),
			h: Math.max(actual_size.h, target_size.h),
		};
		return US.bound(target, UB.center(bounds));
	}

	//...

	/**
	 * Помещается ли `b` в `a` по размеру (без учёта позиции).
	 *
	 * @returns
	 * - `null` — размеры равны (через {@link US.puttable});
	 * - `true` — `b` меньше или равен `a` по обеим осям;
	 * - `false` — `b` больше `a` хотя бы по одной оси.
	 */
	puttable(a: CT.Bounds, b: CT.Bounds): boolean | null {
		return US.puttable(this.size(a), this.size(b));
	}

	/**
	 * Разместить `b` внутри `a` сдвигом (без проверки вложимости — канон).
	 *
	 * - `"center"` — центр `b` совмещается с центром `a` (безусловно).
	 * - `"nearest"` — минимальный сдвиг по каждой оси, чтобы `b` попал в `a`.
	 * Если `b` уже внутри — `{0, 0}` (копия `b`). Если `b` больше `a` по оси — корректируется только одно направление (не гарантирует полное вложение);
	 *
	 * **Не** проверяет `puttable` — предполагается вызов выше по стеку.
	 * Не предназначен для вывернутых Bounds.
	 */
	put(a: CT.Bounds, b: CT.Bounds, mode: "nearest" | "center"): CT.Bounds {
		if (mode === "center") {
			const a_center = this.center(a);
			const b_center = this.center(b);
			const delta = UC2.sub(a_center, b_center);
			return this.move(b, delta);
		}

		let dx = 0;
		let dy = 0;

		if (b.minX < a.minX) {
			dx = a.minX - b.minX;
		} else if (b.maxX > a.maxX) {
			dx = a.maxX - b.maxX;
		}

		if (b.minY < a.minY) {
			dy = a.minY - b.minY;
		} else if (b.maxY > a.maxY) {
			dy = a.maxY - b.maxY;
		}

		return this.move(b, { x: dx, y: dy });
	}
}

export const UB = new iUB();
