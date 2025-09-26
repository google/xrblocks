import {clamp} from '../../utils/utils';

/**
 * A simple utility class for linearly animating a numeric value over
 * time. It clamps the value within a specified min/max range and updates it
 * based on a given speed.
 */
export class AnimatableNumber {
  constructor(
      public value = 0, public minValue = 0, public maxValue = 1,
      public speed = 1) {}

  /**
   * Updates the value based on the elapsed time.
   * @param deltaTimeSeconds - The time elapsed since the last update, in
   * seconds.
   */
  update(deltaTimeSeconds: number) {
    this.value = clamp(
        this.value + deltaTimeSeconds * this.speed, this.minValue,
        this.maxValue);
  }
}
