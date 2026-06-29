import {ACTIONS} from "../data/ecsEnums.js";
import {fieldOfView} from "../data/ecsUtils.js";

export class PresentationRecord {
	#queue = [];
	#gameData;

	constructor(gameData) {
		this.#gameData = gameData;
	}
	add(action){
		this.#queue.push(action);
	}

	makeActionTeleport({ entity, fromX, fromY, toX, toY, causalityId }) {
		const fromPerception = this.getPlayerPerception(entity, fromX, fromY);
		const toPerception = this.getPlayerPerception(entity, toX, toY);

		if (!(fromPerception.canSee || fromPerception.canHear ||
			toPerception.canSee || toPerception.canHear)) return;

		const action = {
			action: ACTIONS.TELEPORTED,
			causalityId,
			entity,
			fromX, fromY,
			toX, toY,
			canSeeFrom: fromPerception.canSee,
			canHearFrom: fromPerception.canHear,
			canSeeTo: toPerception.canSee,
			canHearTo: toPerception.canHear
		};

		this.add(action);
	}

	makeActionWalk({entity, fromX, fromY, toX, toY, causalityId}) {
		const player = this.#gameData.player;
		if (entity === player) return;

		const fromPerception = this.getPlayerPerception(entity, fromX, fromY);
		const toPerception = this.getPlayerPerception(entity, toX, toY);

		if (!(fromPerception.canSee || fromPerception.canHear ||
			toPerception.canSee || toPerception.canHear)) return;

		const action = {
			action: ACTIONS.MOVE,
			causalityId,
			entity,
			fromX, fromY,
			toX, toY,
			canSeeFrom: fromPerception.canSee,
			canHearFrom: fromPerception.canHear,
			canSeeTo: toPerception.canSee,
			canHearTo: toPerception.canHear
		};

		this.add(action);
	};

	getPlayerPerception(target, x, y) {
		const player = this.#gameData.player;
		if (target === player) return { canSee: true, canHear: true };
		return {
			canSee: fieldOfView.canSee(player, target, x, y),
			canHear: fieldOfView.canHear(player, x, y)
		};
	}

	makeActionDamage({ entity, amount, dmgType }) {
		if (!entity.Position) return;
		const p = this.getPlayerPerception(entity, entity.Position.x, entity.Position.y);

		if (!p.canSee && !p.canHear) return;
		this.add({ action: ACTIONS.DAMAGED, entity, amount, dmgType, ...p });
	}

	makeActionDeath({ entity, x, y }) {
		const p = this.getPlayerPerception(entity, x, y);

		if (!p.canSee && !p.canHear) return;
		this.add({ action: ACTIONS.DIED, entity, x, y, ...p });
	}

	makeActionExplosion({ x, y, radius }) {
		const p = this.getPlayerPerception(null, x, y);

		if (!p.canSee && !p.canHear) return;
		this.add({ action: ACTIONS.EXPLODED, x, y, radius, ...p });
	}

	makeActionKnockback({ entity, fromX, fromY, toX, toY }) {
		const pFrom = this.getPlayerPerception(entity, fromX, fromY);
		const pTo = this.getPlayerPerception(entity, toX, toY);

		if (!pFrom.canSee && !pFrom.canHear && !pTo.canSee && !pTo.canHear) return;
		this.add({
			action: ACTIONS.KNOCKED_BACK,
			entity,
			fromX, fromY,
			toX, toY,
			canSeeFrom: pFrom.canSee,
			canHearFrom: pFrom.canHear,
			canSeeTo: pTo.canSee,
			canHearTo: pTo.canHear
		});
	}
}