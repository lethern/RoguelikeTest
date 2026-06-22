import {BaseCommand, commandRegistry} from '../historyNode.js';
import {actions} from '../historyStorage.js';
import {gui} from "../gui.js";
import {globalStore, GameStateKeys} from "../globalStore.js";
import {editorEvents, EditorEvents} from './editorEvents.js';
import {CryptoRandom} from "../utils/random.js";


class AttributeConfigWidget {
	constructor() {
		globalStore.subscribe(GameStateKeys.AttributesConfig, () => this.render());
	}

	init(container){
		this.container = container;

		container.on('destroy', () => {
			this.destroy();
		});

		this.element = document.createElement('div');
		this.element.className = 'rl-editor';
		this.element.addEventListener('click', this.onClick.bind(this));
		this.element.addEventListener('change', this.onChange.bind(this));

		this.container.element.appendChild(this.element);

		this.render();
	}

	destroy(){
		if(this.container) this.container.innerHTML = null;
		this.container = null;
		this.element = null;
	}

	render() {
		if(!this.container) return;
		const attrs = globalStore.state.attributes;
		let html = `
			<div class="rl-header">
				<h3>Attributes</h3>
				<button class="rl-btn rl-btn-primary" data-action="add_attr">Add New</button>
			</div>
			<div class="attr-list">
		`;

		for (const it in attrs) {
			const attr = attrs[it];
			html += `
				<div class="rl-row" data-id="${attr.id}">
					<input type="text" class="rl-input" data-field="id" value="${attr.id}" placeholder="ID" disabled>
					<input type="text" class="rl-input" data-field="name" value="${attr.name}" placeholder="Name">
					<select class="rl-select" data-field="type">
						<option value="single" ${attr.type === 'single' ? 'selected' : ''}>Value</option>
						<option value="range" ${attr.type === 'range' ? 'selected' : ''}>Range</option>
						<option value="dice" ${attr.type === 'dice' ? 'selected' : ''}>Dice</option>
					</select>
					<button class="rl-btn rl-btn-danger" data-action="remove_attr">Remove</button>
				</div>
			`;
		}

		html += `</div>`;
		this.element.innerHTML = html;
	}

	onClick(e) {
		if (e.target.dataset.action === 'add_attr') {
			const newId = CryptoRandom.generateId();
			//globalStore.dispatch({ type: "attr_add", id: newId, name: "New Attribute", valType: "single" });
			actions.dispatch(new AttrAddCommand({ id: newId, name: "New Attribute", valType: "single" }));
		} else if (e.target.dataset.action === 'remove_attr') {
			const id = e.target.closest('.rl-row').dataset.id;
			//globalStore.dispatch({ type: "attr_remove", id: id });
		}
	}

	onChange(e) {
		if (e.target.dataset.field) {
			const id = e.target.closest('.rl-row').dataset.id;
			const field = e.target.dataset.field;
			const value = e.target.value;
			//globalStore.dispatch({ type: "attr_update", id: id, field: field, value: value });
			actions.dispatch(new AttrUpdateCommand({ id, field, newValue: value }));
		}
	}
}

//#region AttributeConfig commands
class AttrAddCommand extends BaseCommand {
	constructor(data) {
		super(data);
	}
	execute() {
		globalStore.state.attributes[this.data.id] = {
			id: this.data.id,
			name: this.data.name,
			type: this.data.valType
		};
		globalStore.notify(GameStateKeys.AttributesConfig);
	}
	undo() {
		delete globalStore.state.attributes[this.data.id];
		globalStore.notify(GameStateKeys.AttributesConfig);
	}
}
commandRegistry.register(AttrAddCommand);

class AttrUpdateCommand extends BaseCommand {
	/**@param {{id: string, field: string, newValue: string, oldValue: string}} data */
	constructor(data) {
		if(data.oldValue === undefined)
			data.oldValue = (globalStore.state.attributes[data.id] ? (globalStore.state.attributes[data.id][data.field] || null): null);
		super(data);
	}
	execute() {
		if (globalStore.state.attributes[this.data.id]) {
			globalStore.state.attributes[this.data.id][this.data.field] = this.data.newValue;
			globalStore.notify(GameStateKeys.AttributesConfig);
		}
	}
	undo() {
		if (globalStore.state.attributes[this.data.id]) {
			globalStore.state.attributes[this.data.id][this.data.field] = this.data.oldValue;
			globalStore.notify(GameStateKeys.AttributesConfig);
		}
	}
}
commandRegistry.register(AttrUpdateCommand);
//#endregion


