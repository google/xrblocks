# Interactive ML

Train hand-pose and sound classifiers on-device. Add labeled examples, train,
then use the returned predictor. At least two classes are required.

## Hands

```js
import * as xb from 'xrblocks';
import {
  captureHand,
  HandTrainer,
  Predictor,
} from 'xrblocks/addons/interactive-ml/index.js';

const trainer = new HandTrainer();
// Read the SDK's existing hand tracking from your Script.update().
const frame = captureHand(user.hands, xb.Handedness.RIGHT, performance.now());
if (frame) trainer.addExample('open', [frame]);
// Repeat for other poses, such as 'closed', with several takes per class.
const model = await trainer.train();
const result = model.predictHand([freshFrame]);
// result: {label, score, scores}. label is null when the pose is unknown.
```

Use the SDK User instance from `static dependencies = {user: xb.User}` as `user`
and call `captureHand(user.hands, xb.Handedness.RIGHT, timeMs)` in a script.
`captureHand` returns null when tracking is unavailable. It only normalizes the
SDK joint positions; no separate hand tracker or pose estimator is needed.
A frame contains `{hand, timeMs, pose}`. Either hand can teach both hands.
Pass a single frame for live prediction or a clip to average its pose features.
Add examples and call `train()` again to replace the model. Training uses a
snapshot; new examples belong to the next run. Dispose the previous predictor
with `model.dispose()` after replacement.

## Sound

```js
import {
  SoundTrainer,
  YamnetExtractor,
} from 'xrblocks/addons/interactive-ml/index.js';

const extractor = await YamnetExtractor.load(tf); // Supply TensorFlow.js.
const trainer = new SoundTrainer(extractor);
await trainer.addExample('clap', clapClip);
await trainer.addExample('background', backgroundClip);
const model = await trainer.train();
const result = await trainer.predict(model, freshClip);
```

Clips are `{samples: Float32Array, sampleRate}` with mono PCM in `[-1, 1]`.
Run YAMNet in a worker for XR.
Features are cached for retraining. `addFeatures(label, features)` accepts an
embedding already produced by the same extractor. Dispose the extractor when
finished with it.

Both trainers expose `counts`, `removeExample(id)`, `relabelExample(id, label)`,
and `removeLastExample()`. Undo removes the newest example without exporting or
copying the project. Dataset edits take effect when you train again.

## Save and load

```js
// One TFLite file, generated locally. Save these bytes as a .tflite file.
const bytes = model.exportTFLite();
const restored = Predictor.fromTFLite(bytes);
// From a file picker:
const loaded = Predictor.fromTFLite(new Uint8Array(await file.arrayBuffer()));

// JSON model, also supported:
const json = JSON.stringify(model.export());
const loadedJSON = new Predictor(JSON.parse(json));

// Training project, for adding examples later:
const projectJSON = JSON.stringify(trainer.exportProject());
const project = JSON.parse(projectJSON);
const restoredTrainer =
  project.kind === 'hand-pose'
    ? HandTrainer.loadProject(project)
    : SoundTrainer.loadProject(project, extractor);
```

TFLite import supports files exported by this addon. Labels and feature details
are embedded in its `xrblocks-interactive-ml` metadata entry. Imported weights
use float32, so scores can differ slightly from the original JavaScript model.
Models do not contain training examples. Project JSON stores hand frames or
cached sound features, and must be trained after loading.

For native TFLite inference, use the `serving_default` signature:

| Tensor               | Value                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------- |
| Input `features`     | float32 `[1, D]`: 60 normalized pose coordinates or sound embeddings (1024 for YAMNet) |
| Output `scores`      | float32 `[1, C]`, in metadata label order                                              |
| Output `score`       | float32 `[1]`, highest score                                                           |
| Output `class_index` | int32 `[1]`, accepted label index or `-1` for unknown                                  |

Normalization and rejection are included. Joint capture and the sound encoder
remain outside the model; use the same feature pipeline for training and inference.
