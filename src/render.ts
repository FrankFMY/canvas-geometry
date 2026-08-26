import { clamp } from "./support/math.js";

/** Draw event emitted after each render tick. */
export interface RenderDrawEvent {
	dt: number;
	time: number;
}

/**
 * Событие одного кадра, передаваемое в `func` при `push`.
 */
export interface RenderFrameEvent {
	/**
	 * Тот же `id`, что в `push` (для self-идентификации внутри `func`).
	 */
	id: string;
	/**
	 * Дельта времени от предыдущего кадра, с клампом в `[__min_dt, __max_dt]`.
	 */
	dt: number;
	/**
	 * `ts` текущего кадра (время `performance.now()`).
	 */
	time: number;
	/**
	 * `iat` — `performance.now()` на момент первого `push` этого `id`.
	 */
	iat: number;
}

export interface RenderTickContext<T> {
	current: T;
	target: T;
	dt: number;
	tau: number;
	eps: number;
}

/**
 * Контекст рендера: внешние колбэки, которые `Render` вызывает, но не реализует.
 *
 * `requestAnimationFrame`/`cancelAnimationFrame` — инъектируются, чтобы
 * `Render` был изолирован от браузерного API (тестируется с mock-ами,
 * работает на сервере через shim).
 */
export interface NewRender {
	/**
	 * Вызывается в конце каждого `__tick`. Здесь — вся отрисовка после обработки кадра
	 */
	draw?: (event: RenderDrawEvent) => void;
	/**
	 * Вызывается при ошибке в `func`; получает тот же `error`.
	 */
	onerror?: (error: unknown) => void;
	requestAnimationFrame?: typeof requestAnimationFrame;
	cancelAnimationFrame?: typeof cancelAnimationFrame;
}

type ResolvedRender = Omit<NewRender, "requestAnimationFrame" | "cancelAnimationFrame"> & {
	requestAnimationFrame: typeof requestAnimationFrame;
	cancelAnimationFrame: typeof cancelAnimationFrame;
};

const defaultRequestAnimationFrame: typeof requestAnimationFrame =
	globalThis.requestAnimationFrame?.bind(globalThis) ?? ((callback) => setTimeout(() => callback(performance.now()), 16) as unknown as number);
