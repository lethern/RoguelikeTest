import {persistenceManager} from './persistenceManager.js';
import {PersistenceEvents} from "./editor/editorEvents.js";

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
 * @property {Object.<string, {id: string, name: string, passable: boolean, defaultSpawns: any, flags: any, tags: any, graphicalId: string}>} tileDictionary
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
			tileDictionary: {}, // [id] -> id, name, passable, defaultSpawns, flags, tags, graphicalId
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
		persistenceManager.on(PersistenceEvents.SAVE, (components) => {
			components.globalStore = this.state;
		});
		persistenceManager.on(PersistenceEvents.LOAD, (components) => {
			if (components.globalStore) {
				this.setState(components.globalStore);
			}
		});
	}

	/**
	 * @param {GlobalState} newState
	 */
	setState(newState) {
		this.state = newState;
		this.notifyAll();
	}

	/**
	 * @param {string} key
	 * @param {function(GlobalState):void} callback
	 */
	subscribe(key, callback) {
		//this.listeners.push(callback);
		if (!this.listeners[key]) this.listeners[key] = new Set();
		this.listeners[key].add(callback);
	}

	/**
	 * @param {string} key
	 */
	notify(key) {
		this.listeners[key]?.forEach(cb => cb(this.state));
	}

	notifyAll() {
		Object.values(this.listeners).forEach(listenerSet => {
			listenerSet.forEach(cb => cb(this.state));
		});
	}

	//dispatch(action, sendWs = true) {
	//	if (action.type === "attr_add") {
	//		this.state.attributes[action.id] = { id: action.id, name: action.name, type: action.valType };
	//	} else if (action.type === "attr_remove") {
	//		delete this.state.attributes[action.id];
	//	} else if (action.type === "attr_update") {
	//		if (this.state.attributes[action.id]) {
	//			this.state.attributes[action.id][action.field] = action.value;
	//		}
	//	} else if (action.type === "monster_modify_attribute") {
	//		const m = this.state.monsters[action.monster_id];
	//		if (m) {
	//			if (!m.attrs) m.attrs = {};
	//			m.attrs[action.attribute_id] = { type: action.valType, val: action.value };
	//		}
	//	}
//
	//	if (sendWs) {
	//		connection.sendWsData({ type: "state_action", action: action });
	//	}
	//	this.notify();
	//}
}

export const globalStore = new GlobalStore();
