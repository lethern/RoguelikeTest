const TILE_WALL = 0, TILE_FLOOR = 1, TILE_DOOR = 2;

const DUNGEON_CONFIG = {
	minRooms: 6, maxRooms: 12, minRoomSize: 4, maxRoomSize: 12,
	roomPadding: 3, corridorType: "mixed", extraLoopChance: 0.25, seed: null
};

let currentSeed = Math.floor(Math.random() * 1000000);
const seededRandom = () => {
	let t = (currentSeed += 0x6D2B79F5);
	t = Math.imul(t ^ (t >>> 15), t | 1);
	return (((t ^= t + Math.imul(t ^ (t >>> 7), t | 61)) ^ (t >>> 14)) >>> 0) / 4294967296;
};
const setSeed = seed => currentSeed = seed;

function createMap(w, h) {
	return { width: w, height: h, terrain: Array.from({ length: w }, () => Array(h).fill(TILE_WALL)) };
}

function placeRooms(map, config) {
	const rooms = [], attempts = config.maxRooms * 10;
	const pad = config.roomPadding;

	for (let i = 0; i < attempts && rooms.length < config.maxRooms; i++) {
		const w = Math.floor(seededRandom() * (config.maxRoomSize - config.minRoomSize + 1)) + config.minRoomSize;
		const h = Math.floor(seededRandom() * (config.maxRoomSize - config.minRoomSize + 1)) + config.minRoomSize;
		const x1 = Math.floor(seededRandom() * (map.width - w - 4)) + 2;
		const y1 = Math.floor(seededRandom() * (map.height - h - 4)) + 2;
		const x2 = x1 + w - 1, y2 = y1 + h - 1;

		if (!rooms.some(r => x1 - pad <= r.x2 && x2 + pad >= r.x1 && y1 - pad <= r.y2 && y2 + pad >= r.y1)) {
			rooms.push({
				id: rooms.length + 1, x1, y1, x2, y2, w, h,
				centerX: Math.floor(x1 + w / 2), centerY: Math.floor(y1 + h / 2),
				connectedTo: []
			});
			for (let x = x1; x <= x2; x++) {
				for (let y = y1; y <= y2; y++) map.terrain[x][y] = TILE_FLOOR;
			}
		}
	}
	return rooms;
}

function computeMST(rooms) {
	const connected = [rooms[0]], unconnected = rooms.slice(1), edges = [];
	while (unconnected.length > 0) {
		let minD = Infinity, best = null, targetIdx = -1;
		connected.forEach(r1 => unconnected.forEach((r2, j) => {
			const dist = Math.hypot(r1.centerX - r2.centerX, r1.centerY - r2.centerY);
			if (dist < minD) { minD = dist; best = { from: r1, to: r2 }; targetIdx = j; }
		}));
		if (best) { edges.push(best); connected.push(best.to); unconnected.splice(targetIdx, 1); }
	}
	return edges;
}

function selectExtraLoops(rooms, mstEdges, maxW, chance) {
	const extra = [];
	for (let i = 0; i < rooms.length; i++) {
		for (let j = i + 1; j < rooms.length; j++) {
			if (!mstEdges.some(e => (e.from === rooms[i] && e.to === rooms[j]) || (e.from === rooms[j] && e.to === rooms[i]))) {
				if (Math.hypot(rooms[i].centerX - rooms[j].centerX, rooms[i].centerY - rooms[j].centerY) < maxW * 0.4 && seededRandom() < chance) {
					extra.push({ from: rooms[i], to: rooms[j] });
				}
			}
		}
	}
	return extra;
}

