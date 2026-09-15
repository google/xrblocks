import * as THREE from 'three';
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
  group.xb = {
    manipulation: {
      actions: {translate: {faceCamera: false}},
      handle: {action: xb.ManipulationAction.Translate},
    },
  };
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
  group.xb = {
    manipulation: {
      actions: {translate: {faceCamera: false}},
      handle: {action: xb.ManipulationAction.Translate},
    },
  };
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
  group.xb = {
    manipulation: {
      actions: {translate: {faceCamera: false}},
      handle: {action: xb.ManipulationAction.Translate},
    },
  };
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
  init() {
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

    this.createContextCard();
  }

  createContextCard() {
    const actionButton = new xb.UIButton({
      label: 'Ping',
      onClick: () => {
        console.log('XRBlocks debug action clicked');
      },
      style: {width: 260},
    });
    actionButton.name = 'XRBlocks Action Button';
    actionButton.userData.semantic = {
      role: 'button',
      name: 'Ping Button',
      text: 'Ping',
      source: 'xrblocks',
      traits: ['selectable'],
    };

    const card = new xb.UICard({
      size: {width: 0.72, height: 0.42},
      manipulation: {
        actions: {translate: {faceCamera: true}},
        handle: {action: xb.ManipulationAction.Translate},
      },
      edge: true,
      style: {
        justifyContent: 'center',
        alignItems: 'center',
        gap: 24,
      },
      children: [
        new xb.UIText({
          text: 'XRBlocks Card',
          style: {fontSize: 44, fontWeight: 'bold'},
        }),
        new xb.UIText({
          text: 'draggable semantic surface',
          style: {fontSize: 28, textAlign: 'center'},
        }),
        actionButton,
      ],
    });
    card.name = 'XRBlocks Debug Card';
    card.position.set(0, xb.user.height + 0.05, -1.32);
    this.add(card);

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
    .enableAutomationMode({
      hideSimulatorUi: false,
      defaultMode: xb.SimulatorMode.USER,
      enableHands: false,
    })
    .enableContext();
  options.context.scene.pollingIntervalMs = refreshMs;

  xb.add(new ContextBugtestScene());
  await xb.init(options);

  new ContextOutputVisualizer().start();
});
