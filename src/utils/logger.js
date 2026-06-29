import { config } from "../config.js";

const LoggerConfig = Object.freeze({
	ENABLE_LOGGING: "ENABLE_LOGGING",
});

config.addConfigVar(LoggerConfig.ENABLE_LOGGING, true, "Enable custom logging", "enableLogging", "Logger");

class Logger {
	#logs = [];

	log(message, ...args) {
		if (config.getConfigValue(LoggerConfig.ENABLE_LOGGING)) {
			console.log(message, ...args);
			this.#logs.push({ message, args, timestamp: Date.now() });
		}
	}

	getLogs() {
		return this.#logs;
	}
}

export const logger = new Logger();
