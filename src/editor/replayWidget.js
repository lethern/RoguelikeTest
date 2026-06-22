import { gui } from '../gui.js';
import {actions} from '../historyStorage.js';
import {HistoryEvents} from "./editorEvents.js";

class ReplayDevWidget {
	constructor() {
		this.selectedNode = null;
		this.element = null;

		gui.registerComponent("replayDev", "Replay State", "Dev", (container, state) => {
			container.innerHTML = null;
			this.container = container;

			this.element = document.createElement('div');
			this.element.className = 'rl-editor replay-dev-widget';
			this.element.style.padding = '10px';
			this.element.style.overflowY = 'auto';
			this.element.style.height = '100%';
			this.element.style.boxSizing = 'border-box';
			this.container.element.appendChild(this.element);

			this.element.addEventListener('click', (e) => {
				const nodeEl = e.target.closest('.replay-node-item');
				if (!nodeEl) return;
				const seqN = parseInt(nodeEl.dataset.seqN);
				if (isNaN(seqN)) return;

				this.selectNode(toggle(this.selectedNode, seqN));

				function toggle(selectedNode, seqN){
					return selectedNode && selectedNode.seqN === seqN ? null : seqN;
				}
			});

			this.render();
		});

		actions.on(HistoryEvents.COMMAND_ADDED, () => this.render());
		actions.on(HistoryEvents.STEP_BACK, () => this.render());
		actions.on(HistoryEvents.STEP_FORWARD, () => this.render());
		actions.on(HistoryEvents.HISTORY_REPLACED, () => this.render());
	}

	selectNode(seqN) {
		if (seqN === null) {
			this.selectedNode = null;
		} else {
			const nodes = [];
			let curr = actions.getHistoryRoot();
			while (curr) {
				nodes.push(curr);
				curr = curr.getLatestChild();
			}
			this.selectedNode = nodes.find(n => n.seqN === seqN) || null;
		}
		this.render();
	}

	render() {
		if (!this.element) return;

		const nodes = [];
		let curr = actions.getHistoryRoot();

		while (curr) {
			nodes.push(curr);
			curr = curr.getLatestChild();
		}

		const activeNode = actions.getCurrentNode();
		let totalSize = 0;

		const listHtml = nodes.map((node) => {
			let sizeBytes = 0;
			try {
				sizeBytes = JSON.stringify(node.serialize()).length;
			} catch (e) {
				console.warn("Failed to serialize node", node);
			}

			totalSize += sizeBytes;

			const isActive = node === activeNode;
			const isSelected = node === this.selectedNode;
			const commandName = node.command ? node.command.constructor.name : "BaseCommand";
			const rowBg = isActive ? '#4caf5033' : (isSelected ? '#4488ff33' : 'transparent');

			return `
			<div class="replay-node-item" data-seq-n="${node.seqN}" style="background-color: ${rowBg}; cursor: pointer;">
				<span>
					<strong>[${node.seqN}]</strong> ${commandName}
				${isActive ? '<span class="replay-active-indicator">(Active)</span>' : ''	}
				</span>
				<span class="replay-size-display">${sizeBytes} B</span>
			</div>`;
		}).join('');

		// Fallback to the active node if selectedNode is null (rendering live state)
		const displayNode = this.selectedNode || activeNode;
		let dataHtml = '';

		if (displayNode && displayNode.command && displayNode.command.data) {
			const dataJson = JSON.stringify(displayNode.command.data, null, 2);
			const title = this.selectedNode
				? `Command Data [${displayNode.seqN}]`
				: `Active Command Data [${displayNode.seqN}]`;

			dataHtml = `
			 <div class="replay-data-section" style="margin-top: 10px;">
				<h4 style="margin-bottom: 8px;">${title}</h4>
				<pre class="replay-data-pre">${dataJson}</pre>
			 </div>
		  `;
		}

		const nodeCount = nodes.length;
		const avgSize = nodeCount > 0 ? (totalSize / nodeCount).toFixed(2) : 0;

		this.element.innerHTML = `
		  <div class="replay-stats-section">
			 <h3 style="margin-top: 0;">History stats</h3>
			 <div class="replay-stats-grid">
				<div><strong>Total nodes:</strong> ${nodeCount}</div>
				<div><strong>Total size:</strong> ${totalSize} B</div>
				<div><strong>Avg size:</strong> ${avgSize} B/node</div>
			 </div>
		  </div>
		  <div>
			 <h4 style="margin-bottom: 8px;">Nodes</h4>
			 <div class="replay-nodes-container">
				${listHtml}
			 </div>
		  </div>
		  ${dataHtml}
	   `;
	}
}

const replayDevWidget = new ReplayDevWidget();
