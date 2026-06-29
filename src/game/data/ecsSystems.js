import { config } from "../../config.js";
import { bind } from "../../utils/general.js";
import { ExecutionalCommand } from "../commands.js";
import { COMPONENTS, EVENTS } from "./ecsEnums.js";
import { Grid } from "../grid.js";
import { logger } from "../../utils/logger.js";
import { MapTooling } from "./ecsUtils.js";

class GridRegistrationSystem {
	/**@type {GameData}*/ #gameData;
	/**@type {PresentationRecord}*/ #record;
	constructor(gameData, record) {
		this.#gameData = gameData;
		this.#record = record;
		this.positionQuery = this.#gameData.world.with(COMPONENTS.Position);

		this.positionQuery.onEntityAdded.subscribe(this.onPositionAdded.bind(this));
		this.positionQuery.onEntityRemoved.subscribe(this.onPositionRemoved.bind(this));
	}

	update() {}

	onPositionAdded(entity) {
		console.log(`Adding entity ${entity.name || "unknown"} to Grid`);
		Grid.move(entity, null, null, entity.Position.x, entity.Position.y);
	}

	onPositionRemoved(entity) {
		//if(entity.Position)
		Grid.remove(entity, entity.Position.x, entity.Position.y);
	}
}

class MovementSystem {
	/**@type {GameData}*/ #gameData;
	/**@type {PresentationRecord}*/ #record;

	constructor(gameData, record) {
		this.#gameData = gameData;
		this.#record = record;
		this.#gameData.events.listen(EVENTS.MoveIntent, bind(this.onMoveIntent, this));
	}

	update() {}

	onMoveIntent(event, entity) {
		if (!entity.Position) return;

		const causalityId = event.causalityId ?? this.#gameData.nextCausalityId();
		const nextX = entity.Position.x + event.dx;
		const nextY = entity.Position.y + event.dy;

		let canMove = MapTooling.canMove(entity, nextX, nextY);
		let blockingEntity = null;

		for (const elem of Grid.getAt(nextX, nextY)) {
			if (elem.isSolid) canMove = false;
			if (elem.Health !== undefined) blockingEntity = elem;
		}

		if (blockingEntity) {
			// movement -> attack
			this.#gameData.events.raise(
				{
					type: EVENTS.TargetedDamageIntent,
					amount: 5,
					dmgType: "Physical",
					causalityId,
				},
				blockingEntity,
			);
			return;
		}

		if (canMove) {
			const oldX = entity.Position.x;
			const oldY = entity.Position.y;
			Grid.move(entity, oldX, oldY, nextX, nextY);
			entity.Position.x = nextX;
			entity.Position.y = nextY;

			this.#gameData.events.raise(
				{
					type: EVENTS.HasMovedEvent,
					x: nextX,
					y: nextY,
					fromX: oldX,
					fromY: oldY,
					causalityId,
				},
				entity,
			);

			this.#record.makeActionWalk({ entity, fromX: oldX, fromY: oldY, toX: nextX, toY: nextY, causalityId });
		}
	}
}

class CommandsSystem {
	/**@type {GameData}*/ #gameData;
	/**@type {PresentationRecord}*/ #record;

	constructor(gameData, record) {
		this.#gameData = gameData;
		this.#record = record;
		this.entities = this.#gameData.world.with([COMPONENTS.Command]);
	}

	update() {
		for (const entity of this.entities) {
			const cmd = entity[COMPONENTS.Command];
			switch (cmd.type) {
				case ExecutionalCommand.MOVE:
					this.#gameData.events.raise(
						{
							type: EVENTS.MoveIntent,
							dx: cmd.dx,
							dy: cmd.dy,
						},
						entity,
					);
					break;
			}
			this.#gameData.world.removeComponent(entity, COMPONENTS.Command);
		}
	}
}

class TeleportSystem {
	/**@type {GameData}*/ #gameData;
	/**@type {PresentationRecord}*/ #record;
	constructor(gameData, record) {
		this.#gameData = gameData;
		this.#record = record;
		this.#gameData.events.listen(EVENTS.TeleportIntent, bind(this.onTeleportIntent, this));
	}

	update() {}

	onTeleportIntent(event, entity) {
		if (!entity.Position) return;
		const oldX = entity.Position.x;
		const oldY = entity.Position.y;
		Grid.move(entity, entity.Position.x, entity.Position.y, event.x, event.y);
		entity.Position.x = event.x;
		entity.Position.y = event.y;

		const causalityId = event.causalityId ?? this.#gameData.nextCausalityId();

		this.#gameData.events.raise(
			{
				type: EVENTS.HasMovedEvent,
				x: event.x,
				y: event.y,
				fromX: oldX,
				fromY: oldY,
				causalityId,
			},
			entity,
		);
		this.#record.makeActionTeleport({ entity, fromX: oldX, fromY: oldY, toX: event.x, toY: event.y, causalityId });
	}
}

