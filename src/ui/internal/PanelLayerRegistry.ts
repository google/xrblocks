import * as THREE from 'three';

/**
 * Compositor-style layering for world-space UI panels (UICard mounts).
 *
 * Where two panels overlap on screen, ordering must follow the panel stack (the
 * drag depth), not the per-pixel geometry — a tilted panel and a flat dragged
 * panel cross planes, so per-pixel depth testing interleaves their contents.
 * Each panel gets a stack level (1 = front-most) derived from its slab's world
 * depth, and the stencil buffer carries two facts per pixel in two nibbles:
 *
 * - **high nibble** = the *back-most* panel slab covering the pixel (0 = none),
 *   stamped by one mask mesh per panel;
 * - **low nibble** = the *front-most* panel content covering the pixel (15 =
 *   none), stamped by hidden twins of each solid content mesh.
 *
 * That drives three draw rules (see `UIKitNodeBinding.enforceDepthPolicy`):
 *
 * - panel content stencil-tests `GreaterEqual` its level against the low
 *   nibble, so it only draws where no panel in front of it has content (the
 *   crossing-planes bug), while staying visible through the glass of the
 *   panel in front;
 * - the glass shell (slab, backface/unified layers, edge highlight) tests
 *   `LessEqual` its level against the high nibble, so it draws opaquely
 *   wherever no panel is behind it — the world never sees through a panel —
 *   and steps aside wherever one is;
 * - each panel adds a translucent **tint twin** over its slab that tests
 *   `GreaterEqual` the next level against the high nibble, painting the
 *   panel's glass tint over the panel showing through it. The composite is
 *   "see-through tint": the back panel stays readable through the front
 *   panel's glass, tinted like real glass, with content never interleaving.
 *
 * The stencil buffer clears to 0x0f ("no content in front, no panel behind"),
 * so content outside every stamp — edge highlights, shadows, anything past
 * the slab outline — draws normally. World-space occlusion (walls, hands,
 * reticles) keeps using the regular depth buffer: the world shares one
 * coherent depth space, so per-panel layering must not touch it.
 */

/** Clear value: no panel behind (high nibble 0), no content in front (low 15). */
export const STENCIL_CLEAR = 0x0f;

const STAMP_RENDER_ORDER_BASE = -2000;
const STAMP_NAME = 'PanelLayerStamp';
const TINT_NAME = 'PanelLayerTint';
const MASK_NAME = 'PanelLayerMask';

/** Level = front-most is 1; 15 is reserved for "none" in the nibbles. */
const MAX_LEVEL = 14;

/**
 * Translucent shell meshes of a panel: they show the panel behind them (via
 * the tint twin) instead of stamping content coverage. Everything else with a
 * geometry is treated as solid content that blocks the panel behind.
 */
const SHELL_NAMES = new Set([
  'BackfaceLayer',
  'UnifiedPanelLayer',
  'UICardEdge',
  STAMP_NAME,
  TINT_NAME,
  MASK_NAME,
]);
const shellName = /caret|selection|shadow|glow|backface/i;

/** Material with the stencil state three's WebGL state accepts on any material. */
export type StencilMaterial = THREE.Material & {
  stencilWrite: boolean;
  stencilWriteMask: number;
  stencilFunc: number;
  stencilFuncMask: number;
  stencilRef: number;
  stencilFail: number;
  stencilZFail: number;
  stencilZPass: number;
};

/** Content test: draws where no panel in front has content (low nibble).
 * GL compares `ref FUNC buffer`, so "buffer >= level" is `LessEqual`. */
export function applyContentStencil(
  material: StencilMaterial,
  level: number
): void {
  material.stencilWrite = true;
  material.stencilWriteMask = 0;
  material.stencilFunc = THREE.LessEqualStencilFunc;
  material.stencilFuncMask = 0x0f;
  material.stencilRef = Math.min(level, MAX_LEVEL);
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
}

/** Glass shell test: draws opaquely where no panel is behind (high nibble).
 * "buffer <= level" is `GreaterEqual` in GL's `ref FUNC buffer` order. */
