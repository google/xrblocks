import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import * as xb from 'xrblocks';

import {StreamManager} from './StreamManager.js';
import {WebSocketManager} from './WebSocketManager.js';
import {WindowStream} from './WindowStream.js';
import {WindowView} from './WindowView.js';

/**
 * Manages the XR Blocks scene, creating video panels for incoming streams.
 */
export class WindowReceiver extends xb.Script {
  constructor() {
    super();
    this.sharedWindows = new Map();
    this.panels = [];
    this.screenDistance = -0.4;
    this.screenHeight = 0.4; // Fixed height (width defined relative to this)
    this.screenCurvature = 0.2;
    this.curveScreens = true;
    this.layerOffset = new THREE.Vector3(0.1, 0.1, 0.1);
    this.frameBufferScaleFactor = 1.0; // Increase to improve rendering quality at the cost of
    // performance (default 1.0 for normal rendering)

    // Variables for tracking simulator behavior
    this.simulatorRunning = false;
    this.localPreviewStarted = false;
  }

  init() {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (isLocalhost) {
      this.webSocketManager = new WebSocketManager(8765);
      this.streamManager = new StreamManager(this.webSocketManager);

      // Set up callbacks to handle new and ended streams.
      this.streamManager.startReceiving(
        (streamId, mediaStream, streamInfo) =>
          this.onNewStream(streamId, mediaStream, streamInfo),
        (streamId) => this.onStreamEnded(streamId)
      );
    } else {
      console.log('Not running on localhost, WebSocket connection disabled.');
      // Create a dummy manager to prevent errors.
      this.webSocketManager = {
        hasConnectedSuccessfully: false,
        stopReconnecting: () => {},
      };
    }

    xb.core.renderer.setPixelRatio(window.devicePixelRatio);
    xb.core.renderer.xr.setFramebufferScaleFactor(this.frameBufferScaleFactor);
  }

  /**
   * Called by the StreamManager when a new stream is available.
   * @param {string} streamId The unique ID for the stream.
   * @param {MediaStream} mediaStream The remote MediaStream.
   * @param {object} streamInfo Metadata about the stream, like width and
   * height.
   */
  onNewStream(streamId, mediaStream, streamInfo) {
    if (this.sharedWindows.has(streamId)) {
      console.warn(`Stream with ID ${streamId} already exists. Ignoring.`);
      return;
    }

    // Use streamInfo for dimensions, not the mediaStream's track, which can
    // have timing issues.
    const {width, height} = streamInfo;
    if (!width || !height) {
      console.error(`Stream ${streamId} has invalid video dimensions.`);
      return;
    }

    console.log(
      `New stream received: ${streamId} with resolution ${width}x${height}.`
    );

    // Calculate panel width based on fixed height to maintain aspect ratio.
    const aspectRatio = width / height;
    const panelWidth = this.screenHeight * aspectRatio;

    const windowStream = new WindowStream();
    windowStream.setStream(mediaStream);

    let position;
    let rotation = null;

    if (this.panels.length > 0) {
      // If panels already exist, layer the new one relative to the last one.
      const lastPanel = this.panels[this.panels.length - 1];
      const rotatedOffset = this.layerOffset
        .clone()
        .applyQuaternion(lastPanel.quaternion);
      position = lastPanel.position.clone().add(rotatedOffset);
      rotation = lastPanel.quaternion.clone();
    } else {
      // Otherwise, use the default position for the first panel.
      position = new THREE.Vector3(0, xb.core.user.height, this.screenDistance);
    }

    const panel = new xb.SpatialPanel({
      width: panelWidth,
      height: this.screenHeight,
      isDraggable: true,
      isClosable: true,
      showEdge: true,
      backgroundColor: '#ffffff00',
      onClose: () => this.onStreamEnded(streamId),
    });
    panel.position.set(position.x, position.y, position.z);

    if (rotation) {
      panel.quaternion.copy(rotation);
    }

    const videoView = new WindowView({
      isCurved: this.curveScreens,
      curvature: this.screenCurvature,
    });
    panel.add(videoView);
    videoView.load(windowStream);

    this.add(panel);
    this.sharedWindows.set(streamId, {panel, stream: windowStream});
    this.panels.push(panel);
    panel.fadeOut(0);
    panel.show();
    panel.fadeIn();
  }

  /**
   * Manages the creation of local preview streams for usage in the simulator.
   * @private
   */
  async _manageLocalStreamCreation() {
    let addAnother = window.confirm(
      'This sample requires a server to run on localhost, which cannot be found. Would you like to share a local screen for simulation?'
    );

    while (addAnother) {
      const success = await this._addLocalStream();
      if (success) {
        addAnother = window.confirm('Would you like to share another screen?');
      } else {
        addAnother = false;
      }
    }
  }

  /**
   * Prompts the user for a screen to share locally and adds it to the scene.
   * @private
   * @return {Promise<boolean>} True if a stream was successfully added.
   */
  async _addLocalStream() {
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {width: {max: 2560}, height: {max: 1440}},
      });

      const videoTrack = mediaStream.getVideoTracks()[0];
      if (!videoTrack) {
        console.error('No video track found in the selected stream.');
        return false;
      }

      const {width, height} = videoTrack.getSettings();
      const streamInfo = {width, height};
      const streamId = `local-preview-${crypto.randomUUID()}`;
      this.onNewStream(streamId, mediaStream, streamInfo);
      videoTrack.onended = () => {
        this.onStreamEnded(streamId);
      };
      return true;
    } catch (err) {
      console.log('Could not start local screen preview:', err.name);
      return false;
    }
  }

  /**
   * Cleans up the resources for a stream that has ended.
   * @param {string} streamId The unique ID for the stream to remove.
   */
  onStreamEnded(streamId) {
    if (!this.sharedWindows.has(streamId)) {
      return;
    }
    console.log(`Cleaning up stream: ${streamId}`);
    const {panel, stream} = this.sharedWindows.get(streamId);
    this.sharedWindows.delete(streamId);
    this.panels = this.panels.filter((p) => p !== panel);

    panel.fadeOut(1, () => {
      this.remove(panel);
      panel.dispose();
      stream.dispose();
      console.log(`Cleanup complete for stream: ${streamId}`);
    });
  }

  onSimulatorStarted() {
    this.simulatorRunning = true;
    if (!this.webSocketManager.hasConnectedSuccessfully) {
      this.webSocketManager.stopReconnecting();
      if (!this.localPreviewStarted) {
        this.localPreviewStarted = true;
        this._manageLocalStreamCreation();
      }
    }
  }
}

/**
 * Initializes the XR Blocks application.
 */
document.addEventListener('DOMContentLoaded', function () {
  const options = new xb.Options();
  options.enableUI();

  xb.add(new WindowReceiver());
  xb.init(options);
});
