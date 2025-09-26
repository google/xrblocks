import * as THREE from 'three';
import { WaitFrame } from '../../core/components/WaitFrame';
import { SimulatorUser } from '../SimulatorUser';
import { SimulatorUserAction } from './SimulatorUserAction';
/**
 * Represents a action to walk towards a panel or object.
 */
export declare class WalkTowardsPanelAction extends SimulatorUserAction {
    private target;
    static dependencies: {
        camera: typeof THREE.Camera;
        timer: typeof THREE.Timer;
    };
    camera: THREE.Camera;
    timer: THREE.Timer;
    constructor(target: THREE.Object3D);
    init({ camera, timer }: {
        camera: THREE.Camera;
        timer: THREE.Timer;
    }): Promise<void>;
    isLookingAtTarget(): boolean;
    isNearTarget(): boolean;
    lookAtTarget(): void;
    lookTowardsTarget(): void;
    moveTowardsTarget(): void;
    play({ simulatorUser, journeyId, waitFrame }: {
        simulatorUser: SimulatorUser;
        journeyId: number;
        waitFrame: WaitFrame;
    }): Promise<void>;
}
