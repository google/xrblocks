import {GestureConfiguration} from '../GestureRecognitionOptions';
import type {HandContext} from '../GestureTypes';
import {
  FINGER_ORDER,
  average,
  clamp01,
  estimateHandScale,
  getAdjacentFingerSpreads,
  getFingerCurl,
  getFingerPalmAlignment,
  getFingerSpread,
  getFingerStraightness,
  getFingertipDistance,
  getFingertipPalmDistance,
  getPalmWidth,
  getThumbOpposition,
  getThumbStraightness,
  getThumbVerticalDirection,
} from '../HandPoseMetrics';

const EPSILON = 1e-6;

export function detectPinch(
  context: HandContext,
  config: GestureConfiguration
) {
  const distance = getFingertipDistance(context, 'thumb', 'index');
  if (distance === null || !Number.isFinite(distance)) return undefined;

  const scale = getPalmWidth(context) ?? estimateHandScale(context);
  if (scale < EPSILON) return {confidence: 0};

  const threshold = Math.max(config.threshold ?? 0, scale * 0.32, 0.025);
  const distanceScore = clamp01(
    (threshold * 1.8 - distance) / (threshold * 1.2)
  );
  const supportExtension = average(
    (['middle', 'ring', 'pinky'] as const).map((finger) =>
      getFingerStraightness(context, finger)
    )
  );
  const supportPenalty = clamp01((supportExtension - 0.55) / 0.45);
  const confidence = clamp01(distanceScore * (1 - supportPenalty * 0.35));

  return {
    confidence,
    data: {distance, threshold, supportPenalty},
  };
}

export function detectOpenPalm(
  context: HandContext,
  config: GestureConfiguration
) {
  const straightnessScores = FINGER_ORDER.map((finger) =>
    getFingerStraightness(context, finger)
  );
  const extensionScores = FINGER_ORDER.map((finger) =>
    getFingerExtensionScore(context, finger)
  );
  const straightness = average(straightnessScores);
  const extension = average(extensionScores);
  const allFingersStraight = Math.min(...straightnessScores);
  const allFingersExtended = Math.min(...extensionScores);
  const palmAlignment = average(
    FINGER_ORDER.map((finger) => getFingerPalmAlignment(context, finger))
  );
  const spread = getTipSpreadScore(context);
  const openGate = Math.min(allFingersStraight, allFingersExtended);

  const confidence = clamp01(
    openGate *
      (straightness * 0.3 +
        extension * 0.35 +
        spread * 0.15 +
        palmAlignment * 0.2)
  );

  return {
    confidence,
    data: {
      straightness,
      extension,
      allFingersStraight,
      allFingersExtended,
      openGate,
      palmAlignment,
      spread,
      threshold: config.threshold,
    },
  };
}

export function detectFist(context: HandContext, config: GestureConfiguration) {
  const closedScores = FINGER_ORDER.map((finger) =>
    getFingerClosedScore(context, finger)
  );
  const closed = average(closedScores);
  const scale = getPalmWidth(context) ?? estimateHandScale(context);
  const palmDistances = FINGER_ORDER.map((finger) =>
    getFingertipPalmDistance(context, finger)
  ).filter((distance): distance is number => distance !== null);
  const palmDistanceAverage = average(palmDistances);
  const palmDistanceScore =
    scale > EPSILON ? clamp01(1 - palmDistanceAverage / (scale * 1.35)) : 0;
  const thumbWrap = Math.max(
    getThumbOpposition(context, 'index'),
    getThumbOpposition(context, 'middle')
  );
  const thumbStraightness = getThumbStraightness(context);
  const thumbVertical = getThumbVerticalDirection(context);
  const verticalThumbPenalty =
    thumbStraightness * clamp01((Math.abs(thumbVertical) - 0.25) / 0.5);

  const baseConfidence = clamp01(
    closed * 0.7 + palmDistanceScore * 0.2 + thumbWrap * 0.1
  );
  const confidence = clamp01(
    baseConfidence * (1 - verticalThumbPenalty * 0.85)
  );

  return {
    confidence,
    data: {
      closed,
      palmDistanceScore,
      thumbWrap,
      thumbStraightness,
      thumbVertical,
      verticalThumbPenalty,
      threshold: config.threshold,
    },
  };
}

export function detectThumbsUp(
  context: HandContext,
  config: GestureConfiguration
) {
  const thumbStraightness = getThumbStraightness(context);
  const thumbVertical = clamp01(
    (getThumbVerticalDirection(context) - 0.35) / 0.5
  );
  const otherCurl = average(
    FINGER_ORDER.map((finger) => getFingerClosedScore(context, finger))
  );
  const indexDistance = getFingertipDistance(context, 'thumb', 'index');
  const scale = getPalmWidth(context) ?? estimateHandScale(context);
  const separation =
    indexDistance !== null && scale > EPSILON
      ? clamp01((indexDistance - scale * 0.65) / (scale * 0.5))
      : 0;
  const thumbWrapPenalty = Math.max(
    getThumbOpposition(context, 'index'),
    getThumbOpposition(context, 'middle')
  );
  const thumbPose = thumbStraightness * thumbVertical;

  const confidence = clamp01(
    thumbPose *
      (otherCurl * 0.45 + separation * 0.35 + (1 - thumbWrapPenalty) * 0.2)
  );

  return {
    confidence,
    data: {
      thumbStraightness,
      thumbVertical,
      otherCurl,
      separation,
      thumbWrapPenalty,
      threshold: config.threshold,
    },
  };
}

