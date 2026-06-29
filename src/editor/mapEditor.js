import {gui} from "../gui.js";
import {BaseCommand, commandRegistry} from './historyNode.js';
import {editorActions} from './actionsManager.js';
import {GameStateKeys, globalStore} from "../globalStore.js";
import {config} from "../config.js";
import {CryptoRandom} from '../utils/random.js';
import {editorEvents, EditorEvents} from './editorEvents.js';

const MapEditorConfig = Object.freeze({
	MAP_EDITOR_TILE_SIZE: "MAP_EDITOR_TILE_SIZE",
});
config.addConfigVar(MapEditorConfig.MAP_EDITOR_TILE_SIZE, 16, 'Size of each rendered map tile in pixels', 'tileSize', 'MapEditorConfig');

//#region commands
function expandHex(hex) {
	if (hex.length === 4) {
		return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
	}
	return hex;
}

class TileGraphicUpdateCommand extends BaseCommand {
	static friendlyName = 'Update Tile Graphic';
	constructor(data) {
		if (data.oldValue === undefined) {
			const gTile = globalStore.state.graphicalTiles[data.graphicalId];
			data.oldValue = gTile ? gTile[data.field] : null;
		}
		super(data);
	}
	execute() {
		if (!globalStore.state.graphicalTiles[this.data.graphicalId]) {
			globalStore.state.graphicalTiles[this.data.graphicalId] = { char: '?', color: '#ffffff' };
		}
		globalStore.state.graphicalTiles[this.data.graphicalId][this.data.field] = this.data.newValue;
		globalStore.notify(GameStateKeys.TileDictionary);
	}
	undo() {
		if (globalStore.state.graphicalTiles[this.data.graphicalId]) {
			globalStore.state.graphicalTiles[this.data.graphicalId][this.data.field] = this.data.oldValue;
			globalStore.notify(GameStateKeys.TileDictionary);
		}
	}
}
commandRegistry.register(TileGraphicUpdateCommand);

class TileEntryAddCommand extends BaseCommand {
	static friendlyName = 'Tile Add';
	constructor(data) {
		super(data);
	}
	execute() {
		globalStore.state.tileDictionary[this.data.id] = {
			id: this.data.id,
			name: this.data.name,
			blocksMovement: this.data.blocksMovement || false,
			blocksVision: this.data.blocksVision || false,
			defaultSpawns: this.data.defaultSpawns || [],
			flags: this.data.flags || {},
			tags: this.data.tags || [],
			graphicalId: this.data.graphicalId || this.data.id
		};
		if (!globalStore.state.graphicalTiles[this.data.id]) {
			globalStore.state.graphicalTiles[this.data.id] = {
				char: '?',
				color: '#ffffff'
			};
		}
		globalStore.notify(GameStateKeys.TileDictionary);
	}
	undo() {
		delete globalStore.state.tileDictionary[this.data.id];
		globalStore.notify(GameStateKeys.TileDictionary);
	}
}
commandRegistry.register(TileEntryAddCommand);

class TileEntryUpdateCommand extends BaseCommand {
	static friendlyName = 'Tile Update';
	constructor(data) {
		if (data.oldValue === undefined) {
			const entry = globalStore.state.tileDictionary[data.id];
			data.oldValue = entry ? entry[data.field] : null;
		}
		super(data);
	}
	execute() {
		if (globalStore.state.tileDictionary[this.data.id]) {
			globalStore.state.tileDictionary[this.data.id][this.data.field] = this.data.newValue;
			globalStore.notify(GameStateKeys.TileDictionary);
		}
	}
	undo() {
		if (globalStore.state.tileDictionary[this.data.id]) {
			globalStore.state.tileDictionary[this.data.id][this.data.field] = this.data.oldValue;
			globalStore.notify(GameStateKeys.TileDictionary);
		}
	}
}
commandRegistry.register(TileEntryUpdateCommand);

class MapPaintEntityCommand extends BaseCommand {
	static friendlyName = 'Paint Entity';
	constructor(data) {
		super(data);
	}

	canAppend(baseConfig, maxItems) {
		return this.data.mapId === baseConfig.mapId &&
			this.data.entityId === baseConfig.entityId &&
			this.data.paints.length < maxItems;
	}

	appendAndExecute(paintItem) {
		const arr = globalStore.state.mapEntities[this.data.mapId];
		const idx = arr.findIndex(e => e.x === paintItem.x && e.y === paintItem.y && e.entityId === this.data.entityId);

		if (idx > -1) {
			arr.splice(idx, 1);
			paintItem.wasAdded = false;
		} else {
			arr.push({ x: paintItem.x, y: paintItem.y, entityId: this.data.entityId });
			paintItem.wasAdded = true;
		}

		this.data.paints.push(paintItem);
		globalStore.notify(GameStateKeys.MapEntities);
	}

	execute() {
		const arr = globalStore.state.mapEntities[this.data.mapId];

		for (const p of this.data.paints) {
			const idx = arr.findIndex(e => e.x === p.x && e.y === p.y && e.entityId === this.data.entityId);
			if (idx > -1) {
				arr.splice(idx, 1);
				p.wasAdded = false;
			} else {
				arr.push({ x: p.x, y: p.y, entityId: this.data.entityId });
				p.wasAdded = true;
			}
		}
		globalStore.notify(GameStateKeys.MapEntities);
	}

	undo() {
		const arr = globalStore.state.mapEntities[this.data.mapId];

		for (let i = this.data.paints.length - 1; i >= 0; i--) {
			const p = this.data.paints[i];
			if (p.wasAdded) {
				const idx = arr.findIndex(e => e.x === p.x && e.y === p.y && e.entityId === this.data.entityId);
				if (idx > -1) arr.splice(idx, 1);
			} else {
				arr.push({ x: p.x, y: p.y, entityId: this.data.entityId });
			}
		}
		globalStore.notify(GameStateKeys.MapEntities);
	}
}
commandRegistry.register(MapPaintEntityCommand);

