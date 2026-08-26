import type { RoundMethod } from "./support/math.js";
import { lt } from "./support/epsilon.js";
import { UB } from "./bounds.js";
import { UC2 } from "./coords.js";
import { UD } from "./depth.js";
import { UE } from "./edge.js";
import type * as CT from "./types.js";

/**
 * Результат классификации {@link CT.Polyline} по канону вырожденности:
 * `empty` (0 вершин), `point` (1 вершина или все совпадают),
 * `edge` (2+ коллинеарных, концы — самые удалённые),
 * `polyline` (2+ не на одной прямой).
 *
 * Используется как возврат {@link iUPL.is}, чтобы downstream-API мог сам решить,
 * какие операции применимы (для `edge` владение — открытый интервал между концами,
 * для `point` — `eq` с собой).
 */
export type PolylineGrade = { type: "empty" } | { type: "point"; point: CT.C2 } | { type: "edge"; edge: CT.Edge } | { type: "polyline" };

/**
 * Открытая ломаная ({@link CT.Polyline}) — обобщение {@link CT.Edge} на случай изломов.
 *
 * `UPL` — полиморфный API над массивом вершин без замыкания: копирование, охват, владение, коллизия.
 * Базовый модуль в иерархии `C2 → Edge → Polyline → Convex → Bounds`: {@link Convex} делегирует сюда
 * общую логику рёбер (`__edgesOverlap`/`__projectT`), а {@link UG} — полиморфные операции над `Polyline`.
 *
 * @remarks
 * Каноны владения/контура/вырожденности/центра — общие для всего пакета (см. README).
 * Владение: 1D-interior = открытые сегменты `(g[i], g[i+1])` ∪ внутренние вершины `g[1..n-2]`;
 * крайние концы `g[0]`/`g[n-1]` исключены. Центр — дуговой центроид (взвешенный по длинам сегментов).
 */
class iUPL {
	/** Толерантность сравнения вершин (унаследована от `UC2.__eps`). */
	__eps = UC2.__eps;

	/** Толерантность коллинеарности (унаследована от `UC2.__vect_eps`). */
	__vect_eps = UC2.__vect_eps;

	/** Кол-во знаков округления по умолчанию (унаследовано от `UC2.__fraction`). */
	__fraction = UC2.__fraction;

	/** Кэш `zero()` для дефолтных аргументов. */
	__zero = this.zero();

	//...

	/**
	 * Фабрика пустой ломаной `[]`.
	 */
	zero(): CT.Polyline {
		return [];
	}

	/**
	 * Поверхностная копия: новый массив с копиями каждой точки. Сохраняет тип.
	 */
	copy<T extends CT.Polyline>(g: T): T {
		return g.map((p) => UC2.copy(p)) as T;
	}

	/**
	 * **Мутирует** `g`: заменяет содержимое массива копиями точек из `expected`.
	 * По умолчанию `expected = []` (пустая ломаная).
	 *
	 * Канон: `assign` — единственный публичный способ мутировать входной объект.
	 */
	assign(g: CT.Polyline, expected: CT.Polyline = this.__zero): void {
		g.length = 0;
		for (const p of expected) g.push(UC2.copy(p));
	}

