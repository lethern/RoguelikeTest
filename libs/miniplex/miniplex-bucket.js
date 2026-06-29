import { Event } from "./eventery.js";

/**
 * A class wrapping an array of entities of a specific type, providing
 * performance-optimized methods for adding, looking up and removing entities,
 * and events for when entities are added or removed.
 */
export class Bucket {
	#version = 0;
	#entities;
	#entityPositions = new Map();

	constructor(entities = []) {
		this.onEntityAdded = new Event();

		// when an entity is about to be removed
		this.onEntityRemoved = new Event();

		this.#entities = entities;

		this.add = this.add.bind(this);
		this.remove = this.remove.bind(this);

		for (let i = 0; i < entities.length; i++) {
			this.#entityPositions.set(entities[i], i);
		}
	}

	/**
	 * The current version of the bucket. Increases every time an entity is
	 * added or removed.
	 */
	get version() {
		return this.#version;
	}

	get entities() {
		return this.#entities;
	}

	get size() {
		return this.#entities.length;
	}

	get first() {
		return this.#entities[0];
	}

	has(entity) {
		return this.#entityPositions.has(entity);
	}

	add(entity) {
		if (entity && !this.has(entity)) {
			this.#entities.push(entity);
			this.#entityPositions.set(entity, this.#entities.length - 1);

			this.#version++;
			this.onEntityAdded.emit(entity);
		}
		return entity;
	}

	remove(entity) {
		if (!this.has(entity)) return entity;

		this.onEntityRemoved.emit(entity);

		const index = this.#entityPositions.get(entity);
		this.#entityPositions.delete(entity);

		const last = this.#entities[this.#entities.length - 1];

		// swap-with-last removal for O(1)
		if (last !== entity) {
			this.#entities[index] = last;
			this.#entityPositions.set(last, index);
		}

		this.#entities.pop();
		this.#version++;

		return entity;
	}

	clear() {
		for (const entity of this) {
			this.remove(entity);
		}
	}

	// Iterate over entities in reverse order
	[Symbol.iterator]() {
		let index = this.#entities.length;

		return {
			next: () => {
				if (index <= 0) {
					return { value: undefined, done: true };
				}

				index--;
				return {
					value: this.#entities[index],
					done: false,
				};
			},
		};
	}
}

export class OrderedBucket {
	#version = 0;
	#entities = [];
	#entitySet = new Set();
	#orderBy;

	constructor(orderBy) {
		this.onEntityAdded = new Event();
		this.onEntityRemoved = new Event();
		this.#orderBy = orderBy;
		this.add = this.add.bind(this);
		this.remove = this.remove.bind(this);
	}

	#insertSorted(entity) {
		let low = 0;
		let high = this.#entities.length;

		while (low < high) {
			let mid = (low + high) >>> 1;
			if (this.#orderBy(this.#entities[mid], entity) <= 0) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}
		this.#entities.splice(low, 0, entity);
	}

	reposition(entity) {
		const index = this.#entities.indexOf(entity);
		if (index !== -1) {
			this.#entities.splice(index, 1);
			this.#insertSorted(entity);
		}
	}

	has(entity) {
		return this.#entitySet.has(entity);
	}

	add(entity) {
		if (entity && !this.has(entity)) {
			this.#entitySet.add(entity);
			this.#insertSorted(entity);
			this.#version++;
			this.onEntityAdded.emit(entity);
		}
		return entity;
	}

	remove(entity) {
		if (!this.has(entity)) return entity;

		this.onEntityRemoved.emit(entity);
		this.#entitySet.delete(entity);

		const index = this.#entities.indexOf(entity);
		if (index !== -1) {
			this.#entities.splice(index, 1);
		}

		this.#version++;
		return entity;
	}

	clear() {
		for (const entity of this) {
			this.remove(entity);
		}
	}

	// change Bucket's iterator: we want sorted order
	[Symbol.iterator]() {
		let index = 0;
		return {
			next: () => {
				if (index >= this.#entities.length) {
					return { value: undefined, done: true };
				}
				return {
					value: this.#entities[index++],
					done: false,
				};
			},
		};
	}

	get version() {
		return this.#version;
	}

	get entities() {
		return this.#entities;
	}

	get size() {
		return this.#entities.length;
	}

	get first() {
		return this.#entities[0];
	}
}