class MapPaintTileCommand extends BaseCommand {
	static friendlyName = 'Paint Tile';
	constructor(data) {
		super(data);
	}

	canAppend(baseConfig, maxItems) {
		return this.data.mapId === baseConfig.mapId &&
			this.data.tileId === baseConfig.tileId &&
			this.data.paints.length < maxItems;
	}

	appendAndExecute(paintItem) {
		this.data.paints.push(paintItem);

		const map = globalStore.state.maps[this.data.mapId];
		if (map && map.tiles[paintItem.y] && paintItem.x < map.width) {
			map.tiles[paintItem.y][paintItem.x] = this.data.tileId;
			globalStore.notify(GameStateKeys.Maps);
		}
	}

	execute() {
		const map = globalStore.state.maps[this.data.mapId];
		if (!map) return;

		for (const p of this.data.paints) {
			if (map.tiles[p.y] && p.x < map.width) {
				map.tiles[p.y][p.x] = this.data.tileId;
			}
		}
		globalStore.notify(GameStateKeys.Maps);
	}

	undo() {
		const map = globalStore.state.maps[this.data.mapId];
		if (!map) return;

		for (let i = this.data.paints.length - 1; i >= 0; i--) {
			const p = this.data.paints[i];
			if (map.tiles[p.y] && p.x < map.width) {
				map.tiles[p.y][p.x] = p.oldValue;
			}
		}
		globalStore.notify(GameStateKeys.Maps);
	}
}
commandRegistry.register(MapPaintTileCommand);

class MapResizeCommand extends BaseCommand {
	static friendlyName = 'Resize Map';
	constructor(data) {
		if (data.oldWidth === undefined) {
			const map = globalStore.state.maps[data.mapId];
			if (map) {
				data.oldWidth = map.width;
				data.oldHeight = map.height;
				data.oldTiles = JSON.parse(JSON.stringify(map.tiles));
			}
		}
		super(data);
		const map = globalStore.state.maps[data.mapId];
	}
	execute() {
		const map = globalStore.state.maps[this.data.mapId];
		if (!map) return;

		const newTiles = [];
		for (let y = 0; y < this.data.newHeight; y++) {
			const row = [];
			for (let x = 0; x < this.data.newWidth; x++) {
				if (y < map.tiles.length && x < (map.tiles[y]?.length ?? 0)) {
					row.push(map.tiles[y][x]);
				} else {
					row.push(null);
				}
			}
			newTiles.push(row);
		}

		map.width = this.data.newWidth;
		map.height = this.data.newHeight;
		map.tiles = newTiles;
		globalStore.notify(GameStateKeys.Maps);
	}
	undo() {
		const map = globalStore.state.maps[this.data.mapId];
		if (!map) return;

		map.width = this.data.oldWidth;
		map.height = this.data.oldHeight;
		map.tiles = JSON.parse(JSON.stringify(this.data.oldTiles));
		globalStore.notify(GameStateKeys.Maps);
	}
}
commandRegistry.register(MapResizeCommand);

class MapUpdateCommand extends BaseCommand {
	static friendlyName = 'Map Update';
	constructor(data) {
		if (data.oldValue === undefined) {
			const map = globalStore.state.maps[data.mapId];
			data.oldValue = map ? map[data.field] : null;
		}
		super(data);
	}
	execute() {
		const map = globalStore.state.maps[this.data.mapId];
		if (map) {
			map[this.data.field] = this.data.newValue;
			globalStore.notify(GameStateKeys.Maps);
		}
	}
	undo() {
		const map = globalStore.state.maps[this.data.mapId];
		if (map) {
			map[this.data.field] = this.data.oldValue;
			globalStore.notify(GameStateKeys.Maps);
		}
	}
}
commandRegistry.register(MapUpdateCommand);


class MapSwitchCommand extends BaseCommand {
	static friendlyName = 'Switch Map';
	constructor(data) {
		if(data.oldMapId === undefined){
			data.oldMapId = globalStore.state.editor.currMapId;
		}
		super(data);
	}
	execute() {
		globalStore.state.editor.currMapId = this.data.mapId;
		globalStore.notify(GameStateKeys.EditorCurrMap);
	}
	undo() {
		globalStore.state.editor.currMapId = this.data.oldMapId;
		globalStore.notify(GameStateKeys.EditorCurrMap);
	}
}
commandRegistry.register(MapSwitchCommand);

class MapCreateCommand extends BaseCommand {
	static friendlyName = 'New Map';
	constructor(data) {
		super(data);
	}
	execute() {
		const tiles = [];
		for (let y = 0; y < this.data.height; y++) {
			const row = [];
			for (let x = 0; x < this.data.width; x++) {
				row.push(null);
			}
			tiles.push(row);
		}

		globalStore.state.maps[this.data.mapId] = {
			id: this.data.mapId,
			name: this.data.name,
			width: this.data.width,
			height: this.data.height,
			tiles: tiles
		};
		globalStore.state.mapEntities[this.data.mapId] = [];
		globalStore.notify(GameStateKeys.Maps);
		globalStore.notify(GameStateKeys.MapListChanged);
	}
	undo() {
		delete globalStore.state.maps[this.data.mapId];
		delete globalStore.state.mapEntities[this.data.mapId];
		if (globalStore.state.editor.currMapId === this.data.mapId) {
			const maps = Object.keys(globalStore.state.maps);
			globalStore.state.editor.currMapId = maps.length > 0 ? maps[0] : null;
		}
		globalStore.notify(GameStateKeys.Maps);
		globalStore.notify(GameStateKeys.MapListChanged);
	}
}
commandRegistry.register(MapCreateCommand);
//#endregion

class TileDictionaryWidget {
	constructor() {
		globalStore.subscribe(GameStateKeys.TileDictionary, () => this.refreshList());
		this.rootElement = null;
		this.activeTileId = null;
	}

