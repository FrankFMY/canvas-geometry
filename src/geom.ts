import { UB } from "./bounds.js";
import { Convex } from "./convex.js";
import { UC2 } from "./coords.js";
import { UD } from "./depth.js";
import { UE } from "./edge.js";
import { UPL } from "./polyline.js";
import type * as CT from "./types.js";

/**
 * Универсальная геометрия: {@link CT.C2} (точка), {@link CT.Bounds} (AABB), {@link CT.Convex} (замкнутый полигон)
 * или {@link CT.Polyline} (открытая ломаная).
 *
 * `UG` — полиморфный API над всеми четырьмя видами геометрии, используемый в {@link Spatial} для индексации,
 * запросов и охвата. Каждая ветка делегирует в специализированный модуль (`UC2`/`UB`/`Convex`/`UPL`).
 *
 * @remarks
 * Дискриминация идёт по структуре: `Bounds` — объект с `minX`, массив с `length > 3 && eq(g[0], g[n-1])` —
 * `Convex` (замкнутый), прочий массив — `Polyline`, `C2` — объект без `minX`.
 * Каноны владения/контура/вырожденности — общие для всего пакета (см. README), `UG` лишь диспетчит.
 */
class iUG {
	/** Толерантность сравнения координат (унаследована от `UC2.__eps`). */
	__eps = UC2.__eps;

	/** Толерантность коллинеарности (унаследована от `UC2.__vect_eps`). */
	__vect_eps = UC2.__vect_eps;

	//...

	isPoint(g: CT.Geom): g is CT.C2 {
		return "x" in g;
	}

	isBounds(g: CT.Geom): g is CT.Bounds {
		return "minX" in g;
	}

	/**
	 * Предикат замкнутого полигона: массив с `length > 3` и `g[0] ≈ g[n-1]` (закрывающий дубль первой вершины).
	 * Минимум — 3 уникальные вершины + закрывающий дубль (треугольник = `length 4`).
	 *
	 * Возвращает `boolean` (без type predicate): `Convex` и `Polyline` структурно идентичны (`C2[]`),
	 * поэтому типовой_guard здесь бессмысленен — дискриминация только-runtime по порогу замыкания.
	 */
	isConvex(g: CT.Geom): boolean {
		return Array.isArray(g) && g.length > 3 && UC2.eq(g[0], g[g.length - 1], this.__eps);
	}

	/**
	 * Предикат открытой ломаной: массив, не являющийся {@link iUG.isConvex} (включая пустой, точку, ребро
	 * и незамкнутые 2+ вершин). Парный к {@link iUG.isConvex} по порогу замыкания. Без type predicate (см. {@link iUG.isConvex}).
	 */
	isPolyline(g: CT.Geom): boolean {
		return Array.isArray(g) && !this.isConvex(g);
	}

	//...

	/**
	 * Полиморфная копия: `UC2.copy` для `C2`, `UB.copy` для `Bounds`, `Convex.copy` для `Convex`, `UPL.copy` для `Polyline`.
	 *
	 * Гарантирует, что изменение копии не затронет исходный объект.
	 */
	copy(g: CT.Geom): CT.Geom {
		if (this.isPoint(g)) return UC2.copy(g);
		if (this.isBounds(g)) return UB.copy(g);
		if (this.isConvex(g)) return Convex.copy(g);
		return UPL.copy(g);
	}

	//...

	/**
	 * Полиморфный охватывающий `Bounds` (AABB):
	 * - `C2` → вырожденный `Bounds`-точка (`UB.zero(x, y)`);
	 * - `Bounds` → копия;
	 * - `Convex` → AABB через {@link Convex.bound} (делегирует в `UB.from`);
	 * - `Polyline` → AABB через {@link UPL.bound} (делегирует в `UB.from`).
	 *
	 * Ключевой мост между геометрией и гридом: именно этот AABB определяет, в какие ячейки ложится объект.
	 */
	bound(g: CT.Geom): CT.Bounds {
		if (this.isPoint(g)) return UB.zero(g.x, g.y);
		if (this.isBounds(g)) return UB.copy(g);
		if (this.isConvex(g)) return Convex.bound(g);
		return UPL.bound(g);
	}

