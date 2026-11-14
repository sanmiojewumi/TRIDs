import { describe, expect, it } from 'vitest';
import { optimiseRoute } from '../src/optimize';
import { formatTime, parseTime } from '../src/time';

describe('optimiseRoute', () => {
  it('visits the stop whose window closes first, even when it is further away', () => {
    const duration = [
      [0, 30, 5],
      [30, 0, 10],
      [5, 40, 0],
    ];
    const plan = optimiseRoute(
      duration,
      [
        { start: 8 * 60, end: 8 * 60 + 35 },
        { start: 8 * 60, end: 12 * 60 },
      ],
      8 * 60,
      [5, 5],
    );
    expect(plan.order).toEqual([0, 1]);
    expect(plan.late).toEqual([0, 0]);
    expect(formatTime(plan.arrival[0])).toBe('08:30');
  });

  it('waits for a window that has not opened yet', () => {
    const duration = [
      [0, 10],
      [10, 0],
    ];
    const plan = optimiseRoute(duration, [{ start: 9 * 60, end: 10 * 60 }], 8 * 60, [15]);
    expect(plan.arrival).toEqual([9 * 60]);
    expect(plan.late).toEqual([0]);
  });

  it('returns an empty plan when there are no stops', () => {
    expect(optimiseRoute([[0]], [], 8 * 60, []).order).toEqual([]);
  });

  it('parses clock times', () => {
    expect(parseTime('08:05')).toBe(485);
    expect(parseTime('')).toBeNull();
    expect(formatTime(8 * 60 + 5)).toBe('08:05');
  });
});
