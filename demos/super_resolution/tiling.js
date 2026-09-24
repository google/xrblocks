export function computeAxisTiles(length, tileSize, overlap) {
  if (length <= 0) throw new Error('length must be positive');
  if (tileSize <= 0) throw new Error('tileSize must be positive');
  if (overlap < 0 || overlap >= tileSize) {
    throw new Error('overlap must be at least 0 and smaller than tileSize');
  }

  if (length <= tileSize) return [{start: 0, coreStart: 0, coreEnd: length}];

  const count = Math.ceil((length - overlap) / (tileSize - overlap));
  const maxStart = length - tileSize;
  const tiles = [];
  for (let i = 0; i < count; i++) {
    tiles.push({
      start: Math.round((maxStart * i) / (count - 1)),
      coreStart: 0,
      coreEnd: length,
    });
  }

  for (let i = 0; i < tiles.length - 1; i++) {
    const boundary = Math.floor(
      (tiles[i + 1].start + tiles[i].start + tileSize) / 2
    );
    tiles[i].coreEnd = boundary;
    tiles[i + 1].coreStart = boundary;
  }
  tiles[0].coreStart = 0;
  tiles[tiles.length - 1].coreEnd = length;
  return tiles;
}

export function cropCenter(image, size) {
  const cropSize = Math.max(
    1,
    Math.min(image.width, image.height, Math.floor(size))
  );
  const width = cropSize;
  const height = cropSize;
  const x0 = Math.floor((image.width - width) / 2);
  const y0 = Math.floor((image.height - height) / 2);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const sourceStart = ((y0 + y) * image.width + x0) * 4;
    const targetStart = y * width * 4;
    data.set(
      image.data.subarray(sourceStart, sourceStart + width * 4),
      targetStart
    );
  }
  return {data, width, height};
}

export function packTile(
  image,
  x0,
  y0,
  tileSize,
  out = new Float32Array(tileSize * tileSize * 3)
) {
  let offset = 0;
  for (let y = 0; y < tileSize; y++) {
    const sourceY = clampInt(y0 + y, 0, image.height - 1);
    for (let x = 0; x < tileSize; x++) {
      const sourceX = clampInt(x0 + x, 0, image.width - 1);
      const source = (sourceY * image.width + sourceX) * 4;
      out[offset++] = image.data[source] / 255;
      out[offset++] = image.data[source + 1] / 255;
      out[offset++] = image.data[source + 2] / 255;
    }
  }
  return out;
}

export function detectLayout(shape) {
  const dimensions = Array.from(shape);
  if (dimensions.length !== 4 || dimensions[0] !== 1) {
    throw new Error(`Unsupported tensor layout: ${dimensions.join('x')}`);
  }
  if (dimensions[1] === 3) return 'nchw';
  if (dimensions[3] === 3) return 'nhwc';
  throw new Error(`Unsupported tensor layout: ${dimensions.join('x')}`);
}

export function writeTileOutput(target, tile, output, layout, scale, tileSize) {
  const outputTileSize = tileSize * scale;
  for (let sourceY = tile.coreStartY; sourceY < tile.coreEndY; sourceY++) {
    const yInTile = sourceY - tile.startY;
    for (let sourceX = tile.coreStartX; sourceX < tile.coreEndX; sourceX++) {
      const xInTile = sourceX - tile.startX;
      for (let dy = 0; dy < scale; dy++) {
        const outY = yInTile * scale + dy;
        const targetY = sourceY * scale + dy;
        for (let dx = 0; dx < scale; dx++) {
          const outX = xInTile * scale + dx;
          const targetX = sourceX * scale + dx;
          const outputPixel = outY * outputTileSize + outX;
          const targetPixel = (targetY * target.width + targetX) * 4;
          if (layout === 'nchw') {
            const planeSize = outputTileSize * outputTileSize;
            target.data[targetPixel] = toByte(output[outputPixel]);
            target.data[targetPixel + 1] = toByte(
              output[planeSize + outputPixel]
            );
            target.data[targetPixel + 2] = toByte(
              output[planeSize * 2 + outputPixel]
            );
          } else {
            const outputIndex = outputPixel * 3;
            target.data[targetPixel] = toByte(output[outputIndex]);
            target.data[targetPixel + 1] = toByte(output[outputIndex + 1]);
            target.data[targetPixel + 2] = toByte(output[outputIndex + 2]);
          }
          target.data[targetPixel + 3] = 255;
        }
      }
    }
  }
}

export async function upscaleImage(image, options) {
  const {tileSize, overlap, scale, layout, runTile, onTile} = options;
  const xTiles = computeAxisTiles(image.width, tileSize, overlap);
  const yTiles = computeAxisTiles(image.height, tileSize, overlap);
  const target = {
    data: new Uint8ClampedArray(image.width * scale * image.height * scale * 4),
    width: image.width * scale,
    height: image.height * scale,
  };
  const packed = new Float32Array(tileSize * tileSize * 3);
  const total = xTiles.length * yTiles.length;
  let done = 0;

  for (const yTile of yTiles) {
    for (const xTile of xTiles) {
      const input = packTile(image, xTile.start, yTile.start, tileSize, packed);
      const output = await runTile(input);
      writeTileOutput(
        target,
        {
          startX: xTile.start,
          startY: yTile.start,
          coreStartX: xTile.coreStart,
          coreEndX: xTile.coreEnd,
          coreStartY: yTile.coreStart,
          coreEndY: yTile.coreEnd,
        },
        output,
        layout,
        scale,
        tileSize
      );
      done++;
      onTile?.(done, total);
      if (done < total) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return target;
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toByte(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * 255);
}