	//...

	/**
	 * Полиморфное представление контура как замкнутого `Convex` (с закрывающим дублём первой вершины):
	 * - `C2` → `[copy, copy]` (вырожденный замкнутый контур-точка);
	 * - `Bounds` → 4 угла против часовой (`UB.corners`) + закрывающий дубль первого;
	 * - `Convex` → копия массива вершин (уже замкнут по канону);
	 * - `Polyline` → копия вершин + закрывающий дубль `g[0]` (пустая → `[]`).
	 *
	 * Используется для кэша фрустума {@link SpatialView.__convex}, чтобы единообразно вызывать коллизионные
	 * проверки при любом типе геометрии фрустума.
	 */
	convex(g: CT.Geom): CT.Convex {
		if (this.isPoint(g)) return [UC2.copy(g), UC2.copy(g)];
		if (this.isBounds(g)) {
			const corners = UB.corners(g);
			return [...corners, UC2.copy(corners[0])];
		}
		if (this.isConvex(g)) return Convex.copy(g);
		if (g.length === 0) return [];
		return [...UPL.copy(g), UC2.copy(g[0])];
	}

	//...

	/**
	 * Полиморфное владение точкой (канон владения):
	 * - `C2` → `UC2.eq` (точка обладает собой);
	 * - `Bounds` → `UB.has` (строго внутри по обеим осям);
	 * - `Convex` → `Convex.has` (half-plane test, контур исключён);
	 * - `Polyline` → `UPL.has` (1D-interior: открытые сегменты + внутренние вершины, крайние концы исключены).
	 */
	has(g: CT.Geom, p: CT.C2, EPS = this.__eps): boolean {
		if (this.isPoint(g)) return UC2.eq(g, p, EPS);
		if (this.isBounds(g)) return UB.has(g, p, EPS);
		if (this.isConvex(g)) return Convex.has(g, p, EPS);
		return UPL.has(g, p, EPS);
	}

	//...

	/**
	 * Полиморфное расширение аккумулятора `Bounds`:
	 * - `C2` → {@link UB.push} одной точкой;
	 * - `Bounds` → {@link UB.mix} (расширение по 4 границам);
	 * - `Convex`/`Polyline` → {@link UB.push} каждой вершиной (закрывающий дубль `Convex` безвреден).
	 *
	 * **Мутирует** `acc`. Используется для построения охватывающего `Bounds` от набора разнородной геометрии.
	 */
	push(acc: CT.Bounds, g: CT.Geom): void {
		if (this.isPoint(g)) UB.push(acc, g);
		else if (this.isBounds(g)) UB.mix(acc, g);
		else UB.push(acc, ...g);
	}

	//...

