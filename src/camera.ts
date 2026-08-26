import type { SPN } from "./support/spacing.js";
import { clamp } from "./support/math.js";
import { eq } from "./support/epsilon.js";
import { UB } from "./bounds.js";
import { UC2 } from "./coords.js";
import type { RenderFrameEvent } from "./render.js";
import { Render } from "./render.js";
import { US } from "./size.js";
import type * as CT from "./types.js";

export interface NewCamera {
	id: string;
	render?: Render;
	onchange?: (mode: "force" | "tick", dirty: boolean) => void;
}

export class Camera {
	/** Толерантность сравнения центра (унаследована от `UC2.__eps`). */
	static __eps_center = UC2.__eps;

	/** Толерантность сравнения масштаба (`1e-6`, логарифмическое пространство). */
	static __eps_scale = 1e-6;

	/** Масштаб по умолчанию для {@link Camera.zero}. */
	static __scale = 1.15;

	/** Постоянная времени сглаживания `center` (мс). По умолчанию `175`. */
	static __tau_center = 175;

	/** Постоянная времени сглаживания `scale` (мс). По умолчанию `110`. */
	static __tau_scale = 110;

	/** Нижняя жёсткая граница `scale` (для {@link Camera.clamp}). */
	static __hard_min_scale = 0.33;

	/** Верхняя жёсткая граница `scale` (для {@link Camera.clamp}). */
	static __hard_max_scale = 4;

	/** Кэш `zero()` для дефолтных аргументов. */
	static __zero = Camera.zero();

	/** Целевое значение, к которому `state` плавно приближается. */
	target: CT.Camera;

	/** Текущее (интерполированное) значение, используется для отрисовки. */
	state: CT.Camera;

	/** Контекст: `id`, `render`, `onchange`. Сохраняется как есть. */
	ctx: NewCamera;

	/**
	 * @param camera - начальное значение (копируется в `state` и `target`).
	 * @param ctx - см. {@link NewCamera}.
	 */
	constructor(camera: CT.Camera, ctx: NewCamera) {
		this.ctx = ctx;
		this.state = Camera.copy(camera);
		this.target = Camera.copy(camera);
	}

	/**
	 * Установить новое `target`.
	 *
	 * В плавном режиме регистрирует тик в {@link Render}; при `instant = true`
	 * отменяет ожидающий тик и синхронно копирует `target` в `state`.
	 * No-op, если `target` и `state` уже совпадают с новым значением.
	 */
	mutate(target: CT.Camera, instant: boolean = false): void {
		if (Camera.eq(this.target, target)) {
			if (Camera.eq(this.state, target)) return;
		} else {
			Camera.assign(this.target, target);
		}
		if (instant) {
			this.ctx.render?.drop(this.ctx.id);
			Camera.assign(this.state, this.target);
			this.ctx.onchange?.("force", false);
			return;
		}
		this.dirty();
	}

	/**
	 * Зарегистрировать тик в `ctx.render` или скопировать `target → state` сразу (если `ctx.render === null`).
	 *
	 * No-op, если `state == target` уже.
	 */
	dirty(): void {
		if (this.ctx.render) {
			this.ctx.render.push({
				id: this.ctx.id,
				func: (event) => this.__tick(event),
			});
		} else {
			Camera.assign(this.state, this.target);
			this.ctx.onchange?.("force", false);
		}
	}

	/**
	 * Один тик интерполяции: пытается приблизить `state` к `target` по обоим осям.
	 *
	 * Возвращает `true`, если `state` ещё не достиг `target` (нужен ещё кадр).
	 *
	 * При достижении цели вызывает `onchange("tick", false)`, при продолжающейся интерполяции — `onchange("tick", true)`.
	 */
	__tick({ dt }: RenderFrameEvent): boolean {
		let dirty = false;
		if (this.__tick_center(dt)) dirty = true;
		if (this.__tick_scale(dt)) dirty = true;
		this.ctx.onchange?.("tick", dirty);
		return dirty;
	}