const attributeConfigWidget = new AttributeConfigWidget();

gui.registerComponent("attributeConfig", "Attributes", "Editor", (container, state) => {
	console.log("open Attributes")
	attributeConfigWidget.init(container);
});


function expandHex(hex) {
	if (hex.length === 4) {
		return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
	}
	return hex;
}

class EntityAddCommand extends BaseCommand {
	static friendlyName = 'Add Entity';
	constructor(data) {
		super(data);
	}
	execute() {
		const { category, id, name, graphicalId } = this.data;
		globalStore.state[category][id] = {
			id,
			name,
			attrs: {},
			graphicalId
		};
		globalStore.notify(GameStateKeys.EntitiesConfig);
	}
	undo() {
		const { category, id } = this.data;
		delete globalStore.state[category][id];
		globalStore.notify(GameStateKeys.EntitiesConfig);
	}
}
commandRegistry.register(EntityAddCommand);

class GraphicEntityAddCommand extends BaseCommand {
	static friendlyName = 'Add Graphic Entity';
	constructor(data) {
		super(data);
	}
	execute() {
		const { id, char, color } = this.data;
		globalStore.state.graphicalEntities[id] = {
			id,
			char,
			color
		};
		globalStore.notify(GameStateKeys.EntitiesConfig);
	}
	undo() {
		const { id } = this.data;
		delete globalStore.state.graphicalEntities[id];
		globalStore.notify(GameStateKeys.EntitiesConfig);
	}
}
commandRegistry.register(GraphicEntityAddCommand);

class EntityUpdateCommand extends BaseCommand {
	static friendlyName = 'Update Entity';
	constructor(data) {
		if (data.oldValue === undefined) {
			const entity = globalStore.state[data.category][data.id];
			data.oldValue = entity ? entity[data.field] : null;
		}
		super(data);
	}
	execute() {
		const { category, id, field, newValue } = this.data;
		if (globalStore.state[category][id]) {
			globalStore.state[category][id][field] = newValue;
			globalStore.notify(GameStateKeys.EntitiesConfig);
		}
	}
	undo() {
		const { category, id, field, oldValue } = this.data;
		if (globalStore.state[category][id]) {
			globalStore.state[category][id][field] = oldValue;
			globalStore.notify(GameStateKeys.EntitiesConfig);
		}
	}
}
commandRegistry.register(EntityUpdateCommand);

class EntityAttributeUpdateCommand extends BaseCommand {
	static friendlyName = 'Update Entity Attribute';
	constructor(data) {
		if (data.oldValue === undefined) {
			const entity = globalStore.state[data.category][data.id];
			data.oldValue = (entity && entity.attrs && entity.attrs[data.attrId]) ? entity.attrs[data.attrId].val : null;
		}
		super(data);
	}
	execute() {
		const { category, id, attrId, valType, newValue } = this.data;
		const entity = globalStore.state[category][id];
		if (entity) {
			if (!entity.attrs) entity.attrs = {};
			if (newValue === null) {
				delete entity.attrs[attrId];
			} else {
				entity.attrs[attrId] = { type: valType, val: newValue };
			}
			globalStore.notify(GameStateKeys.EntitiesConfig);
		}
	}
	undo() {
		const { category, id, attrId, oldValue } = this.data;
		const entity = globalStore.state[category][id];
		if (entity && entity.attrs) {
			if (oldValue === null) {
				delete entity.attrs[attrId];
			} else {
				const attr = globalStore.state.attributes[attrId];
				entity.attrs[attrId] = { type: attr ? attr.type : 'single', val: oldValue };
			}
			globalStore.notify(GameStateKeys.EntitiesConfig);
		}
	}
}
commandRegistry.register(EntityAttributeUpdateCommand);

class EntityGraphicUpdateCommand extends BaseCommand {
	static friendlyName = 'Update Entity Graphic';
	constructor(data) {
		if (data.oldValue === undefined) {
			const gTile = globalStore.state.graphicalEntities[data.graphicalId];
			data.oldValue = gTile ? gTile[data.field] : null;
		}
		super(data);
	}
	execute() {
		globalStore.state.graphicalEntities[this.data.graphicalId][this.data.field] = this.data.newValue;
		globalStore.notify(GameStateKeys.EntitiesConfig);
	}
	undo() {
		if (globalStore.state.graphicalEntities[this.data.graphicalId]) {
			globalStore.state.graphicalEntities[this.data.graphicalId][this.data.field] = this.data.oldValue;
			globalStore.notify(GameStateKeys.EntitiesConfig);
		}
	}
}
commandRegistry.register(EntityGraphicUpdateCommand);

