import * as THREE from 'three';
import { ModelLoader } from 'xrblocks';

function material(color, roughness = 0.8, metalness = 0) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
/** Derives a coordinated lighter or darker companion of the requested color. */
function shade(base, lightness, saturation = 1) {
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    return new THREE.Color().setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s * saturation, 0, 1), THREE.MathUtils.clamp(hsl.l * lightness, 0.03, 0.97));
}
/** Derives a hue-shifted accent that still tracks the requested color. */
function accent(base, hueOffset, lightness = 1) {
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    return new THREE.Color().setHSL((hsl.h + hueOffset) % 1, THREE.MathUtils.clamp(Math.max(hsl.s, 0.25), 0, 1), THREE.MathUtils.clamp(Math.max(hsl.l, 0.12) * lightness, 0.03, 0.97));
}
/** Mixes a fixed natural tone with the requested color. */
function blend(tone, base, amount) {
    return new THREE.Color(tone).lerp(base, amount);
}
function box(width, height, depth, surface, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), surface);
    mesh.position.set(x, y, z);
    return mesh;
}
function tube(radiusTop, radiusBottom, height, surface, x = 0, y = 0, z = 0, segments = 16) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), surface);
    mesh.position.set(x, y, z);
    return mesh;
}
/** Repeats one owned geometry and material at several offsets. */
function scatter(geometry, surface, offsets) {
    return offsets.map(([x, y, z]) => {
        const mesh = new THREE.Mesh(geometry, surface);
        mesh.position.set(x, y, z);
        return mesh;
    });
}
function assemble(name, ...parts) {
    const root = new THREE.Group();
    root.name = name;
    root.add(...parts.flat());
    return root;
}
/** A small deterministic generator, so an asset looks the same every time. */
function sequence(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}
function createSofa(color) {
    const base = new THREE.Color(color);
    const body = material(base, 0.85);
    const cushion = material(shade(base, 1.25, 0.9), 0.9);
    const leg = material(shade(base, 0.35, 0.6), 0.5, 0.25);
    return assemble('sofa', box(1.8, 0.2, 0.85, body, 0, 0.28), box(1.8, 0.47, 0.16, body, 0, 0.615, -0.345), box(0.16, 0.28, 0.85, body, -0.82, 0.52), box(0.16, 0.28, 0.85, body, 0.82, 0.52), box(0.78, 0.14, 0.7, cushion, -0.42, 0.45, 0.03), box(0.78, 0.14, 0.7, cushion, 0.42, 0.45, 0.03), box(0.76, 0.3, 0.08, cushion, -0.42, 0.6, -0.22), box(0.76, 0.3, 0.08, cushion, 0.42, 0.6, -0.22), scatter(new THREE.CylinderGeometry(0.045, 0.035, 0.18, 10), leg, [
        [-0.75, 0.09, 0.33],
        [0.75, 0.09, 0.33],
        [-0.75, 0.09, -0.33],
        [0.75, 0.09, -0.33],
    ]));
}
function createArmchair(color) {
    const base = new THREE.Color(color);
    const body = material(base, 0.85);
    const cushion = material(shade(base, 1.25, 0.9), 0.9);
    const leg = material(shade(base, 0.35, 0.6), 0.5, 0.25);
    return assemble('armchair', box(0.8, 0.2, 0.8, body, 0, 0.28), box(0.8, 0.52, 0.16, body, 0, 0.64, -0.32), box(0.13, 0.3, 0.72, body, -0.335, 0.53, 0.02), box(0.13, 0.3, 0.72, body, 0.335, 0.53, 0.02), box(0.6, 0.14, 0.66, cushion, 0, 0.45, 0.02), box(0.56, 0.32, 0.08, cushion, 0, 0.62, -0.2), scatter(new THREE.CylinderGeometry(0.04, 0.03, 0.18, 10), leg, [
        [-0.3, 0.09, 0.28],
        [0.3, 0.09, 0.28],
        [-0.3, 0.09, -0.28],
        [0.3, 0.09, -0.28],
    ]));
}
function createCoffeeTable(color) {
    const base = new THREE.Color(color);
    const top = material(base, 0.6);
    const trim = material(shade(base, 0.45, 0.8), 0.55, 0.15);
    return assemble('coffee-table', box(1, 0.05, 0.55, top, 0, 0.425), box(0.9, 0.04, 0.45, trim, 0, 0.38), box(0.85, 0.03, 0.42, top, 0, 0.14), scatter(new THREE.BoxGeometry(0.06, 0.4, 0.06), trim, [
        [-0.45, 0.2, 0.235],
        [0.45, 0.2, 0.235],
        [-0.45, 0.2, -0.235],
        [0.45, 0.2, -0.235],
    ]));
}
function createBookshelf(color) {
    const base = new THREE.Color(color);
    const frame = material(base, 0.7);
    const panel = material(shade(base, 0.6, 0.9), 0.85);
    const spines = [
        material(accent(base, 0.5, 1.1), 0.8),
        material(accent(base, 0.08, 0.75), 0.8),
        material(accent(base, 0.33, 1.3), 0.8),
        material(accent(base, 0.62, 0.9), 0.8),
    ];
    const random = sequence(0x5e1f);
    const books = [];
    for (const shelfY of [0.05, 0.48, 0.91, 1.34]) {
        let x = -0.46;
        for (let index = 0; index < 5 && x < 0.36; index++) {
            const width = 0.05 + random() * 0.035;
            const height = 0.2 + random() * 0.12;
            const spine = spines[Math.floor(random() * spines.length)];
            books.push(box(width, height, 0.2, spine, x + width / 2, shelfY + height / 2, 0.02));
            x += width + 0.005 + random() * 0.03;
        }
    }
    return assemble('bookshelf', box(1.1, 1.8, 0.03, panel, 0, 0.9, -0.145), box(0.05, 1.8, 0.32, frame, -0.525, 0.9), box(0.05, 1.8, 0.32, frame, 0.525, 0.9), box(1, 0.05, 0.3, frame, 0, 0.025, 0.01), box(1, 0.05, 0.3, frame, 0, 1.775, 0.01), box(1, 0.04, 0.3, frame, 0, 0.46, 0.01), box(1, 0.04, 0.3, frame, 0, 0.89, 0.01), box(1, 0.04, 0.3, frame, 0, 1.32, 0.01), books);
}
function createFloorLamp(color) {
    const base = new THREE.Color(color);
    const metal = material(shade(base, 0.4, 0.5), 0.35, 0.6);
    const glow = shade(base, 1.5, 0.7);
    const shadeMaterial = new THREE.MeshStandardMaterial({
        color: base,
        roughness: 0.6,
        emissive: glow,
        emissiveIntensity: 0.45,
        side: THREE.DoubleSide,
    });
    const bulbMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a18,
        roughness: 0.4,
        emissive: shade(base, 1.9, 0.35),
        emissiveIntensity: 1.6,
    });
    const shadeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.34, 20, 1, true), shadeMaterial);
    shadeMesh.position.y = 1.53;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), bulbMaterial);
    bulb.position.y = 1.44;
    return assemble('floor-lamp', tube(0.25, 0.25, 0.04, metal, 0, 0.02, 0, 20), tube(0.02, 0.028, 1.4, metal, 0, 0.7, 0, 10), shadeMesh, bulb);
}
function createPlant(color) {
    const base = new THREE.Color(color);
    const pot = material(base, 0.85);
    const rim = material(shade(base, 1.3, 0.9), 0.8);
    const soil = material(blend(0x3b2a1d, base, 0.2), 1);
    const stem = material(blend(0x4c7a3a, base, 0.25), 0.9);
    const foliage = material(blend(0x4f9b45, base, 0.35), 0.85);
    const highlight = material(blend(0x76c05f, base, 0.3), 0.85);
    const random = sequence(0x2b17);
    const leaves = [];
    const leafGeometry = new THREE.SphereGeometry(0.12, 8, 6);
    for (let index = 0; index < 6; index++) {
        const angle = (index / 6) * Math.PI * 2 + random() * 0.5;
        const height = 0.6 + random() * 0.33;
        const radius = 0.1 + random() * 0.055;
        const leaf = new THREE.Mesh(leafGeometry, index % 2 === 0 ? foliage : highlight);
        leaf.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
        leaf.scale.set(1, 0.55, 0.7);
        leaf.rotation.set(0, -angle, 0.35);
        leaves.push(leaf);
    }
    return assemble('plant', tube(0.19, 0.14, 0.26, pot, 0, 0.13, 0, 14), tube(0.2, 0.2, 0.04, rim, 0, 0.26, 0, 14), tube(0.175, 0.175, 0.02, soil, 0, 0.26, 0, 14), tube(0.014, 0.018, 0.42, stem, 0, 0.46, 0, 8), leaves);
}
function createPlinth(color) {
    const base = new THREE.Color(color);
    const column = material(base, 0.7);
    const cap = material(shade(base, 1.3, 0.85), 0.6);
    const foot = material(shade(base, 0.45, 0.8), 0.75);
    return assemble('plinth', box(0.45, 0.06, 0.45, foot, 0, 0.03), box(0.36, 0.72, 0.36, column, 0, 0.42), box(0.45, 0.05, 0.45, cap, 0, 0.825));
}
function createArtPanel(color) {
    const base = new THREE.Color(color);
    const canvasMaterial = material(base, 0.9);
    const frame = material(shade(base, 0.4, 0.7), 0.7);
    const stand = material(shade(base, 0.3, 0.5), 0.45, 0.4);
    const relief = [
        material(shade(base, 0.55, 1), 0.85),
        material(shade(base, 1.45, 0.8), 0.85),
        material(accent(base, 0.5, 1.15), 0.85),
        material(accent(base, 0.12, 1.3), 0.8),
    ];
    const shapes = [
        { x: -0.19, y: 0.22, width: 0.22, height: 0.34, tone: 0 },
        { x: 0.02, y: 0.28, width: 0.16, height: 0.2, tone: 1 },
        { x: 0.2, y: 0.1, width: 0.16, height: 0.48, tone: 2 },
        { x: -0.09, y: -0.19, width: 0.32, height: 0.16, tone: 1 },
        { x: 0.17, y: -0.27, width: 0.14, height: 0.14, tone: 3 },
    ];
    const artwork = shapes.map(({ x, y, width, height, tone }) => box(width, height, 0.02, relief[tone], x, 0.8 + y, 0.045));
    const discGeometry = new THREE.CylinderGeometry(0.055, 0.055, 0.02, 18);
    for (const [x, y, tone] of [
        [-0.2, -0.25, 1],
        [0.09, 0.3, 3],
    ]) {
        const disc = new THREE.Mesh(discGeometry, relief[tone]);
        disc.position.set(x, 0.8 + y, 0.05);
        disc.rotation.x = Math.PI / 2;
        artwork.push(disc);
    }
    return assemble('art-panel', box(0.5, 0.05, 0.16, stand, 0, 0.025), box(0.04, 0.32, 0.04, stand, -0.18, 0.2), box(0.04, 0.32, 0.04, stand, 0.18, 0.2), box(0.75, 0.9, 0.05, frame, 0, 0.8), box(0.67, 0.82, 0.02, canvasMaterial, 0, 0.8, 0.03), artwork);
}
function createArch(color) {
    const base = new THREE.Color(color);
    const stone = material(base, 0.85);
    const detail = material(shade(base, 0.55, 0.8), 0.8);
    const outline = new THREE.Shape();
    outline.moveTo(-1.2, 0);
    outline.lineTo(-1.2, 1.2);
    outline.absarc(0, 1.2, 1.2, Math.PI, 0, true);
    outline.lineTo(1.2, 0);
    outline.lineTo(-1.2, 0);
    const opening = new THREE.Path();
    opening.moveTo(-0.82, 0);
    opening.lineTo(-0.82, 1.2);
    opening.absarc(0, 1.2, 0.82, Math.PI, 0, true);
    opening.lineTo(0.82, 0);
    opening.lineTo(-0.82, 0);
    outline.holes.push(opening);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, {
        depth: 0.3,
        bevelEnabled: false,
        curveSegments: 10,
    }), stone);
    body.position.z = -0.15;
    return assemble('arch', body, box(0.22, 0.24, 0.3, detail, 0, 2.28), box(0.5, 0.12, 0.3, detail, -0.95, 0.06), box(0.5, 0.12, 0.3, detail, 0.95, 0.06));
}
function createBuilding(color) {
    const base = new THREE.Color(color);
    const facade = material(base, 0.85);
    const trim = material(shade(base, 1.35, 0.6), 0.75);
    const glass = new THREE.MeshStandardMaterial({
        color: shade(base, 1.7, 0.35),
        roughness: 0.25,
        metalness: 0.15,
        emissive: shade(base, 1.5, 0.4),
        emissiveIntensity: 0.2,
    });
    const door = material(shade(base, 0.35, 0.7), 0.7);
    const offsets = [];
    for (const y of [0.16, 0.29, 0.42, 0.55]) {
        for (const x of [-0.09, 0, 0.09]) {
            offsets.push([x, y, 0.161]);
        }
    }
    const windows = scatter(new THREE.BoxGeometry(0.06, 0.08, 0.006), glass, offsets);
    return assemble('building', box(0.32, 0.6, 0.32, facade, 0, 0.3), box(0.35, 0.04, 0.35, trim, 0, 0.62), box(0.22, 0.14, 0.22, facade, 0, 0.71), box(0.24, 0.02, 0.24, trim, 0, 0.79), box(0.08, 0.12, 0.006, door, 0, 0.06, 0.161), windows);
}
function createTree(color) {
    const base = new THREE.Color(color);
    const canopy = material(base, 0.85);
    const upper = material(shade(base, 1.3, 0.9), 0.85);
    const trunk = material(blend(0x6b4a2f, base, 0.15), 0.9);
    return assemble('tree', tube(0.022, 0.032, 0.18, trunk, 0, 0.09, 0, 8), new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.2, 7), canopy).translateY(0.24), new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.17, 7), canopy).translateY(0.34), new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 7), upper).translateY(0.43));
}
function createBox(color) {
    return assemble('box', box(0.5, 0.5, 0.5, material(color, 0.75), 0, 0.25));
}
function createSphere(color) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 16), material(color, 0.6));
    mesh.position.y = 0.25;
    return assemble('sphere', mesh);
}
function createCylinder(color) {
    return assemble('cylinder', tube(0.2, 0.2, 0.7, material(color, 0.7), 0, 0.35, 0, 24));
}
function createCone(color) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 24), material(color, 0.7));
    mesh.position.y = 0.35;
    return assemble('cone', mesh);
}
/**
 * Builds the built-in procedural catalog. Every factory returns a fresh,
 * detached object whose geometry and materials it exclusively owns, so
 * Roomcraft can dispose one scene object without affecting another.
 *
 * @returns A new array of trusted assets, safe to extend or filter.
 */
