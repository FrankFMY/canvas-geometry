import { UB } from "./bounds.js";
import { UC2 } from "./coords.js";
import { UD } from "./depth.js";
import { UE } from "./edge.js";
import { UPL } from "./polyline.js";
import type * as CT from "./types.js";

/**
 * Результат классификации {@link CT.Convex} по канону вырожденности:
 * `empty` (0 вершин), `point` (1 вершина или все совпадают),
 * `edge` (2+ коллинеарных, концы — самые удалённые),
 * `polygon` (3+ не на одной прямой).
 *
 * Используется как возврат {@link iConvex.is}, чтобы downstream-API мог сам решить,
 * какие операции применимы (для `edge` нет понятия «внутри», для `point` — `has` всегда `false` кроме `eq`).
 */
export type ConvexGrade = { type: "empty" } | { type: "point"; point: CT.C2 } | { type: "edge"; edge: CT.Edge } | { type: "polygon" };

const cross3 = (o: CT.C2, a: CT.C2, b: CT.C2): number => UC2.vect(UC2.direct(o, a), UC2.direct(o, b));

/**
 * Выпуклый полигон ({@link CT.Convex}) — замкнутая ломаная с закрывающим дублём первой вершины.
 *
 * `Convex` — полиморфный API над массивом вершин (Y-вверх, CCW, `g[0] ≈ g[n-1]`): копирование, охват,
 * владение, коллизия, SAT-mtv, offset (`inflate`). Базовая логика рёбер делегирована в {@link UPL}
 * (`__edgesOverlap`/`__projectT`). В иерархии `C2 → Edge → Polyline → Convex → Bounds` — это замкнутая
 * форма {@link CT.Polyline}; {@link Bounds} — специализированная запись `Convex` для AABB-оптимизаций.
 *
 * @remarks
 * Канон порядка: `Convex` хранится **с** закрывающей дублирующей вершиной (`g[0] ≈ g[n-1]`),
 * что отличает его от {@link CT.Polyline} (без замыкания). Каноны владения/контура/вырожденности —
 * общие для пакета (см. README). `Convex` лишь диспетчит в `UC2`/`UB`/`UE`/`UPL`.
 */
class iConvex {
	/** Толерантность сравнения вершин (унаследована от `UC2.__eps`). */
	__eps = UC2.__eps;

	/** Толерантность коллинеарности (унаследована от `UC2.__vect_eps`). */
	__vect_eps = UC2.__vect_eps;

	//...

	/**
	 * Поверхностная копия: новый массив с копиями каждой точки. Сохраняет тип.
	 */
	copy<T extends CT.Convex>(g: T): T {
		return g.map((p) => UC2.copy(p)) as T;
	}

	/**
	 * Охватывающий AABB для фигуры: `Bounds` от всех вершин.
	 *
	 * Делегирует в {@link UB.from}. Используется для quick-reject в `collision`, `mtv`, как вход в {@link UG.bound}.
	 * Для вогнутых фигур AABB может быть значительно больше реальной фигуры — это нормально для broad-phase проверок.
	 */
	bound(g: CT.Convex): CT.Bounds {
		return UB.from(g);
	}

