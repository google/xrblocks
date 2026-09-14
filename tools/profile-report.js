const TASK_NAMES = new Set(['RunTask', 'ThreadControllerImpl::RunTask']);

export function runOrder(runs) {
  return Array.from({length: runs}, (_, index) => {
    const sides = index % 2 ? ['after', 'before'] : ['before', 'after'];
    return sides.map((side) => ({pair: index + 1, side}));
  }).flat();
}

export function analyzeTrace(trace, prefix, eventNames) {
  const events = trace.traceEvents;
  if (!Array.isArray(events))
    throw new Error('Trace has no traceEvents array.');
  const start = events.find((event) => event.name === `${prefix}:start`);
  const end = events.find(
    (event) =>
      event.name === `${prefix}:end` &&
      event.pid === start?.pid &&
      event.tid === start?.tid
  );
  if (!start || !end || !(end.ts > start.ts)) {
    throw new Error('Trace is missing valid measurement markers.');
  }

  const wanted = new Set([...TASK_NAMES, ...eventNames]);
  const spans = [];
  const stack = [];
  const asyncSpans = new Map();
  const onThread = events
    .filter((event) => event.pid === start.pid && event.tid === start.tid)
    .sort((a, b) => a.ts - b.ts);
  for (const event of onThread) {
    if (event.ph === 'X') spans.push(event);
    // Zero-duration User Timing measures are exported as async instants.
    if (
      event.ph === 'n' &&
      event.cat?.split(',').includes('blink.user_timing')
    ) {
      spans.push({...event, dur: 0});
    }
    if (event.ph === 'B') stack.push(event);
    if (event.ph === 'E') {
      const begin = stack.pop();
      if (begin) spans.push({...begin, dur: event.ts - begin.ts});
    }
    if (event.ph === 'b' || event.ph === 'e') {
      const key = JSON.stringify([
        event.cat,
        event.name,
        event.scope,
        event.id2 ?? event.id,
      ]);
      if (event.ph === 'b') {
        asyncSpans.set(key, event);
      } else {
        const begin = asyncSpans.get(key);
        if (begin) {
          spans.push({...begin, dur: event.ts - begin.ts});
          asyncSpans.delete(key);
        } else if (
          wanted.has(event.name) &&
          event.ts > start.ts &&
          event.ts <= end.ts
        ) {
          throw new Error(`Incomplete trace span: ${event.name}.`);
        }
      }
    }
  }
  for (const event of [...stack, ...asyncSpans.values()]) {
    if (wanted.has(event.name) && event.ts < end.ts) {
      throw new Error(`Incomplete trace span: ${event.name}.`);
    }
  }
  for (const event of spans) {
    if (
      wanted.has(event.name) &&
      (!Number.isFinite(event.dur) || event.dur < 0)
    ) {
      throw new Error(`Invalid trace duration: ${event.name}.`);
    }
  }

  // Chrome can emit nested task aliases. Union them, rather than summing twice.
  function wallTime(selected) {
    const intervals = selected
      .map((event) => [
        Math.max(start.ts, event.ts),
        Math.min(end.ts, event.ts + event.dur),
      ])
      .filter(([left, right]) => right > left)
      .sort((a, b) => a[0] - b[0]);
    let total = 0;
    let previousEnd = start.ts;
    for (const [left, right] of intervals) {
      total += Math.max(0, right - Math.max(left, previousEnd));
      previousEnd = Math.max(previousEnd, right);
    }
    return total;
  }

  const durationUs = end.ts - start.ts;
  const tasks = spans.filter((event) => TASK_NAMES.has(event.name));
  const warnings = [];
  if (!tasks.length) {
    warnings.push('No renderer task spans found; main-thread idle is unknown.');
  }
  const metrics = {
    'Main-thread idle (%)': tasks.length
      ? (1 - wallTime(tasks) / durationUs) * 100
      : null,
  };
  for (const name of eventNames) {
    const selected = spans.filter((event) => event.name === name);
    metrics[`${name} (ms)`] = wallTime(selected) / 1000;
    metrics[`${name} (calls)`] = selected.filter(
      (event) => event.ts >= start.ts && event.ts < end.ts
    ).length;
  }
  return {durationMs: durationUs / 1000, metrics, warnings};
}

function statistics(values) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd =
    values.length > 1
      ? Math.sqrt(
          values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
            (values.length - 1)
        )
      : null;
  return {mean, sd};
}

export function comparisonRows(samples) {
  const pairs = new Map();
  for (const sample of samples) {
    const pair = pairs.get(sample.pair) ?? {};
    if (!['before', 'after'].includes(sample.side) || pair[sample.side]) {
      throw new Error(`Invalid or duplicate side in pair ${sample.pair}.`);
    }
    pair[sample.side] = sample.metrics;
    pairs.set(sample.pair, pair);
  }
  if (
    !pairs.size ||
    [...pairs.values()].some((pair) => !pair.before || !pair.after)
  ) {
    throw new Error('Every comparison pair needs a before and after sample.');
  }
  const names = [...new Set(samples.flatMap((s) => Object.keys(s.metrics)))];
  return names.map((metric) => {
    const ordered = [...pairs.values()];
    return {
      metric,
      before: statistics(ordered.map((pair) => pair.before[metric])),
      after: statistics(ordered.map((pair) => pair.after[metric])),
      delta: statistics(
        ordered.map((pair) =>
          Number.isFinite(pair.before[metric]) &&
          Number.isFinite(pair.after[metric])
            ? pair.after[metric] - pair.before[metric]
            : null
        )
      ),
    };
  });
}

export function formatStats(stats) {
  return stats
    ? `${stats.mean.toFixed(2)} +/- ${stats.sd?.toFixed(2) ?? 'n/a'}`
    : 'n/a';
}

export function printComparison(rows) {
  const table = [
    ['Metric', 'Before', 'After', 'Paired delta (after - before)'],
    ...rows.map((row) => [
      row.metric,
      formatStats(row.before),
      formatStats(row.after),
      formatStats(row.delta),
    ]),
  ];
  const widths = table[0].map((_, index) =>
    Math.max(...table.map((row) => row[index].length))
  );
  for (const row of table) {
    console.log(
      row.map((cell, index) => cell.padEnd(widths[index])).join('  ')
    );
  }
}
