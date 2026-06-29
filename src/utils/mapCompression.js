export function compressMap(map) {
	const tileDict = {};
	const reverseDict = {};
	let nextId = 0;

	const flatTiles = new Array(map.width * map.height);

	for (let y = 0; y < map.height; y++) {
		for (let x = 0; x < map.width; x++) {
			const tileId = map.tiles[y][x];
			let mappedId = -1;

			if (tileId !== null) {
				if (!(tileId in reverseDict)) {
					reverseDict[tileId] = nextId;
					tileDict[nextId] = tileId;
					nextId++;
				}
				mappedId = reverseDict[tileId];
			}

			flatTiles[y * map.width + x] = mappedId;
		}
	}

	return { dict: tileDict, tiles: flatTiles };
}

export function decompressMap(compressedData, width) {
	const { dict, tiles } = compressedData;
	const height = tiles.length / width;
	const map2D = [];

	for (let y = 0; y < height; y++) {
		const row = [];
		for (let x = 0; x < width; x++) {
			const id = tiles[y * width + x];
			row.push(id === -1 ? null : dict[id]);
		}
		map2D.push(row);
	}
	return map2D;
}
