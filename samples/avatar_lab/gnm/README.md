# GNM XR Blocks Demo

- Live demo: https://xrblocks.github.io/docs/samples/GNM-Head/
- Recording: https://www.youtube.com/watch?v=bOFyFlFIcdU

Introduces a purely browser-based demonstration for the Generative aNthropometric Model (GNM) that runs across desktop, mobile, and Android XR devices. This demo leverages the XR Blocks SDK for 3D scene management, rendering, and spatial UI.

- Core WebGL/JS components: GNMModel, GNMControls, GNMScene, and SemanticSampler to handle model logic, rendering, and interactions.
- Demo web application structure: index.html, main.js, and CSS files.
- Python export utility (tools/export_gnm_web.py) to convert GNM weights into web-optimized binary formats.

The webcam tracking part is ported from [GNM Webcam Puppet](https://github.com/edualvarado/gnm-webcam-puppet) by Eduardo Alvarado.
