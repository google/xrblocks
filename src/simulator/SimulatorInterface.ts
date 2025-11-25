import {
  SimulatorControls,
  SimulatorModeIndicatorElement,
} from './SimulatorControls.js';
import {SimulatorHands} from './SimulatorHands.js';
import {
  SimulatorCustomInstruction,
  SimulatorOptions,
} from './SimulatorOptions.js';

type SimulatorInstructionsHTMLElement = HTMLElement & {
  customInstructions: SimulatorCustomInstruction[];
};

export class SimulatorInterface {
  private elements: HTMLElement[] = [];
  private interfaceVisible = true;

  /**
   * Initialize the simulator interface.
   */
  init(
    simulatorOptions: SimulatorOptions,
    simulatorControls: SimulatorControls,
    simulatorHands: SimulatorHands
  ) {
    this.createModeIndicator(simulatorOptions, simulatorControls);
    this.showGeminiLivePanel(simulatorOptions);
    this.createHandPosePanel(simulatorOptions, simulatorHands);
    this.showInstructions(simulatorOptions);
  }

  createModeIndicator(
    simulatorOptions: SimulatorOptions,
    simulatorControls: SimulatorControls
  ) {
    if (simulatorOptions.modeIndicator.enabled) {
      const modeIndicatorElement = document.createElement(
        simulatorOptions.modeIndicator.element
      ) as SimulatorModeIndicatorElement;
      document.body.appendChild(modeIndicatorElement);
      simulatorControls.setModeIndicatorElement(modeIndicatorElement);
      this.elements.push(modeIndicatorElement);
    }
  }

  showInstructions(simulatorOptions: SimulatorOptions) {
    if (simulatorOptions.instructions.enabled) {
      const element = document.createElement(
        simulatorOptions.instructions.element
      ) as SimulatorInstructionsHTMLElement;
      element.customInstructions =
        simulatorOptions.instructions.customInstructions;
      document.body.appendChild(element);
      this.elements.push(element);
    }
  }

  showGeminiLivePanel(simulatorOptions: SimulatorOptions) {
    if (simulatorOptions.geminiLivePanel.enabled) {
      const element = document.createElement(
        simulatorOptions.geminiLivePanel.element
      );
      document.body.appendChild(element);
      this.elements.push(element);
    }
  }

  createHandPosePanel(
    simulatorOptions: SimulatorOptions,
    simulatorHands: SimulatorHands
  ) {
    if (simulatorOptions.handPosePanel.enabled) {
      const handsPanelElement = document.createElement(
        simulatorOptions.handPosePanel.element
      );
      document.body.appendChild(handsPanelElement);
      simulatorHands.setHandPosePanelElement(handsPanelElement);
      this.elements.push(handsPanelElement);
    }
  }

  hideUiElements() {
    for (const element of this.elements) {
      element.style.display = 'none';
    }
    this.interfaceVisible = false;
  }

  showUiElements() {
    for (const element of this.elements) {
      element.style.display = '';
    }
    this.interfaceVisible = true;
  }

  getInterfaceVisible() {
    return !this.interfaceVisible;
  }

  toggleInterfaceVisible() {
    if (this.interfaceVisible) {
      this.hideUiElements();
    } else {
      this.showUiElements();
    }
  }
}
