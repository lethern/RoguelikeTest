import {editorActions} from './actionsManager.js';
import {EditorActionsEvents} from "./editorEvents.js";

class EditorUndoManager {
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

		editorActions.on(EditorActionsEvents.COMMAND_ADDED, () => this.updateDisplay());
		editorActions.on(EditorActionsEvents.STEP_BACK, () => this.updateDisplay());
		editorActions.on(EditorActionsEvents.STEP_FORWARD, () => this.updateDisplay());
		editorActions.on(EditorActionsEvents.HISTORY_REPLACED, () => this.updateDisplay());

		this.updateDisplay();
	}

	stepBack() {
		editorActions.stepBack();
	}

	stepForward() {
		editorActions.stepForward();
	}

	getCommandName(command) {
		if (!command) return '-';
		if (command.constructor.friendlyName) {
			return command.constructor.friendlyName;
		}
		return command.constructor.name || 'Command';
	}

	updateDisplay() {
		const current = editorActions.getCurrentNode();
		const prev = current.parent;
		const next = current.getLatestChild();

		const prevName = prev && prev.command ? this.getCommandName(prev.command) : '-';
		const currName = current.command ? this.getCommandName(current.command) : '-';
		const nextName = next ? this.getCommandName(next.command) : '-';

		let info = `Prev: ${prevName}  |  Curr: ${currName}`;

		if (next) {
			info += `  |  Next: ${nextName}`;
		}

		if(current !== editorActions.getLastNode()){
			document.getElementById("replayInfo").textContent = info;
		}else{
			document.getElementById("replayInfo").textContent = null;
		}

	}
}

export const editorUndoManager = new EditorUndoManager();
