import type {EmbodiedControl} from '../../embodied-control';
import {
  createRemoteControlActionTools,
  type RemoteControlActionToolDependencies,
} from './ActionTools';
import {
  createRemoteControlObservationTools,
  type RemoteControlObservationToolDependencies,
} from './ObservationTools';
import type {RemoteControlBuiltInTool} from './Types';

export * from './ActionTools';
export * from './ObservationTools';
export * from './Types';

export type RemoteControlBuiltInToolDependencies =
  RemoteControlObservationToolDependencies & {
    embodiedControl: EmbodiedControl;
  } & Pick<RemoteControlActionToolDependencies, 'resolveTarget'>;

export function createRemoteControlBuiltInTools(
  dependencies: RemoteControlBuiltInToolDependencies
): RemoteControlBuiltInTool[] {
  return [
    ...createRemoteControlActionTools(dependencies),
    ...createRemoteControlObservationTools(dependencies),
  ];
}
