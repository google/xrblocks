import * as THREE from "three";
import { ModelLoader } from "xrblocks";
//#region src/addons/roomcraft/Catalog.ts
function material(color, roughness = .8, metalness = 0) {
	return new THREE.MeshStandardMaterial({
		color,
		roughness,
		metalness
	});
}
/** Derives a coordinated lighter or darker companion of the requested color. */
function shade(base, lightness, saturation = 1) {
	const hsl = {
		h: 0,
		s: 0,
		l: 0
	};
	base.getHSL(hsl);
	return new THREE.Color().setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s * saturation, 0, 1), THREE.MathUtils.clamp(hsl.l * lightness, .03, .97));
}
/** Derives a hue-shifted accent that still tracks the requested color. */
function accent(base, hueOffset, lightness = 1) {
	const hsl = {
		h: 0,
		s: 0,
		l: 0
	};
	base.getHSL(hsl);
	return new THREE.Color().setHSL((hsl.h + hueOffset) % 1, THREE.MathUtils.clamp(Math.max(hsl.s, .25), 0, 1), THREE.MathUtils.clamp(Math.max(hsl.l, .12) * lightness, .03, .97));
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
		state = Math.imul(state, 1664525) + 1013904223 >>> 0;
		return state / 4294967296;
	};
}
function createSofa(color) {
	const base = new THREE.Color(color);
	const body = material(base, .85);
	const cushion = material(shade(base, 1.25, .9), .9);
	const leg = material(shade(base, .35, .6), .5, .25);
	return assemble("sofa", box(1.8, .2, .85, body, 0, .28), box(1.8, .47, .16, body, 0, .615, -.345), box(.16, .28, .85, body, -.82, .52), box(.16, .28, .85, body, .82, .52), box(.78, .14, .7, cushion, -.42, .45, .03), box(.78, .14, .7, cushion, .42, .45, .03), box(.76, .3, .08, cushion, -.42, .6, -.22), box(.76, .3, .08, cushion, .42, .6, -.22), scatter(new THREE.CylinderGeometry(.045, .035, .18, 10), leg, [
		[
			-.75,
			.09,
			.33
		],
		[
			.75,
			.09,
			.33
		],
		[
			-.75,
			.09,
			-.33
		],
		[
			.75,
			.09,
			-.33
		]
	]));
}
function createArmchair(color) {
	const base = new THREE.Color(color);
	const body = material(base, .85);
	const cushion = material(shade(base, 1.25, .9), .9);
	const leg = material(shade(base, .35, .6), .5, .25);
	return assemble("armchair", box(.8, .2, .8, body, 0, .28), box(.8, .52, .16, body, 0, .64, -.32), box(.13, .3, .72, body, -.335, .53, .02), box(.13, .3, .72, body, .335, .53, .02), box(.6, .14, .66, cushion, 0, .45, .02), box(.56, .32, .08, cushion, 0, .62, -.2), scatter(new THREE.CylinderGeometry(.04, .03, .18, 10), leg, [
		[
			-.3,
			.09,
			.28
		],
		[
			.3,
			.09,
			.28
		],
		[
			-.3,
			.09,
			-.28
		],
		[
			.3,
			.09,
			-.28
		]
	]));
}
function createCoffeeTable(color) {
	const base = new THREE.Color(color);
	const top = material(base, .6);
	const trim = material(shade(base, .45, .8), .55, .15);
	return assemble("coffee-table", box(1, .05, .55, top, 0, .425), box(.9, .04, .45, trim, 0, .38), box(.85, .03, .42, top, 0, .14), scatter(new THREE.BoxGeometry(.06, .4, .06), trim, [
		[
			-.45,
			.2,
			.235
		],
		[
			.45,
			.2,
			.235
		],
		[
			-.45,
			.2,
			-.235
		],
		[
			.45,
			.2,
			-.235
		]
	]));
}
function createBookshelf(color) {
	const base = new THREE.Color(color);
	const frame = material(base, .7);
	const panel = material(shade(base, .6, .9), .85);
	const spines = [
		material(accent(base, .5, 1.1), .8),
		material(accent(base, .08, .75), .8),
		material(accent(base, .33, 1.3), .8),
		material(accent(base, .62, .9), .8)
	];
	const random = sequence(24095);
	const books = [];
	for (const shelfY of [
		.05,
		.48,
		.91,
		1.34
	]) {
		let x = -.46;
		for (let index = 0; index < 5 && x < .36; index++) {
			const width = .05 + random() * .035;
			const height = .2 + random() * .12;
			const spine = spines[Math.floor(random() * spines.length)];
			books.push(box(width, height, .2, spine, x + width / 2, shelfY + height / 2, .02));
			x += width + .005 + random() * .03;
		}
	}
	return assemble("bookshelf", box(1.1, 1.8, .03, panel, 0, .9, -.145), box(.05, 1.8, .32, frame, -.525, .9), box(.05, 1.8, .32, frame, .525, .9), box(1, .05, .3, frame, 0, .025, .01), box(1, .05, .3, frame, 0, 1.775, .01), box(1, .04, .3, frame, 0, .46, .01), box(1, .04, .3, frame, 0, .89, .01), box(1, .04, .3, frame, 0, 1.32, .01), books);
}
function createFloorLamp(color) {
	const base = new THREE.Color(color);
	const metal = material(shade(base, .4, .5), .35, .6);
	const glow = shade(base, 1.5, .7);
	const shadeMaterial = new THREE.MeshStandardMaterial({
		color: base,
		roughness: .6,
		emissive: glow,
		emissiveIntensity: .45,
		side: THREE.DoubleSide
	});
	const bulbMaterial = new THREE.MeshStandardMaterial({
		color: 1710616,
		roughness: .4,
		emissive: shade(base, 1.9, .35),
		emissiveIntensity: 1.6
	});
	const shadeMesh = new THREE.Mesh(new THREE.CylinderGeometry(.15, .25, .34, 20, 1, true), shadeMaterial);
	shadeMesh.position.y = 1.53;
	const bulb = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), bulbMaterial);
	bulb.position.y = 1.44;
	return assemble("floor-lamp", tube(.25, .25, .04, metal, 0, .02, 0, 20), tube(.02, .028, 1.4, metal, 0, .7, 0, 10), shadeMesh, bulb);
}
function createPlant(color) {
	const base = new THREE.Color(color);
	const pot = material(base, .85);
	const rim = material(shade(base, 1.3, .9), .8);
	const soil = material(blend(3877405, base, .2), 1);
	const stem = material(blend(5012026, base, .25), .9);
	const foliage = material(blend(5217093, base, .35), .85);
	const highlight = material(blend(7782495, base, .3), .85);
	const random = sequence(11031);
	const leaves = [];
	const leafGeometry = new THREE.SphereGeometry(.12, 8, 6);
	for (let index = 0; index < 6; index++) {
		const angle = index / 6 * Math.PI * 2 + random() * .5;
		const height = .6 + random() * .33;
		const radius = .1 + random() * .055;
		const leaf = new THREE.Mesh(leafGeometry, index % 2 === 0 ? foliage : highlight);
		leaf.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
		leaf.scale.set(1, .55, .7);
		leaf.rotation.set(0, -angle, .35);
		leaves.push(leaf);
	}
	return assemble("plant", tube(.19, .14, .26, pot, 0, .13, 0, 14), tube(.2, .2, .04, rim, 0, .26, 0, 14), tube(.175, .175, .02, soil, 0, .26, 0, 14), tube(.014, .018, .42, stem, 0, .46, 0, 8), leaves);
}
function createPlinth(color) {
	const base = new THREE.Color(color);
	const column = material(base, .7);
	const cap = material(shade(base, 1.3, .85), .6);
	return assemble("plinth", box(.45, .06, .45, material(shade(base, .45, .8), .75), 0, .03), box(.36, .72, .36, column, 0, .42), box(.45, .05, .45, cap, 0, .825));
}
function createArtPanel(color) {
	const base = new THREE.Color(color);
	const canvasMaterial = material(base, .9);
	const frame = material(shade(base, .4, .7), .7);
	const stand = material(shade(base, .3, .5), .45, .4);
	const relief = [
		material(shade(base, .55, 1), .85),
		material(shade(base, 1.45, .8), .85),
		material(accent(base, .5, 1.15), .85),
		material(accent(base, .12, 1.3), .8)
	];
	const artwork = [
		{
			x: -.19,
			y: .22,
			width: .22,
			height: .34,
			tone: 0
		},
		{
			x: .02,
			y: .28,
			width: .16,
			height: .2,
			tone: 1
		},
		{
			x: .2,
			y: .1,
			width: .16,
			height: .48,
			tone: 2
		},
		{
			x: -.09,
			y: -.19,
			width: .32,
			height: .16,
			tone: 1
		},
		{
			x: .17,
			y: -.27,
			width: .14,
			height: .14,
			tone: 3
		}
	].map(({ x, y, width, height, tone }) => box(width, height, .02, relief[tone], x, .8 + y, .045));
	const discGeometry = new THREE.CylinderGeometry(.055, .055, .02, 18);
	for (const [x, y, tone] of [[
		-.2,
		-.25,
		1
	], [
		.09,
		.3,
		3
	]]) {
		const disc = new THREE.Mesh(discGeometry, relief[tone]);
		disc.position.set(x, .8 + y, .05);
		disc.rotation.x = Math.PI / 2;
		artwork.push(disc);
	}
	return assemble("art-panel", box(.5, .05, .16, stand, 0, .025), box(.04, .32, .04, stand, -.18, .2), box(.04, .32, .04, stand, .18, .2), box(.75, .9, .05, frame, 0, .8), box(.67, .82, .02, canvasMaterial, 0, .8, .03), artwork);
}
function createArch(color) {
	const base = new THREE.Color(color);
	const stone = material(base, .85);
	const detail = material(shade(base, .55, .8), .8);
	const outline = new THREE.Shape();
	outline.moveTo(-1.2, 0);
	outline.lineTo(-1.2, 1.2);
	outline.absarc(0, 1.2, 1.2, Math.PI, 0, true);
	outline.lineTo(1.2, 0);
	outline.lineTo(-1.2, 0);
	const opening = new THREE.Path();
	opening.moveTo(-.82, 0);
	opening.lineTo(-.82, 1.2);
	opening.absarc(0, 1.2, .82, Math.PI, 0, true);
	opening.lineTo(.82, 0);
	opening.lineTo(-.82, 0);
	outline.holes.push(opening);
	const body = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, {
		depth: .3,
		bevelEnabled: false,
		curveSegments: 10
	}), stone);
	body.position.z = -.15;
	return assemble("arch", body, box(.22, .24, .3, detail, 0, 2.28), box(.5, .12, .3, detail, -.95, .06), box(.5, .12, .3, detail, .95, .06));
}
function createBuilding(color) {
	const base = new THREE.Color(color);
	const facade = material(base, .85);
	const trim = material(shade(base, 1.35, .6), .75);
	const glass = new THREE.MeshStandardMaterial({
		color: shade(base, 1.7, .35),
		roughness: .25,
		metalness: .15,
		emissive: shade(base, 1.5, .4),
		emissiveIntensity: .2
	});
	const door = material(shade(base, .35, .7), .7);
	const offsets = [];
	for (const y of [
		.16,
		.29,
		.42,
		.55
	]) for (const x of [
		-.09,
		0,
		.09
	]) offsets.push([
		x,
		y,
		.161
	]);
	const windows = scatter(new THREE.BoxGeometry(.06, .08, .006), glass, offsets);
	return assemble("building", box(.32, .6, .32, facade, 0, .3), box(.35, .04, .35, trim, 0, .62), box(.22, .14, .22, facade, 0, .71), box(.24, .02, .24, trim, 0, .79), box(.08, .12, .006, door, 0, .06, .161), windows);
}
function createTree(color) {
	const base = new THREE.Color(color);
	const canopy = material(base, .85);
	const upper = material(shade(base, 1.3, .9), .85);
	return assemble("tree", tube(.022, .032, .18, material(blend(7031343, base, .15), .9), 0, .09, 0, 8), new THREE.Mesh(new THREE.ConeGeometry(.125, .2, 7), canopy).translateY(.24), new THREE.Mesh(new THREE.ConeGeometry(.1, .17, 7), canopy).translateY(.34), new THREE.Mesh(new THREE.ConeGeometry(.07, .14, 7), upper).translateY(.43));
}
function createBox(color) {
	return assemble("box", box(.5, .5, .5, material(color, .75), 0, .25));
}
function createSphere(color) {
	const mesh = new THREE.Mesh(new THREE.SphereGeometry(.25, 24, 16), material(color, .6));
	mesh.position.y = .25;
	return assemble("sphere", mesh);
}
function createCylinder(color) {
	return assemble("cylinder", tube(.2, .2, .7, material(color, .7), 0, .35, 0, 24));
}
function createCone(color) {
	const mesh = new THREE.Mesh(new THREE.ConeGeometry(.25, .7, 24), material(color, .7));
	mesh.position.y = .35;
	return assemble("cone", mesh);
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
			id: "sofa",
			description: "A three-seat sofa with cushions and short legs",
			size: [
				1.8,
				.85,
				.85
			],
			create: createSofa
		},
		{
			id: "armchair",
			description: "A single upholstered armchair with a seat cushion",
			size: [
				.8,
				.9,
				.8
			],
			create: createArmchair
		},
		{
			id: "coffee-table",
			description: "A low rectangular coffee table with a lower shelf",
			size: [
				1,
				.45,
				.55
			],
			create: createCoffeeTable
		},
		{
			id: "bookshelf",
			description: "A tall four-shelf bookcase holding assorted books",
			size: [
				1.1,
				1.8,
				.32
			],
			create: createBookshelf
		},
		{
			id: "floor-lamp",
			description: "A standing floor lamp with a glowing shade",
			size: [
				.5,
				1.7,
				.5
			],
			create: createFloorLamp
		},
		{
			id: "plant",
			description: "A potted leafy houseplant",
			size: [
				.55,
				1,
				.55
			],
			create: createPlant
		},
		{
			id: "plinth",
			description: "A gallery display pedestal for showing a small object",
			size: [
				.45,
				.85,
				.45
			],
			create: createPlinth
		},
		{
			id: "art-panel",
			description: "A freestanding art panel with an abstract relief artwork",
			size: [
				.75,
				1.25,
				.16
			],
			create: createArtPanel
		},
		{
			id: "arch",
			description: "A freestanding archway or gateway to walk through",
			size: [
				2.4,
				2.4,
				.3
			],
			create: createArch
		},
		{
			id: "building",
			description: "A miniature city building with a simple windowed facade",
			size: [
				.35,
				.8,
				.35
			],
			create: createBuilding
		},
		{
			id: "tree",
			description: "A miniature conifer tree for a model city or landscape",
			size: [
				.25,
				.5,
				.25
			],
			create: createTree
		},
		{
			id: "box",
			description: "A plain cube",
			size: [
				.5,
				.5,
				.5
			],
			create: createBox
		},
		{
			id: "sphere",
			description: "A plain sphere",
			size: [
				.5,
				.5,
				.5
			],
			create: createSphere
		},
		{
			id: "cylinder",
			description: "A plain upright cylinder",
			size: [
				.4,
				.7,
				.4
			],
			create: createCylinder
		},
		{
			id: "cone",
			description: "A plain upright cone",
			size: [
				.5,
				.7,
				.5
			],
			create: createCone
		}
	];
}
function tint(object, color) {
	const tintedMaterials = /* @__PURE__ */ new Set();
	object.traverse((child) => {
		const renderable = child;
		if (!renderable.material) return;
		const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
		for (const item of materials) {
			if (tintedMaterials.has(item)) continue;
			tintedMaterials.add(item);
			const tinted = item;
			if (tinted.color instanceof THREE.Color) tinted.color.multiply(color);
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
function createModelAsset({ id, description, size, url, renderer }) {
	if (typeof url !== "string" || !url.trim()) throw new Error(`Model asset "${id}" needs a model URL.`);
	const loader = new ModelLoader();
	return {
		id,
		description,
		size: [...size],
		async create(color) {
			const scene = (await loader.loadGLTF({
				url,
				renderer
			}))?.scene;
			if (!(scene instanceof THREE.Object3D)) throw new Error(`Model asset "${id}" loaded no scene from "${url}".`);
			const requested = new THREE.Color(color);
			if (requested.getHex() !== 16777215) tint(scene, requested);
			return scene;
		}
	};
}
//#endregion
export { createDefaultCatalog, createModelAsset };
