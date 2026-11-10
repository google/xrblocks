import * as THREE from 'three';

import {faceCameraSlerpAlpha} from '../../../utils/FaceCameraMath';
import {getUIElementKind, isUIElement} from '../../../ui/UIElement';
import {
  getResolvedUICardSize,
  measureUICardContentHeight,
  measureUICardMinContentWidth,
  type UICard,
} from '../../../ui/components/UICard';
import type {InteractionSourceState} from '../../InteractionTypes';
import {isFiniteVector, worldPositionToLocal} from '../ManipulationMath';
import {ManipulationAction, type ResizeSize} from '../ManipulationTypes';
import type {
  ManipulationDriver,
  ManipulationDriverSession,
  Proposal,
  ResizeBaseline,
} from './DriverTypes';

const DEFAULT_MIN_SIZE = 0.1;
/**
 * Default maximum card size per axis, in meters.
 * Source: Android XR `ResizableComponent` default maximum size.
 */
const DEFAULT_MAX_SIZE = 10;
// Meters. Sizes closer than this count as unchanged, both for reusing a
// content measurement and for leaving automatic dimensions alone.
const SIZE_EPSILON = 1e-4;
/**
 * With `overshoot`, the share of the pointer travel past a size limit that the
 * dragged edge still follows. Source: Android XR panel resize recordings.
 */
const RESIZE_OVERSHOOT_RATIO = 0.045;
/**
 * Farthest the dragged edge goes past a size limit, in meters.
 * Source: Android XR panel resize recordings.
 */
const RESIZE_OVERSHOOT_MAX = 0.021;

// Scratch objects for propose(); none of them is returned to a caller.
const _fixed = new THREE.Vector2();
const _offset = new THREE.Vector3();

const CARD_ANCHORS = {
  left: 0,
  bottom: 0,
  center: 0.5,
  right: 1,
  top: 1,
} as const;

/** Captures and proposes corner Resize data for `UICard` owners. */
export class ResizeDriver implements ManipulationDriver<ResizeBaseline> {
  readonly action = ManipulationAction.Resize;
  private readonly sessionCorners = new WeakMap<
    ManipulationDriverSession,
    THREE.Vector2
  >();

  constructor(private readonly timer?: THREE.Timer) {}

