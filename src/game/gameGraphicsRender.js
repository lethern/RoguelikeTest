import {config} from "../config.js";
import {globalStore} from "../globalStore.js";

const GameConfig = Object.freeze({
	FOV_RAY_SOFTENING: "FOV_RAY_SOFTENING",
});
const GameDebugConfig = Object.freeze({
	SHOW_FOV_RAYS: "SHOW_FOV_RAYS",
});

config.addConfigVar(GameConfig.FOV_RAY_SOFTENING, 0.3, 'Lower value: better looking around corner, higher: walls obstruct more. Ideal value: 0.2 - 0.3. Range: 0.0 - 1.0', 'fovRaySoftening', 'GameConfig');
config.addConfigVar(GameDebugConfig.SHOW_FOV_RAYS, false, 'Show FoV rays', 'showFovRays', 'GameDebugConfig');

export class GameRenderer {
	#toRender = false;
	#debugRays = [];
	#gameData;

	constructor(gameData) {
		this.#gameData = gameData;
		this.animationFrameId = null;
	}

	init() {
		this.rootElement = document.getElementById('gameView');
		this.canvas = document.createElement('canvas');
		this.canvas.className = 'gameCanvas';
		this.ctx = this.canvas.getContext('2d');
		this.rootElement.appendChild(this.canvas);

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(this.rootElement);
	}

	resize() {
		if(!this.rootElement) return;
		this.canvas.width = this.rootElement.clientWidth;
		this.canvas.height = this.rootElement.clientHeight;
		this.render();
	}

	showGame(enabled){
		if(enabled){
			this.resize();
			this.render();
		}
	}

	render() {
		this.#toRender = true;
	}

	tick(){
		if(this.#toRender){
			this.#toRender = false;
			this.#doRender();
		}
	}

	/*
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
	 */


	static #FOVMarkVisible(fovSet, x,y){
		fovSet.add((y << 16) | x);
	}

	static #FOVIsVisible(fovSet, x,y){
		return fovSet.has((y << 16) | x)
	}
	#computeFOV(map, originX, originY, radius, fovSoftening) {
		const visible = new Set();
		const WALL_COST = 10000;

		GameRenderer.#FOVMarkVisible(visible, originX, originY);

		const getVisionCost = (x, y) => {
			if (x < 0 || x >= map.width || y < 0 || y >= map.height) return WALL_COST;
			const tileId = map.tiles[y][x];
			if (!tileId) return WALL_COST;
			const tile = globalStore.state.tileDictionary[tileId];
			if (!tile || tile.blocksVision) return WALL_COST;

			//return map.lightCost?.[y]?.[x] ?? 0;
			return 0;
		};

		const cast = (depth, startSlope, endSlope, xx, xy, yx, yy, accCost) => {
			if (startSlope >= endSlope || accCost >= radius || depth > radius) return;

			let prevCost = -1;
			let savedSlope = startSlope;
			let prevSlopeRight = 0.0;

			for (let col = 0; col <= depth; col++) {
				const slopeLeft = col === 0 ? 0.0 : Math.max(0.0, (col - fovSoftening) / (depth + 0.5));
				const slopeRight = col === depth ? 1.0 : Math.min(1.0, (col + fovSoftening) / (depth - 0.5));

				if (slopeRight <= startSlope) continue;
				if (slopeLeft >= endSlope) break;

				const tx = originX + col * xx + depth * xy;
				const ty = originY + col * yx + depth * yy;

				if (this.#debugRays) {
					this.#debugRays.push({ x1: originX, y1: originY, x2: tx, y2: ty });
				}

				const dist = Math.hypot(col, depth);
				const cellCost = getVisionCost(tx, ty);

				if (dist + accCost <= radius) {
					GameRenderer.#FOVMarkVisible(visible, tx, ty);
				}

				if (prevCost !== -1) {
					if (cellCost !== prevCost) {
						if (prevCost < WALL_COST) {
							const branchEndSlope = Math.min(endSlope, slopeLeft);
							if (savedSlope < branchEndSlope) {
								cast(depth + 1, savedSlope, branchEndSlope, xx, xy, yx, yy, accCost + prevCost);
							}
						}
						savedSlope = Math.max(startSlope, prevCost === WALL_COST ? prevSlopeRight : slopeLeft);
					}
				}

				prevCost = cellCost;
				prevSlopeRight = slopeRight;
			}

			if (prevCost !== -1 && prevCost < WALL_COST && savedSlope < endSlope) {
				cast(depth + 1, savedSlope, endSlope, xx, xy, yx, yy, accCost + prevCost);
			}
		};

		const octants = [
			[1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1],
			[-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1]
		];

		for (const [xx, xy, yx, yy] of octants) {
			cast(1, 0.0, 1.0, xx, xy, yx, yy, 0);
		}

		return visible;
	}

	#doRender() {
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
		//const player = globalStore.state.gameSession.player;
		const player = this.#gameData.player;

		let fov = new Set();
		if (player) {
			const fovSoftening = config.getConfigValue(GameConfig.FOV_RAY_SOFTENING);
			if(config.getConfigValue(GameDebugConfig.SHOW_FOV_RAYS)){
				this.#debugRays = [];
			}else{
				this.#debugRays = undefined;
			}
			fov = this.#computeFOV(map, player.Position.x, player.Position.y, 20, fovSoftening);
		}

		// Render tiles
		for (let y = 0; y < map.height; y++) {
			for (let x = 0; x < map.width; x++) {
				if (player && !GameRenderer.#FOVIsVisible(fov, x, y)) continue;

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
		if (player) {
			ctx.fillStyle = '#FFF';
			ctx.font = `${tileSize}px monospace`;
			ctx.fillText('@', player.Position.x * tileSize + tileSize / 2, player.Position.y * tileSize + tileSize / 2);
		}

		if (this.#debugRays) {
			ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
			ctx.lineWidth = 1;
			for (const ray of this.#debugRays) {
				ctx.beginPath();
				ctx.moveTo(ray.x1 * tileSize + tileSize/2, ray.y1 * tileSize + tileSize/2);
				ctx.lineTo(ray.x2 * tileSize + tileSize/2, ray.y2 * tileSize + tileSize/2);
				ctx.stroke();
			}
			this.#debugRays = [];
		}
	}
}