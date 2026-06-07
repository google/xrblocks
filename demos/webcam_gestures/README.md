# Webcam Gestures Demo

Control XR simulator hand gestures using your webcam and MediaPipe hand tracking.

## Features

- **Real-time hand gesture detection** using MediaPipe
- **Demo-local pose estimator** that maps webcam landmarks into `HandContext`
- **Demo-local gesture recognizer** that emits normal XR Blocks gesture events
- **Custom gesture recognition**: PINCH, FIST, ROCK, THUMBS_UP, THUMBS_DOWN
- **Native gesture support**: POINTING, VICTORY, RELAXED
- **XR simulator integration** with stereo view

## Supported Gestures

- **Pinch** - Thumb and index finger touch (index extended)
- **Fist** - All fingers closed, neutral thumb
- **Thumbs Up** - All fingers closed, thumb pointing up
- **Thumbs Down** - All fingers closed, thumb pointing down
- **Rock** - Index and pinky extended, middle and ring closed
- **Pointing** - Index finger pointing up
- **Victory** - Peace sign
- **Relaxed** - Open palm

## How it Works

1. MediaPipe detects hand landmarks from the webcam feed.
2. The demo-local pose estimator maps those landmarks into XR Blocks joint names.
3. `GestureRecognition` passes the resulting `HandContext` into the demo-local recognizer.
4. The recognizer combines hand-pose helper scores with MediaPipe native gesture labels.
5. Standard `gesturestart`, `gestureupdate`, and `gestureend` events drive simulator hand poses.