class TrapTriggerSystem {
	/**@type {GameData}*/ #gameData;
	/**@type {PresentationRecord}*/ #record;
	constructor(gameData, record) {
		this.#gameData = gameData;
		this.#record = record;
		this.#gameData.events.listen(EVENTS.HasMovedEvent, bind(this.onMovedEvent, this));
	}

	update() {}

	onMovedEvent(event, target) {
		for (/** @type {{TrapTrigger?: TrapTriggerComponent}} */ const entity of Grid.getAt(event.x, event.y)) {
			const { TrapTrigger } = entity;
			if (TrapTrigger && TrapTrigger.onStep) {
				//this.#gameData.world.addComponent(entity, "isTriggered", { source: event});

				const trap = TrapTrigger.trapId ? this.#gameData.world.entity(TrapTrigger.trapId) : entity;
				this.#gameData.events.raise(
					{
						type: EVENTS.TrapTriggered,
						target: target,
						x: event.x,
						y: event.y,
						source: event,
					},
					trap,
				);
			}
		}
	}
}

class TrapResolveSystem {
	/**@type {GameData}*/ #gameData;
	/**@type {PresentationRecord}*/ #record;
	constructor(gameData, record) {
		this.#gameData = gameData;
		this.#record = record;
		this.#gameData.events.listen(EVENTS.TrapTriggered, bind(this.onTriggered, this));
	}

	update() {}

	/** @param event
	 * @param {{Trap: TrapComponent, Position: PositionComponent}} trap */
	onTriggered(event, { Trap, Position }) {
		if (Trap && Position && Trap.isReady && Trap.isArmed) {
			Trap.isReady = false;

			this.#gameData.events.raise({
				type: EVENTS.ExplosionIntent,
				x: Position.x,
				y: Position.y,
				radius: Trap.radius,
				damage: Trap.damage,
				force: Trap.force,
				source: event.source,
			});
		}
	}
}

class ExplosionSystem {
	/**@type {GameData}*/ #gameData;
	/**@type {PresentationRecord}*/ #record;
	constructor(gameData, record) {
		this.#gameData = gameData;
		this.#record = record;
		this.#gameData.events.listen(EVENTS.ExplosionIntent, bind(this.onExplosionIntent, this));
	}

	update() {}

	/**
	 * @param event
	 * @param {undefined} entity
	 */
	onExplosionIntent(event, entity) {
		this.explode(event);
	}

	explode(event) {
		for (let dy = -event.radius; dy <= event.radius; dy++) {
			for (let dx = -event.radius; dx <= event.radius; dx++) {
				const cellX = event.x + dx;
				const cellY = event.y + dy;

				for (const entity of Grid.getAt(cellX, cellY)) {
					if (entity.Health === undefined) continue;

					this.#gameData.events.raise(
						{
							type: EVENTS.TargetedDamageIntent,
							amount: event.damage,
							dmgType: "Fire",
						},
						entity,
					);

					if (event.force > 0) {
						let event_dx = Math.sign(dx);
						let event_dy = Math.sign(dy);
						if (event_dx === 0 && event_dy === 0) {
							if (event.source && event.source.fromX !== undefined) {
								event_dx = Math.sign(event.source.fromX - entity.Position.x);
								event_dy = Math.sign(event.source.fromY - entity.Position.y);
								logger.log("ExplosionSystem: " + entity.Position.x + " " + event.source.fromX);
							}
						}

						this.#gameData.events.raise(
							{
								type: EVENTS.TargetedKnockbackIntent,
								dx: event_dx,
								dy: event_dy,
								force: event.force,
							},
							entity,
						);
					}
				}
			}
		}
	}
}

class ShieldSystem {
	/**@type {GameData}*/ #gameData;
	/**@type {PresentationRecord}*/ #record;
	constructor(gameData, record) {
		this.#gameData = gameData;
		this.#record = record;
		this.modifiers = this.#gameData.relations.with(COMPONENTS.DamageReduction, COMPONENTS.OwnerId);

		this.#gameData.events.listen(EVENTS.TargetedDamageIntent, bind(this.onTargetedDamageIntent, this), 10);
	}

	update() {}

	onTargetedDamageIntent(event, entity) {
		const targetId = this.#gameData.world.id(entity);
		for (let { DamageReduction, OwnerId } of this.modifiers) {
			if (OwnerId === targetId) {
				logger.log("ShieldSystem: reducing by " + DamageReduction.amount);
				event.amount = Math.max(0, event.amount - DamageReduction.amount);
			}
		}
	}
}

class DamageSystem {
	/**@type {GameData}*/ #gameData;
	/**@type {PresentationRecord}*/ #record;
	constructor(gameData, record) {
		this.#gameData = gameData;
		this.#record = record;
		this.#gameData.events.listen(EVENTS.TargetedDamageIntent, bind(this.onTargetedDamageIntent, this));
	}

	update() {}

	onTargetedDamageIntent(event, entity) {
		if (entity.Health !== undefined) {
			logger.log("DamageSystem: deal " + event.amount);
			entity.Health.current -= event.amount;
			this.#gameData.world.reindex(entity);
		}
	}
}

