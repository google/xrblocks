// @vitest-environment node

import {describe, expect, it} from 'vitest';
import {analyzeTrace, comparisonRows, runOrder} from './profile-report.js';

const marker = (name: string, ts: number) => ({
  name: `profile:${name}`,
  cat: 'blink.user_timing',
  ph: 'I',
  pid: 1,
  tid: 2,
  ts,
});
const span = (name: string, ts: number, dur: number, tid = 2) => ({
  name,
  ph: 'X',
  pid: 1,
  tid,
  ts,
  dur,
});
const bounds = [marker('start', 1000), marker('end', 11000)];

describe('analyzeTrace', () => {
  it('clips and unions nested tasks on the marked main thread only', () => {
    const result = analyzeTrace(
      {
        traceEvents: [
          ...bounds,
          span('RunTask', 0, 3000),
          span('ThreadControllerImpl::RunTask', 1000, 2000),
          span('RunTask', 5000, 3000),
          span('RunTask', 10000, 4000),
          span('RunTask', 1000, 10000, 3),
          {...span('RunTask', 1000, 10000), pid: 9},
          span('RunTask', 20000, 5000),
        ],
      },
      'profile',
      []
    );

    expect(result.durationMs).toBe(10);
    expect(result.metrics['Main-thread idle (%)']).toBe(40);
  });

  it('matches exact event names and clips their wall time', () => {
    const result = analyzeTrace(
      {
        traceEvents: [
          ...bounds,
          span('getParameter', 0, 2000),
          span('getParameter', 3000, 2000),
          span('getParameter', 11000, 5000),
          span('getParameterExtra', 6000, 1000),
          span('getParameter', 1000, 10000, 3),
        ],
      },
      'profile',
      ['getParameter', 'absent']
    );

    expect(result.metrics['getParameter (ms)']).toBe(3);
    expect(result.metrics['getParameter (calls)']).toBe(1);
    expect(result.metrics['absent (ms)']).toBe(0);
    expect(result.metrics['absent (calls)']).toBe(0);
  });

  it('handles nested B/E spans and asynchronous User Timing measures', () => {
    const result = analyzeTrace(
      {
        traceEvents: [
          ...bounds,
          {name: 'RunTask', ph: 'B', pid: 1, tid: 2, ts: 500},
          {name: 'other', ph: 'B', pid: 1, tid: 2, ts: 1500},
          {ph: 'E', pid: 1, tid: 2, ts: 1800},
          {ph: 'E', pid: 1, tid: 2, ts: 2500},
          {
            name: 'webgl:getParameter',
            cat: 'blink.user_timing',
            ph: 'b',
            id2: {local: '7'},
            pid: 1,
            tid: 2,
            ts: 4000,
          },
          {
            name: 'webgl:getParameter',
            cat: 'blink.user_timing',
            ph: 'e',
            id2: {local: '7'},
            pid: 1,
            tid: 2,
            ts: 6000,
          },
        ],
      },
      'profile',
      ['webgl:getParameter']
    );

    expect(result.metrics['Main-thread idle (%)']).toBe(85);
    expect(result.metrics['webgl:getParameter (ms)']).toBe(2);
    expect(result.metrics['webgl:getParameter (calls)']).toBe(1);
  });

  it('keeps Chrome async IDs and categories distinct', () => {
    const result = analyzeTrace(
      {
        traceEvents: [
          ...bounds,
          {
            name: 'measure',
            cat: 'blink.user_timing',
            ph: 'b',
            id: '0x1',
            pid: 1,
            tid: 2,
            ts: 2000,
          },
          {
            name: 'measure',
            cat: 'another',
            ph: 'b',
            id: '0x1',
            pid: 1,
            tid: 2,
            ts: 2500,
          },
          {
            name: 'measure',
            cat: 'another',
            ph: 'e',
            id: '0x1',
            pid: 1,
            tid: 2,
            ts: 3000,
          },
          {
            name: 'measure',
            cat: 'blink.user_timing',
            ph: 'e',
            id: '0x1',
            pid: 1,
            tid: 2,
            ts: 4000,
          },
        ],
      },
      'profile',
      ['measure']
    );
    expect(result.metrics['measure (ms)']).toBe(2);
  });

  it('does not call an unsupported task trace 100% idle', () => {
    const result = analyzeTrace({traceEvents: bounds}, 'profile', []);
    expect(result.metrics['Main-thread idle (%)']).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/task/i);
  });

  it('counts zero-duration measures and reused async IDs', () => {
    const measure = (ph: string, ts: number) => ({
      name: 'webgl:getParameter',
      cat: 'blink.user_timing',
      ph,
      id2: {local: '0x44'},
      pid: 1,
      tid: 2,
      ts,
    });
    const result = analyzeTrace(
      {
        traceEvents: [
          ...bounds,
          measure('b', 2000),
          measure('e', 2000),
          measure('b', 3000),
          measure('e', 4000),
          measure('n', 5000),
        ],
      },
      'profile',
      ['webgl:getParameter']
    );
    expect(result.metrics['webgl:getParameter (calls)']).toBe(3);
    expect(result.metrics['webgl:getParameter (ms)']).toBe(1);
  });

  it.each([
    {traceEvents: []},
    {traceEvents: [marker('start', 1000)]},
    {traceEvents: [marker('start', 2000), marker('end', 1000)]},
    {traceEvents: [marker('start', 1000), {...marker('end', 2000), tid: 3}]},
  ])('rejects missing or incompatible measurement bounds', ({traceEvents}) => {
    expect(() => analyzeTrace({traceEvents}, 'profile', [])).toThrow(/marker/i);
  });

  it('rejects incomplete measured spans instead of reporting them as zero', () => {
    expect(() =>
      analyzeTrace(
        {
          traceEvents: [
            ...bounds,
            {name: 'RunTask', ph: 'B', pid: 1, tid: 2, ts: 2000},
          ],
        },
        'profile',
        []
      )
    ).toThrow(/incomplete/i);
  });
});

