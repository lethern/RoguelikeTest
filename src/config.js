
class Config {
	#configVarValues = {};

	loadConfigFromData(data){
		for(const it in data){
			const value = data[it];
			this.setConfigValue(it, value);
		}
	}

	setConfigValue(name, value){
		this.getConfigVarObject(name).value = value;
	}

	getConfigValue(name){
		return this.getConfigVarObject(name).value;
	}

	getConfigVarObject(name){
		if(!this.#configVarValues[name]) throw new Error(`getConfigVar: missing var ${name}`);
		return this.#configVarValues[name];
	}

	createConfigSave(){
		const save = {};
		for(const it in this.#configVarValues){
			const confVar = this.#configVarValues(it);
			if(confVar.value !== confVar.defaultValue){
				save[it] = confVar.value;
			}
		}
		return save;
	}

	addConfigVar(name, value, desc, friendlyName = undefined){
		if(this.#configVarValues[name]) throw new Error(`addConfigVar: ${name} already exists`);
		if(!friendlyName) friendlyName = name.toLowerCase();
		this.#configVarValues[name] = {value, defaultValue: value, friendlyName, desc};
	}
}
export const config = new Config;
