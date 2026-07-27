import * as THREE from 'three';

const LABEL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function formatLabel(index: number): string {
  let value = index;
  let label = '';
  do {
    label = LABEL_ALPHABET[value % LABEL_ALPHABET.length] + label;
    value = Math.floor(value / LABEL_ALPHABET.length) - 1;
  } while (value >= 0);
  return label;
}

export class SemanticIdRegistry {
  private nextNodeIndex = 1;
  private nextLabelIndex = 0;
  private nodeIds = new WeakMap<THREE.Object3D, string>();
  private labels = new WeakMap<THREE.Object3D, string>();

  getNodeId(object: THREE.Object3D): string {
    let id = this.nodeIds.get(object);
    if (!id) {
      id = `ctx_${this.nextNodeIndex++}`;
      this.nodeIds.set(object, id);
    }
    return id;
  }

  getMarkLabel(object: THREE.Object3D): string {
    let label = this.labels.get(object);
    if (!label) {
      label = formatLabel(this.nextLabelIndex++);
      this.labels.set(object, label);
    }
    return label;
  }
}
