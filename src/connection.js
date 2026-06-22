import EventEmitter from './utils/eventEmitter.js';
import {CryptoRandom} from './utils/random.js'
import {ConnectionEvents, ConnectionRTCEvents} from "./editor/editorEvents.js";

/** @readonly */
const ConnectionStatus = {
	NONE: "NONE",
	CONNECTING: "CONNECTING",
	CONNECTED: "CONNECTED",
	DISCONNECTING: "DISCONNECTING",
	TERMINATED: "TERMINATED",
	CLOSED: "CLOSED",
};

export const CollabRole = {
	MASTER: "MASTER",
	FOLLOWER: "FOLLOWER"
};

export const FollowMode = {
	FOLLOW_ALL: "FOLLOW_ALL",
	STATE_ONLY: "STATE_ONLY"
};

const textEncoder = new TextEncoder();

class WSClient extends EventEmitter {
	static wsSrvAddr = "wss://p01--roguelikeserver--by4b98kql5cr.code.run";

	// connection & utility
	/** @type {WebSocket} */
	#ws;
	#wsQueue = [];
	#reconnectAttempts = 0;
	#intentionalClose = false;
	#wsStatus;
	#msgCount = 0;
	#byteCount = 0;
	#connectPromise;

	// Peer connection
	#peers = new Map();
	#isPeerConnected = false;
	#pingIntervalId = null;
	#clientId = CryptoRandom.generateId();
	#isMaster = false;

	constructor(){
		super();
		this.#setWSStatus(ConnectionStatus.NONE);
	}

