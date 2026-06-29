import {wsConnection, rtcConnection, CollabRole, FollowMode} from "../connection.js";
import {globalStore} from "../globalStore.js";
import {CryptoRandom} from "../utils/random.js";
import {HistoryNode} from "./historyNode.js";
import {editorActions} from './actionsManager.js';
import {gui} from "../gui.js";
import {ConnectionEvents} from "./editorEvents.js";
import {remoteCursor} from "./remoteCursor.js";

/*
           Inviter / CollabSharer                         Receiver / CollabFollower

Setup      connectClick -> wsConnection.connect()         connectClick -> wsConnection.connect()

Invite     inviteClick ->
             session = new CollabSharer()
             send(INVITE)
                         ------------------------------>
Receive                                                   on(INVITE) ->
                                                            #renderIncomingInviteBar()
                                                          inviteBarClick ->
                                                            #renderAcceptanceView()

Accept                                                    acceptClick ->
                                                            session = new CollabFollower()
                                                            session.startHandshake()
                                                            send(ACCEPT)
                         <--------------------------------

Sync       on(ACCEPT) ->
             session.startHandshake() ->
               forceFullSync() ->
               send(STATE_SYNC)
                         ------------------------------>

Apply                                                     on(STATE_SYNC) ->
 sync                                                       session.handleMessage() ->
                                                              manager.applyState(msg)
                                                              send(STATE_ACK)
                         <--------------------------------

Finalize   on(STATE_ACK) ->
             session.handleMessage() ->
               isEstablished = true
               manager.finalizeSessionUI()
               send(START)
                         ------------------------------->
                                                          on(START) ->
                                                            session.handleMessage() ->
                                                              isEstablished = true
                                                              manager.finalizeSessionUI()
 */

const CollabMessageType = {
	STATE_ACK: "collab_state_ack",
	START: "collab_start",
	INVITE: "collab_invite",
	DISCONNECT: "collab_disconnect",
	ACCEPT: "collab_accept",
	REJECT: "collab_reject",
	STATE_SYNC: "collab_state_sync",
	FULL_SYNC_REQUEST: "collab_full_sync_request",
};

/**
 * @typedef {Object} StateSyncMsg
 * @property {Object} state
 * @property {number} hash
 */

/**
 * @typedef {Object} StateAckMsg
 * @property {number} hash
 */

/**
 * @typedef {Object} StateInviteMsg
 * @property {boolean} master
 * @property {number} shareCursor
 * @property {FollowMode} followMode
 * @property {string} blockControl
 */

/**
 * @typedef {StateSyncMsg | StateAckMsg | StateInviteMsg | {}} CollabMessagePayload
 */

class CollabSession {
	manager;
	id;
	remotePeerId;
	config;
	isEstablished = false;

	constructor(manager, config, remotePeerId, id) {
		this.manager = manager;
		this.config = config;
		this.remotePeerId = remotePeerId;
		this.id = id;
	}

	sendMsg(type, payload = {}) {
		this.manager.sendPeerMsg(type, this.remotePeerId, {
			sessionId: this.id,
			...payload
		});
	}

	handleMessage(msg) { throw new Error("handleMessage must be implemented by subclass"); }

	startHandshake() { throw new Error("startHandshake must be implemented by subclass"); }

	disconnect() {
		this.isEstablished = false;
		rtcConnection.disconnect();
	}
}

class CollabSharer extends CollabSession {
	startHandshake() {
		this.forceFullSync();
	}

	handleMessage(msg) {
		if (msg.type === CollabMessageType.STATE_ACK) {
			this.isEstablished = true;
			this.manager.finalizeSessionUI(this.config);
			this.sendMsg(CollabMessageType.START);
		} else if (msg.type === CollabMessageType.FULL_SYNC_REQUEST) {
			if(this.isEstablished) {
				this.forceFullSync();
			}
		}
	}

	forceFullSync() {
		this.manager.updateCollabBadge("Sending state...");

		const stateSnapshot = globalStore.state;
		const stateHash = JSON.stringify(stateSnapshot).length;
		const layout = gui.getLastLayoutSave();
		const { nodes, current, end } = this.manager.getActionHistory();

		this.sendMsg(CollabMessageType.STATE_SYNC, {
			state: stateSnapshot,
			hash: stateHash,
			layout: layout,
			nodes,
			current: current.seqN,
			end: end.seqN
		});
	}
}