	init(container) {
		this.container = container;
		this.rootElement = document.createElement('div');
		this.rootElement.className = 'tile-dict-widget editor-widget editor-panel';
		this.container.element.appendChild(this.rootElement);
		this.buildUI();
		this.refreshList();
		container.on('destroy', () => this.destroy());
	}

	destroy() {
		if (this.container) this.container.element.innerHTML = null;
		this.container = null;
		this.rootElement = null;
	}

	buildUI() {
		this.rootElement.innerHTML = `
			<div class="tile-widget editor-panel">
				<div class="editor-toolbar">
					<input type="text" id="searchName" placeholder="Search name..." class="search-name">
					<input type="text" id="searchTag" placeholder="Filter tag..." class="search-tag">
					<button id="btnCreate">New Tile</button>
				</div>
				<div class="editor-main">
					<div id="tileList" class="editor-list"></div>
					<div id="tileEditor" class="editor-content" style="display: none;">
						<canvas id="tileCanvas" width="64" height="64" class="editor-canvas"></canvas>
						<div id="propertiesPanel"></div>
					</div>
				</div>
			</div>
		`;

		this.rootElement.querySelector('#btnCreate').addEventListener('click', () => {
			const id = 'tile_' + Date.now();
			editorActions.dispatch(new TileEntryAddCommand({id: id, name: 'New Tile'}));
		});

		this.rootElement.querySelector('#searchName').addEventListener('input', () => this.refreshList());
		this.rootElement.querySelector('#searchTag').addEventListener('input', () => this.refreshList());
	}

	refreshList() {
		if(!this.rootElement) return;
		const list = this.rootElement.querySelector('#tileList');
		list.innerHTML = '';
		const nameQuery = this.rootElement.querySelector('#searchName').value.toLowerCase();
		const tagQuery = this.rootElement.querySelector('#searchTag').value.toLowerCase();

		const filteredTiles = Object.values(globalStore.state.tileDictionary).filter(tile => {
			const matchesName = tile.name.toLowerCase().includes(nameQuery);
			const matchesTag = !tagQuery || tile.tags.some(t => t.toLowerCase().includes(tagQuery));
			return matchesName && matchesTag;
		});

		filteredTiles.sort((a, b) => {
			const aParts = a.id.split('_');
			const bParts = b.id.split('_');
			const aTime = aParts.length > 1 ? (parseInt(aParts[1], 10) || 0) : 0;
			const bTime = bParts.length > 1 ? (parseInt(bParts[1], 10) || 0) : 0;
			if (aTime !== bTime) {
				return bTime - aTime;
			}
			return a.name.localeCompare(b.name);
		});

		for (const tile of filteredTiles) {
			const item = this.#drawListElem(tile);
			list.appendChild(item);
		}

		if (this.activeTileId && globalStore.state.tileDictionary[this.activeTileId]) {
			this.renderEditor(this.activeTileId);
		} else {
			this.rootElement.querySelector('#tileEditor').style.display = 'none';
		}
	}

	#drawListElem(tile) {
		const item = document.createElement('div');
		item.className = 'tile-list-item';

		if (tile.id === this.activeTileId) {
			item.classList.add('active');
		}

		const canvas = document.createElement('canvas');
		canvas.width = 18;
		canvas.height = 18;
		const ctx = canvas.getContext('2d');

		const graphicalId = tile.graphicalId;
		const gTile = graphicalId ? globalStore.state.graphicalTiles[graphicalId] : { char: '?', color: '#FFF' };

		if (isCloseToGray(gTile.color)) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}

		this.drawTile(canvas, ctx, gTile, 14);

		const label = document.createElement('span');
		label.textContent = tile.name;

		item.appendChild(canvas);
		item.appendChild(label);

		item.addEventListener('click', () => this.selectTile(tile.id));

		return item;

		function isCloseToGray(color) {
			const match = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
			if (!match) return false;
			let hex = match[1];
			if (hex.length === 3) {
				hex = hex.split('').map(c => c + c).join('');
			}
			const r = parseInt(hex.slice(0, 2), 16);
			const g = parseInt(hex.slice(2, 4), 16);
			const b = parseInt(hex.slice(4, 6), 16);

			const target = 61;
			const distance = Math.sqrt(
				(r - target) ** 2 +
				(g - target) ** 2 +
				(b - target) ** 2
			);
			return distance < 60;
		}
	}

	drawTile(canvas, ctx, gTile, size){
		ctx.fillStyle = gTile.color;
		ctx.font = size+'px monospace';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(gTile.char, canvas.width / 2, canvas.height / 2);
	}

	selectTile(id) {
		this.activeTileId = id;
		editorEvents.emit(EditorEvents.TILE_SELECTED, id);
		this.refreshList();
	}

	renderEditor(id) {
		const tile = globalStore.state.tileDictionary[id];
		const editor = this.rootElement.querySelector('#tileEditor');
		const props = this.rootElement.querySelector('#propertiesPanel');
		editor.style.display = 'block';

		const graphicalId = tile.graphicalId || id;
		const gTile = globalStore.state.graphicalTiles[graphicalId] || {char: '?', color: '#ffffff'};

		props.innerHTML = `
			<div><label>Name: <input type="text" id="propName" value="${tile.name}"></label></div>
			<div><label>Blocks Movement: <input type="checkbox" id="propBlocksMovement" ${tile.blocksMovement ? 'checked' : ''}></label></div>
			<div><label>Blocks Vision: <input type="checkbox" id="propBlocksVision" ${tile.blocksVision ? 'checked' : ''}></label></div>
			<div><label>Tags (comma separated): <input type="text" id="propTags" value="${tile.tags.join(', ')}"></label></div>
			<div><label>Char (1-char): <input type="text" id="propChar" maxlength="1" value="${gTile.char}" style="width: 30px; text-align: center;"></label></div>
			<div><label>Color: <input type="color" id="propColor" value="${gTile.color.length === 4 ? expandHex(gTile.color) : gTile.color}"></label></div>
		`;

		props.querySelector('#propName').addEventListener('change', (e) => {
			editorActions.dispatch(new TileEntryUpdateCommand({id, field: 'name', newValue: e.target.value}));
		});

		props.querySelector('#propBlocksMovement').addEventListener('change', (e) => {
			editorActions.dispatch(new TileEntryUpdateCommand({id, field: 'blocksMovement', newValue: e.target.checked}));
		});

		props.querySelector('#propBlocksVision').addEventListener('change', (e) => {
			editorActions.dispatch(new TileEntryUpdateCommand({id, field: 'blocksVision', newValue: e.target.checked}));
		});

		props.querySelector('#propTags').addEventListener('change', (e) => {
			const newTags = e.target.value.split(',').map(t => t.trim()).filter(t => t.length > 0);
			editorActions.dispatch(new TileEntryUpdateCommand({id, field: 'tags', newValue: newTags}));
		});

		props.querySelector('#propChar').addEventListener('change', (e) => {
			const val = e.target.value || '?';
			editorActions.dispatch(new TileGraphicUpdateCommand({graphicalId, field: 'char', newValue: val}));
		});

		props.querySelector('#propColor').addEventListener('change', (e) => {
			editorActions.dispatch(new TileGraphicUpdateCommand({graphicalId, field: 'color', newValue: e.target.value}));
		});

		this.drawCanvas(graphicalId);
	}

	drawCanvas(graphicalId) {
		const canvas = this.rootElement.querySelector('#tileCanvas');
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#222';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		const gTile = graphicalId ? globalStore.state.graphicalTiles[graphicalId] : {char: '?', color: '#FFF'};
		this.drawTile(canvas, ctx, gTile, 32)
	}
}

