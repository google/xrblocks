/**
 * Interface representing the result of a permission request.
 */
export interface PermissionResult {
  granted: boolean;
  status: PermissionState | 'unknown' | 'error';
  error?: string;
}

/**
 * A utility class to manage and request browser permissions for
 * Location, Camera, and Microphone.
 */
export class PermissionsManager {
  /**
   * Requests permission to access the user's geolocation.
   * Note: This actually attempts to fetch the position to trigger the prompt.
   */
  async requestLocationPermission(): Promise<PermissionResult> {
    if (!('geolocation' in navigator)) {
      return {
        granted: false,
        status: 'error',
        error: 'Geolocation is not supported by this browser.',
      };
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          resolve({granted: true, status: 'granted'});
        },
        (error) => {
          let errorMsg = 'Unknown error';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMsg = 'User denied the request.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMsg = 'Location information is unavailable.';
              break;
            case error.TIMEOUT:
              errorMsg = 'The request to get user location timed out.';
              break;
          }
          resolve({granted: false, status: 'denied', error: errorMsg});
        },
        {timeout: 10000} // 10 second timeout
      );
    });
  }

  /**
   * Requests permission to access the microphone.
   * Opens a stream to trigger the prompt, then immediately closes it.
   */
  async requestMicrophonePermission(): Promise<PermissionResult> {
    return this.requestMediaPermission({audio: true});
  }

  /**
   * Requests permission to access the camera.
   * Opens a stream to trigger the prompt, then immediately closes it.
   */
  async requestCameraPermission(): Promise<PermissionResult> {
    return this.requestMediaPermission({video: true});
  }

  /**
   * Requests permission for both camera and microphone simultaneously.
   */
  async requestAVPermission(): Promise<PermissionResult> {
    return this.requestMediaPermission({video: true, audio: true});
  }

  /**
   * Internal helper to handle getUserMedia requests.
   * Crucially, this stops the tracks immediately after permission is granted
   * so the hardware doesn't remain active.
   */
  private async requestMediaPermission(
    constraints: MediaStreamConstraints
  ): Promise<PermissionResult> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return {
        granted: false,
        status: 'error',
        error: 'Media Devices API is not supported by this browser.',
      };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Permission granted. Now stop the stream to release hardware.
      stream.getTracks().forEach((track) => track.stop());

      return {granted: true, status: 'granted'};
    } catch (err) {
      // Handle common getUserMedia errors
      const status: PermissionState = 'denied';
      let errorMessage = 'Permission denied';

      if (err instanceof Error) {
        if (
          err.name === 'NotFoundError' ||
          err.name === 'DevicesNotFoundError'
        ) {
          return {
            granted: false,
            status: 'error',
            error: 'Hardware not found.',
          };
        }
        errorMessage = err.message || errorMessage;
      }

      return {granted: false, status: status, error: errorMessage};
    }
  }

  /**
   * Requests multiple permissions sequentially.
   * Returns a single result: granted is true only if ALL requested permissions are granted.
   */
  async checkAndRequestPermissions({
    geolocation = false,
    camera = false,
    microphone = false,
  }: {
    geolocation?: boolean;
    camera?: boolean;
    microphone?: boolean;
  }): Promise<PermissionResult> {
    const results: PermissionResult[] = [];

    // 1. Handle Location
    if (geolocation) {
      const status = await this.checkPermissionStatus('geolocation');
      if (status === 'granted') {
        results.push({granted: true, status: 'granted'});
      } else {
        results.push(await this.requestLocationPermission());
      }
    }

    // 2. Handle Media (Camera & Mic)
    // We group these because requestAVPermission can ask for both in one prompt
    if (camera && microphone) {
      const camStatus = await this.checkPermissionStatus('camera');
      const micStatus = await this.checkPermissionStatus('microphone');

      if (camStatus === 'granted' && micStatus === 'granted') {
        results.push({granted: true, status: 'granted'});
      } else if (camStatus === 'granted') {
        // Only need mic
        results.push(await this.requestMicrophonePermission());
      } else if (micStatus === 'granted') {
        // Only need camera
        results.push(await this.requestCameraPermission());
      } else {
        // Need both
        results.push(await this.requestAVPermission());
      }
    } else if (camera) {
      const status = await this.checkPermissionStatus('camera');
      if (status === 'granted') {
        results.push({granted: true, status: 'granted'});
      } else {
        results.push(await this.requestCameraPermission());
      }
    } else if (microphone) {
      const status = await this.checkPermissionStatus('microphone');
      if (status === 'granted') {
        results.push({granted: true, status: 'granted'});
      } else {
        results.push(await this.requestMicrophonePermission());
      }
    }

    // 3. Aggregate results
    if (results.length === 0) {
      return {granted: true, status: 'granted'};
    }

    const allGranted = results.every((r) => r.granted);
    const anyDenied = results.find((r) => r.status === 'denied');
    const anyError = results.find((r) => r.status === 'error');

    // Aggregate errors
    const errors = results
      .filter((r) => r.error)
      .map((r) => r.error)
      .join(' | ');

    let finalStatus: PermissionState | 'unknown' | 'error' = 'granted';
    if (anyError) finalStatus = 'error';
    else if (anyDenied) finalStatus = 'denied';

    return {
      granted: allGranted,
      status: finalStatus,
      error: errors || undefined,
    };
  }

  /**
   * Checks the current status of a permission without triggering a prompt.
   * Useful for UI state (e.g., disabling buttons if already denied).
   * * @param permissionName - 'geolocation', 'camera', or 'microphone'
   */
  async checkPermissionStatus(
    permissionName: 'geolocation' | 'camera' | 'microphone'
  ): Promise<PermissionState | 'unknown'> {
    if (!navigator.permissions || !navigator.permissions.query) {
      return 'unknown';
    }

    try {
      let queryName: PermissionName;

      // Map friendly names to API PermissionName types
      // Note: 'camera' and 'microphone' are part of the newer spec,
      // but strictly Typed TypeScript might expect specific descriptor objects.
      if (permissionName === 'geolocation') {
        queryName = 'geolocation';
      } else if (
        permissionName === 'camera' ||
        permissionName === 'microphone'
      ) {
        const descriptor = {name: permissionName};
        const result = await navigator.permissions.query(descriptor);
        return result.state;
      } else {
        return 'unknown';
      }

      const result = await navigator.permissions.query({name: queryName});
      return result.state;
    } catch (error) {
      // Firefox and Safari have incomplete Permissions API support
      console.warn(
        `Error checking permission status for ${permissionName}`,
        error
      );
      return 'unknown';
    }
  }
}
