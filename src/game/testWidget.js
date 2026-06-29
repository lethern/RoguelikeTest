import { testScenarios } from "./testScenarios.js";
import { gui } from "../gui.js";
import { logger } from "../utils/logger.js";

export function showTestWidget() {
	const overlay = document.createElement("div");
	overlay.style.cssText =
		"position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;";

	const container = document.createElement("div");
	container.style.cssText = "background: #333; padding: 20px; border-radius: 5px; color: white; width: 300px;";

	const title = document.createElement("h2");
	title.textContent = "Select Scenario";
	container.appendChild(title);

	testScenarios.forEach((scenario) => {
		const button = document.createElement("button");
		button.style.cssText = "display: block; width: 100%; margin: 10px 0; padding: 10px; cursor: pointer;";
		button.textContent = scenario.name;
		button.addEventListener("click", () => {
			logger.log(`Loading scenario: ${scenario.id}`);
			// TODO: Add actual loading logic
			document.body.removeChild(overlay);
		});
		container.appendChild(button);
	});

	const closeBtn = document.createElement("button");
	closeBtn.textContent = "Close";
	closeBtn.style.cssText = "width: 100%; margin-top: 10px; padding: 10px; cursor: pointer;";
	closeBtn.addEventListener("click", () => {
		document.body.removeChild(overlay);
	});
	container.appendChild(closeBtn);

	overlay.appendChild(container);
	document.body.appendChild(overlay);
}

export function initTestWidget() {
	gui.registerGameMenuBtn("testWidget", "Test", "Dev", () => {
		showTestWidget();
	});
}
