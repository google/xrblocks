import {Simulator} from '../Simulator';

import {SimulatorUserAction} from './SimulatorUserAction';

export class ShowHandsAction extends SimulatorUserAction {
  static dependencies = {simulator: Simulator};
  simulator!: Simulator;

  async init({simulator}: {simulator: Simulator}) {
    this.simulator = simulator;
  }

  async play() {
    if (this.simulator.hands) {
      this.simulator.hands.showHands();
    }
  }
}
