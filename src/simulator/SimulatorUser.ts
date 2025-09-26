import {Registry} from '../core/components/Registry.js';
import {WaitFrame} from '../core/components/WaitFrame.js';
import {Script} from '../core/Script.js';
import {callInitWithDependencyInjection} from '../utils/DependencyInjection';

import {SimulatorUserAction} from './userActions/SimulatorUserAction.js';

export class SimulatorUser extends Script {
  static dependencies = {waitFrame: WaitFrame, registry: Registry};
  journeyId = 0;
  waitFrame!: WaitFrame;
  registry!: Registry;

  constructor() {
    super();
  }

  init({waitFrame, registry}: {waitFrame: WaitFrame, registry: Registry}) {
    this.waitFrame = waitFrame;
    this.registry = registry;
  }

  stopJourney() {
    ++this.journeyId;
  }

  isOnJourneyId(id: number) {
    return id == this.journeyId;
  }

  async loadJourney(actions: SimulatorUserAction[]) {
    console.log('Load journey');
    const currentJourneyId = ++this.journeyId;
    for (let i = 0; this.isOnJourneyId(currentJourneyId) && i < actions.length;
         ++i) {
      callInitWithDependencyInjection(actions[i], this.registry, undefined);
      await actions[i].play({
        simulatorUser: this,
        journeyId: currentJourneyId,
        waitFrame: this.waitFrame
      });
    }
    console.log('Journey finished');
  }
}