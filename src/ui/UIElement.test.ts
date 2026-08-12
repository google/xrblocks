import {describe, expect, it, vi} from 'vitest';
import type * as THREE from 'three';

import {
  UIElement,
  UICard,
  UIOverlay,
  UIPanel,
  UIButton,
  UISlider,
  UIText,
  UIImage,
  UIIcon,
} from './index';

interface CustomUIEventMap extends THREE.Object3DEventMap {
  customEvent: {value: number};
  stateChange: {active: boolean};
}

class TestCustomUIElement extends UIElement<CustomUIEventMap> {
  constructor() {
    super('panel');
  }

  triggerCustomEvent(value: number) {
    this.dispatchEvent({type: 'customEvent', value});
  }
}

describe('UIElement TEventMap generic', () => {
  it('supports typed custom event maps on custom UIElement subclasses', () => {
    const element = new TestCustomUIElement();
    const handler = vi.fn();

    element.addEventListener('customEvent', (event) => {
      handler(event.value);
    });

    element.triggerCustomEvent(42);
    expect(handler).toHaveBeenCalledWith(42);
  });

  it('supports typed custom event maps on UICard', () => {
    interface CardEvents extends THREE.Object3DEventMap {
      cardResized: {width: number; height: number};
    }

    const card = new UICard<CardEvents>({size: {width: 1, height: 1}});
    const handler = vi.fn();

    card.addEventListener('cardResized', (event) => {
      handler(event.width, event.height);
    });

    card.dispatchEvent({type: 'cardResized', width: 2, height: 3});
    expect(handler).toHaveBeenCalledWith(2, 3);
  });

  it('supports typed custom event maps on UIButton', () => {
    interface ButtonEvents extends THREE.Object3DEventMap {
      pressed: {timestamp: number};
    }

    const button = new UIButton<ButtonEvents>({label: 'Click'});
    const handler = vi.fn();

    button.addEventListener('pressed', (event) => {
      handler(event.timestamp);
    });

    button.dispatchEvent({type: 'pressed', timestamp: 1000});
    expect(handler).toHaveBeenCalledWith(1000);
  });

  it('supports typed custom event maps on UISlider, UIPanel, UIOverlay, UIText, UIImage, UIIcon', () => {
    interface ExtendedEvents extends THREE.Object3DEventMap {
      valueUpdated: {newValue: number};
    }

    const slider = new UISlider<ExtendedEvents>({ariaLabel: 'Volume'});
    const panel = new UIPanel<ExtendedEvents>();
    const overlay = new UIOverlay<ExtendedEvents>();
    const text = new UIText<ExtendedEvents>({text: 'Hello'});
    const image = new UIImage<ExtendedEvents>({src: 'test.png'});
    const icon = new UIIcon<ExtendedEvents>({icon: 'home'});

    const sliderHandler = vi.fn();
    slider.addEventListener('valueUpdated', (e) => sliderHandler(e.newValue));
    slider.dispatchEvent({type: 'valueUpdated', newValue: 0.5});
    expect(sliderHandler).toHaveBeenCalledWith(0.5);

    expect(panel.isUI).toBe(true);
    expect(overlay.isUI).toBe(true);
    expect(text.text).toBe('Hello');
    expect(image.src).toBe('test.png');
    expect(icon.icon).toBe('home');
  });

  it('maintains default THREE.Object3DEventMap behavior when untyped', () => {
    const card = new UICard({size: {width: 1, height: 1}});
    const addedHandler = vi.fn();

    card.addEventListener('added', addedHandler);
    card.dispatchEvent({type: 'added'});

    expect(addedHandler).toHaveBeenCalled();
  });
});
