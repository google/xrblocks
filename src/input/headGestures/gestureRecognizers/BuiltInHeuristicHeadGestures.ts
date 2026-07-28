import * as THREE from 'three';

import type {
  HeadGestureConfiguration,
  HeadGestureContext,
  HeadGestureDetectionResult,
} from '../HeadGestureTypes';

export type HeuristicHeadGestureRecognizerOptions = {
  minimumGestureDurationMs: number;
  maximumGestureDurationMs: number;
  maximumOffAxisRatio: number;
  quietPrefixDurationMs: number;
  detectionHoldMs: number;
  returnToleranceFactor: number;
  smoothingTimeConstantMs: number;
  minimumPathEfficiency: number;
  minimumPeakAngularSpeed: number;
};

type MotionPoint = {
  timestamp: number;
  pitch: number;
  yaw: number;
  roll: number;
};

type MotionAxis = 'pitch' | 'yaw';

const RELATIVE_ORIENTATION = new THREE.Quaternion();
const INVERSE_BASELINE = new THREE.Quaternion();
const EULER = new THREE.Euler(0, 0, 0, 'YXZ');

export function detectNod(
  context: HeadGestureContext,
  config: HeadGestureConfiguration,
  options: HeuristicHeadGestureRecognizerOptions
): HeadGestureDetectionResult | undefined {
  const threshold = config.threshold ?? THREE.MathUtils.degToRad(12);
  const series = buildMotionSeries(context, options);
  if (!series) return;

  return findSingleExcursion(series, 'pitch', threshold, options, (value) =>
    value >= 0 ? 'up' : 'down'
  );
}

export function detectShake(
  context: HeadGestureContext,
  config: HeadGestureConfiguration,
  options: HeuristicHeadGestureRecognizerOptions
): HeadGestureDetectionResult | undefined {
  const threshold = config.threshold ?? THREE.MathUtils.degToRad(10);
  const series = buildMotionSeries(context, options);
  if (!series) return;

  return findSingleExcursion(series, 'yaw', threshold, options, (value) =>
    value >= 0 ? 'left' : 'right'
  );
}

function findSingleExcursion(
  series: MotionPoint[],
  axis: MotionAxis,
  threshold: number,
  options: HeuristicHeadGestureRecognizerOptions,
  directionLabel: (value: number) => string
) {
  const tolerance = threshold * options.returnToleranceFactor;
  const extrema = findExtrema(series, axis, threshold);
  let best:
    | {result: HeadGestureDetectionResult; completedAt: number}
    | undefined;

  for (const peakIndex of extrema) {
    const peakValue = series[peakIndex][axis];
    const startIndex = findLastNearBaseline(series, axis, peakIndex, tolerance);
    const endIndex = findFirstNearBaseline(series, axis, peakIndex, tolerance);
    if (startIndex === undefined || endIndex === undefined) continue;

    const durationMs =
      series[endIndex].timestamp - series[startIndex].timestamp;
    if (!validDuration(durationMs, options)) continue;
    if (
      series.at(-1)!.timestamp - series[endIndex].timestamp >
      options.detectionHoldMs
    ) {
      continue;
    }

    const amplitude = Math.abs(peakValue);
    const offAxis = maximumAbsoluteValue(
      series,
      startIndex,
      endIndex,
      axis === 'pitch' ? ['yaw', 'roll'] : ['pitch', 'roll']
    );
    const offAxisRatio = offAxis / amplitude;
    if (offAxisRatio > options.maximumOffAxisRatio) continue;

    const expectedVariation =
      Math.abs(peakValue - series[startIndex][axis]) +
      Math.abs(series[endIndex][axis] - peakValue);
    const actualVariation = totalVariation(series, axis, startIndex, endIndex);
    const pathEfficiency = expectedVariation / Math.max(actualVariation, 1e-6);
    if (pathEfficiency < options.minimumPathEfficiency) continue;

    const peakAngularSpeed = getPeakAngularSpeed(
      series,
      axis,
      startIndex,
      endIndex
    );
    if (peakAngularSpeed < options.minimumPeakAngularSpeed) continue;

    const confidence = scoreCandidate({
      amplitude,
      threshold,
      durationMs,
      returnError: Math.abs(series[endIndex][axis]),
      returnTolerance: tolerance,
      offAxisRatio,
      pathEfficiency,
      peakAngularSpeed,
      options,
    });
    const completedAt = series[endIndex].timestamp;
    const result: HeadGestureDetectionResult = {
      confidence,
      data: {
        amplitudeRadians: amplitude,
        durationMs,
        peakAngularSpeed,
        initialDirection: directionLabel(peakValue),
      },
    };
    if (!best || completedAt > best.completedAt) {
      best = {result, completedAt};
    }
  }

  return best?.result;
}

