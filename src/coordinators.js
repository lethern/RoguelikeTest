import { wsConnection } from "./connection.js";

class LayoutSyncCoordinator {
	#gui;
	#connection;

	constructor(gui, connection) {
		this.#gui = gui;
		this.#connection = connection;

		this.#attachListeners();
	}

	#attachListeners() {
		this.#gui.on('mainLayoutResize', ({ width, height }) => {
			if (this.#connection.getIsMaster()) {
				//this.#connection.send({ type: "size", width, height });
			}
		});
	}
}

import {gui} from "./gui.js";
const layoutSync = new LayoutSyncCoordinator(gui, wsConnection);

//////////

import { commandRegistry, actions } from "./actionsHistory.js";

class ActionSyncCoordinator {
	constructor() {
		this.#setupActionsListeners();
		this.#setupNetworkListeners();
	}

	#setupActionsListeners(){
		actions.on("commandAdded", (node, {savePersistant})=>{
			if(savePersistant){
				this.#persistActionLog(node);
			}
		});
		actions.on("commandDispatched", (command, {sendWs})=>{
			if(sendWs){
				const msg = {type: "action", action_class: command.serializeClass(), data: command.serialize()};
				if(command.isUiSkip) msg.isUiSkip = true;
				wsConnection.sendToPeer(msg);
			}
		});
		actions.on("stepBack", (sendNotif)=>{
			if(sendNotif){
				wsConnection.sendToPeer({ type: "replay", actionType: "stepBack" });
			}
		});
		actions.on("stepForward", (sendNotif)=>{
			if(sendNotif){
				wsConnection.sendToPeer({ type: "replay", actionType: "stepForward" });
			}
		});
	}

	#setupNetworkListeners() {
		wsConnection.on('data', (msg) => {
			if (msg.type === "action") {
				const command = commandRegistry.deserialize(msg.action_class, msg.data);
				if(msg.isUiSkip) command.isUiSkip = true;

				//this.persistToStorage(command);
				actions.dispatch(command, {sendWs: false, savePersistant: false});
				this.#persistActionLog(command);
			}
			if (msg.type === "replay") {
				//wsConnection.send({ type: "editor_system", actionType: type });
				if(msg.actionType === "stepBack"){
					actions.stepBack(false);
				}else if(msg.actionType === "stepForward"){
					actions.stepForward(false);
				}
			}
			//} else if (msg.type === "full_state_sync") {
			//	this.setState(msg.state);
			//}
		});
	}

	#persistActionLog(node) {
		const log = JSON.parse(localStorage.getItem("editor_action_stream") || "[]");
		log.push(node.serialize());
		localStorage.setItem("editor_action_stream", JSON.stringify(log));
	}

	/*

	syncWithRemote(type, node) {
		connection.sendWsData({ type: "editor_transient", actionType: type, seqN: node.seqN, payload: node.command.serialize() });
	}

	catchUpFromLog(snapshotSeqN) {
		const log = JSON.parse(localStorage.getItem("editor_action_stream") || "[]");
		const remainingData = log.filter(actionData => actionData.seqN > snapshotSeqN);

		const reconstructedNodes = HistoryNode.deserializeList(remainingData);

		reconstructedNodes.forEach(node => {
			node.command?.execute();
		});
	}
*/
}

const actionSyncCoordinator = new ActionSyncCoordinator();