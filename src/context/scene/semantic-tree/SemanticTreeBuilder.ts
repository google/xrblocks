import * as THREE from 'three';

import {roundContextNumber} from '../../shared/ContextNumberUtils';
import {SemanticIdRegistry} from '../../shared/SemanticIdRegistry';
import {
  getObjectBounds,
  hasRenderableDescendant,
  isSemanticInternalObject,
} from '../../shared/SemanticObjectUtils';
import {
  SemanticBounds,
  SemanticMetadata,
  SemanticNode,
  SemanticSource,
  SemanticTree,
} from '../../shared/SemanticTypes';

type SemanticObject = THREE.Object3D & {
  isView?: boolean;
  isPanel?: boolean;
  isXRScript?: boolean;
  isUI?: boolean;
  selectable?: boolean;
  draggable?: boolean;
  disabled?: boolean;
  baseSizeX?: number;
  baseSizeY?: number;
  behaviors?: unknown[];
  text?: string;
  icon?: string;
  ux?: {
    isHovered?: () => boolean;
    isSelected?: () => boolean;
  };
  userData: THREE.Object3D['userData'] & {
    semantic?: SemanticMetadata;
  };
};

export interface SemanticTreeInternal {
  tree: SemanticTree;
  nodeObjects: Map<string, THREE.Object3D>;
  objectNodeIds: WeakMap<THREE.Object3D, string>;
}

const tempPosition = new THREE.Vector3();
const tempBoundsCenter = new THREE.Vector3();
const tempBoundsSize = new THREE.Vector3();
const tempBoundsBox = new THREE.Box3();
let snapshotCounter = 0;

export function buildSemanticTree({
  scene,
  registry,
  capturedAt,
}: {
  scene: THREE.Scene;
  registry: SemanticIdRegistry;
  capturedAt: number;
}): SemanticTreeInternal {
  scene.updateMatrixWorld(true);

  const nodes: Record<string, SemanticNode> = {};
  const rootIds: string[] = [];
  const nodeObjects = new Map<string, THREE.Object3D>();
  const objectNodeIds = new WeakMap<THREE.Object3D, string>();

  const roundedCapturedAt = roundContextNumber(capturedAt);
  const snapshotId = `ctx_snapshot_${Math.round(roundedCapturedAt)}_${snapshotCounter++}`;

  const visit = (
    object: THREE.Object3D,
    semanticParentId: string | undefined
  ) => {
    if (shouldPruneObject(object)) {
      return;
    }

    const semantic = describeSemanticObject(object);
    let nextSemanticParentId = semanticParentId;

    if (semantic) {
      const id = registry.getNodeId(object);
      const node = createSemanticNode(object, id, semantic, semanticParentId);
      nodes[id] = node;
      nodeObjects.set(id, object);
      objectNodeIds.set(object, id);
      if (semanticParentId) {
        nodes[semanticParentId]?.children.push(id);
      } else {
        rootIds.push(id);
      }
      nextSemanticParentId = id;
    }

    for (const child of object.children) {
      visit(child, nextSemanticParentId);
    }
  };

  for (const child of scene.children) {
    visit(child, undefined);
  }

  return {
    tree: {
      snapshotId,
      capturedAt: roundedCapturedAt,
      rootIds,
      nodes,
    },
    nodeObjects,
    objectNodeIds,
  };
}

function shouldPruneObject(object: THREE.Object3D): boolean {
  const maybeSemantic = (object as SemanticObject).userData.semantic;
  if (maybeSemantic?.hidden) {
    return true;
  }
  return isSemanticInternalObject(object);
}

function describeSemanticObject(object: THREE.Object3D): {
  role: string;
  name: string;
  source: SemanticSource;
  text?: string;
  traits?: string[];
  disabled?: boolean;
} | null {
  const semanticObject = object as SemanticObject;
  const override = semanticObject.userData.semantic;
  const className = object.constructor.name;

  if (override?.role || override?.name) {
    return {
      role: override.role ?? inferRole(object),
      name: override.name ?? inferName(object),
      source: override.source ?? 'app',
      text: override.text ?? inferText(object),
      traits: override.traits ?? inferTraits(object),
      disabled: override.disabled ?? inferDisabled(object),
    };
  }

  const role = inferRole(object);
  if (!role) {
    return null;
  }

  const isImplementationMesh =
    object instanceof THREE.Mesh && hasSemanticAncestor(object);
  if (isImplementationMesh) {
    return null;
  }

  if (isLayoutOnlyContainer(object, role)) {
    return null;
  }

  return {
    role,
    name: inferName(object),
    source: inferSource(object, className),
    text: inferText(object),
    traits: inferTraits(object),
    disabled: inferDisabled(object),
  };
}

