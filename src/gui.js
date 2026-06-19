import { GoldenLayout, LayoutConfig } from '../libs/goldenLayoutBundle/esm/golden-layout.js';
import {actions} from './actionsHistory.js';
import {BaseCommand, commandRegistry} from './actionsHistory.js'
import EventEmitter from './utils/eventEmitter.js';

class GUILayout{
	preventEvents = false;

	/** @type {GUI} */
	#owner;

	/** @type {GoldenLayout} */
	#layout;
	#registeredComponents = {};

	#lastFocusedComponent;
	#lastMainWidth = 0;
	#lastMainHeight = 0;
	/** @type {string} */
	#lastLayoutSave
	#preventLayoutSaving = false;

	constructor(owner) {
		this.#owner = owner;
	}

	#getTestLayout(){
		return {
			root: {
				type: 'row',
				content: [
					{
						type: 'stack',
						id: 'leftStack',
						content: [this.#makeLayoutElement("testComponent")]
					},
					//{
					//	type: 'column',
					//	content: [
					//		{
					//			type: 'stack',
					//			id: 'rightTopStack',
					//			content: [this.#makeLayoutElement("testComponent")]
					//		},
					//		{
					//			type: 'stack',
					//			id: 'rightBottomStack',
					//			content: [this.#makeLayoutElement("testComponent")]
					//		}
					//	]
					//}
				]
			}
		};
	}

	#layoutInitializeHeaders(config) {
		toggleHeaders(config.root);

