import {globalStore} from "../globalStore.js";
import {COMPONENTS} from "./data/ecsEnums.js";

export class EditorDevTest{
	static devTestInit(gameData){
		//const monster = archetypes.add({
		//	name: "Monster",
		//	components: [
		//		COMPONENTS.Position,
		//		COMPONENTS.Health,
		//		COMPONENTS.Timeline]
		//});

		const player = gameData.prefabStorage.add({
			name: "Player",
			archetype: "Monster",
			components: {
				[COMPONENTS.Position]: {x: 2, y: 2},
				[COMPONENTS.Health]: {current: 100, max: 100},
				[COMPONENTS.Timeline]: { isPlayer: true }
			}
		})
	}
}
export class GameDevTest{
	static devTestInit(gameData){
		globalStore.state.gameSession.currMapId = globalStore.state.editor.currMapId;

		const world = gameData.world;
		const player = world.add({
			name: "Gracz",
			Health: {current: 150, max: 150},
			Position:{
				x: 1,
				y: 1
			},
			TimelineTurn: { time: 100, isPlayer: true }
		});

		gameData.player = player;
		//Grid.move(player, null, null, player.Position.x, player.Position.y);
	}
}