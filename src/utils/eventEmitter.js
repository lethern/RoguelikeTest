class EventEmitter {
	#listeners = new Map();

	on(event, fn) {
		if (!this.#listeners.has(event)) {
			this.#listeners.set(event, new Set());
		}
		this.#listeners.get(event).add(fn);
	}

	off(event, fn) {
		this.#listeners.get(event)?.delete(fn);
	}

	emit(event, ...args) {
		for (const fn of this.#listeners.get(event) ?? []) {
			fn(...args);
		}
	}
}
export default EventEmitter;
