import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {Options} from '../core/Options';
import {XRSystems} from '../core/components/XRSystems';
import {Input} from './Input';

describe('Input head gestures', () => {
  it('creates head gestures without enabling controllers', () => {
    const input = new Input();
    const options = new Options().enableHeadGestures();
    options.controllers.enabled = false;
    const systemsGroup = new XRSystems();

    input.init({
      scene: new THREE.Scene(),
      systemsGroup,
      options,
      renderer: {} as THREE.WebGLRenderer,
    });

    expect(input.controllers).toHaveLength(0);
    expect(input.headGestures).toBeDefined();
    expect(systemsGroup.children).toContain(input.headGestures);
  });

  it('leaves the optional child undefined when disabled', () => {
    const input = new Input();
    const options = new Options();
    options.controllers.enabled = false;

    input.init({
      scene: new THREE.Scene(),
      systemsGroup: new XRSystems(),
      options,
      renderer: {} as THREE.WebGLRenderer,
    });

    expect(input.headGestures).toBeUndefined();
  });
});
