import { globalStore } from '../globalStore.js';
import { inputsManager } from './inputsManager.js';
import {gui} from "../gui.js";
import {GuiEvents} from "../editor/editorEvents.js";

class GameRenderer {
	#toRender = false;

	constructor() {
		this.startedSession = false;
		this.animationFrameId = null;

		gui.on(GuiEvents.SHOW_GAME, (enabled) => this.showGame(enabled));
	}

	init() {
		this.rootElement = document.getElementById('gameView');
		this.canvas = document.createElement('canvas');
		this.canvas.className = 'gameCanvas';
		this.ctx = this.canvas.getContext('2d');
		this.rootElement.appendChild(this.canvas);

		window.addEventListener('resize', () => this.resize());

		window.addEventListener('keydown', (e) => {
			if (this.rootElement.style.display !== 'none') inputsManager.keyDown(e.key);
		});

		window.addEventListener('keyup', (e) => {
			if (this.rootElement.style.display !== 'none') inputsManager.keyUp(e.key);
		});

		this.loop = this.loop.bind(this);
		this.animationFrameId = requestAnimationFrame(this.loop);
	}

	resize() {
		this.canvas.width = this.rootElement.clientWidth;
		this.canvas.height = this.rootElement.clientHeight;
		this.render();
	}

	initSession() {
		if (!globalStore.state.gameSession.currMapId) {
			globalStore.state.gameSession.currMapId = globalStore.state.editor.currMapId;
			globalStore.state.gameSession.player = {x: 1, y: 1};
		}
		this.startedSession = true;
	}

	showGame(enabled){
		if(enabled){
			this.resize();
			this.render();
		}
	}

	loop(currentTime) {
		if (this.rootElement.style.display !== 'none') {
			inputsManager.handleKeyboard(currentTime);
		}

		if (this.#toRender) {
			this.#doRender();
			this.#toRender = false;
		}

		this.animationFrameId = requestAnimationFrame(this.loop);
	}

	render() {
		this.#toRender = true;
	}

	#doRender() {
		if (!this.startedSession) this.initSession();

		const ctx = this.ctx;
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

		const mapId = globalStore.state.gameSession.currMapId;
		const map = globalStore.state.maps[mapId];

		if (!map) {
			ctx.fillStyle = '#FFF';
			ctx.fillText('No map loaded', 10, 10);
			return;
		}

		const tileSize = 24;

		// Render tiles
		for (let y = 0; y < map.height; y++) {
			for (let x = 0; x < map.width; x++) {
				const tileId = map.tiles[y][x];
				if (!tileId) continue;
				const tile = globalStore.state.tileDictionary[tileId];
				if (!tile) continue;
				const gTile = globalStore.state.graphicalTiles[tile.graphicalId] || {char: '?', color: '#FFF'};
				ctx.fillStyle = gTile.color;
				ctx.font = `${tileSize}px monospace`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(gTile.char, x * tileSize + tileSize / 2, y * tileSize + tileSize / 2);
			}
		}

		// Render player
		const player = globalStore.state.gameSession.player;
		if (player) {
			ctx.fillStyle = '#FFF';
			ctx.font = `${tileSize}px monospace`;
			ctx.fillText('@', player.x * tileSize + tileSize / 2, player.y * tileSize + tileSize / 2);
		}
	}
}

export const gameRenderer = new GameRenderer();