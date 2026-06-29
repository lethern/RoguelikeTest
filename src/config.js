/*
* example *
const MapEditorConfig = Object.freeze({
	MAP_EDITOR_TILE_SIZE: "MAP_EDITOR_TILE_SIZE",
});
config.addConfigVar(MapEditorConfig.MAP_EDITOR_TILE_SIZE, 16, 'Size of each rendered map tile in pixels', 'tileSize', 'MapEditorConfig');
///
return config.getConfigValue(MapEditorConfig.MAP_EDITOR_TILE_SIZE);
 */

class Config {
	#configVarValues = {};

	loadConfigFromData(data) {
		for (const it in data) {
			const value = data[it];
			this.setConfigValue(it, value);
		}
	}

	setConfigValue(name, value) {
		const obj = this.getConfigVarObject(name);

		switch (typeof obj.defaultValue) {
			case "string":
				obj.value = String(value);
				break;
			case "number": {
				const num = Number(value);
				if (!Number.isFinite(num)) return;
				obj.value = num;
				break;
			}
			case "boolean": {
				let bool;
				if (typeof value === "boolean") {
					bool = value;
				} else if (typeof value === "string") {
					const v = value.trim().toLowerCase();
					if (v === "true" || v === "1") bool = true;
					else if (v === "false" || v === "0") bool = false;
					else return;
				} else if (typeof value === "number") {
					if (value === 1) bool = true;
					else if (value === 0) bool = false;
					else return;
				} else {
					return;
				}
				obj.value = bool;
				break;
			}
		}
	}

	getConfigValue(name) {
		return this.getConfigVarObject(name).value;
	}

	getConfigVarObject(name) {
		if (!this.#configVarValues[name]) throw new Error(`getConfigVar: missing var ${name}`);
		return this.#configVarValues[name];
	}

	getAllConfigVars() {
		return Object.values(this.#configVarValues);
	}

	createConfigSave() {
		const save = {};
		for (const it in this.#configVarValues) {
			const confVar = this.#configVarValues(it);
			if (confVar.value !== confVar.defaultValue) {
				save[it] = confVar.value;
			}
		}
		return save;
	}

	addConfigVar(name, value, desc, friendlyName = undefined, groupName = undefined) {
		if (this.#configVarValues[name]) throw new Error(`addConfigVar: ${name} already exists`);
		if (!friendlyName) friendlyName = name.toLowerCase();
		this.#configVarValues[name] = { name, value, defaultValue: value, friendlyName, desc, groupName };
	}
}
export const config = new Config();
