
export class SimulatorInstructionsNextEvent extends Event {
  static type = 'simulatorInstructionsNextEvent';
  constructor() {
    super(SimulatorInstructionsNextEvent.type, {bubbles: true, composed: true});
  }
}

export class SimulatorInstructionsCloseEvent extends Event {
  static type = 'simulatorInstructionsCloseEvent';
  constructor() {
    super(
        SimulatorInstructionsCloseEvent.type, {bubbles: true, composed: true});
  }
}