export function detectThumbsDown(
  context: HandContext,
  config: GestureConfiguration
) {
  const thumbStraightness = getThumbStraightness(context);
  const thumbVertical = clamp01(
    (-getThumbVerticalDirection(context) - 0.35) / 0.5
  );
  const otherCurl = average(
    FINGER_ORDER.map((finger) => getFingerClosedScore(context, finger))
  );
  const indexDistance = getFingertipDistance(context, 'thumb', 'index');
  const scale = getPalmWidth(context) ?? estimateHandScale(context);
  const separation =
    indexDistance !== null && scale > EPSILON
      ? clamp01((indexDistance - scale * 0.65) / (scale * 0.5))
      : 0;
  const thumbWrapPenalty = Math.max(
    getThumbOpposition(context, 'index'),
    getThumbOpposition(context, 'middle')
  );
  const thumbPose = thumbStraightness * thumbVertical;

  const confidence = clamp01(
    thumbPose *
      (otherCurl * 0.45 + separation * 0.35 + (1 - thumbWrapPenalty) * 0.2)
  );

  return {
    confidence,
    data: {
      thumbStraightness,
      thumbVertical,
      otherCurl,
      separation,
      thumbWrapPenalty,
      threshold: config.threshold,
    },
  };
}

export function detectPoint(
  context: HandContext,
  config: GestureConfiguration
) {
  const indexStraightness = getFingerStraightness(context, 'index');
  const indexAlignment = getFingerPalmAlignment(context, 'index');
  const indexExtension = getFingerExtensionScore(context, 'index');
  const middleClosed = getFingerClosedScore(context, 'middle');
  const ringClosed = getFingerClosedScore(context, 'ring');
  const pinkyClosed = getFingerClosedScore(context, 'pinky');
  const otherCurl = average([middleClosed, ringClosed, pinkyClosed]);
  const allOtherFingersClosed = Math.min(middleClosed, ringClosed, pinkyClosed);
  const indexPose = average([
    indexStraightness,
    indexExtension,
    Math.max(indexAlignment, 0.5),
  ]);

  const confidence = clamp01(
    indexPose * (otherCurl * 0.65 + allOtherFingersClosed * 0.35)
  );

  return {
    confidence,
    data: {
      indexStraightness,
      indexExtension,
      indexAlignment,
      otherCurl,
      allOtherFingersClosed,
      threshold: config.threshold,
    },
  };
}

function getFingerClosedScore(
  context: HandContext,
  finger: (typeof FINGER_ORDER)[number]
) {
  return Math.max(
    getFingerCurl(context, finger),
    1 - getFingerExtensionScore(context, finger)
  );
}

function getFingerExtensionScore(
  context: HandContext,
  finger: (typeof FINGER_ORDER)[number]
) {
  const distance = getFingertipPalmDistance(context, finger);
  const scale = getPalmWidth(context) ?? estimateHandScale(context);
  if (distance === null || scale < EPSILON) return 0;
  return clamp01((distance - scale * 0.45) / (scale * 0.85));
}

export function detectSpread(
  context: HandContext,
  config: GestureConfiguration
) {
  const straightnessScores = FINGER_ORDER.map((finger) =>
    getFingerStraightness(context, finger)
  );
  const extensionScores = FINGER_ORDER.map((finger) =>
    getFingerExtensionScore(context, finger)
  );
  const straightness = average(straightnessScores);
  const extension = average(extensionScores);
  const allFingersStraight = Math.min(...straightnessScores);
  const allFingersExtended = Math.min(...extensionScores);
  const adjacentSpreads = getAdjacentFingerSpreads(context);
  const directionSpread = average(Object.values(adjacentSpreads));
  const tipSpread = getTipSpreadScore(context);
  const spread = Math.max(directionSpread, tipSpread);
  const palmAlignment = average(
    FINGER_ORDER.map((finger) => getFingerPalmAlignment(context, finger))
  );
  const indexPinkySpread = getFingerSpread(context, 'index', 'pinky');
  const openGate = average([allFingersStraight, allFingersExtended]);

  const confidence = clamp01(
    openGate *
      (straightness * 0.2 +
        extension * 0.2 +
        spread * 0.45 +
        Math.max(indexPinkySpread, palmAlignment) * 0.15)
  );

  return {
    confidence,
    data: {
      straightness,
      extension,
      allFingersStraight,
      allFingersExtended,
      openGate,
      spread,
      indexPinkySpread,
      palmAlignment,
      threshold: config.threshold,
    },
  };
}

function getTipSpreadScore(context: HandContext) {
  const scale = getPalmWidth(context) ?? estimateHandScale(context);
  if (scale < EPSILON) return 0;

  const distances = [
    getFingertipDistance(context, 'index', 'middle'),
    getFingertipDistance(context, 'middle', 'ring'),
    getFingertipDistance(context, 'ring', 'pinky'),
  ].filter((distance): distance is number => distance !== null);

  if (!distances.length) return 0;
  return clamp01((average(distances) - scale * 0.25) / (scale * 0.45));
}
