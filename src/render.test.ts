import { describe, expect, mock, test } from "bun:test";
import type { NewRender, RenderFrameEvent } from "./render.js";
import { Render } from "./render.js";

const TAU = Render.__tau;
const MIN_DT = Render.__min_dt;
const MAX_DT = Render.__max_dt;

const setup = () => {
	let lastCb: ((ts: number) => void) | null = null;
	let nextId = 1;
	const draw = mock(() => null);
	const onerror = mock((_e: unknown) => null);
	const requestAnimationFrame = mock((cb: (ts: number) => void) => {
		lastCb = cb;
		return nextId++;
	});
	const cancelAnimationFrame = mock((_id: number) => null);
	const ctx: NewRender = { draw, onerror, requestAnimationFrame, cancelAnimationFrame };
	const trigger = (ts: number) => {
		if (!lastCb) throw new Error("rAF callback not planned");
		const cb = lastCb;
		lastCb = null;
		cb(ts);
	};
	return {
		ctx,
		draw,
		onerror,
		requestAnimationFrame,
		cancelAnimationFrame,
		trigger,
		hasPendingCb: () => lastCb !== null,
	};
};

const sink = () => {
	const events: RenderFrameEvent[] = [];
	const func = (e: RenderFrameEvent): boolean => {
		events.push(e);
		return true;
	};
	return { events, func };
};

// 1. Render.alpha === 1 - Math.exp(-dt / tau)
describe("Render.alpha: формула 1 - exp(-dt / tau)", () => {
	test("alpha(dt, tau) === 1 - Math.exp(-dt / tau) на наборе пар", () => {
		const cases: Array<[number, number]> = [
			[0, 90],
			[1, 90],
			[16.6667, 90],
			[50, 90],
			[90, 90],
			[200, 90],
			[1000, 90],
			[50, 1],
			[50, 300],
		];
		for (const [dt, tau] of cases) {
			expect(Render.alpha(dt, tau)).toBeCloseTo(1 - Math.exp(-dt / tau), 12);
		}
	});
	test("дефолт tau = Render.__tau (= 90)", () => {
		expect(Render.alpha(50)).toBeCloseTo(1 - Math.exp(-50 / TAU), 12);
		expect(Render.alpha(50)).toBe(Render.alpha(50, TAU));
	});
	test("alpha(0) = 0", () => {
		expect(Render.alpha(0)).toBeCloseTo(0, 12);
	});
	test("всегда в (0, 1] для dt > 0", () => {
		for (const dt of [0.001, 1, 10, 100, 1000, 10000]) {
			const a = Render.alpha(dt);
			expect(a).toBeGreaterThan(0);
			expect(a).toBeLessThanOrEqual(1);
		}
	});
});

// 2. Идемпотентность push (функция не перезаписывается)
describe("Render: идемпотентность push", () => {
	test("повторный push с тем же id не перезаписывает func: вызывается первая", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const first = mock((_e: RenderFrameEvent) => false);
		const second = mock((_e: RenderFrameEvent) => false);
		r.push({ id: "a", func: first });
		r.push({ id: "a", func: second });
		trigger(1000);
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();
	});
	test("iat фиксируется при первом добавлении и не меняется при повторном push", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const seen: number[] = [];
		r.push({
			id: "a",
			func: (e) => {
				seen.push(e.iat);
				return false;
			},
		});
		r.push({
			id: "a",
			func: (e) => {
				seen.push(e.iat);
				return false;
			},
		});
		trigger(1000);
		expect(seen).toHaveLength(1);
		expect(seen[0]).toBeGreaterThanOrEqual(0);
	});
	test("push разных id добавляет обе функции", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const a = mock((_e: RenderFrameEvent) => false);
		const b = mock((_e: RenderFrameEvent) => false);
		r.push({ id: "a", func: a });
		r.push({ id: "b", func: b });
		trigger(1000);
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
	});
	test("drop + push обновляет func", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const first = mock((_e: RenderFrameEvent) => false);
		const second = mock((_e: RenderFrameEvent) => false);
		r.push({ id: "a", func: first });
		r.drop("a");
		r.push({ id: "a", func: second });
		trigger(1000);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});
});

