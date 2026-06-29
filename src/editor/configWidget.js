import { BaseCommand, commandRegistry } from "./historyNode.js";
import { editorActions } from "./actionsManager.js";
import { gui } from "../gui.js";
import { config } from "../config.js";

class ConfigUpdateCommand extends BaseCommand {
	constructor(data) {
		if (data.oldValue === undefined) {
			data.oldValue = config.getConfigValue(data.name);
		}
		super(data);
	}
	execute() {
		config.setConfigValue(this.data.name, this.data.newValue);
		configWidget.refreshUI();
	}
	undo() {
		config.setConfigValue(this.data.name, this.data.oldValue);
		configWidget.refreshUI();
	}
}
commandRegistry.register(ConfigUpdateCommand);

class ConfigWidget {
	constructor() {
		this.rootElement = null;
		this.container = null;
	}

	init(container) {
		this.container = container;
		this.rootElement = document.createElement("div");
		this.rootElement.className = "config-editor-widget editor-panel";
		this.rootElement.style.padding = "10px";
		this.container.element.appendChild(this.rootElement);
		this.buildUI();
		this.refreshUI();
		container.on("destroy", () => this.destroy());
	}

	destroy() {
		if (this.container) this.container.element.innerHTML = null;
		this.container = null;
		this.rootElement = null;
	}

	buildUI() {
		this.rootElement.innerHTML = `
			<div class="config-widget" style="overflow: auto;">
				<div class="editor-toolbar" style="padding: 10px; border-bottom: 1px solid #333;">
					<input type="text" id="searchConfigName" placeholder="Search config..." style="width: 100%; padding: 4px; border: 1px solid #444; background: #222; color: #fff; border-radius: 4px;">
				</div>
				<div id="configList" class="editor-main" style="flex: 1; overflow-y: auto; padding: 10px;"></div>
			</div>
		`;
		this.rootElement.querySelector("#searchConfigName").addEventListener("input", () => this.refreshUI());
	}

	refreshUI() {
		if (!this.rootElement) return;
		const list = this.rootElement.querySelector("#configList");
		list.innerHTML = "";
		const searchNameEl = this.rootElement.querySelector("#searchConfigName");
		const nameQuery = searchNameEl ? searchNameEl.value.toLowerCase() : "";

		const allConfigs = config.getAllConfigVars();
		const filteredConfigs = allConfigs.filter((conf) => {
			return conf.friendlyName.toLowerCase().includes(nameQuery) || conf.name.toLowerCase().includes(nameQuery);
		});

		const grouped = {};
		for (const conf of filteredConfigs) {
			const group = conf.groupName || "Ungrouped";
			if (!grouped[group]) grouped[group] = [];
			grouped[group].push(conf);
		}

		for (const group in grouped) {
			const groupDiv = document.createElement("div");
			groupDiv.className = "config-group-header";
			groupDiv.textContent = group;
			list.appendChild(groupDiv);

			for (const conf of grouped[group]) {
				const row = document.createElement("div");
				row.className = "config-row";

				row.innerHTML = `
					<span>${conf.friendlyName}</span>
					<input type="text" value="${conf.value}" data-name="${conf.name}" class="config-val-input">
					<span style="color: #888;">${conf.desc}</span>
				`;
				row.querySelector(".config-val-input").addEventListener("change", (e) => {
					editorActions.dispatch(
						new ConfigUpdateCommand({
							name: e.target.dataset.name,
							newValue: e.target.value,
						}),
					);
				});
				list.appendChild(row);
			}
		}
	}
}

export const configWidget = new ConfigWidget();

gui.registerComponent("configEditor", "Config", "Editor", (container, state) => {
	configWidget.init(container);
});
