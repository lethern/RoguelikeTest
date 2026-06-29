
/** @readonly */
export const EVENTS = {
	// movement
	MoveIntent: "MoveIntent",
	TeleportIntent: "TeleportIntent",
	HasMovedEvent: "HasMovedEvent",
	TargetedKnockbackIntent: "TargetedKnockbackIntent",
	KnockbackEvent: "KnockbackEvent",

	// objects
	TrapTriggered: "TrapTriggered",

	// combat/damage
	ExplosionIntent: "ExplosionIntent",
	TargetedDamageIntent: "TargetedDamageIntent",
	DamageEvent: "DamageEvent",
};

export const COMPONENTS = {
	/* general */
	Position: "Position",
	Health: "Health",
	Timeline: "Timeline",
	Command: "Command",
	/* objects */
	Trap: "Trap",
	TrapTrigger: "TrapTrigger",
	/* combat */
	DamageReduction: "DamageReduction",
	/* relations world */
	OwnerId: "OwnerId",
};

export const ACTIONS = {
	TELEPORTED: "TELEPORTED",
	DAMAGED: "DAMAGED",
	DIED: "DIED",
	EXPLODED: "EXPLODED",
	KNOCKED_BACK: "KNOCKED_BACK",
	MOVE: "MOVE",
};

/**
 * @typedef {Object} TrapComponent
 * @property {boolean} isArmed
 * @property {boolean} isReady
 * @property {number} radius
 * @property {number} damage
 * @property {number} force
 */

/**
 * @typedef {Object} TrapTriggerComponent
 * @property {boolean} onStep
 * @property {number} trapId -if missing, that means self
 */

/** @typedef {Object} PositionComponent
 * @property {number} x
 * @property {number} y
 */

/** @typedef {Object} DamageReductionComponent
 * @property {number} amount
 */
/** @typedef {Object} TimelineComponent
 * @property {number} time
 * @property {boolean} isPlayer
 */
/** @typedef {Object} HealthComponent
 * @property {number} current
 * @property {number} max
 */
/**
 *
 * @typedef {Object} Entity
 * @property {PositionComponent} [Position]
 * @property {HealthComponent} [Health]
 * @property {TrapComponent} [Trap]
 * @property {TrapTriggerComponent} [TrapTrigger]
 * @property {DamageReductionComponent} [DamageReduction]
 * @property {number} [OwnerId]
 * @property {TimelineComponent} [Timeline]
 * @property {number} prefabId
 */