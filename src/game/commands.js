import { COMPONENTS } from "./data/ecsEnums.js";

/** @readonly */
export const MappedCommand = {
	MOVE_LEFT: "MOVE_LEFT",
	MOVE_RIGHT: "MOVE_RIGHT",
	MOVE_UP: "MOVE_UP",
	MOVE_DOWN: "MOVE_DOWN",
};

/** @readonly */
export const ExecutionalCommand = {
	MOVE: "MOVE", // { dx, dy, entityId }
};

const RAW_KEY_MAP = {
	ArrowLeft: MappedCommand.MOVE_LEFT,
	a: MappedCommand.MOVE_LEFT,
	ArrowRight: MappedCommand.MOVE_RIGHT,
	d: MappedCommand.MOVE_RIGHT,
	ArrowUp: MappedCommand.MOVE_UP,
	w: MappedCommand.MOVE_UP,
	ArrowDown: MappedCommand.MOVE_DOWN,
	s: MappedCommand.MOVE_DOWN,
};

export function getCommandFromKey(key) {
	return RAW_KEY_MAP[key];
}

export class CommandsManager {
	/** @type {Game}*/ #game;
	/** @type {GameData}*/ #gameData;
	constructor(game, gameData) {
		this.#game = game;
		this.#gameData = gameData;
	}

	applyCommand(cmd, entityId) {
		if (entityId === undefined) entityId = this.#gameData.playerId;

		let cmdObj;
		switch (cmd) {
			case MappedCommand.MOVE_LEFT:
				cmdObj = this.#executeMove(-1, 0, entityId);
				break;
			case MappedCommand.MOVE_RIGHT:
				cmdObj = this.#executeMove(1, 0, entityId);
				break;
			case MappedCommand.MOVE_UP:
				cmdObj = this.#executeMove(0, -1, entityId);
				break;
			case MappedCommand.MOVE_DOWN:
				cmdObj = this.#executeMove(0, 1, entityId);
				break;
		}
		if (!cmdObj) return;

		this.#game.processTurn();
	}

	#executeMove(dx, dy, entityId) {
		const cmdObj = { type: ExecutionalCommand.MOVE, dx, dy, entityId };

		const entity = this.#gameData.world.entity(entityId);
		this.#gameData.world.addComponent(entity, COMPONENTS.Command, { type: ExecutionalCommand.MOVE, dx, dy });

		return cmdObj;
	}
}
