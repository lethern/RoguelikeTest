import { editorPersistenceManager } from "./editor/persistenceManager.js";
import { EditorPersistenceEvents } from "./editor/editorEvents.js";
import { compressMap, decompressMap } from "./utils/mapCompression.js";

export const GameStateKeys = {
	AttributesConfig: "AttributesConfig",
	MonstersConfig: "MonstersConfig",
	TileDictionary: "TileDictionary",
	Maps: "Maps",
	MapListChanged: "MapListChanged",
	EditorCurrMap: "EditorCurrMap",
	EntitiesConfig: "EntitiesConfig",
	MapEntities: "MapEntities",
};

/**
 * @typedef {Object} GlobalState
 * @property {Object.<string, {id: string, name: string, type: string}>} attributes
 * @property {Object.<string, {id: string, name: string, attrs: Object.<string, {type: string, val: any}>}>} monsters
 *
 * @property {Object.<string, {id: string, name: string, graphicalId: string}>} items
 * @property {Object.<string, {id: string, name: string, graphicalId: string}>} mapObjects
 *
 * @property {Object.<string, {id: string, name: string, width: number, height: number, tiles: any}>} maps
 * @property {Object.<string, Array.<{x: number, y: number, entityId: string}>>} mapEntities
 * @property {Object.<string, {id: string, name: string, blocksMovement: boolean, blocksVision: boolean, defaultSpawns: any, flags: any, tags: any, graphicalId: string}>} tileDictionary
 * @property {Object.<string, {char: string, color: string}>} graphicalTiles
 * @property {Object.<string, {char: string, color: string}>} graphicalEntities
 * @property {{currMapId: string|null}} editor
 * @property {{}} gameSession
 */

class GlobalStore {
	constructor() {
		/** @type {GlobalState} */
		this.state = {
			// game design
			attributes: {}, // [id] -> id, name, type
			monsters: {}, // [id] -> id, name, attrs
			items: {}, // [id] -> id, name, attrs, graphicalId
			mapObjects: {}, // [id] -> id, name, attrs, graphicalId
			// map
			maps: {}, // maps[id] -> id, name, width, height, tiles
			mapEntities: {}, // mapEntities[mapId] -> array of {x, y, entityId}
			tileDictionary: {}, // [id] -> id, name, blocksMovement, blocksVision, defaultSpawns, flags, tags, graphicalId
			graphicalTiles: {}, // [name] -> char, color
			graphicalEntities: {}, // [id] -> char, color
			editor: {}, // {currMapId}
			// game
			gameSession: {}, //
		};
		this.listeners = {};
		this.#initPersistence();
	}

	#initPersistence() {
		const saveFn = (components) => {
			const stateCopy = JSON.parse(JSON.stringify(this.state));
			for (const mapId in stateCopy.maps) {
				stateCopy.maps[mapId].tiles = compressMap(stateCopy.maps[mapId]);
			}
			components.globalStore = stateCopy;
		};
		const loadFn = (components) => {
			if (components.globalStore) {
				const state = JSON.parse(JSON.stringify(components.globalStore));
				for (const mapId in state.maps) {
					state.maps[mapId].tiles = decompressMap(state.maps[mapId].tiles, state.maps[mapId].width);
				}
				this.setState(state);
			}
		};
		editorPersistenceManager.on(EditorPersistenceEvents.SAVE_LOCAL, saveFn);
		editorPersistenceManager.on(EditorPersistenceEvents.SAVE_DISK, saveFn);
		editorPersistenceManager.on(EditorPersistenceEvents.LOAD_LOCAL, loadFn);
		editorPersistenceManager.on(EditorPersistenceEvents.LOAD_DISK, loadFn);
	}

	/** @param {GlobalState} newState */
	setState(newState) {
		this.state = newState;
		this.notifyAll();
	}

	/** @param {string} key
	 * @param {function(GlobalState):void} callback */
	subscribe(key, callback) {
		//this.listeners.push(callback);
		if (!this.listeners[key]) this.listeners[key] = new Set();
		this.listeners[key].add(callback);
	}

	/** @param {string} key */
	notify(key) {
		this.listeners[key]?.forEach((cb) => cb(this.state));
	}

	notifyAll() {
		Object.values(this.listeners).forEach((listenerSet) => {
			listenerSet.forEach((cb) => cb(this.state));
		});
	}
}

export const globalStore = new GlobalStore();
