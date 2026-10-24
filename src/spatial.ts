import { UB } from "./bounds.js";
import { Convex } from "./convex.js";
import { UC2 } from "./coords.js";
import { UG } from "./geom.js";
import { UPL } from "./polyline.js";
import type * as CT from "./types.js";

//...

interface SpatialItemBase {
	id: string;
	/**
	 * Виртуальный элемент: участвует **только** в хуках {@link SpatialView.onmount}/{@link SpatialView.onfrustum}.
	 * По нему нельзя попасть через {@link Spatial.query}/{@link Spatial.ray}/{@link Spatial.radial}, он не
	 * влияет на охватывающие `Bounds` индекса и не триггерит {@link Spatial.onrebound}.
	 */
	virtual?: boolean;
}

export interface SpatialPoint extends SpatialItemBase {
	point: CT.C2;
}

export interface SpatialBounds extends SpatialItemBase {
	bounds: CT.Bounds;
}

export interface SpatialConvex extends SpatialItemBase {
	convex: CT.Convex;
}

export interface SpatialPolyline extends SpatialItemBase {
	polyline: CT.Polyline;
}

/**
 * Элемент пространственного индекса: `id` (уникальный ключ) + геометрия одного из четырёх видов
 * (`point`/`bounds`/`convex`/`polyline`).
 *
 * Дискриминированное объединение; `id` используется как ключ в `Map` индекса и как токен для
 * {@link Spatial.query}/{@link Spatial.ray}/{@link Spatial.radial}/{@link SpatialView.items} (результаты запросов).
 * Извлечение «голой» геометрии — {@link Spatial.geom}; глубокая копия целиком — {@link Spatial.clone}.
 *
 * Опциональный флаг `virtual?: true` исключает элемент из всех user-facing запросов и из мирового охвата,
 * оставляя только участие в `onmount`/`onfrustum` вьюх — см. {@link SpatialPoint.virtual}.
 *
 * @see {@link SpatialPoint}, {@link SpatialBounds}, {@link SpatialConvex}, {@link SpatialPolyline} — варианты элемента.
 * @see {@link CT.Geom} — полиморфный API над геометрией без `id` (через {@link UG}).
 */
export type SpatialItem = SpatialPoint | SpatialBounds | SpatialConvex | SpatialPolyline;

const isVirtual = (item: SpatialItem): boolean => Object.hasOwn(item, "virtual") && Boolean(item.virtual);

/**
 * Опции {@link Spatial.query}.
 */
export interface SpatialQueryOpts {
	/**
	 * Вернуть в результате также `virtual` элементы (которые обычно пропускаются).
	 * По умолчанию `false` — `query` отдаёт только «реальные» (hit-target) элементы.
	 * Используется внутренне {@link SpatialView} для поиска виртуальных элементов в фрустуме.
	 */
	includeVirtual?: boolean;
}

//...

/**
 * Индекс объектов всего мира на основе **равномерного пространственного хэша** (uniform spatial hash grid).
 *
 * ## Почему именно грид (а не quadtree / R-tree / KD-tree)
 *
 * Профиль нагрузки диктует выбор структуры:
 * - **upsert/delete — сверхчастые.** У грида вставка/удаление это O(k) по числу задетых ячеек
 *   (для объекта 20×20 при `cell = 128` это ровно 1 ячейка), без ребалансировки. Quadtree/R-tree на таком потоке
 *   вставок/удалений постоянно бы делал split/merge узлов — на порядок дороже.
 * - **Объекты кучные: плотные скопления рядом с пустыми зонами.** Ячейки хранятся в {@link Spatial.__cells} как `Map`,
 *   создаются лениво — пустые зоны мира не стоят ни байта. Это ключевое отличие от плотного 2D-массива, который на
 *   разреженном мире взорвал бы память. При этом grid не «деградирует по глубине» на кластерах, как quadtree.
 * - **Очень частый маленький query (курсор ~20×20).** Такой запрос задевает 1–4 ячейки и перебирает только их содержимое,
 *   а не весь мир. Это и есть главная причина ухода от линейного скана O(n).
 *
 * ## Мультиячеечная вставка
 *
 * `id` кладётся в **каждую** ячейку, которую задевает AABB объекта (см. {@link Spatial.__insert}). Это делает `query`/`ray`
 * тривиально корректными (broad-phase = «собрать кандидатов из задетых ячеек», precise-phase = {@link UG.collision}),
 * ценой того, что крупный объект дублируется в нескольких ячейках. Объекты мелкие (типично 20×20, крайне редко >500×500),
 * поэтому дублирование почти всегда нулевое, а объект >500×500 при `cell = 128` осядет максимум в ~5×5 ячейках — терпимо.
 *
 * ## Выбор размера ячейки
 *
 * `cell` балансирует три величины (см. конструктор): число ячеек на вставку объекта, число кандидатов в маленьком query,
 * число ячеек на большой query (перекладка камеры {@link SpatialView.relocate}, экран ~1920×1080). Дефолт `128` — компромисс:
 * мелкий объект = 1 ячейка, курсор 20×20 = ≤4 ячейки, экран = ~15×9 ячеек.
 *
 * Охватывающий мир {@link Spatial.bounds} и подписки на его изменение ({@link Spatial.onrebound}) считаются инкрементально/лениво —
 * мир нужен редко, поэтому здесь дешевизна per-op не критична (см. `__dirty`/`__recompute`).
 * Слайсы ({@link SpatialView}) обновляются точечными хуками `__upsert`/`__delete`, независимо от грида.
 */
