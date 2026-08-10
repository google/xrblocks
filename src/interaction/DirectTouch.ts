import * as THREE from 'three';

import type {Controller} from '../input/Controller';
import {HitRegistry} from './HitRegistry';
import {HitResolver} from './HitResolver';
import {type DirectTouchInput, type ResolvedRay} from './InteractionTypes';

export interface DirectTouchContact {
  readonly phase: 'start' | 'move' | 'end';
  readonly controller: Controller;
  readonly resolved?: ResolvedRay;
  readonly handIndex: number;
  readonly hand?: THREE.Object3D;
  readonly point: THREE.Vector3;
  readonly orientation?: THREE.Quaternion;
  readonly selected: boolean;
  readonly endReason?: 'left-target' | 'target-changed' | 'source-lost';
}

interface ActiveContact {
  resolved: ResolvedRay;
  handIndex: number;
  hand?: THREE.Object3D;
  point: THREE.Vector3;
}

/**
 * Converts registered-bounds contacts into source-neutral contact phases.
 * Interaction owns callback dispatch, capture, completion, and cancellation.
 */
export class DirectTouch {
  private static readonly EXIT_PADDING = 0.01;
  private readonly active = new Map<Controller, ActiveContact>();
  private readonly awaitingExit = new Set<Controller>();
  private readonly contacts: DirectTouchContact[] = [];
  private readonly present = new Set<Controller>();

  constructor(
    private readonly registry: HitRegistry,
    private readonly resolver: HitResolver
  ) {}

  update(inputs: readonly DirectTouchInput[]): DirectTouchContact[] {
    this.contacts.length = 0;
    this.present.clear();
    for (const input of inputs) {
      this.present.add(input.controller);
      const previous = this.active.get(input.controller);
      const resolved = this.resolver.resolve(
        this.registry.intersectionsAt(
          input.point,
          previous ? DirectTouch.EXIT_PADDING : 0,
          previous?.resolved.hitObject
        ),
        'direct-touch'
      );

      if (this.awaitingExit.has(input.controller)) {
        if (!resolved) this.awaitingExit.delete(input.controller);
        continue;
      }
      if (!previous && !resolved?.target) continue;

      if (!previous && resolved?.target) {
        const active = {
          resolved,
          handIndex: input.handIndex,
          hand: input.hand,
          point: input.point.clone(),
        };
        this.active.set(input.controller, active);
        this.contacts.push({
          phase: 'start',
          controller: input.controller,
          resolved,
          handIndex: input.handIndex,
          hand: input.hand,
          point: input.point,
          orientation: input.orientation,
          selected: input.selected,
        });
      } else if (
        previous &&
        resolved &&
        resolved.target === previous.resolved.target
      ) {
        previous.resolved = resolved;
        previous.point.copy(input.point);
        this.contacts.push({
          phase: 'move',
          controller: input.controller,
          resolved,
          handIndex: input.handIndex,
          hand: input.hand,
          point: input.point,
          orientation: input.orientation,
          selected: input.selected,
        });
      } else if (previous) {
        if (resolved) this.awaitingExit.add(input.controller);
        this.contacts.push(
          this.endContact(
            input.controller,
            input.selected,
            resolved?.target ? 'target-changed' : 'left-target',
            input.handIndex,
            input.hand,
            input.point,
            input.orientation
          )
        );
      }
    }
    for (const controller of this.active.keys()) {
      if (!this.present.has(controller)) {
        this.contacts.push(this.endContact(controller, false, 'source-lost'));
      }
    }
    for (const controller of this.awaitingExit) {
      if (!this.present.has(controller)) this.awaitingExit.delete(controller);
    }
    return this.contacts;
  }

  remove(controller: Controller): DirectTouchContact | undefined {
    this.awaitingExit.delete(controller);
    return this.active.has(controller)
      ? this.endContact(controller, false, 'source-lost')
      : undefined;
  }

  has(controller: Controller): boolean {
    return this.active.has(controller);
  }

  clear(): void {
    this.active.clear();
    this.awaitingExit.clear();
    this.contacts.length = 0;
    this.present.clear();
  }

  private endContact(
    controller: Controller,
    selected: boolean,
    endReason: NonNullable<DirectTouchContact['endReason']>,
    handIndex?: number,
    hand?: THREE.Object3D,
    point?: THREE.Vector3,
    orientation?: THREE.Quaternion
  ): DirectTouchContact {
    const previous = this.active.get(controller)!;
    this.active.delete(controller);
    return {
      phase: 'end',
      controller,
      handIndex: handIndex ?? previous.handIndex,
      hand: hand ?? previous.hand,
      point: point ?? previous.point,
      orientation,
      selected,
      endReason,
    };
  }
}
