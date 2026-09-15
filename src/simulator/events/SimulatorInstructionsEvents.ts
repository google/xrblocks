import {SimulatorMode} from '../SimulatorOptions.js';

export class ShowSimulatorInstructionsEvent extends Event {
  static type = 'showSimulatorInstructions';
  constructor(public simulatorMode?: SimulatorMode) {
    super(ShowSimulatorInstructionsEvent.type, {bubbles: true, composed: true});
  }
}