class CollabFollower extends CollabSession {
	startHandshake() {
		this.manager.updateCollabBadge("Waiting for state...");
	}

	handleMessage(msg) {
		if (msg.type === CollabMessageType.STATE_SYNC) {
			this.manager.applyState(msg);
			this.sendMsg(CollabMessageType.STATE_ACK);
		} else if (msg.type === CollabMessageType.START) {
			this.isEstablished = true;
			this.manager.finalizeSessionUI(this.config);
		}
	}

	requestFullSync() {
		if (this.isEstablished) {
			this.sendMsg(CollabMessageType.FULL_SYNC_REQUEST);
		}
	}
}

class CollaborationManager {
	#overlay = null;
	#collabBar = null;
	#mainLayout = null;
	#mainBar = null;

	#session = null;

	#boundWsStatusUpdate = null;
	#boundPeerStatusUpdate = null;

	constructor() {
		this.#initDOM();
		this.#listenToNetwork();
	}

	#initDOM() {
		this.#mainLayout = document.getElementById("mainLayout");
		this.#mainBar = document.getElementById("mainBar");
		const menuBar = document.getElementById("menu-bar");

		this.#collabBar = document.createElement("div");
		this.#collabBar.className = "collab-bar";
		this.#mainBar.insertBefore(this.#collabBar, menuBar);

