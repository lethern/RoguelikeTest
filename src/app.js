import { config } from "./config.js";

class App {
	constructor() {
		this.#loadConfig();

		document.addEventListener("DOMContentLoaded", () => {
			this.init();
		});
	}

	async init() {
		//requestAnimationFrame(this.#updateFunc);{

		const { initAll } = await import("./initialization.js");
		initAll();

		const { gui } = await import("./gui.js");
		gui.init();

		const { initTestWidget } = await import("./game/testWidget.js");
		initTestWidget();

		const { editorUndoManager } = await import("./editor/undoManager.js");
		editorUndoManager.init();

		//const {actionSyncCoordinator} = await import('./coordinators.js');
		//actionSyncCoordinator.loadPersisted();
		const { editorPersistenceManager } = await import("./editor/persistenceManager.js");
		editorPersistenceManager.loadLocal();

		const { game } = await import("./game/game.js");
		game.init();
	}

	#loadConfig() {
		const saved = localStorage.getItem("configVars");
		if (saved) config.loadConfigFromData(JSON.parse(saved));
	}
}

export const app = new App();