	/**
	 * Структурно точное равенство: длины совпадают, каждая вершина в пределах `EPS`.
	 * Порядок вершин значим (без циклического сдвига).
	 */
	eq(a: CT.Convex, b: CT.Convex, EPS = this.__eps): boolean {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (UC2.eq(a[i], b[i], EPS)) continue;
			return false;
		}
		return true;
	}

	/**
	 * Геометрический центр по канону (по уникальным вершинам, без закрывающего дубля):
	 * - 0 вершин → `{0, 0}` (трактовка «ничего»);
	 * - 1 вершина → копия этой точки;
	 * - 2–3 вершины → арифметическое среднее (`UC2.mid`);
	 * - 4+ вершины → взвешенный центроид по площади (`cx / (6 * area)`). При `|area| < __vect_eps` (вырождение в линию) — fallback на среднее вершин.
	 */
	center(g: CT.Convex, EPS = this.__vect_eps): CT.C2 {
		if (g.length === 0) return UC2.zero();
		const hasClosing = g.length > 1 && UC2.eq(g[0], g[g.length - 1], this.__eps);
		const core = hasClosing ? g.slice(0, -1) : g;
		if (core.length === 0) return UC2.zero();
		if (core.length === 1) return UC2.copy(core[0]);
		if (core.length <= 3) return UC2.mid(...core);
		let area = 0;

		let cx = 0;
		let cy = 0;

		for (let i = 0; i < g.length - 1; i++) {
			const current = g[i];
			const next = g[i + 1];

			const cross = UC2.vect(current, next);
			area += cross;

			cx += (current.x + next.x) * cross;
			cy += (current.y + next.y) * cross;
		}

		area *= 0.5;

		if (Math.abs(area) < EPS) return UC2.mid(...core);
		return { x: cx / (6 * area), y: cy / (6 * area) };
	}

	/**
	 * Рёбра полигона как пар `[current, next]` для `i < n-1`: `[g[0],g[1]] … [g[n-2],g[n-1]]`.
	 *
	 * Последнее ребро `[g[n-2], g[n-1]]` — закрывающее ребро полигона (`g[n-1] ≈ g[0]` по канону).
	 * Рёбра нулевой длины (через {@link UE.isEmpty}) **отбрасываются**.
	 * Для `< 2` вершин возвращает `[]`.
	 *
	 * Канон: Convex хранится с закрывающей дублирующей вершиной — отдельное замыкание здесь не нужно.
	 */
	edges(g: CT.Convex): CT.Edge[] {
		if (g.length < 2) return [];
		const acc: CT.Edge[] = [];
		for (let i = 0; i < g.length - 1; i++) {
			const edge: CT.Edge = [g[i], g[i + 1]];
			if (!UE.isEmpty(edge)) acc.push(edge);
		}
		return acc;
	}

	//...

	/**
	 * Канон пустоты: `true`, если фигура **не** является валидным полигоном (3+ вершины не на одной прямой).
	 *
	 * Возвращает `true` для:
	 * - 0 вершин (empty);
	 * - 1 вершина (point);
	 * - 2+ вершины на одной прямой (edge).
	 *
	 * Используйте `is(g).type` если нужно различать empty/point/edge/polygon; `isEmpty` — короткий предикат «пригодна ли для коллизии».
	 */
	isEmpty(g: CT.Convex, EPS = this.__eps): boolean {
		return this.is(g, EPS).type !== "polygon";
	}

	/**
	 * Классификация фигуры по канону вырожденности:
	 * - `empty` — 0 вершин;
	 * - `point` — 1 вершина, либо все вершины совпадают (`EPS`);
	 * - `edge` — 2+ вершин, все коллинеарны и не все равны. `edge` = два наиболее удалённых друг от друга (конечные точки линии);
	 * - `polygon` — 3+ вершин, не все коллинеарны.
	 */
	is(g: CT.Convex, EPS = this.__eps): ConvexGrade {
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
			if (Math.abs(UC2.vect(dir, ap)) > this.__vect_eps) return { type: "polygon" };
		}

		return { type: "edge", edge: [g[i_max], g[j_max]] };
	}

	/**
	 * Выпуклая оболочка (Andrew's monotone chain).
	 * Возвращает минимальное представление CCW (Y-вверх): коллинеарные точки на рёбрах отбрасываются.
	 *
	 * **С закрывающим дублём первой вершины** (канон `Convex`): результат заканчивается копией `result[0]`.
	 *
	 * `< 2` уникальных точек → возвращает массив как есть (точка/пусто, без замыкания).
	 */
	__hull(points: CT.Convex): CT.Convex {
		const n = points.length;
		if (n < 2) return points.map((p) => UC2.copy(p));

		const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

		const unique: CT.C2[] = [];
		for (const p of sorted) {
			if (unique.length === 0 || !UC2.eq(p, unique[unique.length - 1], this.__eps)) unique.push(p);
		}
		if (unique.length < 2) return unique;

		const lower: CT.C2[] = [];
		for (const p of unique) {
			while (lower.length >= 2 && cross3(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
			lower.push(p);
		}

		const upper: CT.C2[] = [];
		for (let i = unique.length - 1; i >= 0; i--) {
			const p = unique[i];
			while (upper.length >= 2 && cross3(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
			upper.push(p);
		}

		const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
		if (hull.length >= 2) hull.push(UC2.copy(hull[0]));
		return hull;
	}

	/**
	 * Удвоенная ориентированная площадь полигона: `Σ vect(g[i], g[i+1])` для `i < n-1`.
	 *
	 * Положительная для CCW (Y-вверх), отрицательная для CW.
	 * Для замкнутого канона (`g[0] ≈ g[n-1]`) последнее слагаемое `vect(g[n-2], g[n-1])` =
	 * `vect(v_{k-1}, v_0)` — корректное закрывающее ребро полигона.
	 * Используется в `has`/`at` для определения ориентации (CCW vs. CW half-plane test) и в `inflate`
	 * для нормализации направления обхода перед offset'ом. Не округлять и не использовать как «площадь»
	 * напрямую — делите на `2` для реальной площади.
	 */
	__signedArea2(g: CT.Convex): number {
		let s = 0;
		for (let i = 0; i < g.length - 1; i++) s += UC2.vect(g[i], g[i + 1]);
		return s;
	}

	//...

	/**
	 * «Раздувает» фигуру на `radius` (Minkowski-sum с диском радиуса `radius`):
	 *
	 * - **точка** → ромб CCW со «стоящим» по `radius` в каждую сторону;
	 * - **линия** (edge) → капсула CCW с ромб-крышками на концах (6 точек);
	 * - **полигон** → offset: каждое ребро сдвигается по внешней нормали на `radius`, новые вершины = пересечение соседних смещённых рёбер. Результат нормализуется к CCW (Y-вверх).
	 *
	 * @returns Пустой массив `[]`, если `radius <= 0` или `g` пуст.
	 */
	inflate(g: CT.Convex, radius: number): CT.Convex {
		if (g.length === 0 || radius <= 0) return [];

		const c = this.is(g);
		if (c.type === "point") {
			const p = c.point;
			return [
				{ x: p.x, y: p.y - radius },
				{ x: p.x + radius, y: p.y },
				{ x: p.x, y: p.y + radius },
				{ x: p.x - radius, y: p.y },
				{ x: p.x, y: p.y - radius },
			];
		}

		if (c.type === "edge") {
			const [a, b] = c.edge;
			const d = UC2.direct(a, b);
			const len = Math.hypot(d.x, d.y);
			if (len === 0) return [];
			const ux = d.x / len;
			const uy = d.y / len;
			const nx = uy;
			const ny = -ux;
			return [
				{ x: a.x - ux * radius, y: a.y - uy * radius },
				{ x: a.x + nx * radius, y: a.y + ny * radius },
				{ x: b.x + nx * radius, y: b.y + ny * radius },
				{ x: b.x + ux * radius, y: b.y + uy * radius },
				{ x: b.x - nx * radius, y: b.y - ny * radius },
				{ x: a.x - nx * radius, y: a.y - ny * radius },
				{ x: a.x - ux * radius, y: a.y - uy * radius },
			];
		}

		// Снимаем закрывающий дубль первой вершины: offset-логика работает с незамкнутым ядром
		// (нормали и пересечения считаются с замыканием через modulo по длине ядра).
		const area2 = this.__signedArea2(g);
		const hasClosing = g.length > 1 && UC2.eq(g[0], g[g.length - 1], this.__eps);
		let core = hasClosing ? g.slice(0, -1) : g.slice();
		if (area2 < 0) core = [...core].reverse();
		let poly = core;

		// Нормализуем стартовую вершину к (minX, minY) для детерминированности.
		const m = poly.length;
		let start = 0;
		for (let i = 1; i < m; i++) {
			if (poly[i].x < poly[start].x - this.__eps || (Math.abs(poly[i].x - poly[start].x) <= this.__eps && poly[i].y < poly[start].y - this.__eps)) {
				start = i;
			}
		}
		poly = poly.slice(start).concat(poly.slice(0, start));

		const normals: CT.C2[] = [];
		for (let i = 0; i < m; i++) {
			const a = poly[i];
			const b = poly[(i + 1) % m];
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const len = Math.hypot(dx, dy);
			if (len === 0) {
				normals.push({ x: 0, y: 0 });
				continue;
			}
			normals.push({ x: dy / len, y: -dx / len });
		}

		const result: CT.C2[] = [];
		for (let i = 0; i < m; i++) {
			const prev = (i - 1 + m) % m;
			const p1 = poly[prev];
			const d1 = { x: poly[(prev + 1) % m].x - p1.x, y: poly[(prev + 1) % m].y - p1.y };
			const n1 = normals[prev];

			const p2 = poly[i];
			const d2 = { x: poly[(i + 1) % m].x - p2.x, y: poly[(i + 1) % m].y - p2.y };
			const n2 = normals[i];

			const o1x = p1.x + n1.x * radius;
			const o1y = p1.y + n1.y * radius;
			const o2x = p2.x + n2.x * radius;
			const o2y = p2.y + n2.y * radius;

			const det = d1.x * -d2.y - -d2.x * d1.y;
			if (Math.abs(det) < this.__vect_eps) {
				const avgNx = (n1.x + n2.x) / 2;
				const avgNy = (n1.y + n2.y) / 2;
				result.push({ x: p2.x + avgNx * radius, y: p2.y + avgNy * radius });
				continue;
			}

			const rhsx = o2x - o1x;
			const rhsy = o2y - o1y;
			const t = (rhsx * -d2.y - -d2.x * rhsy) / det;
			result.push({ x: o1x + t * d1.x, y: o1y + t * d1.y });
		}
		// Замыкаем результат дублём первой вершины (канон Convex).
		if (result.length >= 2) result.push(UC2.copy(result[0]));
		return result;
	}

	/**
	 * Создать {@link CT.Convex} из точек `vector` с «раздутием» на `radius`.
	 *
	 * Сначала строится выпуклая оболочка {@link iConvex.__hull} (минимальное представление CCW), затем применяется {@link iConvex.inflate}.
	 * Для 2 точек результат — капсула; для 3+ — offset выпуклого полигона.
	 *
	 * @returns Пустой массив `[]`, если `< 2` уникальных точек или `radius <= 0`.
	 */
	create(vector: CT.Convex, radius: number): CT.Convex {
		if (vector.length < 2 || radius <= 0) return [];
		const hull = this.__hull(vector);
		if (hull.length < 2) return [];
		return this.inflate(hull, radius);
	}

	//...

	/**
	 * Принадлежность координаты X проекции фигуры по канону владения:
	 * - пустая (0) → `false`;
	 * - точка (1) → `eq` (точка обладает собой);
	 * - линия/полигон → X строго между концами X-проекции (или `eq` для вертикальной).
	 *
	 * Делегирует в {@link UB.hasX} от bounding box фигуры (для простого полигона проекция interior = открытый интервал `(minX, maxX)`,
	 * но для вогнутых bbox может дать false-positive — тогда полная проверка через {@link iConvex.has}).
	 */
	hasX(g: CT.Convex, x: number, EPS = this.__eps): boolean {
		if (g.length === 0) return false;
		return UB.hasX(UB.from(g), x, EPS);
	}

	/**
	 * Симметрично {@link iConvex.hasX} по оси Y.
	 *
	 * Делегирует в {@link UB.hasY} от bounding box фигуры.
	 * Семантика та же: для вогнутых фигур bbox может дать false-positive — для точной проверки используйте `has`.
	 */
	hasY(g: CT.Convex, y: number, EPS = this.__eps): boolean {
		if (g.length === 0) return false;
		return UB.hasY(UB.from(g), y, EPS);
	}

	//...

	/**
	 * Принадлежность точки фигуре по канону владения (строго):
	 * - пустая → `false`;
	 * - точка → `eq` (точка обладает собой);
	 * - линия → точка строго между концами ({@link UD.has} от {@link UE.depth});
	 * - полигон (выпуклый) → точка строго внутри контура (касание границы = `false`).
	 *
	 * Для полигона: quick-reject через {@link UB.has} от bbox, затем проверка каждого ребра — если точка на ребре ({@link UD.at} от {@link UE.depth}) → `false` (контур исключён).
	 * Half-plane test: для CCW все `cross > 0`, для CW все `cross < 0`. Все `cross` одного знака и ни один на ребре → `true`.
	 */
	has(g: CT.Convex, p: CT.C2, EPS = this.__eps): boolean {
		const c = this.is(g, EPS);
		switch (c.type) {
			case "empty":
				return false;
			case "point":
				return UC2.eq(c.point, p, EPS);
			case "edge":
				return UD.has(UE.depth(c.edge, p), EPS);
			case "polygon": {
				if (!UB.has(UB.from(g), p, EPS)) return false;
				for (let i = 0; i < g.length - 1; i++) {
					const edge: CT.Edge = [g[i], g[i + 1]];
					if (UD.at(UE.depth(edge, p), EPS)) return false;
				}
				const area2 = this.__signedArea2(g);
				if (Math.abs(area2) < this.__vect_eps) return false;
				const ccw = area2 > 0;
				for (let i = 0; i < g.length - 1; i++) {
					const cross = UC2.vect(UC2.direct(g[i], g[i + 1]), UC2.direct(g[i], p));
					if (cross === 0) continue;
					if (cross > 0 !== ccw) return false;
				}
				return true;
			}
		}
	}

	/**
	 * Нестрогая принадлежность точки фигуре (канон контура): точка внутри **или на контуре** (рёбра, углы включены).
	 *
	 * - пустая → `false`;
	 * - точка → `eq` (совпадение);
	 * - линия → {@link UD.at} (точка на отрезке, включая концы);
	 * - полигон → на рёбрах ({@link UD.at}) или строго внутри.
	 *
	 * В отличие от {@link iConvex.has}, включает контур.
	 * Используется в {@link iConvex.collision} для containment-проверки (см. `__polygonPolygon`).
	 */
	at(g: CT.Convex, p: CT.C2, EPS = this.__eps): boolean {
		const c = this.is(g, EPS);
		switch (c.type) {
			case "empty":
				return false;
			case "point":
				return UC2.eq(c.point, p, EPS);
			case "edge":
				return UD.at(UE.depth(c.edge, p), EPS);
			case "polygon": {
				if (!UB.at(UB.from(g), p, EPS)) return false;
				for (let i = 0; i < g.length - 1; i++) {
					const edge: CT.Edge = [g[i], g[i + 1]];
					if (UD.at(UE.depth(edge, p), EPS)) return true;
				}
				const area2 = this.__signedArea2(g);
				if (Math.abs(area2) < this.__vect_eps) return false;
				const ccw = area2 > 0;
				for (let i = 0; i < g.length - 1; i++) {
					const cross = UC2.vect(UC2.direct(g[i], g[i + 1]), UC2.direct(g[i], p));
					if (cross === 0) continue;
					if (cross > 0 !== ccw) return false;
				}
				return true;
			}
		}
	}

	//...

	/**
	 * Есть ли общая значащая точка (по канону владения) между двумя фигурами.
	 *
	 * - точка/линия/полигон ⋂ X → соответствующая проверка через `has`;
	 * - касание границами (без перекрытия внутренностей) → `false`;
	 * - симметричен: `collision(a, b) === collision(b, a)`.
	 */
	collision(a: CT.Convex, b: CT.Convex, EPS = this.__eps): boolean {
		const ca = this.is(a, EPS);
		const cb = this.is(b, EPS);

		if (ca.type === "empty" || cb.type === "empty") return false;

		if (ca.type === "point" && cb.type === "point") return UC2.eq(ca.point, cb.point, EPS);
		if (ca.type === "point") return this.has(b, ca.point, EPS);
		if (cb.type === "point") return this.has(a, cb.point, EPS);

		if (ca.type === "edge" && cb.type === "edge") return this.__edgeEdge(ca.edge, cb.edge, EPS);

		if (ca.type === "edge") return this.__edgePolygon(ca.edge, b, EPS);
		if (cb.type === "edge") return this.__edgePolygon(cb.edge, a, EPS);

		return this.__polygonPolygon(a, b, EPS);
	}

	/**
	 * Линия ⋂ линия: общая точка строго внутри обеих.
	 *
	 * `UE.cross` даёт либо `[point, depth, depth]` (проверка `UD.has` по обоим),
	 * `true` (similar — делегирует в {@link UPL.__edgesOverlap}), либо `false` (параллельны/мимо).
	 */
	__edgeEdge(ea: CT.Edge, eb: CT.Edge, EPS = this.__eps): boolean {
		const c = UE.cross(ea, eb);
		if (c === true) return UPL.__edgesOverlap(ea, eb, EPS);
		if (c === false) return false;
		return UD.has(c[1], EPS) && UD.has(c[2], EPS);
	}

	/**
	 * An open segment intersects a polygon interior when an endpoint is inside, edges cross strictly,
	 * or the span between contour intersections contains an owned point. The last case includes
	 * crossings through polygon corners and checks the clipped span, not the whole segment midpoint.
	 */
	__edgePolygon(edge: CT.Edge, poly: CT.Convex, EPS = this.__eps): boolean {
		if (this.has(poly, edge[0], EPS) || this.has(poly, edge[1], EPS)) return true;

		let first = Infinity;
		let last = -Infinity;
		for (const pe of this.edges(poly)) {
			const c = UE.cross(edge, pe);
			if (Array.isArray(c) && UD.has(c[1], EPS) && UD.has(c[2], EPS)) return true;
			if (Array.isArray(c) && UD.at(c[1], EPS) && UD.at(c[2], EPS)) {
				const t = Math.max(0, Math.min(1, (c[1][0] + 1) / 2));
				first = Math.min(first, t);
				last = Math.max(last, t);
			}
		}

		if (first >= last) return false;
		const point = UC2.lerp(edge[0], edge[1], (first + last) / 2);
		return this.has(poly, point, EPS) && UD.has(UE.depth(edge, point), EPS);
	}

	/**
	 * Полигон ⋂ полигон: общая внутренняя точка. Каскад из 6 проверок:
	 *
	 * 1. quick-reject через {@link UB.collision} от bbox;
	 * 2. строгое пересечение рёбер → `true`;
	 * 3. вершина одного строго внутри другого → `true`;
	 * 4. containment: все вершины одного внутри-или-на другом → `true` (ловит идентичные и вложенные с совпадением границ);
	 * 5. центроид одного строго внутри другого → `true` (вложенность без вершин на контуре);
	 * 6. середина ребра одного строго внутри другого → `true` (перекрытие interior-interior «два вытянутых окна» без вершин и центров).
	 */
	__polygonPolygon(a: CT.Convex, b: CT.Convex, EPS = this.__eps): boolean {
		if (!UB.collision(UB.from(a), UB.from(b), EPS)) return false;

		const edgesA = this.edges(a);
		const edgesB = this.edges(b);

		for (const ea of edgesA) {
			for (const eb of edgesB) {
				const c = UE.cross(ea, eb);
				if (Array.isArray(c) && UD.has(c[1], EPS) && UD.has(c[2], EPS)) return true;
			}
		}

		for (const v of a) {
			if (this.has(b, v, EPS)) return true;
		}
		for (const v of b) {
			if (this.has(a, v, EPS)) return true;
		}

		if (a.length > 0 && a.every((v) => this.at(b, v, EPS))) return true;
		if (b.length > 0 && b.every((v) => this.at(a, v, EPS))) return true;

		const ca = this.center(a);
		if (this.has(b, ca, EPS)) return true;
		const cb = this.center(b);
		if (this.has(a, cb, EPS)) return true;

		for (const ea of edgesA) {
			const mid = UC2.mid(ea[0], ea[1]);
			if (this.has(b, mid, EPS)) return true;
		}
		for (const eb of edgesB) {
			const mid = UC2.mid(eb[0], eb[1]);
			if (this.has(a, mid, EPS)) return true;
		}

		return false;
	}

	//...

	/**
	 * Minimum Translation Vector: вектор, на который нужно сдвинуть `a`, чтобы его коллизия с `b` исчезла.
	 *
	 * @param direction - направление выталкивания `a`:
	 * - `"top"`/`"bottom"`/`"left"`/`"right"` — `a` толкается вдоль мировой оси (Y-вниз: `bottom = +y`, `top = −y`). Делегирует в {@link UB.mtv} от bbox.
	 * - `"min"` (default) — SAT: choose the shortest signed escape along either polygon's edge normals.
	 * Equal escape distances use the direction from `b`'s center to `a`'s center; points and lines fall back to {@link UB.mtv}.
	 *
	 * @returns `null`, если коллизии нет ({@link iConvex.collision} → `false`).
	 */
	mtv(a: CT.Convex, b: CT.Convex, direction: "min" | "top" | "left" | "bottom" | "right" = "min"): CT.C2 | null {
		if (!this.collision(a, b, this.__eps)) return null;

		if (direction !== "min") {
			return UB.mtv(UB.from(a), UB.from(b), direction);
		}

		const ca = this.is(a);
		const cb = this.is(b);
		if (ca.type !== "polygon" || cb.type !== "polygon") {
			return UB.mtv(UB.from(a), UB.from(b), "min");
		}

		const a_center = this.center(a);
		const b_center = this.center(b);
		const dir = UC2.direct(b_center, a_center);

		let min_displacement = Infinity;
		let min_axis: CT.C2 | null = null;

		const axes: CT.C2[] = [];
		for (const e of this.edges(a)) axes.push(UC2.normal(UC2.direct(e[0], e[1])));
		for (const e of this.edges(b)) axes.push(UC2.normal(UC2.direct(e[0], e[1])));

		for (const axis of axes) {
			if (UC2.eq(axis, UC2.zero(), this.__eps)) continue;
			const [a_min, a_max] = this.__projectAxis(a, axis);
			const [b_min, b_max] = this.__projectAxis(b, axis);
			const overlap = Math.min(a_max, b_max) - Math.max(a_min, b_min);
			if (overlap <= this.__eps) return null;
			const negative = b_min - a_max;
			const positive = b_max - a_min;
			const projection = dir.x * axis.x + dir.y * axis.y;
			const displacement = positive < -negative || (positive === -negative && projection > 0) ? positive : negative;
			if (Math.abs(displacement) < Math.abs(min_displacement)) {
				min_displacement = displacement;
				min_axis = axis;
			}
		}

		if (!min_axis) return { x: 0, y: 0 };

		return {
			x: min_axis.x * min_displacement,
			y: min_axis.y * min_displacement,
		};
	}

	/**
	 * Проекция полигона на ось `axis`: `[min, max]` скалярных произведений вершин на `axis`.
	 *
	 * Используется в SAT-методе {@link iConvex.mtv} для проверки перекрытия проекций двух полигонов на каждую ось-кандидат.
	 * Чем длиннее ось, тем больше разброс проекций — для нормализованных осей результат стабильнее.
	 */
	__projectAxis(g: CT.Convex, axis: CT.C2): [number, number] {
		let min = Infinity;
		let max = -Infinity;
		for (const p of g) {
			const proj = p.x * axis.x + p.y * axis.y;
			if (proj < min) min = proj;
			if (proj > max) max = proj;
		}
		return [min, max];
	}
}

export const Convex = new iConvex();
