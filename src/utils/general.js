
export function bind(fn, context) {
	const bound = fn.bind(context);
	Object.defineProperty(bound, "name", {
		value: `${context.constructor.name}:${fn.name}`,
		configurable: true
	});
	return bound;
}
