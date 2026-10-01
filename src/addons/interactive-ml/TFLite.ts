import {Builder} from 'flatbuffers';
import type {ModelArtifact} from './Types';

// Field slots, operator IDs and option tags follow the TFLite v3 schema:
// https://github.com/tensorflow/tensorflow/blob/v2.20.0/tensorflow/compiler/mlir/lite/schema/schema.fbs
// Only the fixed classifier graph is supported; this is not a general converter.
const FLOAT32 = 0;
const INT32 = 2;
const BOOL = 6;
const ops = {
  sub: [41, 28],
  div: [42, 29],
  dense: [9, 8],
  softmax: [25, 9],
  argmax: [56, 40],
  gather: [36, 23],
  max: [82, 27],
  squaredDifference: [99, 76],
  mean: [40, 27],
  sqrt: [75, 0],
  greaterEqual: [62, 45],
  lessEqual: [63, 46],
  and: [86, 62],
  select: [64, 47],
} as const;
type Field = [
  slot: number,
  type: 'offset' | 'i32' | 'i8' | 'f32',
  value: number,
];

/** Write a self-contained classifier with labels in custom JSON metadata. */
export function encodeTFLite(model: ModelArtifact): Uint8Array<ArrayBuffer> {
  const b = new Builder(4096);
  function table(size: number, fields: Field[] = []) {
    b.startObject(size);
    for (const [slot, type, value] of fields) {
      if (type === 'offset') b.addFieldOffset(slot, value, 0);
      else if (type === 'i8') b.addFieldInt8(slot, value, 0);
      else if (type === 'f32') b.addFieldFloat32(slot, value, 0);
      else b.addFieldInt32(slot, value, 0);
    }
    return b.endObject();
  }
  function vector(values: number[], offsets = false) {
    b.startVector(4, values.length, 4);
    for (let i = values.length - 1; i >= 0; i--)
      if (offsets) b.addOffset(values[i]);
      else b.addInt32(values[i]);
    return b.endVector();
  }
  const buffers = [table(3)]; // Buffer zero denotes runtime storage.
  function buffer(data: Uint8Array) {
    b.startVector(1, data.length, 16);
    for (let i = data.length - 1; i >= 0; i--) b.addInt8(data[i]);
    const offset = b.endVector();
    buffers.push(table(3, [[0, 'offset', offset]]));
    return buffers.length - 1;
  }
  const tensors: number[] = [];
  function tensor(
    name: string,
    shape: number[],
    type = FLOAT32,
    values?: number[]
  ) {
    let bufferIndex = 0;
    if (values) {
      const bytes = new Uint8Array(values.length * 4);
      const view = new DataView(bytes.buffer);
      values.forEach((value, i) => {
        if (!Number.isFinite(Math.fround(value)))
          throw new Error('TFLite weights must fit in float32.');
        if (type === INT32) view.setInt32(i * 4, value, true);
        else view.setFloat32(i * 4, value, true);
      });
      bufferIndex = buffer(bytes);
    }
    const fields: Field[] = [
      [0, 'offset', vector(shape)],
      [1, 'i8', type],
      [2, 'i32', bufferIndex],
      [3, 'offset', b.createString(name)],
      [8, 'i8', 1],
    ];
    tensors.push(table(10, fields));
    return tensors.length - 1;
  }
  const codes: number[] = [];
  const operators: number[] = [];
  function op(
    name: keyof typeof ops,
    inputs: number[],
    output: number,
    fields: Field[] = []
  ) {
    const [code, tag] = ops[name];
    // One code entry per operator keeps serialization independent of graph order.
    codes.push(
      table(4, [
        [0, 'i8', code],
        [2, 'i32', 1],
        [3, 'i32', code],
      ])
    );
    const options = tag ? table(5, fields) : 0;
    operators.push(
      table(14, [
        [0, 'i32', codes.length - 1],
        [1, 'offset', vector(inputs)],
        [2, 'offset', vector([output])],
        [3, 'i8', tag],
        [4, 'offset', options],
      ])
    );
  }

  const c = model.classifier;
  const dimensions = c.mean.length;
  const classes = c.labels.length;
  if (
    c.scale.some((v) => Math.fround(v) <= 0) ||
    c.radii.some((v) => Math.fround(v) <= 0)
  )
    throw new Error('TFLite scale and radii must be positive in float32.');
  const input = tensor('features', [1, dimensions]);
  const mean = tensor('mean', [dimensions], FLOAT32, c.mean);
  const scale = tensor('scale', [dimensions], FLOAT32, c.scale);
  const weights = tensor(
    'weights',
    [classes, dimensions],
    FLOAT32,
    c.weights.flat()
  );
  const bias = tensor('bias', [classes], FLOAT32, c.bias);
  const centers = tensor(
    'centers',
    [classes, dimensions],
    FLOAT32,
    c.centers.flat()
  );
  const radii = tensor('radii', [classes], FLOAT32, c.radii);
  const threshold = tensor('threshold', [1], FLOAT32, [model.threshold]);
  const axis = tensor('axis', [], INT32, [1]);
  const unknown = tensor('unknown', [1], INT32, [-1]);
  const centered = tensor('centered', [1, dimensions]);
  op('sub', [input, mean], centered);
  const normalized = tensor('normalized', [1, dimensions]);
  op('div', [centered, scale], normalized);
  const logits = tensor('logits', [1, classes]);
  op('dense', [normalized, weights, bias], logits);
  const scores = tensor('scores', [1, classes]);
  op('softmax', [logits], scores, [[0, 'f32', 1]]);
  const best = tensor('best', [1], INT32);
  op('argmax', [scores, axis], best, [[0, 'i8', INT32]]);
  const score = tensor('score', [1]);
  op('max', [scores, axis], score);
  const center = tensor('center', [1, dimensions]);
  op('gather', [centers, best], center);
  const radius = tensor('radius', [1]);
  op('gather', [radii, best], radius);
  const squared = tensor('squared_distance', [1, dimensions]);
  op('squaredDifference', [normalized, center], squared);
  const average = tensor('mean_distance', [1]);
  op('mean', [squared, axis], average);
  const distance = tensor('distance', [1]);
  op('sqrt', [average], distance);
  const confident = tensor('confident', [1], BOOL);
  op('greaterEqual', [score, threshold], confident);
  const nearby = tensor('nearby', [1], BOOL);
  op('lessEqual', [distance, radius], nearby);
  const accepted = tensor('accepted', [1], BOOL);
  op('and', [confident, nearby], accepted);
  const classIndex = tensor('class_index', [1], INT32);
  op('select', [accepted, best, unknown], classIndex);

  const outputs = [scores, score, classIndex];
  const graph = table(6, [
    [0, 'offset', vector(tensors, true)],
    [1, 'offset', vector([input])],
    [2, 'offset', vector(outputs)],
    [3, 'offset', vector(operators, true)],
    [4, 'offset', b.createString('interactive_ml')],
    [5, 'i32', -1],
  ]);
  const tensorMap = (name: string, index: number) =>
    table(2, [
      [0, 'offset', b.createString(name)],
      [1, 'i32', index],
    ]);
  const signature = table(5, [
    [0, 'offset', vector([tensorMap('features', input)], true)],
    [
      1,
      'offset',
      vector(
        [
          tensorMap('scores', scores),
          tensorMap('score', score),
          tensorMap('class_index', classIndex),
        ],
        true
      ),
    ],
    [2, 'offset', b.createString('serving_default')],
  ]);
  const metadataIndex = buffer(
    new TextEncoder().encode(
      JSON.stringify({
        format: 'xrblocks-interactive-ml-tflite',
        version: 1,
        kind: model.kind,
        featureId: model.featureId,
        labels: c.labels,
        signature: 'serving_default',
        input: {name: 'features', dtype: 'float32', shape: [1, dimensions]},
        outputs: {
          scores: {dtype: 'float32', shape: [1, classes]},
          score: {dtype: 'float32', shape: [1]},
          class_index: {dtype: 'int32', shape: [1], unknown: -1},
        },
        normalizationAndRejectionIncluded: true,
      })
    )
  );
  const metadata = table(2, [
    [0, 'offset', b.createString('xrblocks-interactive-ml')],
    [1, 'i32', metadataIndex],
  ]);
  const root = table(8, [
    [0, 'i32', 3],
    [1, 'offset', vector(codes, true)],
    [2, 'offset', vector([graph], true)],
    [3, 'offset', b.createString('XR Blocks pose/sound classifier')],
    [4, 'offset', vector(buffers, true)],
    [6, 'offset', vector([metadata], true)],
    [7, 'offset', vector([signature], true)],
  ]);
  b.finish(root, 'TFL3');
  return b.asUint8Array().slice();
}

