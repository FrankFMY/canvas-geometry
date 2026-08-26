import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { RenderFrameEvent } from "../render.js";
import { Render } from "../render.js";
import { ServerRender } from "./render.js";

const MIN_DT = Render.__min_dt;
const MAX_DT = Render.__max_dt;

const sink = (maxFrames: number | null = null) => {
	const events: RenderFrameEvent[] = [];
	let count = 0;
	const func = (e: RenderFrameEvent): boolean => {
		events.push(e);
		count++;
		if (maxFrames !== null && count >= maxFrames) return false;
		return true;
	};
	return { events, func };
};

const setup = (draw?: () => void, onerror?: (error: unknown) => void) => {
	const r = new ServerRender({ draw, onerror });
	return { r };
};

// 1. ServerRender.step: продвижение виртуального времени
describe("ServerRender.step: продвижение виртуального времени", () => {
	test("дефолтный dt = 16.6667 (≈60 fps)", () => {
		const { r } = setup();
		const { events, func } = sink();
		r.push({ id: "a", func });
		r.step();
		expect(events).toHaveLength(1);
		expect(events[0].dt).toBeCloseTo(100 / 6, 4);
	});

	test("кастомный dt передаётся в func", () => {
		const { r } = setup();
		const { events, func } = sink();
		r.push({ id: "a", func });
		r.step(30);
		expect(events[0].dt).toBe(30);
	});

	test("последовательные step накапливают __now и считают dt", () => {
		const { r } = setup();
		const { events, func } = sink(3);
		r.push({ id: "a", func });
		r.step(20);
		r.step(20);
		r.step(40);
		expect(events).toHaveLength(3);
		expect(events[0].dt).toBe(20);
		expect(events[1].dt).toBe(20);
		expect(events[2].dt).toBe(40);
	});

	test("step с пустым pending: __now сдвигается, func не вызывается", () => {
		const { r } = setup();
		const { events, func } = sink();
		r.step(50);
		expect(events).toHaveLength(0);
		r.push({ id: "a", func });
		r.step(20);
		expect(events).toHaveLength(1);
	});

	test("time в event = __now на момент step", () => {
		const { r } = setup();
		const { events, func } = sink(2);
		r.push({ id: "a", func });
		r.step(100);
		expect(events[0].time).toBe(100);
		r.step(200);
		expect(events[1].time).toBe(300);
	});

	test("iat фиксируется при push и не меняется", () => {
		const { r } = setup();
		const { events, func } = sink(2);
		r.push({ id: "a", func });
		r.step(100);
		const iat0 = events[0].iat;
		r.step(200);
		expect(events[1].iat).toBe(iat0);
	});

	test("id в event совпадает с push", () => {
		const { r } = setup();
		const { events, func } = sink(1);
		r.push({ id: "my-anim", func });
		r.step();
		expect(events[0].id).toBe("my-anim");
	});
});

// 2. dt кламп через step (rAF колбэк → __tick клампит)
describe("ServerRender.step: кламп dt в [__min_dt, __max_dt]", () => {
	test("dt меньше __min_dt → клампится до __min_dt", () => {
		const { r } = setup();
		const { events, func } = sink();
		r.push({ id: "a", func });
		r.step(1);
		expect(events[0].dt).toBe(MIN_DT);
	});

	test("dt больше __max_dt → клампится до __max_dt", () => {
		const { r } = setup();
		const { events, func } = sink();
		r.push({ id: "a", func });
		r.step(10000);
		expect(events[0].dt).toBe(MAX_DT);
	});

	test("негативный dt (время назад) → клампится до __min_dt", () => {
		const { r } = setup();
		const { events, func } = sink();
		r.push({ id: "a", func });
		r.step(50);
		r.step(-100);
		expect(events[1].dt).toBe(MIN_DT);
	});

	test("нормальный dt проходит без клампа", () => {
		const { r } = setup();
		const { events, func } = sink();
		r.push({ id: "a", func });
		r.step(25);
		expect(events[0].dt).toBe(25);
	});
});

// 3. ServerRender.settle: крутить до опустошения кучи
describe("ServerRender.settle: досчёт анимаций", () => {
	test("конечная анимация → settle завершается, куча пуста", () => {
		const { r } = setup();
		const { func } = sink(3);
		r.push({ id: "a", func });
		r.settle();
		expect(r.__heap.size).toBe(0);
	});

	test("несколько конечных анимаций → все завершаются", () => {
		const { r } = setup();
		const s1 = sink(2);
		const s2 = sink(5);
		r.push({ id: "a", func: s1.func });
		r.push({ id: "b", func: s2.func });
		r.settle();
		expect(r.__heap.size).toBe(0);
		expect(s1.events).toHaveLength(2);
		expect(s2.events).toHaveLength(5);
	});

	test("бесконечная анимация → settle упирается в maxSteps", () => {
		const { r } = setup();
		const { events, func } = sink();
		r.push({ id: "a", func });
		r.settle(10);
		expect(r.__heap.size).toBe(1);
		expect(events).toHaveLength(10);
	});

	test("дефолтный maxSteps = 1000", () => {
		const { r } = setup();
		const { events, func } = sink();
		r.push({ id: "a", func });
		r.settle();
		expect(events).toHaveLength(1000);
		expect(r.__heap.size).toBe(1);
	});

	test("settle с пустой кучей → 0 шагов", () => {
		const { r } = setup();
		r.settle();
		expect(r.__now).toBe(0);
	});

	test("settle использует дефолтный dt (≈16.6667)", () => {
		const { r } = setup();
		const { events, func } = sink(1);
		r.push({ id: "a", func });
		r.settle();
		expect(events[0].dt).toBeCloseTo(100 / 6, 4);
	});
});

