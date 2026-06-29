import { getCommandFromKey } from "./commands.js";
import { config } from "../config.js";

const InputsManagerConfig = Object.freeze({
	KEY_REPEAT_DELAY: "KEY_REPEAT_DELAY",
});

config.addConfigVar(
	InputsManagerConfig.KEY_REPEAT_DELAY,
	200,
	"Time in milliseconds to wait before another key press is registered, while holding down a key",
	"keyRepeatDelay",
	"InputsManagerConfig",
);

export class InputsManager {
	#keyboardEnabled = false;
	#heldKeys = new Map();
	/**@type {CommandsManager}*/ #commandsManager;

	constructor(commandsManager) {
		this.#commandsManager = commandsManager;
	}

	init() {}

	keyDown(key) {
		if (!this.#keyboardEnabled) return;

		const command = getCommandFromKey(key);
		if (!command || this.#heldKeys.has(command)) return;

		this.#heldKeys.set(command, {
			started: performance.now(),
			lastProcessed: 0,
		});
	}

	keyUp(key) {
		const command = getCommandFromKey(key);
		if (command) this.#heldKeys.delete(command);
	}

	handleKeyboard(currentTime) {
		if (!this.#keyboardEnabled || this.#heldKeys.size === 0) return;

		const delay = config.getConfigValue(InputsManagerConfig.KEY_REPEAT_DELAY);

		this.#heldKeys.forEach((state, command) => {
			if (currentTime - state.lastProcessed >= delay) {
				state.lastProcessed = currentTime;
				this.#commandsManager.applyCommand(command); // time: currentTime
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
