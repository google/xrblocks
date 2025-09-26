# XR Blocks

[![NPM Package](https://img.shields.io/npm/v/xrblocks)](https://www.npmjs.com/package/xrblocks)
[![Build Size](https://badgen.net/bundlephobia/minzip/xrblocks)](https://bundlephobia.com/result?p=xrblocks)
[![NPM Downloads](https://img.shields.io/npm/dw/xrblocks)](https://www.npmtrends.com/xrblocks)

#### JavaScript library for rapid XR and AI prototyping

[Manual](https://xrblocks.github.io/docs/) &mdash;
[Templates](https://xrblocks.github.io/docs/templates/Basic) &mdash;
[Samples](https://xrblocks.github.io/docs/samples/ModelViewer) &mdash;

### Description

**XR Blocks** is a lightweight, cross-platform library for rapidly prototyping
advanced XR and AI experiences. Built upon [three.js](https://threejs.org), it
targets Chrome v136+ with WebXR support on Android XR and also includes a
powerful desktop simulator for development. The framework emphasizes a
user-centric, developer-friendly SDK designed to simplify the creation of
immersive applications with features like:

-   **Hand Tracking & Gestures:** Access advanced hand tracking, custom
    gestures with TensorFlow Lite / LiteRT models, and interaction events.
-   **World Understanding:** Present samples with depth sensing, geometry-aware
    physics, and object recognition with Gemini in both XR and desktop.
-   **AI Integration:** Seamlessly connect to Gemini for multimodal
    understanding and live conversational experiences.
-   **Cross-Platform:** Write once and deploy to both XR devices and desktop
    browsers.

### Usage

XR Blocks can be imported directly into a webpage using an importmap. This code
creates a basic XR scene containing a cylinder. When you view the scene, you can
pinch your fingers (in XR) or click (in the desktop simulator) to change the
cylinder's color.

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
      href="[https://xrblocks.github.io/site/css/main.css](https://xrblocks.github.io/site/css/main.css)"
    />
    <script type="importmap">
      {
        "imports": {
          "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
          "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
          "xrblocks": "https://xrblocks.github.io/sdk/build/xrblocks.js",
          "xrblocks/addons/": "https://xrblocks.github.io/sdk/build/addons/"
        }
      }
    </script>
  </head>
  <body>
    <script type="module">
      import * as THREE from "three";
      import * as xb from "xrblocks";

      /**
       * A basic example of XRBlocks to render a cylinder and pinch to change its color.
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
      document.addEventListener("DOMContentLoaded", function () {
        xb.add(new MainScript());
        xb.init(new xb.Options());
      });
    </script>
  </body>
</html>
```

### Development guide

Follow the steps below to clone the repository and build XR Blocks:

```bash
# Clone the repository.
git clone --depth=1 git@github.com:google/xrblocks.git
cd xrblocks

# Install dependencies.
npm ci

# Build xrblocks.js.
npm run build
```

This is not an officially supported Google product. This project is not eligible
for the
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

To remove XR Blocks from your code, simple remove the lines from your `<script
type="importmap">` tag in HTML, or `import * from xrblocks` in JavaScript, or
use `npm uninstall xrblocks` from your project directory.

### Terms of Service

-   Please follow
    [Google's Privacy & Terms](https://ai.google.dev/gemini-api/terms) when
    using this SDK.

-   When using AI features in this SDK, please follow
    [Gemini's Privacy & Terms](https://ai.google.dev/gemini-api/terms).
