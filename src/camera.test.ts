import { describe, expect, test } from "bun:test";
import { Camera } from "./camera.js";
import { ServerRender } from "./server/render.js";
import type * as CT from "./types.js";

const c = (x: number, y: number): CT.C2 => ({ x, y });
const cam = (center: CT.C2, scale: number): CT.Camera => ({ center, scale });
const s = (w: number, h: number): CT.S2 => ({ w, h });
const b = (minX: number, minY: number, maxX: number, maxY: number): CT.Bounds => ({ minX, minY, maxX, maxY });

// ─── Статические фабрики и утилиты ──────────────────────────────────────────

describe("Camera.zero: фабрика с дефолтами", () => {
	test("без аргументов → центр {0, 0}, scale = Camera.__scale", () => {
		const z = Camera.zero();
		expect(z.center).toEqual({ x: 0, y: 0 });
		expect(z.scale).toBe(Camera.__scale);
	});

	test("кастомный центр → сохраняется, scale дефолтный", () => {
		const z = Camera.zero(c(-10, -20));
		expect(z.center).toEqual({ x: -10, y: -20 });
		expect(z.scale).toBe(Camera.__scale);
	});

	test("кастомный центр и scale", () => {
		const z = Camera.zero(c(-10, -20), 1.5);
		expect(z.center).toEqual({ x: -10, y: -20 });
		expect(z.scale).toBe(1.5);
	});
});

describe("Camera.copy: копия камеры (новый объект center)", () => {
	test("значения совпадают, объекты разные", () => {
		const original = cam(c(-10, -20), 1.5);
		const copied = Camera.copy(original);
		expect(copied).toEqual(original);
		expect(copied).not.toBe(original);
		expect(copied.center).not.toBe(original.center);
	});

	test("изменение копии не влияет на оригинал", () => {
		const original = cam(c(-10, -20), 1.5);
		const copied = Camera.copy(original);
		copied.center.x = 99;
		copied.scale = 99;
		expect(original.center.x).toBe(-10);
		expect(original.scale).toBe(1.5);
	});
});

describe("Camera.assign: мутация камеры", () => {
	test("копирует centre и scale из expected", () => {
		const target_camera = cam(c(0, 0), 1);
		Camera.assign(target_camera, cam(c(-10, -20), 1.5));
		expect(target_camera.center).toEqual({ x: -10, y: -20 });
		expect(target_camera.scale).toBe(1.5);
	});

	test("без expected → сброс в zero {0, 0}, Camera.__scale", () => {
		const target_camera = cam(c(-10, -20), 1.5);
		Camera.assign(target_camera);
		expect(target_camera.center).toEqual({ x: 0, y: 0 });
		expect(target_camera.scale).toBe(Camera.__scale);
	});
});

describe("Camera.eq: равенство камер в пределах EPS", () => {
	const c1 = c(-10, -20);
	const a = cam(c1, 1.5);
	const same = cam(c(-10, -20), 1.5);

	test("идентичные камеры → true", () => {
		expect(Camera.eq(a, same)).toBe(true);
	});

	test("разный center → false", () => {
		const diff_x = cam(c(-5, -20), 1.5);
		const diff_y = cam(c(-10, -15), 1.5);
		const diff_xy = cam(c(-5, -15), 1.5);
		expect(Camera.eq(a, diff_x)).toBe(false);
		expect(Camera.eq(a, diff_y)).toBe(false);
		expect(Camera.eq(a, diff_xy)).toBe(false);
	});

	test("разный scale → false", () => {
		const diff_scale_1 = cam(c(-10, -20), 2);
		const diff_scale_2 = cam(c(-10, -20), 0.5);
		expect(Camera.eq(a, diff_scale_1)).toBe(false);
		expect(Camera.eq(a, diff_scale_2)).toBe(false);
	});

	test("center в пределах EPS → true", () => {
		const eps = Camera.__eps_center;
		const near = cam(c(-10 + eps / 2, -20 - eps / 2), 1.5);
		expect(Camera.eq(a, near)).toBe(true);
	});

	test("center за пределами EPS → false", () => {
		const eps = Camera.__eps_center;
		const far = cam(c(-10 + eps * 2, -20 - eps * 2), 1.5);
		expect(Camera.eq(a, far)).toBe(false);
	});

	test("scale в пределах EPS → true", () => {
		const near = cam(c(-10, -20), 1.5 + Camera.__eps_scale / 2);
		expect(Camera.eq(a, near)).toBe(true);
	});

	test("scale за пределами EPS → false", () => {
		const far = cam(c(-10, -20), 1.5 + Camera.__eps_scale * 2);
		expect(Camera.eq(a, far)).toBe(false);
	});

	test("обе компоненты разные на границе EPS → false", () => {
		const eps_c = Camera.__eps_center * 2;
		const eps_s = Camera.__eps_scale * 2;
		const other = cam(c(-10 + eps_c, -20 - eps_c), 1.5 + eps_s);
		expect(Camera.eq(a, other)).toBe(false);
	});
});