function assertIterableRange(range: CT.Bounds): boolean {
	if (range.minX > range.maxX || range.minY > range.maxY) return false;
	if (![range.minX, range.minY, range.maxX, range.maxY].every(Number.isSafeInteger)) {
		throw new RangeError("Spatial cell range must use safe finite integer indices");
	}
	return true;
}

export class Spatial {
	/** Индекс: `id` → элемент. Хранится как `Map` для O(1) `get`/`set`/`delete` по `id`; источник истины для геометрии (грид хранит лишь `id`). */
	__index = new Map<string, SpatialItem>();

	/** Число не-виртуальных элементов. Отличает пустой real-world от легального real bounds в origin без O(n)-скана индекса. */
	__real = 0;

	/**
	 * Разреженная сетка: ключ ячейки ({@link Spatial.__key}) → множество `id`, чьи AABB задевают ячейку.
	 *
	 * Ленивая: ячейка появляется только когда в неё попадает объект, и удаляется как только пустеет (см. {@link Spatial.__remove}).
	 * Благодаря этому пустые зоны мира не занимают памяти, а плотные кластеры не создают лишних уровней (в отличие от quadtree).
	 */
	__cells = new Map<number, Set<string>>();

	/**
	 * Ребро ячейки грида в мировых единицах. Задаётся один раз в конструкторе — менять на лету нельзя (потребовал бы полной переиндексации).
	 *
	 * @see конструктор — обоснование дефолта и как подбирать под свою плотность/размер объектов.
	 */
	__cell: number;

	/** Активные вьюхи-подписки. Каждая получает `__upsert`/`__delete` от родителя. */
	__slices = new Set<SpatialView>();

	/**
	 * @param cell - ребро ячейки грида (мировые единицы).
	 * Правило подбора: держите `cell` близким к типичному размеру объекта (~20–128).
	 * Слишком мелкий `cell` → мелкий объект размазывается по многим ячейкам и большой query перебирает тысячи ячеек;
	 * слишком крупный → маленький query тащит десятки лишних кандидатов из одной раздутой ячейки.
	 * Дефолт `128` рассчитан на объекты 20×20…500×500 и экранный фрустум ~1920×1080.
	 */
	constructor(cell: number = 128) {
		if (!Number.isFinite(cell) || cell <= 0) throw new RangeError("Spatial cell size must be finite and positive");
		this.__cell = cell;
	}

	//...

	/** Охватывающие `Bounds` всех не-виртуальных элементов индекса. Лениво пересчитывается, см. геттер. */
	__bounds = UB.zero();

	/** Маркер «`__bounds` мог рассинхронизироваться с `__index`» — нужен полный recompute. */
	__dirty = false;

	/**
	 * Геттер охватывающих `Bounds` всех не-виртуальных элементов индекса. Лениво пересчитывается после пометки `__dirty`.
	 *
	 * При `__dirty === true` сначала вызывает {@link Spatial.__recompute} (сбрасывает флаг, обходит `__index` целиком, вызывает подписчиков если охват изменился).
	 * Это компромисс: большинство операций (`upsert`) обновляют охват инкрементально за O(1) и не трогают `__dirty`;
	 * `delete` помечает `__dirty` если удалённый элемент лежал внутри (точное схлопывание неизвестно).
	 * Размер мира нужен редко, поэтому полный O(n)-recompute здесь допустим — он не на горячем пути.
	 */
	get bounds(): CT.Bounds {
		if (this.__dirty) this.__recompute();
		return this.__bounds;
	}

	/**
	 * Полный recompute охватывающих `Bounds` от не-`virtual` элементов индекса.
	 *
	 * Используется когда `__dirty === true` (после `delete` от внутреннего элемента — точное схлопывание неизвестно).
	 * Возвращает `true` если охват изменился (для подписчиков).
	 * При отсутствии не-`virtual` элементов (пустой индекс или только `virtual`) сбрасывает `__bounds` в `zero()`
	 * и уведомляет подписчиков. `virtual` элементы пропускаются — охват описывает «реальный» мир.
	 */
	__recompute(): boolean {
		this.__dirty = false;
		const acc: CT.Bounds = UB.infinity();
		let pushed = false;
		for (const item of this.__index.values()) {
			if (isVirtual(item)) continue;
			UG.push(acc, Spatial.geom(item));
			pushed = true;
		}
		if (!pushed) {
			if (!UB.eq(this.__bounds)) {
				UB.assign(this.__bounds);
				return true;
			}
			return false;
		}
		if (!UB.eq(this.__bounds, acc)) {
			UB.assign(this.__bounds, acc);
			return true;
		}
		return false;
	}

	//...

	/** Подписчики на изменение `bounds` (см. {@link Spatial.onrebound}). */
	__subs = new Set<(spatial: Spatial) => void>();

	/**
	 * **Мутирует** `__bounds` через `acc` и уведомляет подписчиков.
	 *
	 * Используется в `upsert` для атомарной фиксации нового охвата: сбрасывает `__dirty`,
	 * проверяет изменение через `UB.eq` (чтобы не дёргать подписчиков на идентичных значениях), затем итерирует `__subs`.
	 */
	__assign(acc: CT.Bounds): void {
		this.__dirty = false;
		if (!UB.eq(this.__bounds, acc)) {
			UB.assign(this.__bounds, acc);
			for (const sub of this.__subs) sub(this);
		}
	}

