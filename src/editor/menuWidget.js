import { gui } from "../gui.js";
import { StorageManager } from "../utils/storage.js";
import { editorPersistenceManager } from "./persistenceManager.js";
import { zip, unzipSync } from "../../libs/fflate.min.js";

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
		const jsonString = JSON.stringify(data, null, 2);

		const fileData = {
			[`save_${Date.now()}.json`]: new TextEncoder().encode(jsonString),
		};

		zip(fileData, (err, zippedData) => {
			if (err) {
				console.error("Compression failed:", err);
				return;
			}

			const blob = new Blob([zippedData], { type: "application/zip" });
			const url = URL.createObjectURL(blob);

			const a = document.createElement("a");
			a.href = url;
			a.download = `roguelike_save_${Date.now()}.zip`;
			a.click();

			URL.revokeObjectURL(url);
			this.close();
		});
	}

	loadJsonOnFile(e) {
		const file = e.target.files[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			let jsonString;

			if (file.name.endsWith(".zip") || file.type === "application/zip") {
				try {
					const uint8Array = new Uint8Array(event.target.result);
					const unzipped = unzipSync(uint8Array);

					const firstKey = Object.keys(unzipped)[0];
					jsonString = new TextDecoder().decode(unzipped[firstKey]);
				} catch (err) {
					console.error("Failed to unzip file:", err);
					return;
				}
			} else {
				jsonString = event.target.result;
			}

			try {
				const data = JSON.parse(jsonString);
				editorPersistenceManager.importState(data.components);
				this.close();
			} catch (err) {
				console.error("Invalid JSON format:", err);
			}
		};

		if (file.name.endsWith(".zip")) {
			reader.readAsArrayBuffer(file);
		} else {
			reader.readAsText(file);
		}
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
