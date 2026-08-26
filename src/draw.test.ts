/* oxlint-disable unicorn/no-array-fill-with-reference-type -- Draw.fill is a custom canvas API, not Array.fill. */
import { describe, expect, mock, test } from "bun:test";
import { Draw } from "./draw.js";
import type { CanvasContext } from "./index.js";
import type * as CT from "./types.js";

const makeCtx = () => {
	const ctx = {
		save: mock<() => void>(),
		restore: mock<() => void>(),
		beginPath: mock<() => void>(),
		closePath: mock<() => void>(),
		moveTo: mock<(_x: number, _y: number) => void>(),
		lineTo: mock<(_x: number, _y: number) => void>(),
		rect: mock<(_x: number, _y: number, _w: number, _h: number) => void>(),
		arc: mock<(_x: number, _y: number, _r: number, _s: number, _e: number) => void>(),
		clip: mock<() => void>(),
		clearRect: mock<(_x: number, _y: number, _w: number, _h: number) => void>(),
		fillRect: mock<(_x: number, _y: number, _w: number, _h: number) => void>(),
		strokeRect: mock<(_x: number, _y: number, _w: number, _h: number) => void>(),
		fill: mock<() => void>(),
		stroke: mock<() => void>(),
		translate: mock<(_x: number, _y: number) => void>(),
		scale: mock<(_x: number, _y: number) => void>(),
		rotate: mock<(_a: number) => void>(),
		setTransform: mock<(_a: number, _b: number, _c: number, _d: number, _e: number, _f: number) => void>(),
		resetTransform: mock<() => void>(),
		setLineDash: mock<(_segments: number[]) => void>(),
		getTransform: mock<() => { a: number; b: number; c: number; d: number; e: number; f: number }>(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
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

const asCtx = (c: MockCtx): CanvasContext => c as unknown as CanvasContext;

// 1. Draw.px: перевод n в текущие единицы трансформы
describe("Draw.px: перевод n в единицы текущей трансформы", () => {
	test("identity-трансформ → n (scale = 1)", () => {
		const ctx = makeCtx();
		expect(Draw.px(asCtx(ctx), 4)).toBe(4);
	});

	test("scale=2 (a=2, d=2) → n/2", () => {
		const ctx = makeCtx();
		ctx.getTransform.mockReturnValue({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
		expect(Draw.px(asCtx(ctx), 4)).toBe(2);
	});

	test("scale=0.5 (уменьшение) → n/0.5 = 2n", () => {
		const ctx = makeCtx();
		ctx.getTransform.mockReturnValue({ a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0 });
		expect(Draw.px(asCtx(ctx), 4)).toBe(8);
	});

	test("non-uniform через поворот 90° + scale=2: a=0, b=-2, c=2, d=0 → среднее sx/sy = 2", () => {
		const ctx = makeCtx();
		ctx.getTransform.mockReturnValue({ a: 0, b: -2, c: 2, d: 0, e: 0, f: 0 });
		expect(Draw.px(asCtx(ctx), 4)).toBe(2);
	});

	test("non-uniform: a=4, d=2 → среднее = 3, px(6) = 2", () => {
		const ctx = makeCtx();
		ctx.getTransform.mockReturnValue({ a: 4, b: 0, c: 0, d: 2, e: 0, f: 0 });
		expect(Draw.px(asCtx(ctx), 6)).toBe(2);
	});

	test("scale=0 (вырожденная матрица) → возвращает n, не Infinity/NaN", () => {
		const ctx = makeCtx();
		ctx.getTransform.mockReturnValue({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 });
		const r = Draw.px(asCtx(ctx), 4);
		expect(r).toBe(4);
		expect(Number.isFinite(r)).toBe(true);
	});

	test("дефолтный аргумент n = 1", () => {
		const ctx = makeCtx();
		expect(Draw.px(asCtx(ctx))).toBe(1);
		ctx.getTransform.mockReturnValue({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
		expect(Draw.px(asCtx(ctx))).toBe(0.5);
	});

	test("instance-форма: drw.px(n) идентичен Draw.px(drw.ctx, n)", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		ctx.getTransform.mockReturnValue({ a: 2, b: 0, c: 0, d: 3, e: 0, f: 0 });
		expect(drw.px(6)).toBe(Draw.px(asCtx(ctx), 6));
	});

	test("instance-форма: дефолт n = 1", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		ctx.getTransform.mockReturnValue({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
		expect(drw.px()).toBe(0.5);
	});
});

// 2. Draw.scope: save/restore с гарантией restore при исключении
describe("Draw.scope: save/cb/restore в try/finally", () => {
	test("save до cb, restore после cb", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		const order: string[] = [];
		// oxlint-disable-next-line prefer-mock-return-shorthand
		ctx.save.mockImplementation(() => {
			order.push("save");
		});
		// oxlint-disable-next-line prefer-mock-return-shorthand
		ctx.restore.mockImplementation(() => {
			order.push("restore");
		});
		drw.scope(() => {
			order.push("cb");
		});
		expect(order).toEqual(["save", "cb", "restore"]);
	});

	test("restore вызван даже если cb бросил", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		const boom = new Error("boom");
		expect(() =>
			drw.scope(() => {
				throw boom;
			}),
		).toThrow(boom);
		expect(ctx.save).toHaveBeenCalledTimes(1);
		expect(ctx.restore).toHaveBeenCalledTimes(1);
	});

	test("возвращает this для чейнинга", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		const r = drw.scope(() => null);
		expect(r).toBe(drw);
	});

	test("cb получает тот же Draw", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		let received: Draw<CanvasContext> | null = null;
		drw.scope((d) => {
			received = d;
		});
		expect(received === drw).toBe(true);
	});
});

// 3. Draw.camera: применение камеры в scope
describe("Draw.camera: translate(anchor) → scale(s) → translate(-center) внутри scope", () => {
	test("порядок применения трансформов: translate(anchor), scale(s), translate(-center)", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		const cam: CT.Camera = { center: { x: 100, y: 50 }, scale: 2 };
		const anchor: CT.C2 = { x: 10, y: 20 };
		const order: Array<{ name: string; args: number[] }> = [];
		// oxlint-disable-next-line prefer-mock-return-shorthand
		ctx.save.mockImplementation(() => {
			order.push({ name: "save", args: [] });
		});
		ctx.translate.mockImplementation((x, y) => {
			order.push({ name: "translate", args: [x, y] });
		});
		ctx.scale.mockImplementation((x, y) => {
			order.push({ name: "scale", args: [x, y] });
		});
		// oxlint-disable-next-line prefer-mock-return-shorthand
		ctx.restore.mockImplementation(() => {
			order.push({ name: "restore", args: [] });
		});
		drw.camera(cam, anchor, () => {
			order.push({ name: "cb", args: [] });
		});
		expect(order).toEqual([
			{ name: "save", args: [] },
			{ name: "translate", args: [10, 20] },
			{ name: "scale", args: [2, 2] },
			{ name: "translate", args: [-100, -50] },
			{ name: "cb", args: [] },
			{ name: "restore", args: [] },
		]);
	});

	test("scale=1 → scale(1, 1)", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		const cam: CT.Camera = { center: { x: 0, y: 0 }, scale: 1 };
		drw.camera(cam, { x: 0, y: 0 }, () => null);
		expect(ctx.scale).toHaveBeenCalledWith(1, 1);
	});

	test("работает в scope: save/restore обёрнуты вокруг трансформов и cb", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.camera({ center: { x: 0, y: 0 }, scale: 1 }, { x: 0, y: 0 }, () => null);
		expect(ctx.save).toHaveBeenCalledTimes(1);
		expect(ctx.restore).toHaveBeenCalledTimes(1);
	});

	test("возвращает this", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		const r = drw.camera({ center: { x: 0, y: 0 }, scale: 1 }, { x: 0, y: 0 }, () => null);
		expect(r).toBe(drw);
	});

	test("restore вызван даже если cb бросил", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		expect(() =>
			drw.camera({ center: { x: 0, y: 0 }, scale: 1 }, { x: 0, y: 0 }, () => {
				throw new Error("x");
			}),
		).toThrow();
		expect(ctx.restore).toHaveBeenCalledTimes(1);
	});
});

