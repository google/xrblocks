import * as THREE from 'three';

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
// Meters. Sizes closer than this count as unchanged, both for reusing a
// content measurement and for leaving an automatic height alone.
const SIZE_EPSILON = 1e-4;

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

  capture(session: ManipulationDriverSession): ResizeBaseline | undefined {
    const card = asCard(session.owner);
    const options = session.config.resize;
    if (!card || !options) return undefined;
    const anchor = options.anchor ?? 'center';
    if (anchor !== 'center' && anchor !== 'opposite') return undefined;
    const minSize = resolveLimit(options.minSize, DEFAULT_MIN_SIZE);
    const maxSize = resolveLimit(options.maxSize, Infinity);
    if (
      !minSize ||
      !maxSize ||
      minSize.width > maxSize.width ||
      minSize.height > maxSize.height
    ) {
      return undefined;
    }
    // Without an explicit minimum width, never go narrower than the content.
    if (options.minSize?.width === undefined) {
      const content = measureUICardMinContentWidth(card);
      if (content !== undefined) {
        minSize.width = Math.min(
          Math.max(minSize.width, content),
          maxSize.width
        );
      }
    }
    const {width} = card.size;
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
    // Use the current pointer, not the Select start point, so a phase that
    // restarts after two-source scale keeps dragging the same corner.
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
    const corner = new THREE.Vector2(
      pointer.x >= centerX ? 1 : 0,
      pointer.y >= centerY ? 1 : 0
    );
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
      options: {
        anchor,
        minSize,
        maxSize,
        fitContent: options.minSize?.height === undefined,
        preserveAspectRatio: options.preserveAspectRatio === true,
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
    const {corner, cardAnchor, options} = baseline;
    const fixed =
      options.anchor === 'center'
        ? new THREE.Vector2(CARD_ANCHORS.center, CARD_ANCHORS.center)
        : new THREE.Vector2(1 - corner.x, 1 - corner.y);

    let width = resizeAxis(
      baseline.width,
      pointer.x - baseline.pointer.x,
      corner.x,
      fixed.x,
      options.minSize.width,
      options.maxSize.width
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
            options.maxSize.height
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
          // Grow both axes together. Widening only shortens wrapped content,
          // so it still fits, and maxSize wins if the ratio cannot reach it.
          const ratio = lockedRatio(
            floor / (baseline.height as number),
            baseline
          );
          width = baseline.width * ratio;
          height = (baseline.height as number) * ratio;
        } else {
          height = floor;
        }
      }
    }

    // Move the card origin so the fixed point keeps its baseline world position.
    const offset = new THREE.Vector3(
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

    // An automatic height stays automatic until the size really changes, so a
    // corner press without a drag does not freeze it.
    const unchanged =
      baseline.autoHeight &&
      Math.abs(width - baseline.width) < SIZE_EPSILON &&
      (height === 'auto' ||
        Math.abs(height - (baseline.height as number)) < SIZE_EPSILON);
    const proposedHeight = unchanged ? 'auto' : height;
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

function resizeAxis(
  size: number,
  delta: number,
  corner: number,
  fixed: number,
  minimum: number,
  maximum: number
): number {
  const direction = corner === 1 ? 1 : -1;
  const next = size + (direction * delta) / Math.abs(corner - fixed);
  return THREE.MathUtils.clamp(
    next,
    Math.min(minimum, size),
    Math.max(maximum, size)
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
