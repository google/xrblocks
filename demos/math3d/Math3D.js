import {Parser} from 'expr-eval';
import * as THREE from 'three';
import {ParametricGeometry} from 'three/addons/geometries/ParametricGeometry.js';
import * as xb from 'xrblocks';
import {Keyboard} from 'xrblocks/addons/virtualkeyboard/Keyboard.js'

const MATH_OBJECTS = [{
  functionText: 'x^2 - y^2',
}];

export class Math3D extends xb.Script {
  constructor() {
    super();

    // Loads data.
    this.mathObjects = MATH_OBJECTS;
    this.graph = null;
    this.functionDisplay = null;
    this.keyboard = null;

    // Initializes UI.
    const panel = new xb.SpatialPanel({
      backgroundColor: '#00000000',
      useDefaultPosition: false,
      showEdge: false
    });
    panel.isRoot = true;
    this.add(panel);

    this.descriptionPagerState =
        new xb.PagerState({pages: this.mathObjects.length});
    const grid = panel.addGrid();

    const imageRow = grid.addRow({weight: 1.0});
    this.imagePager =
        new xb.HorizontalPager({state: this.descriptionPagerState});
    imageRow.addCol({weight: 1.0}).add(this.imagePager);
    const meshAxes = this.createCoordinateGridAxes();
    for (let i = 0; i < this.mathObjects.length; i++) {
      this.imagePager.children[i].add(meshAxes[0]);
      this.imagePager.children[i].add(meshAxes[1]);
      this.imagePager.children[i].add(meshAxes[2]);
    }
    grid.addRow({weight: 0.1});
    const controlRow = grid.addRow({weight: 0.4});

    const ctrlPanel = controlRow.addPanel({backgroundColor: '#000000D9'});

    const ctrlGrid = ctrlPanel.addGrid();
    {
      const leftColumn = ctrlGrid.addCol({weight: 0.1});
      const midColumn = ctrlGrid.addCol({weight: 0.8});
      const descRow = midColumn.addRow({weight: 0.8});

      this.add(this.descriptionPagerState);
      this.descriptionPager = new xb.HorizontalPager(
          {state: this.descriptionPagerState, enableRaycastOnChildren: false});
      descRow.add(this.descriptionPager);

      for (let i = 0; i < this.mathObjects.length; i++) {
        const initialFunction = this.mathObjects[i].functionText;
        this.functionDisplay = this.descriptionPager.children[i].add(new xb.TextButton({
          text: initialFunction,
          fontColor: '#ffffff',
          fontSize: 0.06,
          backgroundColor: '#00000000'  // Make background transparent
        }));
      }
    }

    const orbiter = ctrlGrid.addOrbiter();
    orbiter.addExitButton();

    panel.updateLayouts();

    this.panel = panel;
  }

  init() {
    xb.core.renderer.localClippingEnabled = true;

    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 5.0);
    light.position.set(-0.5, 4, 1.0);
    this.add(light);

    this.panel.position.set(0, 1.9, -1.0);

    this.keyboard = new Keyboard();
    this.add(this.keyboard);
    this.keyboard.position.set(0, -0.3, 0);

    this.keyboard.onEnterPressed = (newFunctionText) => {
      this.mathObjects[this.descriptionPagerState.currentPage].functionText =
          newFunctionText;
      this.updateGraph(newFunctionText);
    };

    this.keyboard.onTextChanged = (currentText) => {
      if (this.functionDisplay) {
        this.functionDisplay.text = currentText;
      }
    };

    this.updateGraph('x^2 - y^2');
    console.log('Math3D UIs: ', xb.core.ui.views);
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
      const currentPage = this.descriptionPagerState.currentPage;
      this.imagePager.children[currentPage].add(this.graph);
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
        color: 0xff0000
      },
      {
        startVector: new THREE.Vector3(0, gridLength, 0),
        endVector: new THREE.Vector3(0, -gridLength, 0),
        color: 0x0000ff
      },
      {
        startVector: new THREE.Vector3(0, 0, gridLength),
        endVector: new THREE.Vector3(0, 0, -gridLength),
        color: 0x00ff00
      },
    ];

    var axes = [];
    for (let i = 0; i < gridVectors.length; i++) {
      var axisGeometry = new THREE.BufferGeometry().setFromPoints(
          [gridVectors[i].startVector, gridVectors[i].endVector]);
      var axisMaterial =
          new THREE.LineBasicMaterial({color: gridVectors[i].color});
      var axisLine = new THREE.Line(axisGeometry, axisMaterial);
      axes.push(axisLine);
    }
    return axes;
  }

  createParametricMesh(zFunctionText) {
    var xMin = -5, xMax = 5, xRange = xMax - xMin;
    var yMin = -5, yMax = 5, yRange = yMax - yMin;
    var zFunction = Parser.parse(zFunctionText).toJSFunction(['x', 'y']);
    var parametricFunction = function(x, y, target) {
      var x = xRange * x + xMin;
      var y = yRange * y + yMin;
      var z = zFunction(x, y);

      target.set(x, y, z);
    };

    const slices = 25;  // Number of segments along the 'u' direction
    const stacks = 25;  // Number of segments along the 'v' direction
    var graphGeometry =
        new ParametricGeometry(parametricFunction, slices, stacks, true);
    // Rotate 90 degrees around X so that the Z axis points upwards.
    graphGeometry.rotateX(-Math.PI / 2);
    graphGeometry.scale(0.025, 0.025, 0.025);
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load('images/gradient.png')
    const material = new THREE.MeshBasicMaterial(
        {map: texture, transparent: true, side: THREE.DoubleSide});
    material.opacity = 0.75;
    const mesh = new THREE.Mesh(graphGeometry, material);
    return mesh;
  }
};