	/**
	 * Уведомить подписчиков без обновления `__bounds`.
	 *
	 * При отсутствии real-items сбрасывает `__bounds` в `zero()` через {@link Spatial.__assign} (триггерит подписчиков если было не `zero()`).
	 * Иначе просто итерирует `__subs` — `__bounds` уже корректен.
	 * Используется в ветках, где `__bounds` гарантированно не меняется (например, `delete` с `__dirty` уже выставленным).
	 */
	__notify(): void {
		if (this.__real === 0) this.__assign(UB.zero());
		else for (const sub of this.__subs) sub(this);
	}

	/**
	 * Подписаться на изменение охватывающих `Bounds` индекса.
	 *
	 * Колбэк вызывается в {@link Spatial.__assign} (после `upsert` с новым охватом) и в {@link Spatial.__notify}
	 * (в грязных ветках, где охват уже корректен). Возвращает функцию отписки.
	 * Не вызывается при `delete` если охват не изменился и при `clear` (см. JSDoc `clear`).
	 */
	onrebound(call: (spatial: Spatial) => void): () => boolean {
		this.__subs.add(call);
		return () => this.__subs.delete(call);
	}

	//...

	/**
	 * Ключ ячейки грида: упаковка целочисленных индексов ячейки `(cx, cy)` в одно число.
	 *
	 * Число (а не строка `"cx:cy"`) выбрано намеренно: `Map<number, …>` не тратит время на конкатенацию/хэш строки на каждом
	 * `query`/`upsert` (а это горячий путь), и число дешевле для GC. Каждая ось маскируется до 26 бит и складывается в одно
	 * безопасное целое (`< 2^53`): это уникально для `|cx|, |cy| < 2^25` ячеек (≈ ±4.3 млрд мировых единиц при `cell = 128`) —
	 * заведомо больше любого реального мира. Отрицательные индексы поддержаны через two's-complement обрезание.
	 */
	__key(cx: number, cy: number): number {
		return (cx & 0x3ffffff) * 0x4000000 + (cy & 0x3ffffff);
	}

	/**
	 * Зарегистрировать `id` во всех ячейках грида, которые задевает AABB `box`.
	 *
	 * `box` — это уже охватывающий {@link CT.Bounds} геометрии (см. {@link UG.bound} от {@link Spatial.geom}); диапазон ячеек берётся через
	 * {@link UB.index} (`floor(min/cell)…floor(max/cell)`), что даёт **консервативное** покрытие: включается любая ячейка,
	 * которой AABB хотя бы касается. Ложные попадания на границах отсекаются позже точной проверкой в query/ray.
	 * Ячейки создаются лениво.
	 */
	__insert(id: string, box: CT.Bounds): void {
		this.__insertRange(id, UB.index(box, this.__cell));
	}

	/**
	 * Зарегистрировать `id` в ячейках грида по **предпосчитанному** диапазону `r` (результат {@link UB.index}).
	 *
	 * Горячая внутренняя версия {@link Spatial.__insert} без повторного `floor`: диапазон уже известен
	 * (например, вычислен в `upsert` для equality-short-circuit), поэтому `UB.index` не пересчитывается.
	 * Ячейки создаются лениво.
	 */
	__insertRange(id: string, r: CT.Bounds): void {
		if (!assertIterableRange(r)) return;
		for (let cx = r.minX; cx <= r.maxX; cx++) {
			for (let cy = r.minY; cy <= r.maxY; cy++) {
				const key = this.__key(cx, cy);
				let cell = this.__cells.get(key);
				if (!cell) {
					cell = new Set<string>();
					this.__cells.set(key, cell);
				}
				cell.add(id);
			}
		}
	}

	/**
	 * Снять `id` со всех ячеек, которые задевал AABB `box` (тот же диапазон, что и при {@link Spatial.__insert}).
	 *
	 * Опустевшие ячейки удаляются из {@link Spatial.__cells} — иначе после массовых delete грид зарос бы пустыми `Set`,
	 * и большой query платил бы за обход мёртвых ячеек. `box` обязан совпадать с тем, что использовался при вставке
	 * (поэтому `delete`/`upsert` берут его из **сохранённой** в индексе геометрии, а не из аргумента).
	 */
	__remove(id: string, box: CT.Bounds): void {
		this.__removeRange(id, UB.index(box, this.__cell));
	}

	/**
	 * Снять `id` с ячеек по **предпосчитанному** диапазону `r`. Парная к {@link Spatial.__insertRange}.
	 *
	 * Опустевшие ячейки удаляются из {@link Spatial.__cells}. Используется в `upsert`/`delete` с уже известным диапазоном.
	 */
	__removeRange(id: string, r: CT.Bounds): void {
		if (!assertIterableRange(r)) return;
		for (let cx = r.minX; cx <= r.maxX; cx++) {
			for (let cy = r.minY; cy <= r.maxY; cy++) {
				const key = this.__key(cx, cy);
				const cell = this.__cells.get(key);
				if (!cell) continue;
				cell.delete(id);
				if (cell.size === 0) this.__cells.delete(key);
			}
		}
	}

	/** Атомарно сохранить clone элемента и обновить счётчик real-items относительно предыдущего состояния. */
	__store(item: SpatialItem, prev?: SpatialItem): SpatialItem {
		if (prev && !isVirtual(prev)) this.__real--;
		if (!isVirtual(item)) this.__real++;
		const clone = Spatial.clone(item);
		this.__index.set(item.id, clone);
		return clone;
	}

	//...