  capture(session: ManipulationDriverSession): ResizeBaseline | undefined {
    const card = asCard(session.owner);
    const options = session.config.resize;
    if (!card || !options) return undefined;
    const anchor = options.anchor ?? 'center';
    if (anchor !== 'center' && anchor !== 'opposite') return undefined;
    const smoothing = options.smoothing ?? 0;
    if (!Number.isFinite(smoothing) || smoothing < 0) return undefined;
    const minSize = resolveLimit(options.minSize, DEFAULT_MIN_SIZE);
    const maxSize = resolveLimit(options.maxSize, DEFAULT_MAX_SIZE);
    if (
      !minSize ||
      !maxSize ||
      minSize.width > maxSize.width ||
      minSize.height > maxSize.height
    ) {
      return undefined;
    }
    // Without an explicit minimum width, never go narrower than the content.
    let contentMinWidth = false;
    if (options.minSize?.width === undefined) {
      const content = measureUICardMinContentWidth(card);
      if (content !== undefined) {
        const floor = Math.min(Math.max(minSize.width, content), maxSize.width);
        contentMinWidth = floor > minSize.width;
        minSize.width = floor;
      }
    }
    const width =
      card.size.width === 'auto'
        ? getResolvedUICardSize(card)?.width
        : card.size.width;
    if (width === undefined) return undefined;
    // Automatic heights become fixed once resized, like Quest and Android XR
    // panels. Before the first layout there is no height to start from.
    const height =
      card.size.height === 'auto'
        ? (getResolvedUICardSize(card)?.height ?? 'auto')
        : card.size.height;
    if (!(width > 0) || (height !== 'auto' && !(height > 0))) {
      return undefined;
    }

    const matrixWorld = card.matrixWorld.clone();
    const inverseMatrixWorld = matrixWorld.clone().invert();
    if (!isFiniteMatrix(inverseMatrixWorld)) return undefined;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 0, 1).transformDirection(matrixWorld),
      new THREE.Vector3().setFromMatrixPosition(matrixWorld)
    );
    const baseline = {plane, inverseMatrixWorld};
    // Use the current pointer for the new delta baseline, and keep the corner
    // chosen when the session first started.
    const pointer =
      pointerOnPlane(session.primary.snapshot, baseline) ??
      session.primary.capture.point.clone().applyMatrix4(inverseMatrixWorld);
    const cardAnchor = new THREE.Vector2(
      CARD_ANCHORS[card.anchorX],
      CARD_ANCHORS[card.anchorY]
    );
    const centerX = (CARD_ANCHORS.center - cardAnchor.x) * width;
    const centerY =
      height === 'auto'
        ? pointer.y
        : (CARD_ANCHORS.center - cardAnchor.y) * height;
    let corner = this.sessionCorners.get(session)?.clone();
    if (!corner) {
      corner = new THREE.Vector2(
        pointer.x >= centerX ? 1 : 0,
        pointer.y >= centerY ? 1 : 0
      );
      this.sessionCorners.set(session, corner.clone());
    }
    return {
      action: this.action,
      width,
      height,
      matrixWorld,
      inverseMatrixWorld,
      plane,
      pointer,
      corner,
      cardAnchor,
      autoHeight: card.size.height === 'auto',
      autoWidth: card.size.width === 'auto',
      options: {
        anchor,
        minSize,
        maxSize,
        fitContent: options.minSize?.height === undefined,
        preserveAspectRatio: options.preserveAspectRatio === true,
        smoothing,
        overshoot: options.overshoot === true,
        contentMinWidth,
      },
    };
  }

  propose(
    session: ManipulationDriverSession,
    baseline: ResizeBaseline
  ): Proposal | undefined {
    const card = asCard(session.owner);
    const pointer = pointerOnPlane(session.primary.snapshot, baseline);
    if (!card || !pointer) return undefined;
    const {corner, options} = baseline;
    const fixed = fixedPoint(baseline, _fixed);

    let width = resizeAxis(
      baseline.width,
      pointer.x - baseline.pointer.x,
      corner.x,
      fixed.x,
      options.minSize.width,
      options.maxSize.width,
      options.overshoot && !options.contentMinWidth,
      options.overshoot
    );
    let height: number | 'auto' =
      baseline.height === 'auto'
        ? 'auto'
        : resizeAxis(
            baseline.height,
            pointer.y - baseline.pointer.y,
            corner.y,
            fixed.y,
            options.minSize.height,
            options.maxSize.height,
            options.overshoot,
            options.overshoot
          );
    const locked = options.preserveAspectRatio && baseline.height !== 'auto';
    if (locked && height !== 'auto') {
      // Follow whichever axis the pointer changed more, relative to its size.
      const widthRatio = width / baseline.width;
      const heightRatio = height / (baseline.height as number);
      const ratio = lockedRatio(
        Math.abs(Math.log(widthRatio)) >= Math.abs(Math.log(heightRatio))
          ? widthRatio
          : heightRatio,
        baseline
      );
      width = baseline.width * ratio;
      height = (baseline.height as number) * ratio;
    }
    if (height !== 'auto' && options.fitContent) {
      const content = contentHeight(card, baseline, width);
      const floor =
        content === undefined
          ? undefined
          : Math.min(content, options.maxSize.height);
      if (floor !== undefined && height < floor) {
        if (locked) {
          const ratio = lockedContentRatio(
            card,
            baseline,
            width / baseline.width,
            floor
          );
          width = baseline.width * ratio;
          height = (baseline.height as number) * ratio;
        } else {
          height = floor;
        }
      }
    }
    const smoothed = this.smoothSize(baseline, width, height);
    if (smoothed) ({width, height} = smoothed);
    return this.sizeProposal(session, card, baseline, width, height);
  }

  /**
   * Returns the proposal to commit when a drag ends. With `overshoot`, a size
   * past a limit snaps back to the limit at once.
   */
  release(
    session: ManipulationDriverSession,
    baseline: ResizeBaseline,
    proposal: Proposal
  ): Proposal {
    const card = asCard(session.owner);
    if (!card || !baseline.options.overshoot) return proposal;
    if (proposal.action !== this.action) return proposal;
    const {minSize, maxSize} = baseline.options;
    const width = clampToLimits(
      proposal.width,
      baseline.width,
      minSize.width,
      maxSize.width
    );
    const height =
      proposal.height === 'auto' || baseline.height === 'auto'
        ? proposal.height
        : clampToLimits(
            proposal.height,
            baseline.height,
            minSize.height,
            maxSize.height
          );
    if (width === proposal.width && height === proposal.height) {
      return proposal;
    }
    return (
      this.sizeProposal(session, card, baseline, width, height) ?? proposal
    );
  }

  private sizeProposal(
    session: ManipulationDriverSession,
    card: UICard,
    baseline: ResizeBaseline,
    width: number,
    height: number | 'auto'
  ): Proposal | undefined {
    const {cardAnchor} = baseline;
    const fixed = fixedPoint(baseline, _fixed);
    // Move the card origin so the fixed point keeps its baseline world position.
    const offset = _offset.set(
      (fixed.x - cardAnchor.x) * (baseline.width - width),
      height === 'auto' || baseline.height === 'auto'
        ? 0
        : (fixed.y - cardAnchor.y) * (baseline.height - height),
      0
    );
    const worldPosition = offset.applyMatrix4(baseline.matrixWorld);
    const parent = session.owner.parent;
    parent?.updateWorldMatrix(true, false);
    const position = worldPositionToLocal(worldPosition, parent?.matrixWorld);
    if (!Number.isFinite(width) || !isFiniteVector(position)) return undefined;
    if (height !== 'auto' && !Number.isFinite(height)) return undefined;

    const unchanged =
      (baseline.autoWidth || baseline.autoHeight) &&
      Math.abs(width - baseline.width) < SIZE_EPSILON &&
      (height === 'auto' ||
        Math.abs(height - (baseline.height as number)) < SIZE_EPSILON);
    const proposedHeight = unchanged && baseline.autoHeight ? 'auto' : height;
    return {
      action: this.action,
      width,
      height: proposedHeight,
      position,
      apply: () => {
        if (unchanged) return;
        if (card.size.width !== width) card.size.width = width;
        if (proposedHeight !== 'auto' && card.size.height !== proposedHeight) {
          card.size.height = proposedHeight;
        }
        session.owner.position.copy(position);
      },
    };
  }

  /**
   * Eases the proposed size from the last smoothed size, stepping once per
   * frame, and returns the baseline's smoothed size. Without smoothing or a
   * timer it returns undefined, and the size is used unchanged.
   */
  private smoothSize(
    baseline: ResizeBaseline,
    width: number,
    height: number | 'auto'
  ): Readonly<{width: number; height: number | 'auto'}> | undefined {
    if (!baseline.options.smoothing || !this.timer) return undefined;
    const smoothed = (baseline.smoothedSize ??= {
      width: baseline.width,
      height: baseline.height,
    });
    const time = this.timer.getElapsed();
    if (baseline.smoothingTime !== time) {
      baseline.smoothingTime = time;
      const alpha = faceCameraSlerpAlpha(
        baseline.options.smoothing,
        this.timer.getDelta()
      );
      smoothed.width += (width - smoothed.width) * alpha;
      smoothed.height =
        height === 'auto' || smoothed.height === 'auto'
          ? height
          : smoothed.height + (height - smoothed.height) * alpha;
    }
    return smoothed;
  }
}

