import * as THREE from 'three';

/**
 * Manages the HTMLVideoElement and THREE.VideoTexture for simulator background video playback.
 */
export class SimulatorBackgroundVideo {
  private videoElement?: HTMLVideoElement;
  private videoTexture?: THREE.VideoTexture;

  /**
   * Sets or clears the background video path, tearing down any previous video element and texture.
   *
   * @param path - Optional URL or file path to the background video.
   * @returns The created THREE.VideoTexture, or undefined if path is empty/undefined.
   */
  setPath(path?: string): THREE.VideoTexture | undefined {
    this.videoElement?.pause();
    this.videoElement?.removeAttribute('src');
    this.videoElement?.load();
    this.videoElement = undefined;
    this.videoTexture?.dispose();
    this.videoTexture = undefined;
    if (!path) return undefined;

    const video = document.createElement('video');
    video.src = path;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.play().catch((error) => {
      console.error(`Simulator: Failed to play video at ${path}`, error);
    });
    video.addEventListener('error', () => {
      console.error(`Simulator: Error loading video at ${path}`, video.error);
    });

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.videoElement = video;
    this.videoTexture = texture;
    return texture;
  }

  /**
   * Disposes of the active video element and texture.
   */
  dispose(): void {
    this.setPath(undefined);
  }
}