// 3. Обработка ошибок в цикле
describe("Render: обработка ошибок в цикле", () => {
	test("func бросила → удаляется и onerror получает ту же ошибку", () => {
		const { ctx, trigger, onerror } = setup();
		const r = new Render(ctx);
		const boom = new Error("boom");
		r.push({
			id: "a",
			func: () => {
				throw boom;
			},
		});
		trigger(1000);
		expect(onerror).toHaveBeenCalledTimes(1);
		expect(onerror.mock.calls[0][0]).toBe(boom);
		expect(r.__heap.has("a")).toBe(false);
	});
	test("func бросила → остальные func в кадре выполняются", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const b = mock((_e: RenderFrameEvent) => true);
		r.push({
			id: "a",
			func: () => {
				throw new Error("x");
			},
		});
		r.push({ id: "b", func: b });
		trigger(1000);
		expect(b).toHaveBeenCalledTimes(1);
		expect(r.__heap.has("b")).toBe(true);
	});
	test("func бросила → цикл продолжается для оставшихся в следующих кадрах", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		let n = 0;
		r.push({
			id: "a",
			func: () => {
				throw new Error("x");
			},
		});
		r.push({
			id: "b",
			func: () => {
				n++;
				return n < 2;
			},
		});
		trigger(1000);
		expect(n).toBe(1);
		trigger(1016);
		expect(n).toBe(2);
		expect(r.__heap.size).toBe(0);
	});
});

// 4. Переиспользование после clear
describe("Render: clear и переиспользование", () => {
	test("clear отменяет запланированный rAF и очищает кучу", () => {
		const { ctx, cancelAnimationFrame } = setup();
		const r = new Render(ctx);
		r.push({ id: "a", func: () => true });
		const fid = r.__frame_id;
		r.clear();
		expect(cancelAnimationFrame).toHaveBeenCalledWith(fid);
		expect(r.__heap.size).toBe(0);
		expect(r.__frame_id).toBe(0);
		expect(r.__loop).toBe(false);
	});
	test("clear без запланированного кадра не вызывает cancelAnimationFrame", () => {
		const { ctx, cancelAnimationFrame } = setup();
		const r = new Render(ctx);
		r.clear();
		expect(cancelAnimationFrame).not.toHaveBeenCalled();
	});
	test("после clear объект переиспользуется: push → trigger → func и draw вызваны", () => {
		const { ctx, trigger, draw } = setup();
		const r = new Render(ctx);
		const fn = mock((_e: RenderFrameEvent) => false);
		r.push({ id: "a", func: () => true });
		r.clear();
		r.push({ id: "a", func: fn });
		trigger(1000);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(draw).toHaveBeenCalled();
	});
});

// 5. Одиночность requestAnimationFrame на кадр
describe("Render: одиночность requestAnimationFrame на кадр", () => {
	test("push планирует ровно 1 rAF", () => {
		const { ctx, requestAnimationFrame } = setup();
		const r = new Render(ctx);
		r.push({ id: "a", func: () => true });
		expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
	});
	test("повторный push с тем же id при висящем rAF не дублирует rAF", () => {
		const { ctx, requestAnimationFrame } = setup();
		const r = new Render(ctx);
		r.push({ id: "a", func: () => true });
		r.push({ id: "a", func: () => true });
		expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
	});
	test("push разных id при висящем rAF не дублирует rAF", () => {
		const { ctx, requestAnimationFrame } = setup();
		const r = new Render(ctx);
		r.push({ id: "a", func: () => true });
		r.push({ id: "b", func: () => true });
		r.push({ id: "c", func: () => true });
		expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
	});
	test("frame() при висящем rAF не планирует дополнительный rAF", () => {
		const { ctx, trigger, requestAnimationFrame } = setup();
		const r = new Render(ctx);
		r.push({ id: "a", func: () => true });
		trigger(1000);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
		r.frame(1030);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
	});
	test("rAF-кадр с непустой кучей планирует ровно 1 новый rAF (не 2)", () => {
		const { ctx, trigger, requestAnimationFrame } = setup();
		const r = new Render(ctx);
		r.push({ id: "a", func: () => true });
		expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		trigger(1000);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
		trigger(1016);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(3);
	});
	test("rAF-кадр с пустой кучей не планирует новый rAF", () => {
		const { ctx, trigger, requestAnimationFrame } = setup();
		const r = new Render(ctx);
		r.push({ id: "a", func: () => false });
		trigger(1000);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
	});
});

