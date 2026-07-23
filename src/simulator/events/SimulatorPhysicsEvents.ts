export class SetSimulatorHandPhysicsEvent extends Event {
  static type = 'setSimulatorHandPhysics';

  constructor(public enabled: boolean) {
    super(SetSimulatorHandPhysicsEvent.type, {
      bubbles: true,
      composed: true,
    });
  }
}
