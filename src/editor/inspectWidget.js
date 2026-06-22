import {gui} from "../gui.js";

class InspectWidget {
	constructor(container) {
		this.container = container;
		this.rootElement = document.createElement('div');
		this.rootElement.style.cssText = 'padding: 10px; font-family: monospace; font-size: 12px; color: #e5e7eb; white-space: pre; overflow: auto; max-height: 100%;';
		this.buildUI();
		this.container.element.appendChild(this.rootElement);

		this.btnRefresh = this.rootElement.querySelector('#btnRefresh');
		this.btnRefresh.addEventListener('click', () => this.refresh());
		this.container.on('destroy', () => {
		});
	}

	buildUI() {
		this.rootElement.innerHTML = `
			<div style="display: flex; flex-direction: column; height: 100%;">
				<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
					<span style="font-weight: bold;">Layout Inspector</span>
					<button id="btnRefresh" style="padding: 2px 6px;">Refresh</button>
				</div>
				<div id="layoutOutput" style="flex: 1; overflow: auto; background: #1f2937; padding: 8px; border-radius: 4px;"></div>
			</div>
		`;
		this.refresh();
	}

	refresh() {
		const output = this.rootElement.querySelector('#layoutOutput');
		try {
			const layout = gui.getLastLayoutSave();
			output.textContent = JSON.stringify(layout, null, 2);
		} catch (e) {
			output.textContent = 'Error: ' + e.message;
		}
	}
}

function initInspectWidget() {
	gui.registerComponent('Inspect', 'Layout Inspector', 'Dev', (container) => {
		new InspectWidget(container);
	});
}

initInspectWidget();