function createDefaultCatalog() {
    return [
        {
            id: 'sofa',
            description: 'A three-seat sofa with cushions and short legs',
            size: [1.8, 0.85, 0.85],
            create: createSofa,
        },
        {
            id: 'armchair',
            description: 'A single upholstered armchair with a seat cushion',
            size: [0.8, 0.9, 0.8],
            create: createArmchair,
        },
        {
            id: 'coffee-table',
            description: 'A low rectangular coffee table with a lower shelf',
            size: [1, 0.45, 0.55],
            create: createCoffeeTable,
        },
        {
            id: 'bookshelf',
            description: 'A tall four-shelf bookcase holding assorted books',
            size: [1.1, 1.8, 0.32],
            create: createBookshelf,
        },
        {
            id: 'floor-lamp',
            description: 'A standing floor lamp with a glowing shade',
            size: [0.5, 1.7, 0.5],
            create: createFloorLamp,
        },
        {
            id: 'plant',
            description: 'A potted leafy houseplant',
            size: [0.55, 1, 0.55],
            create: createPlant,
        },
        {
            id: 'plinth',
            description: 'A gallery display pedestal for showing a small object',
            size: [0.45, 0.85, 0.45],
            create: createPlinth,
        },
        {
            id: 'art-panel',
            description: 'A freestanding art panel with an abstract relief artwork',
            size: [0.75, 1.25, 0.16],
            create: createArtPanel,
        },
        {
            id: 'arch',
            description: 'A freestanding archway or gateway to walk through',
            size: [2.4, 2.4, 0.3],
            create: createArch,
        },
        {
            id: 'building',
            description: 'A miniature city building with a simple windowed facade',
            size: [0.35, 0.8, 0.35],
            create: createBuilding,
        },
        {
            id: 'tree',
            description: 'A miniature conifer tree for a model city or landscape',
            size: [0.25, 0.5, 0.25],
            create: createTree,
        },
        {
            id: 'box',
            description: 'A plain cube',
            size: [0.5, 0.5, 0.5],
            create: createBox,
        },
        {
            id: 'sphere',
            description: 'A plain sphere',
            size: [0.5, 0.5, 0.5],
            create: createSphere,
        },
        {
            id: 'cylinder',
            description: 'A plain upright cylinder',
            size: [0.4, 0.7, 0.4],
            create: createCylinder,
        },
        {
            id: 'cone',
            description: 'A plain upright cone',
            size: [0.5, 0.7, 0.5],
            create: createCone,
        },
    ];
}
function tint(object, color) {
    const tintedMaterials = new Set();
    object.traverse((child) => {
        const renderable = child;
        if (!renderable.material)
            return;
        const materials = Array.isArray(renderable.material)
            ? renderable.material
            : [renderable.material];
        for (const item of materials) {
            if (tintedMaterials.has(item))
                continue;
            tintedMaterials.add(item);
            const tinted = item;
            if (tinted.color instanceof THREE.Color) {
                tinted.color.multiply(color);
            }
        }
    });
}
/**
 * Wraps a preauthored glTF or glb model as a catalog asset. Supply a URL the
 * application controls; a planner can never introduce one. The loader
 * propagates network and decoding failures instead of substituting a
 * placeholder, and each call parses its own geometry, materials, and textures.
 *
 * @param options - The asset ID, description, physical size, and model URL.
 * @returns A catalog asset that loads the model and multiplies its authored
 *     materials by the requested color; white leaves them unchanged.
 */
function createModelAsset({ id, description, size, url, renderer, }) {
    if (typeof url !== 'string' || !url.trim()) {
        throw new Error(`Model asset "${id}" needs a model URL.`);
    }
    const loader = new ModelLoader();
    return {
        id,
        description,
        size: [...size],
        async create(color) {
            const gltf = await loader.loadGLTF({ url, renderer });
            const scene = gltf?.scene;
            if (!(scene instanceof THREE.Object3D)) {
                throw new Error(`Model asset "${id}" loaded no scene from "${url}".`);
            }
            const requested = new THREE.Color(color);
            if (requested.getHex() !== 0xffffff) {
                tint(scene, requested);
            }
            return scene;
        },
    };
}

export { createDefaultCatalog, createModelAsset };