		function toggleHeaders(node, freeze) {
			if (!node) return;

			if (!node.header) node.header = {};
			node.header.popout = false;
			node.header.maximise = false;
			//node.header.close = false;

			if (node.content && Array.isArray(node.content)) {
				node.content.forEach(child => toggleHeaders(child, freeze));
			}
		}
	}

	#makeLayoutElement(name) {
		const component = this.#registeredComponents[name];
		return {
			type: 'component',
			componentType: name,
			title: component.title,
		}
	}

	#findComponentInTree(item, componentType) {
		if (!item) return null;
		if (item.type === 'component' && item.componentType === componentType) {
			return item;
		}
		if (item.contentItems) {
			for (const child of item.contentItems) {
				const found = this.#findComponentInTree(child, componentType);
				if (found) return found;
			}
		}
		return null;
	}

	findComponent(name){
		return this.#findComponentInTree(this.#layout.rootItem, name)
	}

	#findFirstStack(item) {
		if (item.type === 'stack') return item;
		if (item.contentItems) {
			for (const child of item.contentItems) {
				const found = this.#findFirstStack(child);
				if (found) return found;
			}
		}
		return null;
	}

	init(){
		this.#owner.registerComponent("testComponent", "test", "Dev",(container, state) => {
			container.element.innerHTML = `<h2>${state.label}</h2>`;
		})

		const container = document.getElementById("mainLayout");
		const config = this.#getTestLayout();

		this.#layout = new GoldenLayout(container);
		this.#layout.resizeWithContainerAutomatically = true;
		this.#layout.resizeDebounceInterval = 300;

		for (const name in this.#registeredComponents) {
			this.#layout.registerComponentFactoryFunction(name, this.#registeredComponents[name].onRender);
		}

		this.#attachListeners();

		this.#layoutInitializeHeaders(config);
		this.#layout.loadLayout(config);
		this.#updateLayoutSaved();
	}

	#attachListeners() {
		this.#layout.on('itemCreated', (event) => {
			const item = event.target;
			if (item.isComponent) {
				item.on('focus', (e) => {
					if(e.target.componentType && !this.preventEvents) {
						let prevId = this.#lastFocusedComponent ? this.#lastFocusedComponent.componentType : null;
						actions.recordDispatched(new FocusWidgetCommand({id: e.target.componentType, prevId}));
						this.#lastFocusedComponent = e.target;
					}
				});

				item.on('itemDestroyed', (e) => {
					if(e.target.componentType && !this.preventEvents) {
						actions.recordDispatched(new DestroyWidgetCommand({id: e.target.componentType, prevLayout: this.#lastLayoutSave}));
					}
				});

				const container = item._container;
				container.on('resize', () => {
					if((container.savedWidth !== container.width || container.savedHeight !== container.height)
							&& !this.preventEvents && container.width !== 0 && container.height !== 0 )
					{
						const isUiSkip = (container.savedWidth===undefined || this.#preventLayoutSaving);
						actions.recordDispatched(new ResizeWidgetCommand({id: container.componentType, width: container.width, height: container.height,
							prevWidth: container.savedWidth, prevHeight: container.savedHeight}, isUiSkip));
						container.savedWidth = container.width;
						container.savedHeight = container.height;
					}

					const main = document.getElementById('main');
					const rect = main.getBoundingClientRect();
					if(rect.width !== this.#lastMainWidth || rect.height !== this.#lastMainHeight) {
						this.#lastMainWidth = rect.width;
						this.#lastMainHeight = rect.height;
						this.#owner.sendLayoutResize();
					}
				});
			}
			this.#lastFocusedComponent = item;
		});

		this.#layout.on('tabCreated', (tab) => {
			tab._dragListener.on('dragStart', () => {
				this.#preventLayoutSaving = true;
				console.log('dragStart')
			});
		});

		this.#layout.on('dragStart', (item) => {
			console.log('dragStart')
		});
		this.#layout.on('dragEnd', (item) => {
			console.log('dragEnd')
		});
		this.#layout.on('itemDropped', (item) => {
			this.#preventLayoutSaving = false;
			if (item.isComponent) {
				//const layoutSave = this.#layout.saveLayout();
				const prevSave = this.#lastLayoutSave;
				this.#updateLayoutSaved();
				actions.recordDispatched(new SyncLayoutCommand({layout: this.#lastLayoutSave, prevLayout: prevSave}));
				console.log('itemDropped', prevSave)
				console.log("-> ", this.#lastLayoutSave);
				//recordReplayAction('move', item.config.id, {
				//	newTreeConfig: this.#layout.toConfig()
				//});
				this.#lastFocusedComponent = item;
				//this.#lastLayoutSave = layoutSave;
			}
		});

		this.#layout.on("stateChanged", () => {
			this.#updateLayoutSaved();
		});
	}

	#updateLayoutSaved(){
		if(this.#preventLayoutSaving) return;

		const layoutConfig = this.#layout.saveLayout();
		this.#lastLayoutSave = this.#stripLayoutState(layoutConfig);

		//console.log("current ", this.#lastLayoutSave);
		//console.log("stateChanged ", this.#lastLayoutSave);
		//const layoutJson = JSON.stringify(layoutSlim);
		//const changed = layoutJson !== this.#lastLayoutSave;
		//this.#lastLayoutSave = layoutJson;
		//console.log("stateChanged, changed "+changed+", full "+JSON.stringify(LayoutConfig.fromResolved(layoutConfig).root).length+", slim "+layoutJson.length);
		//console.log(layoutJson)
	}

	#stripLayoutState(layoutConfig) {
		const layout = LayoutConfig.fromResolved(layoutConfig);
		return slim(layout.root);

		function slim(node) {
			if (!node) return node;

			const out = {
				type: node.type,
				content: []
			};

			if(node.activeItemIndex) out.activeItemIndex = node.activeItemIndex;

			if (node.componentType || node.componentName) {
				out.componentType = node.componentType || node.componentName;
				//out.state = node.state || {};
			}

			if (Array.isArray(node.content)) {
				out.content = node.content.map(slim);
			}
			if (node.type === "component") {
				out.componentType = node.componentType;

				if (node.title) out.title = node.title;
				if (node.size) out.size = node.size;
			}

			return out;
		}
	}

	syncLayout(layout){
		const layoutConfig = this.#layout.saveLayout();
		const layoutCurrent = LayoutConfig.fromResolved(layoutConfig);
		layoutCurrent.root = layout;
		this.#layoutInitializeHeaders(layoutCurrent)
		this.#layout.loadLayout(layoutCurrent);
	}

	/** @param {(container:any, state: any) => void} onRender */
	registerComponent(name, title, onRender){
		if(this.#registeredComponents[name]) throw new Error(`registerComponent: the ${name} name already exists`)
		this.#registeredComponents[name] = { title, onRender, visible: false };
	}

	focusComponent(name, component = undefined){
		const root = this.#layout.rootItem;
		if(!component) component = this.#findComponentInTree(root, name);

		if (component) {
			if (component.parentItem && component.parentItem.type === 'stack') {
				component.parentItem.setActiveComponentItem(component);
			}
		}
	}

	showComponent(name) {
		const root = this.#layout.rootItem;
		const existing = this.#findComponentInTree(root, name);

		if (existing) {
			this.focusComponent(name, existing);
			return;
		}

		const componentConfig = {
			type: 'component',
			componentType: name,
			title: this.#registeredComponents[name].title
		};

		if (!root) {
			this.#layout.loadLayout({
				root: {
					type: 'stack',
					id: 'leftStack',
					content: [componentConfig]
				}
			});
			this.focusComponent(name);
			return;
		}

		let targetStack = this.#findFirstStack(root) || this.#layout.rootItem;
		targetStack.addItem(componentConfig);

		this.focusComponent(name);
	}

	resizeComponent(name, width, height) {
		const component = this.findComponent(name);
		if(component){
			component.container.setSize(width, height);
		}
	}
}

