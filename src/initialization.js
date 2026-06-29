import {globalStore} from "./globalStore.js";
import {config} from "./config.js";
import {CryptoRandom} from './utils/random.js';

export function initAll() {

	// globalStore state
	globalStore.state.gameSession = {

	};

	globalStore.state.editor = {
		currMapId: null
	};

	globalStore.state.maps = {};

	globalStore.state.graphicalTiles = {
		'wall': {char: '#', color: '#888'},
		'floor': {char: '.', color: '#444'},
		'grass': {char: '"', color: '#2a5'},
		'water': {char: '~', color: '#28f'},
		'door': {char: '+', color: '#a80'},
		'stairs': {char: '>', color: '#ff0'},
		'player': {char: '@', color: '#fff'}
	};

	globalStore.state.tileDictionary = {
		'tile_wall': {
			id: 'tile_wall',
			name: 'Wall',
			blocksMovement: true,
			blocksVision: true,
			defaultSpawns: [],
			flags: {},
			tags: ['wall', 'solid'],
			graphicalId: 'wall'
		},
		'tile_floor': {
			id: 'tile_floor',
			name: 'Floor',
			blocksMovement: false,
			blocksVision: false,
			defaultSpawns: [],
			flags: {},
			tags: ['floor', 'walkable'],
			graphicalId: 'floor'
		},
		'tile_grass': {
			id: 'tile_grass',
			name: 'Grass',
			blocksMovement: false,
			blocksVision: false,
			defaultSpawns: [],
			flags: {},
			tags: ['grass', 'walkable'],
			graphicalId: 'grass'
		},
		'tile_water': {
			id: 'tile_water',
			name: 'Water',
			blocksMovement: true,
			blocksVision: false,
			defaultSpawns: [],
			flags: {},
			tags: ['water', 'liquid'],
			graphicalId: 'water'
		}
	};

	const mapId = 'default_map';
	const width = 5;
	const height = 5;

	const tiles = [
		['tile_wall', 'tile_wall', 'tile_wall', 'tile_wall', 'tile_wall'],
		['tile_wall', 'tile_floor', 'tile_floor', 'tile_floor', 'tile_wall'],
		['tile_wall', 'tile_grass', 'tile_water', 'tile_grass', 'tile_wall'],
		['tile_wall', 'tile_floor', 'tile_floor', 'tile_floor', 'tile_wall'],
		['tile_wall', 'tile_wall', 'tile_wall', 'tile_wall', 'tile_wall']
	];

	globalStore.state.maps[mapId] = {
		id: mapId,
		name: 'Test Map',
		width: width,
		height: height,
		tiles: tiles
	};

	globalStore.state.editor.currMapId = mapId;

	globalStore.state.items = {};
	globalStore.state.mapObjects = {};
	globalStore.state.mapEntities = {};
	globalStore.state.mapEntities[mapId] = [];
	globalStore.state.graphicalEntities = {};

	if (Object.keys(globalStore.state.monsters).length === 0) {
		const test_goblin_graphic_id = CryptoRandom.generateId();
		globalStore.state.graphicalEntities[test_goblin_graphic_id] = {
			id: test_goblin_graphic_id,
			char: 'g',
			color: '#f87171',
		};

		const test_goblin_id = CryptoRandom.generateId();
		globalStore.state.monsters[test_goblin_id] = {
			id: test_goblin_id,
			name: "Test Goblin",
			attrs: { "hp": { type: "single", val: 10 }, "old_stat": { type: "single", val: 5 } },
			graphicalId: test_goblin_graphic_id
		};
	}
}