// ─── Преобразования координат ───────────────────────────────────────────────

describe("Camera.refract: мировые координаты из экранных", () => {
	test("scale = 1, anchor = center → client проходит без изменений", () => {
		const camera = cam(c(-10, -20), 1);
		const result = Camera.refract(camera, c(-10, -20), c(50, -15));
		expect(result).toEqual({ x: 50, y: -15 });
	});

	test("scale = 1.5, anchor смещён относительно center", () => {
		const camera = cam(c(-10, -20), 1.5);
		const anchor = c(400, 300);
		const client = c(700, 600);
		// (700-400)/1.5 + (-10) = 200 + (-10) = 190
		// (600-300)/1.5 + (-20) = 200 + (-20) = 180
		const result = Camera.refract(camera, anchor, client);
		expect(result.x).toBeCloseTo(190, 10);
		expect(result.y).toBeCloseTo(180, 10);
	});

	test("scale < 1 (отдаление) — мировое смещение больше экранного", () => {
		const camera = cam(c(-10, -20), 0.5);
		const anchor = c(400, 300);
		const client = c(500, 400);
		// (500-400)/0.5 + (-10) = 200 + (-10) = 190
		// (400-300)/0.5 + (-20) = 200 + (-20) = 180
		const result = Camera.refract(camera, anchor, client);
		expect(result.x).toBeCloseTo(190, 10);
		expect(result.y).toBeCloseTo(180, 10);
	});

	test("anchor = {0, 0}, scale ≠ 1", () => {
		const camera = cam(c(5, -3), 2);
		const result = Camera.refract(camera, c(0, 0), c(200, 100));
		// 200/2 + 5 = 105, 100/2 + (-3) = 47
		expect(result.x).toBeCloseTo(105, 10);
		expect(result.y).toBeCloseTo(47, 10);
	});
});

