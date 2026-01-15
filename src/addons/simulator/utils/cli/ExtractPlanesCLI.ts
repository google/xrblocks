import * as fs from 'fs';
import * as path from 'path';
import {GLTF, GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {findPlanesInScene} from '../PlaneExtractor';

// ==========================================
// 1. Headless Polyfills for Three.js
// ==========================================
// Three.js loaders often expect a browser environment.
// We mock just enough to get the geometry parsing to work.

Object.assign(global, {
  window: global,
  self: global,
  document: {
    createElement: (tag: string) => {
      if (tag === 'img') return {src: '', width: 0, height: 0};
      return {};
    },
    createElementNS: () => ({}),
  },
});

// ==========================================
// 2. CLI Logic
// ==========================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node extract_planes_cli.ts <path-to-gltf>');
    process.exit(1);
  }

  const filePath = args[0];
  const absolutePath = path.resolve(filePath);
  const dirName = path.dirname(absolutePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File not found at ${absolutePath}`);
    process.exit(1);
  }

  console.error(`> Loading ${path.basename(absolutePath)}...`);

  // Read the file into a buffer
  const fileBuffer = fs.readFileSync(absolutePath);
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  );

  const loader = new GLTFLoader();

  // Patch the loader to read external .bin files from disk if needed
  loader.setPath(dirName + '/');

  // GLTFLoader.parse expects (data, path, onSuccess, onError)
  loader.parse(
    arrayBuffer,
    dirName + '/', // Resource path for external textures/bins
    (gltf: GLTF) => {
      console.error('> GLTF Parsed successfully.');
      console.error('> Extracting planes...');

      try {
        // 1. Analyze Geometry
        // Adjust minArea as needed (e.g., 0.5 sqm)
        const detectedPlanes = findPlanesInScene(gltf.scene, 1.0);

        console.error(`> Found ${detectedPlanes.length} raw plane clusters.`);

        // 2. Output Result
        // We convert circular references or complex objects to simple JSON
        const output = {
          meta: {
            file: path.basename(filePath),
            generated: new Date().toISOString(),
            planeCount: detectedPlanes.length,
          },
          planes: detectedPlanes,
        };

        // Print JSON to stdout so it can be piped: `node cli.ts scene.gltf > output.json`
        console.log(JSON.stringify(output, null, 2));
      } catch (err) {
        console.error('Error extracting planes:', err);
        process.exit(1);
      }
    },
    (err) => {
      console.error('Error parsing GLTF:', err);
      process.exit(1);
    }
  );
}

main().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