/** Measures the content height at `width`, reusing the last measurement. */
function contentHeight(
  card: UICard,
  baseline: ResizeBaseline,
  width: number
): number | undefined {
  const cached = baseline.contentFloor;
  if (cached && Math.abs(cached.width - width) < SIZE_EPSILON) {
    return cached.height;
  }
  const height = measureUICardContentHeight(card, width);
  baseline.contentFloor = {width, height};
  return height;
}

/**
 * Finds the smallest aspect-locked ratio between `lower` and the `floor` ratio
 * at which the card height still fits its content at that width.
 */
function lockedContentRatio(
  card: UICard,
  baseline: ResizeBaseline,
  lower: number,
  floor: number
): number {
  const baseHeight = baseline.height as number;
  const maxHeight = baseline.options.maxSize.height;
  let high = lockedRatio(floor / baseHeight, baseline);
  let low = Math.min(lower, high);
  const fitsAt = (ratio: number) => {
    const measured = contentHeight(card, baseline, baseline.width * ratio);
    const needed = measured === undefined ? 0 : Math.min(measured, maxHeight);
    return baseHeight * ratio >= needed - SIZE_EPSILON;
  };
  if (!fitsAt(high)) return high;
  while ((high - low) * baseline.width > SIZE_EPSILON) {
    const middle = (low + high) / 2;
    if (fitsAt(middle)) high = middle;
    else low = middle;
  }
  return high;
}