const defaultCancelAnimationFrame: typeof cancelAnimationFrame =
	globalThis.cancelAnimationFrame?.bind(globalThis) ?? ((id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
export class Render {
	/**
	 * Минимальный `dt` (мс). Если `rAF` пришёл чаще — клампится снизу.
	 * Защищает от >120 Гц (где некоторые браузеры/мониторы выдают лишние кадры)
	 * и от «нулевых» `dt` при нескольких `rAF`-ах в одном тике
	 */
	static __min_dt = 8;

	/**
	 * Максимальный `dt` (мс). Если `rAF` пришёл реже — клампится сверху.
	 * Ограничивает скачки `dt` при уходе вкладки в фон, системных подвисаниях
	 * и т.п.: без клампа единичный «долгий» кадр унес бы сглаженные значения
	 * далеко за цель и сломал бы инерцию
	 */
	static __max_dt = 50;

	/**
	 * Идентификатор запланированного `rAF` (0 = нет ожидающего кадра)
	 */
	__frame_id = 0;

	/**
	 * `ts` последнего кадра; используется для расчёта `dt`
	 */
	__time = 0;

	/**
	 * `true`, если рендер-цикл активен (был хотя бы один `rAF`-кадр)
	 */
	__loop = false;

	/** Куча анимаций: `id` → `{ iat, func }`. Идемпотентный `push` фиксирует `iat` при первом добавлении. */
	__heap = new Map<string, { iat: number; func: (event: RenderFrameEvent) => boolean }>();

	/**
	 * Идемпотентен по `id`: повторный вызов с тем же `id` **не** перезаписывает
	 * существующую функцию. Для обновления `func` — `drop(id)` + `push(...)`.
	 *
	 * `iat` фиксируется в момент **первого** добавления — `performance.now()`
	 */
	push({ id, func }: { id: string; func: (event: RenderFrameEvent) => boolean }): void {
		if (!this.__heap.has(id)) this.__heap.set(id, { iat: performance.now(), func });
		this.run();
	}

	/**
	 * Удаляет функцию из кучи по `id`. **Не** останавливает `rAF`, даже если
	 * куча опустела — фактическая остановка произойдёт в следующем `__frame`,
	 * когда `__heap.size === 0`. Это канон: `drop` — дешёвая операция без
	 * побочных эффектов на планировщик
	 */
	drop(id: string): void {
		this.__heap.delete(id);
	}

	//...

	ctx: ResolvedRender;

	constructor(context: NewRender = {}) {
		this.ctx = {
			...context,
			requestAnimationFrame: context.requestAnimationFrame ?? defaultRequestAnimationFrame,
			cancelAnimationFrame: context.cancelAnimationFrame ?? defaultCancelAnimationFrame,
		};
	}

	/**
	 * Один шаг рендера: считает `dt` (с клампом), итерирует кучу, вызывает
	 * `func` каждой записи. Если `func` вернул `false` — запись удаляется
	 * (анимация завершена). Ошибки в `func` → запись удаляется + `onerror`.
	 *
	 * В конце всегда вызывает `ctx.draw`. **Не** планирует следующий кадр —
	 * это задача `__frame`/`frame`.
	 *
	 * Первый кадр (`__loop === false`): `dt` = `100/6` (≈16.67), т.к. ещё
	 * не от чего считать дельту. Это канон для «старта с чистого листа»
	 */
	__tick(ts: number) {
		const __dt = this.__loop ? ts - this.__time : 16.6667;

		//  для ручного кадра наличием клэмпа тоже можно пренебречь, т.к. он не предназначен для множественного использования. (Речь о том, что он будет не реальный, а всегда минимальный)
		const dt = clamp(Render.__min_dt, __dt, Render.__max_dt);
		this.__time = ts;

		for (const [id, { iat, func }] of Array.from(this.__heap.entries())) {
			if (!this.__heap.has(id)) continue;
			try {
				const need_new_frame = func({ id, iat, dt, time: this.__time });
				if (!need_new_frame) this.__heap.delete(id);
			} catch (error: unknown) {
				this.__heap.delete(id);
				this.ctx.onerror?.(error);
			}
		}
		this.ctx.draw?.({ dt, time: this.__time });
	}

	/**
	 * Кадр, вызванный из `rAF`. После `__tick` планирует следующий кадр,
	 * **только** если куча непуста. С пустой кучей — сбрасывает `__frame_id` и гасит
	 * `__loop`: цикл самозавершается, когда все анимации отработали `false`
	 */
	__frame(ts: number): void {
		this.__tick(ts);
		this.__frame_id = 0;
		if (this.__heap.size > 0) {
			this.__loop = true;
			this.run();
		} else {
			this.__loop = false;
		}
	}

	//...

	/**
	 * Ручной кадр (вне `rAF`). Полезно для принудительной отрисовки вне цикла
	 * (например, при resize, оффскрин-рендере, сервер-сайде) или для «вклинивания»
	 * в активный цикл: сдвигает `__time` так, что следующий `rAF`-кадр считает
	 * `dt` от этого момента (т.е. «съедает» время).
	 *
	 * Поведение:
	 * - куча пуста → `__stop` (отменяет висящий `rAF`, гасит `__loop`).
	 * - куча непуста → `__tick` + старт цикла (`__loop = true`, `run()`).
	 *   В отличие от `__frame`, **не** сбрасывает `__frame_id` перед `run`:
	 *   если кадр уже запланирован — `run` вернётся раньше, без дубля
	 */
	frame(ts: number = performance.now()): void {
		this.__tick(ts);
		if (this.__heap.size > 0) {
			this.__loop = true;
			this.run();
		} else {
			this.stop();
		}
	}

	/**
	 * Планирует ровно один `rAF`, если ещё не запланирован (`__frame_id === 0`).
	 * Идемпотентна: повторные вызовы в одном кадре — no-op. Это ключевое
	 * свойство, разрешающее множественные `push` без шторма `rAF`-ов.
	 */
	run(): void {
		if (this.__frame_id) return;
		this.__frame_id = this.ctx.requestAnimationFrame((t) => this.__frame(t));
	}

	//...

	/**
	 * Останавливает планировщик: отменяет висящий `rAF`, сбрасывает `__frame_id`,
	 * гасит `__loop`. **Не** трогает кучу — в отличие от `clear`, записи
	 * сохраняются. Удобно для паузы с возможностью возобновления через `run`.
	 */
	stop() {
		if (this.__frame_id) this.ctx.cancelAnimationFrame(this.__frame_id);
		this.__frame_id = 0;
		this.__loop = false;
	}

	/**
	 * Полностью остановить рендер: отменить запланированный кадр,
	 * сбросить `__loop`, очистить кучу.
	 *
	 * @remarks
	 * После `clear` объект можно использовать заново
	 */
	clear(): void {
		this.stop();
		this.__heap.clear();
	}

	//...

	/** Постоянная времени сглаживания по умолчанию (мс). Используется в {@link Render.alpha} и {@link Camera}. */
	static __tau = 90;

	/**
	 * Экспоненциальный коэффициент сглаживания для кадра: `α = 1 - exp(-dt / tau)`.
	 *
	 * Используется для плавной интерполяции значений без фиксированной длительности —
	 * каждый кадр значение приближается к цели на определенный процент оставшегося пути.
	 * Если цель меняется в процессе (например, курсор мыши двигается), анимация плавно
	 * перестраивается без рывков.
	 *
	 * **Как подобрать tau под желаемую длительность T (как в CSS transition):**
	 * ```
	 * tau = T / n
	 * ```
	 * где `n` — сколько периодов tau должно пройти до визуального «успокоения».
	 *
	 * **Почему n имеет значение:**
	 * Экспоненциальное сглаживание никогда не достигает цели полностью — оно бесконечно
	 * приближается. Оставшиеся проценты превращаются в медленное «доплывание»:
	 *
	 * | n | Достигнуто | Остаток | Визуальное ощущение |
	 * |---|------------|---------|---------------------|
	 * | 3 | ~95%       | 5px из 100px | Движение останавливается резковато, видно, что ещё ползёт |
	 * | 4 | ~98%       | 2px из 100px | Почти не заметно, но пристальный взгляд увидит микродвижение |
	 * | 5 | ~99.3%     | 0.7px из 100px | Глаз не различает, полная остановка |
	 *
	 * **Рекомендации по выбору n:**
	 * - `n = 3` — для динамических вещей, которые постоянно меняются (камера, следование за мышью)
	 * - `n = 4` — стандарт для большинства UI (компромисс между плавностью и производительностью)
	 * - `n = 5` — когда нужно полное визуальное завершение (меню, тултипы, модальные окна)
	 *
	 * **Примеры подбора tau:**
	 * | Хочу как transition | tau (n=3) | tau (n=4) | tau (n=5) | Сценарий |
	 * |---|---|---:|---:|---|
	 * | 100ms | 33 | 25 | 20 | Мгновенный отклик на мышь |
	 * | 200ms | 67 | 50 | 40 | Быстрое появление тултипа |
	 * | 300ms | 100 | 75 | 60 | Стандартный UI-переход |
	 * | 500ms | 167 | 125 | 100 | Плавная камера |
	 * | 1000ms | 333 | 250 | 200 | Инерционное движение |
	 *
	 * **Поведение при разных dt:**
	 * - При малом `dt` (высокий FPS) `α ≈ dt / tau` — ведёт себя почти линейно
	 * - При `dt = tau` за один кадр покрывается ~63% расстояния до цели
	 * - При большом `dt` (лаги, вкладка в фоне) `α → 1` — мгновенный докрут до цели
	 *
	 * @param dt - дельта времени между кадрами в миллисекундах (`performance.now()`)
	 * @param tau - постоянная времени сглаживания в миллисекундах.
	 * Чем больше — тем «инерционнее» движение, тем плавнее выглядит анимация.
	 * По умолчанию {@link Render.__tau} (90ms, подходит почти для всего и для микро-дельт в частности)
	 *
	 * @returns Коэффициент `α` в диапазоне `(0, 1)`, готовый к использованию в `lerp`
	 *
	 * @example
	 * ```typescript
	 * // Плавное движение камеры к target (дефолтный tau=90, ~450ms до покоя при n=5)
	 * const a = Render.alpha(dt);
	 * camera.center = lerp(camera.center, camera.target, a);
	 *
	 * // Быстрое появление тултипа (~200ms до покоя при n=5)
	 * tooltip.opacity = lerp(tooltip.opacity, 1, Render.alpha(dt, 40));
	 *
	 * // Анимация с явным завершением (как CSS transition на 300ms, n=5 → tau=60)
	 * const a = Render.alpha(dt, 60);
	 * value = lerp(value, target, a);
	 * if (Math.abs(value - target) < 0.001) {
	 *     value = target; // snap to exact target
	 *     render.drop('my-animation');
	 * }
	 * ```
	 *
	 * @remarks
	 * В отличие от CSS transition с фиксированной длительностью, экспоненциальное
	 * сглаживание даёт адаптивное поведение: если цель изменилась в середине анимации,
	 * движение плавно перестраивается без рывков. Это идеально для камер, следования
	 * за курсором, инерционной прокрутки и любых continuously-changing targets.
	 */
	static alpha(dt: number, tau: number = Render.__tau): number {
		return 1 - Math.exp(-dt / tau);
	}
}
