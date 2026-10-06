import {
  abortableEffect,
  type BaseOutProperties,
  type BoundingBox,
  Content,
  type ContentOutProperties,
  type InProperties,
  type WithSignal,
} from '@pmndrs/uikit';
import {computed, signal} from '@preact/signals-core';
import * as THREE from 'three';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export type MergedSvgOutProperties = ContentOutProperties & {
  keepAspectRatio?: boolean;
  /** Not supported; pass the parsed SVG via `content` (see IconCache). */
  src?: string;
  content?: string;
};

export type MergedSvgProperties = InProperties<MergedSvgOutProperties>;

export type MergedSvgResult = {
  meshes: THREE.Mesh[];
  boundingBox: BoundingBox | undefined;
};

const svgLoader = new SVGLoader();

/**
 * Parses an SVG string into at most one mesh per fill color: all shapes
 * sharing a color are merged into a single geometry. uikit's `Svg` creates a
 * mesh per shape, which turns every multi-shape icon into several draw calls.
 *
 * The y-flip must stay a mesh scale exactly like uikit's `Svg` does — never
 * baked into the geometry. A negative matrixWorld determinant makes three
 * flip `frontFace` (WebGLState.setMaterial), which mixed-winding shapes from
 * evenodd fill rules need in order to cull like uikit's meshes do.
 */
export function parseMergedSvg(content: string): MergedSvgResult {
  const result = svgLoader.parse(content);
  const groups = new Map<string, {color: THREE.Color; shapes: THREE.Shape[]}>();
  for (const path of result.paths) {
    const shapes = SVGLoader.createShapes(path);
    if (shapes.length === 0) continue;
    const key = `${path.color.r} ${path.color.g} ${path.color.b}`;
    const group = groups.get(key);
    if (group) {
      group.shapes.push(...shapes);
    } else {
      groups.set(key, {color: path.color.clone(), shapes});
    }
  }

  const meshes: THREE.Mesh[] = [];
  for (const {color, shapes} of groups.values()) {
    const geometries = shapes.map((shape) => new THREE.ShapeGeometry(shape));
    const nonIndexed = geometries.map((geometry) => geometry.toNonIndexed());
    const merged = mergeGeometries(nonIndexed, false);
    for (const geometry of nonIndexed) geometry.dispose();
    if (merged == null) {
      // Attribute sets always match for ShapeGeometry output; keep one mesh
      // per shape rather than dropping geometry if that ever changes.
      for (const geometry of geometries) {
        meshes.push(createIconMesh(geometry, color.clone()));
      }
      continue;
    }
    for (const geometry of geometries) geometry.dispose();
    meshes.push(createIconMesh(merged, color));
  }

  return {
    meshes,
    boundingBox: computeSvgBoundingBox(result.xml as unknown as Element),
  };
}

function createIconMesh(
  geometry: THREE.BufferGeometry,
  color: THREE.Color
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({color, toneMapped: false})
  );
  mesh.matrixAutoUpdate = false;
  // SVG y-axis is flipped; uikit's Svg uses scale.y = -1. Keep it on the mesh
  // (see the note on frontFace culling above).
  mesh.scale.y = -1;
  mesh.updateMatrix();
  return mesh;
}

function computeSvgBoundingBox(xml: {
  getAttribute(name: string): string | null;
}): BoundingBox | undefined {
  const viewBoxNumbers = xml
    .getAttribute('viewBox')
    ?.split(/\s+/u)
    .map((value) => Number.parseFloat(value))
    .filter((value) => !isNaN(value));
  if (viewBoxNumbers?.length !== 4) return undefined;
  const [minX, minY, width, height] = viewBoxNumbers;
  return {
    center: new THREE.Vector3(width / 2 + minX, -height / 2 - minY, 0),
    size: new THREE.Vector3(width, height, 0.00001),
  };
}

function disposeMergedSvg(result: MergedSvgResult): void {
  for (const mesh of result.meshes) {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
}

export class MergedSvg<
  OutProperties extends MergedSvgOutProperties = MergedSvgOutProperties,
> extends Content<OutProperties> {
  protected inputConfig?:
    | {
        renderContext?: never;
        defaultOverrides?: InProperties<OutProperties>;
        defaults?: WithSignal<OutProperties>;
      }
    | undefined;

  constructor(
    inputProperties?: InProperties<OutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    inputConfig?:
      | {
          renderContext?: never;
          defaultOverrides?: InProperties<OutProperties>;
          defaults?: WithSignal<OutProperties>;
        }
      | undefined
  ) {
    const boundingBox = signal<BoundingBox | undefined>(undefined);
    super(inputProperties, initialClasses, {
      ...inputConfig,
      remeasureOnChildrenChange: false,
      depthWriteDefault: true,
      supportFillProperty: true,
      boundingBox,
    });
    this.inputConfig = inputConfig;

    // Only re-parse when the SVG source actually changes; appearance
    // updates (color, opacity, ...) reuse the parsed meshes.
    const contentSignal = computed(() => this.properties.value.content);
    abortableEffect(() => {
      const content = contentSignal.value;
      if (typeof content !== 'string' || content.length === 0) {
        boundingBox.value = undefined;
        this.notifyAncestorsChanged();
        return;
      }
      const result = parseMergedSvg(content);
      boundingBox.value = result.boundingBox;
      if (result.meshes.length > 0) super.add(...result.meshes);
      this.notifyAncestorsChanged();
      return () => {
        if (result.meshes.length > 0) super.remove(...result.meshes);
        disposeMergedSvg(result);
        this.notifyAncestorsChanged();
      };
    }, this.abortSignal);
  }

  clone(recursive?: boolean): this {
    const cloned = new MergedSvg<OutProperties>(
      this.inputProperties,
      this.initialClasses,
      this.inputConfig
    );
    this.copyInto(cloned, recursive);
    return cloned as this;
  }
}
