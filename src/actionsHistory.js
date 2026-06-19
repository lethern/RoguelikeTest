import EventEmitter from './utils/eventEmitter.js';

class HistoryNode {
	/** @type number */seqN;
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
			timestamp: this.timestamp,
			parentId: this.parent ? this.parent.seqN : null,
			childrenIds: this.children.map(child => child.seqN),
			commandClass: this.command ? this.command.serializeClass() : null,
			commandData: this.command ? this.command.serialize() : null
		};
	}

	static deserializeList(serializedNodes) {
		const nodeMap = new Map();

		serializedNodes.forEach(data => {
			let command = null;
			if (data.commandClass && data.commandData) {
				command = commandRegistry.deserialize(data.commandClass, data.commandData);
			}

			const node = new HistoryNode(data.seqN, command);
			node.timestamp = data.timestamp;
			nodeMap.set(node.seqN, { node, data });
		});

		nodeMap.forEach(({ node, data }) => {
			if (data.parentId !== null && nodeMap.has(data.parentId)) {
				node.parent = nodeMap.get(data.parentId).node;
			}

			data.childrenIds.forEach(childId => {
				if (nodeMap.has(childId)) {
					node.children.push(nodeMap.get(childId).node);
				}
			});
		});

		return Array.from(nodeMap.values()).map(entry => entry.node);
	}
}

class BaseCommand {
	constructor(data) {
		this.data = data;
		this.isUiSkip = false;
	}
	execute() { throw new Error("Not implemented"); }
	undo() { throw new Error("Not implemented"); }
	serializeClass() { return this.constructor.name; }

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

class ActionsHistory extends EventEmitter{
	#commandIdSeq = 0;
	/** @type {HistoryNode} */
	#commandsHistoryCurrent;
	/** @type {HistoryNode} */
	#commandsHistoryStart;
	/** @type {HistoryNode} */
	#commandsHistoryEnd;

	constructor() {
		super();
		this.#commandsHistoryCurrent = new HistoryNode(this.#commandIdSeq++, new BaseCommand());
		this.#commandsHistoryStart = this.#commandsHistoryEnd = this.#commandsHistoryCurrent;
	}

	/** @param {BaseCommand} command
	 * @param {{sendWs: boolean, savePersistant: boolean}} config */
	dispatch(command, config = {sendWs: true, savePersistant: true}) {
		command.execute();

		this.recordDispatched(command, config);
	}

	/** @param {BaseCommand} command
	 * @param {{sendWs: boolean, savePersistant: boolean}} config */
	recordDispatched(command, config = {sendWs: true, savePersistant: true}) {
		this.#pushCommand(command, config);
		console.log('recordDispatched ', command);

		this.emit('commandDispatched', command, config);
	}

	/** @param {BaseCommand} command
	 * @param {{sendWs: boolean, savePersistant: boolean}} config */
	#pushCommand(command, config) {
		const next = new HistoryNode(this.#commandIdSeq++, command);
		this.#commandsHistoryCurrent.addChild(next);

		if(this.#commandsHistoryEnd === this.#commandsHistoryCurrent) this.#commandsHistoryEnd = next;
		this.#commandsHistoryCurrent = next;

		this.emit('commandAdded', next, config);
	}

	stepBack(sendNotif = true){
		if(this.#commandsHistoryCurrent === this.#commandsHistoryEnd) {
			//inputsManager.setKeyboardEnabled(false);
		}
		const current = this.#commandsHistoryCurrent;
		if(!current.parent) return;

		this.#commandsHistoryCurrent = current.parent;

		console.log("stepBack ", current.command)
		current.command.undo();

		this.emit('stepBack', sendNotif);

		if(current.command.isUiSkip){
			this.stepBack(false);
		}
	}

	stepForward(sendNotif = true){
		const next = this.#commandsHistoryCurrent.getLatestChild();
		if(!next) return;

		console.log("stepForward ", next.command)
		this.#commandsHistoryCurrent = next;
		next.command.execute();

		this.emit('stepForward', sendNotif);

		if(next.command.isUiSkip){
			this.stepForward(false);
		}
	}

	/** @returns {HistoryNode} */
	getHistoryRoot() {
		return this.#commandsHistoryStart;
	}

	/** @returns {HistoryNode} */
	getCurrentNode() {
		return this.#commandsHistoryCurrent;
	}
}

const actions = new ActionsHistory();
const commandRegistry = new CommandRegistry();

export {actions, HistoryNode, BaseCommand, commandRegistry}