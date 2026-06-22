import {config} from "./config.js";

class App{

	constructor() {
		this.#loadConfig();

		document.addEventListener('DOMContentLoaded', () =>{
			this.init();
		});
	}

	async init() {
		//requestAnimationFrame(this.#updateFunc);{

		const {initAll} = await import('./initialization.js');
		initAll();

		const {gui} = await import('./gui.js');
		gui.init();

		const {inputsManager} = await import('./game/inputsManager.js');
		inputsManager.init();

		const {replayManager} = await import('./replay.js');
		replayManager.init();

		//const {actionSyncCoordinator} = await import('./coordinators.js');
		//actionSyncCoordinator.loadPersisted();
		const {persistenceManager} = await import('./persistenceManager.js');
		persistenceManager.load();

		const {gameRenderer} = await import('./game/game.js');
		gameRenderer.init();
	}

	#loadConfig(){
		const saved = localStorage.getItem("configVars");
		if(saved) config.loadConfigFromData(JSON.parse(saved));
	}

}

export const app = new App();