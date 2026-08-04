import * as THREE from 'three';

import type {Interaction} from '../../../interaction/Interaction';
import {getUIElementKind, isUIElement} from '../../../ui/UIElement';
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
  disabled?: boolean;
  text?: string;
  icon?: string;
  label?: string;
  ariaLabel?: string;
  value?: number;
  min?: number;
  max?: number;
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
  interaction,
}: {
  scene: THREE.Scene;
  registry: SemanticIdRegistry;
  capturedAt: number;
  interaction?: Interaction;
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
    if (object.userData.xrblocksPrivateSelf === true) {
      for (const child of object.children) {
        visit(child, semanticParentId);
      }
      return;
    }
    if (shouldPruneObject(object)) {
      return;
    }

    const semantic = describeSemanticObject(object, interaction);
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

function describeSemanticObject(
  object: THREE.Object3D,
  interaction?: Interaction
): {
  role: string;
  name: string;
  source: SemanticSource;
  text?: string;
  traits?: string[];
  disabled?: boolean;
  selected?: boolean;
  hovered?: boolean;
  value?: number;
  min?: number;
  max?: number;
} | null {
  const semanticObject = object as SemanticObject;
  const override = semanticObject.userData.semantic;

  if (override?.role || override?.name) {
    return {
      role: override.role ?? inferRole(object),
      name: override.name ?? inferName(object),
      source: override.source ?? 'app',
      text: override.text ?? inferText(object),
      traits: override.traits ?? inferTraits(object),
      disabled: override.disabled ?? inferDisabled(object),
      selected: interaction?.isSelectingAt(object),
      hovered: interaction?.isHovered(object),
      ...inferValue(object),
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
    source: inferSource(object),
    text: inferText(object),
    traits: inferTraits(object),
    disabled: inferDisabled(object),
    selected: interaction?.isSelectingAt(object),
    hovered: interaction?.isHovered(object),
    ...inferValue(object),
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
  if (semanticObject.userData.semantic?.role) {
    return semanticObject.userData.semantic.role;
  }
  if (isUIElement(object)) {
    const kind = getUIElementKind(object);
    if (kind === 'button') return 'button';
    if (kind === 'slider') return 'slider';
    if (kind === 'text') return 'text';
    if (kind === 'image' || kind === 'icon') return 'image';
    return 'group';
  }
  if (object instanceof THREE.Mesh) return 'object';
  if (object instanceof THREE.Group && hasRenderableDescendant(object)) {
    return object.name ? 'group' : '';
  }
  return '';
}

function inferName(object: THREE.Object3D): string {
  const semanticObject = object as SemanticObject;
  return (
    semanticObject.ariaLabel ??
    semanticObject.label ??
    semanticObject.text ??
    semanticObject.icon ??
    semanticObject.userData.semantic?.name ??
    semanticObject.userData.semantic?.text ??
    object.name ??
    `${object.type}_${object.id}`
  );
}

function inferText(object: THREE.Object3D): string | undefined {
  const semanticObject = object as SemanticObject;
  return semanticObject.userData.semantic?.text ?? semanticObject.text;
}

function inferSource(object: THREE.Object3D): SemanticSource {
  if ((object as SemanticObject).userData.semantic?.source) {
    return (object as SemanticObject).userData.semantic!.source!;
  }
  if (isUIElement(object)) return 'xrblocks';
  return 'three';
}

function inferTraits(object: THREE.Object3D): string[] | undefined {
  const semanticObject = object as SemanticObject;
  const traits = new Set<string>(
    semanticObject.userData.semantic?.traits ?? []
  );
  if (semanticObject.xb?.manipulation) traits.add('manipulable');
  if (
    isUIElement(object) &&
    (getUIElementKind(object) === 'button' ||
      getUIElementKind(object) === 'slider') &&
    object.xb?.interactionEnabled !== false &&
    !inferDisabled(object)
  ) {
    traits.add('selectable');
  }
  return traits.size ? [...traits] : undefined;
}

function inferValue(
  object: THREE.Object3D
): Pick<SemanticNode, 'value' | 'min' | 'max'> {
  if (!isUIElement(object) || getUIElementKind(object) !== 'slider') return {};
  const slider = object as SemanticObject;
  return {value: slider.value, min: slider.min, max: slider.max};
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
  return !object.name && (className === 'Object3D' || className === 'Group');
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
    visible: isEffectivelyVisible(object),
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
  if (semantic.selected !== undefined) node.selected = semantic.selected;
  if (semantic.hovered !== undefined) node.hovered = semantic.hovered;
  if (semantic.value !== undefined) node.value = semantic.value;
  if (semantic.min !== undefined) node.min = semantic.min;
  if (semantic.max !== undefined) node.max = semantic.max;
  const bounds = getSemanticBounds(object);
  if (bounds) node.bounds = bounds;
  return node;
}

function isEffectivelyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
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
