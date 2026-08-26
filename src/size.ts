import type { P4, SP, SPN } from "./support/spacing.js";
import { spn } from "./support/spacing.js";
import type { RoundMethod } from "./support/math.js";
import { lerp, round } from "./support/math.js";
import { eq, lte } from "./support/epsilon.js";
import { UC2 } from "./coords.js";
import type * as CT from "./types.js";

class iUS {
	/** Толерантность сравнения размеров (унаследована от `UC2.__eps`). */
	__eps = UC2.__eps;

	/** Кол-во знаков округления по умолчанию (унаследовано от `UC2.__fraction`). */
	__fraction = UC2.__fraction;

	/** Кэш `zero()` для дефолтных аргументов. */
	__zero = this.zero();

	//...

	/**
	 * Фабрика размера `zero(w = 0, h = w)`.
	 */
	zero(w: number = 0, h: number = w): CT.S2 {
		return { w, h };
	}

	/**
	 * Поверхностная копия: новый объект с теми же `w`/`h`.
	 */
	copy(s: CT.S2): CT.S2 {
		return { w: s.w, h: s.h };
	}

	/**
	 * **Мутирует** `s`: копирует значения из `expected`.
	 * По умолчанию `expected = {0, 0}` (сброс).
	 */
	assign(s: CT.S2, expected: CT.S2 = this.__zero): void {
		s.w = expected.w;
		s.h = expected.h;
	}

	//...

	/**
	 * Структурно точное равенство c `EPS` по обеим осям.
	 * `b` по умолчанию `{0, 0}`.
	 */
	eq(a: CT.S2, b: CT.S2 = this.__zero, EPS = this.__eps): boolean {
		return eq(a.w, b.w, EPS) && eq(a.h, b.h, EPS);
	}

	/**
	 * Округление размеров до `fraction` знаков.
	 * По умолчанию `__fraction = 3`, согласовано с `__eps`.
	 */
	round(s: CT.S2, fraction: number = this.__fraction, method?: RoundMethod): CT.S2 {
		return {
			w: round(s.w, fraction, method),
			h: round(s.h, fraction, method),
		};
	}

	/**
	 * Линейная интерполяция размеров.
	 * **Не ограничена** `t ∈ [0, 1]` — допускает экстраполяцию.
	 */
	lerp(a: CT.S2, b: CT.S2, t: number): CT.S2 {
		return {
			w: lerp(a.w, b.w, t),
			h: lerp(a.h, b.h, t),
		};
	}

	//...

	/**
	 * Покомпонентный `Math.abs`.
	 */
	abs(s: CT.S2): CT.S2 {
		return { w: Math.abs(s.w), h: Math.abs(s.h) };
	}

	/**
	 * Покомпонентное умножение на скаляр.
	 */
	mult(s: CT.S2, c: number): CT.S2 {
		return { w: s.w * c, h: s.h * c };
	}

	/**
	 * Покомпонентное деление на скаляр.
	 * `c` по умолчанию `2` (половинки — стандартный кейс для расчёта центра и half-extent в {@link UB.depth}, {@link Camera.bound}).
	 */
	div(s: CT.S2, c: number = 2): CT.S2 {
		return { w: s.w / c, h: s.h / c };
	}

	//...

	/**
	 * `Bounds` для размера с якорем в `p`:
	 *
	 * - `"center"` (по умолчанию) — `p` становится центром, половинки в каждую сторону;
	 * - `"anchor"` — `p` становится `minX`/`minY` (TL), размер откладывается в `+x`/`+y`: `min = p`, `max = p + s`.
	 *
	 * Используется для декларативного позиционирования размера в мир.
	 */
	bound(s: CT.S2, p: CT.C2, mode: "center" | "anchor" = "center"): CT.Bounds {
		if (mode === "anchor") {
			return {
				minX: p.x,
				minY: p.y,
				maxX: p.x + s.w,
				maxY: p.y + s.h,
			};
		}
		const half = this.div(s);
		return {
			minX: p.x - half.w,
			minY: p.y - half.h,
			maxX: p.x + half.w,
			maxY: p.y + half.h,
		};
	}

	/**
	 * Точка центра размера в **локальных** координатах (origin = `{0, 0}`):
	 * `(w/2, h/2)`, со смещением `(left - right) / 2`, `(top - bottom) / 2` при асимметричном `padding`.
	 *
	 * Размеры не обладают позицией, поэтому `p` интерпретируется как локальная (а не мировая) точка.
	 * Для перевода в мировые координаты прибавьте точку размещения (обычно `{0, 0}` для локального центра).
	 */
	center(s: CT.S2, padding: SPN = 0, absolute: number = 1): CT.C2 {
		const center: CT.C2 = { x: s.w / 2, y: s.h / 2 };
		const [pt, pr, pb, pl] = this.spn(s, padding, absolute);
		return {
			x: center.x + (pl - pr) / 2,
			y: center.y + (pt - pb) / 2,
		};
	}

