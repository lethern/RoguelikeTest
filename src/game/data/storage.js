import { CryptoRandom } from "../../utils/random.js";

export class PrefabStorage {
	#prefabs = new Map();

	getComponents(id) {
		return this.#prefabs.get(id).components;
	}

	add({ name, archetype, components }) {
		if (!name || !archetype || !components) throw new Error("Missing arg");

		const id = this.#generateId();
		this.#prefabs.set(id, { id, name, archetype, components });
		return id;
	}

	#generateId() {
		let id = CryptoRandom.generateId();
		if (this.#prefabs.has(id)) id = CryptoRandom.generateId();
		if (this.#prefabs.has(id)) throw new Error("can't get unique id");
		return id;
	}
}

export class DataFactories {
	#gameData;
	constructor(gameData) {
		this.#gameData = gameData;
	}

	addEntity({ name, prefabId, components = {} }) {
		if (!prefabId || typeof components !== "object") throw new Error("Bad args");

		const entity = this.#instantiateEntity(name, prefabId, components);
		this.#gameData.world.add(entity);
		return entity;
	}

	addRelation({ name, prefabId, components = {}, OwnerId }) {
		if (!prefabId || typeof components !== "object" || typeof OwnerId !== "number") throw new Error("Bad args");

		const entity = this.#instantiateEntity(name, prefabId, components);
		entity.OwnerId = OwnerId;
		this.#gameData.relations.add(entity);
		return entity;
	}

	#instantiateEntity(name, prefabId, components) {
		const prefab = this.#gameData.prefabStorage.getComponents(prefabId);

		const entity = {};
		for (const id in prefab) {
			entity[id] = DataFactories.instantiateComponent(prefab[id], components[id]);
		}
		for (const id in components) {
			if (!(id in prefab)) {
				entity[id] = DataFactories.instantiateComponent(undefined, components[id]);
			}
		}
		entity.name = name || prefab.name;
		entity.prefabId = prefabId;
		return entity;
	}

	/**
	 * prefab cannot have nested objects (or arrays)
	 * (or it could, but they must be frozen, but then they cannot be shadowed in part,
	 * shadowing an object replaces whole object and all properties, not just missing ones)
	 */
	static instantiateComponent(prefabData, localData = {}) {
		const component = prefabData ? Object.create(prefabData) : {};

		// sort helps a bit with V8's megamorphic hidden class transitions
		const overrideKeys = Object.keys(localData).sort();

		for (const key of overrideKeys) {
			component[key] = localData[key];
		}

		return component;
	}
}
