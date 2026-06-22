import {actions} from './historyStorage.js';
import {HistoryEvents} from "./editor/editorEvents.js";

class ReplayManager {
	constructor() {
		// document.addEventListener('DOMContentLoaded', () => {
		// 	this.init();
		// });
	}

	init() {
		document.getElementById("replayBack").addEventListener("click", () => {
			this.stepBack();
		});

		document.getElementById("replayForward").addEventListener("click", () => {
			this.stepForward();
		});

		actions.on(HistoryEvents.COMMAND_ADDED, () => this.updateDisplay());
		actions.on(HistoryEvents.STEP_BACK, () => this.updateDisplay());
		actions.on(HistoryEvents.STEP_FORWARD, () => this.updateDisplay());
		actions.on(HistoryEvents.HISTORY_REPLACED, () => this.updateDisplay());

		this.updateDisplay();
	}

	stepBack() {
		actions.stepBack();
	}

	stepForward() {
		actions.stepForward();
	}

	getCommandName(command) {
		if (!command) return '-';
		if (command.constructor.friendlyName) {
			return command.constructor.friendlyName;
		}
		return command.constructor.name || 'Command';
	}

	updateDisplay() {
		const current = actions.getCurrentNode();
		const prev = current.parent;
		const next = current.getLatestChild();

		const prevName = prev && prev.command ? this.getCommandName(prev.command) : '-';
		const currName = current.command ? this.getCommandName(current.command) : '-';
		const nextName = next ? this.getCommandName(next.command) : '-';

		let info = `Prev: ${prevName}  |  Curr: ${currName}`;

		if (next) {
			info += `  |  Next: ${nextName}`;
		}

		if(current !== actions.getLastNode()){
			document.getElementById("replayInfo").textContent = info;
		}else{
			document.getElementById("replayInfo").textContent = null;
		}

	}
}

export const replayManager = new ReplayManager();
