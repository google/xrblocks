import * as THREE from 'three';
import { XRDeviceCamera } from '../../camera/XRDeviceCamera.js';
export declare class ScreenshotSynthesizer {
    private pendingScreenshotRequests;
    private virtualCanvas?;
    private virtualBuffer;
    private virtualRealCanvas?;
    private virtualRealBuffer;
    private realVirtualRenderTarget?;
    private fullScreenQuad?;
    onAfterRender(renderer: THREE.WebGLRenderer, deviceCamera?: XRDeviceCamera): Promise<void>;
    private createVirtualImageDataURL;
    private resolveVirtualOnlyRequests;
    private createVirtualRealImageDataURL;
    private resolveVirtualRealRequests;
    private getFullScreenQuad;
    /**
     * Requests a screenshot from the scene as a DataURL.
     * @param overlayOnCamera - If true, overlays the image on a camera image
     *     without any projection or aspect ratio correction.
     * @returns Promise which returns the screenshot.
     */
    getScreenshot(overlayOnCamera?: boolean): Promise<unknown>;
}
