import { globalStore } from "../globalStore.js";
import {commandsManager, getCommandFromKey} from "./commands.js";
import {gui} from "../gui.js";
import {config} from "../config.js";
import {GuiEvents} from "../editor/editorEvents.js";

const InputsManagerConfig = Object.freeze({
	KEY_REPEAT_DELAY:  "KEY_REPEAT_DELAY",
});

class InputsManager {
	#keyboardEnabled = false;
	#heldKeys = new Map();

	constructor() {
		gui.on(GuiEvents.SHOW_GAME, (enabled) => this.setKeyboardEnabled(enabled));

		config.addConfigVar(InputsManagerConfig.KEY_REPEAT_DELAY, 200, "Time in milliseconds to wait before another key press is registered, while holding down a key");
	}
// ...

	init() {
		this.#attachListeners();
	}

	#attachListeners() {
		window.addEventListener("keydown", (e) => {
			inputsManager.keyDown(e.key);
		});

		window.addEventListener("keyup", (e) => {
			inputsManager.keyUp(e.key);
		});
	}

	keyDown(key) {
		if (!this.#keyboardEnabled) return;

		const command = getCommandFromKey(key);
		if (!command || this.#heldKeys.has(command)) return;

		this.#heldKeys.set(command, {
			started: performance.now(),
			lastProcessed: 0
		});
	}

	keyUp(key) {
		const command = getCommandFromKey(key);
		if (command) this.#heldKeys.delete(command);
	}

	handleKeyboard(currentTime) {
		if (!this.#keyboardEnabled || this.#heldKeys.size === 0) return;

		const player = globalStore.state.gameSession?.player;
		if (!player) return;

		const delay = config.getConfigValue(InputsManagerConfig.KEY_REPEAT_DELAY);

		this.#heldKeys.forEach((state, command) => {
			if (currentTime - state.lastProcessed >= delay) {
				state.lastProcessed = currentTime;
				commandsManager.applyCommand(command, { entity: player, time: currentTime });
			}
		});
	}

	setKeyboardEnabled(enabled) {
		this.#keyboardEnabled = enabled;
		if (!enabled) {
			this.#heldKeys.clear();
		}
	}
}

export const inputsManager = new InputsManager();