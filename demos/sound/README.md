# Sound Sample

This sample demonstrates the XR Blocks sound system with voice recording, spatial audio playback, and volume control.

## Features

- **Voice Recording**: Click the mic button to record your voice
- **Spatial Audio Playback**: Click the jumping balls to play your recording in 3D space
- **Volume Control**: Adjust playback volume with +/- buttons

## How to Use

1. Click the microphone button to start recording
2. Speak into your device's microphone
3. Click the microphone again to stop recording
4. Watch the balls start jumping (indicates recording is ready)
5. Click any jumping ball to hear your recording from that ball's position in 3D space
6. Use +/- buttons to adjust volume

## Technical Highlights

The sample showcases:

- `xb.core.sound.startRecording()` / `stopRecording()` for audio capture
- `THREE.PositionalAudio` for true 3D spatial sound
- `xb.core.sound.setMasterVolume()` for volume control