function buildMotionSeries(
  context: HeadGestureContext,
  options: HeuristicHeadGestureRecognizerOptions
) {
  const samples = context.samples;
  if (samples.length < 5) return;
  const totalDuration = samples.at(-1)!.timestamp - samples[0].timestamp;
  if (
    totalDuration <
    options.quietPrefixDurationMs + options.minimumGestureDurationMs
  ) {
    return;
  }

  const quietEnd = samples[0].timestamp + options.quietPrefixDurationMs;
  const quietSamples = samples.filter((sample) => sample.timestamp <= quietEnd);
  if (quietSamples.length < 2) return;

  const baseline = quietSamples[0].orientation.clone();
  for (let i = 1; i < quietSamples.length; i++) {
    baseline.slerp(quietSamples[i].orientation, 1 / (i + 1));
  }
  INVERSE_BASELINE.copy(baseline).invert();

  const series: MotionPoint[] = [];
  let previous: MotionPoint | undefined;
  for (const sample of samples) {
    RELATIVE_ORIENTATION.copy(INVERSE_BASELINE).multiply(sample.orientation);
    EULER.setFromQuaternion(RELATIVE_ORIENTATION, 'YXZ');
    const point: MotionPoint = {
      timestamp: sample.timestamp,
      pitch: EULER.x,
      yaw: EULER.y,
      roll: EULER.z,
    };

    if (previous) {
      const elapsed = Math.max(0, point.timestamp - previous.timestamp);
      const alpha = elapsed / (options.smoothingTimeConstantMs + elapsed || 1);
      point.pitch = THREE.MathUtils.lerp(previous.pitch, point.pitch, alpha);
      point.yaw = THREE.MathUtils.lerp(previous.yaw, point.yaw, alpha);
      point.roll = THREE.MathUtils.lerp(previous.roll, point.roll, alpha);
    }
    series.push(point);
    previous = point;
  }

  return series;
}

function findExtrema(
  series: MotionPoint[],
  axis: MotionAxis,
  threshold: number
) {
  const extrema: number[] = [];
  for (let i = 1; i < series.length - 1; i++) {
    const previous = series[i - 1][axis];
    const current = series[i][axis];
    const next = series[i + 1][axis];
    const isMaximum = current >= previous && current > next;
    const isMinimum = current <= previous && current < next;
    if ((isMaximum || isMinimum) && Math.abs(current) >= threshold) {
      extrema.push(i);
    }
  }
  return extrema;
}

function findLastNearBaseline(
  series: MotionPoint[],
  axis: MotionAxis,
  before: number,
  tolerance: number
) {
  for (let i = before - 1; i >= 0; i--) {
    if (Math.abs(series[i][axis]) <= tolerance) return i;
  }
}

function findFirstNearBaseline(
  series: MotionPoint[],
  axis: MotionAxis,
  after: number,
  tolerance: number
) {
  for (let i = after + 1; i < series.length; i++) {
    if (Math.abs(series[i][axis]) <= tolerance) return i;
  }
}

function validDuration(
  durationMs: number,
  options: HeuristicHeadGestureRecognizerOptions
) {
  return (
    durationMs >= options.minimumGestureDurationMs &&
    durationMs <= options.maximumGestureDurationMs
  );
}

function maximumAbsoluteValue(
  series: MotionPoint[],
  start: number,
  end: number,
  axes: Array<keyof Pick<MotionPoint, 'pitch' | 'yaw' | 'roll'>>
) {
  let maximum = 0;
  for (let i = start; i <= end; i++) {
    for (const axis of axes) {
      maximum = Math.max(maximum, Math.abs(series[i][axis]));
    }
  }
  return maximum;
}

function totalVariation(
  series: MotionPoint[],
  axis: MotionAxis,
  start: number,
  end: number
) {
  let variation = 0;
  for (let i = start + 1; i <= end; i++) {
    variation += Math.abs(series[i][axis] - series[i - 1][axis]);
  }
  return variation;
}

function getPeakAngularSpeed(
  series: MotionPoint[],
  axis: MotionAxis,
  start: number,
  end: number
) {
  let peak = 0;
  for (let i = start + 1; i <= end; i++) {
    const elapsedSeconds =
      (series[i].timestamp - series[i - 1].timestamp) / 1000;
    if (elapsedSeconds <= 0) continue;
    peak = Math.max(
      peak,
      Math.abs(series[i][axis] - series[i - 1][axis]) / elapsedSeconds
    );
  }
  return peak;
}

function scoreCandidate({
  amplitude,
  threshold,
  durationMs,
  returnError,
  returnTolerance,
  offAxisRatio,
  pathEfficiency,
  peakAngularSpeed,
  options,
}: {
  amplitude: number;
  threshold: number;
  durationMs: number;
  returnError: number;
  returnTolerance: number;
  offAxisRatio: number;
  pathEfficiency: number;
  peakAngularSpeed: number;
  options: HeuristicHeadGestureRecognizerOptions;
}) {
  const midpoint =
    (options.minimumGestureDurationMs + options.maximumGestureDurationMs) / 2;
  const halfRange =
    (options.maximumGestureDurationMs - options.minimumGestureDurationMs) / 2;
  const scores = [
    quality((amplitude - threshold) / Math.max(threshold, 1e-6)),
    quality(1 - Math.abs(durationMs - midpoint) / Math.max(halfRange, 1)),
    quality(1 - returnError / Math.max(returnTolerance, 1e-6)),
    quality(1 - offAxisRatio / options.maximumOffAxisRatio),
    quality(
      (pathEfficiency - options.minimumPathEfficiency) /
        (1 - options.minimumPathEfficiency)
    ),
    quality(
      (peakAngularSpeed - options.minimumPeakAngularSpeed) /
        options.minimumPeakAngularSpeed
    ),
  ];
  const product = scores.reduce((value, score) => value * score, 1);
  return THREE.MathUtils.clamp(product ** (1 / scores.length), 0, 1);
}

function quality(value: number) {
  return 0.6 + 0.4 * THREE.MathUtils.clamp(value, 0, 1);
}
