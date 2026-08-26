import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { CanvasSmoothing, NewCanvas } from "./index.js";
import { Canvas } from "./index.js";
import type * as CT from "./types.js";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const makeCtx = () => {
	const ctx = {
		fillRect: mock<(_x: number, _y: number, _w: number, _h: number) => void>(),
		clearRect: mock<(_x: number, _y: number, _w: number, _h: number) => void>(),
		save: mock<() => void>(),
		restore: mock<() => void>(),
		translate: mock<(_x: number, _y: number) => void>(),
		scale: mock<(_x: number, _y: number) => void>(),
		rotate: mock<(_a: number) => void>(),
		setTransform: mock<(_a: number, _b: number, _c: number, _d: number, _e: number, _f: number) => void>(),
		resetTransform: mock<() => void>(),
		getTransform: mock<() => { a: number; b: number; c: number; d: number; e: number; f: number }>(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
		setLineDash: mock<(_segments: number[]) => void>(),
		fillStyle: "#000",
		strokeStyle: "#000",
		lineWidth: 1,
		lineJoin: "miter" as CanvasLineJoin,
		lineCap: "butt" as CanvasLineCap,
		globalAlpha: 1,
		imageSmoothingEnabled: true,
		imageSmoothingQuality: "low" as ImageSmoothingQuality,
	};
	return ctx;
};

type MockCtx = ReturnType<typeof makeCtx>;
const asCtx = (c: MockCtx): Ctx => c as unknown as Ctx;

interface RectLike {
	x: number;
	y: number;
	width: number;
	height: number;
	left: number;
	top: number;
	right: number;
	bottom: number;
}
const defaultRect: RectLike = { x: 0, y: 0, width: 100, height: 50, left: 0, top: 0, right: 100, bottom: 50 };

const makeRectFn = (rect: RectLike) => mock<() => DOMRect>(() => rect as unknown as DOMRect);

const makeGetContext = (ctx: MockCtx) => mock<(..._args: unknown[]) => Ctx | null>(() => asCtx(ctx));

// Хранилище инстансов MockRO для ручного триггера
class MockResizeObserver {
	static instances: MockResizeObserver[] = [];
	cb: ResizeObserverCallback;
	disconnected = false;
	observedTargets: Element[] = [];
	constructor(cb: ResizeObserverCallback) {
		this.cb = cb;
		MockResizeObserver.instances.push(this);
	}
	observe(target: Element) {
		this.observedTargets.push(target);
	}
	unobserve(target: Element) {
		this.observedTargets = this.observedTargets.filter((t) => t !== target);
	}
	disconnect() {
		this.disconnected = true;
	}
	trigger(entries: Partial<ResizeObserverEntry>[] = []) {
		this.cb(entries as ResizeObserverEntry[], this);
	}
}

const setDpr = (value: number) => {
	Object.defineProperty(window, "devicePixelRatio", { configurable: true, value });
};

let savedRO: typeof ResizeObserver | undefined;
let savedDprDescriptor: PropertyDescriptor | undefined;

beforeAll(() => {
	GlobalRegistrator.register();
});

beforeEach(() => {
	MockResizeObserver.instances = [];
	savedRO = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
	(globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
	savedDprDescriptor = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
	setDpr(1);
});

afterEach(() => {
	if (savedRO) {
		(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = savedRO;
	} else {
		delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
	}
	if (savedDprDescriptor) {
		Object.defineProperty(window, "devicePixelRatio", savedDprDescriptor);
	} else {
		delete (window as { devicePixelRatio?: number }).devicePixelRatio;
	}
	MockResizeObserver.instances = [];
});

afterAll(() => {
	GlobalRegistrator.unregister();
});

const makeCanvasEl = (rect: RectLike = defaultRect): { el: HTMLCanvasElement; ctx: MockCtx } => {
	const el = document.createElement("canvas");
	const ctx = makeCtx();
	(el as unknown as { getContext: (...args: unknown[]) => Ctx | null }).getContext = makeGetContext(ctx);
	(el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = makeRectFn(rect);
	return { el, ctx };
};

interface NewCanvasOpts {
	rect?: RectLike;
	dpr?: number;
	offResizeObserver?: boolean;
	observe?: (c: Canvas) => void;
	smoothing?: CanvasSmoothing;
	size?: CT.S2;
	options?: NewCanvas["options"];
}

const newCanvas = (opts?: NewCanvasOpts) => {
	const { rect = defaultRect, dpr = 1, offResizeObserver, observe, smoothing, size, options } = opts ?? {};
	setDpr(dpr);
	const { el, ctx } = makeCanvasEl(rect);
	const c = new Canvas(el, { offResizeObserver, observe, smoothing, size, options });
	return { c, el, ctx, rect };
};

// 1. Конструктор и базовая инициализация
describe("Canvas: конструктор", () => {
	test("dpr = window.devicePixelRatio || 1", () => {
		const { c } = newCanvas({ dpr: 2 });
		expect(c.dpr).toBe(2);
	});

	test("dpr = 1 когда window.devicePixelRatio = 0", () => {
		setDpr(0);
		const { el, ctx } = makeCanvasEl();
		const c = new Canvas(el);
		expect(c.dpr).toBe(1);
		expect((c.__ctx as unknown) === (ctx as unknown)).toBe(true);
	});

	test("size из options.size (если задан) — el.width/height синхронизированы", () => {
		const { c, el, ctx } = newCanvas({ size: { w: 800, h: 600 } });
		expect(c.size).toEqual({ w: 800, h: 600 });
		expect(el.width).toBe(800);
		expect(el.height).toBe(600);
		void ctx;
	});

	test("size из __size() по умолчанию = rect * dpr (округлено до 0)", () => {
		const rect: RectLike = { x: 0, y: 0, width: 100.4, height: 50.6, left: 0, top: 0, right: 100.4, bottom: 50.6 };
		const { c, el } = newCanvas({ rect, dpr: 2 });
		expect(c.size).toEqual({ w: 201, h: 101 });
		expect(el.width).toBe(201);
		expect(el.height).toBe(101);
	});

	test("__smoothing сохранён", () => {
		const { c } = newCanvas({ smoothing: { imageSmoothingEnabled: false } });
		expect(c.__smoothing).toEqual({ imageSmoothingEnabled: false });
	});

	test("__ctx = el.getContext('2d'), drw создан с тем же ctx", () => {
		const { c, ctx } = newCanvas();
		expect((c.__ctx as unknown) === (ctx as unknown)).toBe(true);
		expect((c.drw.ctx as unknown) === (ctx as unknown)).toBe(true);
	});

	test("options прокидываются в getContext", () => {
		setDpr(1);
		const el = document.createElement("canvas");
		const ctx = makeCtx();
		const getContext = mock<(..._args: unknown[]) => Ctx | null>(() => asCtx(ctx));
		(el as unknown as { getContext: typeof getContext }).getContext = getContext;
		(el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = makeRectFn(defaultRect);
		const ctxOptions: NewCanvas["options"] = { alpha: false, willReadFrequently: true };
		new Canvas(el, { options: ctxOptions });
		expect(getContext).toHaveBeenCalledWith("2d", ctxOptions);
	});

	test("default: __observer создан, observe(el) вызван", () => {
		newCanvas();
		expect(MockResizeObserver.instances).toHaveLength(1);
		const ro = MockResizeObserver.instances[0];
		expect(ro.observedTargets).toHaveLength(1);
	});

	test("offResizeObserver: true → __observer не создан", () => {
		const { c } = newCanvas({ offResizeObserver: true });
		expect(c.__observer).toBeUndefined();
		expect(MockResizeObserver.instances).toHaveLength(0);
	});

	test("observe-колбэк сохранён в __observe", () => {
		const observe = mock((_c: Canvas) => null);
		const { c } = newCanvas({ observe });
		expect(c.__observe === observe).toBe(true);
	});
});

// 2. rect / __size / __resize
describe("Canvas: rect / __size / __resize", () => {
	test("rect() возвращает результат getBoundingClientRect", () => {
		const rect: RectLike = { x: 10, y: 20, width: 200, height: 100, left: 10, top: 20, right: 210, bottom: 120 };
		const { c } = newCanvas({ rect });
		expect(c.rect()).toBe(rect as unknown as DOMRect);
	});

	test("__size() = rect * dpr, округлено до 0", () => {
		const rect: RectLike = { x: 0, y: 0, width: 100.7, height: 50.3, left: 0, top: 0, right: 100.7, bottom: 50.3 };
		const { c } = newCanvas({ rect, dpr: 3 });
		expect(c.__size()).toEqual({ w: 302, h: 151 });
	});
});

// 3. resize
describe("Canvas: resize", () => {
	test("без аргумента: size пересчитан из __size(), __resize выполнен", () => {
		const rect: RectLike = { x: 0, y: 0, width: 50, height: 25, left: 0, top: 0, right: 50, bottom: 25 };
		const { c, el } = newCanvas({ rect, dpr: 1 });
		el.width = 999;
		el.height = 999;
		c.resize();
		expect(c.size).toEqual({ w: 50, h: 25 });
		expect(el.width).toBe(50);
		expect(el.height).toBe(25);
	});

	test("с аргументом: size берётся из аргумента", () => {
		const { c, el } = newCanvas();
		c.resize({ w: 320, h: 240 });
		expect(c.size).toEqual({ w: 320, h: 240 });
		expect(el.width).toBe(320);
		expect(el.height).toBe(240);
	});

	test("dpr обновляется при смене window.devicePixelRatio между resize", () => {
		const rect: RectLike = { x: 0, y: 0, width: 100, height: 50, left: 0, top: 0, right: 100, bottom: 50 };
		const { c, el } = newCanvas({ dpr: 1, rect });
		expect(c.dpr).toBe(1);
		setDpr(2);
		c.resize();
		expect(c.dpr).toBe(2);
		expect(el.width).toBe(200);
		expect(el.height).toBe(100);
	});
});

// 4. __applySmoothing
describe("Canvas: __applySmoothing", () => {
	test("imageSmoothingEnabled задан → свойство контекста установлено", () => {
		const { c, ctx } = newCanvas();
		c.__smoothing = { imageSmoothingEnabled: false };
		c.__applySmoothing(asCtx(ctx));
		expect(ctx.imageSmoothingEnabled).toBe(false);
	});

	test("imageSmoothingQuality задан → свойство контекста установлено", () => {
		const { c, ctx } = newCanvas();
		c.__smoothing = { imageSmoothingQuality: "high" };
		c.__applySmoothing(asCtx(ctx));
		expect(ctx.imageSmoothingQuality).toBe("high");
	});

	test("__smoothing не задан — ничего не происходит", () => {
		const { c, ctx } = newCanvas();
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "low";
		c.__smoothing = undefined;
		c.__applySmoothing(asCtx(ctx));
		expect(ctx.imageSmoothingEnabled).toBe(true);
		expect(ctx.imageSmoothingQuality).toBe("low");
	});

	test("частично заданный __smoothing — только заданные поля применены", () => {
		const { c, ctx } = newCanvas();
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "low";
		c.__smoothing = { imageSmoothingQuality: "high" };
		c.__applySmoothing(asCtx(ctx));
		expect(ctx.imageSmoothingEnabled).toBe(true);
		expect((ctx.imageSmoothingQuality as ImageSmoothingQuality) === "high").toBe(true);
	});
});

// 5. destroy
describe("Canvas: destroy", () => {
	test("disconnect() вызван у observer'а, __observer = null", () => {
		const { c } = newCanvas();
		const ro = MockResizeObserver.instances[0];
		c.destroy();
		expect(ro.disconnected).toBe(true);
		expect(c.__observer).toBeNull();
	});

	test("повторный destroy() не бросает", () => {
		const { c } = newCanvas();
		c.destroy();
		expect(() => c.destroy()).not.toThrow();
		expect(c.__observer).toBeNull();
	});

	test("destroy без observer'а (offResizeObserver) — не бросает, __observer = null после", () => {
		const { c } = newCanvas({ offResizeObserver: true });
		expect(c.__observer).toBeUndefined();
		expect(() => c.destroy()).not.toThrow();
		expect(c.__observer).toBeNull();
	});
});

// 6. fill / clear
describe("Canvas: fill / clear", () => {
	test("fill(color) → ctx.fillStyle = color, ctx.fillRect(0, 0, size.w, size.h)", () => {
		const { c, ctx } = newCanvas({ size: { w: 200, h: 100 } });
		c.fill("red");
		expect(ctx.fillStyle).toBe("red");
		expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
	});

	test("clear() → ctx.clearRect(0, 0, size.w, size.h)", () => {
		const { c, ctx } = newCanvas({ size: { w: 200, h: 100 } });
		c.clear();
		expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 100);
	});
});

// 7. Координатные преобразования
// "Реалистичный" layout: viewport 1000×800, toolbar 50 сверху, боковые панели 200 слева и 150 справа.
// Canvas занимает оставшуюся область: (200, 50) — (850, 800), т.е. 650×750.
describe("Canvas: координатные преобразования (canvas с панелями и тулбаром)", () => {
	const canvasRect: RectLike = {
		x: 200,
		y: 50,
		width: 650,
		height: 750,
		left: 200,
		top: 50,
		right: 850,
		bottom: 800,
	};

	test("rect() отражает положение canvas относительно viewport с учётом панелей", () => {
		const { c } = newCanvas({ rect: canvasRect });
		const r = c.rect();
		expect(r.left).toBe(200);
		expect(r.top).toBe(50);
		expect(r.width).toBe(650);
		expect(r.height).toBe(750);
	});

	test("click в центре canvas (клиент 525, 425) → toElement = (325, 375)", () => {
		const { c } = newCanvas({ rect: canvasRect });
		expect(c.toElement({ x: 525, y: 425 })).toEqual({ x: 325, y: 375 });
	});

	test("click в левом-верхнем углу canvas (200, 50) → toElement = (0, 0)", () => {
		const { c } = newCanvas({ rect: canvasRect });
		expect(c.toElement({ x: 200, y: 50 })).toEqual({ x: 0, y: 0 });
	});

	test("click в правом-нижнем углу canvas (850, 800) → toElement = (650, 750)", () => {
		const { c } = newCanvas({ rect: canvasRect });
		expect(c.toElement({ x: 850, y: 800 })).toEqual({ x: 650, y: 750 });
	});

	test("click в toolbar (100, 25) → toElement = (-100, -25) — выше canvas", () => {
		const { c } = newCanvas({ rect: canvasRect });
		expect(c.toElement({ x: 100, y: 25 })).toEqual({ x: -100, y: -25 });
	});

	test("click в правой панели (900, 400) → toElement = (700, 350) — правее canvas (> 650)", () => {
		const { c } = newCanvas({ rect: canvasRect });
		expect(c.toElement({ x: 900, y: 400 })).toEqual({ x: 700, y: 350 });
	});

	test("toWorld(skip=true) с dpr=2: учитывает dpr и offset от панелей", () => {
		const { c } = newCanvas({ rect: canvasRect, dpr: 2 });
		expect(c.toWorld({ x: 525, y: 425 }, true)).toEqual({ x: 650, y: 750 });
	});

	test("unElement в координаты viewport: прибавляет offset панелей", () => {
		const { c } = newCanvas({ rect: canvasRect });
		expect(c.unElement({ x: 0, y: 0 })).toEqual({ x: 200, y: 50 });
		expect(c.unElement({ x: 325, y: 375 })).toEqual({ x: 525, y: 425 });
	});

	test("unWorld(skip=true): world → клиентские с учётом dpr и панелей", () => {
		const { c } = newCanvas({ rect: canvasRect, dpr: 2 });
		expect(c.unWorld({ x: 650, y: 750 }, true)).toEqual({ x: 525, y: 425 });
	});

	test("раунд-трип toElement ∘ unElement ≈ identity (центр canvas)", () => {
		const { c } = newCanvas({ rect: canvasRect });
		const p: CT.C2 = { x: 325, y: 375 };
		const r = c.toElement(c.unElement(p));
		expect(Math.abs(r.x - p.x)).toBeLessThan(1e-9);
		expect(Math.abs(r.y - p.y)).toBeLessThan(1e-9);
	});

	test("раунд-трип unElement ∘ toElement ≈ identity (клиентская в canvas)", () => {
		const { c } = newCanvas({ rect: canvasRect });
		const p: CT.C2 = { x: 525, y: 425 };
		const r = c.unElement(c.toElement(p));
		expect(Math.abs(r.x - p.x)).toBeLessThan(1e-9);
		expect(Math.abs(r.y - p.y)).toBeLessThan(1e-9);
	});

	test("раунд-трип toWorld(skip=true) ∘ unWorld(skip=true) ≈ identity (центр canvas, dpr=2)", () => {
		const { c } = newCanvas({ rect: canvasRect, dpr: 2 });
		const p: CT.C2 = { x: 650, y: 750 };
		const r = c.toWorld(c.unWorld(p, true), true);
		expect(Math.abs(r.x - p.x)).toBeLessThan(1e-9);
		expect(Math.abs(r.y - p.y)).toBeLessThan(1e-9);
	});

	test("полный раунд-трип клиент → element → world → клиент (dpr=2, центр canvas)", () => {
		const { c } = newCanvas({ rect: canvasRect, dpr: 2 });
		const client: CT.C2 = { x: 525, y: 425 };
		const element = c.toElement(client);
		const world = c.toWorld(element, false);
		const back = c.unWorld(world, true);
		expect(Math.abs(back.x - client.x)).toBeLessThan(1e-9);
		expect(Math.abs(back.y - client.y)).toBeLessThan(1e-9);
	});

	test("полный раунд-трип клиент → world(skip=true) → клиент (dpr=1, угол canvas)", () => {
		const { c } = newCanvas({ rect: canvasRect, dpr: 1 });
		const client: CT.C2 = { x: 200, y: 50 };
		const world = c.toWorld(client, true);
		const back = c.unWorld(world, true);
		expect(back.x).toBe(200);
		expect(back.y).toBe(50);
	});
});

// "Пустая" страница: canvas во весь viewport
describe("Canvas: координатные преобразования (canvas во весь viewport)", () => {
	const fullRect: RectLike = {
		x: 0,
		y: 0,
		width: 1000,
		height: 800,
		left: 0,
		top: 0,
		right: 1000,
		bottom: 800,
	};

	test("toElement = client (без offset)", () => {
		const { c } = newCanvas({ rect: fullRect });
		expect(c.toElement({ x: 500, y: 400 })).toEqual({ x: 500, y: 400 });
	});

	test("раунд-трип toElement ∘ unElement ≈ identity", () => {
		const { c } = newCanvas({ rect: fullRect });
		const p: CT.C2 = { x: 137, y: 256 };
		const r = c.toElement(c.unElement(p));
		expect(Math.abs(r.x - p.x)).toBeLessThan(1e-9);
		expect(Math.abs(r.y - p.y)).toBeLessThan(1e-9);
	});

	test("раунд-трип toWorld ∘ unWorld (dpr=2) ≈ identity", () => {
		const { c } = newCanvas({ rect: fullRect, dpr: 2 });
		const p: CT.C2 = { x: 42, y: 17 };
		const r = c.toWorld(c.unWorld(p, false), false);
		expect(Math.abs(r.x - p.x)).toBeLessThan(1e-9);
		expect(Math.abs(r.y - p.y)).toBeLessThan(1e-9);
	});
});

// 8. ResizeObserver интеграция
describe("Canvas: ResizeObserver интеграция", () => {
	test("колбэк observer'а вызывает resize()", () => {
		const rect1: RectLike = { x: 0, y: 0, width: 100, height: 50, left: 0, top: 0, right: 100, bottom: 50 };
		const { c, el } = newCanvas({ rect: rect1, dpr: 1 });
		const ro = MockResizeObserver.instances[0];
		el.width = 999;
		el.height = 999;
		const rect2: RectLike = { x: 0, y: 0, width: 200, height: 100, left: 0, top: 0, right: 200, bottom: 100 };
		(el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = makeRectFn(rect2);
		ro.trigger();
		expect(c.size).toEqual({ w: 200, h: 100 });
		expect(el.width).toBe(200);
		expect(el.height).toBe(100);
	});

	test("observe-колбэк вызван с canvas после resize()", () => {
		const observe = mock((_c: Canvas) => null);
		const { c } = newCanvas({ observe });
		const ro = MockResizeObserver.instances[0];
		ro.trigger();
		expect(observe).toHaveBeenCalledTimes(1);
		expect(observe.mock.calls[0]?.[0] === c).toBe(true);
	});

	test("без observe-колбэка — observer просто ресайзит", () => {
		const rect1: RectLike = { x: 0, y: 0, width: 50, height: 25, left: 0, top: 0, right: 50, bottom: 25 };
		const { c, el } = newCanvas({ rect: rect1 });
		const ro = MockResizeObserver.instances[0];
		const rect2: RectLike = { x: 0, y: 0, width: 80, height: 40, left: 0, top: 0, right: 80, bottom: 40 };
		(el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = makeRectFn(rect2);
		ro.trigger();
		expect(c.size).toEqual({ w: 80, h: 40 });
	});
});