// 4. ServerRender.clear: полная очистка
describe("ServerRender.clear: очистка состояния", () => {
	test("clear очищает кучу, pending, interval и сбрасывает rAF/loop", () => {
		const { r } = setup();
		const { func } = sink();
		r.push({ id: "a", func });
		r.start(16);
		expect(r.__heap.size).toBe(1);
		expect(r.__pending.size).toBe(1);
		expect(r.__interval).not.toBeNull();
		r.clear();
		expect(r.__heap.size).toBe(0);
		expect(r.__pending.size).toBe(0);
		expect(r.__interval).toBeNull();
		expect(r.__frame_id).toBe(0);
		expect(r.__loop).toBe(false);
	});

	test("после clear: переиспользование работает", () => {
		const draw = mock(() => null);
		const { r } = setup(draw);
		const { events, func } = sink(1);
		r.push({ id: "a", func });
		r.step();
		r.clear();
		r.push({ id: "b", func });
		r.step();
		expect(events).toHaveLength(2);
		expect(r.__heap.size).toBe(0);
		expect(draw).toHaveBeenCalledTimes(2);
	});

	test("clear без push: no-op, не падает", () => {
		const { r } = setup();
		r.clear();
		expect(r.__heap.size).toBe(0);
		expect(r.__pending.size).toBe(0);
	});
});

// 5. ServerRender.start/stop: авто-эмуляция через setInterval
describe("ServerRender.start/stop: управление interval", () => {
	let origSetInterval: typeof globalThis.setInterval;
	let origClearInterval: typeof globalThis.clearInterval;
	let intervalCb: (() => void) | null = null;
	let setIntervalMock: ReturnType<typeof mock>;
	let clearIntervalMock: ReturnType<typeof mock>;

	beforeEach(() => {
		origSetInterval = globalThis.setInterval;
		origClearInterval = globalThis.clearInterval;
		intervalCb = null;
		setIntervalMock = mock((cb: () => void, _ms: number) => {
			intervalCb = cb;
			return 1 as unknown as ReturnType<typeof setInterval>;
		});
		clearIntervalMock = mock((_id: ReturnType<typeof setInterval>) => {
			intervalCb = null;
		});
		globalThis.setInterval = setIntervalMock;
		globalThis.clearInterval = clearIntervalMock;
	});

	afterEach(() => {
		globalThis.setInterval = origSetInterval;
		globalThis.clearInterval = origClearInterval;
	});

	test("start планирует interval", () => {
		const { r } = setup();
		r.start(16);
		expect(setIntervalMock).toHaveBeenCalledTimes(1);
		expect(r.__interval).not.toBeNull();
	});

	test("повторный start — no-op (не плодит intervals)", () => {
		const { r } = setup();
		r.start(16);
		r.start(16);
		expect(setIntervalMock).toHaveBeenCalledTimes(1);
	});

	test("interval-тик вызывает step → func вызывается", () => {
		const { r } = setup();
		const { events, func } = sink(1);
		r.push({ id: "a", func });
		r.start(16);
		expect(intervalCb).not.toBeNull();
		intervalCb!();
		expect(events).toHaveLength(1);
	});

	test("stop очищает interval", () => {
		const { r } = setup();
		r.start(16);
		expect(r.__interval).not.toBeNull();
		r.stop();
		expect(clearIntervalMock).toHaveBeenCalledTimes(1);
		expect(r.__interval).toBeNull();
	});

	test("stop без start — no-op", () => {
		const { r } = setup();
		r.stop();
		expect(clearIntervalMock).not.toHaveBeenCalled();
		expect(r.__interval).toBeNull();
	});

	test("clear после start вызывает stop", () => {
		const { r } = setup();
		r.start(16);
		r.clear();
		expect(clearIntervalMock).toHaveBeenCalledTimes(1);
		expect(r.__interval).toBeNull();
	});
});

