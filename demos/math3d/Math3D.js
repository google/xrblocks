import {Parser} from 'expr-eval';
import * as THREE from 'three';
import {ParametricGeometry} from 'three/addons/geometries/ParametricGeometry.js';
import * as xb from 'xrblocks';
import {Keyboard} from 'xrblocks/addons/virtualkeyboard/Keyboard.js';

const MATH_OBJECTS = [
  {
    functionText: 'x^2 - y^2',
  },
];

export class Math3D extends xb.Script {
  constructor() {
    super();

    // Loads data.
    this.mathObjects = MATH_OBJECTS;
    this.graph = null;
    this.keyboard = null;
    this.graphRoot = new THREE.Group();
    this.graphRoot.position.set(0, 1.65, -1);
    this.add(this.graphRoot);

    const meshAxes = this.createCoordinateGridAxes();
    this.graphRoot.add(...meshAxes);

    this.functionDisplay = new xb.UIText({
      text: this.mathObjects[0].functionText,
      style: {
        width: '100%',
        minHeight: 48,
        color: '#ffffff',
        fontSize: 28,
        fontWeight: 'bold',
        textAlign: 'center',
      },
    });
  }

  init() {
    xb.core.renderer.localClippingEnabled = true;

    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 5.0);
    light.position.set(-0.5, 4, 1.0);
    this.add(light);

    const startFn = this.mathObjects[0].functionText;
    this.keyboard = new Keyboard({
      value: startFn,
      onValueChange: (value) => {
        this.functionDisplay.text = value;
      },
      onSubmit: (value) => {
        this.mathObjects[0].functionText = value;
        this.updateGraph(value);
      },
    });

    const inputCard = new xb.UICard({
      size: {width: 0.9, height: 0.5},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 12,
        padding: 20,
        backgroundColor: '#16171bd9',
        borderRadius: 24,
      },
      children: [this.functionDisplay, this.keyboard],
    });
    inputCard.position.set(0, 0.9, -1);
    inputCard.rotation.x = -Math.PI / 10;
    this.add(inputCard);

    this.updateGraph('x^2 - y^2');
  }

  updateGraph(functionText) {
    if (!functionText || functionText.trim() === '') return;

    try {
      if (this.graph && this.graph.parent) {
        this.graph.parent.remove(this.graph);
        this.graph.geometry.dispose();
        this.graph.material.dispose();
      }
      this.graph = this.createParametricMesh(functionText);
      this.graphRoot.add(this.graph);
      this.functionDisplay.text = functionText;
    } catch (e) {
      console.error('Error creating graph:', e);
      this.functionDisplay.text = 'Error: Invalid function';
    }
  }

  createCoordinateGridAxes(gridLength = 0.25) {
    const gridVectors = [
      {
        startVector: new THREE.Vector3(gridLength, 0, 0),
        endVector: new THREE.Vector3(-gridLength, 0, 0),
        color: 0xff0000,
      },
      {
        startVector: new THREE.Vector3(0, gridLength, 0),
        endVector: new THREE.Vector3(0, -gridLength, 0),
        color: 0x0000ff,
      },
      {
        startVector: new THREE.Vector3(0, 0, gridLength),
        endVector: new THREE.Vector3(0, 0, -gridLength),
        color: 0x00ff00,
      },
    ];

    var axes = [];
    for (let i = 0; i < gridVectors.length; i++) {
      var axisGeometry = new THREE.BufferGeometry().setFromPoints([
        gridVectors[i].startVector,
        gridVectors[i].endVector,
      ]);
      var axisMaterial = new THREE.LineBasicMaterial({
        color: gridVectors[i].color,
      });
      var axisLine = new THREE.Line(axisGeometry, axisMaterial);
      axisLine.xb = {pointerEvents: 'none'};
      axes.push(axisLine);
    }
    return axes;
  }

  createParametricMesh(zFunctionText) {
    var xMin = -5,
      xMax = 5,
      xRange = xMax - xMin;
    var yMin = -5,
      yMax = 5,
      yRange = yMax - yMin;

    const Z_LIMIT = 25; // Maximum absolute value for z to prevent extreme spikes in the graph
    var zFunction = Parser.parse(zFunctionText).toJSFunction(['x', 'y']);
    var parametricFunction = (u, v, target) => {
      const x = xRange * u + xMin;
      const y = yRange * v + yMin;

      let z;
      try {
        z = zFunction(x, y);
        // Clamp the value to stay between -Z_LIMIT and Z_LIMIT
        z = xb.clamp(z, -Z_LIMIT, Z_LIMIT);

        // Handle cases where the math results in NaN (not a number)
        if (isNaN(z)) z = 0;
      } catch (e) {
        z = 0;
      }

      target.set(x, y, z);
    };

    const slices = 25; // Number of segments along the 'u' direction
    const stacks = 25; // Number of segments along the 'v' direction
    var graphGeometry = new ParametricGeometry(
      parametricFunction,
      slices,
      stacks,
      true
    );
    // Rotate 90 degrees around X so that the Z axis points upwards.
    graphGeometry.rotateX(-Math.PI / 2);
    graphGeometry.scale(0.015, 0.015, 0.015);
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load('images/gradient.png');
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    material.opacity = 0.75;
    const mesh = new THREE.Mesh(graphGeometry, material);
    mesh.xb = {pointerEvents: 'none'};
    return mesh;
  }
}
