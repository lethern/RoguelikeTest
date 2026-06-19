class Config {
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
		if(!ConfigVarValues[name]) throw new Error(`getConfigVar: missing var ${name}`);
		return ConfigVarValues[name];
	}

	createConfigSave(){
		const save = {};
		for(const it in ConfigVar){
			const confVar = this.getConfigVarObject(it);
			if(confVar.value !== confVar.defaultValue){
				save[it] = confVar.value;
			}
		}
		return save;
	}

	addConfigVar(name, value, desc, friendlyName = undefined){
		if(ConfigVarValues[name]) throw new Error(`addConfigVar: ${name} already exists`);
		if(!friendlyName) friendlyName = name.toLowerCase();
		ConfigVarValues[name] = {value, defaultValue: value, friendlyName, desc};
	}
}
export const config = new Config;