# XR Blocks

[![NPM Package](https://img.shields.io/npm/v/xrblocks)](https://www.npmjs.com/package/xrblocks)
[![jsDelivr npm hits](<https://img.shields.io/jsdelivr/npm/hw/xrblocks?label=jsdelivr%20(npm)>)](https://www.jsdelivr.com/package/npm/xrblocks)
[![jsDelivr GitHub hits](<https://img.shields.io/jsdelivr/gh/hw/google/xrblocks?label=jsdelivr%20(GitHub)>)](https://www.jsdelivr.com/package/gh/google/xrblocks)
[![arXiv](https://img.shields.io/badge/arXiv-2509.25504-b31b1b.svg)](https://arxiv.org/abs/2509.25504)
[![arXiv](https://img.shields.io/badge/arXiv-2603.24591-b31b1b.svg)](https://arxiv.org/abs/2603.24591)

#### JavaScript library for rapid AI + XR prototyping

[Site](https://xrblocks.github.io/) &mdash;
[Manual](https://xrblocks.github.io/docs/) &mdash;
[Templates](https://xrblocks.github.io/docs/templates/Basic/) &mdash;
[Demos](https://xrblocks.github.io/docs/samples/) &mdash;
[Gem](https://xrblocks.github.io/gem) &mdash;
[YouTube](https://www.youtube.com/watch?v=75QJHTsAoB8) &mdash;
[arXiv](https://arxiv.org/abs/2509.25504) &mdash;
[Blog](https://research.google/blog/vibe-coding-xr-accelerating-ai-xr-prototyping-with-xr-blocks-and-gemini)

<p align="center">
  <a href="https://xrblocks.github.io/docs/samples/Ballpit/" target="_blank"><img width="32.3%" src="https://cdn.jsdelivr.net/gh/google/xrblocks@main/assets/ballpit-demo.webp" alt="Ballpit" /></a>
  <a href="https://xrblocks.github.io/docs/samples/XR-Emoji/" target="_blank"><img width="32.3%" src="https://cdn.jsdelivr.net/gh/google/xrblocks@main/assets/xremoji-demo.webp" alt="XR Emoji" /></a>
  <a href="https://xrblocks.github.io/docs/samples/Gemini-Icebreakers/" target="_blank"><img width="32.3%" src="https://cdn.jsdelivr.net/gh/google/xrblocks@main/assets/gemini-icebreakers-demo.webp" alt="Gemini Icebreakers" /></a>
</p>

### Description

**XR Blocks** is a lightweight, cross-platform library for rapidly prototyping
advanced XR and AI experiences. Built upon [three.js](https://threejs.org), it
targets Chrome v136+ with WebXR support on Android XR (e.g.,
[Galaxy XR](https://www.samsung.com/us/xr/galaxy-xr/galaxy-xr/)) and also
includes a powerful desktop simulator for development. The framework emphasizes
a user-centric, developer-friendly SDK designed to simplify the creation of
immersive applications with features like:

- **Hand Tracking & Gestures:** Access advanced hand tracking, custom gestures
  with TensorFlow Lite / PyTorch models, and interaction events.
- **Gesture Recognition:** Opt into pinch, open-palm, fist, thumbs-up, point,
  and spread detection with `options.enableGestures()`, tune providers or
  thresholds, and subscribe to `gesturestart`/`gestureupdate`/`gestureend`
  events from the shared subsystem.
- **World Understanding:** Present samples with depth sensing, geometry-aware
  physics, and object recognition with Gemini in both XR and desktop
  simulator.
- **Agent Context:** Expose an agent-facing scene context with semantic trees,
  visible-object state, and Set-of-Mark screenshots through `xb.context`.
- **AI Integration:** Seamlessly connect to Gemini for multimodal
  understanding and live conversational experiences.
- **Cross-Platform:** Write once and deploy to both XR devices and desktop
  Chrome browsers.
- **Automation-Friendly Simulator:** Use `options.enableAutomationMode()` or
  `?xrAutomation=1` to start a desktop simulator preset with context enabled.
- **Browser Debugging:** Add `?debug=1` to expose the SDK as `window.xb` and
  await initialization through `window.xbReady` from browser tooling.
- **Constrained Simulator Navigation:** Opt into simulator navmesh grounding with
  `options.simulator.navMesh.enabled = true`. The default Living Room
  environment includes a pregenerated glTF/GLB `navMeshPath`; custom
  environments can provide their own navmesh authored in the same local
  coordinate space as the simulator scene.

We welcome all contributors to foster an AI + XR community! Read our
[blog post](https://research.google/blog/xr-blocks-accelerating-ai-xr-innovation/)
and [white paper](https://arxiv.org/abs/2509.25504) for a visionary roadmap.

### Usage

[![Build Size](https://badgen.net/bundlephobia/minzip/xrblocks)](https://bundlephobia.com/result?p=xrblocks)

XR Blocks can be imported directly into a webpage using an importmap. This code
creates a basic XR scene containing a cylinder. When you view the scene, you can
pinch your fingers (in XR) or click (in the desktop simulator) to change the
cylinder's color. Check out
[this live demo](https://xrblocks.github.io/docs/templates/Basic/) with simple
code below:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Basic Example | XR Blocks</title>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, user-scalable=no"
    />
    <link
      type="text/css"
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/google/xrblocks@main/samples/main.css"
    />
    <script type="importmap">
      {
        "imports": {
          "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
          "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/",
          "three-pathfinding": "https://cdn.jsdelivr.net/npm/three-pathfinding@1.3.0/dist/three-pathfinding.module.js",
          "xrblocks": "https://cdn.jsdelivr.net/gh/google/xrblocks@build/xrblocks.js",
          "xrblocks/addons/": "https://cdn.jsdelivr.net/gh/google/xrblocks@build/addons/"
        }
      }
    </script>
  </head>
  <body>
    <script type="module">
      import * as THREE from 'three';
      import * as xb from 'xrblocks';

      /**
       * A basic example of XR Blocks to render a cylinder and pinch to change its color.
       */
      class MainScript extends xb.Script {
        init() {
          // Add a simple light to the scene.
          this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));

          // Create the 3D object.
          const geometry = new THREE.CylinderGeometry(0.2, 0.2, 0.4, 32);
          const material = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
          });
          this.player = new THREE.Mesh(geometry, material);

          // Position the object in front of the user.
          this.player.position.set(
            0,
            xb.user.height - 0.5,
            -xb.user.objectDistance
          );
          this.add(this.player);
        }

        /**
         * Changes the color of the mesh on a pinch or click.
         */
        onSelectEnd(event) {
          this.player.material.color.set(Math.random() * 0xffffff);
        }
      }

      // When the page content is loaded, add our script and initialize XR Blocks.
      document.addEventListener('DOMContentLoaded', function () {
        xb.add(new MainScript());
        xb.init(new xb.Options());
      });
    </script>
  </body>
</html>
```

### Gem

For rapid prototyping, please refer to this
[blog](https://research.google/blog/vibe-coding-xr-accelerating-ai-xr-prototyping-with-xr-blocks-and-gemini)
and try out [XR Blocks Gem](https://xrblocks.github.io/gem) on Android XR or
desktop using Chrome.

A video demonstration of XR Blocks Gem can be found
[here](https://www.youtube.com/watch?v=nknCzIxHHzw).

### Development Guide

#### Setup

```bash
# Clone the repository.
git clone --depth=1 git@github.com:google/xrblocks.git
cd xrblocks

# Install dependencies and build the SDK.
npm ci
```

After setup, either serve the samples and demos or develop locally, as described
below.

#### Serve samples and demos

Serve the repository to view samples and demos through `http://localhost:8080/`:

```bash
# Serve the repository on http://localhost:8080
npm run serve
```

#### Develop locally

For active SDK development, run watch mode and local serving together:

```bash
# Build the SDK in watch mode and serve the repository on http://localhost:8080
npm run dev
```

#### Linting and formatting

XR Blocks uses ESLint for linting and Prettier for formatting. Run the following
commands to check your code before submitting a pull request:

```bash
npm run lint # ESLint check
npm run format # Prettier format
```

If you are using VS Code, install the
[ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
and the
[Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode),
then set Prettier as your default formatter.

#### Notice

This is not an officially supported Google product, but will be actively
maintained by the XR Labs team and external collaborators. This project is not
eligible for the
[Google Open Source Software Vulnerability Rewards Program](https://bughunters.google.com/open-source-security).

### User Data & Permissions

When using specific features in this SDK (e.g., WebXR, hand tracking, camera),
users will be prompted with permission requests and the application may not
function as expected with denied permissions.

XR Blocks is an open source software development kit that does not handle data
by itself; however, the use of other APIs may collect user data and require user
permissions:

When using [WebXR](https://immersive-web.github.io/) and
[LiteRT](https://ai.google.dev/edge/litert) APIs (e.g., depth sensing, gesture
recognition), all data is stored and processed locally with on-device models.

When using AI features (e.g.,
[Gemini Live](https://gemini.google/overview/gemini-live), Gemini Flash), the
data will be sent to Gemini servers and please follow
[Gemini's Privacy & Terms](https://ai.google.dev/gemini-api/terms).

### Keep Your API Key Secure

This SDK does not require any API keys for non-AI samples. In specific AI use
cases, this SDK provides an interface to use cloud-hosted Gemini services with
XR experiences, requiring an API key from
[AI Studio](https://aistudio.google.com/app/apikey). Please follow
[this doc](https://ai.google.dev/gemini-api/docs/api-key#security) for best
practices to keep your API key secure.

Treat your Gemini API key like a password. If compromised, others can use your
project's quota, incur charges (if billing is enabled), and access your private
data, such as files.

#### Critical Security Rules

Never commit API keys to source control. Do not check your API key into version
control systems like Git.

Never expose API keys on the client-side. Do not use your API key directly in
web or mobile apps in production. Keys in client-side code (including our
JavaScript/TypeScript libraries and REST calls) can be extracted.

### Uninstallation

To remove XR Blocks from your code, simply remove the lines from your `<script
type="importmap">` tag in HTML, or `import * from xrblocks` in JavaScript, or
use `npm uninstall xrblocks` from your project directory.

### References

If you find XR Blocks inspiring or useful in your research, please reference it
as:

```bibtex
@misc{Li2025XR,
  title={{XR Blocks: Accelerating Human-centered AI + XR Innovation}},
  author={Li, David and Numan, Nels and Qian, Xun and Chen, Yanhe and Zhou, Zhongyi and Alekseev, Evgenii and Lee, Geonsun and Cooper, Alex and Xia, Min and Chung, Scott and Nelson, Jeremy and Yuan, Xiuxiu and Dias, Jolica and Bettridge, Tim and Hersh, Benjamin and Huynh, Michelle and Piascik, Konrad and Cabello, Ricardo and Kim, David and Du, Ruofei},
  year={2025},
  eprint={2509.25504},
  archivePrefix={arXiv},
  primaryClass={cs.HC},
  url={https://arxiv.org/abs/2509.25504},
}
```

```bibtex
@misc{Du2026Vibe,
  title={Vibe Coding XR: Accelerating AI + XR Prototyping with XR Blocks and Gemini},
  author={Ruofei Du and Benjamin Hersh and David Li and Nels Numan and Xun Qian and Yanhe Chen and Zhongyi Zhou and Xingyue Chen and Jiahao Ren and Robert Timothy Bettridge and Steve Toh and David Kim},
  year={2026},
  eprint={2603.24591},
  archivePrefix={arXiv},
  primaryClass={cs.HC},
  url={https://arxiv.org/abs/2603.24591},
}
```

### Terms of Service

- Please follow
  [Google's Privacy & Terms](https://policies.google.com/privacy?hl=en-US)
  when using this SDK.

- When using AI features in this SDK, please follow
  [Gemini's Privacy & Terms](https://ai.google.dev/gemini-api/terms).