class EntityEditorWidget {
	constructor() {
		this.activeCategory = 'monsters';
		this.activeEntityId = null;
		this.rootElement = null;

		globalStore.subscribe(GameStateKeys.EntitiesConfig, () => this.refreshUI());
		globalStore.subscribe(GameStateKeys.AttributesConfig, () => this.refreshUI());
	}

	init(container) {
		this.container = container;
		this.rootElement = document.createElement('div');
		this.rootElement.className = 'entity-editor-widget editor-widget editor-panel';
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

	buildUI() {
		this.rootElement.innerHTML = `
			<div class="entity-widget editor-panel" style="display: flex; flex-direction: column; height: 100%;">
				<div class="editor-toolbar" style="display: flex; flex-direction: column; gap: 5px; padding: 10px; border-bottom: 1px solid #333;">
					<div class="category-buttons" style="display: flex; gap: 5px;">
						<button id="catMonsters" class="cat-btn">Monsters</button>
						<button id="catItems" class="cat-btn">Items</button>
						<button id="catMapObjects" class="cat-btn">Map Objects</button>
					</div>
					<div style="display: flex; gap: 5px;">
						<input type="text" id="searchEntityName" placeholder="Search name..." class="search-name" style="flex: 1; padding: 4px; border: 1px solid #444; background: #222; color: #fff; border-radius: 4px;">
						<button id="btnCreateEntity" style="padding: 4px 8px; cursor: pointer;">New Entry</button>
					</div>
				</div>
				<div class="editor-main" style="display: flex; flex: 1; overflow: hidden;">
					<div id="entityList" class="editor-list" style="width: 200px; border-right: 1px solid #333; overflow-y: auto;"></div>
					<div id="entityEditor" class="editor-content" style="flex: 1; display: none; padding: 10px; overflow-y: auto;">
						<canvas id="entityCanvas" width="64" height="64" class="editor-canvas" style="display: block; margin-bottom: 10px; background: #222; border: 1px solid #444; border-radius: 4px;"></canvas>
						<div id="entityPropertiesPanel" style="display: flex; flex-direction: column; gap: 10px;"></div>
					</div>
				</div>
			</div>
		`;

		this.rootElement.querySelector('#catMonsters').addEventListener('click', () => this.setCategory('monsters'));
		this.rootElement.querySelector('#catItems').addEventListener('click', () => this.setCategory('items'));
		this.rootElement.querySelector('#catMapObjects').addEventListener('click', () => this.setCategory('mapObjects'));

		this.rootElement.querySelector('#btnCreateEntity').addEventListener('click', () => {
			CryptoRandom.generateId()

			let char = '?';
			let color = '#ffffff';
			if (this.activeCategory === 'monsters') { char = 'M'; color = '#f87171'; }
			else if (this.activeCategory === 'items') { char = 'I'; color = '#fbbf24'; }
			else if (this.activeCategory === 'mapObjects') { char = 'O'; color = '#34d399'; }


			const graphicalId = CryptoRandom.generateId();
			actions.dispatch(new GraphicEntityAddCommand({
				id: graphicalId,
				char,
				color
			}));
			//////
			const id = CryptoRandom.generateId();
			actions.dispatch(new EntityAddCommand({
				category: this.activeCategory,
				id,
				name: 'New ' + (this.activeCategory === 'monsters' ? 'Monster' : this.activeCategory === 'items' ? 'Item' : 'Object'),
				graphicalId
			}));
			this.selectEntity(id);
		});

		this.rootElement.querySelector('#searchEntityName').addEventListener('input', () => this.refreshList());
		this.updateCategoryButtons();
	}

	setCategory(category) {
		this.activeCategory = category;
		this.activeEntityId = null;
		this.updateCategoryButtons();
		this.refreshUI();
	}

	updateCategoryButtons() {
		const buttons = this.rootElement.querySelectorAll('.cat-btn');
		buttons.forEach(btn => {
			btn.style.background = '#374151';
			btn.style.color = '#e5e7eb';
			btn.style.border = 'none';
			btn.style.padding = '4px 8px';
			btn.style.cursor = 'pointer';
			btn.style.borderRadius = '4px';
		});
		const btnId = this.activeCategory === 'monsters' ? 'catMonsters' : this.activeCategory === 'items' ? 'catItems' : 'catMapObjects';
		const activeBtn = this.rootElement.querySelector(`#${btnId}`);
		if (activeBtn) {
			activeBtn.style.background = '#2563eb';
			activeBtn.style.color = 'white';
		}
	}

	refreshUI() {
		if (!this.rootElement) return;
		this.refreshList();
		if (this.activeEntityId && globalStore.state[this.activeCategory] && globalStore.state[this.activeCategory][this.activeEntityId]) {
			this.renderEditor(this.activeEntityId);
		} else {
			this.rootElement.querySelector('#entityEditor').style.display = 'none';
		}
	}

	refreshList() {
		const list = this.rootElement.querySelector('#entityList');
		list.innerHTML = '';
		const searchNameEl = this.rootElement.querySelector('#searchEntityName');
		const nameQuery = searchNameEl ? searchNameEl.value.toLowerCase() : '';

		const categoryDict = globalStore.state[this.activeCategory] || {};
		const filteredEntities = Object.values(categoryDict).filter(ent => {
			return ent.name.toLowerCase().includes(nameQuery);
		});

		filteredEntities.sort((a, b) => {
			const aParts = a.id.split('_');
			const bParts = b.id.split('_');
			const aTime = aParts.length > 1 ? (parseInt(aParts[1], 10) || 0) : 0;
			const bTime = bParts.length > 1 ? (parseInt(bParts[1], 10) || 0) : 0;
			if (aTime !== bTime) {
				return bTime - aTime;
			}
			return a.name.localeCompare(b.name);
		});

		for (const ent of filteredEntities) {
			const item = this.#drawListElem(ent);
			list.appendChild(item);
		}
	}

	#drawListElem(ent) {
		const item = document.createElement('div');
		item.className = 'tile-list-item';
		if (ent.id === this.activeEntityId) {
			item.classList.add('active');
		}

		const canvas = document.createElement('canvas');
		canvas.width = 18;
		canvas.height = 18;
		canvas.style.flexShrink = '0';
		const ctx = canvas.getContext('2d');

		const graphicalId = ent.graphicalId || ent.id;
		const gTile = globalStore.state.graphicalEntities[graphicalId] || { char: '?', color: '#FFF' };

		ctx.fillStyle = gTile.color;
		ctx.font = '14px monospace';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(gTile.char, canvas.width / 2, canvas.height / 2);

		const label = document.createElement('span');
		label.textContent = ent.name;

		item.appendChild(canvas);
		item.appendChild(label);

		item.addEventListener('click', () => this.selectEntity(ent.id));

		return item;
	}

