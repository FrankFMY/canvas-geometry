import { UB } from "./bounds.js";
import { UC2 } from "./coords.js";
import type { CanvasContext } from "./index.js";
import type * as CT from "./types.js";

/**
 * Стиль обводки для {@link Draw.stroke}: цвет, толщина, оформление концов/стыков, dash-pattern и альфа.
 *
 * Все поля опциональны — незаданные не трогают контекст, что позволяет инкрементально патчить стили поверх ранее установленных.
 * `alpha` влияет на всё через `globalAlpha` (см. {@link Draw.fill}); для локального эффекта оборачивайте в {@link Draw.scope}.
 */
export interface DrawStrokeStyle {
	color?: string;
	width?: number;
	join?: CanvasLineJoin;
	cap?: CanvasLineCap;
	dash?: number[];
	alpha?: number;
}

/**
 * Стиль заливки для {@link Draw.fill}: цвет и альфа.
 * Минимальный набор: для обводки нужен {@link DrawStrokeStyle}.
 * `alpha` через `globalAlpha` — действует на всю последующую отрисовку до сброса.
 */
export interface DrawFillStyle {
	color?: string;
	alpha?: number;
}

/**
 * Связка «стиль обводки + стиль заливки + глобальная прозрачность»: всё, что нужно для одной отрисовки.
 *
 * Удобно как общий конфиг для UI-элементов, которые рисуются одинаково (например, все маркеры одного типа).
 * Передавайте в `Draw.stroke`/`Draw.fill` через spread.
 */
export interface DrawStyles {
	stroke: DrawStrokeStyle;
	fill: DrawFillStyle;
	opacity: number;
}

export class Draw<Context extends CanvasContext = CanvasRenderingContext2D> {
	/** 2D-контекст, над которым работает обёртка. */
	ctx: Context;

	/**
	 * Конструктор обёртки. Сохраняет ссылку на контекст — все методы мутируют состояние контекста, а не сам `Draw`.
	 *
	 * `Draw` stateless относительно стилей: после `stroke({...})`/`fill({...})`/`scope(cb)` стили применяются к контексту,
	 * но `Draw` не запоминает их. Это позволяет использовать один `Draw` для разных операций без сброса.
	 *
	 * @param ctx - `2D-контекст` (клиентский `CanvasRenderingContext2D` или серверный `OffscreenCanvasRenderingContext2D`).
	 */
	constructor(ctx: Context) {
		this.ctx = ctx;
	}

	//...

	/**
	 * Размер **экранного** пикселя в текущих единицах трансформы.
	 *
	 * Возвращает `n / scale`, где `scale` — среднее `|a+d|` и `|b+c|` из матрицы трансформации контекста.
	 * Если `scale === 0`, возвращает `n`.
	 *
	 * Позволяет рисовать обводки/точки фиксированной **видимой** толщины при любом зуме камеры:
	 * drw.stroke({ width: drw.px(2) })` → 2 экранных пикселя.
	 *
	 * @param n - желаемый размер в экранных пикселях (по умолчанию `1`).
	 */
	static px(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, n: number = 1): number {
		const t = ctx.getTransform();
		const sx = Math.hypot(t.a, t.b);
		const sy = Math.hypot(t.c, t.d);
		const s = (sx + sy) / 2;
		return s > 0 ? n / s : n;
	}

	/**
	 * Instance-форма {@link Draw.px}: тот же расчёт, но от `this.ctx`.
	 *
	 * Удобно для чейнинга: `drw.px(2)` вместо `Draw.px(drw.ctx, 2)`.
	 * Семантика идентична — результат зависит только от матрицы трансформации контекста.
	 */
	px(n: number = 1): number {
		return Draw.px(this.ctx, n);
	}

	/**
	 * `ctx.save()` + `cb(this)` + `ctx.restore()` в `finally`.
	 *
	 * Гарантирует восстановление трансформ/стилей даже при исключении в `cb`.
	 */
	scope(cb: (drw: this) => void): this {
		this.ctx.save();
		try {
			cb(this);
		} finally {
			this.ctx.restore();
		}
		return this;
	}

	/**
	 * Применить камеру как трансформ: `translate(anchor) → scale(cam.scale) → translate(-cam.center)`.
	 *
	 * Выполняется в {@link Draw.scope} — после `cb` трансформ восстанавливается.
	 */
	camera(cam: CT.Camera, anchor: CT.C2, cb: (drw: this) => void): this {
		return this.scope((drw) => {
			drw.ctx.translate(anchor.x, anchor.y);
			drw.ctx.scale(cam.scale, cam.scale);
			drw.ctx.translate(-cam.center.x, -cam.center.y);
			cb(drw);
		});
	}

