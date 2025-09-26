# XR Blocks Sound SDK

Simple audio management for XR applications with AI integration.

## Quick Start

Access all sound features through `core.sound`:

```javascript
export class MyScript extends xb.Script {
  async init() {
    // Enable audio capture for AI
    await xb.core.sound.enableAudio();

    // Play AI audio response
    xb.core.sound.playAIAudio(base64AudioData);
  }
}
```

## Core Features

### AI Audio
```javascript
// Enable microphone capture and stream to AI
await xb.core.sound.enableAudio();

// Play AI audio responses
xb.core.sound.playAIAudio(base64AudioData);

// Control streaming
xb.core.sound.setAIStreaming(false); // Disable AI streaming
xb.core.sound.disableAudio(); // Stop capture
```

### Volume Control
```javascript
// Master volume (0.0 - 1.0)
xb.core.sound.setMasterVolume(0.8);

// Category volumes
xb.core.sound.setCategoryVolume('music', 0.5);
xb.core.sound.setCategoryVolume('sfx', 0.7);

// Mute/unmute
xb.core.sound.muteAll();
xb.core.sound.unmuteAll();
```

### Status Checking
```javascript
// Check audio states
xb.core.sound.isAudioEnabled();     // Is microphone active?
xb.core.sound.isAIAudioPlaying();   // Is AI audio playing?
xb.core.sound.isAIStreamingEnabled(); // Is streaming to AI?
```

## Available Modules

- **AudioListener**: Microphone capture and AI streaming
- **AudioPlayer**: AI audio playback with queuing
- **BackgroundMusic**: Music management
- **SpatialAudio**: 3D positional audio
- **SpeechRecognizer**: Speech-to-text
- **SpeechSynthesizer**: Text-to-speech

All modules are automatically initialized and accessible through `core.sound`.
