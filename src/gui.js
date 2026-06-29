import { GoldenLayout, LayoutConfig } from "../libs/goldenLayoutBundle/esm/golden-layout.min.js";
import { editorActions } from "./editor/actionsManager.js";
import { BaseCommand, commandRegistry } from "./editor/historyNode.js";
import EventEmitter from "./utils/eventEmitter.js";
import { editorPersistenceManager } from "./editor/persistenceManager.js";
import { EditorPersistenceEvents, GuiEvents } from "./editor/editorEvents.js";

class GoldenLayoutConfigUtils {
	static findItemInTree(item, componentType) {
		if (!item) return null;
		if (item.type === "component" && item.componentType === componentType) return item;

		if (item.contentItems) {
			for (const child of item.contentItems) {
				const found = GoldenLayoutConfigUtils.findItemInTree(child, componentType);
				if (found) return found;
			}
		}
		return null;
	}

	static findFirstStack(item) {
		if (!item) return null;
		if (item.type === "stack") return item;

		if (item.contentItems) {
			for (const child of item.contentItems) {
				const found = GoldenLayoutConfigUtils.findFirstStack(child);
				if (found) return found;
			}
		}
		return null;
	}

	static slimLayoutNode(node) {
		if (!node) return node;

		const out = { type: node.type, content: [] };
		if (node.activeItemIndex) out.activeItemIndex = node.activeItemIndex;

		const typeRef = node.componentType || node.componentName;
		if (typeRef) out.componentType = typeRef;

		if (Array.isArray(node.content)) {
			out.content = node.content.map(GoldenLayoutConfigUtils.slimLayoutNode);
		}

		if (node.type === "component") {
			if (node.title) out.title = node.title;
			if (node.size) out.size = node.size;
		}
		return out;
	}

	static extractConfigComponents(config, out = []) {
		if (!config) return out;
		if (config.type === "component") out.push(config);
		if (config.content) {
			for (const child of config.content) GoldenLayoutConfigUtils.extractConfigComponents(child, out);
		}
		return out;
	}

	static buildWorkspaceConfig(config, existingRoot, missingComps, registry) {
		if (config.type === "ROOT") {
			if (!existingRoot || !existingRoot.content?.length) return null;
			const clonedRoot = structuredClone(existingRoot);
			delete clonedRoot.width;
			delete clonedRoot.height;
			return clonedRoot;
		}

		if (config.type === "component") {
			if (!missingComps.includes(config)) return null;
			return { ...config, title: registry[config.componentType]?.title };
		}

		if (config.content) {
			const newContent = [];
			for (const child of config.content) {
				const resolvedChild = GoldenLayoutConfigUtils.buildWorkspaceConfig(child, existingRoot, missingComps, registry);
				if (!resolvedChild) continue;

				// flatten if a container resolves directly inside a stack
				if (config.type === "stack" && resolvedChild.type !== "component") {
					newContent.push(...GoldenLayoutConfigUtils.extractConfigComponents(resolvedChild));
				} else {
					newContent.push(resolvedChild);
				}
			}
			return newContent.length === 0 ? null : { ...config, content: newContent };
		}

		return { ...config };
	}

	static layoutInitializeHeaders(node) {
		if (!node) return;
		if (!node.header) node.header = {};
		node.header.popout = false;
		node.header.maximise = false;

		if (Array.isArray(node.content)) {
			node.content.forEach((child) => GoldenLayoutConfigUtils.layoutInitializeHeaders(child));
		}
	}
}

class GUILayout {
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
	#lastLayoutSave;
	#preventLayoutSaving = false;

	#resizeCache = new Map();
	#resizeTimer = null;
	#resizeObserver = null;

	#resizeSaveCache = new Map();

	constructor(owner) {
		this.#owner = owner;
	}