export function applyShellStencil(
  material: StencilMaterial,
  level: number
): void {
  material.stencilWrite = true;
  material.stencilWriteMask = 0;
  material.stencilFunc = THREE.GreaterEqualStencilFunc;
  material.stencilFuncMask = 0xf0;
  material.stencilRef = Math.min(level, MAX_LEVEL) << 4;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
}

function isShellMesh(
  mesh: THREE.Mesh,
  slab: THREE.Mesh | undefined,
  sizedLayout = false
): boolean {
  if (slab && mesh === slab) return true;
  const name = mesh.name || '';
  if (SHELL_NAMES.has(name) || shellName.test(name)) return true;
  // Panel-background layers (uikit's GradientPanel and its anonymous
  // gradient/border quads) span the whole slab: they are the glass, not
  // content. Stamping them made a panel's background clip the panel behind
  // it wherever the fan layout's tilted slabs project over a neighbour,
  // which cut real text at the default layout. Only applied when the layout
  // produced real per-element sizes (degenerate layouts leave every quad
  // slab-sized and would misclassify all content).
  return sizedLayout && slab ? isPanelBackground(mesh, slab) : false;
}

function worldAxes(mesh: THREE.Mesh): [number, number] {
  // Footprint = geometry size scaled by the world basis: correct whether the
  // size lives in the geometry (tests, hand-built meshes) or the matrix
  // (uikit's unit quads).
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const gx = box ? box.max.x - box.min.x : 1;
  const gy = box ? box.max.y - box.min.y : 1;
  mesh.updateWorldMatrix(true, false);
  const e = mesh.matrixWorld.elements;
  return [gx * Math.hypot(e[0], e[1], e[2]), gy * Math.hypot(e[4], e[5], e[6])];
}

function isPanelBackground(mesh: THREE.Mesh, slab: THREE.Mesh): boolean {
  mesh.updateWorldMatrix(true, false);
  slab.updateWorldMatrix(true, false);
  const [mx, my] = worldAxes(mesh);
  const [sx, sy] = worldAxes(slab);
  return mx >= 0.85 * sx && my >= 0.85 * sy;
}

function isStampEligible(
  source: THREE.Mesh,
  slab: THREE.Mesh | undefined,
  sizedLayout = false
): boolean {
  return (
    !!source.geometry &&
    source.visible &&
    !isShellMesh(source, slab, sizedLayout)
  );
}

function findSlabMesh(root: THREE.Object3D): THREE.Mesh | undefined {
  // The slab is the panel's own background quad: the largest mesh in the
  // subtree (first-match broke whenever content came first in traversal).
  let slab: THREE.Mesh | undefined;
  let slabArea = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || isShellMeshName(mesh.name)) return;
    const [w, h] = worldAxes(mesh);
    const area = w * h;
    if (!slab || area > slabArea) {
      slab = mesh;
      slabArea = area;
    }
  });
  return slab;
}

function isShellMeshName(name: string): boolean {
  return SHELL_NAMES.has(name || '');
}

/** Whether the layout produced real per-element sizes (content smaller than
 * the slab). Degenerate layouts leave every quad slab-sized, so the
 * background-footprint rule must not run there. */
function hasSizedLayout(root: THREE.Object3D, slab: THREE.Mesh): boolean {
  const [sw, sh] = worldAxes(slab);
  let sized = false;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (sized || !mesh.isMesh || mesh === slab) return;
    const [w, h] = worldAxes(mesh);
    if (w < 0.8 * sw && h < 0.8 * sh) sized = true;
  });
  return sized;
}

function createStampMesh(source: THREE.Mesh, level: number): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    stencilWrite: true,
    stencilWriteMask: 0x0f,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilRef: Math.min(level, MAX_LEVEL),
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  const stamp = new THREE.Mesh(source.geometry, material);
  stamp.name = STAMP_NAME;
  stamp.renderOrder = STAMP_RENDER_ORDER_BASE - level;
  stamp.matrixAutoUpdate = false;
  stamp.frustumCulled = source.frustumCulled;
  return stamp;
}

