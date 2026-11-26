import type {
  SimulatorEnvironment,
  SimulatorMode,
  SimulatorPlaneTrackingMode,
} from '../SimulatorOptions.js';

export interface ISimulatorSettingsPanelElement extends HTMLElement {
  environments: SimulatorEnvironment[];
  activeEnvironmentIndex: number;
  simulatorMode: SimulatorMode;
  instructionsEnabled?: boolean;
  handPhysicsAvailable: boolean;
  handPhysicsEnabled: boolean;
  dayNightAvailable: boolean;
  dayNightEnabled: boolean;
  timeOfDay: number;
  planeTrackingAvailable: boolean;
  planeTrackingMode: SimulatorPlaneTrackingMode;
}
