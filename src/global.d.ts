interface XRSystem {
  offerSession?: (
    mode: XRSessionMode,
    sessionInit?: XRSessionInit
  ) => Promise<XRSession>;
}

/**
 * WebXR Raw Camera Access API types.
 * @see https://immersive-web.github.io/raw-camera-access/
 */
interface XRCamera {
  readonly width: number;
  readonly height: number;
}

declare namespace Temporal {
  interface DurationFields {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
    microseconds?: number;
    nanoseconds?: number;
  }
  class Duration implements DurationFields {
    static from(duration: any): Duration;
    total(options: {unit: string}): number;
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
    microseconds?: number;
    nanoseconds?: number;
  }
  interface DurationLike extends DurationFields {
    [key: string]: any;
  }
}

declare module '@sparkjsdev/spark' {
  import * as THREE from 'three';
  export class SparkRenderer extends THREE.Object3D {
    constructor(options?: any);
    encodeLinear?: boolean;
    [key: string]: any;
  }
  export class SplatMesh extends THREE.Object3D {
    constructor(options?: any);
    [key: string]: any;
  }
}
