# Interactive ML demo

Run `npm run build`, then `npm run serve` from the repository root. Open
`http://127.0.0.1:8080/demos/interactive-ml/` in Chrome. Headsets require HTTPS.

All demo controls and live predictions are in the scene. Use the same panel on
desktop and in XR. The simulator keeps its normal hands; joint debug markers are
disabled. Webcam hand tracking is not included.

1. Open **Settings** to choose **Poses** or **Sound** and the recording hand.
2. Choose the recording hand and class name. **Next class** cycles common names
   without typing. Start with at least two pose/sound classes, including neutral
   or background, and record several independent takes per class.
3. Press **Record example**. After a two-second countdown, recording lasts
   1.5 seconds for hands or one second for sound. The panel shows the countdown,
   remaining time, or an error if no hand data was received. Brief tracking gaps
   do not discard the take.
4. Press **Train & use**. The previous model remains active until training
   succeeds, then the new model starts predicting. Both hands use the same model.
5. Watch the left/right predictions and scores. **Test clip** checks a fresh
   recording without adding it to training. Add examples and train again as needed.

Predictions run at the hand sample rate (25 Hz for poses); the display updates
at most five times per second. Training runs in a worker.

**Settings** contains the recording hand, **Test clip**, microphone controls,
undo-last-example, browser project storage, and JSON import/export. File pickers
are intended for desktop; browser project storage works in XR too.

Click **Settings → Export TFLite** to download the current model directly from
the device. One `.tflite` file includes the classifier and label/feature metadata.
No Python or server is needed. Pose models take normalized hand features; sound
models take audio embeddings. See the addon README for the tensor contract.
Use **Export project** to keep examples for retraining in the browser.

Sound requires enabling the microphone in Settings. Initial use downloads
TensorFlow.js and YAMNet; processing runs locally in a worker. Record background
examples as well as target sounds. Stop the microphone when finished.

See [the addon documentation](../../src/addons/interactive-ml/README.md) for the
public interface, ownership, thresholds, and limits. Scores are not calibrated
probabilities. Test fresh recordings as well as ordinary background input.
