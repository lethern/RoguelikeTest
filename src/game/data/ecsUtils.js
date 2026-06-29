import {globalStore} from "../../globalStore.js";


class FieldOfView{
	canSee(observer, target, x, y){
		return true;
	}

	canHear(observer, x, y) {
		return true;
	}
}

export class MapTooling {
	static canMove(entity, x, y) {
		const mapId = globalStore.state.gameSession.currMapId;
		const map = globalStore.state.maps[mapId];
		if (!map) return false;

		if (!map.tiles[y] || !map.tiles[y][x]) return false;

		const tileId = map.tiles[y][x];
		const tile = globalStore.state.tileDictionary[tileId];

		return tile && !tile.blocksMovement;
	}
}

export const fieldOfView = new FieldOfView();