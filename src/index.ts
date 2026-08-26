import { UC2 } from "./coords.js";
import { Draw } from "./draw.js";
import { US } from "./size.js";
import type * as CT from "./types.js";

/**
 * Универсальный 2D-контекст: клиентский `CanvasRenderingContext2D` или серверный `OffscreenCanvasRenderingContext2D`.
 *
 * Используется как параметр типа в {@link Draw}, чтобы один и тот же API работал и в DOM, и в `OffscreenCanvas` (воркеры, рендер в фоне).
 */
export type CanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Опции создания {@link Canvas}: управление {@link ResizeObserver}, прокидывание `getContext("2d", options)`, smoothing и стартовый размер.
 *
 * - `offResizeObserver: true` — для overlay-слоя, который ресайзится вручную из основного canvas (нет observer'а — нет шторма rAF при resize родителя).
 * - `observe` — колбэк после каждого resize от observer'а (для интеграции с {@link Camera}, сброса viewport-кешей).
 * - `options` — прокидываются в `getContext("2d", ...)`. Не все опции поддерживаются всеми браузерами (см. {@link CanvasCtxOptions}).
 * - `smoothing` — `imageSmoothingEnabled`/`imageSmoothingQuality`, применяются после каждого resize (resize `el.width`/`el.height` сбрасывает состояние контекста).
 * - `size` — стартовое значение; без него — из `rect() * dpr` в конструкторе.
 */
export interface NewCanvas {
	offResizeObserver?: boolean;
	observe?: (canvas: Canvas) => void;
	options?: CanvasCtxOptions;
	smoothing?: CanvasSmoothing;
	size?: CT.S2;
}

/**
 * Опции для `getContext("2d", options)`.
 * Семантика полей — по {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext | MDN}.
 *
 * Не все опции поддерживаются всеми браузерами:
 * - `alpha` — не реализовано в Safari;
 * - `colorSpace`/`desynchronized`/`willReadFrequently` — не реализовано в Firefox;
 * - `colorType` — не реализовано в Firefox и Safari.
 */
export interface CanvasCtxOptions {
	alpha?: boolean;
	colorSpace?: "srgb" | "display-p3";
	colorType?: "unorm8" | "float16";
	desynchronized?: boolean;
	willReadFrequently?: boolean;
}

/**
 * Настройки сглаживания для {@link Canvas}: `imageSmoothingEnabled` и (опционально) `imageSmoothingQuality`.
 *
 * Применяются после каждого {@link Canvas.__resize}, т.к. ресайз `el.width`/`el.height` сбрасывает состояние контекста.
 * `imageSmoothingQuality` не реализовано в Firefox.
 */
export interface CanvasSmoothing {
	imageSmoothingEnabled?: boolean;
	// not implemented in FireFox
	imageSmoothingQuality?: "low" | "medium" | "high";
}

/**
 * Обёртка над `HTMLCanvasElement` с контекстом, `dpr` (devicePixelRatio) и {@link Draw}.
 *
 * При создании по умолчанию стартует {@link ResizeObserver} на `el` — `size` и `el.width`/`el.height` синхронизируются автоматически.
 * Если `offResizeObserver: true` — наблюдатель не запускается (для overlay-слоя, который ресайзится вручную из основного canvas).
 *
 * `dpr` пересчитывается в каждом {@link Canvas.resize} (а не кэшируется в конструкторе), что корректно отрабатывает зум браузера и перетаскивание окна между мониторами с разным DPI.
 *
 * Блик при ресайзе устранён синхронной перерисовкой: колбэк `draw` (если задан) вызывается в конце {@link Canvas.__resize} **в той же таске**, что и мутация `el.width`/`el.height`.
 * Поскольку браузер композитит только на границах event loop, пользователь не видит пустой кадр между очисткой canvas'а и перерисовкой.
 */
export class Canvas {
	/** DOM-элемент `<canvas>`. */
	el: HTMLCanvasElement;

	/** Текущий `devicePixelRatio` (пересчитывается в {@link Canvas.resize}). */
	dpr: number;

	/** Обёртка над 2D-контекстом с чейнингом. */
	drw: Draw<CanvasRenderingContext2D>;

	/** Размер canvas в **мировых** (device) пикселях: `rect * dpr`. */
	readonly size: CT.S2;

	/** 2D-контекст, полученный в конструкторе через `getContext("2d", options)`. */
	__ctx: CanvasRenderingContext2D;

	/** Настройки сглаживания (применяются после каждого {@link Canvas.__resize}). */
	__smoothing?: CanvasSmoothing;

	/** `ResizeObserver`; `null` после `destroy` или если `offResizeObserver: true`. */
	__observer?: ResizeObserver | null;

	/** Колбэк, вызываемый после каждого ресайза от observer'а. */
	__observe?: (canvas: Canvas) => void;

	/**
	 * Применяет `imageSmoothingEnabled`/`imageSmoothingQuality` к контексту, если они заданы.
	 *
	 * Вызывается после каждого {@link Canvas.__resize}, т.к. ресайз `el.width`/`el.height` сбрасывает состояние контекста.
	 */
	__applySmoothing(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
		if (this.__smoothing) {
			const smoothing = this.__smoothing;
			if (smoothing.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = smoothing.imageSmoothingEnabled;
			if (smoothing.imageSmoothingQuality !== undefined) ctx.imageSmoothingQuality = smoothing.imageSmoothingQuality;
		}
	}

	//...

	/**
	 * `getBoundingClientRect()` элемента. Origin = viewport (клиентские координаты), а не `el` (element-координаты).
	 *
	 * Используется как основа для {@link Canvas.toElement} (вычитание `left`/`top` даёт координаты относительно `el`)
	 * и {@link Canvas.__size} (умножение `width`/`height` на `dpr` даёт физ-пиксельный размер).
	 * Дёшево, но дёргать каждый кадр в `rAF` не нужно — `ResizeObserver` уже инвалидирует `size` при изменении.
	 */
	rect(): DOMRect {
		return this.el.getBoundingClientRect();
	}

	/**
	 * Размер canvas в **мировых** (device) пикселях: `rect.width * dpr` × `rect.height * dpr`.
	 *
	 * Округляется до целых (`fraction = 0`), т.к. `el.width`/`el.height` — целочисленные.
	 */
	__size(): CT.S2 {
		const rect = this.rect();
		return US.round({ w: rect.width * this.dpr, h: rect.height * this.dpr }, 0);
	}

	/**
	 * Синхронизирует `el.width`/`el.height` с `this.size` и применяет сглаживание.
	 *
	 * Сбрасывает состояние контекста (трансформы, стили) — вызывайте перед отрисовкой.
	 */
	__resize() {
		this.el.width = this.size.w;
		this.el.height = this.size.h;
		this.__applySmoothing(this.__ctx);
	}

	/**
	 * Пересчитать `dpr` + `size` и применить к `el`. Без аргументов — из текущего `rect()`.
	 *
	 * Полезно дёргать вручную при программном изменении CSS вне DOM-цикла.
	 */
	resize(size?: CT.S2): void {
		this.dpr = window.devicePixelRatio || 1;
		US.assign(this.size, size ?? this.__size());
		this.__resize();
	}

	/**
	 * Конструктор: инициализирует `el`, `dpr`, `size`, опционально запускает {@link ResizeObserver}.
	 *
	 * Шаги:
	 * 1. `dpr = window.devicePixelRatio || 1` — пересчитывается в каждом `resize`, не кэшируется (корректно для зума браузера и перетаскивания окна между мониторами).
	 * 2. `size` — из `__size()` или `new.size` (если задан). Сразу `__resize()` для синхронизации `el.width`/`el.height`.
	 * 3. `__ctx = el.getContext("2d", options)` — non-null assertion оправдан, т.к. `<canvas>` гарантирует 2D-контекст в современных браузерах; для не-2D элементов бросится ошибка, что и ожидается.
	 * 4. `__observer` — `ResizeObserver` на `el` (если `offResizeObserver !== true`); его колбэк `resize() + observe()`.
	 *
	 * @param el - DOM-элемент `<canvas>`. Не должен быть в DOM-detached состоянии, иначе `rect()` даст нули.
	 * @param options - см. {@link NewCanvas}.
	 */
	constructor(el: HTMLCanvasElement, { offResizeObserver = false, observe, options, smoothing, size }: NewCanvas = {}) {
		this.el = el;
		this.dpr = window.devicePixelRatio || 1;
		this.size = size ?? this.__size();
		this.__smoothing = smoothing;

		this.__ctx = el.getContext("2d", options)!;

		this.drw = new Draw(this.__ctx);

		if (!offResizeObserver) {
			this.__observe = observe;
			this.__observer = new ResizeObserver(() => {
				this.resize();
				this.__observe?.(this);
			});
			this.__observer.observe(this.el);
		}

		this.__resize();
	}

	/**
	 * Отключить {@link ResizeObserver}, если он был.
	 * После `destroy` объект использовать нельзя.
	 */
	destroy(): void {
		this.__observer?.disconnect();
		this.__observer = null;
	}

	//...

	/**
	 * Залить весь canvas цветом `fillStyle` (`fillRect` от `0,0` до `size`).
	 *
	 * Эквивалент `ctx.fillStyle = ...; ctx.fillRect(0, 0, w, h)`. Используется для заливки фона в начале кадра перед основной отрисовкой.
	 * Не сбрасывает трансформы — если перед `fill` был `scope(camera)`, заливка попадёт в трансформированную систему координат.
	 */
	fill(fillStyle: string) {
		this.__ctx.fillStyle = fillStyle;
		this.__ctx.fillRect(0, 0, this.size.w, this.size.h);
	}

	/**
	 * Очистить весь canvas (`clearRect` от `0,0` до `size`) — прозрачные пиксели, сохраняется фоновый цвет CSS.
	 *
	 * Применяется в начале кадра, если заливка фона не нужна (анимация поверх статичной подложки).
	 * Не сбрасывает трансформы/стили — для сброса используйте `ctx.save/restore` через {@link Draw.scope}.
	 */
	clear() {
		this.__ctx.clearRect(0, 0, this.size.w, this.size.h);
	}

	//...

	/**
	 * Клиентские координаты (`clientX`/`clientY` из событий) → координаты относительно `el` (origin = левый-верхний угол элемента, без учёта `dpr`).
	 *
	 * Используется как первый шаг для перевода в мировые координаты (см. {@link Canvas.toWorld} с `skip = true`).
	 * Возвращает `C2` с плавающей точкой — для пиксельной точности (canvas `el.width` в физ-пикселях) нужно ещё умножение на `dpr`.
	 */
	toElement(client: CT.C2): CT.C2 {
		const rect = this.rect();
		return { x: client.x - rect.left, y: client.y - rect.top };
	}

	/**
	 * Перевод в **мировые** координаты канваса (с учётом `dpr`).
	 *
	 * @param element_or_delta - точка.
	 * @param skip -
	 * - `true` — вход в **клиентских** координатах (например, `mouse.x/y` из события). Сначала {@link Canvas.toElement}, затем умножение на `dpr`;
	 * - `false` — вход уже в **element**-координатах (например, дельта перетаскивания). Сразу умножение на `dpr`.
	 */
	toWorld(element_or_delta: CT.C2, skip: boolean): CT.C2 {
		const p = skip ? this.toElement(element_or_delta) : element_or_delta;
		return UC2.mult(p, this.dpr);
	}

	/**
	 * Обратный перевод к {@link Canvas.toElement}: координаты относительно `el` → клиентские координаты (origin = viewport).
	 *
	 * Применяется, когда нужно показать HUD/tooltip в мировых координатах, но отобразить поверх через `position: fixed` (координаты относительно viewport).
	 * Парный к `toElement` (с `EPS`): `toElement(unElement(p)) ≈ p`.
	 */
	unElement(element: CT.C2): CT.C2 {
		const rect = this.rect();
		return { x: element.x + rect.left, y: element.y + rect.top };
	}

	/**
	 * Обратный перевод к {@link Canvas.toWorld}: мировые координаты → клиентские/element-координаты.
	 *
	 * @param skip -
	 * - `true` — вернуть в **клиентских** координатах;
	 * - `false` — вернуть в **element**-координатах.
	 */
	unWorld(world: CT.C2, skip: boolean): CT.C2 {
		const element = UC2.div(world, this.dpr);
		return skip ? this.unElement(element) : element;
	}
}