describe("Camera.unrefract: экранные координаты из мировых", () => {
	test("scale = 1, anchor = center → world проходит без изменений", () => {
		const camera = cam(c(-10, -20), 1);
		const result = Camera.unrefract(camera, c(-10, -20), c(50, -15));
		expect(result).toEqual({ x: 50, y: -15 });
	});

	test("scale = 1.5, anchor смещён", () => {
		const camera = cam(c(-10, -20), 1.5);
		const anchor = c(400, 300);
		const world = c(190, 180);
		// (190 - (-10)) * 1.5 + 400 = 200 * 1.5 + 400 = 700
		// (180 - (-20)) * 1.5 + 300 = 200 * 1.5 + 300 = 600
		const result = Camera.unrefract(camera, anchor, world);
		expect(result.x).toBeCloseTo(700, 10);
		expect(result.y).toBeCloseTo(600, 10);
	});

	test("round-trip: unrefract(refract(a, p)) ≈ p", () => {
		const camera = cam(c(-10, -20), 1.5);
		const anchor = c(400, 300);
		const client = c(700, 600);

		const world = Camera.refract(camera, anchor, client);
		const back = Camera.unrefract(camera, anchor, world);
		expect(back.x).toBeCloseTo(client.x, 10);
		expect(back.y).toBeCloseTo(client.y, 10);
	});

	test("round-trip: refract(unrefract(a, w)) ≈ w", () => {
		const camera = cam(c(-10, -20), 1.5);
		const anchor = c(400, 300);
		const world = c(190, 180);

		const client = Camera.unrefract(camera, anchor, world);
		const back = Camera.refract(camera, anchor, client);
		expect(back.x).toBeCloseTo(world.x, 10);
		expect(back.y).toBeCloseTo(world.y, 10);
	});

	test("round-trip для разных camera / anchor / point", () => {
		const cases: Array<[CT.Camera, CT.C2, CT.C2]> = [
			[cam(c(-10, -20), 1.5), c(400, 300), c(700, 600)],
			[cam(c(5, -3), 0.8), c(200, 150), c(320, 90)],
			[cam(c(0, 0), 2), c(0, 0), c(-50, 75)],
			[cam(c(-50, 30), 1), c(500, 400), c(500, 400)],
			[cam(c(100, -200), 0.33), c(800, 600), c(200, 300)],
		];
		for (const [camera, anchor, client] of cases) {
			const world = Camera.refract(camera, anchor, client);
			const back = Camera.unrefract(camera, anchor, world);
			expect(back.x).toBeCloseTo(client.x, 10);
			expect(back.y).toBeCloseTo(client.y, 10);
		}
	});
});

// ─── Навигация ──────────────────────────────────────────────────────────────

describe("Camera.pan: сдвиг центра в мировых координатах", () => {
	test("сдвиг на delta → center + delta, scale неизменен", () => {
		const camera = cam(c(-10, -20), 1.5);
		const result = Camera.pan(camera, c(5, -8));
		expect(result.center).toEqual({ x: -5, y: -28 });
		expect(result.scale).toBe(1.5);
	});

	test("нулевой delta → без изменений", () => {
		const camera = cam(c(-10, -20), 1.5);
		const result = Camera.pan(camera, c(0, 0));
		expect(result).toEqual(camera);
	});

	test("не мутирует исходник", () => {
		const camera = cam(c(-10, -20), 1.5);
		Camera.pan(camera, c(5, -8));
		expect(camera.center).toEqual({ x: -10, y: -20 });
	});

	test("отрицательный delta на обеих осях", () => {
		const result = Camera.pan(cam(c(30, 40), 2), c(-50, -60));
		expect(result.center).toEqual({ x: -20, y: -20 });
	});
});

describe("Camera.zoom: масштабирование с удержанием target-точки", () => {
	const camera = cam(c(-10, -20), 1.5);

	test("приближение (factor > 1), clamp_flag = false", () => {
		const result = Camera.zoom(camera, c(50, 100), 2, false);
		expect(result).not.toBeNull();
		expect(result!.scale).toBe(3);
	});

	test("отдаление (factor < 1), clamp_flag = false", () => {
		const result = Camera.zoom(camera, c(50, 100), 0.5, false);
		expect(result).not.toBeNull();
		expect(result!.scale).toBe(0.75);
	});

	test("удержание target: точка в мировых координатах не смещается на экране", () => {
		const result = Camera.zoom(camera, c(50, 100), 2, false)!;
		// refract через старую камеру и новую даёт один и тот же screen
		const anchor = c(400, 300);
		const screen_before = Camera.unrefract(camera, anchor, c(50, 100));
		const screen_after = Camera.unrefract(result, anchor, c(50, 100));
		expect(screen_after.x).toBeCloseTo(screen_before.x, 10);
		expect(screen_after.y).toBeCloseTo(screen_before.y, 10);
	});

	test("clamp_flag = true: scale зажимается в [0.33, 4]", () => {
		// factor = 10 → scale = 15, clamped → 4
		const result = Camera.zoom(camera, c(50, 100), 10, true)!;
		expect(result.scale).toBe(Camera.__hard_max_scale);

		// factor = 0.01 → scale = 0.015, clamped → 0.33
		const result2 = Camera.zoom(camera, c(50, 100), 0.01, true)!;
		expect(result2.scale).toBe(Camera.__hard_min_scale);
	});

	test("clamp_flag = false: выход за пределы без клампа", () => {
		const result = Camera.zoom(camera, c(50, 100), 10, false)!;
		expect(result.scale).toBe(15);

		const result2 = Camera.zoom(camera, c(50, 100), 0.01, false)!;
		expect(result2.scale).toBe(0.015);
	});

	test("factor = 1 → null (без изменений)", () => {
		const result = Camera.zoom(camera, c(50, 100), 1, false);
		expect(result).toBeNull();
	});

	test("scale уже на границе клампа + factor к границе → null", () => {
		const at_min = cam(c(-10, -20), Camera.__hard_min_scale);
		const result = Camera.zoom(at_min, c(50, 100), 0.5, true);
		expect(result).toBeNull();
	});

	test("не мутирует исходник", () => {
		const original = { ...camera, center: { ...camera.center } };
		Camera.zoom(camera, c(50, 100), 2, false);
		expect(camera).toEqual(original);
	});
});