	//...

	/**
	 * `beginPath` + `cb` + `closePath`: замыкает path-блок для последующей операции.
	 *
	 * Сам по себе не рисует — нужен {@link stroke} или {@link fill} следом (или {@link clip} для ограничения отрисовки).
	 * `closePath` соединяет последнюю точку с начальной — для полигонов, которые должны быть замкнуты визуально;
	 * для открытых контуров оставляет зазор (используйте `beginPath` без `closePath` через прямой `ctx.moveTo`+`lineTo`).
	 */
	path(cb: (drw: this) => void): this {
		this.ctx.beginPath();
		cb(this);
		this.ctx.closePath();
		return this;
	}

	/**
	 * Путь по 4 углам `Bounds` (через {@link UB.corners}): TL → TR → BR → BL → TL.
	 *
	 * Сам по себе не рисует — нужен {@link stroke}/{@link fill}/{@link clip} следом.
	 * Полезен для подсветки/отладки AABB или для рендера прямоугольников без отдельного `rect()`.
	 */
	bounds(bounds: CT.Bounds): this {
		const corners = UB.corners(bounds);
		this.path(() => {
			const start = corners[0];
			this.ctx.moveTo(start.x, start.y);
			this.ctx.lineTo(corners[1].x, corners[1].y);
			this.ctx.lineTo(corners[2].x, corners[2].y);
			this.ctx.lineTo(corners[3].x, corners[3].y);
			this.ctx.lineTo(corners[0].x, corners[0].y);
		});
		return this;
	}

	/**
	 * `path(cb)` + `ctx.clip()`: замыкает path и устанавливает его как область отсечения.
	 *
	 * Используется для ограничения отрисовки (например, чтобы не рисовать за пределами viewport или внутри «окна» лупы).
	 * После `clip` все последующие операции применяются только внутри области — до следующего `restore()` через {@link scope}.
	 */
	clip(cb: (drw: this) => void): this {
		this.path(cb);
		this.ctx.clip();
		return this;
	}

	/**
	 * `ctx.clearRect(anchor.x, anchor.y, size.w, size.h)`: очищает прямоугольник до прозрачности.
	 *
	 * По умолчанию `anchor = {0, 0}` — очищает весь canvas (если `size` совпадает с `Canvas.size`).
	 * Применяется в начале кадра перед основной отрисовкой, чтобы избежать «следов» от предыдущего кадра (если не используется полная `fill` фона).
	 */
	clear(size: CT.S2, anchor: CT.C2 = UC2.zero()): this {
		this.ctx.clearRect(anchor.x, anchor.y, size.w, size.h);
		return this;
	}

	//...

	/**
	 * Применить стили обводки и (опционально) выполнить `ctx.stroke()`.
	 *
	 * Любое незаданное поле `style` не трогает соответствующее свойство контекста — можно патчить инкрементально (например, поменять только `color`, не сбрасывая `lineWidth`).
	 * При `apply = false` стили применяются, но `stroke()` не вызывается — полезно для пакетной отрисовки (один `moveTo`/`lineTo` для нескольких полиголов → один общий `stroke`).
	 */
	stroke(style: DrawStrokeStyle = {}, apply = true): this {
		const { ctx } = this;
		if (style.color !== undefined) ctx.strokeStyle = style.color;
		if (style.width !== undefined) ctx.lineWidth = style.width;
		if (style.join !== undefined) ctx.lineJoin = style.join;
		if (style.cap !== undefined) ctx.lineCap = style.cap;
		if (style.dash !== undefined) ctx.setLineDash(style.dash);
		if (style.alpha !== undefined) ctx.globalAlpha = style.alpha;
		if (apply) ctx.stroke();
		return this;
	}

	/**
	 * Применить стили заливки и (опционально) выполнить `ctx.fill()`.
	 *
	 * Семантика идентична {@link stroke}: пустые поля `style` не трогают контекст, `apply = false` отключает `fill()` для пакетной отрисовки.
	 * `alpha` через `globalAlpha` — влияет на весь последующий рендер до сброса, для локального эффекта оборачивайте в {@link scope}.
	 */
	fill(style: DrawFillStyle = {}, apply = true): this {
		const { ctx } = this;
		if (style.color !== undefined) ctx.fillStyle = style.color;
		if (style.alpha !== undefined) ctx.globalAlpha = style.alpha;
		if (apply) ctx.fill();
		return this;
	}
}