	/**
	 * Интерполяция `center` через линейный `lerp` с `α = Render.alpha(dt, __tau_center)`.
	 *
	 * При достижении `target` (в пределах `__eps_center`) `state` снэпится ровно к нему.
	 */
	__tick_center(dt: number): boolean {
		return UC2.tick({
			current: this.state.center,
			target: this.target.center,
			eps: Camera.__eps_center,
			tau: Camera.__tau_center,
			dt,
		});
	}

	/**
	 * Интерполяция `scale` в логарифмическом пространстве.
	 * Даёт визуально равномерный зум в обе стороны от `1`
	 * (линейная интерполяция масштаба «прыгала» бы при переходе через `1`).
	 *
	 * При достижении `target` (в пределах `__eps_scale`) `state` снэпится ровно к нему.
	 */
	__tick_scale(dt: number): boolean {
		const current = this.state.scale;
		const target = this.target.scale;
		if (eq(current, target, Camera.__eps_scale)) return false;

		const a = Render.alpha(dt, Camera.__tau_scale);
		const current_log = Math.log(this.state.scale);
		const target_log = Math.log(this.target.scale);

		const lerped = Math.exp(current_log + (target_log - current_log) * a);
		const lerped_log = Math.log(lerped);

		this.state.scale = Math.abs(target_log - lerped_log) <= Camera.__eps_scale ? target : lerped;
		return true;
	}

	/**
	 * Удалить камеру из рендера (отписаться от тиков). `state` и `target` не очищаются.
	 * Если `ctx.render` не был передан — no-op.
	 */
	stop() {
		this.ctx.render?.drop(this.ctx.id);
	}

	//...

	/**
	 * Фабрика `Camera` `zero({0, 0}, scale = Camera.__scale)`.
	 */
	static zero({ x, y } = UC2.__zero, scale: number = Camera.__scale): CT.Camera {
		return { center: { x, y }, scale };
	}

	/**
	 * Копия камеры (новый объект `center`).
	 */
	static copy({ center: { x, y }, scale }: CT.Camera): CT.Camera {
		return { center: { x, y }, scale };
	}

	/**
	 * **Мутирует** `camera`: копирует значения из `expected`. По умолчанию `expected` = {@link Camera.zero}.
	 *
	 * Канон: `assign` — единственный метод, мутирующий входной объект.
	 */
	static assign(camera: CT.Camera, { center: { x, y }, scale }: CT.Camera = Camera.zero()): void {
		camera.center.x = x;
		camera.center.y = y;
		camera.scale = scale;
	}

	/**
	 * Структурно точное равенство: `center` в пределах `__eps_center`, `scale` — в пределах `__eps_scale`.
	 *
	 * `b` по умолчанию `zero()`.
	 */
	static eq(a: CT.Camera, b: CT.Camera = Camera.__zero): boolean {
		return UC2.eq(a.center, b.center, Camera.__eps_center) && eq(a.scale, b.scale, Camera.__eps_scale);
	}

	//...

	/**
	 * Мировые координаты экранной точки `client`
	 *
	 * Формула: `(client − anchor) / scale + cam.center`.
	 * При `scale = 1`, `anchor = cam.center` → `client` (без изменений).
	 *
	 * @param anchor - обычно центр экрана (см. {@link US.center}).
	 */
	static refract({ center, scale }: CT.Camera, anchor: CT.C2, client: CT.C2): CT.C2 {
		return {
			x: (client.x - anchor.x) / scale + center.x,
			y: (client.y - anchor.y) / scale + center.y,
		};
	}

	/**
	 * Обратная операция к {@link Camera.refract}: экранные координаты мировой точки `world`.
	 */
	static unrefract({ center, scale }: CT.Camera, anchor: CT.C2, world: CT.C2): CT.C2 {
		return {
			x: (world.x - center.x) * scale + anchor.x,
			y: (world.y - center.y) * scale + anchor.y,
		};
	}

	//...

	/**
	 * Сдвинуть `center` на `delta` в **мировых** координатах.
	 *
	 * `delta` не зависит от `scale`: один и тот же `delta` визуально сдвинет содержимое на разное число пикселей при разных `scale`.
	 * Для сдвига в **экранных** координатах предварительно разделите `delta` на `scale`.
	 */
	static pan({ center, scale }: CT.Camera, delta: CT.C2): CT.Camera {
		return { center: UC2.sum(center, delta), scale };
	}

