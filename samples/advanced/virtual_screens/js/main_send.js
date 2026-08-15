import {StreamManager} from './StreamManager.js';
import {WebSocketManager} from './WebSocketManager.js';

const webSocketManager = new WebSocketManager(8765);
const streamManager = new StreamManager(webSocketManager);
const sharedWindowsContainer = document.getElementById(
  'sharedWindowsContainer'
);
const selectScreenButton = document.getElementById('selectScreenButton');

/**
 * Adds a preview tile for a newly shared stream to the UI.
 * @param {string} streamId The ID of the stream.
 * @param {MediaStream} stream The stream to preview.
 */
function addStreamPreview(streamId, stream) {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return;

  const wrapper = document.createElement('div');
  wrapper.className =
    'relative bg-gray-700 rounded-lg overflow-hidden shadow-lg aspect-video';
  wrapper.dataset.streamId = streamId;

  const video = document.createElement('video');
  video.srcObject = stream;
  video.className = 'w-full h-full object-contain';
  video.autoplay = true;
  video.muted = true;

  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.className =
    'absolute top-2 right-2 bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-xl font-bold leading-none opacity-80 hover:opacity-100 transition-opacity duration-300';
  closeButton.onclick = () => {
    videoTrack.stop();
    streamManager.stopStream(streamId);
    wrapper.remove();
  };

  wrapper.appendChild(video);
  wrapper.appendChild(closeButton);
  sharedWindowsContainer.appendChild(wrapper);
}

selectScreenButton.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: {width: {max: 2560}, height: {max: 1440}},
    });

    const streamId = crypto.randomUUID();
    const videoTrack = stream.getVideoTracks()[0];
    const displaySurface = videoTrack.getSettings().displaySurface || 'unknown';

    await streamManager.shareStream(streamId, stream, displaySurface);
    addStreamPreview(streamId, stream);

    // When the user clicks the browser's "Stop sharing" button.
    videoTrack.onended = () => {
      streamManager.stopStream(streamId);
      const previewToRemove = sharedWindowsContainer.querySelector(
        `[data-stream-id="${streamId}"]`
      );
      if (previewToRemove) {
        previewToRemove.remove();
      }
    };
  } catch (err) {
    console.error('Error starting screen share:', err);
  }
});

// Clean up all streams when the page is closed or reloaded.
window.addEventListener('beforeunload', () => {
  for (const streamId of streamManager.streams.keys()) {
    streamManager.stopStream(streamId);
  }
});
