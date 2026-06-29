import {Bucket, OrderedBucket} from "./miniplex-bucket.js";

//import { id } from "./hmans-id.esm.js";
const entityToId = new WeakMap();
let nextId = 0;
function id(object) {
	const id = entityToId.get(object);
	if (id !== undefined) return id;
	entityToId.set(object, nextId);
	return nextId++;
}
//

/**
 * @template T
 */
export class World {
	#bucket;
	/** @type {Set<Query<T>>} */
	#queries = new Set();
	/** @type {Map<T, number>} */
	#entityToId = new Map();
	/** @type {Map<number, T>} */
	#idToEntity = new Map();
	#nextId = 0;

	constructor(entities = []) {
		this.#bucket = new Bucket(entities);
		this.add = this.add.bind(this);
		this.remove = this.remove.bind(this);

		/* When entities are added, reindex them immediately */
		this.#bucket.onEntityAdded.subscribe((entity) => {
			this.reindex(entity);
		});

		/* When entities are removed, remove them from all known queries, and delete their IDs */
		this.#bucket.onEntityRemoved.subscribe((entity) => {
			this.#queries.forEach((query) => query.remove(entity));

			if (this.#entityToId.has(entity)) {
				const _id = this.#entityToId.get(entity);
				this.#idToEntity.delete(_id);
				this.#entityToId.delete(entity);
			}
		});
	}

	//get entities() { return this.#bucket.entities; }
	//get version() { return this.#bucket.version; }
	get onEntityAdded() { return this.#bucket.onEntityAdded; }
	get onEntityRemoved() { return this.#bucket.onEntityRemoved; }
	has(entity) { return this.#bucket.has(entity); }
	add(entity) { return this.#bucket.add(entity); }
	remove(entity) { return this.#bucket.remove(entity); }
	clear() { this.#bucket.clear(); }
	[Symbol.iterator]() { return this.#bucket[Symbol.iterator](); }

	update(entity, update, value) {
		/* Apply the update */
		if (typeof update === "function") {
			const partial = update(entity);
			if (partial) Object.assign(entity, partial);
		} else if (typeof update === "string") {
			entity[update] = value;
		} else if (update) {
			Object.assign(entity, update);
		}

		/* If this world knows about the entity, reindex it. */
		this.reindex(entity);
		return entity;
	}

	addComponent(entity, component, value) {
		if (entity[component] !== undefined) return;
		entity[component] = value;
		this.reindex(entity);
	}

	removeComponent(entity, component) {
		if (entity[component] === undefined) return;

		if (this.has(entity)) {
			const future = { ...entity };
			delete future[component];
			this.reindex(entity, future);
		}

		delete entity[component];
	}

	/** @returns {Query<T>} */
	query(config) {
		const normalizedConfig = normalizeQueryConfiguration(config);
		const key = configKey(normalizedConfig);

		/* Use existing query if we can find one */
		for (const query of this.#queries) {
			if (query.key === key) {
				return query;
			}
		}

		/* Otherwise, create new query */
		const query = new Query(this, normalizedConfig);
		this.#queries.add(query);
		return query;
	}

	/**
	 * custom added method
	 * warning, do not use [Symbol.iterator]() in combination with update/reindex
	 * */
	orderedQuery(config, comparator, entities = []) {
		const normalizedConfig = normalizeQueryConfiguration(config);
		const key = configKey(normalizedConfig) + ":" + id(comparator);

		for (const query of this.#queries) {
			if (query.key === key) {
				return query;
			}
		}

		const query = new OrderedQuery(this, normalizedConfig, comparator, entities, key);

		this.#queries.add(query);
		return query;
	}

	/** @returns {Query<T>} */
	with(...components) {
		return this.query({ with: components, without: [], predicates: [] });
	}

	without(...components) {
		return this.query({ with: [], without: components, predicates: [] });
	}

	where(predicate) {
		return this.query({ with: [], without: [], predicates: [predicate] });
	}

	reindex(entity, future = entity) {
		if (!this.has(entity)) return;

		for (const query of this.#queries) {
			query.evaluate(entity, future);
		}
	}

	id(entity) {
		if (!this.has(entity)) return undefined;

		if (!this.#entityToId.has(entity)) {
			const _id = this.#nextId++;
			this.#entityToId.set(entity, _id);
			this.#idToEntity.set(_id, entity);
		}

		return this.#entityToId.get(entity);
	}

	/** @param {number} id
	 * @returns {T | undefined} */
	entity(id) {
		return this.#idToEntity.get(id);
	}
}

/**
 * @template T
 */
export class Query {
	#isConnected = false;
	#bucket;

	/** @param {World} world
	 * @param config
	 * @param {Bucket|OrderedBucket} bucket */
	constructor(world, config, bucket = new Bucket()) {
		/** @type {Bucket|OrderedBucket} */
		this.#bucket = bucket;
		this.world = world;
		this.config = config;
		this.key = configKey(config);

		this.add = this.add.bind(this);
		this.remove = this.remove.bind(this);

		/* Automatically connect this query if event listeners are added */
		this.#bucket.onEntityAdded.onSubscribe.subscribe(() => this.connect());
		this.#bucket.onEntityRemoved.onSubscribe.subscribe(() => this.connect());
	}

	get onEntityAdded() { return this.#bucket.onEntityAdded; }
	get onEntityRemoved() { return this.#bucket.onEntityRemoved; }

	get isConnected() {
		return this.#isConnected;
	}

	get entities() {
		if (!this.#isConnected) this.connect();
		return this.#bucket.entities;
	}

	has(entity) { return this.#bucket.has(entity); }
	add(entity) { return this.#bucket.add(entity); }
	remove(entity) { return this.#bucket.remove(entity); }
	clear() { this.#bucket.clear(); }

	/** @returns {Iterable<T>} */
	[Symbol.iterator]() {
		if (!this.#isConnected) this.connect();
		return this.#bucket[Symbol.iterator]();
	}

	connect() {
		if (!this.#isConnected) {
			this.#isConnected = true;

			/* Evaluate all entities in the world */
			for (const entity of this.world) {
				this.evaluate(entity);
			}
		}
		return this;
	}

	disconnect() {
		this.#isConnected = false;
		return this;
	}

	with(...components) {
		return this.world.query({
			...this.config,
			with: [...this.config.with, ...components],
		});
	}

	without(...components) {
		return this.world.query({
			...this.config,
			without: [...this.config.without, ...components],
		});
	}

	where(predicate) {
		return this.world.query({
			...this.config,
			predicates: [...this.config.predicates, predicate],
		});
	}

	want(entity) {
		return (
			this.config.with.every((component) => entity[component] !== undefined) &&
			this.config.without.every((component) => entity[component] === undefined) &&
			this.config.predicates.every((predicate) => predicate(entity))
		);
	}

	evaluate(entity, future = entity) {
		if (!this.isConnected) return;

		const wanted = this.want(future);
		const has = this.has(entity);

		if (wanted && !has) {
			this.add(entity);
		} else if (!wanted && has) {
			this.remove(entity);
		}
	}
}

export class OrderedQuery extends Query {
	#orderedBucket;

	constructor(world, config, orderBy, entities = [], key = undefined) {
		const bucket = new OrderedBucket(orderBy);
		// Query constructor
		super(world, config, bucket);
		this.#orderedBucket = bucket;

		this.key = key ?? configKey(config) + ":" + id(orderBy);

		// OrderedQuery constructor
		entities.forEach((e) => this.add(e));
	}

	evaluate(entity, future = entity) {
		if (!this.isConnected) return;

		const wanted = this.want(future);
		const has = this.has(entity);

		if (wanted && !has) {
			this.add(entity);
		} else if (!wanted && has) {
			this.remove(entity);
		} else if (wanted && has) {
			// re-sort
			this.#orderedBucket.reposition(entity);
		}
	}
}

/* --- Helper Functions --- */

function normalizeComponents(components) {
	if(components === undefined) return [];
	return [...new Set(components.sort().filter((c) => !!c && c !== ""))];
}

function normalizePredicates(predicates) {
	return [...new Set(predicates)];
}

function normalizeQueryConfiguration(config) {
	return {
		with: normalizeComponents(config.with),
		without: normalizeComponents(config.without),
		predicates: normalizePredicates(config.predicates),
	};
}

function configKey(config) {
	return `${config.with.join(",")}:${config.without.join(",")}:${config.predicates.map(p => id(p)).join(",")}`;
}