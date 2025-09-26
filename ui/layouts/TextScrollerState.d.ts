import * as THREE from 'three';
import { Script } from '../../core/Script.js';
/**
 * Manages the state and animation logic for a scrolling text view.
 * It tracks the total number of lines, the current scroll position (as a line
 * number), and the target line, smoothly animating between them over time.
 */
export declare class TextScrollerState extends Script {
    static dependencies: {
        timer: typeof THREE.Timer;
    };
    scrollSpeedLinesPerSecond: number;
    lines: number;
    currentLine: number;
    targetLine: number;
    shouldUpdate: boolean;
    timer: THREE.Timer;
    lineCount: number;
    init({ timer }: {
        timer: THREE.Timer;
    }): void;
    update(): false | undefined;
}
