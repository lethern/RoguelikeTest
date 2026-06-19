import { wsConnection, rtcConnection, CollabRole, FollowMode } from "../connection.js";
import { globalStore } from "./monstersEditor.js";

/*
           Client1 (Inviter)                            Client2 (Receiver)

Setup      connectClick -> wsConnection.connect()       connectClick -> wsConnection.connect()

Invite     inviteClick ->
             send(INVITE)
                         ------------------------------>
Receive                                                 on(INVITE) ->
                                                           #renderIncomingInviteBar()
                                                        inviteBarClick ->
                                                           renderAcceptanceView()

Accept                                                  acceptClick ->
                                                          currentConfig = ...
                                                          remotePeerId = msg.senderId
                                                          send(ACCEPT)
                     <------------------------------------
Sync       on(ACCEPT) ->
             #remotePeerId = msg.senderId
             #initiateStateSync() ->
             send(STATE_SYNC)
                             -------------------------->
Apply                                                   on(STATE_SYNC) ->
 sync                                                     globalStore.setState(...)
                                                          send(STATE_ACK)
                        <---------------------------------
Finalize   on(STATE_ACK) ->
             #finalizeSession()
             #isActive = true
             rtcConnect / UI block
             send(START)
                        ------------------------------->
                                                        on(START) ->
                                                          #finalizeSession()
                                                          #isActive = true
                                                          rtcConnect / UI block
 */
// 1. przycisk ktory wszystko "zaczyna"
// 2. drugi klient, ktory moze przyjac komunikat, musi rozpocząć polaczenie z WS
//

