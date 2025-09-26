import * as THREE from 'three';
import { WaitFrame } from '../../core/components/WaitFrame';
import { Input } from '../../input/Input';
import { Simulator } from '../Simulator';
import { SimulatorControls } from '../SimulatorControls';
import { SimulatorUser } from '../SimulatorUser.js';
import { SimulatorUserAction } from './SimulatorUserAction';
export declare class PinchOnButtonAction extends SimulatorUserAction {
    private target;
    static dependencies: {
        simulator: typeof Simulator;
        camera: typeof THREE.Camera;
        timer: typeof THREE.Timer;
        input: typeof Input;
    };
    private simulator;
    private camera;
    private timer;
    private input;
    constructor(target: THREE.Object3D);
    init({ simulator, camera, timer, input }: {
        simulator: Simulator;
        camera: THREE.Camera;
        timer: THREE.Timer;
        input: Input;
    }): Promise<void>;
    controllerIsPointingAtButton(controls: SimulatorControls, camera: THREE.Camera): boolean;
    rotateControllerTowardsButton(controls: SimulatorControls, camera: THREE.Camera, deltaTime: number): void;
    pinchController(): void;
    play({ simulatorUser, journeyId, waitFrame }: {
        simulatorUser: SimulatorUser;
        journeyId: number;
        waitFrame: WaitFrame;
    }): Promise<void>;
}
