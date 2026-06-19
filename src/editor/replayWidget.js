import { gui } from '../gui.js';
import { actions } from '../actionsHistory.js';

class ReplayDevWidget {
	constructor() {
		gui.registerComponent("replayDev", "Replay State", "Dev", (container, state) => {
			this.container = container;

			this.element = document.createElement('div');
			this.element.className = 'rl-editor replay-dev-widget';
			this.element.style.padding = '10px';
			this.element.style.overflowY = 'auto';
			this.element.style.height = '100%';
			this.element.style.boxSizing = 'border-box';
			this.container.element.appendChild(this.element);

			actions.on('commandAdded', () => this.render());
			actions.on('stepBack', () => this.render());
			actions.on('stepForward', () => this.render());

			this.render();
		});
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

		const listHtml = nodes.map((node, index) => {
			let sizeBytes = 0;
			try {
				sizeBytes = JSON.stringify(node.serialize()).length;
			} catch (e) {
				console.warn("Failed to serialize node", node);
			}

			totalSize += sizeBytes;

			const isActive = node === activeNode;
			const commandName = node.command ? node.command.constructor.name : "BaseCommand";
			const rowBg = isActive ? '#4caf5033' : 'transparent';
			const borderStyle = 'border-bottom: 1px solid #444;';

			return `
                <div style="padding: 6px; ${borderStyle} background-color: ${rowBg}; display: flex; justify-content: space-between;">
                    <span>
                        <strong>[${node.seqN}]</strong> ${commandName} 
                        ${isActive ? '<span style="color: #4caf50; font-size: 0.8em; margin-left: 5px;">(Active)</span>' : ''}
                    </span>
                    <span style="color: #888; font-size: 0.9em;">${sizeBytes} B</span>
                </div>
            `;
		}).join('');

		const nodeCount = nodes.length;
		const avgSize = nodeCount > 0 ? (totalSize / nodeCount).toFixed(2) : 0;

		this.element.innerHTML = `
            <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #666;">
                <h3 style="margin-top: 0;">History stats</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.95em;">
                    <div><strong>Total nodes:</strong> ${nodeCount}</div>
                    <div><strong>Total size:</strong> ${totalSize} B</div>
                    <div><strong>Avg size:</strong> ${avgSize} B/node</div>
                </div>
            </div>
            <div>
                <h4 style="margin-bottom: 8px;">Nodes</h4>
                <div style="background: #1e1e1e; border: 1px solid #333; border-radius: 4px;">
                    ${listHtml}
                </div>
            </div>
        `;
	}
}

const replayDevWidget = new ReplayDevWidget();