import {globalStore} from "../globalStore.js";
import {CommandsManager} from "./commands.js";
import {GameData} from "./data/gameData.js";
import {GameSystems} from "./data/ecsSystems.js";
import {DataFactories} from "./data/storage.js";
import {GameDevTest} from "./gameDevTest.js";
import {GameRenderer} from "./gameGraphicsRender.js";
import {gui} from "../gui.js";
import {GuiEvents} from "../editor/editorEvents.js";
import {InputsManager} from "./inputsManager.js";
import {PresentationRecord} from "./render/presentationRecord.js";


class Game{
	#gameData = new GameData();
	#record = new PresentationRecord(this.#gameData);
	#factories = new DataFactories(this.#gameData)
	#gameSystems= new GameSystems(this.#gameData, this.#record);
	#gameRenderer = new GameRenderer(this.#gameData);
	#commandsManager = new CommandsManager(this, this.#gameData);
	#inputsManager = new InputsManager(this.#commandsManager);
	#gameEnabled = false;

	constructor() {
	}

	init(){
		this.#gameRenderer.init()
		this.#inputsManager.init();

		gui.on(GuiEvents.SHOW_GAME, (enabled) => this.showGame(enabled));

		window.addEventListener('keydown', (e) => {
			if (this.#gameEnabled) this.#inputsManager.keyDown(e.key);
		});

		window.addEventListener('keyup', (e) => {
			if (this.#gameEnabled) this.#inputsManager.keyUp(e.key);
		});

		GameDevTest.devTestInit(this.#gameData);

		this.loop = this.loop.bind(this);
		this.animationFrameId = requestAnimationFrame(this.loop);
	}

	loop(currentTime) {
		if (this.#gameEnabled) {
			this.#inputsManager.handleKeyboard(currentTime);
			this.#gameRenderer.tick();
		}

		this.animationFrameId = requestAnimationFrame(this.loop);
	}

	processTurn() {
		this.#gameSystems.execute();
		this.#gameRenderer.render();
	}

	showGame(enabled) {
		//if(globalStore.state.gameSession === undefined){
		//	globalStore.state.gameSession = {};
		//}
		this.#gameEnabled = enabled;
		this.#gameRenderer.showGame(enabled);
		this.#inputsManager.setKeyboardEnabled(enabled);
	}
}


export const game = new Game();