	selectEntity(id) {
		this.activeEntityId = id;
		editorEvents.emit(EditorEvents.ENTITY_SELECTED, {category: this.activeCategory, id});
		this.refreshUI();
	}

	renderEditor(id) {
		const ent = globalStore.state[this.activeCategory][id];
		const editor = this.rootElement.querySelector('#entityEditor');
		const props = this.rootElement.querySelector('#entityPropertiesPanel');
		editor.style.display = 'block';

		const graphicalId = ent.graphicalId || id;
		const gTile = globalStore.state.graphicalEntities[graphicalId] || {char: '?', color: '#ffffff'};

		let html = `
			<div><label>Name: <input type="text" id="entName" value="${ent.name}"></label></div>
			<div><label>Char (1-char): <input type="text" id="entChar" maxlength="1" value="${gTile.char}" style="width: 30px; text-align: center;"></label></div>
			<div><label>Color: <input type="color" id="entColor" value="${gTile.color.length === 4 ? expandHex(gTile.color) : gTile.color}"></label></div>
			<div style="margin-top: 10px; font-weight: bold; border-top: 1px solid #444; padding-top: 10px;">Attributes</div>
			<div id="attrsContainer" style="display: flex; flex-direction: column; gap: 5px; margin-top: 5px;">
		`;

		const allAttributes = Object.values(globalStore.state.attributes);
		for (const attr of allAttributes) {
			const hasAttr = ent.attrs && ent.attrs[attr.id] !== undefined;
			const attrVal = hasAttr ? ent.attrs[attr.id].val : '';
			html += `
				<div style="display: flex; align-items: center; gap: 8px;">
					<input type="checkbox" class="attr-enable" data-attr-id="${attr.id}" ${hasAttr ? 'checked' : ''}>
					<span style="flex: 1; font-size: 13px;">${attr.name} (${attr.type})</span>
					<input type="text" class="attr-val-input" data-attr-id="${attr.id}" data-attr-type="${attr.type}" value="${attrVal}" style="width: 100px;" ${hasAttr ? '' : 'disabled'}>
				</div>
			`;
		}

		if (ent.attrs) {
			const configAttrs = globalStore.state.attributes;
			for (const attrId in ent.attrs) {
				if (!configAttrs[attrId]) {
					const mAttr = ent.attrs[attrId];
					html += `
						<div style="display: flex; align-items: center; gap: 8px; color: #f87171;">
							<input type="checkbox" class="attr-enable" data-attr-id="${attrId}" checked>
							<span style="flex: 1; font-size: 13px; font-weight: bold;">[Orphaned] ${attrId} (${mAttr.type})</span>
							<input type="text" class="attr-val-input" data-attr-id="${attrId}" data-attr-type="${mAttr.type}" value="${mAttr.val}" style="width: 100px;">
						</div>
					`;
				}
			}
		}

		html += `</div>`;
		props.innerHTML = html;

		props.querySelector('#entName').addEventListener('change', (e) => {
			actions.dispatch(new EntityUpdateCommand({category: this.activeCategory, id, field: 'name', newValue: e.target.value}));
		});

		props.querySelector('#entChar').addEventListener('change', (e) => {
			const val = e.target.value || '?';
			actions.dispatch(new EntityGraphicUpdateCommand({graphicalId, field: 'char', newValue: val}));
		});

		props.querySelector('#entColor').addEventListener('change', (e) => {
			actions.dispatch(new EntityGraphicUpdateCommand({graphicalId, field: 'color', newValue: e.target.value}));
		});

		props.querySelectorAll('.attr-enable').forEach(checkbox => {
			checkbox.addEventListener('change', (e) => {
				const attrId = e.target.dataset.attrId;
				const attr = globalStore.state.attributes[attrId];
				const valInput = props.querySelector(`.attr-val-input[data-attr-id="${attrId}"]`);
				const valType = attr ? attr.type : (ent.attrs[attrId]?.type || 'single');
				if (e.target.checked) {
					valInput.disabled = false;
					actions.dispatch(new EntityAttributeUpdateCommand({
						category: this.activeCategory,
						id,
						attrId,
						valType,
						newValue: valInput.value || '10'
					}));
				} else {
					valInput.disabled = true;
					actions.dispatch(new EntityAttributeUpdateCommand({
						category: this.activeCategory,
						id,
						attrId,
						valType,
						newValue: null
					}));
				}
			});
		});

		props.querySelectorAll('.attr-val-input').forEach(input => {
			input.addEventListener('change', (e) => {
				const attrId = e.target.dataset.attrId;
				const valType = e.target.dataset.attrType;
				actions.dispatch(new EntityAttributeUpdateCommand({
					category: this.activeCategory,
					id,
					attrId,
					valType,
					newValue: e.target.value
				}));
			});
		});

		this.drawCanvas(graphicalId);
	}

