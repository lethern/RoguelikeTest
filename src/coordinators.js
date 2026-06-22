import {wsConnection} from "./connection.js";
import {HistoryNode} from "./historyNode.js";
import {actionPersistence, actions} from './historyStorage.js';
import {collabPopupManager} from './editor/collabWidget.js'
import {gui} from "./gui.js";
import {persistenceManager} from "./persistenceManager.js";
import {GuiEvents, HistoryEvents, ConnectionEvents} from "./editor/editorEvents.js";

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
		actions.on(HistoryEvents.COMMAND_ADDED, /** @param {HistoryNode} node
				@param {{sendWs: boolean, savePersistant: boolean}} */(node, {sendWs, savePersistant}) =>
		{
			if (savePersistant) {
				actionPersistence.saveNode(node);
				persistenceManager.incrementActionCount();
			}
			if (sendWs && collabPopupManager.isSharingActive()) {
				const msg = {type: "action", data: node.serialize()};
				wsConnection.sendToPeer(msg);
			}
		});
		actions.on(HistoryEvents.STEP_BACK, (sendNotif) => {
			actionPersistence.saveCurrentSeqN(actions.getCurrentNode().seqN);
			if (sendNotif && collabPopupManager.isSharingActive()) {
				wsConnection.sendToPeer({type: "replay", actionType: "stepBack"});
			}
		});
		actions.on(HistoryEvents.STEP_FORWARD, (sendNotif) => {
			actionPersistence.saveCurrentSeqN(actions.getCurrentNode().seqN);
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
			if (msg.type === "replay" && collabPopupManager.isSharingActive()) {
				if (msg.actionType === "stepBack") {
					actions.stepBack(false);
				} else if (msg.actionType === "stepForward") {
					actions.stepForward(false);
				}
			}
		});
	}

	#handleReceivedAction(serializedNode) {
		const current = actions.getCurrentNode();

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
			actionPersistence.saveNode(node);
			actions.dispatchDeserialized(node);
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