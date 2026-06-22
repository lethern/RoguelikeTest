import EventEmitter from './utils/eventEmitter.js';
import { StorageManager } from './utils/storage.js';
import { PersistenceEvents } from './editor/editorEvents.js';

const FULL_SNAPSHOT_KEY = "full_snapshot";

class PersistenceManager extends EventEmitter {
	constructor() {
		super();
		this.saveCounter = 0;
		this.SAVE_INTERVAL = 5;
	}

	save() {
		const snapshot = {
			timestamp: Date.now(),
			components: {}
		};
		this.emit(PersistenceEvents.SAVE, snapshot.components);
		StorageManager.set(FULL_SNAPSHOT_KEY, snapshot);
		this.saveCounter = 0;
	}

	load() {
		const snapshot = StorageManager.get(FULL_SNAPSHOT_KEY);
		if (snapshot && snapshot.components) {
			this.emit(PersistenceEvents.LOAD, snapshot.components);
		}
		this.emit(PersistenceEvents.AFTER_LOAD);
	}
// ...

	incrementActionCount() {
		this.saveCounter++;
		if (this.saveCounter >= this.SAVE_INTERVAL) {
			this.save();
		}
	}
}

export const persistenceManager = new PersistenceManager();