class MapPropertiesComponent {
	constructor() {
		globalStore.subscribe(GameStateKeys.Maps, () => this.refreshUI());
		globalStore.subscribe(GameStateKeys.EditorCurrMap, () => {
			this.refreshUI();
			if (this.rootElement && this.mode === 'list') this.renderMapList();
		});
		globalStore.subscribe(GameStateKeys.MapListChanged, () => {
			if (this.rootElement && this.mode === 'list') this.renderMapList();
		});
		this.rootElement = null;
		this.mode = 'edit';
	}

	init(container) {
		this.container = container;
		this.rootElement = document.createElement('div');
		this.rootElement.className = 'map-props-widget editor-panel';
		this.container.element.appendChild(this.rootElement);
		this.buildUI();
		this.refreshUI();
		container.on('destroy', () => this.destroy());
	}

	destroy() {
		if (this.container) this.container.element.innerHTML = null;
		this.container = null;
		this.rootElement = null;
	}

	getCurrentMap() {
		const currId = globalStore.state.editor?.currMapId;
		return currId ? globalStore.state.maps[currId] : null;
	}

	buildUI() {
		this.renderEditUI();
	}

	renderEditUI() {
		this.mode = 'edit';
		this.rootElement.innerHTML = `
			<div class="map-props-wrapper">
				<div class="map-props-header">
					<span id="mapIdDisplay">-</span>
					<button id="btnOpenMap">Open Map</button>
					<button id="btnNewMap">New Map</button>
				</div>
				<label>
					<span>Name:</span>
					<input type="text" id="mapName">
				</label>
				<label>
					<span>Width:</span>
					<input type="number" id="mapWidth" min="1">
				</label>
				<label>
					<span>Height:</span>
					<input type="number" id="mapHeight" min="1">
				</label>
			</div>
		`;

		this.rootElement.querySelector('#mapName').addEventListener('change', (e) => {
			const map = this.getCurrentMap();
			if (map) {
				editorActions.dispatch(new MapUpdateCommand({mapId: map.id, field: 'name', newValue: e.target.value}));
			}
		});

		this.rootElement.querySelector('#mapWidth').addEventListener('change', (e) => {
			const map = this.getCurrentMap();
			if (map) {
				const newWidth = parseInt(e.target.value, 10);
				const newHeight = map.height;
				editorActions.dispatch(new MapResizeCommand({mapId: map.id, newWidth, newHeight}));
			}
		});

		this.rootElement.querySelector('#mapHeight').addEventListener('change', (e) => {
			const map = this.getCurrentMap();
			if (map) {
				const newWidth = map.width;
				const newHeight = parseInt(e.target.value, 10);
				editorActions.dispatch(new MapResizeCommand({mapId: map.id, newWidth, newHeight}));
			}
		});

		this.rootElement.querySelector('#btnNewMap').addEventListener('click', () => {
			const newMapId = CryptoRandom.generateId();
			editorActions.dispatch(new MapCreateCommand({
				mapId: newMapId,
				name: 'New Map',
				width: 40,
				height: 25
			}));
			editorActions.dispatch(new MapSwitchCommand({mapId: newMapId}));
		});

		this.rootElement.querySelector('#btnOpenMap').addEventListener('click', () => this.renderMapListUI());

		this.refreshUI();
	}

	renderMapListUI() {
		this.mode = 'list';
		this.rootElement.innerHTML = `
			<div style="display: flex; flex-direction: column; gap: 10px;">
				<input type="text" id="mapSearch" placeholder="Search maps..." style="width: 100%;">
				<div id="mapList" style="flex: 1; overflow-y: auto; max-height: 300px;"></div>
				<button id="btnBack" style="padding: 4px 8px;">Back</button>
			</div>
		`;

		this.rootElement.querySelector('#mapSearch').addEventListener('input', () => this.renderMapList());
		this.rootElement.querySelector('#btnBack').addEventListener('click', () => this.renderEditUI());

		this.renderMapList();
	}

