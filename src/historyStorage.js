import {StorageManager} from "./utils/storage.js";
import {BaseCommand, HistoryNode} from "./historyNode.js";
import EventEmitter from "./utils/eventEmitter.js";
import {persistenceManager} from "./persistenceManager.js";
import {PersistenceEvents, HistoryEvents} from "./editor/editorEvents.js";


export const SNAPSHOT_KEY = "action_history_snapshot";
export const JOURNAL_KEY = "action_history_journal";
export const CURRENT_SEQ_KEY = "action_current_seq";

const MAX_NODES = 500;

class ActionPersistence {
	#loaded = false;

	constructor() {
		this.#initPersistence();
	}

	#initPersistence() {
		persistenceManager.on(PersistenceEvents.SAVE, (components) => {
			this.saveNodes();
		});
		persistenceManager.on(PersistenceEvents.AFTER_LOAD, (components) => {
			this.loadNodes();
		});
	}

	saveNode(/** @type {HistoryNode} */ node) {
		if(!this.#loaded) return;
		const journal = StorageManager.get(JOURNAL_KEY) || [];
		journal.push(node.serialize());

		// parent was saved before *node* existed, thus parent has empty children - update it
		if (node.parent) {
			const parentIndex = journal.findIndex(n => n.seqN === node.parent.seqN);
			if(parentIndex > -1)
				journal[parentIndex] = node.parent.serialize();
		}

		StorageManager.set(JOURNAL_KEY, journal);

		this.saveCurrentSeqN(actions.getCurrentNode().seqN);
	}

	saveCurrentSeqN(seqN) {
		if(!this.#loaded) return;
		StorageManager.set(CURRENT_SEQ_KEY, seqN);
	}

	loadNodes(){
		const snapshot = StorageManager.get(SNAPSHOT_KEY) || [];
		const journal = StorageManager.get(JOURNAL_KEY) || [];
		const allNodesData = [...snapshot, ...journal];
		const storedCurrentSeqN = StorageManager.get(CURRENT_SEQ_KEY);
		this.#loaded = true;

		if (allNodesData.length === 0) {
			return;
		}

		const allNodes = HistoryNode.deserializeList(allNodesData);
		const nodeMap = new Map(allNodes.map(n => [n.seqN, n]));

		const latestNode = allNodes.reduce((latest, node) =>
			node.seqN > latest.seqN ? node : latest );

		const endSeqN = latestNode.seqN;
		const currentSeqN = storedCurrentSeqN !== null ? storedCurrentSeqN : latestNode.seqN;

		// make a path from current to root (parent == null), store in reverse
		const path = [];
		let temp = nodeMap.get(currentSeqN);
		while(temp) {
			path.unshift(temp);
			temp = temp.parent;
		}

		path.filter(n => n.command).forEach(node => actions.dispatchDeserialized(node));

		actions.replaceHistory(allNodes, currentSeqN, endSeqN);

		this.#persistSnapshot(allNodes, currentSeqN, endSeqN);
	}

	saveNodes(){
		this.#persistSnapshot(actions.getAllNodes(), actions.getCurrentNode().seqN, actions.getLastNode().seqN);
	}

	/** @param allNodes
	 * @param currentSeqN
	 * @returns {HistoryNode[]} */
	#prune(allNodes, currentSeqN) {
		if (allNodes.length <= MAX_NODES) return allNodes;

		const nodesToRemove = new Set();
		let nodesCount = allNodes.length;
		const targetCount = MAX_NODES / 2;

		let root = allNodes.find(n => n.parent === null);

		while (nodesCount > targetCount && root) {
			if (root.seqN === currentSeqN) break;
			if (root.children.length === 0) break;

			const nextChild = root.children.reduce((lowest, child) =>
				(!lowest || child.seqN < lowest.seqN) ? child : lowest, root.children[0]);

			nodesToRemove.add(root);
			root.children = null;
			nextChild.parent = null;
			root = nextChild;
			nodesCount--;
		}

		return allNodes.filter(n => !nodesToRemove.has(n));
	}

	/** @param {HistoryNode[]} nodes
	 * @param currentSeqN
	 * @param endSeqN */
	#persistSnapshot(nodes, currentSeqN, endSeqN) {
		const prunedNodes = this.#prune(nodes, currentSeqN);
		const incompleteNodes = prunedNodes.filter(n => !n.children.length);

		StorageManager.set(
			SNAPSHOT_KEY,
			prunedNodes.filter(n => n.children?.length).map(n => n.serialize())
		);

		StorageManager.remove(JOURNAL_KEY);
		incompleteNodes.forEach(n => this.saveNode(n));
		this.saveCurrentSeqN(currentSeqN);
	}
}

export const actionPersistence = new ActionPersistence();


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

		this.emit(HistoryEvents.COMMAND_DISPATCHED, command, config);
	}

	/** @param {HistoryNode} node */
	dispatchDeserialized(node) {
		node.command.execute();

		this.#updateHistoryPointers(node);
	}

	/** @param {BaseCommand} command
	 * @param {{sendWs: boolean, savePersistant: boolean}} config */
	#pushCommand(command, config) {
		const next = new HistoryNode(this.#commandIdSeq++, command);
		this.#commandsHistoryCurrent.addChild(next);

		this.#updateHistoryPointers(next);

		this.emit(HistoryEvents.COMMAND_ADDED, next, config);
	}

	#updateHistoryPointers(newCurrent) {
		if(newCurrent.parent !== this.#commandsHistoryCurrent) return;

		if(this.#commandsHistoryEnd === this.#commandsHistoryCurrent) {
			this.#commandsHistoryEnd = newCurrent;
		}
		this.#commandsHistoryCurrent = newCurrent;
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

		this.emit(HistoryEvents.STEP_BACK, sendNotif);

		if(this.#commandsHistoryCurrent.command.isUiSkip){
			this.stepBack(false);
		}
	}

	stepForward(sendNotif = true){
		const next = this.#commandsHistoryCurrent.getLatestChild();
		if(!next) return;

		console.log("stepForward ", next.command)
		this.#commandsHistoryCurrent = next;
		next.command.execute();

		this.emit(HistoryEvents.STEP_FORWARD, sendNotif);

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

	getAllNodes() {
		const root = this.getHistoryRoot();
		const allNodes = [];
		const queue = [root];
		while(queue.length > 0){
			const node = queue.shift();
			allNodes.push(node);
			queue.push(...node.children);
		}
		return allNodes;
	}

	getLastNode(){
		return this.#commandsHistoryEnd;
	}

	replaceHistory(historyNodes, currentSeqN, endSeqN) {
		if (historyNodes.length === 0) return;

		this.#commandsHistoryStart = historyNodes[0];
		this.#commandsHistoryEnd = historyNodes.find(node => node.seqN === endSeqN);
		this.#commandsHistoryCurrent = historyNodes.find(node => node.seqN === currentSeqN);
		this.#commandIdSeq = this.#commandsHistoryEnd.seqN + 1;
		this.emit(HistoryEvents.HISTORY_REPLACED);
	}
}

export const actions = new ActionsHistory();