class GUI extends EventEmitter{
	#layout = new GUILayout(this);
	#componentGroups = {};
	#menuButtons = {};
	#preventEventsTimer;

	constructor() {
		super();
		document.addEventListener('DOMContentLoaded', () =>{
			this.#layout.init();
			this.#attachListeners();
		});
	}

	/** @param {(container: any, state: any) => void} onRender */
	registerComponent(name, title, group, onRender){
		if(!this.#componentGroups[group]) this.#componentGroups[group]=[];
		this.#componentGroups[group].push([name,title]);

		this.#layout.registerComponent(name, title, onRender);
	}

	registerMenuBtn(name, title, group, onRender){
		if(!this.#componentGroups[group]) this.#componentGroups[group]=[];
		this.#componentGroups[group].push([name, title]);

		this.#menuButtons[name] = onRender;
	}

	showComponent(name) {
		this.#layout.preventEvents = true;
		if(this.#preventEventsTimer) clearTimeout(this.#preventEventsTimer);
		this.#preventEventsTimer = setTimeout(()=>{ this.#layout.preventEvents = false;}, 20);

		this.#layout.showComponent(name);
	}

	destroyComponent(name){
		this.#layout.preventEvents = true;
		if(this.#preventEventsTimer) clearTimeout(this.#preventEventsTimer);
		this.#preventEventsTimer = setTimeout(()=>{ this.#layout.preventEvents = false;}, 20);

		let comp = this.#layout.findComponent(name);
		comp.remove();
	}

	focusComponent(name){
		this.#layout.preventEvents = true;
		if(this.#preventEventsTimer) clearTimeout(this.#preventEventsTimer);
		this.#preventEventsTimer = setTimeout(()=>{ this.#layout.preventEvents = false;}, 20);

		this.#layout.focusComponent(name);
	}

	resizeComponent(name, width, height) {
		this.#layout.preventEvents = true;
		if(this.#preventEventsTimer) clearTimeout(this.#preventEventsTimer);
		this.#preventEventsTimer = setTimeout(()=>{ this.#layout.preventEvents = false;}, 20);

		this.#layout.resizeComponent(name, width, height);
	}

	sendLayoutResize() {
		const main = document.getElementById('main');
		const rect = main.getBoundingClientRect();
		this.emit('mainLayoutResize', { width: rect.width, height: rect.height });
	}

	syncLayout(layout){
		this.#layout.preventEvents = true;
		this.#layout.syncLayout(layout);
		this.#layout.preventEvents = false;
	}

	#attachListeners(){
		window.addEventListener("keydown", (e) => {
//              inputsManager.keyDown(e.key);
		});

		window.addEventListener("keyup", (e) => {
//              inputsManager.keyUp(e.key);
		});

		const bar = document.getElementById('menu-bar');
		for(let group in this.#componentGroups){
			let elems = this.#componentGroups[group];
			let div = document.createElement('div');
			div.classList.add('dropdown')
			bar.appendChild(div)

			//<button class="dropbtn">Edytor</button>
			let btn = document.createElement('button');
			btn.classList.add('dropbtn');
			btn.textContent =group;
			div.appendChild(btn);

			let content = document.createElement('div');
			content.classList.add('dropdown-content');
			div.appendChild(content);
			//<div class="dropdown-content">

			for(let [name, title] of elems){
				let elem = document.createElement('a');
				elem.href='#';
				elem.textContent = title;
				elem.addEventListener("click", (e) => {
					e.preventDefault();

					if(this.#menuButtons[name]) {
						this.#menuButtons[name]();
					}else{
						actions.dispatch(new OpenWidgetCommand({id: name}));
					}
				});
				content.appendChild(elem)
			}
		}

		// ioManager.attachListener("menuClick", (data) => {
		// 	//gui.showComponent(data.id);
		// 	const command = new OpenWidgetCommand(gui, data.id);
		// 	if (app.history && app.history.execute) {
		// 		app.history.execute(command);
		// 	} else {
		// 		command.execute(); // Fallback if no history manager is set up yet
		// 	}
		// });

		//const items = ["monsters", "map", "mapGen", "scriptEdit"];
		//items.forEach(id => {
		//	const el = document.getElementById("menu-" + id);
		//	if (el) {
		//
		//	}
		//});
	}
}

//#region gui commands
class OpenWidgetCommand extends BaseCommand {
	constructor(data) {
		super(data);
		//this.isUiSkip = true;
	}
	execute() {
		gui.showComponent(this.data.id);
	}
	undo() {
		gui.destroyComponent(this.data.id);
	}
}
commandRegistry.register(OpenWidgetCommand);

class FocusWidgetCommand extends BaseCommand {
	constructor(data) {
		super(data);
		//this.isUiSkip = true;
	}
	execute() {
		gui.focusComponent(this.data.id);
	}
	undo() {
		gui.focusComponent(this.data.prevId);
	}
}
commandRegistry.register(FocusWidgetCommand);

class DestroyWidgetCommand extends BaseCommand {
	constructor(data) {
		super(data);
		//this.isUiSkip = true;
	}
	execute() {
		gui.destroyComponent(this.data.id);
	}
	undo() {
		gui.showComponent(this.data.id);
		gui.syncLayout(this.data.prevLayout);
	}
}
commandRegistry.register(DestroyWidgetCommand);

class ResizeWidgetCommand extends BaseCommand {
	constructor(data, isUiSkip = false) {
		super(data);
		this.isUiSkip = isUiSkip;
	}
	execute() {
		gui.resizeComponent(this.data.id, this.data.width, this.data.height);
	}
	undo() {
		gui.resizeComponent(this.data.id, this.data.prevWidth, this.data.prevHeight);
	}
}
commandRegistry.register(ResizeWidgetCommand);

class SyncLayoutCommand extends BaseCommand {
	constructor(data) {
		super(data);
	}
	execute() {
		gui.syncLayout(this.data.layout);
	}
	undo() {
		gui.syncLayout(this.data.prevLayout);
	}
}
commandRegistry.register(SyncLayoutCommand);


class ScrollCommand extends BaseCommand {
	constructor(data) {
		super(data);
		//this.containerId = scrollableContainerId;
		//this.newValue = newScrollTop;

		//const el = document.getElementById(this.containerId);
		//this.oldValue = el ? el.scrollTop : 0;
		this.isUiSkip = true;
	}
	execute() {
		//const el = document.getElementById(this.containerId);
		//if (el) el.scrollTop = this.newValue;
	}
	undo() {
		//const el = document.getElementById(this.containerId);
		//if (el) el.scrollTop = this.oldValue;
	}
	updateValue(latestScrollTop) {
		this.data.newValue = latestScrollTop;
	}
}
commandRegistry.register(ScrollCommand);
//#endregion

const gui = new GUI();
export {gui};