function hasSemanticAncestor(object: THREE.Object3D): boolean {
  let parent = object.parent;
  while (parent) {
    const role = inferRole(parent);
    if (role && !isLayoutOnlyContainer(parent, role)) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function inferRole(object: THREE.Object3D): string {
  const semanticObject = object as SemanticObject;
  const className = object.constructor.name;
  if (semanticObject.userData.semantic?.role) {
    return semanticObject.userData.semantic.role;
  }
  if (className === 'SpatialPanel' || className === 'Panel') return 'panel';
  if (
    className === 'UICard' ||
    className === 'AdditiveUICard' ||
    isUiblocksCard(semanticObject)
  ) {
    return 'panel';
  }
  if (className === 'UIPanel') {
    return typeof (semanticObject as {onClick?: unknown}).onClick === 'function'
      ? 'button'
      : 'panel';
  }
  if (
    semanticObject.isUI &&
    typeof (semanticObject as {onClick?: unknown}).onClick === 'function'
  ) {
    return 'button';
  }
  if (className === 'TextButton' || className === 'IconButton') {
    return 'button';
  }
  if (
    className === 'TextView' ||
    className === 'LabelView' ||
    className === 'UIText' ||
    className === 'ScrollingTroikaTextView' ||
    (semanticObject.isUI && typeof semanticObject.text === 'string')
  ) {
    return 'text';
  }
  if (className === 'ImageView' || className === 'UIImage') return 'image';
  if (
    className === 'IconView' ||
    className === 'MaterialSymbolsView' ||
    className === 'UIIcon'
  ) {
    return 'icon';
  }
  if (semanticObject.isPanel || semanticObject.isUI) return 'panel';
  if (semanticObject.isView) return 'group';
  if (object instanceof THREE.Mesh) return 'object';
  if (object instanceof THREE.Group && hasRenderableDescendant(object)) {
    return object.name ? 'group' : '';
  }
  return '';
}

function isUiblocksCard(object: SemanticObject): boolean {
  return (
    object.name === 'UICard' ||
    object.name.endsWith(' Card') ||
    (object.isUI === true &&
      (typeof object.baseSizeX === 'number' ||
        typeof object.baseSizeY === 'number' ||
        Array.isArray(object.behaviors)))
  );
}

function inferName(object: THREE.Object3D): string {
  const semanticObject = object as SemanticObject;
  return (
    semanticObject.userData.semantic?.name ??
    inferText(object) ??
    object.name ??
    `${object.type}_${object.id}`
  );
}

function inferText(object: THREE.Object3D): string | undefined {
  const semanticObject = object as SemanticObject;
  return semanticObject.userData.semantic?.text ?? semanticObject.text;
}

function inferSource(
  object: THREE.Object3D,
  className = object.constructor.name
): SemanticSource {
  if ((object as SemanticObject).userData.semantic?.source) {
    return (object as SemanticObject).userData.semantic!.source!;
  }
  if (
    (object as SemanticObject).isUI ||
    className.startsWith('UI') ||
    className === 'UICard' ||
    className === 'AdditiveUICard'
  ) {
    return 'uiblocks';
  }
  if ((object as SemanticObject).isView || (object as SemanticObject).isPanel) {
    return 'xrblocks';
  }
  return 'three';
}

function inferTraits(object: THREE.Object3D): string[] | undefined {
  const semanticObject = object as SemanticObject;
  const traits = new Set<string>(
    semanticObject.userData.semantic?.traits ?? []
  );
  if (semanticObject.selectable) traits.add('selectable');
  if (semanticObject.draggable) traits.add('draggable');
  if (typeof (semanticObject as {onClick?: unknown}).onClick === 'function') {
    traits.add('selectable');
  }
  return traits.size ? [...traits] : undefined;
}

function inferDisabled(object: THREE.Object3D): boolean | undefined {
  const semanticObject = object as SemanticObject;
  return semanticObject.userData.semantic?.disabled ?? semanticObject.disabled;
}

function isLayoutOnlyContainer(object: THREE.Object3D, role: string): boolean {
  const className = object.constructor.name;
  if (role !== 'group') {
    return false;
  }
  return (
    !object.name &&
    (className === 'Row' ||
      className === 'Col' ||
      className === 'Grid' ||
      className === 'Object3D' ||
      className === 'Group')
  );
}

function createSemanticNode(
  object: THREE.Object3D,
  id: string,
  semantic: NonNullable<ReturnType<typeof describeSemanticObject>>,
  parentId: string | undefined
): SemanticNode {
  object.updateMatrixWorld(true);
  object.getWorldPosition(tempPosition);

  const node: SemanticNode = {
    id,
    role: semantic.role,
    name: semantic.name,
    visible: object.visible,
    position: [
      roundContextNumber(tempPosition.x),
      roundContextNumber(tempPosition.y),
      roundContextNumber(tempPosition.z),
    ],
    children: [],
    objectId: object.id,
    source: semantic.source,
    type: object.constructor.name || object.type,
  };

  if (parentId) node.parentId = parentId;
  if (semantic.text) node.text = semantic.text;
  if (semantic.traits?.length) node.traits = semantic.traits;
  if (semantic.disabled !== undefined) node.disabled = semantic.disabled;
  const hovered = (object as SemanticObject).ux?.isHovered?.();
  const selected = (object as SemanticObject).ux?.isSelected?.();
  if (hovered !== undefined) node.hovered = hovered;
  if (selected !== undefined) node.selected = selected;

  const bounds = getSemanticBounds(object);
  if (bounds) node.bounds = bounds;
  return node;
}

function getSemanticBounds(object: THREE.Object3D): SemanticBounds | undefined {
  const bounds = getObjectBounds(object, tempBoundsBox);
  if (!bounds) {
    return undefined;
  }
  const center = bounds.getCenter(tempBoundsCenter);
  const size = bounds.getSize(tempBoundsSize);
  return {
    center: [
      roundContextNumber(center.x),
      roundContextNumber(center.y),
      roundContextNumber(center.z),
    ],
    size: [
      roundContextNumber(size.x),
      roundContextNumber(size.y),
      roundContextNumber(size.z),
    ],
  };
}