	/**
	 * Вставить или обновить элементы (upsert по `id`). Для каждого `id`:
	 *
	 * - **новый** — регистрируется в гриде и индексе, охват расширяется инкрементально;
	 * - **существующий** — старые ячейки грида снимаются по **прежней** геометрии, новые ставятся по новой
	 *
	 * ## Equality short-circuit (макс. перф на горячем пути)
	 *
	 * For an existing `id`, compare quantized cell ranges exactly before applying tolerant AABB equality.
	 * Equal ranges reuse the existing buckets; even an epsilon-close move can cross a cell boundary.
	 * `UB.eq(prev_box, new_box)` with an unchanged virtual role still avoids unnecessary world-bound
	 * invalidation. Stored geometry and slices are updated in either case.
	 *
	 * Если старые `bounds` лежали внутри (`UB.interior`) и AABB изменился — маркирует `__dirty` (точное схлопывание
	 * охвата неизвестно). Новые выступающие расширяют аккумулятор охвата. Каждый `slice` получает `__upsert`.
	 *
	 * ## Виртуальные элементы (`virtual?: true`)
	 *
	 * Кладутся в грид и `__index` наравне с обычными (нужны вьюхам для `onmount`/`onfrustum` через slice.__upsert),
	 * но **исключаются** из мирового охвата:
	 * - в empty-ветке `UB.mix` не вызывается, `__assign` пропускается если все элементы виртуальные;
	 * - в normal-ветке interior-проверка использует `prev.virtual` (prev не был в `__bounds` ⇒ не нужно `__dirty`),
	 *   а `acc` расширяется только для не-виртуальных.
	 * Грид-операции (`__insert`/`__remove`) и slice-уведомления выполняются как для обычных.
	 * Смена роли существующего `id` (`real ↔ virtual`) инвалидирует мировой охват даже при неизменном AABB.
	 * Повторяющиеся `id` в одном вызове нормализуются по last-write-wins до изменения грида, охвата и вьюх.
	 *
	 * @remarks Это единственный write-метод: `delete` снимает элементы, `upsert` — вставляет/обновляет.
	 */
	upsert(...items: SpatialItem[]): void {
		if (items.length === 0) return;
		const batch = items.length === 1 ? items : [...new Map(items.map((item) => [item.id, item] as const)).values()];
		for (const item of batch) assertIterableRange(UB.index(UG.bound(Spatial.geom(item)), this.__cell));

		// Пустой индекс: world-охват строится с нуля от не-`virtual` элементов. `this.__bounds` в этом состоянии = `zero()`
		// (точка в origin), и union с ним загрязнил бы охват — поэтому аккумулятор стартует от `infinity`.
		// Если все элементы виртуальные — `__assign` пропускается, `__bounds` остаётся `zero()`.
		if (this.__index.size === 0) {
			const acc: CT.Bounds = UB.infinity();
			let mixed = false;
			for (const item of batch) {
				const new_box = UG.bound(Spatial.geom(item));
				this.__insertRange(item.id, UB.index(new_box, this.__cell));
				const clone = this.__store(item);
				if (!isVirtual(item)) {
					UB.mix(acc, new_box);
					mixed = true;
				}
				for (const sub of this.__slices) sub.__upsert(clone);
			}
			if (mixed) this.__assign(acc);
			return;
		}

		if (this.__dirty) {
			let touched_real = false;
			for (const item of batch) {
				const new_box = UG.bound(Spatial.geom(item));
				const prev = this.__index.get(item.id);
				if (!isVirtual(item) || (prev && !isVirtual(prev))) touched_real = true;
				if (prev) {
					const prev_box = UG.bound(Spatial.geom(prev));
					const prev_r = UB.index(prev_box, this.__cell);
					const new_r = UB.index(new_box, this.__cell);
					if (prev_r.minX !== new_r.minX || prev_r.minY !== new_r.minY || prev_r.maxX !== new_r.maxX || prev_r.maxY !== new_r.maxY) {
						this.__removeRange(item.id, prev_r);
						this.__insertRange(item.id, new_r);
					}
				} else {
					this.__insertRange(item.id, UB.index(new_box, this.__cell));
				}
				const clone = this.__store(item, prev);
				for (const sub of this.__slices) sub.__upsert(clone);
			}
			if (touched_real) this.__notify();
			return;
		}

		let dirty = false;
		let acc: CT.Bounds | null = null;

		for (const item of batch) {
			const new_box = UG.bound(Spatial.geom(item));
			const prev = this.__index.get(item.id);
			const had_real = this.__real > 0;
			if (prev) {
				const prev_box = UG.bound(Spatial.geom(prev));
				if (isVirtual(prev) !== isVirtual(item)) dirty = true;
				const prev_r = UB.index(prev_box, this.__cell);
				const new_r = UB.index(new_box, this.__cell);
				if (prev_r.minX !== new_r.minX || prev_r.minY !== new_r.minY || prev_r.maxX !== new_r.maxX || prev_r.maxY !== new_r.maxY) {
					this.__removeRange(item.id, prev_r);
					this.__insertRange(item.id, new_r);
				}
				if (!UB.eq(prev_box, new_box)) {
					// `prev.virtual` ⇒ его бокса не было в `__bounds`, схлопывание охвата не грозит — `__dirty` не нужен.
					if (!isVirtual(prev) && UB.interior(this.__bounds, prev_box)) dirty = true;
				}
			} else {
				this.__insertRange(item.id, UB.index(new_box, this.__cell));
			}
			const clone = this.__store(item, prev);
			// Виртуальные элементы не участвуют в охвате мира — пропускаем расширение `acc`.
			if (!isVirtual(item) && !dirty) {
				const base = acc ?? (had_real ? this.__bounds : null);
				if (!base) acc = UB.copy(new_box);
				else if (!UB.contain(base, new_box)) acc = UB.union(base, new_box);
			}
			for (const sub of this.__slices) sub.__upsert(clone);
		}

		if (dirty) {
			this.__dirty = true;
			this.__notify();
			return;
		}

		if (acc) this.__assign(acc);
	}