	renderMapList() {
		const list = this.rootElement.querySelector('#mapList');
		const search = this.rootElement.querySelector('#mapSearch')?.value.toLowerCase() ?? '';
		list.innerHTML = '';

		Object.values(globalStore.state.maps).forEach(map => {
			if (map.name.toLowerCase().includes(search) || map.id.toLowerCase().includes(search)) {
				const item = document.createElement('div');
				item.style.cssText = 'padding: 8px; border-bottom: 1px solid #333; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
				const currId = globalStore.state.editor?.currMapId;
				if (map.id === currId) item.style.background = '#2563eb';
				item.innerHTML = `
					<div>
						<div style="font-weight: bold;">${map.name}</div>
						<div style="font-size: 11px; color: #888; font-family: monospace;">${map.id} (${map.width}x${map.height})</div>
					</div>
					<button class="btnOpen" style="padding: 2px 6px; font-size: 11px;">${map.id === currId ? 'Current' : 'Open'}</button>
				`;
				item.querySelector('.btnOpen').addEventListener('click', (e) => {
					e.stopPropagation();
					if (map.id !== currId) {
						editorActions.dispatch(new MapSwitchCommand({mapId: map.id}));
						this.renderEditUI();
					}
				});
				list.appendChild(item);
			}
		});
	}

	refreshUI() {
		if(!this.rootElement) return;
		const map = this.getCurrentMap();
		if (map) {
			const mapNameEl = this.rootElement.querySelector('#mapName');
			const mapWidthEl = this.rootElement.querySelector('#mapWidth');
			const mapHeightEl = this.rootElement.querySelector('#mapHeight');
			const mapIdEl = this.rootElement.querySelector('#mapIdDisplay');
			if (mapNameEl) mapNameEl.value = map.name;
			if (mapWidthEl) mapWidthEl.value = map.width;
			if (mapHeightEl) mapHeightEl.value = map.height;
			if (mapIdEl) mapIdEl.textContent = map.id;
		}
	}
}

class BrushPanelComponent {
	constructor() {
		globalStore.subscribe(GameStateKeys.TileDictionary, () => this.updateSelectedTile());
		globalStore.subscribe(GameStateKeys.EntitiesConfig, () => this.updateSelectedEntity());
		this.rootElement = null;
		this.brushMode = 'brush';
		this.selectedTileId = null;
		this.selectedEntity = null;
		this.activeBrushType = 'tile';

		editorEvents.on(EditorEvents.TILE_SELECTED, (id) => this.setSelectedTile(id));
		editorEvents.on(EditorEvents.ENTITY_SELECTED, ({category, id}) => this.setSelectedEntity(category, id));
	}

	init(container) {
		this.container = container;
		this.rootElement = document.createElement('div');
		this.rootElement.className = 'editor-widget editor-panel';
		this.container.element.appendChild(this.rootElement);
		this.buildUI();
		this.updateSelectedTile();
		this.updateSelectedEntity();
		this.updateBrushSelectionHighlight();
		container.on('destroy', () => this.destroy());
	}

	destroy() {
		if (this.container) this.container.element.innerHTML = null;
		this.container = null;
		this.rootElement = null;
	}

	buildUI() {
		this.rootElement.innerHTML = `
			<div class="brush-widget" style="display: flex; flex-direction: column; gap: 10px;">
				<div style="font-weight: bold; border-bottom: 1px solid #444; padding-bottom: 5px;">Brush Panel</div>
				<div>
					<div style="margin-bottom: 5px; color: #888;">Mode:</div>
					<div style="display: flex; gap: 5px;">
						<button id="modeBrush" class="brush-btn" >Brush</button>
						<button id="modeSelect" class="brush-btn" >Select</button>
						<button id="modeRect" class="brush-btn" >Rect</button>
					</div>
				</div>
				<div id="brushSelectSection" style="display: flex; gap: 10px;">
					<div id="tileSelectCol" class="brush-select-col" style="flex: 1; padding: 5px; border: 1px solid #444; border-radius: 4px; cursor: pointer;">
						<div style="font-size: 11px; color: #888; margin-bottom: 4px;">Selected Tile:</div>
						<div id="selectedTileDisplay">
							<span style="color: #666;">No tile selected</span>
						</div>
					</div>
					<div id="entitySelectCol" class="brush-select-col" style="flex: 1; padding: 5px; border: 1px solid #444; border-radius: 4px; cursor: pointer;">
						<div style="font-size: 11px; color: #888; margin-bottom: 4px;">Selected Entity:</div>
						<div id="selectedEntityDisplay">
							<span style="color: #666;">No entity selected</span>
						</div>
					</div>
				</div>
				<div id="inspectSection" style="display: none; padding: 5px; border: 1px solid #444; border-radius: 4px; background: #222;">
					<div style="font-weight: bold; border-bottom: 1px solid #444; padding-bottom: 3px; margin-bottom: 5px;">Inspect Cell</div>
					<div id="inspectDisplay" style="font-size: 12px; display: flex; flex-direction: column; gap: 4px;">Select a cell to inspect...</div>
				</div>
				<div style="margin-top: 5px; font-size: 0.9em; color: #666;">
					<div>Controls:</div>
					<div>• Left-click: Action</div>
					<div>• Right-drag / shift+drag: Pan camera</div>
					<div>• Scroll: Zoom</div>
				</div>
			</div>
		`;

		this.rootElement.querySelector('#modeBrush').addEventListener('click', () => this.setMode('brush'));
		this.rootElement.querySelector('#modeSelect').addEventListener('click', () => this.setMode('select'));
		this.rootElement.querySelector('#modeRect').addEventListener('click', () => this.setMode('rectangle'));

		this.rootElement.querySelector('#tileSelectCol').addEventListener('click', () => {
			if (this.selectedTileId) {
				this.activeBrushType = 'tile';
				this.updateBrushSelectionHighlight();
			}
		});

		this.rootElement.querySelector('#entitySelectCol').addEventListener('click', () => {
			if (this.selectedEntity) {
				this.activeBrushType = 'entity';
				this.updateBrushSelectionHighlight();
			}
		});
	}