	init() {
		this.#owner.registerComponent("testComponent", "test", "Dev", (container, state) => {
			container.element.innerHTML = `<h2>${state.label}</h2>`;
		});

		const container = document.getElementById("mainLayout");
		const config = this.#getTestLayout();

		this.#layout = new GoldenLayout(container);
		this.#layout.resizeWithContainerAutomatically = true;
		this.#layout.resizeDebounceInterval = 300;

		const mainElement = document.getElementById("main");
		if (mainElement) {
			this.#resizeObserver = new ResizeObserver(() => this.#layout.updateSize());
			this.#resizeObserver.observe(mainElement);
		}

		for (const name in this.#registeredComponents) {
			this.#layout.registerComponentFactoryFunction(name, this.#registeredComponents[name].onRender);
		}

		this.#attachListeners();
		GoldenLayoutConfigUtils.layoutInitializeHeaders(config.root);
		this.#layout.loadLayout(config);
		this.#updateLayoutSaved();
	}

	destroy() {
		if (this.#resizeObserver) {
			this.#resizeObserver.disconnect();
		}
		clearTimeout(this.#resizeTimer);
		this.#layout?.destroy();
	}

	clearLayout() {
		const config = this.#getTestLayout();
		GoldenLayoutConfigUtils.layoutInitializeHeaders(config.root);
		this.#layout.loadLayout(config);
		this.#updateLayoutSaved();
	}

	findComponent(name) {
		return GoldenLayoutConfigUtils.findItemInTree(this.#layout.rootItem, name);
	}

	focusComponent(name, component = undefined) {
		const target = component || this.findComponent(name);
		if (target?.parentItem?.type === "stack") {
			target.parentItem.setActiveComponentItem(target);
		}
	}

	showComponent(name) {
		const root = this.#layout.rootItem;
		const existing = this.findComponent(name);

		if (existing) {
			this.focusComponent(name, existing);
			return;
		}

		const componentConfig = {
			type: "component",
			componentType: name,
			title: this.#registeredComponents[name].title,
		};

		if (!root) {
			this.#layout.loadLayout({
				root: { type: "stack", id: "leftStack", content: [componentConfig] },
			});
			this.focusComponent(name);
			return;
		}

		const targetStack = GoldenLayoutConfigUtils.findFirstStack(root) || root;
		targetStack.addItem(componentConfig);
		this.focusComponent(name);
	}

	resizeComponent(name, width, height) {
		const component = this.findComponent(name);
		if (component?.container) {
			component.container.setSize(width, height);
		}
	}

	openWorkspace(layoutConfig) {
		const missingComponents = GoldenLayoutConfigUtils.extractConfigComponents(layoutConfig).filter(
			(c) => !this.findComponent(c.componentType),
		);

		if (missingComponents.length === 0) {
			GoldenLayoutConfigUtils.extractConfigComponents(layoutConfig).forEach((c) => this.focusComponent(c.componentType));
			return;
		}

		const currentLayoutConfig = LayoutConfig.fromResolved(this.#layout.saveLayout());
		const existingRoot = currentLayoutConfig?.root ?? null;

		const mergedRootConfig = GoldenLayoutConfigUtils.buildWorkspaceConfig(
			layoutConfig,
			existingRoot,
			missingComponents,
			this.#registeredComponents,
		);

		if (!mergedRootConfig) return;

		currentLayoutConfig.root = mergedRootConfig;
		GoldenLayoutConfigUtils.layoutInitializeHeaders(currentLayoutConfig.root);

		this.#layout.loadLayout(currentLayoutConfig);
		missingComponents.forEach((c) => this.showComponent(c.componentType));
		this.#updateLayoutSaved();
	}

	syncLayout(layout) {
		const layoutCurrent = LayoutConfig.fromResolved(this.#layout.saveLayout());
		layoutCurrent.root = layout;
		GoldenLayoutConfigUtils.layoutInitializeHeaders(layoutCurrent.root);
		this.#layout.loadLayout(layoutCurrent);
	}

	/** @param {(container:any, state: any) => void} onRender */
	registerComponent(name, title, onRender) {
		if (this.#registeredComponents[name]) {
			throw new Error(`registerComponent: the ${name} name already exists`);
		}
		this.#registeredComponents[name] = { title, onRender, visible: false };
	}

	getLastLayoutSave() {
		return this.#lastLayoutSave;
	}

	#attachListeners() {
		this.#layout.on("itemCreated", (event) => {
			const item = event.target;
			if (!item.isComponent) return;

			item.on("focus", (e) => {
				if (!e.target.componentType || this.preventEvents) return;
				const prevId = this.#lastFocusedComponent?.componentType || null;
				editorActions.recordDispatched(new FocusWidgetCommand({ id: e.target.componentType, prevId }));
				this.#lastFocusedComponent = e.target;
			});

			item.on("itemDestroyed", (e) => {
				if (!e.target.componentType || this.preventEvents) return;
				editorActions.recordDispatched(new DestroyWidgetCommand({ id: e.target.componentType, prevLayout: this.#lastLayoutSave }));
			});

			item._container.on("resize", () => this.#handleContainerResize(item._container));
			this.#lastFocusedComponent = item;
		});

		this.#layout.on("tabCreated", (tab) => {
			tab._dragListener.on("dragStart", () => {
				this.#preventLayoutSaving = true;
			});
		});

		this.#layout.on("itemDropped", (item) => {
			this.#preventLayoutSaving = false;
			if (item.isComponent) {
				const prevSave = this.#lastLayoutSave;
				this.#updateLayoutSaved();
				editorActions.recordDispatched(new SyncLayoutCommand({ layout: this.#lastLayoutSave, prevLayout: prevSave }));
				this.#lastFocusedComponent = item;
			}
		});

		this.#layout.on("stateChanged", () => this.#updateLayoutSaved());
	}

	#handleContainerResize(container) {
		const sizeChanged = container.savedWidth !== container.width || container.savedHeight !== container.height;
		const hasValidSize = container.width !== 0 && container.height !== 0;

		if (container.savedWidth !== undefined && sizeChanged && !this.preventEvents && hasValidSize) {
			if (!this.#resizeCache.has(container.componentType)) {
				this.#resizeCache.set(container.componentType, {
					initialWidth: container.savedWidth,
					initialHeight: container.savedHeight,
					currentWidth: 0,
					currentHeight: 0,
				});
			}

			const cacheData = this.#resizeCache.get(container.componentType);
			cacheData.currentWidth = container.width;
			cacheData.currentHeight = container.height;

			clearTimeout(this.#resizeTimer);
			this.#resizeTimer = setTimeout(() => this.#flushResizeCommands(), 300);
		}

		container.savedWidth = container.width;
		container.savedHeight = container.height;

		const main = document.getElementById("main");
		if (!main) return;

		const rect = main.getBoundingClientRect();
		if (rect.width !== this.#lastMainWidth || rect.height !== this.#lastMainHeight) {
			this.#lastMainWidth = rect.width;
			this.#lastMainHeight = rect.height;
			this.#owner.sendLayoutResize();
		}
	}

	#flushResizeCommands() {
		for (const [id, data] of this.#resizeCache.entries()) {
			if (!this.#shouldSaveResize(id)) continue;
			if (data.initialWidth !== data.currentWidth || data.initialHeight !== data.currentHeight) {
				editorActions.recordDispatched(
					new ResizeWidgetCommand(
						{
							id,
							width: data.currentWidth,
							height: data.currentHeight,
							prevWidth: data.initialWidth,
							prevHeight: data.initialHeight,
						},
						this.#preventLayoutSaving,
					),
				);
			}
		}
		this.#resizeCache.clear();
	}

	#rebuildResizeSaveCache() {
		this.#resizeSaveCache.clear();

		const walk = (item) => {
			if (!item?.contentItems) return;

			const lastIndex = item.contentItems.length - 1;
			for (let i = 0; i < item.contentItems.length; i++) {
				const child = item.contentItems[i];

				if ((item.type === "row" || item.type === "column") && i === lastIndex) {
					continue;
				}

				if (child.type === "component") {
					this.#resizeSaveCache.set(child.componentType, true);
				}
				walk(child);
			}
		};

		walk(this.#layout.rootItem);
	}

	#shouldSaveResize(componentType) {
		return this.#resizeSaveCache.has(componentType);
	}

	#updateLayoutSaved() {
		if (this.#preventLayoutSaving) return;
		const layoutConfig = this.#layout.saveLayout();
		const layout = LayoutConfig.fromResolved(layoutConfig);
		this.#lastLayoutSave = GoldenLayoutConfigUtils.slimLayoutNode(layout.root);
		this.#rebuildResizeSaveCache();
	}

	#getTestLayout() {
		return {
			root: {
				type: "row",
				content: [
					{
						type: "stack",
						id: "leftStack",
						content: [
							{
								type: "component",
								componentType: "testComponent",
								title: this.#registeredComponents["testComponent"]?.title || "Test",
							},
						],
					},
				],
			},
		};
	}
}

