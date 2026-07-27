import * as THREE from 'three';
import {Controller, ControllerEvent, ControllerEventMap} from './Controller';

export interface FilterableControllerEvent extends ControllerEvent {
  isCustom?: boolean;
}

export class PinchFilter {
  private forwardingListeners = new Map<
    keyof ControllerEventMap,
    (event: THREE.BaseEvent) => void
  >();

  constructor(private handleEventFn: (event: ControllerEvent) => void) {}

  private getOrCreateForwardingListener(type: keyof ControllerEventMap) {
    let listener = this.forwardingListeners.get(type);
    if (!listener) {
      listener = (event: THREE.BaseEvent) => {
        this.handleEventFn(event as ControllerEvent);
      };
      this.forwardingListeners.set(type, listener);
    }
    return listener;
  }

  setupController(
    controller: Controller,
    activeEventTypes: Iterable<keyof ControllerEventMap>
  ) {
    for (const type of activeEventTypes) {
      const forwarder = this.getOrCreateForwardingListener(type);
      controller.addEventListener(type, forwarder);
    }
  }

  setupControllerForType(
    controller: Controller,
    type: keyof ControllerEventMap
  ) {
    const forwarder = this.getOrCreateForwardingListener(type);
    controller.addEventListener(type, forwarder);
  }

  removeControllerForType(
    controller: Controller,
    type: keyof ControllerEventMap
  ) {
    const forwarder = this.forwardingListeners.get(type);
    if (forwarder) {
      controller.removeEventListener(type, forwarder);
    }
  }

  dispose(controllers: Controller[]) {
    for (const [type, forwarder] of this.forwardingListeners.entries()) {
      for (const controller of controllers) {
        controller.removeEventListener(type, forwarder);
      }
    }
    this.forwardingListeners.clear();
  }

  shouldFilterEvent(event: FilterableControllerEvent): boolean {
    const controller = event.target;
    if (
      event.type === 'selectstart' ||
      event.type === 'selectend' ||
      event.type === 'select'
    ) {
      if (controller.gamepad?.buttons[0] !== undefined && !event.isCustom) {
        return true;
      }
    }
    return false;
  }

  updateController(
    controller: Controller,
    dispatchEventFn: (event: ControllerEvent) => void,
    setRaycasterFn: (c: Controller) => void,
    performRaycastFn: (c: Controller) => void
  ) {
    if (controller.gamepad && controller.gamepad.buttons[0] !== undefined) {
      const pinchValue = controller.gamepad.buttons[0].value;
      const isPinching = pinchValue >= 1.0;
      const wasPinching = controller.userData.selected === true;

      if (isPinching && !wasPinching) {
        controller.userData.selected = true;
        setRaycasterFn(controller);
        performRaycastFn(controller);
        dispatchEventFn({
          type: 'selectstart',
          target: controller,
          data: controller.inputSource,
          isCustom: true,
        } as FilterableControllerEvent);
      } else if (!isPinching && wasPinching) {
        controller.userData.selected = false;
        dispatchEventFn({
          type: 'select',
          target: controller,
          data: controller.inputSource,
          isCustom: true,
        } as FilterableControllerEvent);
        dispatchEventFn({
          type: 'selectend',
          target: controller,
          data: controller.inputSource,
          isCustom: true,
        } as FilterableControllerEvent);
      }
    }
  }
}
