import * as THREE from 'three';
import { Script } from '../../core/Script.js';
/**
 * A state management class for a `Pager` component. It tracks the
 * total number of pages, the current scroll position, and handles the physics
 * and animation logic for smooth, inertia-based scrolling between pages.
 */
export declare class PagerState extends Script {
    static dependencies: {
        timer: typeof THREE.Timer;
    };
    currentPage: number;
    shouldUpdate: boolean;
    pages: number;
    timer: THREE.Timer;
    constructor({ pages }: {
        pages?: number | undefined;
    });
    init({ timer }: {
        timer: THREE.Timer;
    }): void;
    update(): false | undefined;
    addPage(): number;
}
