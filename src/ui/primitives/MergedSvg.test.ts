import {describe, expect, it} from 'vitest';

import {parseMergedSvg} from './MergedSvg';

// Three disjoint squares: three shapes, one fill color.
const MONOCHROME_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 2h6v6H2z"/>
  <path d="M12 2h6v6h-6z"/>
  <path d="M2 12h6v6H2z"/>
</svg>`;

// Two shapes with different fill colors.
const MULTICOLOR_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path fill="#ff0000" d="M2 2h6v6H2z"/>
  <path fill="#00ff00" d="M12 2h6v6h-6z"/>
</svg>`;

describe('parseMergedSvg', () => {
  it('merges all same-fill shapes into a single mesh', () => {
    const {meshes} = parseMergedSvg(MONOCHROME_ICON);
    expect(meshes).toHaveLength(1);

    const singleSquare = parseMergedSvg(
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2 2h6v6H2z"/></svg>'
    );
    const squareCount =
      singleSquare.meshes[0].geometry.getAttribute('position').count;
    const mergedCount = meshes[0].geometry.getAttribute('position').count;
    expect(mergedCount).toBe(squareCount * 3);
  });

  it('keeps one mesh per distinct fill color', () => {
    const {meshes} = parseMergedSvg(MULTICOLOR_ICON);
    expect(meshes).toHaveLength(2);
    const colors = meshes.map((mesh) =>
      (
        mesh.material as unknown as {color: {getHexString(): string}}
      ).color.getHexString()
    );
    expect(colors.sort()).toEqual(['00ff00', 'ff0000']);
  });

  it('exposes the viewBox bounding box', () => {
    const {boundingBox} = parseMergedSvg(MONOCHROME_ICON);
    expect(boundingBox).toBeDefined();
    expect(boundingBox!.size.x).toBe(24);
    expect(boundingBox!.size.y).toBe(24);
    expect(boundingBox!.center.x).toBe(12);
    expect(boundingBox!.center.y).toBe(-12);
  });

  it('flips Y via mesh scale exactly like uikit', () => {
    const {meshes} = parseMergedSvg(
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2 2h6v6H2z"/></svg>'
    );
    const mesh = meshes[0];
    // The flip lives on the mesh (negative-determinant matrixWorld keeps
    // three's frontFace culling parity with uikit), not in the geometry.
    expect(mesh.scale.y).toBe(-1);
    expect(mesh.matrix.elements[5]).toBe(-1);
    const positions = mesh.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      expect(positions.getY(index)).toBeGreaterThanOrEqual(1.9);
      expect(positions.getY(index)).toBeLessThanOrEqual(8.1);
    }
  });
});