const CollabMessageType = {
	STATE_ACK: "collab_state_ack",
	START: "collab_start",
	INVITE: "collab_invite",
	DISCONNECT: "collab_disconnect",
	ACCEPT: "collab_accept",
	REJECT: "collab_reject",
	STATE_SYNC: "collab_state_sync",
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

class CollaborationManager {

	/**
	 * @param {CollabMessageType} type
	 * @param {CollabMessagePayload} payload
	 */
	#sendMsg(type, payload = {} ){
		wsConnection.sendToPeer({
			type,
			targetId: this.#remotePeerId,
			senderId: wsConnection.getClientId(),
			...payload
		});
	}

	#overlay = null;
	#collabBar = null;
	#mainLayout = null;
	#mainBar = null;

	#isActive = false;
	#currentConfig = null;
	#remotePeerId = null;

	// Listeners so we can remove them when windows close
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
		wsConnection.on('peerDisconnected', (peerId) => {
			if (this.#isActive && this.#remotePeerId === peerId) {
				console.log("Collab peer disconnected unexpectedly");
				this.#handleDisconnect();
			}
		});

		wsConnection.on("data", (msg) => {

			if (msg.type === CollabMessageType.INVITE) {
				this.#renderIncomingInviteBar(msg);
			}

			// we should have targetId (outside of invite msg)
			if (msg.targetId !== wsConnection.getClientId()){ console.log("incorrect targetId: "+msg.targetId); return;}

			if (msg.type === CollabMessageType.ACCEPT) {
				if (this.#currentConfig && this.#currentConfig.master) {
					this.#remotePeerId = msg.senderId;
					this.#initiateStateSync();
				}
			} else if (msg.type === CollabMessageType.REJECT) {
				if (this.#overlay && this.#overlay.querySelector("#collab-btn-invite")) {
					this.#showSetupError("Invitation was declined by the peer");
					const inviteBtn = this.#overlay.querySelector("#collab-btn-invite");
					if (inviteBtn) {
						inviteBtn.textContent = "Send Invite";
						inviteBtn.disabled = false;
					}
				}
			}

			// we have #remotePeerId on us (outside of invite, accept or reject)
			if(msg.senderId !== this.#remotePeerId){ console.log("incorrect senderId: "+msg.senderId); return;}

			if (msg.type === CollabMessageType.STATE_SYNC) {
				globalStore.setState(msg.state);
				const computedHash = JSON.stringify(globalStore.state).length;

				this.#sendMsg(CollabMessageType.STATE_ACK, {hash: computedHash});
				//this.#finalizeSession();

			} else if (msg.type === CollabMessageType.STATE_ACK) {
				this.#finalizeSession();
				this.#sendMsg(CollabMessageType.START);

			} else if (msg.type === CollabMessageType.START) {
				this.#finalizeSession();

			} else if (msg.type === CollabMessageType.DISCONNECT) {
				this.#handleDisconnect();
				if (this.#overlay) {
					this.close();
				}
			}
		});
	}

	openMenu(mainDiv) {
		if (this.#overlay) this.close();

		this.#overlay = document.createElement("div");
		this.#overlay.className = "collab-overlay";

		if (this.#isActive) {
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
		if (isBlocked) {
			console.log("UI Blocked: Receiver control is OFF");
			this.#mainLayout.style.pointerEvents = "none";
		} else {
			console.log("UI Unblocked: Receiver control returned");
			this.#mainLayout.style.pointerEvents = "all";
		}
	}

	isFollowUIEnabled() {
		if (!this.#isActive || !this.#currentConfig) return true;
		return this.#currentConfig.followMode === FollowMode.FOLLOW_ALL;
	}

	#showSetupError(msg) {
		const errorDiv = this.#overlay.querySelector("#collab-setup-error");
		if(errorDiv) {
			errorDiv.textContent = msg;
			errorDiv.style.display = "block";
		}
	}

	#hideSetupError() {
		const errorDiv = this.#overlay.querySelector("#collab-setup-error");
		if(errorDiv) errorDiv.style.display = "none";
	}

	#bindStatusUpdates() {
		this.#boundWsStatusUpdate = () => this.#updateSetupDOM();
		this.#boundPeerStatusUpdate = () => this.#updateSetupDOM();

		wsConnection.on('wsStatus', this.#boundWsStatusUpdate);
		wsConnection.on('peerStatus', this.#boundPeerStatusUpdate);
	}

	#unbindStatusUpdates() {
		if (this.#boundWsStatusUpdate) wsConnection.off('wsStatus', this.#boundWsStatusUpdate);
		if (this.#boundPeerStatusUpdate) wsConnection.off('peerStatus', this.#boundPeerStatusUpdate);
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
		if (this.#isActive) {
			const showReturnCtrl = this.#currentConfig?.roleLocal === CollabRole.FOLLOWER && this.#currentConfig?.blockControl;

			this.#collabBar.innerHTML = `
                <span class="collab-badge badge-active">SHARING</span>
                <button id="collab-bar-menu" class="collab-btn">Menu</button>
                ${showReturnCtrl ? '<button id="collab-bar-return-ctrl" class="collab-btn btn-danger">Return Control</button>' : ''}
            `;

			this.#collabBar.querySelector("#collab-bar-menu").onclick = () => this.openMenu();

			if (showReturnCtrl) {
				this.#collabBar.querySelector("#collab-bar-return-ctrl").onclick = () => {
					this.setUiBlocked(false);
					this.#currentConfig.blockControl = false;
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

		const inviteBtn = this.#overlay.querySelector("#collab-btn-invite");
		const closeBtn = this.#overlay.querySelector("#collab-btn-close");
		const connectBtn = this.#overlay.querySelector("#collab-btn-connect");

		function connectClick() {
			wsConnection.connect()
				.catch(e => {
					collabPopupManager.#showSetupError("Failed to connect to server");
				});
		}

		const inviteClick = () => {
			const currentWs = wsConnection.getStatus();
			const currentPeer = wsConnection.getIsPeerConnected();

			if (currentWs !== "CONNECTED") {
				this.#showSetupError("Error: Not connected to server");
				return;
			}
			if (!currentPeer) {
				this.#showSetupError("Error: No peer available to connect to");
				return;
			}

			this.#hideSetupError();
			const master = this.#overlay.querySelector('input[name="collab-role"]:checked').value === CollabRole.MASTER;
			const shareCursor = this.#overlay.querySelector("#collab-ghost-cursor").checked;
			const followAll = this.#overlay.querySelector("#collab-follow-all").checked;
			const blockControl = this.#overlay.querySelector("#collab-block-ctrl").checked;

			this.#currentConfig = {
				master,
				shareCursor,
				followMode: followAll ? FollowMode.FOLLOW_ALL : FollowMode.STATE_ONLY,
				blockControl: blockControl,
				roleLocal: master ? CollabRole.MASTER : CollabRole.FOLLOWER,
				roleRemote: master ? CollabRole.FOLLOWER : CollabRole.MASTER
			};

			this.#sendMsg(CollabMessageType.INVITE, {
				master: master,
				shareCursor: shareCursor,
				followMode: this.#currentConfig.followMode,
				blockControl: this.#currentConfig.blockControl,
			});

			inviteBtn.textContent = "Waiting for reply...";
			inviteBtn.disabled = true;
		};

		connectBtn.onclick = connectClick;
		inviteBtn.onclick = inviteClick;
		closeBtn.onclick = () => this.close();
	}

	#renderActiveView() {
		this.#overlay.innerHTML = `
            <div class="collab-modal">
                <div class="collab-header">Active collab</div>
                <div class="collab-row">Session status: <span class="collab-badge badge-active">SHARING</span></div>
                <hr>
                <div class="collab-row">Local client: <strong>${this.#currentConfig?.roleLocal}</strong></div>
                <div class="collab-row">Remote client: <strong>${this.#currentConfig?.roleRemote}</strong></div>
                
                <div class="collab-group">
                    <label><input type="checkbox" id="collab-toggle-cursor" ${this.#currentConfig?.shareCursor ? 'checked' : ''}> Share ghost cursor</label><br>
                    ${this.#currentConfig?.roleLocal === CollabRole.FOLLOWER ?
			`<label><input type="checkbox" id="collab-toggle-follow" ${this.#currentConfig?.followMode === FollowMode.FOLLOW_ALL ? 'checked' : ''}> Follow UI changes</label>` : ''}
                </div>
                <hr>
                <div class="collab-actions">
                    <button id="collab-btn-disconnect" class="collab-btn btn-danger">Disconnect</button>
                    <button id="collab-btn-close" class="collab-btn">Back</button>
                </div>
            </div>
        `;

		const disconnectClick = () => {
			this.#sendMsg(CollabMessageType.DISCONNECT);
			this.#handleDisconnect();
			this.openMenu();
		};

		const toggleCursor = (e) => {
			this.#currentConfig.shareCursor = e.target.checked;
			if (this.#currentConfig.shareCursor) rtcConnection.connect(true);
			else rtcConnection.disconnect();
		};

		const toggleFollow = (e) => {
			if (!e.target) return;
			this.#currentConfig.followMode = e.target.checked ? FollowMode.FOLLOW_ALL : FollowMode.STATE_ONLY;
		};

		this.#overlay.querySelector("#collab-toggle-cursor").onchange = toggleCursor;
		const followToggle = this.#overlay.querySelector("#collab-toggle-follow");
		if(followToggle) followToggle.onchange = toggleFollow;

		this.#overlay.querySelector("#collab-btn-disconnect").onclick = disconnectClick;
		this.#overlay.querySelector("#collab-btn-close").onclick = () => this.close();
	}

	#renderIncomingInviteBar(msg) {
		this.#collabBar.innerHTML = `
            <button id="collab-bar-invite" class="collab-btn btn-success">Peer wants to share!</button>
        `;
		this.#collabBar.querySelector("#collab-bar-invite").onclick = () => {
			this.#renderAcceptanceView(msg);
		};
	}

	#renderAcceptanceView(msg) {
		if (this.#overlay) this.close();

		this.#overlay = document.createElement("div");
		this.#overlay.className = "collab-overlay";

		const proposedRemoteRole = msg.master ? CollabRole.MASTER : CollabRole.FOLLOWER;
		const proposedLocalRole = msg.master ? CollabRole.FOLLOWER : CollabRole.MASTER;

		this.#overlay.innerHTML = `
            <div class="collab-modal">
                <div class="collab-header">Incoming invitation</div>
                <div class="collab-row">Peer wants to be: <strong>${proposedRemoteRole}</strong></div>
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

		const acceptClick = () => {
			this.#currentConfig = {
				master: !msg.master,
				shareCursor: msg.shareCursor,
				followMode: msg.followMode,
				blockControl: msg.blockControl,
				roleLocal: proposedLocalRole,
				roleRemote: msg.master ? CollabRole.MASTER : CollabRole.FOLLOWER
			};
			this.#remotePeerId = msg.senderId;

			this.#sendMsg(CollabMessageType.ACCEPT);
			this.close();

			if (this.#currentConfig.master) {
				this.#initiateStateSync();
			} else {
				this.#collabBar.innerHTML = `<span class="collab-badge">Waiting for state...</span>`;
			}
		};

		const declineClick = () => {
			this.#sendMsg(CollabMessageType.REJECT);
			this.#collabBar.innerHTML = '';
			this.close();
		};

		this.#overlay.querySelector("#collab-btn-accept").onclick = acceptClick;
		this.#overlay.querySelector("#collab-btn-decline").onclick = declineClick;

		this.#mainLayout.appendChild(this.#overlay);
	}

	#initiateStateSync() {
		const stateSnapshot = globalStore.state;
		const stateHash = JSON.stringify(stateSnapshot).length;

		this.#sendMsg(CollabMessageType.STATE_SYNC, {
			state: stateSnapshot,
			hash: stateHash
		});
		this.#collabBar.innerHTML = `<span class="collab-badge">Sending state...</span>`;
	}

	#finalizeSession() {
		this.#isActive = true;
		this.#renderCollabBar();
		if (this.#currentConfig?.shareCursor) {
			rtcConnection.connect(true);
		}

		if (this.#currentConfig.roleLocal === CollabRole.FOLLOWER && this.#currentConfig.blockControl) {
			this.setUiBlocked(true);
		}

		if (this.#overlay && this.#overlay.querySelector("#collab-btn-invite")) {
			this.#renderActiveView();
		}
	}

	#handleDisconnect() {
		this.#isActive = false;
		this.#currentConfig = null;
		this.#remotePeerId = null;
		rtcConnection.disconnect();
		this.setUiBlocked(false);
		this.#renderCollabBar();
	}

}

const collabPopupManager = new CollaborationManager();

import { gui } from '../gui.js';
gui.registerMenuBtn("collabMenu", "Collab", "Options", (container, state) => {
	const mainLayout = document.getElementById('mainLayout');
	collabPopupManager.openMenu(mainLayout);
});