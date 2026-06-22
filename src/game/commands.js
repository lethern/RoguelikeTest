import { globalStore } from "../globalStore.js";
import { gameRenderer } from "./game.js";

/** @readonly */
export const Command = {
	MOVE_LEFT: "MOVE_LEFT",
	MOVE_RIGHT: "MOVE_RIGHT",
	MOVE_UP: "MOVE_UP",
	MOVE_DOWN: "MOVE_DOWN",
};

const RAW_KEY_MAP = {
	ArrowLeft: Command.MOVE_LEFT, a: Command.MOVE_LEFT,
	ArrowRight: Command.MOVE_RIGHT, d: Command.MOVE_RIGHT,
	ArrowUp: Command.MOVE_UP, w: Command.MOVE_UP,
	ArrowDown: Command.MOVE_DOWN, s: Command.MOVE_DOWN
};

export function getCommandFromKey(key) {
	return RAW_KEY_MAP[key];
}

class MapTooling {
	static canMove(entity, dx, dy) {
		const mapId = globalStore.state.gameSession.currMapId;
		const map = globalStore.state.maps[mapId];
		if (!map) return false;

		const x = entity.x + dx;
		const y = entity.y + dy;

		// Swapped to [y][x] to match the row-major rendering iteration in game.js
		if (!map.tiles[y] || !map.tiles[y][x]) return false;

		const tileId = map.tiles[y][x];
		const tile = globalStore.state.tileDictionary[tileId];
		if (!tile || !tile.passable) return false;

		return true;
	}
}

class CommandMove {
	constructor(dx, dy) {
		this.dx = dx;
		this.dy = dy;
	}

	execute({ entity }) {
		CommandMove.move(entity, this.dx, this.dy);
	}

	undo({ entity }) {
		CommandMove.move(entity, -this.dx, -this.dy);
	}

	static move(entity, dx, dy) {
		if (MapTooling.canMove(entity, dx, dy)) {
			entity.x += dx;
			entity.y += dy;
		}
	}
}

const COMMAND_HANDLERS = {
	[Command.MOVE_LEFT]: new CommandMove(-1, 0),
	[Command.MOVE_RIGHT]: new CommandMove(1, 0),
	[Command.MOVE_UP]: new CommandMove(0, -1),
	[Command.MOVE_DOWN]: new CommandMove(0, 1)
};

class CommandsManager{
	applyCommand(cmd, data) {
		const handler = COMMAND_HANDLERS[cmd];
		if (!handler) return;

		handler.execute(data);
		gameRenderer.render();
	}
}

export const commandsManager = new CommandsManager();
