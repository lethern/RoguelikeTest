


class App{
	#updateFunc;
	#needRender = true;

	constructor() {
		this.#updateFunc = (time)=>{ this.update(time); }

		this.#loadConfig();

		document.addEventListener('DOMContentLoaded', () =>{
			this.init();
		});
	}

	init(){
		requestAnimationFrame(this.#updateFunc);
	}

	#loadConfig(){
		const saved = localStorage.getItem("configVars");
		if(saved) config.loadConfigFromData(JSON.parse(saved));
	}

	update(currentTime) {
//           inputsManager.handleKeyboard(currentTime);
		if(this.#needRender){
			this.#needRender = false;
//              this.gui.draw();
		}

		requestAnimationFrame(this.#updateFunc);
	}

	doRender() {
		this.#needRender = true;
	}
}

export const app = new App();