	setMode(mode) {
		this.brushMode = mode;
		const buttons = this.rootElement.querySelectorAll('.brush-btn');
		buttons.forEach(btn => {
			btn.style.background = '#374151';
			btn.style.color = '#e5e7eb';
		});
		const btnId = mode === 'brush' ? 'modeBrush' : mode === 'select' ? 'modeSelect' : 'modeRect';
		const activeBtn = this.rootElement.querySelector(`#${btnId}`);
		if (activeBtn) {
			activeBtn.style.background = '#2563eb';
			activeBtn.style.color = 'white';
		}

		const selectSection = this.rootElement.querySelector('#brushSelectSection');
		const inspectSection = this.rootElement.querySelector('#inspectSection');
		if (selectSection && inspectSection) {
			if (mode === 'select') {
				selectSection.style.display = 'none';
				inspectSection.style.display = 'block';
			} else {
				selectSection.style.display = 'flex';
				inspectSection.style.display = 'none';
			}
		}
	}

	setSelectedTile(tileId) {
		this.selectedTileId = tileId;
		this.activeBrushType = 'tile';
		this.updateSelectedTile();
		this.updateBrushSelectionHighlight();
	}

	setSelectedEntity(category, entityId) {
		this.selectedEntity = { category, entityId };
		this.activeBrushType = 'entity';
		this.updateSelectedEntity();
		this.updateBrushSelectionHighlight();
	}

	updateSelectedTile() {
		if (!this.rootElement) return;
		const display = this.rootElement.querySelector('#selectedTileDisplay');
		if (!display) return;
		const tileId = this.selectedTileId;
		const tile = tileId ? globalStore.state.tileDictionary[tileId] : null;
		if (tile) {
			const gTile = globalStore.state.graphicalTiles[tile.graphicalId] || {char: '?', color: '#FFF'};
			display.innerHTML = `
				<span style="color: ${gTile.color}; font-size: 24px; font-family: monospace; margin-right: 10px;">${gTile.char}</span>
				<span>${tile.name}</span>
			`;
		} else {
			display.innerHTML = '<span style="color: #666;">No tile selected</span>';
		}
	}

	updateSelectedEntity() {
		if (!this.rootElement) return;
		const display = this.rootElement.querySelector('#selectedEntityDisplay');
		if (!display) return;
		const entInfo = this.selectedEntity;
		const ent = entInfo ? (globalStore.state[entInfo.category]?.[entInfo.entityId]) : null;
		if (ent) {
			const gTile = globalStore.state.graphicalEntities[ent.graphicalId || ent.id] || {char: '?', color: '#FFF'};
			display.innerHTML = `
				<span style="color: ${gTile.color}; font-size: 24px; font-family: monospace; margin-right: 10px;">${gTile.char}</span>
				<span>${ent.name}</span>
			`;
		} else {
			display.innerHTML = '<span style="color: #666;">No entity selected</span>';
		}
	}

	updateBrushSelectionHighlight() {
		const tileCol = this.rootElement.querySelector('#tileSelectCol');
		const entityCol = this.rootElement.querySelector('#entitySelectCol');
		if (!tileCol || !entityCol) return;

		tileCol.style.background = (this.activeBrushType === 'tile') ? '#1e3a8a' : 'transparent';
		entityCol.style.background = (this.activeBrushType === 'entity') ? '#1e3a8a' : 'transparent';
	}

	inspectCell(x, y) {
		const inspectDisplay = this.rootElement.querySelector('#inspectDisplay');
		if (!inspectDisplay) return;

		const map = mapRendererComponent.getCurrentMap();
		if (!map || x < 0 || x >= map.width || y < 0 || y >= map.height) {
			inspectDisplay.innerHTML = 'Out of bounds';
			return;
		}

		const tileId = map.tiles[y][x];
		const tile = tileId ? globalStore.state.tileDictionary[tileId] : null;
		const tileName = tile ? tile.name : 'Empty';

		const entitiesAtCell = [];
		const mapEntities = globalStore.state.mapEntities[map.id];
		for (const mapEnt of mapEntities) {
			if (mapEnt.x === x && mapEnt.y === y) {
				let name = 'Unknown';
				let char = '?';
				let color = '#FFF';

				const ent = globalStore.state.monsters[mapEnt.entityId] ||
				            globalStore.state.items[mapEnt.entityId] ||
				            globalStore.state.mapObjects[mapEnt.entityId];

				if (ent) {
					name = ent.name;
					const gTile = globalStore.state.graphicalEntities[ent.graphicalId || mapEnt.entityId] || { char: '?', color: '#FFF' };
					char = gTile.char;
					color = gTile.color;
				}
				entitiesAtCell.push({ name, char, color });
			}
		}

		let entitiesHtml = '';
		if (entitiesAtCell.length > 0) {
			entitiesHtml = entitiesAtCell.map(e => `
				<div style="display: flex; align-items: center; gap: 5px;">
					<span style="color: ${e.color}; font-family: monospace; font-size: 14px;">${e.char}</span>
					<span>${e.name}</span>
				</div>
			`).join('');
		} else {
			entitiesHtml = '<span style="color: #666;">No entities here</span>';
		}

		inspectDisplay.innerHTML = `
			<div><strong>Coordinates:</strong> X: ${x}, Y: ${y}</div>
			<div><strong>Tile:</strong> ${tileName}</div>
			<div style="margin-top: 5px; font-weight: bold; border-top: 1px solid #333; padding-top: 3px;">Entities:</div>
			${entitiesHtml}
		`;
	}

	getSelectedTile() {
		return this.selectedTileId;
	}

	getBrushMode() {
		return this.brushMode;
	}
}

