import { MODEL_FORMAT, TFLITE_BUILDER_CAPACITY, TFLITE_FORMAT, TFLITE_GRAPH_NAME, TFLITE_IDENTIFIER, TFLITE_METADATA_NAME, TFLITE_OPS, TFLITE_SIGNATURE_NAME } from "./constants.js";
import { Builder } from "../../node_modules/flatbuffers/mjs/builder.js";
import "../../node_modules/flatbuffers/mjs/flatbuffers.js";
//#region src/addons/interactive-ml/TFLite.ts
/** Write a self-contained classifier with labels in custom JSON metadata. */
function encodeTFLite(model) {
	const b = new Builder(TFLITE_BUILDER_CAPACITY);
	function table(size, fields = []) {
		b.startObject(size);
		for (const [slot, type, value] of fields) if (type === "offset") b.addFieldOffset(slot, value, 0);
		else if (type === "i8") b.addFieldInt8(slot, value, 0);
		else if (type === "f32") b.addFieldFloat32(slot, value, 0);
		else b.addFieldInt32(slot, value, 0);
		return b.endObject();
	}
	function vector(values, offsets = false) {
		b.startVector(4, values.length, 4);
		for (let i = values.length - 1; i >= 0; i--) if (offsets) b.addOffset(values[i]);
		else b.addInt32(values[i]);
		return b.endVector();
	}
	const buffers = [table(3)];
	function buffer(data) {
		b.startVector(1, data.length, 16);
		for (let i = data.length - 1; i >= 0; i--) b.addInt8(data[i]);
		const offset = b.endVector();
		buffers.push(table(3, [[
			0,
			"offset",
			offset
		]]));
		return buffers.length - 1;
	}
	const tensors = [];
	function tensor(name, shape, type = 0, values) {
		let bufferIndex = 0;
		if (values) {
			const bytes = new Uint8Array(values.length * 4);
			const view = new DataView(bytes.buffer);
			values.forEach((value, i) => {
				if (!Number.isFinite(Math.fround(value))) throw new Error("TFLite weights must fit in float32.");
				if (type === 2) view.setInt32(i * 4, value, true);
				else view.setFloat32(i * 4, value, true);
			});
			bufferIndex = buffer(bytes);
		}
		const fields = [
			[
				0,
				"offset",
				vector(shape)
			],
			[
				1,
				"i8",
				type
			],
			[
				2,
				"i32",
				bufferIndex
			],
			[
				3,
				"offset",
				b.createString(name)
			],
			[
				8,
				"i8",
				1
			]
		];
		tensors.push(table(10, fields));
		return tensors.length - 1;
	}
	const codes = [];
	const operators = [];
	function op(name, inputs, output, fields = []) {
		const [code, tag] = TFLITE_OPS[name];
		codes.push(table(4, [
			[
				0,
				"i8",
				code
			],
			[
				2,
				"i32",
				1
			],
			[
				3,
				"i32",
				code
			]
		]));
		const options = tag ? table(5, fields) : 0;
		operators.push(table(14, [
			[
				0,
				"i32",
				codes.length - 1
			],
			[
				1,
				"offset",
				vector(inputs)
			],
			[
				2,
				"offset",
				vector([output])
			],
			[
				3,
				"i8",
				tag
			],
			[
				4,
				"offset",
				options
			]
		]));
	}
	const c = model.classifier;
	const dimensions = c.mean.length;
	const classes = c.labels.length;
	if (c.scale.some((v) => Math.fround(v) <= 0) || c.radii.some((v) => Math.fround(v) <= 0)) throw new Error("TFLite scale and radii must be positive in float32.");
	const input = tensor("features", [1, dimensions]);
	const mean = tensor("mean", [dimensions], 0, c.mean);
	const scale = tensor("scale", [dimensions], 0, c.scale);
	const weights = tensor("weights", [classes, dimensions], 0, c.weights.flat());
	const bias = tensor("bias", [classes], 0, c.bias);
	const centers = tensor("centers", [classes, dimensions], 0, c.centers.flat());
	const radii = tensor("radii", [classes], 0, c.radii);
	const threshold = tensor("threshold", [1], 0, [model.threshold]);
	const axis = tensor("axis", [], 2, [1]);
	const unknown = tensor("unknown", [1], 2, [-1]);
	const centered = tensor("centered", [1, dimensions]);
	op("sub", [input, mean], centered);
	const normalized = tensor("normalized", [1, dimensions]);
	op("div", [centered, scale], normalized);
	const logits = tensor("logits", [1, classes]);
	op("dense", [
		normalized,
		weights,
		bias
	], logits);
	const scores = tensor("scores", [1, classes]);
	op("softmax", [logits], scores, [[
		0,
		"f32",
		1
	]]);
	const best = tensor("best", [1], 2);
	op("argmax", [scores, axis], best, [[
		0,
		"i8",
		2
	]]);
	const score = tensor("score", [1]);
	op("max", [scores, axis], score);
	const center = tensor("center", [1, dimensions]);
	op("gather", [centers, best], center);
	const radius = tensor("radius", [1]);
	op("gather", [radii, best], radius);
	const squared = tensor("squared_distance", [1, dimensions]);
	op("squaredDifference", [normalized, center], squared);
	const average = tensor("mean_distance", [1]);
	op("mean", [squared, axis], average);
	const distance = tensor("distance", [1]);
	op("sqrt", [average], distance);
	const confident = tensor("confident", [1], 6);
	op("greaterEqual", [score, threshold], confident);
	const nearby = tensor("nearby", [1], 6);
	op("lessEqual", [distance, radius], nearby);
	const accepted = tensor("accepted", [1], 6);
	op("and", [confident, nearby], accepted);
	const classIndex = tensor("class_index", [1], 2);
	op("select", [
		accepted,
		best,
		unknown
	], classIndex);
	const outputs = [
		scores,
		score,
		classIndex
	];
	const graph = table(6, [
		[
			0,
			"offset",
			vector(tensors, true)
		],
		[
			1,
			"offset",
			vector([input])
		],
		[
			2,
			"offset",
			vector(outputs)
		],
		[
			3,
			"offset",
			vector(operators, true)
		],
		[
			4,
			"offset",
			b.createString(TFLITE_GRAPH_NAME)
		],
		[
			5,
			"i32",
			-1
		]
	]);
	const tensorMap = (name, index) => table(2, [[
		0,
		"offset",
		b.createString(name)
	], [
		1,
		"i32",
		index
	]]);
	const signature = table(5, [
		[
			0,
			"offset",
			vector([tensorMap("features", input)], true)
		],
		[
			1,
			"offset",
			vector([
				tensorMap("scores", scores),
				tensorMap("score", score),
				tensorMap("class_index", classIndex)
			], true)
		],
		[
			2,
			"offset",
			b.createString(TFLITE_SIGNATURE_NAME)
		]
	]);
	const metadataIndex = buffer(new TextEncoder().encode(JSON.stringify({
		format: TFLITE_FORMAT,
		version: 1,
		kind: model.kind,
		featureId: model.featureId,
		labels: c.labels,
		signature: TFLITE_SIGNATURE_NAME,
		input: {
			name: "features",
			dtype: "float32",
			shape: [1, dimensions]
		},
		outputs: {
			scores: {
				dtype: "float32",
				shape: [1, classes]
			},
			score: {
				dtype: "float32",
				shape: [1]
			},
			class_index: {
				dtype: "int32",
				shape: [1],
				unknown: -1
			}
		},
		normalizationAndRejectionIncluded: true
	})));
	const metadata = table(2, [[
		0,
		"offset",
		b.createString(TFLITE_METADATA_NAME)
	], [
		1,
		"i32",
		metadataIndex
	]]);
	const root = table(8, [
		[
			0,
			"i32",
			3
		],
		[
			1,
			"offset",
			vector(codes, true)
		],
		[
			2,
			"offset",
			vector([graph], true)
		],
		[
			3,
			"offset",
			b.createString("XR Blocks pose/sound classifier")
		],
		[
			4,
			"offset",
			vector(buffers, true)
		],
		[
			6,
			"offset",
			vector([metadata], true)
		],
		[
			7,
			"offset",
			vector([signature], true)
		]
	]);
	b.finish(root, TFLITE_IDENTIFIER);
	return b.asUint8Array().slice();
}
/** Read classifier parameters from files produced by encodeTFLite. */
function decodeTFLite(bytes) {
	const invalid = () => /* @__PURE__ */ new Error("Invalid Interactive ML TFLite file.");
	if (bytes.length < 8 || bytes.length > 20971520 || new TextDecoder().decode(bytes.subarray(4, 8)) !== "TFL3") throw invalid();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const check = (offset, length) => {
		if (offset < 0 || length < 0 || offset + length > bytes.length) throw invalid();
	};
	const u32 = (offset) => {
		check(offset, 4);
		return view.getUint32(offset, true);
	};
	function field(table, slot) {
		check(table, 4);
		const vtable = table - view.getInt32(table, true);
		check(vtable, 4);
		const size = view.getUint16(vtable, true);
		check(vtable, size);
		const entry = 4 + slot * 2;
		const offset = entry + 2 <= size ? view.getUint16(vtable + entry, true) : 0;
		return offset ? table + offset : 0;
	}
	function vector(table, slot, width) {
		const f = field(table, slot);
		if (!f) return {
			start: 0,
			length: 0
		};
		const target = f + u32(f);
		const length = u32(target);
		check(target + 4, length * width);
		return {
			start: target + 4,
			length
		};
	}
	function tables(table, slot) {
		const { start, length } = vector(table, slot, 4);
		if (length > 128) throw invalid();
		return Array.from({ length }, (_, i) => start + i * 4 + u32(start + i * 4));
	}
	function data(table, slot) {
		const { start, length } = vector(table, slot, 1);
		return bytes.subarray(start, start + length);
	}
	const text = (table, slot) => new TextDecoder("utf-8", { fatal: true }).decode(data(table, slot));
	const number = (table, slot) => {
		const f = field(table, slot);
		return f ? u32(f) : 0;
	};
	const root = u32(0);
	if (number(root, 0) !== 3) throw invalid();
	const buffers = tables(root, 4);
	const metadata = tables(root, 6).find((entry) => text(entry, 0) === TFLITE_METADATA_NAME);
	if (metadata === void 0) throw invalid();
	const metadataBuffer = buffers[number(metadata, 1)];
	if (metadataBuffer === void 0) throw invalid();
	const info = JSON.parse(text(metadataBuffer, 0));
	const dimensions = info?.input?.shape?.[1];
	const classes = info?.labels?.length;
	if (info?.format !== "xrblocks-interactive-ml-tflite" || info.version !== 1 || !Number.isInteger(dimensions) || dimensions < 1 || dimensions > 2048 || !Array.isArray(info.labels) || classes < 2 || classes > 32) throw invalid();
	const graphs = tables(root, 2);
	if (graphs.length !== 1) throw invalid();
	const tensors = /* @__PURE__ */ new Map();
	for (const tensor of tables(graphs[0], 0)) {
		const name = text(tensor, 3);
		if (tensors.has(name)) throw invalid();
		tensors.set(name, tensor);
	}
	function constant(name, shape) {
		const tensor = tensors.get(name);
		if (tensor === void 0) throw invalid();
		const type = field(tensor, 1);
		if (type) {
			check(type, 1);
			if (view.getUint8(type) !== 0) throw invalid();
		}
		const actual = vector(tensor, 0, 4);
		if (actual.length !== shape.length || shape.some((n, i) => u32(actual.start + i * 4) !== n)) throw invalid();
		const buffer = buffers[number(tensor, 2)];
		if (buffer === void 0) throw invalid();
		const values = vector(buffer, 0, 1);
		const length = shape.reduce((a, b) => a * b, 1);
		if (values.length !== length * 4) throw invalid();
		return Array.from({ length }, (_, i) => view.getFloat32(values.start + i * 4, true));
	}
	const matrix = (name) => {
		const values = constant(name, [classes, dimensions]);
		return Array.from({ length: classes }, (_, i) => values.slice(i * dimensions, (i + 1) * dimensions));
	};
	return {
		format: MODEL_FORMAT,
		version: 1,
		kind: info.kind,
		featureId: info.featureId,
		threshold: constant("threshold", [1])[0],
		classifier: {
			labels: info.labels,
			mean: constant("mean", [dimensions]),
			scale: constant("scale", [dimensions]),
			weights: matrix("weights"),
			bias: constant("bias", [classes]),
			centers: matrix("centers"),
			radii: constant("radii", [classes])
		}
	};
}
//#endregion
export { decodeTFLite, encodeTFLite };