	/**
	 * Структурно точное равенство: длины совпадают, каждая вершина в пределах `EPS`.
	 * Порядок вершин значим.
	 */
	eq(a: CT.Polyline, b: CT.Polyline, EPS = this.__eps): boolean {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (UC2.eq(a[i], b[i], EPS)) continue;
			return false;
		}
		return true;
	}

	/**
	 * Округление вершин до `fraction` знаков.
	 * По умолчанию `__fraction = 3`, согласовано с `__eps`.
	 */
	round(g: CT.Polyline, fraction: number = this.__fraction, method?: RoundMethod): CT.Polyline {
		return g.map((p) => UC2.round(p, fraction, method));
	}

	/**
	 * Линейная интерполяция вершин. **Не ограничена** `t ∈ [0, 1]` — допускает экстраполяцию.
	 *
	 * Берёт `min(a.length, b.length)` вершин — лишние точки более длинной ломаной отбрасываются.
	 */
	lerp(a: CT.Polyline, b: CT.Polyline, t: number): CT.Polyline {
		const n = Math.min(a.length, b.length);
		const acc: CT.Polyline = [];
		for (let i = 0; i < n; i++) acc.push(UC2.lerp(a[i], b[i], t));
		return acc;
	}

	/**
	 * Сдвиг ломаной на вектор: каждая вершина сдвигается на `vec`. Возвращает новый массив.
	 */
	move(g: CT.Polyline, vec: CT.C2): CT.Polyline {
		return g.map((p) => UC2.move(p, vec));
	}

	//...

	/**
	 * Рёбра ломаной как пар `[current, next]` **без замыкания** (`g[n-1] → g[0]` нет).
	 *
	 * Рёбра нулевой длины (через {@link UE.isEmpty}) **отбрасываются**.
	 * Для `< 2` вершин возвращает `[]`.
	 */
	edges(g: CT.Polyline): CT.Edge[] {
		if (g.length < 2) return [];
		const acc: CT.Edge[] = [];
		for (let i = 0; i < g.length - 1; i++) {
			const edge: CT.Edge = [g[i], g[i + 1]];
			if (!UE.isEmpty(edge)) acc.push(edge);
		}
		return acc;
	}

	/**
	 * Охватывающий AABB: `Bounds` от всех вершин. Делегирует в {@link UB.from}.
	 */
	bound(g: CT.Polyline): CT.Bounds {
		return UB.from(g);
	}

	/**
	 * Сумма длин сегментов: `Σ dist(g[i], g[i+1])` для `i < n-1`.
	 *
	 * Для `< 2` вершин → `0`. Используется в {@link iUPL.center} для дугового центроида.
	 */
	length(g: CT.Polyline): number {
		let s = 0;
		for (let i = 0; i < g.length - 1; i++) s += UC2.dist(g[i], g[i + 1]);
		return s;
	}

	//...

	/**
	 * Канон пустоты: `true`, если ломаная **не** является валидной полилинией (2+ не коллинеарных вершин).
	 *
	 * Возвращает `true` для 0 вершин (empty), 1 вершины (point), 2+ коллинеарных (edge).
	 * Используйте `is(g).type` для различения.
	 */
	isEmpty(g: CT.Polyline, EPS = this.__eps): boolean {
		return this.is(g, EPS).type !== "polyline";
	}

	/**
	 * Классификация ломаной по канону вырожденности:
	 * - `empty` — 0 вершин;
	 * - `point` — 1 вершина, либо все вершины совпадают (`EPS`);
	 * - `edge` — 2+ вершин, все коллинеарны и не все равны. `edge` = два наиболее удалённых друг от друга;
	 * - `polyline` — 2+ вершин, не все коллинеарны.
	 */
	is(g: CT.Polyline, EPS = this.__eps): PolylineGrade {
		const n = g.length;
		if (n === 0) return { type: "empty" };
		if (n === 1) return { type: "point", point: g[0] };

		let max_d2 = -1;
		let i_max = 0;
		let j_max = 1;

		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				const d = UC2.direct(g[i], g[j]);
				const d2 = d.x * d.x + d.y * d.y;
				if (d2 > max_d2) {
					max_d2 = d2;
					i_max = i;
					j_max = j;
				}
			}
		}

		if (UC2.eq(g[i_max], g[j_max], EPS)) return { type: "point", point: g[0] };

		const dir = UC2.direct(g[i_max], g[j_max]);
		for (let i = 0; i < n; i++) {
			const ap = UC2.direct(g[i_max], g[i]);
			if (Math.abs(UC2.vect(dir, ap)) > this.__vect_eps) return { type: "polyline" };
		}

		return { type: "edge", edge: [g[i_max], g[j_max]] };
	}

	/**
	 * Геометрический центр по канону — дуговой центроид (взвешенный по длинам сегментов):
	 * `Σ mid(g[i], g[i+1]) · |g[i+1]−g[i]|) / Σ |g[i+1]−g[i]|`.
	 *
	 * - 0 вершин → `{0, 0}`;
	 * - 1 вершина → копия этой точки;
	 * - 2+ вершин: при `total = 0` (все совпадают) → копия `g[0]`, иначе взвешенный центроид.
	 *
	 * Соответствует физическому центру 1D-контура: длинный «хвост» справедливо смещает центр к себе.
	 */
	center(g: CT.Polyline): CT.C2 {
		if (g.length === 0) return UC2.zero();
		if (g.length === 1) return UC2.copy(g[0]);

		let total = 0;
		let cx = 0;
		let cy = 0;
		for (let i = 0; i < g.length - 1; i++) {
			const a = g[i];
			const b = g[i + 1];
			const len = UC2.dist(a, b);
			total += len;
			cx += ((a.x + b.x) / 2) * len;
			cy += ((a.y + b.y) / 2) * len;
		}
		if (total === 0) return UC2.copy(g[0]);
		return { x: cx / total, y: cy / total };
	}

	//...

	/**
	 * Принадлежность координаты X проекции фигуры по канону владения:
	 * - пустая (0) → `false`;
	 * - точка (1) → `eq` (точка обладает собой);
	 * - ребро/ломаная → X строго между концами X-проекции (или `eq` для вырожденной).
	 *
	 * Делегирует в {@link UB.hasX} от bounding box фигуры (для ломаной проекция interior = открытый интервал).
	 */
	hasX(g: CT.Polyline, x: number, EPS = this.__eps): boolean {
		if (g.length === 0) return false;
		return UB.hasX(UB.from(g), x, EPS);
	}

	/**
	 * Симметрично {@link iUPL.hasX} по оси Y. Делегирует в {@link UB.hasY} от bounding box.
	 */
	hasY(g: CT.Polyline, y: number, EPS = this.__eps): boolean {
		if (g.length === 0) return false;
		return UB.hasY(UB.from(g), y, EPS);
	}

	//...

	/**
	 * Принадлежность точки ломаной по канону владения (1D-interior):
	 * - пустая → `false`;
	 * - точка → `eq` (точка обладает собой);
	 * - ребро → точка строго между концами ({@link UD.has} от {@link UE.depth});
	 * - ломаная → точка на открытом сегменте (`UD.has` от {@link UE.depth} каждого ребра)
	 *   **или** совпадает с внутренней вершиной `g[1..n-2]`.
	 *
	 * Крайние концы `g[0]`/`g[n-1]` **не входят** во владение (исключены).
	 */
	has(g: CT.Polyline, p: CT.C2, EPS = this.__eps): boolean {
		const c = this.is(g, EPS);
		switch (c.type) {
			case "empty":
				return false;
			case "point":
				return UC2.eq(c.point, p, EPS);
			case "edge":
				return UD.has(UE.depth(c.edge, p), EPS);
			case "polyline": {
				for (let i = 1; i < g.length - 1; i++) {
					if (UC2.eq(g[i], p, EPS)) return true;
				}
				for (const edge of this.edges(g)) {
					if (UD.has(UE.depth(edge, p), EPS)) return true;
				}
				return false;
			}
		}
	}

	/**
	 * Нестрогая принадлежность точки ломаной (канон контура): точка на замкнутом сегменте
	 * (включая концы) **или** совпадает с любой вершиной (включая крайние).
	 *
	 * - пустая → `false`;
	 * - точка → `eq` (совпадение);
	 * - ребро → {@link UD.at} (точка на отрезке, включая концы);
	 * - ломаная → {@link UD.at} от {@link UE.depth} каждого ребра (покрывает все вершины как концы рёбер).
	 *
	 * В отличие от {@link iUPL.has}, включает крайние концы.
	 */
	at(g: CT.Polyline, p: CT.C2, EPS = this.__eps): boolean {
		const c = this.is(g, EPS);
		switch (c.type) {
			case "empty":
				return false;
			case "point":
				return UC2.eq(c.point, p, EPS);
			case "edge":
				return UD.at(UE.depth(c.edge, p), EPS);
			case "polyline": {
				for (const edge of this.edges(g)) {
					if (UD.at(UE.depth(edge, p), EPS)) return true;
				}
				return false;
			}
		}
	}

	//...

	/**
	 * Есть ли общая значащая точка (по канону владения) между двумя ломаными: пересечение их 1D-interior.
	 *
	 * - пустая ⋂ X → `false`;
	 * - точка ⋂ точка → `eq`;
	 * - точка ⋂ X → `X.has(point)` (точка обладает собой);
	 * - иначе (ребро/ломаная):
	 *   1. quick-reject через {@link UB.collision} от bbox;
	 *   2. внутренняя вершина одной (`g[1..n-2]`) принадлежит другой ({@link iUPL.has}) → `true`;
	 *   3. пара рёбер пересекается строго внутри обеих ({@link UE.cross} + {@link UD.has}) → `true`;
	 *   4. коллинеарная пара рёбер перекрывается ({@link iUPL.__edgesOverlap}) → `true`.
	 *
	 * Симметрична. Касание крайними концами → `false` (концы не владеют).
	 */
	collision(a: CT.Polyline, b: CT.Polyline, EPS = this.__eps): boolean {
		const ca = this.is(a, EPS);
		const cb = this.is(b, EPS);

		if (ca.type === "empty" || cb.type === "empty") return false;

		if (ca.type === "point" && cb.type === "point") return UC2.eq(ca.point, cb.point, EPS);
		if (ca.type === "point") return this.has(b, ca.point, EPS);
		if (cb.type === "point") return this.has(a, cb.point, EPS);

		// Quick-reject по AABB: 1D-объекты могут делить точку на самой границе bbox'ов (касание),
		// поэтому проверяем пересечение с допуском касания (non-strict), а не строгий `UB.collision`.
		const ba = UB.from(a);
		const bb = UB.from(b);
		if (lt(ba.maxX, bb.minX, EPS) || lt(bb.maxX, ba.minX, EPS) || lt(ba.maxY, bb.minY, EPS) || lt(bb.maxY, ba.minY, EPS)) return false;

		for (let i = 1; i < a.length - 1; i++) {
			if (this.has(b, a[i], EPS)) return true;
		}
		for (let i = 1; i < b.length - 1; i++) {
			if (this.has(a, b[i], EPS)) return true;
		}

		const ea = this.edges(a);
		const eb = this.edges(b);
		for (const segA of ea) {
			for (const segB of eb) {
				const c = UE.cross(segA, segB);
				if (c === false) continue;
				if (c === true) {
					if (this.__edgesOverlap(segA, segB, EPS)) return true;
					continue;
				}
				if (UD.has(c[1], EPS) && UD.has(c[2], EPS)) return true;
			}
		}
		return false;
	}

	//...

	/**
	 * Проекция точки `p` на контур ломаной: ближайшая точка на любом из сегментов (с clamp'ом `t ∈ [0, 1]`).
	 *
	 * Для точки на ломаной возвращает её саму; для точки снаружи — ближайшую точку сегмента
	 * (включая концы — это геометрическая проекция, без учёта владения).
	 */
	projection(g: CT.Polyline, p: CT.C2): CT.C2 {
		if (g.length === 0) return UC2.copy(p);
		if (g.length === 1) return UC2.copy(g[0]);

		let best = UC2.copy(g[0]);
		let best_d2 = Infinity;
		for (let i = 0; i < g.length - 1; i++) {
			const a = g[i];
			const b = g[i + 1];
			const dir = UC2.direct(a, b);
			const len2 = dir.x * dir.x + dir.y * dir.y;
			let cand: CT.C2;
			if (len2 === 0) {
				cand = UC2.copy(a);
			} else {
				const t = this.__projectT(a, p, dir, len2);
				const ct = Math.min(1, Math.max(0, t));
				cand = { x: a.x + ct * dir.x, y: a.y + ct * dir.y };
			}
			const dx = cand.x - p.x;
			const dy = cand.y - p.y;
			const d2 = dx * dx + dy * dy;
			if (d2 < best_d2) {
				best_d2 = d2;
				best = cand;
			}
		}
		return best;
	}

	/**
	 * Ближайшая значащая точка ломаной к `p` (по канону владения):
	 * - `p` принадлежит ломаной ({@link iUPL.has}) → `p` (уже значащая);
	 * - иначе → {@link iUPL.projection}.
	 *
	 * @remarks
	 * В отличие от {@link iUPL.projection}, на внутренних точках возвращает саму `p`, а не ближайший сегмент.
	 */
	nearest(g: CT.Polyline, p: CT.C2): CT.C2 {
		if (this.has(g, p)) return UC2.copy(p);
		return this.projection(g, p);
	}

	//...

	/**
	 * Перекрытие коллинеарных отрезков: общая точка строго внутри обоих.
	 *
	 * Проекция `eb` на `ea` даёт интервал `[tMin, tMax]`; пересечение с `[0, 1]` (ea) положительной длины →
	 * есть общие внутренние точки. Используется в {@link iUPL.collision} и {@link Convex.__edgeEdge} (делегирует).
	 */
	__edgesOverlap(ea: CT.Edge, eb: CT.Edge, EPS: number): boolean {
		const ab = UC2.direct(ea[0], ea[1]);
		const ab_len2 = ab.x * ab.x + ab.y * ab.y;
		if (ab_len2 <= 0) return false;
		const t1 = this.__projectT(ea[0], eb[0], ab, ab_len2);
		const t2 = this.__projectT(ea[0], eb[1], ab, ab_len2);
		return lt(Math.max(0, Math.min(t1, t2)), Math.min(1, Math.max(t1, t2)), EPS);
	}

	/**
	 * Параметр `t` проекции точки `p` на прямую `origin → origin + dir`.
	 *
	 * `t = 0` соответствует `origin`, `t = 1` — `origin + dir`.
	 * `len2 = 0` ведёт к делению на ноль; вызывающий код обязан проверить `len2 > 0` заранее.
	 * Используется в {@link iUPL.__edgesOverlap} и {@link iUPL.projection}.
	 */
	__projectT(origin: CT.C2, p: CT.C2, dir: CT.C2, len2: number): number {
		const ap = UC2.direct(origin, p);
		return (ap.x * dir.x + ap.y * dir.y) / len2;
	}
}

export const UPL = new iUPL();
