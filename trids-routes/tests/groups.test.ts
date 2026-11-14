import { describe, expect, it } from 'vitest';
import { groupRoutes, suggestRouteName } from '../src/groups';
import type { DayPlan } from '../src/types';

function route(date: string, name = ''): DayPlan {
  return {
    id: date + name,
    name,
    date,
    startAddress: '',
    departAt: '08:00',
    stops: [],
    travel: [],
    eta: [],
    late: [],
    optimized: false,
    finished: false,
  };
}

describe('groupRoutes', () => {
  it('splits today, earlier this week, earlier this month, and older months', () => {
    const groups = groupRoutes(
      [route('2026-11-14'), route('2026-11-13'), route('2026-11-09'), route('2026-11-07'), route('2026-09-30', 'Thursday Route 2')],
      '2026-11-14',
    );
    expect(groups.map((group) => group.title)).toEqual(['Today', 'Earlier this week', 'Earlier this month', 'Sept 2026']);
    expect(groups[1].routes.map((item) => item.date)).toEqual(['2026-11-13', '2026-11-09']);
  });

  it('names a second route on the same day', () => {
    expect(suggestRouteName('2026-11-14', [])).toBe('Saturday Route');
    expect(suggestRouteName('2026-11-14', [route('2026-11-14', 'Saturday Route')])).toBe('Saturday Route 2');
  });
});
