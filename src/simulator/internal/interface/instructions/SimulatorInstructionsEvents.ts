export class SimulatorInstructionsNextEvent extends Event {
  static readonly type = 'simulatorInstructionsNextEvent';
  constructor() {
    super(SimulatorInstructionsNextEvent.type, {bubbles: true, composed: true});
  }
}

export class SimulatorInstructionsCloseEvent extends Event {
  static readonly type = 'simulatorInstructionsCloseEvent';
  constructor() {
    super(SimulatorInstructionsCloseEvent.type, {
      bubbles: true,
      composed: true,
    });
  }
}