// ─── Viewport / Bounds ──────────────────────────────────────────────────────

describe("Camera.bound: видимые Bounds для viewport с padding", () => {
	const camera = cam(c(-10, -20), 1.5);
	const avp_size = s(800, 600);

	test("padding = 0 → bounds симметричны относительно center", () => {
		const result = Camera.bound(camera, avp_size, 0);
		// quarter = {w: 800/(2*1.5), h: 600/(2*1.5)} = {266.66, 200}
		// relative_center = (-10, -20) т.к. padding=0 => avp_center = (400, 300)
		// refract: (400-400)/1.5 + (-10) = -10, (300-300)/1.5 + (-20) = -20
		expect(result.minX).toBeCloseTo(-10 - 800 / 3, 1);
		expect(result.maxX).toBeCloseTo(-10 + 800 / 3, 1);
		expect(result.minY).toBeCloseTo(-20 - 200, 1);
		expect(result.maxY).toBeCloseTo(-20 + 200, 1);
	});

	test("симметричный padding (число) → bounds сжаты равномерно, центр не смещён", () => {
		const no_pad = Camera.bound(camera, avp_size, 0);
		const with_pad = Camera.bound(camera, avp_size, 10);
		const center_no = (no_pad.minX + no_pad.maxX) / 2;
		const center_with = (with_pad.minX + with_pad.maxX) / 2;
		expect(center_with).toBeCloseTo(center_no, 1);
		// с padding bounds должны быть уже
		expect(with_pad.maxX - with_pad.minX).toBeLessThan(no_pad.maxX - no_pad.minX);
	});

	test("асимметричный P4 padding → bounds смещены", () => {
		const no_pad = Camera.bound(camera, avp_size, 0);
		const with_pad = Camera.bound(camera, avp_size, [10, 20, 30, 40]);
		const center_no = (no_pad.minX + no_pad.maxX) / 2;
		const center_with = (with_pad.minX + with_pad.maxX) / 2;
		// с асимметричным P4 центр bounds должен сместиться
		expect(center_with).not.toBeCloseTo(center_no, 1);
	});

	test("scale = 1, padding = 0: quarter = half viewport", () => {
		const cam1 = cam(c(5, 3), 1);
		const avp = s(100, 200);
		const result = Camera.bound(cam1, avp, 0);
		expect(result.minX).toBeCloseTo(5 - 50);
		expect(result.maxX).toBeCloseTo(5 + 50);
		expect(result.minY).toBeCloseTo(3 - 100);
		expect(result.maxY).toBeCloseTo(3 + 100);
	});
});

