import {wsConnection} from "../connection.js";
import {HistoryNode} from "./historyNode.js";
import {editorActionsPersistence, editorActions} from './actionsManager.js';
import {collabPopupManager} from './collabWidget.js'
import {gui} from "../gui.js";
import {editorPersistenceManager} from "./persistenceManager.js";
import {GuiEvents, EditorActionsEvents, ConnectionEvents} from "./editorEvents.js";

class LayoutSyncCoordinator {
	#gui;
	#connection;

	constructor(gui, connection) {
		this.#gui = gui;
		this.#connection = connection;

		this.#attachListeners();
	}

	#attachListeners() {
		this.#gui.on(GuiEvents.MAIN_LAYOUT_RESIZE, ({width, height}) => {
			if (this.#connection.getIsMaster()) {
				//this.#connection.send({ type: "size", width, height });
			}
		});
	}
}


const layoutSync = new LayoutSyncCoordinator(gui, wsConnection);

//////////


class ActionSyncCoordinator {
	constructor() {
		this.#setupActionsListeners();
		this.#setupNetworkListeners();
	}

	#setupActionsListeners() {
		editorActions.on(EditorActionsEvents.COMMAND_ADDED, /** @param {HistoryNode} node
				@param {{sendWs: boolean, savePersistant: boolean}} */(node, {sendWs, savePersistant}) =>
		{
			if (savePersistant) {
				editorActionsPersistence.saveNode(node);
				editorPersistenceManager.incrementActionCount();
			}
			if (sendWs && collabPopupManager.isSharingActive()) {
				const msg = {type: "action", data: node.serialize()};
				wsConnection.sendToPeer(msg);
			}
		});

		editorActions.on(EditorActionsEvents.COMMAND_MODIFIED, (node, {sendWs, savePersistant}, commandData) => {
			if (savePersistant) {
				editorActionsPersistence.updateNode(node);
			}

			if (sendWs && collabPopupManager.isSharingActive()) {
				const msg = {
					type: "action_append",
					seqN: node.seqN,
					data: commandData
				};
				wsConnection.sendToPeer(msg);
			}
		});

		editorActions.on(EditorActionsEvents.STEP_BACK, (sendNotif) => {
			editorActionsPersistence.saveCurrentSeqN(editorActions.getCurrentNode().seqN);
			if (sendNotif && collabPopupManager.isSharingActive()) {
				wsConnection.sendToPeer({type: "replay", actionType: "stepBack"});
			}
		});

		editorActions.on(EditorActionsEvents.STEP_FORWARD, (sendNotif) => {
			editorActionsPersistence.saveCurrentSeqN(editorActions.getCurrentNode().seqN);
			if (sendNotif && collabPopupManager.isSharingActive()) {
				wsConnection.sendToPeer({type: "replay", actionType: "stepForward"});
			}
		});
	}

	#setupNetworkListeners() {
		wsConnection.on(ConnectionEvents.DATA, (msg) => {
			if (msg.type === "action" && collabPopupManager.isSharingActive()) {
				this.#handleReceivedAction(msg.data);
			}
			if (msg.type === "action_append" && collabPopupManager.isSharingActive()) {
				const current = editorActions.getCurrentNode();

				if (current.seqN === msg.seqN) {
					current.command.appendAndExecute(msg.data);
					editorActionsPersistence.saveNode(current);
				} else {
					console.warn('Sync conflict on append - forcing full sync');
					collabPopupManager.isMaster()
						? collabPopupManager.forceFullSync()
						: collabPopupManager.requestFullSync();
				}
			}
			if (msg.type === "replay" && collabPopupManager.isSharingActive()) {
				if (msg.actionType === "stepBack") {
					editorActions.stepBack(false);
				} else if (msg.actionType === "stepForward") {
					editorActions.stepForward(false);
				}
			}
		});
	}

	#handleReceivedAction(serializedNode) {
		const current = editorActions.getCurrentNode();

		if (serializedNode.parId !== current.seqN) {
			console.warn(`Conflict detected: received node parent (${serializedNode.parId}) != current node (${current.seqN})`);

			if (collabPopupManager.isMaster()) {
				console.log('Master: Dropping follower action due to conflict - forcing full sync');
				collabPopupManager.forceFullSync();
			} else {
				console.log('Follower: Dropping local action and requesting full sync');
				collabPopupManager.requestFullSync();
			}
			return;
		}

		const node = HistoryNode.deserialize(serializedNode, current);
		if (node) {
			//this.#persistActionLog(node);
			editorActionsPersistence.saveNode(node);
			editorActions.dispatchDeserialized(node);
		} else {
			console.warn('Cannot deserialize node - forcing full sync');
			if (collabPopupManager.isMaster()) {
				collabPopupManager.forceFullSync();
			} else {
				collabPopupManager.requestFullSync();
			}
		}
	}
}

const actionSyncCoordinator = new ActionSyncCoordinator();