describe('paired comparisons', () => {
  it('interleaves both sides and reverses the order every other pair', () => {
    expect(runOrder(3)).toEqual([
      {pair: 1, side: 'before'},
      {pair: 1, side: 'after'},
      {pair: 2, side: 'after'},
      {pair: 2, side: 'before'},
      {pair: 3, side: 'before'},
      {pair: 3, side: 'after'},
    ]);
  });

  it('computes sample SD and deltas within pairs, not execution order', () => {
    const rows = comparisonRows([
      {pair: 1, side: 'before', metrics: {idle: 10}},
      {pair: 1, side: 'after', metrics: {idle: 13}},
      {pair: 2, side: 'after', metrics: {idle: 25}},
      {pair: 2, side: 'before', metrics: {idle: 20}},
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].before).toEqual({mean: 15, sd: Math.sqrt(50)});
    expect(rows[0].after).toEqual({mean: 19, sd: Math.sqrt(72)});
    expect(rows[0].delta).toEqual({mean: 4, sd: Math.sqrt(2)});
  });

  it('reports single-sample SD and unavailable metrics as unknown', () => {
    expect(
      comparisonRows([
        {pair: 1, side: 'before', metrics: {idle: 10}},
        {pair: 1, side: 'after', metrics: {idle: null}},
      ])
    ).toEqual([
      {
        metric: 'idle',
        before: {mean: 10, sd: null},
        after: null,
        delta: null,
      },
    ]);
  });

  it('rejects missing and duplicate members of a pair', () => {
    const before = {pair: 1, side: 'before', metrics: {idle: 10}};
    expect(() => comparisonRows([before])).toThrow(/pair/i);
    expect(() => comparisonRows([before, before])).toThrow(/pair/i);
  });
});