	//...

	/**
	 * Глубина точки `p` относительно размера `s` как `Depth = [number, number]`.
	 *
	 * Канон: 0 = центр, ±1 = контур, |val| > 1 — снаружи.
	 * `[0]` — глубина по X, `[1]` — по Y.
	 * При `half = 0` (вырожденная ось): `0` если `p` совпадает с центром по этой оси, иначе `Infinity`.
	 *
	 * `p` должна быть в **локальных** координатах (origin = `{0, 0}`, центр = `{w/2, h/2}`).
	 * Полезно для эффектов «близости к краю» и UV-подобных координат.
	 */
	depth(s: CT.S2, p: CT.C2): CT.Depth {
		const c = this.center(s);
		const rel = UC2.local(c, p);
		const half = this.div(s);
		return [half.w === 0 ? (rel.x === 0 ? 0 : Infinity) : rel.x / half.w, half.h === 0 ? (rel.y === 0 ? 0 : Infinity) : rel.y / half.h];
	}

	/**
	 * Канон пустоты: `w <= 0` ИЛИ `h <= 0` (ноль или отрицательный по любой оси).
	 *
	 * Строгое сравнение с `0`, без `EPS`: микроположительный размер (`0.0001`) **не** пуст.
	 * Отрицательные размеры каноном допускаются, но при таком размере объект сразу считается пустым (`isEmpty = true`).
	 */
	isEmpty(s: CT.S2): boolean {
		return s.w <= 0 || s.h <= 0;
	}

	/**
	 * Помещается ли размер `b` в `a` (без учёта позиции).
	 *
	 * @returns
	 * - `null` — размеры равны (с `EPS`);
	 * - `true` — `b` меньше или равен `a` по обеим осям;
	 * - `false` — `b` больше `a` хотя бы по одной оси.
	 */
	puttable(a: CT.S2, b: CT.S2, EPS = this.__eps): boolean | null {
		if (this.eq(a, b, EPS)) return null;
		return lte(b.w, a.w, EPS) && lte(b.h, a.h, EPS);
	}

	//...

	/**
	 * Абсолютное значение отступа по одной оси:
	 * доля при `|sp| < absolute` (по умолчанию `absolute = 1`), иначе — само `sp` как пиксели.
	 *
	 * На границе (`|sp| === absolute`) — абсолют.
	 * Используется {@link iUS.spn}.
	 */
	sp(a: number, sp: SP, absolute: number = 1) {
		if (Array.isArray(sp)) {
			let acc = 0;
			for (const p of sp) acc += Math.abs(p) < absolute ? a * p : p;
			return acc;
		}
		return Math.abs(sp) < absolute ? a * sp : sp;
	}

	/**
	 * Раскладывает `padding` в `P4 = [top, right, bottom, left]` с пересчётом долей в пиксели
	 * по соответствующей оси размера: `top`/`bottom` → от `s.h`, `left`/`right` → от `s.w`.
	 *
	 * `absolute` — граница «доля/пиксели».
	 */
	spn(s: CT.S2, padding: SPN, absolute: number = 1): P4 {
		const [top, right, bottom, left] = spn(padding);
		const pt = this.sp(s.h, top, absolute);
		const pr = this.sp(s.w, right, absolute);
		const pb = this.sp(s.h, bottom, absolute);
		const pl = this.sp(s.w, left, absolute);
		return [pt, pr, pb, pl];
	}

	//...

	/**
	 * Сжатие `S2` на `P4 = [top, right, bottom, left]`: `w -= left + right`, `h -= top + bottom`.
	 *
	 * Может породить отрицательные размеры.
	 *
	 * Не предназначен для вывернутых Size — `w`/`h` трактуются как положительные протяжённости, отрицательный результат = «схлопнутый» размер.
	 */
	pad(s: CT.S2, [pt, pr, pb, pl]: P4): CT.S2 {
		return {
			w: s.w - pl - pr,
			h: s.h - pt - pb,
		};
	}

	/**
	 * Сжатие `S2` на `padding` (отступ «внутрь»). Может породить отрицательные размеры.
	 *
	 * Не предназначен для вывернутых Size.
	 */
	deflate(s: CT.S2, padding: SPN = 0, absolute: number = 1): CT.S2 {
		if (padding === 0) return this.copy(s);
		return this.pad(s, this.spn(s, padding, absolute));
	}

	/**
	 * Расширение `S2` на `margin` (отступ «наружу»). Может породить отрицательные размеры (при `margin > size`).
	 *
	 * Не предназначен для вывернутых Size.
	 */
	inflate(s: CT.S2, margin: SPN = 0, absolute: number = 1): CT.S2 {
		if (margin === 0) return this.copy(s);
		const [mt, mr, mb, ml] = this.spn(s, margin, absolute);
		return this.pad(s, [-mt, -mr, -mb, -ml]);
	}
}

export const US = new iUS();