	/**
	 * Удалить элементы по `id`. Каждый снимается с грида по **сохранённой** геометрии ({@link Spatial.__remove}).
	 * Если удалённый элемент лежал **внутри** текущих границ (`interior`), маркирует `__dirty` — точные границы будут
	 * пересчитаны при следующем обращении к геттеру {@link Spatial.bounds}.
	 *
	 * Для `virtual` элементов interior-проверка и `__notify` пропускаются: их бокса не было в `__bounds`, схлопывание
	 * охвата невозможно, и подписчики на `onrebound`/`bounds` не должны реагировать на чисто-`virtual` удаления.
	 * Каждый слайс всё равно получает `__delete` для корректной очистки `items` (виртуальные элементы в нём могут быть).
	 */
	delete(...ids: string[]): void {
		if (ids.length === 0 || this.__index.size === 0) return;

		if (this.__dirty) {
			let deleted_non_virtual = false;
			for (const id of ids) {
				for (const sub of this.__slices) sub.__delete(id);
				const deleted = this.__index.get(id);
				if (!deleted) continue;
				this.__remove(id, UG.bound(Spatial.geom(deleted)));
				this.__index.delete(id);
				if (!isVirtual(deleted)) {
					this.__real--;
					deleted_non_virtual = true;
				}
			}
			// Пропускаем `__notify`, если удалили только `virtual` элементы: охват и так не мог
			// измениться (он уже грязный и пересчитается лениво), а `virtual` на `bounds`/`onrebound`
			// не влияют.
			if (deleted_non_virtual) this.__notify();
			return;
		}

		let dirty = false;
		let deleted_non_virtual = false;
		for (const id of ids) {
			for (const sub of this.__slices) sub.__delete(id);
			const deleted = this.__index.get(id);
			if (!deleted) continue;
			const box = UG.bound(Spatial.geom(deleted));
			this.__remove(id, box);
			this.__index.delete(id);
			// `deleted.virtual` ⇒ его бокса не было в `__bounds`, помечать `__dirty` не нужно.
			if (!isVirtual(deleted)) {
				this.__real--;
				deleted_non_virtual = true;
				if (UB.interior(this.__bounds, box)) dirty = true;
			}
		}
		if (dirty) this.__dirty = true;

		// Только реальные удаления могут повлиять на охват (или на пустой индекс для `__assign(zero)`).
		// Чисто-`virtual` удаление не меняет `__bounds` и не должно будить `onrebound`.
		if (deleted_non_virtual) this.__notify();
	}

	//...

	/**
	 * Диапазон ячеек грида, покрывающий AABB `box`, с обходом кандидатов через `visit`.
	 *
	 * Общий broad-phase для {@link Spatial.query}/{@link Spatial.ray}/{@link Spatial.radial}: перебирает ячейки в диапазоне
	 * и отдаёт наружу каждый `id`. Дедупликацию (объект в нескольких ячейках) и точную фазу делает вызывающий —
	 * это позволяет query копить `Set`, а radial — `Map` с расстояниями, не плодя промежуточных коллекций кандидатов.
	 * With `padding`, include epsilon-neighbor cells without changing stored AABBs or the precise predicate.
	 * Empty/unsafe original ranges are checked before expansion; unusually fine grids fall back to the finite index
	 * rather than walking an epsilon-sized region containing arbitrarily many empty cells.
	 */
	__scan(box: CT.Bounds, visit: (id: string) => void, padding = 0): void {
		if (box.minX > box.maxX || box.minY > box.maxY) return;
		let r = UB.index(box, this.__cell);
		if (!assertIterableRange(r)) return;
		if (padding > 0) {
			r = UB.index({ minX: box.minX - padding, minY: box.minY - padding, maxX: box.maxX + padding, maxY: box.maxY + padding }, this.__cell);
			// Expansion can exceed even safe cell indices for a valid, extremely small cell size.
			// The original range is already validated; scan the finite index rather than that empty space.
			if (![r.minX, r.minY, r.maxX, r.maxY].every(Number.isSafeInteger)
				|| (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1) > Math.max(9, this.__index.size)) {
				for (const id of this.__index.keys()) visit(id);
				return;
			}
		}
		for (let cx = r.minX; cx <= r.maxX; cx++) {
			for (let cy = r.minY; cy <= r.maxY; cy++) {
				const cell = this.__cells.get(this.__key(cx, cy));
				if (!cell) continue;
				for (const id of cell) visit(id);
			}
		}
	}

