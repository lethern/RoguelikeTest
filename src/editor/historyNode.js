export class HistoryNode {
	/** @type number */ seqN;
	/** @type {BaseCommand} */ command;
	/** @type {HistoryNode} */ parent = null;
	/** @type {array[HistoryNode]} */ children = [];
	/** @type number */ timestamp = Date.now();

	constructor(seqN, command) {
		this.seqN = seqN;
		this.command = command;
	}

	/** @param {HistoryNode} node */
	addChild(node) {
		node.parent = this;
		this.children.push(node);
	}

	/** @returns {HistoryNode} */
	getLatestChild() {
		if (this.children.length === 0) return null;
		return this.children[this.children.length - 1];
	}

	serialize() {
		return {
			seqN: this.seqN,
			time: this.timestamp,
			parId: this.parent ? this.parent.seqN : null,
			chIds: this.children.map((child) => child.seqN),
			_class: this.command ? this.command.serializeClass() : null,
			_data: this.command ? this.command.serialize() : null,
		};
	}

	static deserialize(data, current) {
		let command = commandRegistry.deserialize(data._class, data._data);

		const node = new HistoryNode(data.seqN, command);
		node.timestamp = data.time;

		if (data.chIds.length !== 0 || data.parId !== current.seqN) {
			return null;
		}

		current.addChild(node);
		return node;
	}

	static deserializeList(serializedNodes) {
		const nodeMap = new Map();

		serializedNodes.forEach((data) => {
			let command = null;
			if (data._class) {
				command = commandRegistry.deserialize(data._class, data._data);
			}

			const node = new HistoryNode(data.seqN, command);
			node.timestamp = data.time;
			nodeMap.set(node.seqN, { node, data });
		});

		nodeMap.forEach(({ node, data }) => {
			if (data.parId !== null && nodeMap.has(data.parId)) {
				const parentNode = nodeMap.get(data.parId).node;
				node.parent = parentNode;

				if (!parentNode.children.includes(node)) {
					parentNode.children.push(node);
				}
			}

			data.chIds.forEach((childId) => {
				if (nodeMap.has(childId)) {
					const childNode = nodeMap.get(childId).node;
					if (!node.children.includes(childNode)) {
						node.children.push(childNode);
					}
				}
			});
		});

		return Array.from(nodeMap.values()).map((entry) => entry.node);
	}
}

export class BaseCommand {
	constructor(data) {
		this.data = data;
		this.isUiSkip = false;
	}
	execute() {
		throw new Error("Not implemented");
	}
	undo() {
		throw new Error("Not implemented");
	}
	canAppend(baseConfig, maxItems) {
		return false;
	}
	appendAndExecute(paintItem) {
		throw new Error("Not implemented");
	}
	serializeClass() {
		return this.constructor.name;
	}

	/** @returns {object} */
	serialize() {
		return this.data;
	}
}

class CommandRegistry {
	#classes = new Map();
	register(commandClass) {
		if (this.#classes.has(commandClass.name)) {
			throw new Error(`Duplicate command registration: ${commandClass.name}`);
		}
		this.#classes.set(commandClass.name, commandClass);
	}

	deserialize(className, data) {
		const CommandClass = this.#classes.get(className);
		if (!CommandClass) throw new Error(`Unknown command: ${className}`);
		return new CommandClass(data);
	}
}

export const commandRegistry = new CommandRegistry();
