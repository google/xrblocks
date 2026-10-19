export class SetSimulatorTimeOfDayEvent extends Event {
  static type = 'setSimulatorTimeOfDay';
  constructor(public timeOfDay: number) {
    super(SetSimulatorTimeOfDayEvent.type, {bubbles: true, composed: true});
  }
}

export class SetSimulatorDayNightEvent extends Event {
  static type = 'setSimulatorDayNight';
  constructor(public enabled: boolean) {
    super(SetSimulatorDayNightEvent.type, {bubbles: true, composed: true});
  }
}