class MapRendererComponent {
	constructor() {
		globalStore.subscribe(GameStateKeys.Maps, () => { this.resize(); this.render(); });
		globalStore.subscribe(GameStateKeys.EditorCurrMap, () => { this.render(); });
		globalStore.subscribe(GameStateKeys.MapEntities, () => { this.render(); });
		globalStore.subscribe(GameStateKeys.EntitiesConfig, () => { this.render(); });
		this.rootElement = null;
		this.canvas = null;
		this.ctx = null;
		this.offsetX = 0;
		this.offsetY = 0;
		this.scale = 1;
		this.isDragging = false;
		this.isPainting = false;
		this.isPanning = false;
		this.lastMouseX = 0;
		this.lastMouseY = 0;
		this.resizeObserver = null;
		this.layers = {
			tiles: true,
			monsters: true,
			items: true,
			objects: true
		};
	}

	init(container) {
		this.container = container;
		this.rootElement = document.createElement('div');
		this.rootElement.style.cssText = `
			width: 100%;
			height: 100%;
			overflow: hidden;
			position: relative;
			background: #000;
			display: flex;
			flex-direction: column;
		`;

		this.layerBar = document.createElement('div');
		this.layerBar.style.cssText = `
			display: flex;
			gap: 8px;
			padding: 6px;
			background: #222;
			border-bottom: 1px solid #333;
			z-index: 10;
		`;

		const layerKeys = ['tiles', 'monsters', 'items', 'objects'];
		this.layerButtons = {};
		layerKeys.forEach(layer => {
			const btn = document.createElement('button');
			btn.textContent = layer.charAt(0).toUpperCase() + layer.slice(1);
			btn.className = 'layerBtn';
			btn.addEventListener('click', () => {
				this.layers[layer] = !this.layers[layer];
				if (this.layers[layer]) {
					btn.style.background = '#2563eb';
				} else {
					btn.style.background = '#374151';
				}
				this.render();
			});
			this.layerButtons[layer] = btn;
			this.layerBar.appendChild(btn);
		});
		this.rootElement.appendChild(this.layerBar);

		this.canvas = document.createElement('canvas');
		this.canvas.style.cssText = `
			display: block;
			image-rendering: pixelated;
			flex: 1;
			min-height: 0;
		`;
		this.ctx = this.canvas.getContext('2d');

		this.rootElement.appendChild(this.canvas);
		this.container.element.appendChild(this.rootElement);

		this.setupEvents();
		this.resize();
		this.render();

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(this.rootElement);

		container.on('destroy', () => this.destroy());
	}

	destroy() {
		if (this.resizeObserver) this.resizeObserver.disconnect();
		if (this.container) this.container.element.innerHTML = null;
		this.container = null;
		this.rootElement = null;
		this.canvas = null;
		this.ctx = null;
	}

