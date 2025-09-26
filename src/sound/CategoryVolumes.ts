import * as THREE from 'three';

export enum VolumeCategory {
  music = 'music',
  sfx = 'sfx',
  speech = 'speech',
  ui = 'ui'
}

export class CategoryVolumes {
  isMuted = false;
  masterVolume = 1.0;

  volumes: Record<VolumeCategory, number> =
      Object.fromEntries(
          Object.values(VolumeCategory).map(cat => [cat, 1.0])) as
      Record<VolumeCategory, number>;

  getCategoryVolume(category: string): number {
    return this.volumes[category as VolumeCategory] ?? 1.0;
  }

  getEffectiveVolume(category: string, specificVolume = 1.0): number {
    if (this.isMuted) return 0.0;
    const categoryVol = this.getCategoryVolume(category);
    const clampedSpecificVolume =
        THREE.MathUtils.clamp(specificVolume, 0.0, 1.0);
    return this.masterVolume * categoryVol * clampedSpecificVolume;
  }
}