// 6. Ручной frame в цикле: A/B/C/D
describe("Render.frame: ручной кадр в цикле", () => {
	test("A. frame() вне цикла с пустой кучей: draw 1×, цикл НЕ запускается", () => {
		const { ctx, draw, requestAnimationFrame, cancelAnimationFrame } = setup();
		const r = new Render(ctx);
		r.frame(1000);
		expect(draw).toHaveBeenCalledTimes(1);
		expect(requestAnimationFrame).not.toHaveBeenCalled();
		expect(cancelAnimationFrame).not.toHaveBeenCalled();
		expect(r.__loop).toBe(false);
		expect(r.__frame_id).toBe(0);
	});
	test("A2. frame() вне цикла с непустой кучей: draw 1× + старт цикла", () => {
		const { ctx, draw, requestAnimationFrame } = setup();
		const r = new Render(ctx);
		const fn = mock((_e: RenderFrameEvent) => true);
		r.__heap.set("a", { iat: 0, func: fn });
		r.frame(1000);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(draw).toHaveBeenCalledTimes(1);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		expect(r.__loop).toBe(true);
		expect(r.__frame_id).not.toBe(0);
	});
	test("B. frame() внутри активного цикла: rAF не дублируется, __frame_id не меняется", () => {
		const { ctx, trigger, requestAnimationFrame } = setup();
		const r = new Render(ctx);
		r.push({ id: "a", func: () => true });
		trigger(1000);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
		const fidBefore = r.__frame_id;
		r.frame(1030);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
		expect(r.__frame_id).toBe(fidBefore);
		expect(r.__loop).toBe(true);
	});
	test("B2. frame() съедает время: следующий rAF-кадр считает dt от ручного кадра", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const { events, func } = sink();
		r.push({ id: "a", func });
		trigger(1000);
		r.frame(1030);
		trigger(1050);
		expect(events[1].dt).toBe(30);
		expect(events[2].dt).toBe(20);
	});
	test("C. frame() в начале цикла: dt=16.6667 (__loop=false), цикл стартует", () => {
		const { ctx, requestAnimationFrame } = setup();
		const r = new Render(ctx);
		const { events, func } = sink();
		r.__heap.set("a", { iat: 0, func });
		r.frame(1000);
		expect(events[0].dt).toBeCloseTo(100 / 6, 4);
		expect(events[0].time).toBe(1000);
		expect(r.__loop).toBe(true);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
	});
	test("D. frame() с пустой кучей отменяет висящий rAF (нет холостого draw)", () => {
		const { ctx, trigger, draw, cancelAnimationFrame, requestAnimationFrame } = setup();
		const r = new Render(ctx);
		r.push({ id: "a", func: () => true });
		trigger(1000);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
		const fidBefore = r.__frame_id;
		expect(fidBefore).not.toBe(0);
		r.drop("a");
		expect(r.__heap.size).toBe(0);
		const drawCallsBefore = draw.mock.calls.length;
		r.frame(2000);
		expect(cancelAnimationFrame).toHaveBeenCalledWith(fidBefore);
		expect(r.__frame_id).toBe(0);
		expect(r.__loop).toBe(false);
		expect(draw.mock.calls.length).toBe(drawCallsBefore + 1);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
	});
});

// 7. Кламп dt в рамках Render.__min_dt / Render.__max_dt
describe("Render: кламп dt в [__min_dt, __max_dt]", () => {
	test("первый кадр всегда dt = 16.6667 (независимо от ts)", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const { events, func } = sink();
		r.push({ id: "a", func });
		trigger(0);
		expect(events[0].dt).toBeCloseTo(100 / 6, 4);
	});
	test("dt из rAF клампится снизу до __min_dt при слишком частых кадрах", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const { events, func } = sink();
		r.push({ id: "a", func });
		trigger(1000);
		trigger(1000 + MIN_DT / 2);
		expect(events[1].dt).toBe(MIN_DT);
	});
	test("dt из rAF клампится сверху до __max_dt при большом скачке (вкладка в фоне)", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const { events, func } = sink();
		r.push({ id: "a", func });
		trigger(1000);
		trigger(1000 + MAX_DT * 100);
		expect(events[1].dt).toBe(MAX_DT);
	});
	test("dt из ручного frame() клампится снизу до __min_dt", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const { events, func } = sink();
		r.push({ id: "a", func });
		trigger(1000);
		r.frame(1000 + MIN_DT / 2);
		expect(events[1].dt).toBe(MIN_DT);
	});
	test("dt из ручного frame() клампится сверху до __max_dt", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const { events, func } = sink();
		r.push({ id: "a", func });
		trigger(1000);
		r.frame(1000 + MAX_DT * 100);
		expect(events[1].dt).toBe(MAX_DT);
	});
	test("нормальный dt из rAF проходит без клампа", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const { events, func } = sink();
		r.push({ id: "a", func });
		trigger(1000);
		trigger(1030);
		expect(events[1].dt).toBe(30);
	});
	test("нормальный dt из frame() проходит без клампа", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const { events, func } = sink();
		r.push({ id: "a", func });
		trigger(1000);
		r.frame(1030);
		expect(events[1].dt).toBe(30);
	});
	test("негативный dt (ts идёт назад) клампится до __min_dt", () => {
		const { ctx, trigger } = setup();
		const r = new Render(ctx);
		const { events, func } = sink();
		r.push({ id: "a", func });
		trigger(1000);
		trigger(500);
		expect(events[1].dt).toBe(MIN_DT);
	});
});
