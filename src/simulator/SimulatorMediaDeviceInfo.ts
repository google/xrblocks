export class SimulatorMediaDeviceInfo {
  constructor(
      public deviceId = 'simulator', public groupId = 'simulator',
      public kind: MediaDeviceKind = 'videoinput',
      public label = 'Simulator Camera') {}
}