/** Stamps the back-most panel slab covering each pixel into the high nibble.
 * Drawn front-to-back so the back-most slab survives the replace. */
function createSlabMask(slab: THREE.Mesh, level: number): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    stencilWrite: true,
    stencilWriteMask: 0xf0,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilRef: Math.min(level, MAX_LEVEL) << 4,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  const mask = new THREE.Mesh(slab.geometry, material);
  mask.name = MASK_NAME;
  mask.renderOrder = STAMP_RENDER_ORDER_BASE + level;
  mask.matrixAutoUpdate = false;
  return mask;
}

/** Translucent glass tint painted over the panel showing through this one. */
function createTintTwin(slab: THREE.Mesh, level: number): THREE.Mesh {
  // A dark neutral tint (like real tinted glass): the panel seen through this
  // one is dimmed instead of washed lighter, which read as broken. The slab's
  // own glass color was too light here and turned every see-through region milky.
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x0d1424),
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    depthTest: true,
    stencilWrite: true,
    stencilWriteMask: 0,
    stencilFunc: THREE.LessEqualStencilFunc,
    stencilFuncMask: 0xf0,
    stencilRef: (Math.min(level, MAX_LEVEL) + 1) << 4,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.KeepStencilOp,
  });
  const tint = new THREE.Mesh(slab.geometry, material);
  tint.name = TINT_NAME;
  tint.renderOrder = 100 - level;
  tint.matrixAutoUpdate = false;
  tint.frustumCulled = slab.frustumCulled;
  return tint;
}

interface PanelRecord {
  /** Object the masks ride on (a plain Group outside the panel's layout). */
  sizedLayout: boolean;
  readonly container: THREE.Object3D;
  /** The panel's physical root, used for level lookups and content updates. */
  readonly root: THREE.Object3D;
  readonly slab: THREE.Mesh;
  readonly mask: THREE.Mesh;
  readonly tint: THREE.Mesh;
  /** source mesh -> hidden stamp twin added to `container` */
  readonly stamps: Map<THREE.Mesh, THREE.Mesh>;
  level: number;
}

class PanelLayerRegistry {
  private readonly records = new Map<THREE.Object3D, PanelRecord>();

  /**
   * Registers a panel: `root` is its physical root (the subtree whose content
   * must layer), `container` an ancestor Group outside the panel's layout
   * tree — panels reject raw meshes as children, so the stamps ride there and
   * mirror their sources' world transforms. Returns silently when the subtree
   * has no slab mesh; such subtrees keep plain depth testing.
   */
  register(container: THREE.Object3D, root: THREE.Object3D): void {
    if (this.records.has(root)) return;
    const slab = findSlabMesh(root);
    if (!slab) return;
    const level = this.records.size + 1;
    const mask = createSlabMask(slab, level);
    const tint = createTintTwin(slab, level);
    container.add(mask, tint);
    this.records.set(root, {
      container,
      root,
      slab,
      mask,
      tint,
      stamps: new Map(),
      level,
      sizedLayout: hasSizedLayout(root, slab),
    });
  }

  unregister(root: THREE.Object3D): void {
    const record = this.records.get(root);
    if (!record) return;
    for (const disposable of [
      ...record.stamps.values(),
      record.mask,
      record.tint,
    ]) {
      disposable.removeFromParent();
      (disposable.material as THREE.Material).dispose();
    }
    this.records.delete(root);
  }

  isPanelLayerStamp(object: THREE.Object3D): boolean {
    return (
      object.name === STAMP_NAME ||
      object.name === MASK_NAME ||
      object.name === TINT_NAME
    );
  }

  /** Whether this exact object is a registered panel root. */
  has(root: THREE.Object3D): boolean {
    return this.records.has(root);
  }

  /** Whether a mesh of the registered panel is its translucent glass shell. */
  isGlassShell(root: THREE.Object3D, mesh: THREE.Mesh): boolean {
    const record = this.records.get(root);
    return isShellMesh(mesh, record?.slab, record?.sizedLayout);
  }

  /** Stack level of a registered panel (1 = front-most). Unregistered = 1. */
  getLevel(root: THREE.Object3D): number {
    return this.records.get(root)?.level ?? 1;
  }