class DeathSystem {
	/**@type {GameData}*/ #gameData;
	/**@type {PresentationRecord}*/ #record;
	constructor(gameData, record) {
		this.#gameData = gameData;
		this.#record = record;
		this.deadEntities = this.#gameData.world.with(COMPONENTS.Health, COMPONENTS.Position).where((entity) => entity.Health <= 0);
	}

	update() {
		for (const entity of this.deadEntities) {
			//this.#gameData.world.addComponent(entity, "isDead", true);
			if (entity.Position) {
				logger.log("DeathSystem: Dead");
				//Grid.remove(entity, entity.Position.x, entity.Position.y);
				this.#gameData.world.removeComponent(entity, "Position");
			}
		}
	}
}

class KnockbackSystem {
	/**@type {GameData}*/ #gameData;
	/**@type {PresentationRecord}*/ #record;
	constructor(gameData, record) {
		this.#gameData = gameData;
		this.#record = record;
		this.#gameData.events.listen(EVENTS.TargetedKnockbackIntent, bind(this.onTargetedKnockbackIntent, this));
	}

	update() {}

	onTargetedKnockbackIntent(event, entity) {
		//if (event.target.isDead) {
		//	return;
		//}
		if (!entity.Position) return;

		const nextX = entity.Position.x + event.dx;
		const nextY = entity.Position.y + event.dy;
		logger.log("KnockbackSystem: (from " + entity.Position.x + ", " + entity.Position.y + " into " + nextX + ", " + nextY + ")");
		let isBlocked = false;

		for (const elem of Grid.getAt(nextX, nextY)) {
			if (elem.isSolid) {
				isBlocked = true;

				logger.log("KnockbackSystem: blocked -> TargetedDamageIntent");
				this.#gameData.events.raise(
					{
						type: EVENTS.TargetedDamageIntent,
						amount: event.force * 10,
						dmgType: "Physical",
					},
					entity,
				);
			}
		}

		if (!isBlocked) {
			logger.log("KnockbackSystem: move");
			Grid.move(entity, entity.Position.x, entity.Position.y, nextX, nextY);
			entity.Position.x = nextX;
			entity.Position.y = nextY;
			event.force -= 1;

			if (event.force > 0) {
				this.#gameData.events.raise(
					{
						type: EVENTS.TargetedKnockbackIntent,
						dx: event.dx,
						dy: event.dy,
						force: event.force,
					},
					entity,
				);
				return;
			}
		}

		logger.log("KnockbackSystem: KnockbackEvent " + event.dx + " " + event.dy);
		//this.#gameData.events.add({
		//	type: EVENTS.KnockbackEvent,
		//	target: event.target, dx: event.dx, dy: event.dy
		//});
	}
}

const GameConfig = Object.freeze({
	MAX_TIMELINE_RUNS: "MAX_TIMELINE_RUNS",
});

config.addConfigVar(
	GameConfig.MAX_TIMELINE_RUNS,
	1000,
	"Maximum number of processed entities before next player move",
	"maxTimelineRuns",
	"GameConfig",
);

class TimelineSystem {
	/**@type {GameData}*/ #gameData;
	/**@type {PresentationRecord}*/ #record;
	constructor(gameData, record) {
		this.#gameData = gameData;
		this.#record = record;
		this.query = this.#gameData.world.orderedQuery(
			{ with: [COMPONENTS.Timeline], without: [], predicates: [] },
			(en1, en2) => en2.time - en1.time,
		);
	}

	proceed() {
		let playerProcessed = false;
		let watchdog = 0;
		const max_watchdog = config.getConfigValue(GameConfig.MAX_TIMELINE_RUNS);

		while (this.query.entities.length > 0) {
			let entity = this.query.entities[0];
			let timelineComponent = entity[COMPONENTS.Timeline];

			// allow to run "Player" exactly once, and exit exactly before second time
			if (timelineComponent.isPlayer) {
				if (playerProcessed) {
					return;
				} else {
					playerProcessed = true;
				}
			}
			if (watchdog++ > max_watchdog) throw new Error("too many iterations");

			let energySpent = this.process(entity);

			// move entity back into future timeline
			timelineComponent.time += energySpent;
			this.#gameData.world.reindex(entity);
		}
	}

	process(entity) {
		let energySpent = 1000;
		logger.log("process");
		return energySpent;
	}
}

export class GameSystems {
	#timelineSystem;
	#systems;

	constructor(gameData, record) {
		this.#timelineSystem = new TimelineSystem(gameData, record);
		this.#systems = [
			// passive
			new GridRegistrationSystem(gameData, record),
			//*
			new CommandsSystem(gameData, record),
			new TrapTriggerSystem(gameData, record),
			new TrapResolveSystem(gameData, record),
			new ExplosionSystem(gameData, record),
			new ShieldSystem(gameData, record),
			new DamageSystem(gameData, record),
			new DeathSystem(gameData, record),
			new KnockbackSystem(gameData, record),
			new TeleportSystem(gameData, record),
			new MovementSystem(gameData, record),
			// */
		];
	}

	execute() {
		this.#timelineSystem.proceed();

		for (const system of this.#systems) {
			system.update();
		}
	}
}