describe("Camera.relative: дельта-компенсация асимметричного padding", () => {
	const camera = cam(c(-10, -20), 1.5);
	const avp_size = s(800, 600);

	test("padding — число → null (симметрия обеспечена)", () => {
		expect(Camera.relative(camera, avp_size, 10)).toBeNull();
		expect(Camera.relative(camera, avp_size, 0)).toBeNull();
		expect(Camera.relative(camera, avp_size, 0.1)).toBeNull();
	});

	test("padding — P4 с асимметрией → ненулевая дельта", () => {
		const delta = Camera.relative(camera, avp_size, [10, 20, 30, 40]);
		expect(delta).not.toBeNull();
		expect(delta!.x).not.toBe(0);
		expect(delta!.y).not.toBe(0);
	});

	test("padding — P4 симметричный (top=bottom, left=right) → null", () => {
		const delta = Camera.relative(camera, avp_size, [10, 20, 10, 20]);
		expect(delta).toBeNull();
	});

	test("padding P4: только асимметрия по X → delta.y = 0", () => {
		const delta = Camera.relative(camera, avp_size, [10, 20, 10, 40]);
		expect(delta).not.toBeNull();
		expect(delta!.y).toBe(0);
	});

	test("padding P4: только асимметрия по Y → delta.x = 0", () => {
		const delta = Camera.relative(camera, avp_size, [10, 20, 30, 20]);
		expect(delta).not.toBeNull();
		expect(delta!.x).toBe(0);
	});
});

describe("Camera.out: max scale для вписывания bounds в avp", () => {
	const bounds = b(-10, -20, 30, 40);
	const avp_size = s(800, 600);

	test("bounds помещаются → scale > 1", () => {
		const result = Camera.out(bounds, avp_size, 0, false);
		// bounds: w=40, h=60. avp: w=800, h=600
		// scale = min(800/40, 600/60) = min(20, 10) = 10
		expect(result).toBeCloseTo(10, 5);
	});

	test("bounds больше avp → scale < 1", () => {
		const big_bounds = b(-200, -300, 200, 300);
		const result = Camera.out(big_bounds, avp_size, 0, false);
		// w=400, h=600. scale = min(800/400, 600/600) = min(2, 1) = 1
		expect(result).toBeCloseTo(1, 5);
	});

	test("bounds пустые (точка) → Camera.__scale", () => {
		expect(Camera.out(b(5, 5, 5, 5), avp_size, 0, false)).toBe(Camera.__scale);
	});

	test("avp пустой (w=0 или h=0) → Camera.__scale", () => {
		expect(Camera.out(bounds, s(0, 600), 0, false)).toBe(Camera.__scale);
		expect(Camera.out(bounds, s(800, 0), 0, false)).toBe(Camera.__scale);
	});

	test("clamp_flag = true → scale зажат в [0.33, 4]", () => {
		const small_bounds = b(0, 0, 1, 1);
		const result = Camera.out(small_bounds, avp_size, 0, true);
		expect(result).toBeLessThanOrEqual(Camera.__hard_max_scale);
		expect(result).toBeGreaterThanOrEqual(Camera.__hard_min_scale);
	});

	test("padding уменьшает доступный avp → scale меньше", () => {
		const no_pad = Camera.out(bounds, avp_size, 0, false);
		const with_pad = Camera.out(bounds, avp_size, 10, false);
		expect(with_pad).toBeLessThan(no_pad);
	});
});

