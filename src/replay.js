import {actions} from './actionsHistory.js';


class ReplayManager{
	constructor() {
		document.addEventListener('DOMContentLoaded', () =>{
			this.init();
		});
	}
	init(){
		document.getElementById("replayBack").addEventListener("click", () => {
			this.stepBack();
		});

		document.getElementById("replayForward").addEventListener("click", () => {
			this.stepForward();
		});
	}
	stepBack(){
		//if editor
		// else game

		actions.stepBack();
	}

	stepForward(){
		//if editor
		// else game
		actions.stepForward();
	}
}
const replayManager = new ReplayManager()