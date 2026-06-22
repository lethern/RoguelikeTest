import { gui } from "../gui.js";
import { StorageManager } from "../utils/storage.js";
import {persistenceManager} from "../persistenceManager.js";

class StorageWidget {
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
					<button id="storage-btn-save" class="collab-btn btn-danger">Save</button>
					<button id="storage-btn-close-all" class="collab-btn">Close all windows</button>
					<button id="storage-btn-clear" class="collab-btn btn-danger">Clear state</button>
					<button id="storage-btn-close" class="collab-btn">Close</button>
				</div>
			</div>
		`;

		this.#overlay.querySelector("#storage-btn-save").onclick = () => {
			persistenceManager.save();
		};
		this.#overlay.querySelector("#storage-btn-clear").onclick = () => {
			if (confirm("Clear all local storage?")) {
				StorageManager.clear();
				this.close();
				window.location.reload();
			}
		};
		this.#overlay.querySelector("#storage-btn-close-all").onclick = () => {
			gui.clearLayout();
			this.close();
		};



		this.#overlay.querySelector("#storage-btn-close").onclick = () => this.close();

		this.#mainLayout.appendChild(this.#overlay);
	}

	close() {
		if (this.#overlay) {
			this.#overlay.remove();
			this.#overlay = null;
		}
	}
}

const storageWidget = new StorageWidget();

gui.registerMenuBtn("storageMenu", "Menu", "Options", (container, state) => {
	storageWidget.openMenu();
});

export { storageWidget };
