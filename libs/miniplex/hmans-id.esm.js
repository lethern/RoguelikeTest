var entityToId = new WeakMap();
var nextId = 0;
function id(object) {
  var id = entityToId.get(object);
  if (id !== undefined) return id;
  entityToId.set(object, nextId);
  return nextId++;
};

export { id };
