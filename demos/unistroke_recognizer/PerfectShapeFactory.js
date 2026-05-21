import * as THREE from 'three';

export class PerfectShapeFactory {
  static getGeometry(name) {
    const geom = new THREE.BufferGeometry();
    let points = [];
    const size = 0.05; // 5cm radius

    switch (name) {
      case 'Circle':
        for (let i = 0; i <= 32; i++) {
          const angle = (i / 32) * Math.PI * 2;
          points.push(
            new THREE.Vector3(Math.cos(angle) * size, Math.sin(angle) * size, 0)
          );
        }
        break;
      case 'Rectangle':
        points = [
          new THREE.Vector3(-size * 1.5, -size, 0),
          new THREE.Vector3(-size * 1.5, size, 0),
          new THREE.Vector3(size * 1.5, size, 0),
          new THREE.Vector3(size * 1.5, -size, 0),
          new THREE.Vector3(-size * 1.5, -size, 0),
        ];
        break;
      case 'Triangle':
        points = [
          new THREE.Vector3(0, size, 0),
          new THREE.Vector3(-size, -size, 0),
          new THREE.Vector3(size, -size, 0),
          new THREE.Vector3(0, size, 0),
        ];
        break;
      case 'V':
        points = [
          new THREE.Vector3(-size, size, 0),
          new THREE.Vector3(0, -size, 0),
          new THREE.Vector3(size, size, 0),
        ];
        break;
      case 'Caret':
        points = [
          new THREE.Vector3(-size, -size, 0),
          new THREE.Vector3(0, size, 0),
          new THREE.Vector3(size, -size, 0),
        ];
        break;
      default:
        return null;
    }

    geom.setFromPoints(points);
    return geom;
  }

  static getFillGeometry(name) {
    const size = 0.05;
    const shape = new THREE.Shape();

    switch (name) {
      case 'Circle':
        shape.absarc(0, 0, size, 0, Math.PI * 2, false);
        break;
      case 'Rectangle':
        shape.moveTo(-size * 1.5, -size);
        shape.lineTo(-size * 1.5, size);
        shape.lineTo(size * 1.5, size);
        shape.lineTo(size * 1.5, -size);
        shape.lineTo(-size * 1.5, -size);
        break;
      case 'Triangle':
        shape.moveTo(0, size);
        shape.lineTo(-size, -size);
        shape.lineTo(size, -size);
        shape.lineTo(0, size);
        break;
      case 'V':
        shape.moveTo(-size, size);
        shape.lineTo(0, -size);
        shape.lineTo(size, size);
        shape.closePath();
        break;
      case 'Caret':
        shape.moveTo(-size, -size);
        shape.lineTo(0, size);
        shape.lineTo(size, -size);
        shape.closePath();
        break;
      default:
        return null;
    }

    return new THREE.ShapeGeometry(shape);
  }
}