	/**
	 * Приблизить/отдалить камеру в `factor` раз, удерживая точку `target` на месте.
	 *
	 * @param clamp_flag - если `true`, итоговый `scale` клампится в `[__hard_min_scale, __hard_max_scale]`.
	 * @returns `null`, если итоговый `scale` совпадает с текущим (после клампа).
	 */
	static zoom({ center, scale }: CT.Camera, target: CT.C2, factor: number, clamp_flag: boolean): CT.Camera | null {
		const factored = Camera.clamp(scale * factor, clamp_flag);
		if (scale === factored) return null;
		return {
			center: UC2.lerp(target, center, 1 / (factored / scale)),
			scale: factored,
		};
	}

	//...

	/**
	 * Видимые {@link Bounds} для камеры при заданных размерах viewport с учётом `padding`.
	 *
	 * Это область мировых координат, попадающая на экран.
	 * Используется для виртуализации, отсечения невидимых объектов, проверки попадания в viewport.
	 */
	static bound(camera: CT.Camera, __avp_size: CT.S2, padding: SPN): CT.Bounds {
		const avp_size = US.deflate(__avp_size, padding);
		const avp_center = US.center(__avp_size, padding);
		const relative_center = Camera.refract(camera, US.center(__avp_size), avp_center);
		const quarter = US.div(avp_size, 2 * camera.scale);
		return {
			minX: relative_center.x - quarter.w,
			minY: relative_center.y - quarter.h,
			maxX: relative_center.x + quarter.w,
			maxY: relative_center.y + quarter.h,
		};
	}

	/**
	 * Дельта, на которую нужно сдвинуть `camera.center`,
	 * чтобы видимая область (с `padding`) была симметрична относительно центра `avp`.
	 *
	 * @returns `null`, если `padding` — число (симметрия обеспечена автоматически) или дельта нулевая.
	 */
	static relative(camera: CT.Camera, __avp_size: CT.S2, padding: SPN): CT.C2 | null {
		if (typeof padding === "number") return null;
		const avp_center = US.center(__avp_size, padding);
		const relative_center = Camera.refract(camera, US.center(__avp_size), avp_center);
		const delta = UC2.sub(camera.center, relative_center);
		if (delta.x === 0 && delta.y === 0) return null;
		return delta;
	}

	//...

	/**
	 * Максимальный `scale`, при котором `bounds` помещаются в `avp` с учётом `padding`.
	 *
	 * @returns дефолтное `__scale`, если `bounds` или `avp` пустые.
	 */
	static out(bounds: CT.Bounds, __avp_size: CT.S2, padding: SPN, clamp_flag: boolean): number {
		const target = UB.size(bounds);
		if (US.isEmpty(target)) return Camera.__scale;

		const avp_size = US.deflate(__avp_size, padding);
		if (US.isEmpty(avp_size)) return Camera.__scale;

		const scale = Math.min(avp_size.w / target.w, avp_size.h / target.h);
		return Camera.clamp(scale, clamp_flag);
	}

	/**
	 * Камера, в которую `bounds` вписаны в `avp` с учётом `padding`.
	 *
	 * `center` ставится в центр `bounds` плюс {@link Camera.relative}-компенсация для асимметричного `padding`.
	 * `scale` — через {@link Camera.out} (уже с клампом).
	 */
	static fit(bounds: CT.Bounds, avp_size: CT.S2, padding: SPN, clamp_flag: boolean): CT.Camera {
		const center = UB.center(bounds);
		const scale = Camera.out(bounds, avp_size, padding, clamp_flag);
		const delta = Camera.relative({ center, scale }, avp_size, padding) ?? UC2.zero();
		return { center: UC2.sum(center, delta), scale };
	}

	/**
	 * Зажать `scale` в `[__hard_min_scale, __hard_max_scale]`.
	 *
	 * Если `flag === false`, клампа нет — `scale` возвращается как есть
	 * (полезно для виртуализации, где нужно честное «как можно ближе/дальше»).
	 */
	static clamp(scale: number, flag: boolean = true): number {
		return flag ? clamp(Camera.__hard_min_scale, scale, Camera.__hard_max_scale) : scale;
	}
}
