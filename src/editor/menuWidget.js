import { gui } from "../gui.js";
import { StorageManager } from "../utils/storage.js";
import {editorPersistenceManager} from "./persistenceManager.js";

class MenuWidget {
	#overlay = null;
	#mainLayout = null;

	constructor() {
		this.#mainLayout = document.getElementById("mainLayout");
	}

	openMenu() {
		if (this.#overlay) this.close();

		this.#overlay = document.createElement("div");
		this.#overlay.className = "collab-overlay";

		this.#overlay.innerHTML = `
			<div class="collab-modal">
				<div class="collab-header">Storage</div>
				<div class="collab-actions">
					<button id="storage-btn-save" class="collab-btn">Save</button>
					<button id="storage-btn-save-json" class="collab-btn">Save JSON</button>
					<button id="storage-btn-load-json" class="collab-btn">Load JSON</button>
					<br />
					<button id="storage-btn-close-all" class="collab-btn">Close all windows</button>
					<button id="storage-btn-clear" class="collab-btn btn-danger">Clear state</button>
					<br />
					<button id="storage-btn-close" class="collab-btn">Close</button>
				</div>
				<input type="file" id="file-input" style="display: none;">
			</div>
		`;

		this.#overlay.querySelector("#storage-btn-save").onclick = this.saveOnClick.bind(this);

		this.#overlay.querySelector("#storage-btn-save-json").onclick = this.saveJsonOnClick.bind(this);

		const fileInput = this.#overlay.querySelector("#file-input");
		this.#overlay.querySelector("#storage-btn-load-json").onclick = () => fileInput.click();

		fileInput.onchange = this.loadJsonOnFile.bind(this);

		this.#overlay.querySelector("#storage-btn-clear").onclick = this.clearOnClick.bind(this);

		this.#overlay.querySelector("#storage-btn-close-all").onclick = this.closeAllOnClick.bind(this);

		this.#overlay.querySelector("#storage-btn-close").onclick = () => this.close();

		this.#mainLayout.appendChild(this.#overlay);
	}

	close() {
		if (this.#overlay) {
			this.#overlay.remove();
			this.#overlay = null;
		}
	}

	saveOnClick() {
		editorPersistenceManager.saveLocal();
		this.close();
	}

	saveJsonOnClick() {
		const data = editorPersistenceManager.exportState();
		const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `roguelike_save_${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
		this.close();
	}

	loadJsonOnFile(e) {
		const file = e.target.files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (e) => {
			const data = JSON.parse(e.target.result);
			editorPersistenceManager.importState(data.components);
			this.close();
		};
		reader.readAsText(file);
	}

	clearOnClick() {
		if (confirm("Clear all local storage?")) {
			StorageManager.clear();
			this.close();
			window.location.reload();
		}
	}

	closeAllOnClick() {
		gui.clearLayout();
		this.close();
	}
}

const menuWidget = new MenuWidget();

gui.registerMenuBtn("menuWidget", "Menu", "Options", (container, state) => {
	menuWidget.openMenu();
});

export { menuWidget };