// 7. Интеграция с Render API
describe("ServerRender: интеграция с Render API", () => {
	test("push → step → func вызвана, draw вызвана", () => {
		const draw = mock(() => null);
		const { r } = setup(draw);
		const fn = mock((_e: RenderFrameEvent) => false);
		r.push({ id: "a", func: fn });
		r.step();
		expect(fn).toHaveBeenCalledTimes(1);
		expect(draw).toHaveBeenCalledTimes(1);
	});

	test("func возвращает false → удаляется из кучи", () => {
		const { r } = setup();
		const fn = mock((_e: RenderFrameEvent) => false);
		r.push({ id: "a", func: fn });
		r.step();
		expect(r.__heap.has("a")).toBe(false);
	});

	test("func возвращает true → остаётся в куче, следующий step вызывает снова", () => {
		const { r } = setup();
		const fn = mock((_e: RenderFrameEvent) => true);
		r.push({ id: "a", func: fn });
		r.step();
		expect(r.__heap.has("a")).toBe(true);
		r.step();
		expect(fn).toHaveBeenCalledTimes(2);
	});

	test("drop → func больше не вызывается", () => {
		const { r } = setup();
		const fn = mock((_e: RenderFrameEvent) => true);
		r.push({ id: "a", func: fn });
		r.step();
		r.drop("a");
		r.step();
		expect(fn).toHaveBeenCalledTimes(1);
		expect(r.__heap.has("a")).toBe(false);
	});

	test("push того же id не перезаписывает func (идемпотентность)", () => {
		const { r } = setup();
		const first = mock((_e: RenderFrameEvent) => false);
		const second = mock((_e: RenderFrameEvent) => false);
		r.push({ id: "a", func: first });
		r.push({ id: "a", func: second });
		r.step();
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();
	});

	test("push разных id → обе func вызываются в одном step", () => {
		const { r } = setup();
		const a = mock((_e: RenderFrameEvent) => false);
		const b = mock((_e: RenderFrameEvent) => false);
		r.push({ id: "a", func: a });
		r.push({ id: "b", func: b });
		r.step();
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
	});

	test("onerror получает ошибку из func, запись удаляется", () => {
		const onerror = mock((_e: unknown) => null);
		const { r } = setup(undefined, onerror);
		const boom = new Error("boom");
		r.push({
			id: "a",
			func: () => {
				throw boom;
			},
		});
		r.step();
		expect(onerror).toHaveBeenCalledTimes(1);
		expect(onerror.mock.calls[0][0]).toBe(boom);
		expect(r.__heap.has("a")).toBe(false);
	});

	test("ошибка в одной func не мешает другим в том же step", () => {
		const { r } = setup();
		const b = mock((_e: RenderFrameEvent) => true);
		r.push({
			id: "a",
			func: () => {
				throw new Error("x");
			},
		});
		r.push({ id: "b", func: b });
		r.step();
		expect(b).toHaveBeenCalledTimes(1);
		expect(r.__heap.has("b")).toBe(true);
	});

	test("draw вызывается после каждой func в кадре", () => {
		const draw = mock(() => null);
		const { r } = setup(draw);
		r.push({ id: "a", func: () => false });
		r.push({ id: "b", func: () => false });
		r.step();
		expect(draw).toHaveBeenCalledTimes(1);
	});
});

// 8. ServerRender.frame: ручной кадр (наследованный от Render)
describe("ServerRender.frame: ручной кадр", () => {
	test("frame() с непустой кучей → func вызвана, draw вызван", () => {
		const draw = mock(() => null);
		const { r } = setup(draw);
		const { events, func } = sink(1);
		r.push({ id: "a", func });
		r.frame(100);
		expect(events).toHaveLength(1);
		expect(events[0].time).toBe(100);
		expect(draw).toHaveBeenCalledTimes(1);
	});

	test("frame() с пустой кучей → draw 1×, без func", () => {
		const draw = mock(() => null);
		const { r } = setup(draw);
		r.frame(100);
		expect(draw).toHaveBeenCalledTimes(1);
	});

	test("frame() съедает время: следующий step считает dt от frame", () => {
		const { r } = setup();
		const { events, func } = sink(2);
		r.push({ id: "a", func });
		r.frame(100);
		r.step(30);
		expect(events[1].dt).toBe(30);
	});

	test("frame() + step: смешивание работает без двойного tick", () => {
		const { r } = setup();
		const { events, func } = sink(3);
		r.push({ id: "a", func });
		r.frame(100);
		expect(events).toHaveLength(1);
		r.step(20);
		expect(events).toHaveLength(2);
		r.frame(200);
		expect(events).toHaveLength(3);
	});
});

// 9. Связь step/settle/frame
describe("ServerRender: связь step/settle/frame", () => {
	test("push → frame → step → settle: комбинированный сценарий", () => {
		const { r } = setup();
		const { events, func } = sink(5);
		r.push({ id: "a", func });
		r.frame(100);
		expect(events).toHaveLength(1);
		r.step(20);
		expect(events).toHaveLength(2);
		r.settle();
		expect(events).toHaveLength(5);
		expect(r.__heap.size).toBe(0);
	});

	test("settle после frame: досчитывает оставшиеся кадры", () => {
		const { r } = setup();
		const { events, func } = sink(10);
		r.push({ id: "a", func });
		r.frame(0);
		r.step();
		expect(events).toHaveLength(2);
		r.settle();
		expect(events).toHaveLength(10);
	});
});