	/**
	 * Полиморфная коллизия (канон владения): наличие общей значащей точки.
	 *
	 * - `C2`-сторона сводится к {@link iUG.has} другой геометрии (точка внутри/совпадает);
	 *   `C2 ⋂ C2` → `UC2.eq`;
	 * - `Bounds ⋂ Bounds` → {@link UB.collision};
	 * - `Bounds ⋂ Convex` → {@link Convex.collision} от замкнутых углов `Bounds`;
	 * - `Bounds ⋂ Polyline` → {@link iUG.__collisionBoundsPolyline} (1D-interior ломаной ∩ 2D-interior `Bounds`);
	 * - `Convex ⋂ Convex` → {@link Convex.collision};
	 * - `Convex ⋂ Polyline` → {@link iUG.__collisionConvexPolyline} (1D-interior ломаной ∩ 2D-interior `Convex`);
	 * - `Polyline ⋂ Polyline` → {@link UPL.collision}.
	 *
	 * Симметрична: `collision(a, b) === collision(b, a)`.
	 */
	collision(a: CT.Geom, b: CT.Geom, EPS = this.__eps): boolean {
		if (this.isPoint(a)) {
			if (this.isPoint(b)) return UC2.eq(a, b, EPS);
			return this.has(b, a, EPS);
		}
		if (this.isPoint(b)) return this.has(a, b, EPS);

		if (this.isBounds(a)) {
			if (this.isBounds(b)) return UB.collision(a, b, EPS);
			if (this.isConvex(b)) return Convex.collision(this.convex(a), b, EPS);
			return this.__collisionBoundsPolyline(a, b, EPS);
		}
		if (this.isBounds(b)) {
			if (this.isConvex(a)) return Convex.collision(a, this.convex(b), EPS);
			return this.__collisionBoundsPolyline(b, a, EPS);
		}

		if (this.isConvex(a)) {
			if (this.isConvex(b)) return Convex.collision(a, b, EPS);
			return this.__collisionConvexPolyline(a, b, EPS);
		}
		if (this.isConvex(b)) return this.__collisionConvexPolyline(b, a, EPS);
		return UPL.collision(a, b, EPS);
	}

	/**
	 * `Bounds ⋂ Polyline`: 1D-interior ломаной пересекает 2D-interior `Bounds`.
	 *
	 * Значащая точка ломаной (открытый сегмент или внутренняя вершина) строго внутри `Bounds`:
	 * - внутренняя вершина `g[1..n-2]` строго внутри ({@link UB.has});
	 * - для каждого сегмента: конец строго внутри `Bounds` ({@link UB.has}, открытый сегмент рядом с ним строго внутри)
	 *   **или** сегмент строго пересекает ребро `Bounds` ({@link UE.cross} + {@link UD.has} по обоим) — вход в interior.
	 */
	__collisionBoundsPolyline(bounds: CT.Bounds, poly: CT.Polyline, EPS: number): boolean {
		for (let i = 1; i < poly.length - 1; i++) {
			if (UB.has(bounds, poly[i], EPS)) return true;
		}
		const bEdges = UB.edges(bounds);
		for (const seg of UPL.edges(poly)) {
			if (UB.has(bounds, seg[0], EPS) || UB.has(bounds, seg[1], EPS)) return true;
			for (const be of bEdges) {
				const c = UE.cross(seg, be);
				if (Array.isArray(c) && UD.has(c[1], EPS) && UD.has(c[2], EPS)) return true;
			}
		}
		return false;
	}

	/**
	 * `Convex ⋂ Polyline`: 1D-interior ломаной пересекает 2D-interior `Convex`.
	 *
	 * Значащая точка ломаной строго внутри `Convex`:
	 * - внутренняя вершина `g[1..n-2]` строго внутри ({@link Convex.has});
	 * - для каждого сегмента: конец строго внутри `Convex` (открытый сегмент рядом с ним строго внутри)
	 *   **или** сегмент строго пересекает ребро `Convex` ({@link UE.cross} + {@link UD.has} по обоим) — вход в interior.
	 */
	__collisionConvexPolyline(convex: CT.Convex, poly: CT.Polyline, EPS: number): boolean {
		for (let i = 1; i < poly.length - 1; i++) {
			if (Convex.has(convex, poly[i], EPS)) return true;
		}
		const cEdges = Convex.edges(convex);
		for (const seg of UPL.edges(poly)) {
			if (Convex.has(convex, seg[0], EPS) || Convex.has(convex, seg[1], EPS)) return true;
			for (const ce of cEdges) {
				const c = UE.cross(seg, ce);
				if (Array.isArray(c) && UD.has(c[1], EPS) && UD.has(c[2], EPS)) return true;
			}
		}
		return false;
	}
}

export const UG = new iUG();
