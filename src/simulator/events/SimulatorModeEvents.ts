import {SimulatorMode} from '../SimulatorOptions';

export class SetSimulatorModeEvent extends Event {
  static type = 'setSimulatorMode';
  constructor(public simulatorMode: SimulatorMode) {
    super(SetSimulatorModeEvent.type, {bubbles: true, composed: true});
  }
}
