import EventEmitter from "../utils/eventEmitter.js";

export const EditorPersistenceEvents = {
	SAVE_LOCAL: "SAVE_LOCAL",
	SAVE_DISK: "SAVE_DISK",
	LOAD_LOCAL: "LOAD_LOCAL",
	LOAD_DISK: "LOAD_DISK",
	AFTER_LOAD_LOCAL: "AFTER_LOAD_LOCAL",
	AFTER_LOAD_DISK: "AFTER_LOAD_DISK",
};

export const EditorActionsEvents = {
	COMMAND_ADDED: "commandAdded",
	STEP_BACK: "stepBack",
	STEP_FORWARD: "stepForward",
	HISTORY_REPLACED: "historyReplaced",
	COMMAND_DISPATCHED: "commandDispatched",
	COMMAND_MODIFIED: "commandModified",
};

export const GuiEvents = {
	MAIN_LAYOUT_RESIZE: "mainLayoutResize",
	SHOW_GAME: "showGame",
};

export const ConnectionEvents = {
	DATA: "data",
	WS_STATUS: "wsStatus",
	MASTER_STATUS: "masterStatus",
	PEER_CONNECTED: "peerConnected",
	PEER_DISCONNECTED: "peerDisconnected",
	PEER_STATUS: "peerStatus",
	LOG: "log",
};

export const ConnectionRTCEvents = {
	DATA: "data",
	LOG: "log",
	RTC_STATUS: "rtcStatus",
};

export const EditorEvents = {
	TILE_SELECTED: "tileSelected",
	ENTITY_SELECTED: "entitySelected",
};

export const editorEvents = new EventEmitter();
