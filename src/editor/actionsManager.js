import {StorageManager} from "../utils/storage.js";
import {BaseCommand, HistoryNode} from "./historyNode.js";
import EventEmitter from "../utils/eventEmitter.js";
import {editorPersistenceManager} from "./persistenceManager.js";
import {EditorPersistenceEvents, EditorActionsEvents} from "./editorEvents.js";
import {config} from "../config.js";


export const SNAPSHOT_KEY = "action_history_snapshot";
export const JOURNAL_KEY = "action_history_journal";
export const CURRENT_SEQ_KEY = "action_current_seq";

const EditorActionsPersistenceConfig = Object.freeze({
	MAX_NODES: "MAX_NODES",
});
config.addConfigVar(EditorActionsPersistenceConfig.MAX_NODES, 100, 'Maximum size of undo steps tree', 'editorUndoSteps', 'EditorActionsPersistenceConfig');


class EditorActionsPersistence {
	#loaded = false;

	constructor() {
		this.#initPersistence();
	}

	#initPersistence() {
		editorPersistenceManager.on(EditorPersistenceEvents.SAVE_LOCAL, (components) => {
			this.saveNodes();
		});
		editorPersistenceManager.on(EditorPersistenceEvents.AFTER_LOAD_LOCAL, (components) => {
			this.loadNodes();
		});

		editorPersistenceManager.on(EditorPersistenceEvents.AFTER_LOAD_DISK, ()=>{
			editorActions.replaceHistoryRefs(
				editorActions.getCurrentNode(),
				editorActions.getCurrentNode(),
				editorActions.getCurrentNode()
			);
			editorPersistenceManager.saveLocal();
		});
	}

	saveNode(/** @type {HistoryNode} */ node) {
		if(!this.#loaded) return;
		const journal = StorageManager.get(JOURNAL_KEY) || [];
		journal.push(node.serialize());

		StorageManager.set(JOURNAL_KEY, journal);

		this.saveCurrentSeqN(editorActions.getCurrentNode().seqN);
	}

	updateNode(node) {
		if(!this.#loaded) return;

		const journal = StorageManager.get(JOURNAL_KEY) || [];

		const index = journal.findIndex(n => n.seqN === node.seqN);

		if (index !== -1) {
			journal[index] = node.serialize();
			StorageManager.set(JOURNAL_KEY, journal);
		} else {
			this.saveNode(node);
		}
	}

	saveCurrentSeqN(seqN) {
		if(!this.#loaded) return;
		StorageManager.set(CURRENT_SEQ_KEY, seqN);
	}

	loadNodes() {
		const snapshot = StorageManager.get(SNAPSHOT_KEY) || [];
		const journal = StorageManager.get(JOURNAL_KEY) || [];
		const allNodesData = [...snapshot, ...journal];
		const storedCurrentSeqN = StorageManager.get(CURRENT_SEQ_KEY);
		this.#loaded = true;

		if (allNodesData.length === 0) {
			return;
		}

		const allNodes = HistoryNode.deserializeList(allNodesData);
		const { completeNodes, incompleteNodes, newRoot, currentNode, endNode, activePath } = this.#prune(allNodes, storedCurrentSeqN);

		activePath.filter(node => node.command)
			.forEach(node => editorActions.dispatchDeserialized(node));

		this.#persistSnapshot(completeNodes, incompleteNodes, newRoot, currentNode, endNode);
	}

	saveNodes() {
		const { completeNodes, incompleteNodes, newRoot, currentNode, endNode } = this.#prune(editorActions.getAllNodes(), editorActions.getCurrentNode());
		this.#persistSnapshot(completeNodes, incompleteNodes, newRoot, currentNode, endNode);
	}

	#prune(allNodes, currentIndicator) {
		if (allNodes.length === 0) {
			return { completeNodes: [], incompleteNodes: [], newRoot: null, currentNode: null, endNode: null, activePath: [] };
		}

		let endNode = allNodes[0];
		let currentNode = null;
		if (typeof currentIndicator === 'object') {
			currentNode = currentIndicator;
			currentIndicator = undefined;
		}

		for (const node of allNodes) {
			if (endNode.seqN < node.seqN) endNode = node;
			if (currentIndicator && node.seqN === currentIndicator) {
				currentNode = node;
			}
		}
		if (!currentNode) currentNode = endNode;

		const activePath = [];
		const activeSet = new Set();
		let curr = currentNode;

		while (curr) {
			if (activeSet.has(curr.seqN)) {
				console.warn(`Cycle detected in history at node ${curr.seqN}, dropping corrupted ancestry`);
				curr.parent = null;
				break;
			}
			activeSet.add(curr.seqN);
			activePath.unshift(curr);
			curr = curr.parent;
		}

		// prune
		const nodesToRemove = new Set();
		const MAX_NODES = config.getConfigValue(EditorActionsPersistenceConfig.MAX_NODES);
		if (allNodes.length > MAX_NODES) {
			const targetCount = Math.floor(MAX_NODES / 2);
			let nodesCount = allNodes.length;
			let root = activePath[0];

			const markSubtree = (node) => {
				if (nodesToRemove.has(node)) return 0;
				nodesToRemove.add(node);
				return 1 + node.children.reduce((sum, child) => sum + markSubtree(child), 0);
			};

			while (nodesCount > targetCount && root && root !== currentNode) {
				if (root.children.length === 0) break;

				const nextRoot = root.children.find(child => activeSet.has(child.seqN))
					|| root.children.reduce((lowest, child) => (!lowest || child.seqN < lowest.seqN) ? child : lowest);

				nodesToRemove.add(root);
				nodesCount--;

				// remove the siblings other than nextRoot
				for (const child of root.children) {
					if (child !== nextRoot) {
						nodesCount -= markSubtree(child);
					}
				}

				nextRoot.parent = null;
				root = nextRoot;
			}

			nodesToRemove.forEach(node => {
				node.parent = null;
				node.children = [];
			});
		}

		const completeNodes = [];
		const incompleteNodes = [];
		let newRoot;

		for (const node of allNodes) {
			if (nodesToRemove.has(node)) continue;

			if (node.children.length > 0) {
				completeNodes.push(node);
			} else {
				incompleteNodes.push(node);
			}

			if (node.parent === null) {
				if(newRoot !== undefined) console.log(`2nd newRoot ${newRoot.seqN}, ${node.seqN}`);
				newRoot = node;
			}
		}

		return { completeNodes, incompleteNodes, newRoot, currentNode, endNode, activePath };
	}

	#persistSnapshot(completeNodes, incompleteNodes, newRoot, currentNode, endNode) {
		StorageManager.set(SNAPSHOT_KEY, completeNodes.map(n => n.serialize()));

		// save incomplete nodes into journal
		const journalData = incompleteNodes.map(n => n.serialize());
		StorageManager.set(JOURNAL_KEY, journalData);

		this.saveCurrentSeqN(currentNode.seqN);
		editorActions.replaceHistoryRefs(newRoot, currentNode, endNode);
	}
}

