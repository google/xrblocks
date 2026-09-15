import * as xb from 'xrblocks';

class ReticleVisualizer extends xb.Script {
  static dependencies = {
    depth: xb.Depth,
  };

  constructor() {
    super();
    this.activeMeasurements = new Map();
    this.depth = null;
  }

  init({depth}) {
    this.depth = depth;
    this.add(this.createInstructions());
  }

  onSelectStart(event) {
    const controller = event.source.controller;
    if (event.surface !== this.depth.depthMesh || !event.intersection) return;

    const measurement = this.createMeasurement();
    this.add(measurement.card);
    this.activeMeasurements.set(controller, measurement);
    this.updateMeasurement(event.intersection, measurement);
  }

  onSelecting(event) {
    const measurement = this.activeMeasurements.get(event.source.controller);
    if (
      !measurement ||
      event.surface !== this.depth.depthMesh ||
      !event.intersection
    ) {
      return;
    }
    this.updateMeasurement(event.intersection, measurement);
  }

  onSelectEnd(event) {
    this.activeMeasurements.delete(event.source.controller);
  }

  createMeasurement() {
    const text = new xb.UIText({
      text: '',
      pointerEvents: 'none',
      style: {
        fontSize: 30,
        lineHeight: 1.25,
        textAlign: 'center',
      },
    });
    const card = new xb.UICard({
      size: {width: 0.48, height: 0.16},
      pointerEvents: 'none',
      children: [text],
    });
    card.add(new xb.FaceCamera({mode: 'spherical', smoothing: 1}));
    card.name = 'Depth measurement';
    return {card, text};
  }

  updateMeasurement(intersection, measurement) {
    measurement.card.position.copy(intersection.point);
    measurement.card.position.y += 0.1;
    measurement.text.text =
      `Distance: ${intersection.distance.toFixed(2)} m\n` +
      `Height: ${intersection.point.y.toFixed(2)} m`;
  }

  createInstructions() {
    const overlay = new xb.UIOverlay({
      pointerEvents: 'none',
      style: {
        width: 680,
        position: 'absolute',
        left: '50%',
        bottom: 32,
        transform: {translateX: '-50%'},
      },
      children: [
        new xb.UIText({
          text: 'DEPTH RETICLE',
          pointerEvents: 'none',
          style: {
            fontSize: 24,
            fontWeight: 'bold',
            textAlign: 'center',
          },
        }),
        new xb.UIText({
          text: 'Point at a detected surface. Hold trigger, pinch, or click to place a live measurement. Release to leave it in place.',
          pointerEvents: 'none',
          style: {
            fontSize: 20,
            lineHeight: 1.4,
            textAlign: 'center',
          },
        }),
      ],
    });
    overlay.name = 'Reticle instructions';
    return overlay;
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const options = new xb.Options();
  options.setAppTitle('XR Reticle');
  options.depth = new xb.DepthOptions(xb.xrDepthMeshOptions);
  options.reticles.enabled = true;
  options.reticles.projectOnDepthMesh = true;
  xb.add(new ReticleVisualizer());
  xb.init(options);
});