	setupEvents() {
		this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
		this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
		this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
		this.canvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));
		this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
		this.canvas.addEventListener('wheel', (e) => this.onWheel(e), {passive: false});
	}

	getCurrentMap() {
		const currId = globalStore.state.editor?.currMapId;
		return currId ? globalStore.state.maps[currId] : null;
	}

	getTileSize() {
		try {
			return config.getConfigValue(MapEditorConfig.MAP_EDITOR_TILE_SIZE);
		} catch {
			return 16;
		}
	}

	screenToTile(screenX, screenY) {
		const rect = this.canvas.getBoundingClientRect();
		const x = screenX - rect.left;
		const y = screenY - rect.top;
		const tileSize = this.getTileSize() * this.scale;
		return {
			x: Math.floor((x - this.offsetX) / tileSize),
			y: Math.floor((y - this.offsetY) / tileSize)
		};
	}

	onMouseDown(e) {
		this.lastMouseX = e.clientX;
		this.lastMouseY = e.clientY;
		this.lastPaintedX = null;
		this.lastPaintedY = null;

		if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
			this.isDragging = true;
			e.preventDefault();
		} else if (e.button === 0) {
			const pos = this.screenToTile(e.clientX, e.clientY);
			const map = this.getCurrentMap();
			if (map && pos.x >= 0 && pos.x < map.width && pos.y >= 0 && pos.y < map.height) {
				const brushMode = brushPanelComponent.getBrushMode();
				if (brushMode === 'select') {
					brushPanelComponent.inspectCell(pos.x, pos.y);
				} else {
					this.isPainting = true;
					this.paintTile(pos.x, pos.y);
					this.lastPaintedX = pos.x;
					this.lastPaintedY = pos.y;
				}
			}
		} else if (e.button === 2) {
			this.isPanning = true;
			e.preventDefault();
		}
	}

	onMouseMove(e) {
		const dx = e.clientX - this.lastMouseX;
		const dy = e.clientY - this.lastMouseY;
		this.lastMouseX = e.clientX;
		this.lastMouseY = e.clientY;

		if (this.isDragging || this.isPanning) {
			this.offsetX += dx;
			this.offsetY += dy;
			this.render();
		} else if (this.isPainting) {
			const pos = this.screenToTile(e.clientX, e.clientY);
			if (pos.x !== this.lastPaintedX || pos.y !== this.lastPaintedY) {
				this.paintTile(pos.x, pos.y);
				this.lastPaintedX = pos.x;
				this.lastPaintedY = pos.y;
			}
		}
	}

	onMouseUp(e) {
		this.isDragging = false;
		this.isPainting = false;
		this.isPanning = false;
	}

	onWheel(e) {
		e.preventDefault();
		const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
		const newScale = Math.max(0.25, Math.min(4, this.scale * zoomFactor));
		const rect = this.canvas.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;
		this.offsetX = mouseX - (mouseX - this.offsetX) * (newScale / this.scale);
		this.offsetY = mouseY - (mouseY - this.offsetY) * (newScale / this.scale);
		this.scale = newScale;
		this.render();
	}

	paintTile(x, y) {
		const map = this.getCurrentMap();
		if (!map || x < 0 || x >= map.width || y < 0 || y >= map.height) return;

		const brushType = brushPanelComponent.activeBrushType;

		if (brushType === 'entity') {
			const activeEntity = brushPanelComponent.selectedEntity;
			if (activeEntity) {
				editorActions.dispatchOrAppend(
					MapPaintEntityCommand,
					{ mapId: map.id, entityId: activeEntity.entityId },
					{ x, y },
					10
				);
			}
		} else {
			const tileId = brushPanelComponent.getSelectedTile() ?? null;
			if (map.tiles[y][x] !== tileId) {
				const oldValue = map.tiles[y][x] ?? null;

				editorActions.dispatchOrAppend(
					MapPaintTileCommand,
					{ mapId: map.id, tileId: tileId },
					{ x, y, oldValue },
					10
				);
			}
		}
	}

	resize() {
		if (!this.rootElement) return;
		const rect = this.canvas.getBoundingClientRect();
		this.canvas.width = rect.width;
		this.canvas.height = rect.height;
		this.render();
	}

	render() {
		if (!this.rootElement) return;
		const map = this.getCurrentMap();
		if (!map) return;

		this.ctx.fillStyle = '#111';
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

		this.#renderTiles(map);

		this.#renderEntities(map);
	}

	#renderTiles(map){
		if (!this.layers.tiles) return;
		const tileSize = this.getTileSize() * this.scale;
		for (let y = 0; y < map.height; y++) {
			for (let x = 0; x < map.width; x++) {
				const tileId = map.tiles[y][x];
				if (!tileId) continue;
				const tile = globalStore.state.tileDictionary[tileId];
				if (!tile) continue;
				const gTile = globalStore.state.graphicalTiles[tile.graphicalId] || {char: '?', color: '#FFF'};
				const screenX = Math.floor(this.offsetX + x * tileSize);
				const screenY = Math.floor(this.offsetY + y * tileSize);
				this.ctx.fillStyle = gTile.color;
				this.ctx.font = `${tileSize}px monospace`;
				this.ctx.textAlign = 'center';
				this.ctx.textBaseline = 'middle';
				this.ctx.fillText(gTile.char, screenX + tileSize / 2, screenY + tileSize / 2);
			}
		}
	}

	#renderEntities(map){
		const tileSize = this.getTileSize() * this.scale;
		const mapEntities = globalStore.state.mapEntities[map.id];
		for (const mapEnt of mapEntities) {
			const entId = mapEnt.entityId;
			const ent = globalStore.state.monsters[entId] ||
				globalStore.state.items[entId] ||
				globalStore.state.mapObjects[entId];
			if (!ent) continue;

			let category = null;
			if (globalStore.state.monsters[entId]) category = 'monsters';
			else if (globalStore.state.items[entId]) category = 'items';
			else if (globalStore.state.mapObjects[entId]) category = 'objects';

			if (category && !this.layers[category]) continue;

			const gTile = globalStore.state.graphicalEntities[ent.graphicalId || entId] || {char: '?', color: '#FFF'};
			const screenX = Math.floor(this.offsetX + mapEnt.x * tileSize);
			const screenY = Math.floor(this.offsetY + mapEnt.y * tileSize);

			// Cover the tile behind it completely
			this.ctx.fillStyle = '#111';
			this.ctx.fillRect(screenX, screenY, tileSize, tileSize);

			this.ctx.fillStyle = gTile.color;
			this.ctx.font = `${tileSize}px monospace`;
			this.ctx.textAlign = 'center';
			this.ctx.textBaseline = 'middle';
			this.ctx.fillText(gTile.char, screenX + tileSize / 2, screenY + tileSize / 2);
		}

		this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
		this.ctx.lineWidth = 1;
		this.ctx.beginPath();
		for (let x = 0; x <= map.width; x++) {
			const screenX = this.offsetX + x * tileSize;
			this.ctx.moveTo(screenX, this.offsetY);
			this.ctx.lineTo(screenX, this.offsetY + map.height * tileSize);
		}
		for (let y = 0; y <= map.height; y++) {
			const screenY = this.offsetY + y * tileSize;
			this.ctx.moveTo(this.offsetX, screenY);
			this.ctx.lineTo(this.offsetX + map.width * tileSize, screenY);
		}
		this.ctx.stroke();

		this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
		this.ctx.lineWidth = 2;
		this.ctx.beginPath();
		this.ctx.rect(this.offsetX, this.offsetY, map.width * tileSize, map.height * tileSize);
		this.ctx.stroke();
	}

}

export const tileDictionaryWidget = new TileDictionaryWidget();
export const mapPropertiesComponent = new MapPropertiesComponent();
export const brushPanelComponent = new BrushPanelComponent();
export const mapRendererComponent = new MapRendererComponent();

function initMapEditor() {
	gui.registerMenuBtn("mainMapEditor", "Map", "Editor", () => {
		gui.openWorkspaceClick({
			components: ['MapProperties', 'TileDictionary', 'BrushPanel', 'Renderer'],
			layoutConfig: {
				type: 'row',
				content: [
					{
						type: 'column',
						width: 40,
						content: [
							{type: 'component', componentType: 'MapProperties'},
							{type: 'component', componentType: 'TileDictionary'},
							{type: 'component', componentType: 'BrushPanel'}
						]
					},
					{
						type: 'stack',
						width: 60,
						content: [
							{type: 'component', componentType: 'Renderer'},
							{type: 'ROOT'}
						]
					}
				]
			}
		});
	});

	gui.registerComponent('TileDictionary', 'Map tiles', null, (container, state) => {
		tileDictionaryWidget.init(container);
	});

	gui.registerComponent('MapProperties', 'Map properties', null, (container, state) => {
		mapPropertiesComponent.init(container);
	});

	gui.registerComponent('BrushPanel', 'Brush', null, (container, state) => {
		brushPanelComponent.init(container);
	});

	gui.registerComponent('Renderer', 'Map view', null, (container, state) => {
		mapRendererComponent.init(container);
	});
}

initMapEditor();