/** Clamps a uniform resize ratio so both axes stay within their limits. */
function lockedRatio(ratio: number, baseline: ResizeBaseline): number {
  const height = baseline.height as number;
  const {minSize, maxSize} = baseline.options;
  const lower = Math.min(
    1,
    Math.max(minSize.width / baseline.width, minSize.height / height)
  );
  const upper = Math.max(
    1,
    Math.min(maxSize.width / baseline.width, maxSize.height / height)
  );
  return THREE.MathUtils.clamp(ratio, lower, upper);
}

function asCard(owner: THREE.Object3D): UICard | undefined {
  return isUIElement(owner) && getUIElementKind(owner) === 'card'
    ? (owner as UICard)
    : undefined;
}

/**
 * Writes the normalized card coordinates of the point kept fixed while
 * resizing into `target`.
 */
function fixedPoint(
  baseline: ResizeBaseline,
  target: THREE.Vector2
): THREE.Vector2 {
  const {corner, options} = baseline;
  return options.anchor === 'center'
    ? target.set(CARD_ANCHORS.center, CARD_ANCHORS.center)
    : target.set(1 - corner.x, 1 - corner.y);
}

/**
 * Resizes one axis by a pointer delta. A limit marked soft lets the dragged
 * edge overshoot it slightly instead of stopping there.
 */
function resizeAxis(
  size: number,
  delta: number,
  corner: number,
  fixed: number,
  minimum: number,
  maximum: number,
  softMinimum: boolean,
  softMaximum: boolean
): number {
  const span = Math.abs(corner - fixed);
  const direction = corner === 1 ? 1 : -1;
  const next = size + (direction * delta) / span;
  const limited = clampToLimits(next, size, minimum, maximum);
  const soft = next > limited ? softMaximum : softMinimum;
  if (!soft || next === limited) return limited;
  // The dragged edge moves `span` times as far as the size changes.
  const edge = Math.min(
    RESIZE_OVERSHOOT_RATIO * Math.abs(next - limited) * span,
    RESIZE_OVERSHOOT_MAX
  );
  return Math.max(0, limited + (Math.sign(next - limited) * edge) / span);
}

/** Clamps a size to its limits, widened to include the starting size. */
function clampToLimits(
  value: number,
  start: number,
  minimum: number,
  maximum: number
): number {
  return THREE.MathUtils.clamp(
    value,
    Math.min(minimum, start),
    Math.max(maximum, start)
  );
}

function pointerOnPlane(
  snapshot: InteractionSourceState,
  baseline: Pick<ResizeBaseline, 'plane' | 'inverseMatrixWorld'>
): THREE.Vector3 | undefined {
  const world = snapshot.ray
    ? snapshot.ray.intersectPlane(baseline.plane, new THREE.Vector3())
    : baseline.plane.projectPoint(snapshot.position, new THREE.Vector3());
  if (!world || !isFiniteVector(world)) return undefined;
  return world.applyMatrix4(baseline.inverseMatrixWorld);
}

function resolveLimit(
  value: ResizeSize | undefined,
  fallback: number
): {width: number; height: number} | undefined {
  const width = value?.width ?? fallback;
  const height = value?.height ?? fallback;
  if (!isLimit(width) || !isLimit(height)) return undefined;
  return {width, height};
}

function isLimit(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && value >= 0;
}

function isFiniteMatrix(matrix: THREE.Matrix4): boolean {
  return matrix.elements.every(Number.isFinite);
}
