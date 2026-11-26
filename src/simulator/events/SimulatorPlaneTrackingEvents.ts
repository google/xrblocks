import type {SimulatorPlaneTrackingMode} from '../SimulatorOptions';

export class SetSimulatorPlaneTrackingModeEvent extends Event {
  static type = 'setSimulatorPlaneTrackingMode';
  constructor(public mode: SimulatorPlaneTrackingMode) {
    super(SetSimulatorPlaneTrackingModeEvent.type, {
      bubbles: true,
      composed: true,
    });
  }
}
