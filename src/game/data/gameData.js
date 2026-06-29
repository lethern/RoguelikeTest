import { World } from "../../../libs/miniplex/miniplex.js";
import { logger } from "../../utils/logger.js";
import { PrefabStorage } from "./storage.js";

class EventsManager {
	#listeners = new Map();
	listen(eventType, callback, priority = 0) {
		if (!this.#listeners.has(eventType)) {
			this.#listeners.set(eventType, []);
		}

		const queue = this.#listeners.get(eventType);
		queue.push({ callback, priority });
		queue.sort((a, b) => b.priority - a.priority);
	}
	raise(event, entity) {
		logger.log("raise " + event.type);
		if (this.#listeners.has(event.type)) {
			for (const { callback } of this.#listeners.get(event.type)) {
				if (event.isCancelled) break;
				logger.log("raise -> " + callback.name);
				callback(event, entity);
			}
		}
	}
}

export class GameData {
	#world = new World();
	#relations = new World(); // entities that are children of other entity from world
	#events = new EventsManager();
	#causalityId = 1; // 0 would screw the if(casualityId) check
	#prefabStorage = new PrefabStorage();

	#player;

	constructor() {}

	/** @returns {World<Entity>} */
	get world() {
		return this.#world;
	}
	/** @returns {World<Entity>} */
	get relations() {
		return this.#relations;
	}
	/** @returns {EventsManager} */
	get events() {
		return this.#events;
	}

	get prefabStorage() {
		return this.#prefabStorage;
	}

	get playerId() {
		return this.#world.id(this.#player);
	}
	get player() {
		return this.#player;
	}

	set player(player) {
		this.#player = player;
	}

	nextCausalityId() {
		return this.#causalityId++;
	}
}
