import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as uikit from '@pmndrs/uikit';
import * as THREE from 'three';
import {
  ManipulationBehavior,
  UICore,
  UIPanel,
  UIText,
  raycastSortFunction,
} from 'uiblocks';
import * as xb from 'xrblocks';

const refreshMs = 3000;

function summarizeTree(tree) {
  return {
    snapshotId: tree.snapshotId,
    capturedAt: Math.round(tree.capturedAt),
    rootIds: tree.rootIds,
    nodes: Object.fromEntries(
      Object.values(tree.nodes).map((node) => [
        node.id,
        {
          role: node.role,
          name: node.name,
          parentId: node.parentId,
          children: node.children,
          visible: node.visible,
          traits: node.traits,
          source: node.source,
          type: node.type,
          objectId: node.objectId,
        },
      ])
    ),
  };
}

function summarizeVisibleObjects(tree) {
  return {
    snapshotId: tree.snapshotId,
    capturedAt: Math.round(tree.capturedAt),
    nodes: Object.fromEntries(
      Object.values(tree.nodes).map((node) => [
        node.id,
        {
          role: node.role,
          name: node.name,
          visible: node.visible,
          view: node.view,
        },
      ])
    ),
  };
}

function summarizeSom(som) {
  return {
    snapshotId: som.snapshotId,
    capturedAt: Math.round(som.capturedAt),
    marks: som.marks,
  };
}

function writeJson(element, value) {
  element.textContent = JSON.stringify(value, null, 2);
}

function createDraggableCube({name, color, position}) {
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(position);
  group.draggable = true;
  group.draggingMode = xb.DragMode.TRANSLATING;
  group.userData.semantic = {
    role: 'draggable-object',
    name,
    traits: ['draggable', 'selectable'],
  };

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.28, 0.28),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.48,
      metalness: 0.08,
    })
  );
  mesh.name = `${name} Mesh`;
  group.add(mesh);

  return group;
}

function createDraggableSphere({name, color, position}) {
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(position);
  group.draggable = true;
  group.draggingMode = xb.DragMode.TRANSLATING;
  group.userData.semantic = {
    role: 'draggable-object',
    name,
    traits: ['draggable', 'selectable'],
  };

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 32, 18),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.42,
      metalness: 0.16,
    })
  );
  mesh.name = `${name} Mesh`;
  group.add(mesh);

  return group;
}

function createDraggableTorus({name, color, position}) {
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(position);
  group.draggable = true;
  group.draggingMode = xb.DragMode.TRANSLATING;
  group.userData.semantic = {
    role: 'draggable-object',
    name,
    traits: ['draggable', 'selectable'],
  };

  const mesh = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.15, 0.045, 96, 14),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.36,
      metalness: 0.24,
    })
  );
  mesh.name = `${name} Mesh`;
  group.add(mesh);

  return group;
}

class ContextBugtestScene extends xb.Script {
  constructor() {
    super();
    this.uiCore = new UICore(this);
  }

