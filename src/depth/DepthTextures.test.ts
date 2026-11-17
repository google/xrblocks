import * as THREE from 'three';
import {expect, it, vi} from 'vitest';
import {DepthOptions} from './DepthOptions';
import {DepthTextures} from './DepthTextures';
it.each(['float32', 'luminance-alpha'] as const)(
  'publishes correct %s pixels and releases owned textures',
  (format) => {
    const textures = new DepthTextures(new DepthOptions());
    const pixels =
      format === 'float32'
        ? new Float32Array([1, 2, 3, 4])
        : new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    textures.updateData(
      {width: 2, height: 2, data: pixels.buffer} as XRCPUDepthInformation,
      0,
      format
    );
    expect(
      Array.from((textures.get(0)! as THREE.DataTexture).image.data!)
    ).toEqual(Array.from(pixels));
    const released = vi.spyOn(textures.get(0), 'dispose');
    textures.dispose();
    textures.dispose();
    expect(released).toHaveBeenCalledOnce();
    expect(textures.get(0)).toBeUndefined();
  }
);
it('releases wrappers without disposing browser-owned textures', () => {
  const textures = new DepthTextures(new DepthOptions());
  const properties = new WeakMap();
  const native = {} as WebGLTexture;
  const renderer = {
    properties: {
      get(object: object) {
        if (!properties.has(object)) properties.set(object, {});
        return properties.get(object);
      },
      remove(object: object) {
        properties.delete(object);
      },
    },
  };
  textures.updateNativeTexture(
    {texture: native} as XRWebGLDepthInformation,
    renderer as never,
    0
  );
  const wrapper = textures.get(0);
  const dispose = vi.spyOn(wrapper, 'dispose');
  textures.dispose();
  expect(dispose).not.toHaveBeenCalled();
  expect(properties.has(wrapper)).toBe(false);
  expect(textures.get(0)).toBeUndefined();
});