function getTileCost(x, y, map, rooms, fromRoom, toRoom, nextDir) {
	if (x < 0 || x >= map.width || y < 0 || y >= map.height) return Infinity;
	if (rooms.some(r => r.id !== fromRoom.id && r.id !== toRoom.id && x >= r.x1 - 1 && x <= r.x2 + 1 && y >= r.y1 - 1 && y <= r.y2 + 1)) return Infinity;

	if (map.terrain[x][y] === TILE_FLOOR && !rooms.some(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2)) return 0.1;

	for (const r of [fromRoom, toRoom]) {
		if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) return 1.0;
		if (x >= r.x1 - 1 && x <= r.x2 + 1 && y >= r.y1 - 1 && y <= r.y2 + 1) {
			if (((x === r.x1 - 1 || x === r.x2 + 1) && (y === r.y1 - 1 || y === r.y2 + 1)) ||
				((y === r.y1 || y === r.y2) && (x === r.x1 - 1 || x === r.x2 + 1)) ||
				((x === r.x1 || x === r.x2) && (y === r.y1 - 1 || y === r.y2 + 1))) return Infinity;
			return 10.0;
		}
	}

	let cost = 1.0;
	if (nextDir) {
		const perps = nextDir.x !== 0 ? [{x: 0, y: -1}, {x: 0, y: 1}] : [{x: -1, y: 0}, {x: 1, y: 0}];
		perps.forEach(p => {
			for (let s = 1; s <= 2; s++) {
				const sx = x + p.x * s, sy = y + p.y * s;
				if (sx >= 0 && sx < map.width && sy >= 0 && sy < map.height && map.terrain[sx][sy] === TILE_FLOOR && !rooms.some(r => sx >= r.x1 && sx <= r.x2 && sy >= r.y1 && sy <= r.y2)) {
					cost += s === 1 ? 60.0 : 30.0;
				}
			}
		});
	}
	return cost;
}

function findSmartPath(map, rooms, fromRoom, toRoom, type) {
	const start = { x: fromRoom.centerX, y: fromRoom.centerY }, end = { x: toRoom.centerX, y: toRoom.centerY };
	const openSet = [{ ...start, g: 0, h: Math.abs(start.x - end.x) + Math.abs(start.y - end.y), f: Math.abs(start.x - end.x) + Math.abs(start.y - end.y), parent: null, dir: null }];
	const closedSet = new Set(), penalty = type === "L-shape" ? 25 : (type === "zigzag" ? 6 : 15);

	while (openSet.length > 0) {
		openSet.sort((a, b) => a.f - b.f);
		const curr = openSet.shift();
		if (curr.x === end.x && curr.y === end.y) {
			const path = []; let p = curr;
			while (p) { path.push({ x: p.x, y: p.y }); p = p.parent; }
			return path.reverse();
		}

		closedSet.add(`${curr.x},${curr.y},${curr.dir ? `${curr.dir.x},${curr.dir.y}` : "0,0"}`);
		const dirs = [{x:1, y:0}, {x:-1, y:0}, {x:0, y:1}, {x:0, y:-1}];

		for (const d of dirs) {
			const nx = curr.x + d.x, ny = curr.y + d.y;
			if (closedSet.has(`${nx},${ny},${d.x},${d.y}`)) continue;

			const base = getTileCost(nx, ny, map, rooms, fromRoom, toRoom, d);
			if (base === Infinity) continue;

			let gScore = curr.g + base + (curr.dir && (curr.dir.x !== d.x || curr.dir.y !== d.y) ? penalty : 0);
			const hScore = Math.abs(nx - end.x) + Math.abs(ny - end.y);
			const match = openSet.find(o => o.x === nx && o.y === ny && o.dir && o.dir.x === d.x && o.dir.y === d.y);

			if (!match) openSet.push({ x: nx, y: ny, g: gScore, h: hScore, f: gScore + hScore, parent: curr, dir: d });
			else if (gScore < match.g) { match.g = gScore; match.f = gScore + hScore; match.parent = curr; }
		}
	}
	return null;
}