// 4. Draw.stroke: инкрементальные стили + apply
describe("Draw.stroke: применение стилей и опциональный ctx.stroke()", () => {
	test("пустой {}: стили не тронуты, stroke() вызван", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		const beforeStyle = ctx.strokeStyle;
		const beforeWidth = ctx.lineWidth;
		drw.stroke({});
		expect(ctx.strokeStyle).toBe(beforeStyle);
		expect(ctx.lineWidth).toBe(beforeWidth);
		expect(ctx.stroke).toHaveBeenCalledTimes(1);
	});

	test("color → ctx.strokeStyle", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.stroke({ color: "red" });
		expect(ctx.strokeStyle).toBe("red");
	});

	test("width → ctx.lineWidth", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.stroke({ width: 3 });
		expect(ctx.lineWidth).toBe(3);
	});

	test("join → ctx.lineJoin", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.stroke({ join: "round" });
		expect(ctx.lineJoin).toBe("round");
	});

	test("cap → ctx.lineCap", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.stroke({ cap: "square" });
		expect(ctx.lineCap).toBe("square");
	});

	test("dash → ctx.setLineDash([...])", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.stroke({ dash: [4, 2] });
		expect(ctx.setLineDash).toHaveBeenCalledWith([4, 2]);
	});

	test("alpha → ctx.globalAlpha", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.stroke({ alpha: 0.5 });
		expect(ctx.globalAlpha).toBe(0.5);
	});

	test("apply=false: stroke() НЕ вызван", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.stroke({ color: "red" }, false);
		expect(ctx.strokeStyle).toBe("red");
		expect(ctx.stroke).not.toHaveBeenCalled();
	});

	test("apply=true (default) — эквивалентно без второго аргумента", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.stroke({ color: "red" }, true);
		expect(ctx.stroke).toHaveBeenCalledTimes(1);
	});

	test("все стили разом применяются", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.stroke({
			color: "lime",
			width: 2,
			join: "bevel",
			cap: "round",
			dash: [1, 2, 3],
			alpha: 0.3,
		});
		expect(ctx.strokeStyle).toBe("lime");
		expect(ctx.lineWidth).toBe(2);
		expect(ctx.lineJoin).toBe("bevel");
		expect(ctx.lineCap).toBe("round");
		expect(ctx.setLineDash).toHaveBeenCalledWith([1, 2, 3]);
		expect(ctx.globalAlpha).toBe(0.3);
		expect(ctx.stroke).toHaveBeenCalledTimes(1);
	});

	test("возвращает this", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		expect(drw.stroke({})).toBe(drw);
	});
});