export const editorActionsPersistence = new EditorActionsPersistence();


class EditorActions extends EventEmitter{
	#commandIdSeq = 1;
	/** @type {HistoryNode} */
	#commandsHistoryCurrent;
	/** @type {HistoryNode} */
	#commandsHistoryStart;
	/** @type {HistoryNode} */
	#commandsHistoryEnd;

	constructor() {
		super();
		this.#commandsHistoryCurrent = new HistoryNode(this.#commandIdSeq++, null);
		this.#commandsHistoryStart = this.#commandsHistoryEnd = this.#commandsHistoryCurrent;
	}

	/** @param {BaseCommand} command
	 * @param {{sendWs: boolean, savePersistant: boolean}} config */
	dispatch(command, config = {sendWs: true, savePersistant: true}) {
		command.execute();

		this.recordDispatched(command, config);
	}

	/** @param {typeof BaseCommand} CommandClass
	 * @param {Object} basicData - shared data (must match previous entry)
	 * @param {Object} uniqueData - unique data (appended to previous entry)
	 * @param {number} maxItems - Maximum stacked items before splitting
	 */
	dispatchOrAppend(CommandClass, basicData, uniqueData, maxItems = 10, config = {sendWs: true, savePersistant: true}) {
		const currentCommand = this.#commandsHistoryCurrent.command;

		if (currentCommand.canAppend && currentCommand.canAppend(basicData, maxItems)) {
			currentCommand.appendAndExecute(uniqueData);
			this.emit(
				EditorActionsEvents.COMMAND_MODIFIED,
				this.#commandsHistoryCurrent,
				config,
				uniqueData
			);
			return;
		}

		const newCommand = new CommandClass({
			...basicData,
			paints: [uniqueData]
		});

		this.dispatch(newCommand, config);
	}

	/** @param {BaseCommand} command
	 * @param {{sendWs: boolean, savePersistant: boolean}} config */
	recordDispatched(command, config = {sendWs: true, savePersistant: true}) {
		this.#pushCommand(command, config);
		console.log('recordDispatched ', command);

		this.emit(EditorActionsEvents.COMMAND_DISPATCHED, command, config);
	}

	/** @param {HistoryNode} node */
	dispatchDeserialized(node) {
		node.command.execute();

		if (node.seqN >= this.#commandIdSeq) {
			this.#commandIdSeq = node.seqN + 1;
		}
		this.#updateHistoryPointers(node);
	}

	/** @param {BaseCommand} command
	 * @param {{sendWs: boolean, savePersistant: boolean}} config */
	#pushCommand(command, config) {
		const next = new HistoryNode(this.#commandIdSeq++, command);
		this.#commandsHistoryCurrent.addChild(next);

		this.#updateHistoryPointers(next);

		this.emit(EditorActionsEvents.COMMAND_ADDED, next, config);
	}

	#updateHistoryPointers(newCurrent) {
		if(newCurrent.parent !== this.#commandsHistoryCurrent) return;

		if(this.#commandsHistoryEnd === this.#commandsHistoryCurrent) {
			this.#commandsHistoryEnd = newCurrent;
		}
		this.#commandsHistoryCurrent = newCurrent;

		if (newCurrent.seqN >= this.#commandIdSeq) {
			this.#commandIdSeq = newCurrent.seqN + 1;
		}
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

		this.emit(EditorActionsEvents.STEP_BACK, sendNotif);

		if(this.#commandsHistoryCurrent.command.isUiSkip){
			this.stepBack(sendNotif);
		}
	}

	stepForward(sendNotif = true){
		const next = this.#commandsHistoryCurrent.getLatestChild();
		if(!next) return;

		console.log("stepForward ", next.command)
		this.#commandsHistoryCurrent = next;
		next.command.execute();

		this.emit(EditorActionsEvents.STEP_FORWARD, sendNotif);

		if(next.command.isUiSkip){
			this.stepForward(sendNotif);
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
		this.emit(EditorActionsEvents.HISTORY_REPLACED);
	}

	replaceHistoryRefs(start, current, end) {
		this.#commandsHistoryStart = start;
		this.#commandsHistoryEnd = end;
		this.#commandsHistoryCurrent = current;
		if (this.#commandsHistoryEnd) {
			this.#commandIdSeq = this.#commandsHistoryEnd.seqN + 1;
		} else {
			this.#commandIdSeq = 1;
		}
		this.emit(EditorActionsEvents.HISTORY_REPLACED);
	}

}

export const editorActions = new EditorActions();