	/**
	 * Найти все `id`, чья геометрия имеет общую значащую точку с `geom` (канон владения).
	 *
	 * Broad-phase: scan the AABB of `geom` expanded by {@link UG.__eps} per axis. Coordinate equality in
	 * `UG.collision` is inclusive within that tolerance, even across cell boundaries. Stored AABBs stay exact;
	 * ordinary queries remain grid-local, with a finite index fallback when scanning cells would cost more.
	 * Precise-phase: {@link UG.collision}. Объект, задевающий несколько ячеек, проверяется точной коллизией не более одного
	 * раза (короткое замыкание через `acc.has`).
	 *
	 * Элементы с `virtual: true` пропускаются в precise-фазе — по ним нельзя попасть через `query`.
	 * Исключение: `opts.includeVirtual: true` — внутренняя опция для {@link SpatialView}, чтобы вьюха
	 * находила виртуальные элементы в своём фрустуме и получала по ним `onmount`/`onfrustum`.
	 *
	 * @remarks
	 * **Намеренно не использует геттер {@link Spatial.bounds} как quick-reject.** Тот при `__dirty` (его ставит частый `delete`)
	 * запускает полный O(n)-`__recompute` всего мира — на сверхчастом query это дороже самого запроса. Грид и так локализует:
	 * запрос вне заполненных ячеек просто не найдёт ни одной ячейки (несколько `Map.get`) и вернёт пусто. Реальное исполнение
	 * здесь дешевле, чем «сначала посчитать охват мира».
	 */
	query(geom: CT.Geom, opts: SpatialQueryOpts = {}): Set<string> {
		const includeVirtual = opts.includeVirtual ?? false;
		const acc = new Set<string>();
		if (this.__index.size === 0) return acc;
		this.__scan(UG.bound(geom), (id) => {
			if (acc.has(id)) return;
			const item = this.__index.get(id);
			if (!item) return;
			if (!includeVirtual && isVirtual(item)) return;
			if (UG.collision(Spatial.geom(item), geom)) acc.add(id);
		}, UG.__eps);
		return acc;
	}

	/**
	 * Найти все `id`, чья геометрия **владеет** точкой `p` (строго внутри по канону).
	 *
	 * Broad-phase includes the cells touched by `p ± UG.__eps`, matching tolerant point/degenerate ownership.
	 * Away from a cell boundary this still visits one cell; exact {@link UG.has} rejects false candidates.
	 *
	 * Элементы с `virtual: true` всегда пропускаются — по ним нельзя попасть через `ray`.
	 *
	 * @remarks
	 * Как и {@link Spatial.query}, **не** трогает геттер {@link Spatial.bounds}: quick-reject по охвату мира спровоцировал бы
	 * ленивый `__recompute` на каждом промахе курсора. Пустые соседние ячейки отсекают мимо-клик без пересчёта мира.
	 */
	ray(p: CT.C2): Set<string> {
		const acc = new Set<string>();
		if (this.__index.size === 0) return acc;
		this.__scan(UB.zero(p.x, p.y), (id) => {
			if (acc.has(id)) return;
			const item = this.__index.get(id);
			if (item && !isVirtual(item) && UG.has(Spatial.geom(item), p)) acc.add(id);
		}, UG.__eps);
		return acc;
	}

	/**
	 * Ближайшие к точке `p` объекты в радиусе `radius` и расстояния до них: `Map<id, distance>`.
	 *
	 * Лучевой/радиальный поиск «во все стороны в плоскости» — для подсветки соседей, притягивания, поиска ближайшего.
	 * Broad-phase — ячейки, задетые AABB диска `[p ± radius]` ({@link Spatial.__scan}); precise-phase — расстояние от `p`
	 * до объекта. `distance === 0` означает, что `p` внутри объекта (такие тоже попадают в результат).
	 *
	 * Элементы с `virtual: true` пропускаются — по ним нельзя попасть через `radial`.
	 *
	 * @remarks
	 * Расстояние меряется до **AABB** объекта ({@link UG.bound} + {@link UB.nearest}), не до точной грани `Convex`:
	 * для мелких объектов погрешность в пределах их же размера, а стоимость на порядок ниже, чем честный
	 * distance-to-polygon. Для `Bounds`-объектов результат точный. Итерируйте `Map` и при желании сортируйте по значению —
	 * порядок вставки не гарантирует возрастание расстояния.
	 *
	 * @returns Пустой `Map` при `radius < 0` или пустом индексе.
	 */
	radial(p: CT.C2, radius: number): Map<string, number> {
		const acc = new Map<string, number>();
		if (this.__index.size === 0 || radius < 0) return acc;
		const box: CT.Bounds = { minX: p.x - radius, minY: p.y - radius, maxX: p.x + radius, maxY: p.y + radius };
		this.__scan(box, (id) => {
			if (acc.has(id)) return;
			const item = this.__index.get(id);
			if (!item || isVirtual(item)) return;
			const near = UB.nearest(UG.bound(Spatial.geom(item)), p);
			const dist = UC2.dist(p, near);
			if (dist <= radius) acc.set(id, dist);
		});
		return acc;
	}

	//...

	/**
	 * Создать подписку-вьюху на `geom`: `items` автоматически обновляются при
	 * `upsert`/`delete` в родительском `Spatial`. Вьюха — кэш фрустума:
	 * хранит только `id`, чья геометрия пересекает `geom` вьюхи.
	 */
	slice(geom: CT.Geom, hooks: SpatialViewHooks = {}): SpatialView {
		return new SpatialView(this, geom, hooks);
	}

	/**
	 * Горячая замена объекта по `id`: для каждого `slice` выполняет `onfrustum(id)` →
	 * `inject()` → `onmount(id)`. **Не** проверяет геометрию — `inject` сам решает,
	 * что и как заменить. Предназначен для атомарной подмены данных под `id`.
	 */
	invalidate(id: string, inject: () => void): void {
		for (const sub of this.__slices) sub.__invalidate(id, inject);
	}

