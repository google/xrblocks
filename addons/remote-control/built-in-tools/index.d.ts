import type { EmbodiedControl } from '../../embodied-control';
import { type RemoteControlActionToolDependencies } from './ActionTools';
import { type RemoteControlObservationToolDependencies } from './ObservationTools';
import type { RemoteControlBuiltInTool } from './Types';
export * from './ActionTools';
export * from './ObservationTools';
export * from './Types';
export type RemoteControlBuiltInToolDependencies = RemoteControlObservationToolDependencies & {
    embodiedControl: EmbodiedControl;
} & Pick<RemoteControlActionToolDependencies, 'resolveTarget'>;
export declare function createRemoteControlBuiltInTools(dependencies: RemoteControlBuiltInToolDependencies): RemoteControlBuiltInTool[];
