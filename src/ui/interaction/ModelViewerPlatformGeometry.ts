import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

import {ModelViewerPlatformCornerGeometry} from './ModelViewerPlatformCornerGeometry.js';

/**
 * A factory function that constructs the complete geometry for a
 * `ModelViewerPlatform`. It combines several sub-geometries: four rounded
 * corners, four straight side tubes, and the flat top and bottom surfaces.
 * @param width - The total width of the platform.
 * @param depth - The total depth of the platform.
 * @param thickness - The thickness of the platform.
 * @param cornerRadius - The radius of the rounded corners.
 * @returns A merged `THREE.BufferGeometry` for the entire platform.
 */
export function createPlatformGeometry(
    width = 1, depth = 1, thickness = 0.02, cornerRadius = 0.03,
    cornerWidthSegments = 5, radialSegments = 5) {
  const sideGeometries = createPlatformSideGeometries(
      width, depth, thickness, cornerRadius, cornerWidthSegments,
      radialSegments);
  const sideGeometriesVertexCount = sideGeometries.reduce((acc, val) => {
    return acc + val.index!.count;
  }, 0);
  const flatGeometries = createPlatformFlatGeometries(
      width, depth, thickness, cornerRadius, cornerWidthSegments);
  const flatGeometriesVertexCount = flatGeometries.reduce((acc, val) => {
    return acc + val.index!.count;
  }, 0);
  const allGeometries = [...sideGeometries, ...flatGeometries];
  const mergedGeometry = BufferGeometryUtils.mergeGeometries(allGeometries);
  allGeometries.forEach(geometry => geometry.dispose());
  mergedGeometry.addGroup(0, sideGeometriesVertexCount, 0);
  mergedGeometry.addGroup(
      sideGeometriesVertexCount, flatGeometriesVertexCount, 1);
  mergedGeometry.computeBoundingBox();
  return mergedGeometry;
}

function createPlatformSideGeometries(
    width = 1, depth = 1, thickness = 0.01, cornerRadius = 0.03,
    cornerWidthSegments = 5, radialSegments = 5) {
  const cornerGeometry =
      new ModelViewerPlatformCornerGeometry(
          cornerRadius, thickness / 2, radialSegments, cornerWidthSegments)
          .rotateX(Math.PI / 2);
  const cornerGeometry1 =
      cornerGeometry.clone()
          .rotateY(2 * Math.PI / 2)
          .translate(
              -(width / 2 - cornerRadius), 0, -(depth / 2 - cornerRadius));
  const cornerGeometry2 =
      cornerGeometry.clone()
          .rotateY(3 * Math.PI / 2)
          .translate(
              -(width / 2 - cornerRadius), 0, (depth / 2 - cornerRadius));
  const cornerGeometry3 =
      cornerGeometry.clone()
          .rotateY(4 * Math.PI / 2)
          .translate((width / 2 - cornerRadius), 0, (depth / 2 - cornerRadius));
  const cornerGeometry4 =
      cornerGeometry.rotateY(5 * Math.PI / 2)
          .translate(
              (width / 2 - cornerRadius), 0, -(depth / 2 - cornerRadius));
  const cornerTubes =
      [cornerGeometry1, cornerGeometry2, cornerGeometry3, cornerGeometry4];

  const widthTube =
      new THREE
          .CylinderGeometry(
              thickness / 2, thickness / 2, (width - 2 * cornerRadius),
              radialSegments, 1, true, 0, Math.PI)
          .rotateZ(Math.PI / 2);
  const widthTube1 =
      widthTube.clone().rotateX(-Math.PI / 2).translate(0, 0, -depth / 2);
  const widthTube2 = widthTube.rotateX(Math.PI / 2).translate(0, 0, depth / 2);

  const depthTube =
      new THREE
          .CylinderGeometry(
              thickness / 2, thickness / 2, (depth - 2 * cornerRadius),
              radialSegments, 1, true, 0, Math.PI)
          .rotateX(-Math.PI / 2);
  const depthTube1 =
      depthTube.clone().rotateY(Math.PI).translate(-width / 2, 0, 0);
  const depthTube2 = depthTube.translate(width / 2, 0, 0);
  const sideTubes = [widthTube1, widthTube2, depthTube1, depthTube2];
  return [...cornerTubes, ...sideTubes];
}

function createPlatformFlatGeometries(
    width = 1, depth = 1, thickness = 0.01, cornerRadius = 0.03,
    cornerWidthSegments = 5) {
  const widthMinusRadius = width - 2 * cornerRadius;
  const depthMinusRadius = depth - 2 * cornerRadius;
  const longQuad =
      new THREE.PlaneGeometry(width, depthMinusRadius).rotateX(-Math.PI / 2);
  const shortQuad = new THREE.PlaneGeometry(widthMinusRadius, cornerRadius)
                        .rotateX(-Math.PI / 2);
  const shortQuadTranslationZ = depthMinusRadius / 2 + cornerRadius / 2;
  const shortQuad1 = shortQuad.clone().translate(0, 0, shortQuadTranslationZ);
  const shortQuad2 = shortQuad.translate(0, 0, -shortQuadTranslationZ)
  const quadGeometries = [longQuad, shortQuad1, shortQuad2];

  const cornerCircle =
      new THREE
          .CircleGeometry(cornerRadius, cornerWidthSegments, 0, Math.PI / 2)
          .rotateX(-Math.PI / 2);
  const circleTranslationZ = depthMinusRadius / 2;
  const circleTranslationX = widthMinusRadius / 2;
  const cornerCircle1 =
      cornerCircle.clone()
          .rotateY(3 * Math.PI / 2)
          .translate(circleTranslationX, 0, circleTranslationZ);
  const cornerCircle2 =
      cornerCircle.clone()
          .rotateY(0 * Math.PI / 2)
          .translate(circleTranslationX, 0, -circleTranslationZ);
  const cornerCircle3 =
      cornerCircle.clone()
          .rotateY(1 * Math.PI / 2)
          .translate(-circleTranslationX, 0, -circleTranslationZ);
  const cornerCircle4 =
      cornerCircle.clone()
          .rotateY(2 * Math.PI / 2)
          .translate(-circleTranslationX, 0, circleTranslationZ);
  const circleGeometries =
      [cornerCircle1, cornerCircle2, cornerCircle3, cornerCircle4];
  const topGeometries = [...quadGeometries, ...circleGeometries];
  const bottomGeometries = topGeometries.map(geometry => {
    return geometry.clone().rotateX(Math.PI).translate(0, -thickness / 2, 0);
  });
  topGeometries.forEach(geometry => geometry.translate(0, thickness / 2, 0));
  return [...topGeometries, ...bottomGeometries];
}