	/**
	 * Полностью сбросить индекс: очищает грид, индекс, слайсы и подписчиков.
	 * `onrebound` не вызывается.
	 */
	destroy(): void {
		for (const sub of this.__slices) sub.destroy();
		this.__slices.clear();
		this.__subs.clear();
		this.__index.clear();
		this.__real = 0;
		this.__cells.clear();
		UB.assign(this.__bounds);
		this.__dirty = false;
	}

	//...

	/**
	 * Извлечь «голую» геометрию из вариантного {@link SpatialItem}: `point`/`bounds`/`convex` по структурному признаку.
	 *
	 * Возвращает {@link CT.Geom}, передаваемый в полиморфные методы {@link UG} (`UG.bound`/`UG.has`/`UG.collision`/…).
	 * Внутри `upsert`/`delete`/`query`/`radial` именно так геометрия достаётся из элемента индекса.
	 */
	static geom(item: SpatialItem): CT.Geom {
		if ("point" in item) return item.point;
		if ("bounds" in item) return item.bounds;
		if ("convex" in item) return item.convex;
		return item.polyline;
	}

	/**
	 * Глубокая копия {@link SpatialItem} целиком (с копией геометрии), сохраняющая вариант и флаг `virtual`.
	 *
	 * Используется в `upsert` для помещения в {@link Spatial.__index}: внешние мутации исходного `item`
	 * (или его геометрии) не должны влиять на сохранённые в индексе данные. Геометрия копируется через {@link UG.copy}.
	 * Если ключ `virtual` присутствует во входе, он сохраняется вместе со значением; отсутствующий optional key не
	 * материализуется, чтобы не менять shape входных объектов (`Object.keys` / `"virtual" in item`).
	 */
	static clone(item: SpatialItem): SpatialItem {
		const virtual = Object.hasOwn(item, "virtual") ? { virtual: item.virtual } : {};
		if ("point" in item) return { id: item.id, point: UC2.copy(item.point), ...virtual };
		if ("bounds" in item) return { id: item.id, bounds: UB.copy(item.bounds), ...virtual };
		if ("convex" in item) return { id: item.id, convex: Convex.copy(item.convex), ...virtual };
		return { id: item.id, polyline: UPL.copy(item.polyline), ...virtual };
	}
}

//...

/**
 * Хуки вьюхи пространственного индекса: уведомления о входе/выходе элементов из фрустума.
 *
 * `onmount(id)` — элемент с этим `id` теперь пересекает `view.geom` (появился в фрустуме или вьюха создана и элемент уже был).
 * `onfrustum(id)` — элемент больше не пересекает (удалился из индекса, вышел за фрустум, или был заменён через {@link Spatial.invalidate}).
 *
 * Используются в UI для монтажа/размонтажа тяжёлых компонентов (DOM-ноды, подписки).
 * Допустима неточность **в большую сторону** (ранний `onmount`/поздний `onfrustum`): что реально видно — обязано было пройти `onmount`.
 */
export interface SpatialViewHooks {
	onmount?: (id: string) => void;
	onfrustum?: (id: string) => void;
}

/**
 * Экран в мир: подписка на область {@link Spatial} с автоматическим трекингом «что вошло/вышло из кадра».
 *
 * Держит {@link SpatialView.items} — множество `id`, пересекающих фрустум — и точечно поддерживает его через хуки
 * `__upsert`/`__delete` от родителя (O(1) на изменение, без пере-`query`). Сами `query`/`ray`/`radial` вьюхи
 * делегируют в грид-ускоренный {@link Spatial}: раз уж родитель локализует запрос по ячейкам, отдельный скан по `items`
 * (который на полном экране мог бы стоить сотни проверок) больше не нужен и был бы медленнее на частом курсорном query.
 *
 * В `items` входят и `virtual` элементы в фрустуме — по ним триггерятся `onmount`/`onfrustum` (единственная роль
 * `virtual`). User-facing методы вьюхи (`query`/`ray`/`radial`) их не возвращают — делегируют без `includeVirtual`.
 */
class SpatialView {
	__spatial: Spatial;
	__hooks: SpatialViewHooks;

	/** Текущая геометрия подписки (фрустум). Меняется через {@link SpatialView.relocate}. Хранится защитной копией. */
	geom: CT.Geom;

	/** Closed contour of {@link SpatialView.geom}; membership uses the original geometry to preserve ownership. */
	__convex: CT.Convex;

	/**
	 * Текущий набор id, чья геометрия пересекается с {@link SpatialView.geom}.
	 * Обновляется автоматически при изменениях в {@link Spatial}.
	 */
	items: Set<string> = new Set<string>();

	/**
	 * Attach the view to `spatial`, cache its contour, and initialize `items` with a query including virtual items.
	 *
	 * Для каждого id, попавшего в начальный фрустум, вызывается `onmount` — это позволяет UI сразу отрисовать уже видимые
	 * элементы без ожидания первой `upsert` в индексе. `virtual` элементы также включены — они должны монтироваться
	 * как обычные (согласно контракту «virtual участвует только в onmount/onfrustum»).
	 *
	 * @param spatial - родительский индекс, за обновлениями которого вьюха следит.
	 * @param geom - начальная геометрия фрустума ({@link CT.Geom}). Изменяется через {@link SpatialView.relocate}.
	 * @param hooks - см. {@link SpatialViewHooks}.
	 */
	constructor(spatial: Spatial, geom: CT.Geom, hooks: SpatialViewHooks) {
		this.__spatial = spatial;
		this.__hooks = hooks;
		this.geom = UG.copy(geom);
		this.__convex = UG.convex(geom);
		// `includeVirtual: true` — вьюха обязана видеть и виртуальные элементы в фрустуме, иначе они никогда
		// не получат `onmount`/`onfrustum` (public `query`/`ray`/`radial` их фильтруют).
		for (const id of spatial.query(geom, { includeVirtual: true })) {
			this.items.add(id);
			this.__hooks.onmount?.(id);
		}
		spatial.__slices.add(this);
	}