// 5. Draw.fill: инкрементальные стили + apply
describe("Draw.fill: применение стилей и опциональный ctx.fill()", () => {
	test("пустой {}: стили не тронуты, fill() вызван", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		const beforeStyle = ctx.fillStyle;
		const beforeAlpha = ctx.globalAlpha;
		drw.fill({});
		expect(ctx.fillStyle).toBe(beforeStyle);
		expect(ctx.globalAlpha).toBe(beforeAlpha);
		expect(ctx.fill).toHaveBeenCalledTimes(1);
	});

	test("color → ctx.fillStyle", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.fill({ color: "blue" });
		expect(ctx.fillStyle).toBe("blue");
	});

	test("alpha → ctx.globalAlpha", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.fill({ alpha: 0.25 });
		expect(ctx.globalAlpha).toBe(0.25);
	});

	test("apply=false: fill() НЕ вызван", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.fill({ color: "blue" }, false);
		expect(ctx.fillStyle).toBe("blue");
		expect(ctx.fill).not.toHaveBeenCalled();
	});

	test("color + alpha вместе", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		drw.fill({ color: "rgba(0,0,0,0.5)", alpha: 0.5 });
		expect(ctx.fillStyle).toBe("rgba(0,0,0,0.5)");
		expect(ctx.globalAlpha).toBe(0.5);
		expect(ctx.fill).toHaveBeenCalledTimes(1);
	});

	test("возвращает this", () => {
		const ctx = makeCtx();
		const drw = new Draw(asCtx(ctx));
		expect(drw.fill({})).toBe(drw);
	});
});
