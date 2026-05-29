/**
 * Temporary polyfill until Chrome 148 is rolled out more widely.
 * Converts a Temporal.Duration or Temporal.DurationLike to milliseconds.
 */
export function durationToMs(
  duration: Temporal.Duration | Temporal.DurationLike
): number {
  if (typeof Temporal !== 'undefined') {
    return Temporal.Duration.from(duration).total({unit: 'millisecond'});
  }

  // If duration is a string (ISO 8601) and native Temporal failed/is absent, fallback to 0
  if (typeof duration === 'string') {
    return 0;
  }

  let ms = 0;
  if (duration.milliseconds) ms += duration.milliseconds;
  if (duration.seconds) ms += duration.seconds * 1000;
  if (duration.minutes) ms += duration.minutes * 60 * 1000;
  if (duration.hours) ms += duration.hours * 60 * 60 * 1000;
  if (duration.days) ms += duration.days * 24 * 60 * 60 * 1000;
  if (duration.weeks) ms += duration.weeks * 7 * 24 * 60 * 60 * 1000;
  if (duration.months) ms += duration.months * 30 * 24 * 60 * 60 * 1000;
  if (duration.years) ms += duration.years * 365 * 24 * 60 * 60 * 1000;
  if (duration.microseconds) ms += duration.microseconds / 1000;
  if (duration.nanoseconds) ms += duration.nanoseconds / 1000000;
  return ms;
}