	/**
	 * Пересчитать `items` под `geom` (перекладка камеры). Использует грид-ускоренный {@link Spatial.query},
	 * поэтому стоимость пропорциональна площади AABB нового фрустума в ячейках, а не размеру мира.
	 *
	 * Для каждого id, который появился — `onmount(id)`, для каждого, который исчез — `onfrustum(id)`.
	 * После возврата `geom` и `items` обновлены (`geom` хранит защитную копию через {@link UG.copy}).
	 *
	 * Запрос включает `virtual` элементы ({@link SpatialQueryOpts.includeVirtual}) — вьюха должна
	 * получать хуки и для них.
	 *
	 * @remarks
	 * Идемпотентен, если между вызовами в {@link Spatial} не было изменений:
	 * повторный `relocate` с эквивалентным результатом хуки не вызывает.
	 */
	relocate(geom: CT.Geom): void {
		const new_items = this.__spatial.query(geom, { includeVirtual: true });
		for (const id of new_items)
			if (!this.items.has(id)) {
				this.__hooks.onmount?.(id);
			}
		for (const id of this.items)
			if (!new_items.has(id)) {
				this.__hooks.onfrustum?.(id);
			}
		this.geom = UG.copy(geom);
		this.__convex = UG.convex(geom);
		this.items = new_items;
	}

	//...

	/**
	 * Обработчик `delete` от родительского `Spatial`: если удалённый id был в `items` — удаляет и триггерит `onfrustum`.
	 *
	 * `Set.delete` возвращает `true` если элемент был — это позволяет условно триггерить хук без дополнительной проверки `items.has`.
	 */
	__delete(id: string): void {
		if (this.items.delete(id)) {
			this.__hooks.onfrustum?.(id);
		}
	}

	/**
	 * Handle an upsert against the owned query geometry, calling `onmount` or `onfrustum` when membership changes.
	 *
	 * Если элемент и до и после в/вне фрустума — хуки не вызываются (избегаем шума на «движущихся в фрустуме» элементах, чья геометрия обновляется каждый кадр).
	 */
	__upsert(item: SpatialItem): void {
		const was_in = this.items.has(item.id);
		const is_in_after = UG.collision(Spatial.geom(item), this.geom);
		if (was_in && !is_in_after) {
			this.items.delete(item.id);
			this.__hooks.onfrustum?.(item.id);
		} else if (!was_in && is_in_after) {
			this.items.add(item.id);
			this.__hooks.onmount?.(item.id);
		}
	}

	/**
	 * Обработчик `invalidate` от родительского `Spatial`: атомарная замена объекта под `id` через `inject` (если он был в items).
	 *
	 * Последовательность: `onfrustum(id)` → `inject()` (сам объект подменяет данные) → `onmount(id)`.
	 * Если id не было в items — no-op (элемент вне фрустума, нет смысла дёргать).
	 */
	__invalidate(id: string, inject: () => void): void {
		const existed = this.items.has(id);
		if (existed) {
			this.items.delete(id);
			this.__hooks.onfrustum?.(id);
			inject();
			this.items.add(id);
			this.__hooks.onmount?.(id);
		}
	}

	//...

	/**
	 * Поиск по геометрии во вьюхе. Делегирует в грид-ускоренный {@link Spatial.query} (без `includeVirtual`,
	 * поэтому виртуальные элементы не возвращаются — согласуется с поведением public query).
	 *
	 * Специальный проход по `items` больше не нужен: грид локализует запрос по ячейкам сам, а `items` на полном экране
	 * могут содержать сотни id — скан по ним был бы дороже. Делегирование заодно корректно обрабатывает курсор,
	 * выехавший за фрустум (объект под ним может быть вне `items`, но грид его найдёт).
	 */
	query(geom: CT.Geom): Set<string> {
		return this.__spatial.query(geom);
	}

	/**
	 * Поиск точки `p` во вьюхе. Делегирует в грид-ускоренный {@link Spatial.ray} (соседние ячейки с учётом epsilon) —
	 * это дешевле любого прохода по `items` и не промахивается по объекту под курсором, вышедшим за фрустум.
	 * Виртуальные элементы не возвращаются.
	 */
	ray(p: CT.C2): Set<string> {
		return this.__spatial.ray(p);
	}

	/**
	 * Радиальный поиск соседей вокруг `p` в радиусе `radius`. Делегирует в {@link Spatial.radial} — см. его JSDoc
	 * о семантике расстояний и AABB-приближении для `Convex`. Виртуальные элементы не возвращаются.
	 */
	radial(p: CT.C2, radius: number): Map<string, number> {
		return this.__spatial.radial(p, radius);
	}

	//...

	/**
	 * Отписаться от {@link Spatial} и очистить `items`.
	 *
	 * **вызывает** `onfrustum` для всех оставшихся в `items` id.
	 * После `destroy` объект использовать нельзя
	 */
	destroy(): void {
		for (const id of this.items) this.__hooks.onfrustum?.(id);
		this.items.clear();
		this.__spatial.__slices.delete(this);
	}
}

export type { SpatialView };