		this.#renderCollabBar();
	}

	#listenToNetwork() {
		wsConnection.on(ConnectionEvents.PEER_DISCONNECTED, (peerId) => {
			if (this.#session?.remotePeerId === peerId) {
				console.log("Collab peer disconnected unexpectedly");
				this.handleDisconnect();
			}
		});

		wsConnection.on(ConnectionEvents.DATA, (msg) => {
			// check for targetId (unless INVITE)
			if (msg.targetId !== wsConnection.getClientId() && msg.type !== CollabMessageType.INVITE) {
				return;
			}

			switch (msg.type) {
				case CollabMessageType.INVITE:
					if (!this.isSharingActive()) {
						this.#renderIncomingInviteBar(msg);
					}
					break;

				case CollabMessageType.ACCEPT:
					if (this.#session && this.#session.id === msg.sessionId && !this.#session.isEstablished) {
						this.#session.remotePeerId = msg.senderId;
						this.#session.startHandshake();
					}
					break;

				case CollabMessageType.REJECT:
					if (this.#session && this.#session.id === msg.sessionId) {
						this.#handleReject();
					}
					break;

				case CollabMessageType.DISCONNECT:
					if (this.#session && this.#session.id === msg.sessionId) {
						this.handleDisconnect();
						if (this.#overlay) this.close();
					}
					break;

				default:
					if (this.#session && msg.senderId === this.#session.remotePeerId && msg.sessionId === this.#session.id)
					{
						this.#session.handleMessage(msg);
					}
					break;
			}
		});
	}

	sendPeerMsg(type, targetId, payload = {}) {
		wsConnection.sendToPeer({
			type,
			targetId: targetId,
			senderId: wsConnection.getClientId(),
			...payload
		});
	}

	#handleReject() {
		this.#session = null;
		if (this.#overlay && this.#overlay.querySelector("#collab-btn-invite")) {
			this.#showSetupError("Invitation was declined by the peer");
			const inviteBtn = this.#overlay.querySelector("#collab-btn-invite");
			if (inviteBtn) {
				inviteBtn.textContent = "Send Invite";
				inviteBtn.disabled = false;
			}
		}
	}

	handleDisconnect() {
		if (this.#session) this.#session.disconnect();
		this.#session = null;

		this.setUiBlocked(false);
		this.#renderCollabBar();
		remoteCursor.unregister('collab');
	}

	finalizeSessionUI(config) {
		this.#renderCollabBar();

		if (config.shareCursor) {
			rtcConnection.connect(true);
			remoteCursor.register('collab');
		}

		if (config.roleLocal === CollabRole.FOLLOWER && config.blockControl) {
			this.setUiBlocked(true);
		}

		if (this.#overlay && this.#overlay.querySelector("#collab-btn-invite")) {
			this.#renderActiveView();
		}
	}

	openMenu() {
		if (this.#overlay) this.close();

		this.#overlay = document.createElement("div");
		this.#overlay.className = "collab-overlay";

		if (this.isSharingActive()) {
			this.#renderActiveView();
		} else {
			this.#renderSetupView();
		}

		this.#mainLayout.appendChild(this.#overlay);
	}

	close() {
		if (this.#overlay) {
			this.#overlay.remove();
			this.#overlay = null;
		}
		this.#unbindStatusUpdates();
	}

	setUiBlocked(isBlocked) {
		this.#mainLayout.style.pointerEvents = isBlocked ? "none" : "all";
	}

	updateCollabBadge(text) {
		this.#collabBar.innerHTML = `<span class="collab-badge">${text}</span>`;
	}

	#showSetupError(msg) {
		const errorDiv = this.#overlay.querySelector("#collab-setup-error");
		if (errorDiv) {
			errorDiv.textContent = msg;
			errorDiv.style.display = "block";
		}
	}

	#hideSetupError() {
		const errorDiv = this.#overlay.querySelector("#collab-setup-error");
		if (errorDiv) errorDiv.style.display = "none";
	}

	#bindStatusUpdates() {
		this.#boundWsStatusUpdate = () => this.#updateSetupDOM();
		this.#boundPeerStatusUpdate = () => this.#updateSetupDOM();

		wsConnection.on(ConnectionEvents.WS_STATUS, this.#boundWsStatusUpdate);
		wsConnection.on(ConnectionEvents.PEER_STATUS, this.#boundPeerStatusUpdate);
	}

	#unbindStatusUpdates() {
		if (this.#boundWsStatusUpdate) wsConnection.off(ConnectionEvents.WS_STATUS, this.#boundWsStatusUpdate);
		if (this.#boundPeerStatusUpdate) wsConnection.off(ConnectionEvents.PEER_STATUS, this.#boundPeerStatusUpdate);
	}

	#updateSetupDOM() {
		if (!this.#overlay) return;
		const wsStatus = wsConnection.getStatus();
		const isPeer = wsConnection.getIsPeerConnected();

		const wsLabel = this.#overlay.querySelector("#collab-setup-ws-status");
		if (wsLabel) wsLabel.textContent = wsStatus;

		const peerLabel = this.#overlay.querySelector("#collab-setup-peer-status");
		if (peerLabel) peerLabel.textContent = isPeer ? "YES" : "NO";

		const connectBtn = this.#overlay.querySelector("#collab-btn-connect");
		if (connectBtn) connectBtn.style.display = wsStatus === "CONNECTED" ? "none" : "inline-block";
	}

	#renderCollabBar() {
		if (this.isSharingActive()) {
			const config = this.#session.config;
			const showReturnCtrl = config.roleLocal === CollabRole.FOLLOWER && config.blockControl;

			this.#collabBar.innerHTML = `
				<span class="collab-badge badge-active">SHARING</span>
				<button id="collab-bar-menu" class="collab-btn">Menu</button>
				${showReturnCtrl ? '<button id="collab-bar-return-ctrl" class="collab-btn btn-danger">Return control</button>' : ''}
			`;

			this.#collabBar.querySelector("#collab-bar-menu").onclick = () => this.openMenu();

			if (showReturnCtrl) {
				this.#collabBar.querySelector("#collab-bar-return-ctrl").onclick = () => {
					this.setUiBlocked(false);
					config.blockControl = false;
					this.#renderCollabBar();
				};
			}
		} else {
			this.#collabBar.innerHTML = ``;
		}
	}

	#renderSetupView() {
		this.#bindStatusUpdates();
		const isPeer = wsConnection.getIsPeerConnected();
		const wsStatus = wsConnection.getStatus();

		this.#overlay.innerHTML = `
			<div class="collab-modal">
				<div class="collab-header">Setup collab</div>
				<div class="collab-row">Server: <span class="collab-badge" id="collab-setup-ws-status">${wsStatus}</span></div>
				<button id="collab-btn-connect" class="collab-btn btn-success" style="display: ${wsStatus === 'CONNECTED' ? 'none' : 'inline-block'}; margin-bottom: 8px;">Connect to Server</button>
				
				<div class="collab-row">Peer Connected: <span class="collab-badge" id="collab-setup-peer-status">${isPeer ? "YES" : "NO"}</span></div>
				<div class="collab-error" id="collab-setup-error" style="display: none;"></div>
				<hr>
				<div class="collab-group">
					<label><input type="radio" name="collab-role" value="${CollabRole.MASTER}" checked> Master (share state)</label><br>
					<label><input type="radio" name="collab-role" value="${CollabRole.FOLLOWER}"> Follower (receive state)</label>
				</div>
				<div class="collab-group" id="collab-follower-options">
					<label><input type="checkbox" id="collab-follow-all" checked> Follower follows all UI changes</label><br>
					<label><input type="checkbox" id="collab-block-ctrl"> Block receiver control (UI Block)</label>
				</div>
				<div class="collab-group">
					<label><input type="checkbox" id="collab-ghost-cursor" checked> Share ghost cursor</label>
				</div>
				<div class="collab-actions">
					<button id="collab-btn-invite" class="collab-btn btn-primary">Send invite</button>
					<button id="collab-btn-close" class="collab-btn">Cancel</button>
				</div>
			</div>
		`;

		this.#overlay.querySelector("#collab-btn-connect").onclick = () => {
			wsConnection.connect().catch(() => this.#showSetupError("Failed to connect to server"));
		};

		const inviteBtn = this.#overlay.querySelector("#collab-btn-invite");

		inviteBtn.onclick = () => {
			if (this.isSharingActive()) return;
			if (wsConnection.getStatus() !== "CONNECTED") return this.#showSetupError("Error: Not connected to server");
			if (!wsConnection.getIsPeerConnected()) return this.#showSetupError("Error: No peer available to connect to");

			this.#hideSetupError();

			const master = this.#overlay.querySelector('input[name="collab-role"]:checked').value === CollabRole.MASTER;
			const followAll = this.#overlay.querySelector("#collab-follow-all").checked;

			const config = {
				master,
				shareCursor: this.#overlay.querySelector("#collab-ghost-cursor").checked,
				followMode: followAll ? FollowMode.FOLLOW_ALL : FollowMode.STATE_ONLY,
				blockControl: this.#overlay.querySelector("#collab-block-ctrl").checked,
				roleLocal: master ? CollabRole.MASTER : CollabRole.FOLLOWER,
				roleRemote: master ? CollabRole.FOLLOWER : CollabRole.MASTER
			};

			const sessionId = CryptoRandom.generateId();

			this.#session = master
				? new CollabSharer(this, config, null, sessionId)
				: new CollabFollower(this, config, null, sessionId);

			this.sendPeerMsg(CollabMessageType.INVITE, null, {
				sessionId,
				master: config.master,
				shareCursor: config.shareCursor,
				followMode: config.followMode,
				blockControl: config.blockControl,
			});

			inviteBtn.textContent = "Waiting for reply...";
			inviteBtn.disabled = true;
		};

		this.#overlay.querySelector("#collab-btn-close").onclick = () => this.close();
	}

	#renderActiveView() {
		const config = this.#session?.config;

		this.#overlay.innerHTML = `
			<div class="collab-modal">
				<div class="collab-header">Active collab</div>
				<div class="collab-row">Session status: <span class="collab-badge badge-active">SHARING</span></div>
				<hr>
				<div class="collab-row">Local client: <strong>${config?.roleLocal}</strong></div>
				<div class="collab-row">Remote client: <strong>${config?.roleRemote}</strong></div>
				
				<div class="collab-group">
					<label><input type="checkbox" id="collab-toggle-cursor" ${config?.shareCursor ? 'checked' : ''}> Share ghost cursor</label><br>
					${config?.roleLocal === CollabRole.FOLLOWER ?
			`<label><input type="checkbox" id="collab-toggle-follow" ${config?.followMode === FollowMode.FOLLOW_ALL ? 'checked' : ''}> Follow UI changes</label>` : ''}
				</div>
				<hr>
				<div class="collab-actions">
					<button id="collab-btn-disconnect" class="collab-btn btn-danger">Disconnect</button>
					<button id="collab-btn-close" class="collab-btn">Back</button>
				</div>
			</div>
		`;

		this.#overlay.querySelector("#collab-toggle-cursor").onchange = (e) => {
			if (!config) return;
			config.shareCursor = e.target.checked;
			if (config.shareCursor) {
				rtcConnection.connect(true);
				remoteCursor.register('collab');
			} else {
				rtcConnection.disconnect();
				remoteCursor.unregister('collab');
			}
		};

		const followToggle = this.#overlay.querySelector("#collab-toggle-follow");
		if (followToggle) followToggle.onchange = (e) => {
			if (config) config.followMode = e.target.checked ? FollowMode.FOLLOW_ALL : FollowMode.STATE_ONLY;
		};

		this.#overlay.querySelector("#collab-btn-disconnect").onclick = () => {
			this.#session?.sendMsg(CollabMessageType.DISCONNECT);
			this.handleDisconnect();
			this.openMenu();
		};

		this.#overlay.querySelector("#collab-btn-close").onclick = () => this.close();
	}

	#renderIncomingInviteBar(msg) {
		this.#collabBar.innerHTML = `<button id="collab-bar-invite" class="collab-btn btn-success">Peer wants to share!</button>`;
		this.#collabBar.querySelector("#collab-bar-invite").onclick = () => this.#renderAcceptanceView(msg);
	}

	#renderAcceptanceView(msg) {
		if (this.#overlay) this.close();

		this.#overlay = document.createElement("div");
		this.#overlay.className = "collab-overlay";

		const proposedLocalRole = msg.master ? CollabRole.FOLLOWER : CollabRole.MASTER;

		this.#overlay.innerHTML = `
			<div class="collab-modal">
				<div class="collab-header">Incoming invitation</div>
				<div class="collab-row">Peer wants to be: <strong>${msg.master ? CollabRole.MASTER : CollabRole.FOLLOWER}</strong></div>
				<div class="collab-row">Your assigned role: <strong>${proposedLocalRole}</strong></div>
				<div class="collab-row">Share ghost cursor: <strong>${msg.shareCursor ? "Yes" : "No"}</strong></div>
				<div class="collab-row">Follow UI: <strong>${msg.followMode === FollowMode.FOLLOW_ALL ? "Yes" : "No"}</strong></div>
				<hr>
				<div class="collab-actions">
					<button id="collab-btn-accept" class="collab-btn btn-success">Confirm</button>
					<button id="collab-btn-decline" class="collab-btn btn-danger">Decline</button>
				</div>
			</div>
		`;

		this.#overlay.querySelector("#collab-btn-accept").onclick = () => {
			const config = {
				master: !msg.master,
				shareCursor: msg.shareCursor,
				followMode: msg.followMode,
				blockControl: msg.blockControl,
				roleLocal: proposedLocalRole,
				roleRemote: msg.master ? CollabRole.MASTER : CollabRole.FOLLOWER
			};

			this.#session = config.master
				? new CollabSharer(this, config, msg.senderId, msg.sessionId)
				: new CollabFollower(this, config, msg.senderId, msg.sessionId);

			this.sendPeerMsg(CollabMessageType.ACCEPT, this.#session.remotePeerId, { sessionId: this.#session.id });
			this.close();
			this.#session.startHandshake();
		};

		this.#overlay.querySelector("#collab-btn-decline").onclick = () => {
			this.sendPeerMsg(CollabMessageType.REJECT, msg.senderId, { sessionId: msg.sessionId });
			this.#collabBar.innerHTML = '';
			this.close();
		};

		this.#mainLayout.appendChild(this.#overlay);
	}

	getActionHistory() {
		const root = editorActions.getHistoryRoot();
		const nodes = [];

		const collectNodes = (node) => {
			nodes.push(node.serialize());
			while (node.children.length === 1) {
				node = node.children[0];
				nodes.push(node.serialize());
			}
			node.children.forEach(child => collectNodes(child));
		};

		collectNodes(root);

		return {
			nodes,
			current: editorActions.getCurrentNode(),
			end: editorActions.getLastNode()
		};
	}

	applyState(msg) {
		globalStore.setState(msg.state);
		if (msg.layout) gui.syncLayout(msg.layout);

		const historyNodes = HistoryNode.deserializeList(msg.nodes);
		if (historyNodes.length > 0) {
			editorActions.replaceHistory(historyNodes, msg.current, msg.end);
		}
	}

	isSharingActive() {
		return this.#session?.isEstablished ?? false;
	}

	isMaster() {
		return this.#session?.config?.master ?? false;
	}

	forceFullSync() {
		if (this.#session instanceof CollabSharer) {
			this.#session.forceFullSync();
		}
	}

	requestFullSync() {
		if (this.#session instanceof CollabFollower) {
			this.#session.requestFullSync();
		}
	}
}

const collabPopupManager = new CollaborationManager();

export { collabPopupManager };

gui.registerMenuBtn("collabMenu", "Collab", "Options", () => {
	collabPopupManager.openMenu();
});