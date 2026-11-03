import * as THREE from 'three';
import * as xb from 'xrblocks';

class SceneUnderstanding extends xb.Script {
  scanning = false;

  init() {
    this.markers = new THREE.Group();
    this.add(this.markers);

    this.resultsText = new xb.UIText({
      text: 'Press Scan to detect visible objects in your view.',
      style: {
        width: '100%',
        padding: 16,
        backgroundColor: '#111722',
        borderRadius: 14,
        fontSize: 16,
        lineHeight: 1.4,
        whiteSpace: 'pre-line',
      },
    });
    this.scanButton = new xb.UIButton({
      label: 'Scan',
      icon: 'radar',
      style: {flexGrow: 1},
      onClick: () => void this.scan(),
    });
    this.clearButton = new xb.UIButton({
      label: 'Clear',
      icon: 'delete',
      style: {flexGrow: 1},
      onClick: () => this.resetResults(),
    });

    const card = new xb.UICard({
      size: {width: 0.62, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {flexDirection: 'column', gap: 16, padding: 20},
      children: [
        new xb.UIText({
          text: 'Scene Understanding',
          style: {fontSize: 32, fontWeight: 'bold', textAlign: 'center'},
        }),
        new xb.UIText({
          text: 'Detect visible objects with MediaPipe and place 3D labels.',
          style: {fontSize: 17, opacity: 0.72, textAlign: 'center'},
        }),
        this.resultsText,
        new xb.UIPanel({
          style: {width: '100%', flexDirection: 'row', gap: 12},
          children: [this.scanButton, this.clearButton],
        }),
      ],
    });
    card.position.set(0, 1.4, -1.1);
    this.add(card);
  }

  async scan() {
    if (this.scanning) return;
    this.scanning = true;
    this.scanButton.disabled = true;
    this.scanButton.label = 'Scanning…';
    this.resultsText.text = 'Scanning scene…';

    try {
      const objects = await xb.world.objects.runDetection();
      this.renderDetections(objects);
    } catch (error) {
      console.error('Scene scan failed.', error);
      this.clearVisualizations();
      this.resultsText.text = `Scan failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
    } finally {
      this.scanning = false;
      this.scanButton.disabled = false;
      this.scanButton.label = 'Scan';
    }
  }

  renderDetections(objects) {
    this.clearVisualizations();

    if (!objects.length) {
      this.resultsText.text =
        'No objects detected. Look toward furniture or objects and scan again.';
      return;
    }

    const cameraPosition = new THREE.Vector3();
    xb.core.camera.getWorldPosition(cameraPosition);

    const lines = objects.map((object, index) => {
      this.addDetectionMarker(object, index);
      const distance = object.position.distanceTo(cameraPosition).toFixed(2);
      return `${index + 1}. ${object.label} (${distance} m)`;
    });

    this.resultsText.text = `Found ${objects.length} object${
      objects.length === 1 ? '' : 's'
    }:\n${lines.join('\n')}`;
  }

  addDetectionMarker(object, index) {
    const markerGroup = new THREE.Group();
    markerGroup.position.copy(object.position);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 20, 20),
      new THREE.MeshBasicMaterial({color: 0x4e8cff})
    );
    sphere.xb = {pointerEvents: 'none'};
    markerGroup.add(sphere);

    const labelChildren = [];
    if (object.image) {
      labelChildren.push(
        new xb.UIImage({
          src: object.image,
          ariaLabel: object.label,
          pointerEvents: 'none',
          style: {
            width: 44,
            height: 44,
            objectFit: 'cover',
            borderRadius: 10,
          },
        })
      );
    }
    labelChildren.push(
      new xb.UIText({
        text: `${index + 1}. ${object.label}`,
        style: {fontSize: 20, fontWeight: 'bold'},
      })
    );

    const labelCard = new xb.UICard({
      size: {width: 0.24, height: 'auto'},
      anchorY: 'bottom',
      style: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 10,
        borderRadius: 14,
      },
      children: labelChildren,
    });
    labelCard.position.set(0, 0.05, 0);
    labelCard.add(new xb.FaceCamera({mode: 'spherical', smoothing: 1}));
    markerGroup.add(labelCard);

    this.markers.add(markerGroup);
  }

  resetResults() {
    xb.world.objects?.clear();
    this.clearVisualizations();
    this.resultsText.text =
      'Press Scan to detect visible objects in your view.';
  }

  clearVisualizations() {
    if (this.markers) {
      xb.disposeObjectChildren(this.markers);
    }
  }

  dispose() {
    this.clearVisualizations();
  }
}

const options = new xb.Options();
options.enableCamera('environment');
options.enableDepth();
options.enableObjectDetection();
options.world.objects.backendConfig.activeBackend = 'mediapipe';
options.world.objects.backendConfig.mediapipe.scoreThreshold = 0.35;
options.world.objects.showDebugVisualizations = new URLSearchParams(
  window.location.search
).has('debug');

xb.add(new SceneUnderstanding());
await xb.init(options);
