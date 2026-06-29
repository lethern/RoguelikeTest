import EventEmitter from '../utils/eventEmitter.js';
import { StorageManager } from '../utils/storage.js';
import { EditorPersistenceEvents, EditorActionsEvents } from './editorEvents.js';
import {config} from "../config.js";

const FULL_SNAPSHOT_KEY = "full_snapshot";

const EditorPersistenceManagerConfig = Object.freeze({
	SAVE_INTERVAL: "SAVE_INTERVAL",
});
config.addConfigVar(EditorPersistenceManagerConfig.SAVE_INTERVAL, 100, 'Number of undo steps before full save', 'editorSaveInterval', 'EditorPersistenceManagerConfig');

class EditorPersistenceManager extends EventEmitter {
	constructor() {
		super();
		this.saveCounter = 0;
	}

	saveLocal() {
		const snapshot = this.exportState(EditorPersistenceEvents.SAVE_LOCAL);
		StorageManager.set(FULL_SNAPSHOT_KEY, snapshot);
		this.saveCounter = 0;
	}

	exportState(type = EditorPersistenceEvents.SAVE_DISK) {
		const snapshot = {
			timestamp: Date.now(),
			components: {}
		};
		this.emit(type, snapshot.components);
		return snapshot;
	}

	loadLocal() {
		const snapshot = StorageManager.get(FULL_SNAPSHOT_KEY);
		if (snapshot && snapshot.components) {
			this.emit(EditorPersistenceEvents.LOAD_LOCAL, snapshot.components);
		}
		this.emit(EditorPersistenceEvents.AFTER_LOAD_LOCAL);
	}

	importState(components) {
		this.emit(EditorPersistenceEvents.LOAD_DISK, components);
		this.emit(EditorPersistenceEvents.AFTER_LOAD_DISK);
	}

	incrementActionCount() {
		this.saveCounter++;
		if (this.saveCounter >= config.getConfigValue(EditorPersistenceManagerConfig.SAVE_INTERVAL)) {
			this.saveLocal();
		}
	}
}

export const editorPersistenceManager = new EditorPersistenceManager();