	drawCanvas(graphicalId) {
		const canvas = this.rootElement.querySelector('#entityCanvas');
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#222';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		const gTile = graphicalId ? globalStore.state.graphicalEntities[graphicalId] : {char: '?', color: '#FFF'};
		ctx.fillStyle = gTile.color;
		ctx.font = '32px monospace';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(gTile.char, canvas.width / 2, canvas.height / 2);
	}
}

const entityEditorWidget = new EntityEditorWidget();

gui.registerComponent("entityEditor", "Entities", "Editor", (container, state) => {
	entityEditorWidget.init(container);
});

/*
class MapGenModule {
	constructor() {
		gui.registerComponent("mapGen", "Map Gen", "Dev",(container, state) => {
			const canvas = document.createElement("canvas");
			canvas.width = 200;
			canvas.height = 100;
			const ctx = canvas.getContext("2d");
			ctx.fillStyle = "white";
			ctx.font = "20px Arial";
			ctx.fillText("mapGen", 10, 50);
			container.element.appendChild(canvas);
		});
	}
}

class ScriptEditModule {
	constructor() {
		gui.registerComponent("scriptEdit", "Script Edit", "Dev",(container, state) => {
			container.element.innerHTML = "<h3>Script Editor</h3>";
		});
	}
}

const mapGenMod = new MapGenModule();
const scriptEditMod = new ScriptEditModule();
*/