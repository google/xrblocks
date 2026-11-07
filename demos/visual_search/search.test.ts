// @vitest-environment node
import {describe, expect, it} from 'vitest';

import {
  BACKGROUND_LABELS,
  LOGIT_SCALE,
  MAX_QUERY_LENGTH,
  POSSIBLE_SCORE,
  STRONG_SCORE,
  TEMPLATES,
  cleanQuery,
  contrast,
  describe as describeMatch,
  locate,
  meanEmbedding,
  normalize,
  overlapArea,
  promptsFor,
  similarities,
  squareGrid,
  withArticle,
} from './search.js';

type Tile = {x: number; y: number; side: number};

function covers(tiles: Tile[], width: number, height: number) {
  for (let y = 0; y < height; y += 7) {
    for (let x = 0; x < width; x += 7) {
      if (
        !tiles.some(
          (t) => x >= t.x && x < t.x + t.side && y >= t.y && y < t.y + t.side
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

describe('squareGrid', () => {
  it('covers common camera frames with in-bounds squares', () => {
    for (const [width, height, count] of [
      [512, 512, 25],
      [640, 480, 24],
      [1280, 720, 32],
      [720, 1280, 32],
    ]) {
      const tiles = squareGrid(width, height);
      expect(tiles).toHaveLength(count);
      const side = Math.floor(Math.min(width, height) * 0.4);
      for (const tile of tiles) {
        expect(tile.side).toBe(side);
        expect(Number.isInteger(tile.x) && Number.isInteger(tile.y)).toBe(true);
        expect(tile.x).toBeGreaterThanOrEqual(0);
        expect(tile.y).toBeGreaterThanOrEqual(0);
        expect(tile.x + tile.side).toBeLessThanOrEqual(width);
        expect(tile.y + tile.side).toBeLessThanOrEqual(height);
      }
      expect(covers(tiles, width, height)).toBe(true);
    }
  });

  it('touches every border and keeps at least the requested overlap', () => {
    const tiles = squareGrid(1000, 600, {fraction: 0.5, overlap: 0.25});
    const xs = [...new Set(tiles.map((t) => t.x))];
    const ys = [...new Set(tiles.map((t) => t.y))];
    expect(xs[0]).toBe(0);
    expect(xs.at(-1)! + tiles[0].side).toBe(1000);
    expect(ys[0]).toBe(0);
    expect(ys.at(-1)! + tiles[0].side).toBe(600);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeLessThanOrEqual(tiles[0].side * 0.75);
    }
  });

  it('makes a single crop when one crop spans the frame', () => {
    expect(squareGrid(200, 200, {fraction: 1})).toEqual([
      {x: 0, y: 0, side: 200},
    ]);
    expect(squareGrid(1, 1)).toEqual([{x: 0, y: 0, side: 1}]);
  });

  it('rejects invalid sizes and options', () => {
    expect(() => squareGrid(0, 10)).toThrow(/frame size/);
    expect(() => squareGrid(10, 10, {fraction: 0})).toThrow(/fraction/);
    expect(() => squareGrid(10, 10, {overlap: 1})).toThrow(/overlap/);
  });
});

describe('query phrasing', () => {
  it('cleans whitespace and caps the length', () => {
    expect(cleanQuery('  red \n  mug ')).toBe('red mug');
    expect(cleanQuery(undefined)).toBe('');
    expect(cleanQuery('x'.repeat(100))).toHaveLength(MAX_QUERY_LENGTH);
  });

  it('adds an article to bare singular nouns only', () => {
    expect(withArticle('cup')).toBe('a cup');
    expect(withArticle('umbrella')).toBe('an umbrella');
    expect(withArticle('red mug')).toBe('a red mug');
    expect(withArticle('keys')).toBe('keys');
    expect(withArticle('car keys')).toBe('car keys');
    expect(withArticle('glass')).toBe('a glass');
    expect(withArticle('my phone')).toBe('my phone');
    expect(withArticle('The TV')).toBe('The TV');
    expect(withArticle('2 cups')).toBe('2 cups');
    expect(withArticle('   ')).toBe('');
  });

  it('fills every template with the query', () => {
    const prompts = promptsFor(' cup ');
    expect(prompts).toHaveLength(TEMPLATES.length);
    expect(prompts[0]).toBe('a photo of a cup.');
    for (const prompt of prompts) {
      expect(prompt).toContain('a cup');
      expect(prompt).not.toContain('{}');
    }
    expect(() => promptsFor('  ')).toThrow(/what to look for/);
  });

  it('keeps background captions distinct from common queries', () => {
    expect(new Set(BACKGROUND_LABELS).size).toBe(BACKGROUND_LABELS.length);
    expect(BACKGROUND_LABELS.length).toBeGreaterThanOrEqual(4);
  });
});

describe('embedding math', () => {
  it('normalizes and averages unit vectors', () => {
    expect(Array.from(normalize([3, 4]))).toEqual([
      expect.closeTo(0.6),
      expect.closeTo(0.8),
    ]);
    expect(() => normalize([0, 0])).toThrow(/zero vector/);
    const mean = meanEmbedding([
      [1, 0],
      [0, 10],
    ]);
    expect(mean[0]).toBeCloseTo(Math.SQRT1_2);
    expect(mean[1]).toBeCloseTo(Math.SQRT1_2);
    expect(() => meanEmbedding([])).toThrow(/No embeddings/);
    expect(() => meanEmbedding([[1], [1, 0]])).toThrow(/sizes/);
  });

  it('computes cosine similarity regardless of magnitude', () => {
    const scores = similarities(
      [2, 0],
      [
        [5, 0],
        [0, 1],
        [1, 1],
      ]
    );
    expect(scores[0]).toBeCloseTo(1);
    expect(scores[1]).toBeCloseTo(0);
    expect(scores[2]).toBeCloseTo(Math.SQRT1_2);
    expect(() => similarities([1, 0], [[1, 0, 0]])).toThrow(/sizes/);
  });

  it('turns query-versus-background margins into probabilities', () => {
    const probabilities = contrast(
      [0.3, 0.2, 0.25],
      [
        [0.2, 0.3, 0.25],
        [0.2, 0.2, 0.25],
      ]
    );
    expect(probabilities[0]).toBeGreaterThan(0.99);
    expect(probabilities[1]).toBeLessThan(0.5);
    expect(probabilities[2]).toBeCloseTo(1 / 3);
    // At CLIP's scale a 0.01 margin over one caption is e:1.
    expect(contrast([0.26], [[0.25]])[0]).toBeCloseTo(Math.E / (Math.E + 1), 5);
    expect(LOGIT_SCALE).toBe(100);
  });
});

describe('locate', () => {
  // 4 x 4 crops of 200 px at x and y = 0, 100, 200 and 300.
  const grid = squareGrid(500, 500, {fraction: 0.4, overlap: 0.5});
  const side = grid[0].side;
  const indexAt = (x: number, y: number) =>
    grid.findIndex((t) => t.x === x && t.y === y);
  const middle = indexAt(100, 100);

  it('grades confidence from the best raw score', () => {
    const base = grid.map(() => 0.2);
    const probabilities = grid.map(() => 0.1);
    const at = (score: number) => {
      const scores = [...base];
      scores[3] = score;
      return locate(scores, probabilities, grid, 500, 500).confidence;
    };
    expect(at(STRONG_SCORE)).toBe('strong');
    expect(at(POSSIBLE_SCORE)).toBe('possible');
    expect(at(POSSIBLE_SCORE - 0.001)).toBe('none');
  });

  it('uses a grid with a middle crop and neighbors on both sides', () => {
    expect(grid).toHaveLength(16);
    expect(middle).toBeGreaterThan(-1);
  });

  it('places the match on the most query-like crop, not the highest score', () => {
    const scores = grid.map(() => 0.24);
    const probabilities = grid.map(() => 0.01);
    scores[0] = 0.3; // A crop that scores high for everything...
    const target = middle;
    probabilities[target] = 0.9; // ...loses to one that beats the background.
    const match = locate(scores, probabilities, grid, 500, 500);
    expect(match.bestIndex).toBe(target);
    expect(match.score).toBe(0.3);
    expect(match.probability).toBe(0.9);
    const t = grid[target];
    expect(match.center.u).toBeCloseTo((t.x + side / 2) / 500);
    expect(match.center.v).toBeCloseTo((t.y + side / 2) / 500);
    expect(match.box).toEqual({
      u0: t.x / 500,
      v0: t.y / 500,
      u1: (t.x + side) / 500,
      v1: (t.y + side) / 500,
    });
  });

  it('tightens the box with a strong direct neighbor', () => {
    const probabilities = grid.map(() => 0.01);
    const best = grid[middle];
    const right = indexAt(best.x + side / 2, best.y);
    expect(right).toBeGreaterThan(-1);
    probabilities[middle] = 0.8;
    probabilities[right] = 0.8;
    const match = locate(
      grid.map(() => 0.27),
      probabilities,
      grid,
      500,
      500
    );
    expect(match.box.u0).toBeCloseTo(grid[right].x / 500);
    expect(match.box.u1).toBeCloseTo((best.x + side) / 500);
    expect(match.center.u).toBeCloseTo((best.x + side * 0.75) / 500);
  });

  it('ignores a second instance elsewhere in the frame', () => {
    const probabilities = grid.map(() => 0.01);
    probabilities[0] = 0.95;
    probabilities[grid.length - 1] = 0.94;
    const match = locate(
      grid.map(() => 0.27),
      probabilities,
      grid,
      500,
      500
    );
    expect(match.bestIndex).toBe(0);
    expect(match.box).toEqual({
      u0: 0,
      v0: 0,
      u1: side / 500,
      v1: side / 500,
    });
  });

  it('falls back to the best crop when neighbors meet only at a line', () => {
    const probabilities = grid.map(() => 0.01);
    const best = grid[middle];
    probabilities[middle] = 0.85;
    probabilities[indexAt(best.x - side / 2, best.y)] = 0.8;
    probabilities[indexAt(best.x + side / 2, best.y)] = 0.8;
    const match = locate(
      grid.map(() => 0.27),
      probabilities,
      grid,
      500,
      500
    );
    expect(match.box.u0).toBeCloseTo(best.x / 500);
    expect(match.box.u1).toBeCloseTo((best.x + side) / 500);
    expect(Number.isFinite(match.center.u)).toBe(true);
  });

  it('stays finite when every probability underflows to zero', () => {
    const match = locate(
      grid.map(() => 0.1),
      grid.map(() => 0),
      grid,
      500,
      500
    );
    expect(match.confidence).toBe('none');
    expect(Number.isFinite(match.center.u)).toBe(true);
    expect(Number.isFinite(match.center.v)).toBe(true);
  });

  it('requires one score and probability per tile', () => {
    expect(() => locate([], [], [], 1, 1)).toThrow(/exactly one/);
    expect(() => locate([0.1], [0.1, 0.2], grid.slice(0, 1), 1, 1)).toThrow(
      /exactly one/
    );
  });
});

describe('overlapArea', () => {
  it('measures shared pixels of two squares', () => {
    expect(overlapArea({x: 0, y: 0, side: 10}, {x: 5, y: 5, side: 10})).toBe(
      25
    );
    expect(overlapArea({x: 0, y: 0, side: 10}, {x: 10, y: 0, side: 10})).toBe(
      0
    );
  });
});

describe('describe', () => {
  it('words each confidence level', () => {
    const match = (confidence: string) =>
      ({confidence}) as Parameters<typeof describeMatch>[1];
    expect(describeMatch(' cup ', match('strong'))).toBe('Found cup.');
    expect(describeMatch('cup', match('possible'))).toMatch(/^Maybe cup/);
    expect(describeMatch('cup', match('none'))).toMatch(/^No clear cup/);
  });
});