/** Read classifier parameters from files produced by encodeTFLite. */
export function decodeTFLite(bytes: Uint8Array): ModelArtifact {
  const invalid = () => new Error('Invalid Interactive ML TFLite file.');
  if (
    bytes.length < 8 ||
    bytes.length > 20 * 1024 * 1024 ||
    new TextDecoder().decode(bytes.subarray(4, 8)) !== 'TFL3'
  )
    throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const check = (offset: number, length: number) => {
    if (offset < 0 || length < 0 || offset + length > bytes.length)
      throw invalid();
  };
  const u32 = (offset: number) => {
    check(offset, 4);
    return view.getUint32(offset, true);
  };
  function field(table: number, slot: number) {
    check(table, 4);
    const vtable = table - view.getInt32(table, true);
    check(vtable, 4);
    const size = view.getUint16(vtable, true);
    check(vtable, size);
    const entry = 4 + slot * 2;
    const offset = entry + 2 <= size ? view.getUint16(vtable + entry, true) : 0;
    return offset ? table + offset : 0;
  }
  function vector(table: number, slot: number, width: number) {
    const f = field(table, slot);
    if (!f) return {start: 0, length: 0};
    const target = f + u32(f);
    const length = u32(target);
    check(target + 4, length * width);
    return {start: target + 4, length};
  }
  function tables(table: number, slot: number) {
    const {start, length} = vector(table, slot, 4);
    if (length > 128) throw invalid();
    return Array.from({length}, (_, i) => start + i * 4 + u32(start + i * 4));
  }
  function data(table: number, slot: number) {
    const {start, length} = vector(table, slot, 1);
    return bytes.subarray(start, start + length);
  }
  const text = (table: number, slot: number) =>
    new TextDecoder('utf-8', {fatal: true}).decode(data(table, slot));
  const number = (table: number, slot: number) => {
    const f = field(table, slot);
    return f ? u32(f) : 0;
  };
  const root = u32(0);
  if (number(root, 0) !== 3) throw invalid();
  const buffers = tables(root, 4);
  const metadata = tables(root, 6).find(
    (entry) => text(entry, 0) === 'xrblocks-interactive-ml'
  );
  if (metadata === undefined) throw invalid();
  const metadataBuffer = buffers[number(metadata, 1)];
  if (metadataBuffer === undefined) throw invalid();
  const info = JSON.parse(text(metadataBuffer, 0));
  const dimensions = info?.input?.shape?.[1];
  const classes = info?.labels?.length;
  if (
    info?.format !== 'xrblocks-interactive-ml-tflite' ||
    info.version !== 1 ||
    !Number.isInteger(dimensions) ||
    dimensions < 1 ||
    dimensions > 2048 ||
    !Array.isArray(info.labels) ||
    classes < 2 ||
    classes > 32
  )
    throw invalid();
  const graphs = tables(root, 2);
  if (graphs.length !== 1) throw invalid();
  const tensors = new Map<string, number>();
  for (const tensor of tables(graphs[0], 0)) {
    const name = text(tensor, 3);
    if (tensors.has(name)) throw invalid();
    tensors.set(name, tensor);
  }
  function constant(name: string, shape: number[]) {
    const tensor = tensors.get(name);
    if (tensor === undefined) throw invalid();
    const type = field(tensor, 1);
    if (type) {
      check(type, 1);
      if (view.getUint8(type) !== FLOAT32) throw invalid();
    }
    const actual = vector(tensor, 0, 4);
    if (
      actual.length !== shape.length ||
      shape.some((n, i) => u32(actual.start + i * 4) !== n)
    )
      throw invalid();
    const buffer = buffers[number(tensor, 2)];
    if (buffer === undefined) throw invalid();
    const values = vector(buffer, 0, 1);
    const length = shape.reduce((a, b) => a * b, 1);
    if (values.length !== length * 4) throw invalid();
    return Array.from({length}, (_, i) =>
      view.getFloat32(values.start + i * 4, true)
    );
  }
  const matrix = (name: string) => {
    const values = constant(name, [classes, dimensions]);
    return Array.from({length: classes}, (_, i) =>
      values.slice(i * dimensions, (i + 1) * dimensions)
    );
  };
  return {
    format: 'xrblocks-interactive-ml',
    version: 1,
    kind: info.kind,
    featureId: info.featureId,
    threshold: constant('threshold', [1])[0],
    classifier: {
      labels: info.labels,
      mean: constant('mean', [dimensions]),
      scale: constant('scale', [dimensions]),
      weights: matrix('weights'),
      bias: constant('bias', [classes]),
      centers: matrix('centers'),
      radii: constant('radii', [classes]),
    },
  };
}
