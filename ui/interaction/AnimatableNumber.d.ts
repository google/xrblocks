/**
 * A simple utility class for linearly animating a numeric value over
 * time. It clamps the value within a specified min/max range and updates it
 * based on a given speed.
 */
export declare class AnimatableNumber {
    value: number;
    minValue: number;
    maxValue: number;
    speed: number;
    constructor(value?: number, minValue?: number, maxValue?: number, speed?: number);
    /**
     * Updates the value based on the elapsed time.
     * @param deltaTimeSeconds - The time elapsed since the last update, in
     * seconds.
     */
    update(deltaTimeSeconds: number): void;
}
