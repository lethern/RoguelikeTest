export class StorageManager {
	static set(key, value) {
		localStorage.setItem(key, JSON.stringify(value));
	}

	static get(key) {
		const stored = localStorage.getItem(key);
		return stored ? JSON.parse(stored) : null;
	}

	static remove(key) {
		localStorage.removeItem(key);
	}

	static clear() {
		localStorage.clear();
	}
}
