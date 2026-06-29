import {rtcConnection} from '../connection.js';
import {ConnectionRTCEvents} from "./editorEvents.js";

class RemoteCursor {
	#remoteCursor;
	#mainDiv;
	#targetX = 0;
	#targetY = 0;
	#posX = 0;
	#posY = 0;
	#springVelX = 0;
	#springVelY = 0;
	#lastSentX = 0;
	#lastSentY = 0;
	#mouseX = 0;
	#mouseY = 0;
	#animationFrameId;
	#intervalId;
	#boundOnData;

	#CURSOR_SCALE = 1000;
	#CURSOR_FPS = 15;

	#users = new Set();
	#active = false;

	constructor() {
		this.#boundOnData = this.onData.bind(this);
	}

	register(userId) {
		this.#users.add(userId);
		this.#updateState();
	}

	unregister(userId) {
		this.#users.delete(userId);
		this.#updateState();
	}

	#updateState() {
		if (this.#users.size > 0 && !this.#active) {
			this.#activate();
		} else if (this.#users.size === 0 && this.#active) {
			this.#deactivate();
		}
	}

	#activate() {
		this.#active = true;
		this.#mainDiv = document.getElementById("main");
		this.createGlobalCursor();
		this.startMouseGhostAnimation();
		this.startMouseListeners();

		rtcConnection.on(ConnectionRTCEvents.DATA, this.#boundOnData);
	}

	#deactivate() {
		this.#active = false;
		this.destroy();
		rtcConnection.off(ConnectionRTCEvents.DATA, this.#boundOnData);
	}

	async onData(data) {
		let buf;
		if (data instanceof Blob) {
			buf = await data.arrayBuffer();
		} else if (data instanceof ArrayBuffer) {
			buf = data;
		} else {
			return;
		}
		this.updateGhostCursor(buf);
	}

	createGlobalCursor() {
		this.#remoteCursor = document.createElement("div");
		this.#remoteCursor.className = "wl-remoteCursor";
		if (this.#mainDiv) {
			this.#mainDiv.appendChild(this.#remoteCursor);
		}
	}

	startMouseGhostAnimation() {
		const animate = () => {
			const stiffness = 0.65;
			const damping = 0.35;

			this.#springVelX += (this.#targetX - this.#posX) * stiffness;
			this.#springVelY += (this.#targetY - this.#posY) * stiffness;
			this.#springVelX *= damping;
			this.#springVelY *= damping;
			this.#posX += this.#springVelX;
			this.#posY += this.#springVelY;

			if (this.#remoteCursor) {
				this.#remoteCursor.style.left = this.#posX+3 + "px";
				this.#remoteCursor.style.top = this.#posY+7 + "px";
			}

			this.#animationFrameId = requestAnimationFrame(animate);
		};
		animate();
	}

	startMouseListeners() {
		this.#intervalId = setInterval(() => {
			if (Math.abs(this.#mouseX - this.#lastSentX) < 2 && Math.abs(this.#mouseY - this.#lastSentY) < 2) {
				return;
			}

			this.#lastSentX = this.#mouseX;
			this.#lastSentY = this.#mouseY;

			if (!this.#mainDiv || this.#mainDiv.clientWidth === 0) return;

			const x = this.#mouseX / this.#mainDiv.clientWidth;
			const y = this.#mouseY / this.#mainDiv.clientHeight;

			const buf = new ArrayBuffer(4);
			const view = new Uint16Array(buf);

			view[0] = Math.round(x * this.#CURSOR_SCALE);
			view[1] = Math.round(y * this.#CURSOR_SCALE);

			rtcConnection.sendData(buf);
		}, 1000 / this.#CURSOR_FPS);

		document.addEventListener("pointermove", this.onPointerMove);
	}

	onPointerMove = (e) => {
		if (!this.#mainDiv) return;
		const rect = this.#mainDiv.getBoundingClientRect();
		this.#mouseX = e.clientX - rect.left;
		this.#mouseY = e.clientY - rect.top;
	};

	destroy() {
		document.removeEventListener("pointermove", this.onPointerMove);
		if (this.#animationFrameId) cancelAnimationFrame(this.#animationFrameId);
		if (this.#intervalId) clearInterval(this.#intervalId);

		if (this.#remoteCursor && this.#remoteCursor.parentNode) {
			this.#remoteCursor.parentNode.removeChild(this.#remoteCursor);
		}
		this.#remoteCursor = null;
	}

	updateGhostCursor(buf) {
		if (!this.#mainDiv) return;
		const view = new Uint16Array(buf);
		const scaledX = view[0];
		const scaledY = view[1];

		this.#targetX = (scaledX / this.#CURSOR_SCALE) * this.#mainDiv.clientWidth;
		this.#targetY = (scaledY / this.#CURSOR_SCALE) * this.#mainDiv.clientHeight;

		if (this.#posX === 0 && this.#posY === 0) {
			this.#posX = this.#targetX;
			this.#posY = this.#targetY;
		}
	}
}

export const remoteCursor = new RemoteCursor();