  /** All content stamp meshes (for diagnostics and tests). */
  stampMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const record of this.records.values()) {
      meshes.push(...record.stamps.values());
    }
    return meshes;
  }

  /** All slab mask and tint meshes (for diagnostics and tests). */
  shellMeshes(): {masks: THREE.Mesh[]; tints: THREE.Mesh[]} {
    const masks: THREE.Mesh[] = [];
    const tints: THREE.Mesh[] = [];
    for (const record of this.records.values()) {
      masks.push(record.mask);
      tints.push(record.tint);
    }
    return {masks, tints};
  }

  /**
   * Syncs stamps (creation, pruning, transforms) and recomputes stack levels
   * from slab depth, pushing them to mask, tint and content materials. Cheap
   * enough to call every frame. Panels are ordered by their slab's world z
   * (deeper = behind), which is what a drag establishes.
   */
  update(): void {
    if (this.records.size === 0) return;
    const depth = new Map<THREE.Object3D, number>();
    const position = new THREE.Vector3();
    for (const record of this.records.values()) {
      record.root.updateWorldMatrix(true, false);
      record.container.updateWorldMatrix(true, false);
      const containerInverse = record.container.matrixWorld.clone().invert();
      const syncTo = (target: THREE.Mesh, source: THREE.Mesh) => {
        source.updateWorldMatrix(true, false);
        target.matrix.copy(containerInverse).multiply(source.matrixWorld);
        target.matrixWorldNeedsUpdate = true;
      };
      syncTo(record.mask, record.slab);
      syncTo(record.tint, record.slab);
      // Content can rebuild at any time (present() replaces the subtree), so
      // discover stamp sources every frame; stale twins are pruned below.
      record.root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (
          mesh.isMesh &&
          isStampEligible(mesh, record.slab, record.sizedLayout)
        ) {
          this.ensureStamp(record, mesh);
        }
      });
      for (const [source, stamp] of record.stamps) {
        if (
          !source.parent ||
          !isStampEligible(source, record.slab, record.sizedLayout)
        ) {
          stamp.removeFromParent();
          (stamp.material as THREE.Material).dispose();
          record.stamps.delete(source);
          continue;
        }
        syncTo(stamp, source);
      }
      record.slab.getWorldPosition(position);
      depth.set(record.root, position.z);
    }
    if (this.records.size < 2) return;
    const ordered = [...this.records.values()].sort(
      (a, b) => (depth.get(b.root) ?? 0) - (depth.get(a.root) ?? 0)
    );
    ordered.forEach((record, index) => {
      record.level = Math.min(index + 1, MAX_LEVEL);
    });
    for (const record of this.records.values()) {
      const level = record.level;
      record.mask.renderOrder = STAMP_RENDER_ORDER_BASE + level;
      record.tint.renderOrder = 100 - level;
      (record.mask.material as StencilMaterial).stencilRef = level << 4;
      (record.tint.material as StencilMaterial).stencilRef = (level + 1) << 4;
      for (const stamp of record.stamps.values()) {
        const material = stamp.material as StencilMaterial;
        material.stencilRef = level;
        stamp.renderOrder = STAMP_RENDER_ORDER_BASE - level;
      }
      record.root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || this.isPanelLayerStamp(mesh)) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const entry of materials as StencilMaterial[]) {
          // Layered content runs the stencil unit with a zero write mask
          // (see UIKitNodeBinding.enforceDepthPolicy); track its level.
          if (entry.stencilWrite && entry.stencilWriteMask === 0) {
            entry.stencilRef = isShellMesh(
              mesh,
              record.slab,
              record.sizedLayout
            )
              ? level << 4
              : level;
          }
        }
      });
    }
  }

  private ensureStamp(record: PanelRecord, source: THREE.Mesh): void {
    if (record.stamps.has(source)) return;
    const stamp = createStampMesh(source, record.level);
    record.container.add(stamp);
    record.stamps.set(source, stamp);
  }
}

export const panelLayers = new PanelLayerRegistry();