  init() {
    if (xb.core.input.raycaster) {
      xb.core.input.raycaster.sortFunction = raycastSortFunction;
    }

    this.add(new THREE.HemisphereLight(0xffffff, 0x606060, 2.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(1.2, 2.6, 1.4);
    this.add(keyLight);

    const objects = [
      createDraggableCube({
        name: 'Amber Cube',
        color: 0xffb000,
        position: new THREE.Vector3(-0.48, xb.user.height - 0.42, -1.15),
      }),
      createDraggableSphere({
        name: 'Cyan Sphere',
        color: 0x42d9ff,
        position: new THREE.Vector3(0, xb.user.height - 0.36, -1.25),
      }),
      createDraggableTorus({
        name: 'Rose Knot',
        color: 0xff4f8b,
        position: new THREE.Vector3(0.48, xb.user.height - 0.4, -1.15),
      }),
    ];

    for (const object of objects) {
      this.add(object);
    }

    this.createUiblocksCard();
  }

  createUiblocksCard() {
    const card = this.uiCore.createCard({
      name: 'UIBlocks Debug Card',
      sizeX: 0.72,
      sizeY: 0.42,
      position: new THREE.Vector3(0, xb.user.height + 0.05, -1.32),
      behaviors: [
        new ManipulationBehavior({
          draggable: true,
          faceCamera: true,
          manipulationMargin: 80,
          manipulationCornerRadius: 36,
        }),
      ],
    });

    const panel = new UIPanel({
      width: '100%',
      height: '100%',
      fillColor: '#0a0e12',
      strokeWidth: 3,
      strokeColor: '#42d9ff',
      cornerRadius: 32,
      padding: 28,
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 24,
    });
    panel.name = 'UIBlocks Debug Panel';
    card.add(panel);

    panel.add(
      new UIText('UIBlocks Card', {
        fontSize: 44,
        fontWeight: 'bold',
        color: '#42d9ff',
      })
    );
    panel.add(
      new UIText('draggable semantic surface', {
        fontSize: 28,
        color: 'white',
        textAlign: 'center',
      })
    );
    const actionButton = new UIPanel({
      width: 260,
      height: 72,
      fillColor: '#245a6a',
      strokeWidth: 2,
      strokeColor: '#7cecff',
      cornerRadius: 24,
      pointerEvents: 'auto',
      justifyContent: 'center',
      alignItems: 'center',
      onClick: () => {
        console.log('UIBlocks debug action clicked');
        return true;
      },
    });
    actionButton.name = 'UIBlocks Action Button';
    actionButton.userData.semantic = {
      role: 'button',
      name: 'Ping Button',
      text: 'Ping',
      source: 'uiblocks',
      traits: ['selectable'],
    };
    actionButton.add(
      new UIText('Ping', {
        fontSize: 30,
        fontWeight: 'bold',
        color: '#ffffff',
        textAlign: 'center',
      })
    );
    panel.add(actionButton);

    return card;
  }
}

class ContextOutputVisualizer {
  constructor() {
    this.status = document.getElementById('status');
    this.semanticTreeOutput = document.getElementById('semanticTreeOutput');
    this.visibleObjectsOutput = document.getElementById('visibleObjectsOutput');
    this.somOutput = document.getElementById('somOutput');
    this.somImage = document.getElementById('somImage');
    this.semanticTreeEnabled = document.getElementById('semanticTreeEnabled');
    this.visibleObjectsEnabled = document.getElementById(
      'visibleObjectsEnabled'
    );
    this.somEnabled = document.getElementById('somEnabled');
    this.running = false;
    this.refreshing = false;
    this.handleToggleChange = () => this.syncRunner();
    this.semanticTreeEnabled.addEventListener(
      'change',
      this.handleToggleChange
    );
    this.visibleObjectsEnabled.addEventListener(
      'change',
      this.handleToggleChange
    );
    this.somEnabled.addEventListener('change', this.handleToggleChange);
  }

  start() {
    this.syncRunner();
  }

  hasEnabledVisualization() {
    return (
      this.semanticTreeEnabled.checked ||
      this.visibleObjectsEnabled.checked ||
      this.somEnabled.checked
    );
  }

  syncRunner() {
    if (!this.hasEnabledVisualization()) {
      this.stop();
      this.status.textContent = 'disabled';
      this.semanticTreeOutput.textContent = 'disabled';
      this.visibleObjectsOutput.textContent = 'disabled';
      this.somOutput.textContent = 'disabled';
      this.somImage.removeAttribute('src');
      this.somImage.style.display = 'none';
      return;
    }
    if (this.running) return;
    this.running = true;
    this.refresh();
    this.interval = window.setInterval(() => this.refresh(), refreshMs);
  }

  stop() {
    if (!this.running) return;
    window.clearInterval(this.interval);
    this.interval = undefined;
    this.running = false;
  }

  async refresh() {
    if (!this.hasEnabledVisualization()) {
      this.stop();
      return;
    }
    if (this.refreshing) {
      this.status.textContent = 'skipping slow refresh';
      return;
    }
    this.refreshing = true;
    this.status.textContent = 'running';
    try {
      const context = xb.context.scene
        ? await xb.context.scene.runContextDetection({
            semanticTree: this.semanticTreeEnabled.checked,
            visibleObjects: this.visibleObjectsEnabled.checked,
            setOfMark: this.somEnabled.checked,
          })
        : {};
      const semanticTree = context.semanticTree ?? null;
      const visibleObjects = context.visibleObjects ?? null;
      const som = context.setOfMark ?? null;

      if (semanticTree) {
        writeJson(this.semanticTreeOutput, summarizeTree(semanticTree));
      } else {
        this.semanticTreeOutput.textContent = 'disabled';
      }
      if (visibleObjects) {
        writeJson(
          this.visibleObjectsOutput,
          summarizeVisibleObjects(visibleObjects)
        );
      } else {
        this.visibleObjectsOutput.textContent = 'disabled';
      }
      if (som) {
        writeJson(this.somOutput, summarizeSom(som));
      } else {
        this.somOutput.textContent = 'disabled';
      }

      if (som?.image) {
        this.somImage.src = som.image;
        this.somImage.style.display = 'block';
      } else if (!som) {
        this.somImage.removeAttribute('src');
        this.somImage.style.display = 'none';
      }
      this.status.textContent = `ok ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      console.error(error);
      this.status.textContent = 'error';
      this.somOutput.textContent = String(error?.stack ?? error);
    } finally {
      this.refreshing = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const options = new xb.Options()
    .enableUI()
    .enableAutomationMode({hideSimulatorUi: false})
    .enableContext();
  options.uikit.enable(uikit);
  options.context.scene.pollingIntervalMs = refreshMs;

  xb.add(new ContextBugtestScene());
  await xb.init(options);

  new ContextOutputVisualizer().start();
});
