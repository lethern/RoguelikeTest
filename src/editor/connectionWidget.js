import {gui} from "../gui.js";
import { wsConnection, rtcConnection } from '../connection.js';
import {ConnectionEvents, ConnectionRTCEvents} from "./editorEvents.js";
import {remoteCursor} from "./remoteCursor.js";

class ConnectionWidget {
	#connectionBindingsDone = false;
	#doneInit = false;

	constructor() {
	}

	#init() {
		this.logHistory = [];

		this.#doneInit = true;
	}

	render(container){
		if(!this.#doneInit) this.#init();

		this.container = container;
		const root = container.element;

		remoteCursor.register('connectionWidget');

		root.innerHTML = `
		<div class="wl-dashboard">
			<div class="wl-controls">
				<div class="wl-statuses">
					<div>WS: <span class="wsStatus status-badge">NONE</span></div>
					<div>RTC: <span class="rtcStatus status-badge">NONE</span></div>
					<div>Master: <span class="masterStatus status-badge"></span></div>
					<div>Peer: <span class="peerStatus status-badge">NO</span></div>
				</div>
				
				<div class="wl-stats" style="font-size: 0.85em; background: #222; color: #0f0; padding: 5px; margin: 5px 0; border-radius: 4px; font-family: monospace;">
					<div>[WS] Msgs: <span class="ws-msgs">0</span> | Vol: <span class="ws-vol">0 B</span> | Avg: <span class="ws-avg">0 B</span></div>
					<div>[RTC] Msgs: <span class="rtc-msgs">0</span> | Vol: <span class="rtc-vol">0 B</span> | Avg: <span class="rtc-avg">0 B</span></div>
				</div>

				<div class="wl-row">
					<button class="connect-ws-btn">Connect WS</button>
					<button class="connect-btn">Connect RTC</button>
					<button class="disconnect-btn">Disconnect</button>
				</div>
				<div class="wl-row">
					<input class="msg-input" placeholder="Type a message...">
					<button class="send-btn">Send</button>
				</div>
			</div>
			<div class="wl-logs"></div>
		</div>

		<div class="wl-main">
			<div class="wl-chat"></div>
		</div>
		`;

		this.chat = root.querySelector(".wl-chat");
		this.logsDiv = root.querySelector(".wl-logs");
		this.wsStatusLabel = root.querySelector(".wsStatus");
		this.rtcStatusLabel = root.querySelector(".rtcStatus");
		this.masterStatusLabel = root.querySelector(".masterStatus");
		this.peerStatusLabel = root.querySelector(".peerStatus");
		this.connectWsBtn = root.querySelector(".connect-ws-btn");
		this.connectBtn = root.querySelector(".connect-btn");
		this.disconnectBtn = root.querySelector(".disconnect-btn");
		this.sendBtn = root.querySelector(".send-btn");
		this.msgInput = root.querySelector(".msg-input");

		this.wsMsgsLabel = root.querySelector(".ws-msgs");
		this.wsVolLabel = root.querySelector(".ws-vol");
		this.wsAvgLabel = root.querySelector(".ws-avg");
		this.rtcMsgsLabel = root.querySelector(".rtc-msgs");
		this.rtcVolLabel = root.querySelector(".rtc-vol");
		this.rtcAvgLabel = root.querySelector(".rtc-avg");

		this.wsStatusLabel.textContent = wsConnection.getStatus();
		this.rtcStatusLabel.textContent = rtcConnection.getStatus();
		this.masterStatusLabel.textContent = wsConnection.getIsMaster() ? "YES" : "NO";

		container.on('destroy', () => {
			this.destroy();
		});

		this.bindEvents();
		this.#startStatsWatcher();
		this.#bindConnectionWidget();

		this.logsDiv.textContent = this.logHistory.join("\n");
	}

	#bindConnectionWidget(){
		if(this.#connectionBindingsDone) return;
		this.#connectionBindingsDone= true;

		const logger = (text) => {
			this.logHistory.push(text);
			if (this.logHistory.length > 50) this.logHistory.shift();
			this.logsDiv.textContent = this.logHistory.join("\n");
		};
		wsConnection.on(ConnectionEvents.LOG, logger);

		wsConnection.on(ConnectionEvents.WS_STATUS, (status) => {
			this.wsStatusLabel.textContent = status;
		});

		wsConnection.on(ConnectionEvents.MASTER_STATUS, (status) => {
			this.masterStatusLabel.textContent = status ? "YES" : "NO";
			gui.sendLayoutResize();
		});

		wsConnection.on(ConnectionEvents.PEER_STATUS, (isPeer) => {
			this.peerStatusLabel.textContent = isPeer ? "YES" : "NO";
		});

		rtcConnection.on(ConnectionRTCEvents.LOG, logger);

		rtcConnection.on(ConnectionRTCEvents.RTC_STATUS, (status) => {
			this.rtcStatusLabel.textContent = status;
		});

		wsConnection.on(ConnectionEvents.DATA, (msg) => {
			if (msg.type === "chat") {
				this.addChat("Peer: " + msg.text);
			} else if (msg.type === "size") {
				if(!wsConnection.getIsMaster()){
					const main = document.getElementById('main');
					main.style.width = msg.width + "px";
					main.style.height = msg.height + "px";
				}
			}
		});

		rtcConnection.init();
	}

	addChat(text) {
		const el = document.createElement("div");
		el.textContent = text;
		this.chat.appendChild(el);
		this.chat.scrollTop = this.chat.scrollHeight;
	}

	bindEvents() {
		this.connectWsBtn.onclick = async () => {
			await wsConnection.connect();
		};
		this.connectBtn.onclick = async () => {
			await rtcConnection.connect(true);
		};

		this.disconnectBtn.onclick = () => {
			wsConnection.disconnect();
			rtcConnection.disconnect();
		};

		this.sendBtn.onclick = () => {
			const text = this.msgInput.value.trim();
			if (!text) return;

			wsConnection.sendToPeer({ type: "chat", text: text });
			this.addChat("Me: " + text);
			this.msgInput.value = "";
		};
	}

	#startStatsWatcher() {
		this.statsIntervalId = setInterval(() => {
			const wsMsgs = wsConnection.getMsgCount();
			const wsBytes = wsConnection.getByteCount();
			const wsAvg = wsMsgs > 0 ? (wsBytes / wsMsgs) : 0;

			const rtcMsgs = rtcConnection.getMsgCount();
			const rtcBytes = rtcConnection.getByteCount();
			const rtcAvg = rtcMsgs > 0 ? (rtcBytes / rtcMsgs) : 0;

			if (this.wsMsgsLabel) this.wsMsgsLabel.textContent = wsMsgs;
			if (this.wsVolLabel) this.wsVolLabel.textContent = this.#formatBytes(wsBytes);
			if (this.wsAvgLabel) this.wsAvgLabel.textContent = this.#formatBytes(wsAvg);

			if (this.rtcMsgsLabel) this.rtcMsgsLabel.textContent = rtcMsgs;
			if (this.rtcVolLabel) this.rtcVolLabel.textContent = this.#formatBytes(rtcBytes);
			if (this.rtcAvgLabel) this.rtcAvgLabel.textContent = this.#formatBytes(rtcAvg);
		}, 500);
	}

	#formatBytes(bytes) {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	destroy() {
		remoteCursor.unregister('connectionWidget');
		if (this.statsIntervalId) clearInterval(this.statsIntervalId);
	}
}

const connectionWidget = new ConnectionWidget();

gui.registerComponent("connection", "Connection", "Dev", (container, state) => {
	console.log("open ConnectionWidget")
	connectionWidget.render(container);
});