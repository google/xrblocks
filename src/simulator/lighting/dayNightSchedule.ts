import * as THREE from 'three';

/**
 * Plain-number output of {@link dayNightSchedule}: all curves for one time of
 * day in the baked day/night cycle. Colors are [r, g, b] tuples in 0..1 space
 * and positions are [x, y, z] world-space tuples.
 */
export interface DayNightScheduleValues {
  /** Clamped input time (0 = day endpoint, 1 = night endpoint). */
  t: number;
  /** Day bake -> night bake crossfade weight. */
  mixU: number;
  /** 1 while the day half is on, 0 by sunset. */
  dayness: number;
  /** Sun elevation/azimuth in radians. */
  elevation: number;
  azimuth: number;
  sunPosition: [number, number, number];
  sunIntensity: number;
  warmth: number;
  sunColor: [number, number, number];
  bouncePosition: [number, number, number];
  bounceIntensity: number;
  bounceColor: [number, number, number];
  skyFillIntensity: number;
  skyFillColor: [number, number, number];
  /** Roller-shade hardware opacity (0 = no hardware at all). */
  blindsHardware: number;
  /** Roller-shade roll-down amount. */
  blindsRoll: number;
  /** Day-only rug opacity. */
  rugOpacity: number;
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Time-of-day controller curves, ported verbatim from the validated day/night
 * spike. The base is the day/night bake crossfade (mixU); the moving sun lives
 * in an additive layer on top whose strength is ZERO at both endpoints, so t=0
 * and t=1 render the raw bakes exactly. Every additive term also dies at
 * sunset so nothing paints washes over the night bake's baked lamp gradients.
 */
export function dayNightSchedule(tRaw: number): DayNightScheduleValues {
  const t = Math.min(1, Math.max(0, tRaw));
  // Base: day bake -> night bake (narrow: the two bakes superimpose
  // incompatible baked gradients during the crossfade).
  const mixU = smoothstep(0.38, 0.62, t);
  // Sun arc: aligned with the day bake's baked patch at t=0, then moves.
  // Additive strength tracks mixU: the real sun REPLACES the baked sun exactly
  // as the day bake fades out - never doubles it.
  const dayness = 1 - smoothstep(0.45, 0.62, t);
  const elevation = THREE.MathUtils.degToRad(50 - 48 * smoothstep(0.0, 0.8, t));
  const azimuth = THREE.MathUtils.degToRad(-50 + 95 * t);
  const r = 30;
  const sunPosition: [number, number, number] = [
    Math.cos(elevation) * Math.cos(azimuth) * r,
    Math.sin(elevation) * r,
    Math.cos(elevation) * Math.sin(azimuth) * r,
  ];
  const sunIntensity = 0.35 * mixU * dayness;
  const warmth = smoothstep(0.35, 0.8, t);
  const sunColor: [number, number, number] = [
    1,
    1 - 0.35 * warmth,
    1 - 0.72 * warmth,
  ];
  // Bounce: low directional flood from the sun's azimuth, transition only.
  const bElev = THREE.MathUtils.degToRad(20);
  const bouncePosition: [number, number, number] = [
    Math.cos(bElev) * Math.cos(azimuth) * r,
    Math.sin(bElev) * r,
    Math.cos(bElev) * Math.sin(azimuth) * r,
  ];
  const bounceIntensity = 0.25 * mixU * (1 - smoothstep(0.45, 0.62, t));
  const bounceColor: [number, number, number] = [
    1,
    0.97 - 0.12 * warmth,
    0.9 - 0.3 * warmth,
  ];
  // Faint corner lift during the dark half only (endpoints stay pure - the
  // night endpoint is exactly the bake, a visible dark-brown interior, not
  // crushed black).
  const skyFillIntensity = 0.05 * mixU * (1 - smoothstep(0.5, 0.68, t));
  const skyFillColor: [number, number, number] = [
    0.55 - 0.4 * warmth,
    0.66 - 0.5 * warmth,
    0.88 - 0.56 * warmth,
  ];
  // Rolling blinds: hardware fades in just as the roll starts.
  const blindsHardware = smoothstep(0.47, 0.56, t);
  const blindsRoll = smoothstep(0.5, 0.82, t);
  // Day-only rug fades out before the night half.
  const rugOpacity = 1 - smoothstep(0.3, 0.65, t);
  return {
    t,
    mixU,
    dayness,
    elevation,
    azimuth,
    sunPosition,
    sunIntensity,
    warmth,
    sunColor,
    bouncePosition,
    bounceIntensity,
    bounceColor,
    skyFillIntensity,
    skyFillColor,
    blindsHardware,
    blindsRoll,
    rugOpacity,
  };
}
