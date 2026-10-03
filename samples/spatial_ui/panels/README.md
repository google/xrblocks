# Spatial UI Panels & Gradient Features Gallery

This sample showcases the full styling capabilities of XR Blocks' spatial UI panel system (`xb.UIPanel`, `xb.UICard`, and `GradientPanel`), including background gradients, multi-layer shadows, customizable borders, and real-time reactive property updates.

![Panel Features Gallery](screenshot.png)

## Key Features

- **Solid & Gradient Backgrounds**: Linear, radial, angular (conic sweep), and diamond gradients with multi-stop color configurations.
- **Inner Shadows**: Configurable blur radii, spread expansion, falloff rate, directional 2D offsets, and gradient shadow paints.
- **Drop Shadows**: Smooth signed-distance field (SDF) drop shadows with blur, spread, falloff, 2D offsets, and gradient colors.
- **Strokes & Borders**: Solid and gradient borders with customizable widths and alignments (`inside`, `outside`, `center`).
- **Dynamic Property Animation**: Live per-frame reactive updates in `update(delta)` demonstrating rotating linear/angular gradient angles, sinusoidal corner radius morphing, pulsing inner shadows, and orbiting drop shadow offsets.
