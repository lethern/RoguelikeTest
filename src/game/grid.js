
const spatialGrid = {}; 

export const Grid = {
    getAt: (x, y) => spatialGrid[y]?.[x] || new Set(),
    move: (entity, oldX, oldY, newX, newY) => {
        if (spatialGrid[oldY]?.[oldX]) spatialGrid[oldY][oldX].delete(entity);
        if (!spatialGrid[newY]) spatialGrid[newY] = {};
        if (!spatialGrid[newY][newX]) spatialGrid[newY][newX] = new Set();
        spatialGrid[newY][newX].add(entity);
    },
    remove: (entity, x, y) => {
        if (spatialGrid[y]?.[x]) spatialGrid[y][x].delete(entity);
    }
};
