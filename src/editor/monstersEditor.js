import {actions, BaseCommand, commandRegistry} from '../actionsHistory.js';
import {gui} from "../gui.js";

const GameStateKeys = {
	AttributesConfig: "AttributesConfig",
	MonstersConfig: "MonstersConfig",
};

class GameState {
	constructor() {
		this.state = {
			attributes: {},
			monsters: {},
			blueprints: {}
		};
		this.listeners = {};
	}

	setState(newState) {
		this.state = newState;
		this.notify();
	}

	subscribe(key, callback) {
		//this.listeners.push(callback);
		if (!this.listeners[key]) this.listeners[key] = new Set();
		this.listeners[key].add(callback);
	}

	notify(key) {
		this.listeners[key]?.forEach(cb => cb(this.state));
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

export const globalStore = new GameState();



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
			const newId = "attr_" + Date.now();
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
	/**@param {{id: string, field: string, newValue: string}} data */
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



class MonsterEditorWidget {
	constructor(container) {
		console.log("new MonsterEditorWidget")
		this.container = container;
		this.element = document.createElement('div');
		this.element.className = 'rl-editor';
		this.container.element.appendChild(this.element);

		// Current monster being edited (could also be part of global state if needed)
		this.activeMonsterId = null;

		globalStore.subscribe(GameStateKeys.MonstersConfig, () => this.render());
		this.element.addEventListener('change', this.onChange.bind(this));

		// For demonstration, let's inject a dummy monster if none exists
		if (Object.keys(globalStore.state.monsters).length === 0) {
			globalStore.state.monsters["m1"] = {
				id: "m1",
				name: "Test Goblin",
				attrs: { "hp": { type: "single", val: 10 }, "old_stat": { type: "single", val: 5 } }
			};
			this.activeMonsterId = "m1";
		}

		this.render();
	}

	render() {
		if (!this.activeMonsterId) {
			this.element.innerHTML = `<h3>Monster Editor</h3><p>Select a monster...</p>`;
			return;
		}

		const monster = globalStore.state.monsters[this.activeMonsterId];
		const configAttrs = globalStore.state.attributes;

		let html = `
            <div class="rl-header">
                <h3>Editing: ${monster.name}</h3>
            </div>
            <div class="monster-attrs">
        `;

		// Loop through the monster's current attributes
		for (const attrId in monster.attrs) {
			const mAttr = monster.attrs[attrId];

			// Check if attribute still exists in configuration
			const isOrphaned = !configAttrs[attrId];
			const rowClass = isOrphaned ? "rl-row orphaned-attr" : "rl-row";
			const displayName = isOrphaned ? attrId : configAttrs[attrId].name;

			html += `
                <div class="${rowClass}" data-attr-id="${attrId}">
                    <span style="width: 100px; font-weight: bold;">${displayName}</span>
                    <input type="text" class="rl-input" data-field="val" value="${mAttr.val}" style="width: 150px;">
                    <span style="color: #666; font-size: 12px;">Type: ${mAttr.type}</span>
                </div>
            `;
		}

		html += `</div>`;
		this.element.innerHTML = html;
	}

	onChange(e) {
		if (e.target.dataset.field === 'val') {
			const attrId = e.target.closest('.rl-row').dataset.attrId;
			const value = e.target.value;
			const currentType = globalStore.state.monsters[this.activeMonsterId].attrs[attrId].type;

			//globalStore.dispatch({
			//	type: "monster_modify_attribute",
			//	monster_id: this.activeMonsterId,
			//	attribute_id: attrId,
			//	valType: currentType,
			//	value: value
			//});
		}
	}
}




const attributeConfigWidget = new AttributeConfigWidget();


gui.registerComponent("attributeConfig", "Attributes", "Edytor", (container, state) => {
	console.log("open Attributes")
	attributeConfigWidget.init(container);
});

gui.registerComponent("monsters", "Monsters", "Edytor",(container, state) => {
	console.log("open MonsterEditorWidget")
	new MonsterEditorWidget(container);
});

// ioManager.attachListener("menuClick", (data) => {
// 	if (data.id === "attributeConfig") gui.showComponent("map");
// });
// ioManager.attachListener("menuClick", (data) => {
// 	if (data.id === "monsters") gui.showComponent("map");
// });



//#region temp

//import { ioManager } from './iomanager.js';

class MapModule {
	constructor() {
		gui.registerComponent("map", "Map", "Edytor",(container, state) => {
			container.element.innerHTML = "<h3>Map Editor</h3>";
		});
		// ioManager.attachListener("menuClick", (data) => {
		// 	if (data.id === "map") gui.showComponent("map");
		// });
	}
}

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
		// ioManager.attachListener("menuClick", (data) => {
		// 	if (data.id === "mapGen") {
		// 		gui.showComponent("mapGen");
		// 	}
		// });
	}
}

class ScriptEditModule {
	constructor() {
		gui.registerComponent("scriptEdit", "Script Edit", "Dev",(container, state) => {
			container.element.innerHTML = "<h3>Script Editor</h3>";
		});
		// ioManager.attachListener("menuClick", (data) => {
		// 	if (data.id === "scriptEdit") gui.showComponent("scriptEdit");
		// });
	}
}

//const monstersMod = new MonstersModule();
const mapMod = new MapModule();
const mapGenMod = new MapGenModule();
const scriptEditMod = new ScriptEditModule();

//#endregion