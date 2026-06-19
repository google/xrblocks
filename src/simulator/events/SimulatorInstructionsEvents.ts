export class ShowSimulatorInstructionsEvent extends Event {
  static type = 'showSimulatorInstructions';
  constructor() {
    super(ShowSimulatorInstructionsEvent.type, {bubbles: true, composed: true});
  }
}