function cleanupDungeonDoorsAndDeadEnds(map, rooms) {
	const card = [{x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y:-1}];

	const hasPath = (d1, d2) => {
		const q = [[d1.x, d1.y, 0]], vis = new Set([`${d1.x},${d1.y}`]);
		while (q.length > 0) {
			const [cx, cy, d] = q.shift();
			if (cx === d2.x && cy === d2.y) return true;
			if (d >= 6) continue;
			for (const dir of card) {
				const nx = cx + dir.x, ny = cy + dir.y;
				if (!vis.has(`${nx},${ny}`) && nx >= 0 && nx < map.width && ny >= 0 && ny < map.height && map.terrain[nx][ny] === TILE_FLOOR && !rooms.some(r => nx >= r.x1 && nx <= r.x2 && ny >= r.y1 && ny <= r.y2)) {
					vis.add(`${nx},${ny}`); q.push([nx, ny, d + 1]);
				}
			}
		}
		return false;
	};

	rooms.forEach(room => {
		const doors = [];
		for (let x = room.x1 - 1; x <= room.x2 + 1; x++) {
			for (let y = room.y1 - 1; y <= room.y2 + 1; y++) {
				if ((x === room.x1 - 1 || x === room.x2 + 1) ^ (y === room.y1 - 1 || y === room.y2 + 1)) {
					if (map.terrain[x][y] === TILE_FLOOR) {
						doors.push({ x, y, side: x === room.x1 - 1 ? 0 : x === room.x2 + 1 ? 1 : y === room.y1 - 1 ? 2 : 3, rem: false });
					}
				}
			}
		}

		for (let s = 0; s < 4; s++) {
			const sDoors = doors.filter(d => d.side === s).sort((a, b) => s < 2 ? a.y - b.y : a.x - b.x);
			for (let i = 0; i < sDoors.length; i++) {
				for (let j = i + 1; j < sDoors.length; j++) {
					if (!sDoors[i].rem && !sDoors[j].rem && Math.abs((s < 2 ? sDoors[i].y - sDoors[j].y : sDoors[i].x - sDoors[j].x)) <= 4 && hasPath(sDoors[i], sDoors[j])) {
						map.terrain[sDoors[j].x][sDoors[j].y] = TILE_WALL; sDoors[j].rem = true;
					}
				}
			}
		}
		doors.forEach(d => { if (!d.rem) map.terrain[d.x][d.y] = TILE_DOOR; });
	});

	let loop = true;
	while (loop) {
		loop = false;
		for (let x = 1; x < map.width - 1; x++) {
			for (let y = 1; y < map.height - 1; y++) {
				if (map.terrain[x][y] === TILE_FLOOR && !rooms.some(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2)) {
					let walls = 0, nearDoor = false;
					card.forEach(d => {
						if (map.terrain[x + d.x][y + d.y] === TILE_WALL) walls++;
						if (map.terrain[x + d.x][y + d.y] === TILE_DOOR) nearDoor = true;
					});
					if (walls >= 3 && !nearDoor) { map.terrain[x][y] = TILE_WALL; loop = true; }
				}
			}
		}
	}
}

function generateDungeon(width, height, config = DUNGEON_CONFIG) {
	if (config.seed !== null && config.seed !== undefined) setSeed(config.seed);
	const seed = currentSeed, map = createMap(width, height), rooms = placeRooms(map, config);
	if (rooms.length < 2) return generateDungeon(width, height, config);

	const corridors = [];
	const edges = [...computeMST(rooms), ...selectExtraLoops(rooms, computeMST(rooms), width, config.extraLoopChance)];

	edges.forEach(e => {
		let type = config.corridorType === "mixed" ? (seededRandom() < 0.85 ? "L-shape" : "zigzag") : config.corridorType;
		const path = findSmartPath(map, rooms, e.from, e.to, type);
		if (path && path.length > 0) {
			path.forEach(pt => { map.terrain[pt.x][pt.y] = TILE_FLOOR; });

			if (!e.from.connectedTo.includes(e.to.id)) e.from.connectedTo.push(e.to.id);
			if (!e.to.connectedTo.includes(e.from.id)) e.to.connectedTo.push(e.from.id);

			corridors.push({
				fromRoom: e.from.id,
				toRoom: e.to.id,
				type: type,
				startPos: { x: path[0].x, y: path[0].y },
				endPos: { x: path[path.length - 1].x, y: path[path.length - 1].y },
				length: path.length
			});
		}
	});

	cleanupDungeonDoorsAndDeadEnds(map, rooms);
	return { map, rooms, corridors, seed };
}

function drawMap(ctx, map, size) {
	const colors = ["#111116", "#3a3a42", "#c678dd"];
	for (let x = 0; x < map.width; x++) {
		for (let y = 0; y < map.height; y++) {
			ctx.fillStyle = colors[map.terrain[x][y]];
			ctx.fillRect(x * size, y * size, size, size);
		}
	}
}