	getMsgCount() { return this.#msgCount; }
	getByteCount() { return this.#byteCount; }
	getClientId() { return this.#clientId; }

	async connect() {
		if (this.#wsStatus === ConnectionStatus.CONNECTED) {
			return;
		}

		if (this.#wsStatus === ConnectionStatus.CONNECTING) {
			return this.#connectPromise;
		}

		this.#setWSStatus(ConnectionStatus.CONNECTING);

		if (this.#ws) {
			this.#ws.onclose = undefined;
			this.#ws.close();
		}

		this.#intentionalClose = false;
		this.#ws = new WebSocket(WSClient.wsSrvAddr);

		this.#connectPromise = new Promise((resolve, reject) => {
			this.#ws.onopen = () => {
				this.#msgCount = 0;
				this.#byteCount = 0;
				this.#reconnectAttempts = 0;
				this.#setWSStatus(ConnectionStatus.CONNECTED);

				if(this.#pingIntervalId) clearInterval(this.#pingIntervalId);
				this.#pingIntervalId = setInterval(() => {
					this.send({ type: "ping", id: this.#clientId });
				}, 30*1000);

				this.send({ type: "ping", id: this.#clientId });

				while (this.#wsQueue.length > 0 && this.#ws.readyState === WebSocket.OPEN) {
					this.send(this.#wsQueue.shift());
				}

				resolve();
				this.#connectPromise = null;
			};

			this.#ws.onerror = (e) => {
				reject(e);
				this.#connectPromise = null;
				this.#error("WS Error occurred", e);
			};

			this.#ws.onclose = () => {
				reject();
				this.#connectPromise = null;

				if (!this.#intentionalClose) {
					const delay = Math.min(10000, 1000 * Math.pow(2, this.#reconnectAttempts++));
					this.#setWSStatus(ConnectionStatus.TERMINATED, `reconnecting in ${Math.round(delay/1000)}s`);
					setTimeout(() => this.connect(), delay);
				} else {
					this.#setWSStatus(ConnectionStatus.CLOSED);
				}

				this.#clearPeers();
				this.#updateOverallPeerStatus();
			};
		});

		this.#ws.onmessage = async ({ data }) => {
			try {
				this.#msgCount++;
				this.#byteCount += typeof data === 'string' ? textEncoder.encode(data).length : (data.byteLength || data.size || 0);

				const msg = JSON.parse(data);
				const stringifiedData = typeof data === 'string' ? data : JSON.stringify(data);
				this.#log(`WS received: ${stringifiedData?.slice(0, 70)}`);

				if (msg.type === "bye") {
					this.#log(`Peer disconnected: ${msg.id}`);
					this.#peerDisconnected(msg.id);
					return;
				}

				if(!msg.server && msg.id && msg.id !== this.#clientId){
					this.#markPeerActivity(msg.id);
				}

				if (msg.type === "ping") {
					return;
				}

				this.emit(ConnectionEvents.DATA, msg);
			} catch (e) {
				this.#error("WS Error occurred", e);
			}
		};

		return this.#connectPromise;
	}

	#calculateMaster() {
		const allClientIds = Array.from(this.#peers.keys());
		allClientIds.push(this.#clientId);

		const leaderId = allClientIds.reduce((max, id) => (id > max ? id : max));

		const become_master = (this.#clientId === leaderId);

		if (this.#isMaster !== become_master) {
			this.#setMaster(become_master);
		}
	}

	send(data) {
		try {
			const payload = JSON.stringify(data);

			if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
				//this.#log(`WS sending: ${payload?.slice(0, 70)}`);
				this.#log(`WS sending: ${payload}`);
				this.#ws.send(payload);
			}
			else if(this.#wsStatus === ConnectionStatus.CONNECTING){
				this.#wsQueue.push(data);
			}
		} catch (e) {
			this.#error("sendWS error", e);
		}
	}

	sendToPeer(data) {
		if(!this.#isPeerConnected) return;

		this.send(data);
	}

	getStatus() {
		return this.#wsStatus;
	}

	disconnect() {
		this.#intentionalClose = true;

		if (this.#wsStatus !== ConnectionStatus.NONE && this.#wsStatus !== ConnectionStatus.CLOSED) {
			this.#setWSStatus(ConnectionStatus.DISCONNECTING);
			this.send({ type: "bye", id: this.#clientId });
		}

		if (this.#ws) {
			this.#ws.close();
			this.#ws = null;
		}

		this.#clearPeers();
		this.#updateOverallPeerStatus();
	}

	getIsPeerConnected() { return this.#isPeerConnected; }

	getIsMaster() {
		return this.#isMaster;
	}

	#error(message, err) {
		this.#log(`${message}: ${err?.message || err?.error?.message}`);
		console.log(message, err);
	}

	/** @param {ConnectionStatus} status
	 * @param {string?} message*/
	#setWSStatus(status, message = undefined) {
		this.#wsStatus = status;
		this.#log(`WS status: ${status}` + (message ? ", " + message : ""));
		this.emit(ConnectionEvents.WS_STATUS, status);
	}

	#setMaster(status) {
		this.#isMaster = status;
		this.#log(`Master status: ${status}`);
		this.emit(ConnectionEvents.MASTER_STATUS, status);
	}

	// we have a connection with another client - make a timer
	// timer resets on ping-pong (or any msg), otherwise runs out - meaning peer lost
	#markPeerActivity(peerId) {
		if (!peerId) return;

		if (this.#peers.has(peerId)) {
			clearTimeout(this.#peers.get(peerId));
		}else{
			// new peer
			this.#log(`Peer connected: ${peerId}`);
			this.emit(ConnectionEvents.PEER_CONNECTED, peerId);

			// let the other client know about us
			this.send({ type: "ping", id: this.#clientId });
		}

		const timeoutId = setTimeout(() => {
			this.#log(`Peer timed out: ${peerId}`);
			this.#peerDisconnected(peerId);
		}, 40*1000);

		this.#peers.set(peerId, timeoutId);
		this.#updateOverallPeerStatus();
		this.#calculateMaster();
	}

	#peerDisconnected(peerId){
		this.#peers.delete(peerId);
		this.emit(ConnectionEvents.PEER_DISCONNECTED, peerId);
		this.#updateOverallPeerStatus();
	}

	#updateOverallPeerStatus() {
		const hasPeers = this.#peers.size > 0;
		if (this.#isPeerConnected !== hasPeers) {
			this.#isPeerConnected = hasPeers;
			this.emit(ConnectionEvents.PEER_STATUS, hasPeers);
		}
	}

	#log(text) {
		this.emit(ConnectionEvents.LOG, text);
	}

	#clearPeers() {
		this.#peers.forEach(timeoutId => clearTimeout(timeoutId));
		this.#peers.clear();

		if (this.#pingIntervalId) clearInterval(this.#pingIntervalId);
	}
}

class RTCClient extends EventEmitter {
	#wsClient;
	#rtcPeerConn = null;
	#rtcChannel = null;
	#credentialsPromise;
	#resolveCredentials;
	#rtcStatus;
	#makingOffer = false;
	#lastCredential;

	#msgCount = 0;
	#byteCount = 0;

	constructor(wsClient) {
		super();
		this.#wsClient = wsClient;
	}

	init() {
		this.#setRTCStatus(ConnectionStatus.NONE);
		this.#resetCredentialsPromise();

		this.#wsClient.on(ConnectionRTCEvents.DATA, async (msg) => {
			if (msg.type === "credentials") {
				this.#lastCredential = msg.credential;
				if (!this.#rtcPeerConn) {
					this.#initPeerConnection(msg.credential);
				}
				if (this.#resolveCredentials) {
					this.#resolveCredentials();
				}
				return;
			}

			if (msg.type === "rtc-bye") {
				this.clearState();
				this.#setRTCStatus(ConnectionStatus.TERMINATED);
				return;
			}

			if (["offer", "answer", "candidate"].includes(msg.type)) {
				if (!this.#rtcPeerConn) {
					this.#initPeerConnection(this.#lastCredential);
				}
				await this.#handleSignaling(msg);
				return;
			}
		});
	}

	getMsgCount() { return this.#msgCount; }
	getByteCount() { return this.#byteCount; }

	async connect(unreliable = false) {
		if (this.#rtcStatus === ConnectionStatus.CONNECTING || this.#rtcStatus === ConnectionStatus.CONNECTED) {
			return;
		}
		if (!this.#wsClient.getIsPeerConnected()) {
			this.#log("No peer connected");
			return;
		}

		this.#setRTCStatus(ConnectionStatus.CONNECTING);

		try {
			if (!this.#lastCredential) {
				await this.#credentialsPromise;
			}

			if (!this.#rtcPeerConn) {
				this.#initPeerConnection(this.#lastCredential);
			}

			if (!this.#rtcChannel || (this.#rtcChannel.readyState !== "open" && this.#rtcChannel.readyState !== "connecting")) {
				this.#rtcChannel = this.#rtcPeerConn.createDataChannel("gameData", unreliable ? {
					ordered: false,
					maxRetransmits: 0,
				} : {});
				this.#setupDataChannel();
			}
		} catch (e) {
			this.#error("RTC Connect failed", e);
			this.#setRTCStatus(ConnectionStatus.CLOSED);
		}
	}

	sendData(data) {
		try {
			if (this.#rtcChannel?.readyState === "open") {
				this.#rtcChannel.send(data);
			}
		} catch (e) {
			this.#error("sendRtc error", e);
		}
	}

	getStatus() {
		return this.#rtcStatus;
	}

	disconnect() {
		wsConnection.send({ type: "rtc-bye" });

		this.clearState();
		this.#setRTCStatus(ConnectionStatus.CLOSED);
	}

	clearState(){
		if (this.#rtcChannel) {
			this.#rtcChannel.onclose = null; // don't trigger recurrent disconnect()
			this.#rtcChannel.close();
			this.#rtcChannel = null;
		}

		if (this.#rtcPeerConn) {
			this.#rtcPeerConn.close();
			this.#rtcPeerConn = null;
		}

		this.#resetCredentialsPromise();
	}

	#error(message, err) {
		this.#log(`${message}: ${err?.message || err?.error?.message}`);
		console.log(message, err);
	}

	#resetCredentialsPromise() {
		this.#credentialsPromise = new Promise(resolve => {
			this.#resolveCredentials = resolve;
		});
	}

	/** @param {ConnectionStatus} status
	 * @param {string?} message */
	#setRTCStatus(status, message = undefined) {
		if(this.#rtcStatus === status) return;
		this.#rtcStatus = status;
		this.#log(`RTC status: ${status}` + (message ? ", " + message : ""));
		this.emit(ConnectionRTCEvents.RTC_STATUS, status);
	}

	async #handleSignaling(msg) {
		if (!this.#lastCredential) {
			await this.#credentialsPromise;
		}

		if (msg.type === "offer") {
			const polite = !this.#wsClient.getIsMaster();
			const collision = (this.#makingOffer || this.#rtcPeerConn.signalingState !== "stable");

			if (collision && polite) {
				await this.#rtcPeerConn.setLocalDescription(null);
			}

			if (collision && !polite) return;

			try {
				await this.#rtcPeerConn.setRemoteDescription(msg);
				const answer = await this.#rtcPeerConn.createAnswer();
				await this.#rtcPeerConn.setLocalDescription(answer);
				this.#wsClient.send({ type: "answer", sdp: this.#rtcPeerConn.localDescription.sdp });
			} catch (e) {
				this.#error("Failed to process offer", e);
			}
		}
		else if (msg.type === "answer") {
			await this.#rtcPeerConn.setRemoteDescription(msg);
		} else if (msg.type === "candidate") {
			try {
				await this.#rtcPeerConn.addIceCandidate(msg.candidate);
			} catch (e) {
				this.#error("ICE add failed", e);
			}
		}
	}

	#initPeerConnection(credential) {
		if (this.#rtcChannel) {
			this.#rtcChannel.close();
		}

		if (this.#rtcPeerConn) {
			this.#rtcPeerConn.close();
		}

		this.#rtcPeerConn = new RTCPeerConnection({
			iceServers: [
				{ urls: "stun:stun.relay.metered.ca:80" },
				{ urls: "turn:standard.relay.metered.ca:80", username: "3abeebe28255795c85bdd6d5", credential },
				{ urls: "turn:standard.relay.metered.ca:80?transport=tcp", username: "3abeebe28255795c85bdd6d5", credential },
				{ urls: "turn:standard.relay.metered.ca:443", username: "3abeebe28255795c85bdd6d5", credential },
				{ urls: "turns:standard.relay.metered.ca:443?transport=tcp", username: "3abeebe28255795c85bdd6d5", credential },
			],
		});

		this.#rtcPeerConn.ondatachannel = e => {
			this.#rtcChannel = e.channel;
			this.#setupDataChannel();
		};

		this.#rtcPeerConn.onicecandidate = e => {
			if (e.candidate) {
				this.#wsClient.send({ type: "candidate", candidate: e.candidate });
			}
		};

		this.#rtcPeerConn.oniceconnectionstatechange = () => {
			const state = this.#rtcPeerConn.iceConnectionState;
			this.#log(`RTC ICE status: ${state}`);

			if (state === "failed" || state === "disconnected") {
				if (this.#rtcChannel) {
					this.#rtcChannel.close();
					this.#rtcChannel = null;
				}
				if (this.#rtcPeerConn) {
					this.#rtcPeerConn.close();
					this.#rtcPeerConn = null;
				}
				this.#setRTCStatus(ConnectionStatus.CLOSED);
			}
		};

		this.#rtcPeerConn.onnegotiationneeded = async () => {
			try {
				this.#makingOffer = true;

				const offer = await this.#rtcPeerConn.createOffer();
				await this.#rtcPeerConn.setLocalDescription(offer);
				this.#wsClient.send({ type: "offer", sdp: this.#rtcPeerConn.localDescription.sdp });
			} catch (e) {
				this.#error("Negotiation failed", e);
			} finally {
				this.#makingOffer = false;
			}
		};
	}

	#setupDataChannel() {
		if (!this.#rtcChannel) return;

		this.#rtcChannel.onmessage = e => {
			this.#msgCount++;
			this.#byteCount += typeof e.data === 'string' ? textEncoder.encode(e.data).length : (e.data.byteLength || e.data.size || 0);
			this.emit(ConnectionRTCEvents.DATA, e.data);
		};
		
		this.#rtcChannel.onopen = () => {
			this.#msgCount = 0;
			this.#byteCount = 0;
			this.#setRTCStatus(ConnectionStatus.CONNECTED);
		};
		this.#rtcChannel.onclose = () => { this.clearState(); this.#setRTCStatus(ConnectionStatus.CLOSED); }
		this.#rtcChannel.onerror = e => this.#error("RTC error", e);
	}

	#log(text) {
		this.emit(ConnectionRTCEvents.LOG, text);
	}
}

export const wsConnection = new WSClient();
export const rtcConnection = new RTCClient(wsConnection);
export {ConnectionStatus};