class GUI extends EventEmitter {
	#layout = new GUILayout(this);
	#editorComponentGroups = {};
	#editorMenuButtons = {};
	#gameComponentGroups = {};
	#gameMenuButtons = {};
	#preventEventsTimer;
	#currentMode = "editor";

	constructor() {
		super();
		this.#initPersistence();
	}

	#setMode(mode) {
		const editor = document.getElementById("mainLayout");
		const game = document.getElementById("gameView");
		const replayContainer = document.getElementById("replay-container");
		if (mode === "editor") {
			editor.style.display = "block";
			game.style.display = "none";
			replayContainer.style.display = "flex";
			this.emit(GuiEvents.SHOW_GAME, false);
		} else {
			editor.style.display = "none";
			game.style.display = "block";
			replayContainer.style.display = "none";
			this.emit(GuiEvents.SHOW_GAME, true);
		}
		this.#currentMode = mode;
		this.#renderMenuBar();
	}

	#initPersistence() {
		const saveFn = (components) => {
			components.gui = this.#layout.getLastLayoutSave();
		};
		const loadFn = (components) => {
			if (components.gui) {
				this.syncLayout(components.gui);
			}
		};
		editorPersistenceManager.on(EditorPersistenceEvents.SAVE_LOCAL, saveFn);
		//editorPersistenceManager.on(EditorPersistenceEvents.SAVE_DISK, saveFn);
		editorPersistenceManager.on(EditorPersistenceEvents.LOAD_LOCAL, loadFn);
		//editorPersistenceManager.on(EditorPersistenceEvents.LOAD_DISK, loadFn);
	}

	init() {
		this.#layout.init();
		this.#renderMenuBar();
	}

	/** @param {(container: any, state: any) => void} onRender */
	registerComponent(name, title, group, onRender) {
		if (group) {
			if (!this.#editorComponentGroups[group]) this.#editorComponentGroups[group] = [];
			this.#editorComponentGroups[group].push([name, title]);
		}

		this.#layout.registerComponent(name, title, onRender);
	}

	registerMenuBtn(name, title, group, onRender) {
		if (!this.#editorComponentGroups[group]) this.#editorComponentGroups[group] = [];
		this.#editorComponentGroups[group].push([name, title]);

		this.#editorMenuButtons[name] = onRender;
	}

	registerGameMenuBtn(name, title, group, onRender) {
		if (!this.#gameComponentGroups[group]) this.#gameComponentGroups[group] = [];
		this.#gameComponentGroups[group].push([name, title]);

		this.#gameMenuButtons[name] = onRender;
	}

	showComponent(name) {
		this.#showingComponentsSetup();
		this.#layout.showComponent(name);
	}

	openWorkspace(layoutConfig) {
		this.#showingComponentsSetup();
		this.#layout.openWorkspace(layoutConfig);
	}

	/** @param {{layoutConfig: object, components: string[]}} data */
	openWorkspaceClick(data) {
		editorActions.dispatch(new OpenWorkspaceCommand({ ...data, prevLayout: this.#layout.getLastLayoutSave() }));
	}

	#showingComponentsSetup() {
		this.#layout.preventEvents = true;
		if (this.#preventEventsTimer) clearTimeout(this.#preventEventsTimer);
		this.#preventEventsTimer = setTimeout(() => {
			this.#layout.preventEvents = false;
		}, 20);
	}

	destroyComponent(name) {
		this.#layout.preventEvents = true;
		if (this.#preventEventsTimer) clearTimeout(this.#preventEventsTimer);
		this.#preventEventsTimer = setTimeout(() => {
			this.#layout.preventEvents = false;
		}, 20);

		let comp = this.#layout.findComponent(name);
		comp?.remove();
	}

	focusComponent(name) {
		this.#layout.preventEvents = true;
		if (this.#preventEventsTimer) clearTimeout(this.#preventEventsTimer);
		this.#preventEventsTimer = setTimeout(() => {
			this.#layout.preventEvents = false;
		}, 20);

		this.#layout.focusComponent(name);
	}

	resizeComponent(name, width, height) {
		this.#layout.preventEvents = true;
		if (this.#preventEventsTimer) clearTimeout(this.#preventEventsTimer);
		this.#preventEventsTimer = setTimeout(() => {
			this.#layout.preventEvents = false;
		}, 20);

		this.#layout.resizeComponent(name, width, height);
	}

	sendLayoutResize() {
		const main = document.getElementById("main");
		const rect = main.getBoundingClientRect();
		this.emit(GuiEvents.MAIN_LAYOUT_RESIZE, { width: rect.width, height: rect.height });
	}

	syncLayout(layout) {
		this.#layout.preventEvents = true;
		this.#layout.syncLayout(layout);
		this.#layout.preventEvents = false;
	}

	clearLayout() {
		editorActions.dispatch(new ClearLayoutCommand({ prevLayout: this.#layout.getLastLayoutSave() }));
	}

	clearLayoutInternal() {
		this.#layout.preventEvents = true;
		this.#layout.clearLayout();
		this.#layout.preventEvents = false;
	}

	#renderMenuBar() {
		const bar = document.getElementById("menu-bar");
		bar.innerHTML = "";
		const componentGroups = this.#currentMode === "editor" ? this.#editorComponentGroups : this.#gameComponentGroups;
		const menuButtons = this.#currentMode === "editor" ? this.#editorMenuButtons : this.#gameMenuButtons;

		for (let group in componentGroups) {
			let elems = componentGroups[group];
			let div = document.createElement("div");
			div.classList.add("dropdown");
			bar.appendChild(div);

			let btn = document.createElement("button");
			btn.classList.add("dropbtn");
			btn.textContent = group;
			div.appendChild(btn);

			let content = document.createElement("div");
			content.classList.add("dropdown-content");
			div.appendChild(content);

			for (let [name, title] of elems) {
				let elem = document.createElement("a");
				elem.href = "#";
				elem.textContent = title;
				elem.addEventListener("click", (e) => {
					e.preventDefault();

					if (menuButtons[name]) {
						menuButtons[name]();
					} else {
						editorActions.dispatch(new OpenWidgetCommand({ id: name }));
					}
				});
				content.appendChild(elem);
			}
		}

		const modeSelector = document.createElement("div");
		modeSelector.style.cssText = "margin-left: auto; margin-right: auto; display: flex; gap: 5px;";

		const btnEditor = document.createElement("button");
		btnEditor.textContent = "Editor";
		btnEditor.addEventListener("click", () => {
			this.#setMode("editor");
		});

		const btnGame = document.createElement("button");
		btnGame.textContent = "Game";
		btnGame.addEventListener("click", () => {
			this.#setMode("game");
		});

		modeSelector.appendChild(btnEditor);
		modeSelector.appendChild(btnGame);
		bar.appendChild(modeSelector);
	}

	getLastLayoutSave() {
		return this.#layout.getLastLayoutSave();
	}
}

//#region gui commands
class OpenWidgetCommand extends BaseCommand {
	static friendlyName = "Open Widget";
	constructor(data) {
		super(data);
	}
	execute() {
		gui.showComponent(this.data.id);
	}
	undo() {
		gui.destroyComponent(this.data.id);
	}
}
commandRegistry.register(OpenWidgetCommand);

class OpenWorkspaceCommand extends BaseCommand {
	static friendlyName = "Open Workspace";
	constructor(data) {
		super(data);
	}
	execute() {
		gui.openWorkspace(this.data.layoutConfig);
	}
	undo() {
		for (const name of this.data.components) {
			gui.destroyComponent(name);
		}
		gui.syncLayout(this.data.prevLayout);
	}
}
commandRegistry.register(OpenWorkspaceCommand);

class FocusWidgetCommand extends BaseCommand {
	static friendlyName = "Focus Widget";
	constructor(data) {
		super(data);
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
	static friendlyName = "Close Widget";
	constructor(data) {
		super(data);
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
	static friendlyName = "Resize Widget";
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
	static friendlyName = "Sync Layout";
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

class ClearLayoutCommand extends BaseCommand {
	static friendlyName = "Clear Layout";
	constructor(data) {
		super(data);
	}
	execute() {
		gui.clearLayoutInternal();
	}
	undo() {
		gui.syncLayout(this.data.prevLayout);
	}
}
commandRegistry.register(ClearLayoutCommand);

class ScrollCommand extends BaseCommand {
	static friendlyName = "Scroll";

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
}
commandRegistry.register(ScrollCommand);
//#endregion

const gui = new GUI();
export { gui };