describe("Camera.fit: камера, вписывающая bounds в avp", () => {
	const bounds = b(-10, -20, 30, 40);
	const avp_size = s(800, 600);

	test("center — центр bounds, scale — через out", () => {
		const result = Camera.fit(bounds, avp_size, 0, false);
		// center bounds = {x: (-10+30)/2, y: (-20+40)/2} = {10, 10}
		expect(result.center.x).toBeCloseTo(10, 5);
		expect(result.center.y).toBeCloseTo(10, 5);
		expect(result.scale).toBeCloseTo(Camera.out(bounds, avp_size, 0, false), 5);
	});

	test("асимметричный padding → center компенсируется через relative", () => {
		const no_pad = Camera.fit(bounds, avp_size, 0, false);
		const with_pad = Camera.fit(bounds, avp_size, [10, 20, 30, 40], false);
		expect(with_pad.center).not.toEqual(no_pad.center);
	});

	test("clamp_flag = true → scale зажат, center всё ещё корректен", () => {
		const result = Camera.fit(bounds, avp_size, 0, true);
		expect(result.scale).toBeLessThanOrEqual(Camera.__hard_max_scale);
		expect(result.center.x).toBe(10);
		expect(result.center.y).toBe(10);
	});

	test("fit → bound даёт bounds, вписанные в avp", () => {
		const camera = Camera.fit(bounds, avp_size, 0, false);
		const visible = Camera.bound(camera, avp_size, 0);
		const vis_size_w = visible.maxX - visible.minX;
		const vis_size_h = visible.maxY - visible.minY;
		expect(vis_size_w).toBeCloseTo(avp_size.w / camera.scale, 1);
		expect(vis_size_h).toBeCloseTo(avp_size.h / camera.scale, 1);
	});
});

describe("Camera.clamp: зажим scale", () => {
	test("scale внутри диапазона → возвращается как есть", () => {
		expect(Camera.clamp(1.5)).toBe(1.5);
		expect(Camera.clamp(2)).toBe(2);
	});

	test("scale ниже минимума → __hard_min_scale", () => {
		expect(Camera.clamp(0.1)).toBe(Camera.__hard_min_scale);
	});

	test("scale выше максимума → __hard_max_scale", () => {
		expect(Camera.clamp(10)).toBe(Camera.__hard_max_scale);
	});

	test("flag = false → без клампа", () => {
		expect(Camera.clamp(0.1, false)).toBe(0.1);
		expect(Camera.clamp(10, false)).toBe(10);
	});
});

// ─── Инстанс: конструктор, mutate, stop ─────────────────────────────────────

describe("Camera: конструктор", () => {
	test("state и target — копии входной camera, ctx сохранён", () => {
		const camera = cam(c(-10, -20), 1.5);
		const ctx = { id: "test" };
		const cam_instance = new Camera(camera, ctx);

		expect(cam_instance.ctx).toBe(ctx);
		expect(cam_instance.state).toEqual(camera);
		expect(cam_instance.target).toEqual(camera);
		expect(cam_instance.state).not.toBe(camera);
		expect(cam_instance.state.center).not.toBe(camera.center);
	});
});

describe("Camera.mutate: без Render (force-режим)", () => {
	test("state сразу равен новому target, onchange('force', false)", () => {
		const camera = cam(c(-10, -20), 1.5);
		const events: Array<[string, boolean]> = [];
		const cam_instance = new Camera(camera, {
			id: "force-test",
			onchange: (mode, dirty) => events.push([mode, dirty]),
		});

		const new_target = cam(c(30, 40), 2);
		cam_instance.mutate(new_target);

		expect(Camera.eq(cam_instance.state, new_target)).toBe(true);
		expect(Camera.eq(cam_instance.target, new_target)).toBe(true);
		expect(events).toEqual([["force", false]]);
	});

	test("mutate с тем же target, что уже в state → no-op, onchange не вызывается", () => {
		const camera = cam(c(-10, -20), 1.5);
		const events: Array<[string, boolean]> = [];
		const cam_instance = new Camera(camera, {
			id: "noop-test",
			onchange: (mode, dirty) => events.push([mode, dirty]),
		});

		cam_instance.mutate(Camera.copy(camera));
		expect(events).toHaveLength(0);
	});
});

