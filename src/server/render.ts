import type { IntervalType } from "../support/types.js";
import { Render } from "../render.js";

/**
 * Контекст серверного рендера: внешние колбэки, которые `ServerRender` вызывает, но не реализует.
 *
 * Идентично {@link NewRender} из клиентского `render.ts` по духу (`draw`/`onerror`),
 * но без `requestAnimationFrame`/`cancelAnimationFrame` — они заменены на ручную очередь в `ServerRender` (см. {@link ServerRender.step} и {@link ServerRender.settle}).
 */
export interface NewRender {
	draw?: () => void;
	onerror?: (error: unknown) => void;
}

/**
 * Серверная / тестовая реализация {@link Render} без привязки к DOM.
 *
 * Заменяет `requestAnimationFrame`/`cancelAnimationFrame` очередью колбэков, которую
 * можно продвигать вручную через {@link ServerRender.step} (детерминированно, для
 * тестов) либо автоматически через {@link ServerRender.start}/{@link ServerRender.stop}
 * (эмуляция ~60 fps через `setInterval`, если кому-то нужно запустить рендер вне DOM).
 *
 * @remarks
 * В отличие от клиентского {@link Render}, который заказывает следующий кадр у браузера,
 * `ServerRender` хранит запланированные колбэки в `__pending` и выполняет их только при
 * явном вызове {@link ServerRender.step} / {@link ServerRender.settle} либо по таймеру
 * после {@link ServerRender.start}. Это даёт полностью детерминированное поведение:
 * тест может продвигать «время» ровно на `dt` мс и проверять состояние после каждого кадра.
 *
 * {@link ServerRender.settle} крутит кадры, пока куча (`Render.__heap`) не опустеет —
 * удобно для досчёта конечных анимаций (интерполяция камеры/bounds до цели). Для
 * бесконечных тиков (например, автопан при зависшем у края курсоре) `settle` упрётся в
 * `maxSteps` — в таких сценариях используйте явные {@link ServerRender.step}.
 */
export class ServerRender extends Render {
	/** Виртуальные часы (`performance.now()`-эквивалент). Продвигается через {@link ServerRender.step}. */
	__now = 0;

	/** Счётчик для генерации id `requestAnimationFrame` (монотонно растёт). */
	__counter = 0;

	/** Очередь запланированных кадров. Заполняется через `requestAnimationFrame`, опустошается в `step`. */
	__pending = new Map<number, (ts: number) => void>();

	/** Handle авто-эмуляции (`setInterval`), если вызван {@link ServerRender.start}. `null` если не запущен. */
	__interval: IntervalType | null = null;

	/**
	 * Конструктор: инъектирует в родительский `Render` mock-реализации `requestAnimationFrame`/`cancelAnimationFrame`, которые пишут колбэки в `__pending` (вместо браузерного API).
	 *
	 * `id` для `requestAnimationFrame` берётся из монотонного `__counter` — это упрощает отладку в тестах (id предсказуемы, не зависят от системного таймера).
	 * Никаких кадров сразу не запускается — для эмуляции используйте {@link ServerRender.step}/{@link ServerRender.start}/{@link ServerRender.settle}.
	 *
	 * @param ctx - см. {@link NewRender}.
	 */
	constructor(ctx: NewRender = {}) {
		super({
			draw: ctx.draw,
			onerror: ctx.onerror,
			requestAnimationFrame: (cb) => {
				const id = ++this.__counter;
				this.__pending.set(id, cb);
				return id;
			},
			cancelAnimationFrame: (id) => {
				this.__pending.delete(id);
			},
		});
	}

	/**
	 * Продвинуть виртуальное время на `dt` мс и выполнить все запланированные кадры.
	 *
	 * `dt` клампится внутри {@link Render.__frame} в `[8, 50]` мс — это контракт
	 * клиентского рендера (защита от лагов и rAF чаще ~120 Гц). Передавайте реалистичные
	 * значения (по умолчанию `16.6667` ≈ 60 fps), чтобы получить детерминированный `dt`.
	 *
	 * @remarks
	 * Праймит `Render.__loop`/`Render.__time` так, чтобы первый кадр честно использовал
	 * переданный `dt` (а не дефолт `16.6667` из `Render.__frame`). После первого кадра
	 * `__time` устанавливается в `__now`, и последующие `step` считаются естественно.
	 */
	step(dt: number = 16.6667): void {
		this.__now += dt;
		this.__loop = true;
		this.__time = this.__now - dt;

		const pending = Array.from(this.__pending.values());
		this.__pending.clear();
		for (const cb of pending) cb(this.__now);
	}

	/**
	 * Авто-эмуляция: вызывать {@link ServerRender.step} каждые `interval` мс.
	 *
	 * По умолчанию `16.6667` мс ≈ 60 fps. Безопасен для повторного вызова — если уже
	 * запущен, no-op. Останавливается через {@link ServerRender.stop} или {@link ServerRender.clear}.
	 */
	start(interval: number = 16.6667): void {
		if (this.__interval) return;
		this.__interval = setInterval(() => {
			this.step(interval);
		}, interval);
	}

	/**
	 * Остановить авто-эмуляцию: очищает `__interval`. No-op, если не запущен.
	 *
	 * Не трогает кучу и pending — для возобновления используйте {@link ServerRender.start}.
	 * Безопасно для повторного вызова: после первого `stop` последующие — no-op.
	 */
	stop(): void {
		super.stop();
		if (this.__interval) {
			clearInterval(this.__interval);
			this.__interval = null;
		}
	}

	/**
	 * Крутить кадры, пока {@link Render.__heap} не опустеет (все анимации дошли до цели)
	 * или пока не будет достигнут `max_steps`. Для тестов конечных анимаций.
	 *
	 * @remarks
	 * Не подходит для бесконечных тиков (например, автопан с курсором у края) —
	 * `__tick` всегда возвращает `true`, и `settle` упрётся в `max_steps`. В таких
	 * сценариях используйте явные {@link ServerRender.step} и проверяйте состояние
	 * после фиксированного числа кадров.
	 */
	settle(max_steps: number = 1000): void {
		let n = 0;
		while (this.__heap.size > 0 && n < max_steps) {
			this.step();
			n++;
		}
	}

	/**
	 * Полная очистка: родительский `clear` (куча, pending, rAF) + {@link ServerRender.stop}.
	 * После `clear` объект можно использовать заново.
	 */
	override clear(): void {
		super.clear();
		this.__pending.clear();
	}
}