describe("Camera.mutate: с ServerRender (интерполяция)", () => {
	test("instant mutate synchronizes state and removes a pending tick", () => {
		const render = new ServerRender();
		const events: Array<[string, boolean]> = [];
		const cam_instance = new Camera(cam(c(-10, -20), 1.5), {
			id: "instant-test",
			render,
			onchange: (mode, dirty) => events.push([mode, dirty]),
		});

		cam_instance.mutate(cam(c(5, 10), 1.8));
		expect(render.__heap.has("instant-test")).toBe(true);

		const instant = cam(c(30, 40), 2);
		cam_instance.mutate(instant, true);

		expect(Camera.eq(cam_instance.state, instant)).toBe(true);
		expect(Camera.eq(cam_instance.target, instant)).toBe(true);
		expect(render.__heap.has("instant-test")).toBe(false);
		expect(events.at(-1)).toEqual(["force", false]);
	});

	test("mutate запускает тик, state приближается к target", () => {
		const render = new ServerRender();
		const camera = cam(c(-10, -20), 1.5);
		const events: Array<[string, boolean]> = [];
		const cam_instance = new Camera(camera, {
			id: "interp-test",
			render,
			onchange: (mode, dirty) => events.push([mode, dirty]),
		});

		const new_target = cam(c(30, 40), 2);
		cam_instance.mutate(new_target);

		// после одного шага state должен сдвинуться к target, но не достигнуть
		render.step(16.6667);
		expect(cam_instance.state.center.x).toBeGreaterThan(-10);
		expect(cam_instance.state.center.x).toBeLessThan(30);
		expect(cam_instance.state.scale).toBeGreaterThan(1.5);
		expect(cam_instance.state.scale).toBeLessThan(2);
		expect(events.length).toBeGreaterThan(0);
	});

	test("после settle state достигает target", () => {
		const render = new ServerRender();
		const camera = cam(c(-10, -20), 1.5);
		const cam_instance = new Camera(camera, {
			id: "settle-test",
			render,
		});

		const new_target = cam(c(30, 40), 2);
		cam_instance.mutate(new_target);
		render.settle();

		expect(Camera.eq(cam_instance.state, new_target)).toBe(true);
		expect(Camera.eq(cam_instance.target, new_target)).toBe(true);
	});

	test("последовательные mutate: интерполяция доводит до последнего target", () => {
		const render = new ServerRender();
		const camera = cam(c(-10, -20), 1.5);
		const cam_instance = new Camera(camera, {
			id: "seq-test",
			render,
		});

		const t1 = cam(c(30, 40), 2);
		const t2 = cam(c(-50, -60), 0.8);

		cam_instance.mutate(t1);
		render.step(16.6667);
		cam_instance.mutate(t2);
		render.settle();

		expect(Camera.eq(cam_instance.state, t2)).toBe(true);
	});

	test("mutate c тем же target и state → no-op, тик не добавляется", () => {
		const render = new ServerRender();
		const camera = cam(c(-10, -20), 1.5);
		const cam_instance = new Camera(camera, {
			id: "noop-render",
			render,
		});

		cam_instance.mutate(Camera.copy(camera));
		expect(render.__heap.size).toBe(0);
	});

	test("mutate c тем же target, но другим state → тик добавляется", () => {
		const render = new ServerRender();
		const camera = cam(c(-10, -20), 1.5);
		const cam_instance = new Camera(camera, {
			id: "retick-test",
			render,
		});

		// сначала меняем target и делаем один шаг
		cam_instance.mutate(cam(c(30, 40), 2));
		render.step(16.6667);
		// state ещё не равен target, mutate с тем же target добавляет тик
		cam_instance.mutate(cam(c(30, 40), 2));
		expect(render.__heap.has("retick-test")).toBe(true);
	});
});

describe("Camera.stop: отписка от Render", () => {
	test("stop удаляет id из кучи Render", () => {
		const render = new ServerRender();
		const camera = cam(c(-10, -20), 1.5);
		const cam_instance = new Camera(camera, {
			id: "stop-test",
			render,
		});

		cam_instance.mutate(cam(c(30, 40), 2));
		expect(render.__heap.has("stop-test")).toBe(true);

		cam_instance.stop();
		expect(render.__heap.has("stop-test")).toBe(false);
	});

	test("stop без render → no-op", () => {
		const camera = cam(c(-10, -20), 1.5);
		const cam_instance = new Camera(camera, { id: "stop-no-render" });
		// не должно падать
		cam_instance.stop();
	});
});
