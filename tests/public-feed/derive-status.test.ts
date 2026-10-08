// Pure unit tests — no database. This is the one piece of feed logic most
// likely to be silently wrong to an external consumer (a stale "upcoming"
// label, or a cancelled event still showing as live), so it gets the same
// "extract + unit test" treatment as planRoleReassignment().
import { describe, it, expect } from 'vitest';
import { deriveFeedStatus, type DeriveStatusInput } from '@/lib/public-feed/derive-status';

const base: Omit<DeriveStatusInput, 'now'> = {
  status: 'active',
  start: new Date('2027-01-15T16:45:00Z'),
  end: new Date('2027-01-15T23:59:59Z'),
};

describe('deriveFeedStatus', () => {
  it('excludes deleted events entirely, regardless of dates', () => {
    const result = deriveFeedStatus({ ...base, status: 'deleted', now: new Date('2027-01-15T18:00:00Z') });
    expect(result).toBeNull();
  });

  it('reports cancelled events as cancelled even mid-window', () => {
    const result = deriveFeedStatus({ ...base, status: 'cancelled', now: new Date('2027-01-15T18:00:00Z') });
    expect(result).toBe('cancelled');
  });

  it('reports upcoming even when the stored status is stale ("ongoing"/"completed" are ignored outside cancelled/deleted)', () => {
    const result = deriveFeedStatus({ ...base, status: 'completed', now: new Date('2026-01-01T00:00:00Z') });
    expect(result).toBe('upcoming');
  });

  it('is upcoming before the start instant', () => {
    const result = deriveFeedStatus({ ...base, now: new Date('2027-01-15T10:00:00Z') });
    expect(result).toBe('upcoming');
  });

  it('is live between start and end', () => {
    const result = deriveFeedStatus({ ...base, now: new Date('2027-01-15T20:00:00Z') });
    expect(result).toBe('live');
  });

  it('is past after the end instant', () => {
    const result = deriveFeedStatus({ ...base, now: new Date('2027-01-16T00:00:01Z') });
    expect(result).toBe('past');
  });

  it('stays live through a multi-day end instant', () => {
    const result = deriveFeedStatus({
      ...base, end: new Date('2027-01-17T23:59:59Z'), now: new Date('2027-01-17T22:30:00Z'),
    });
    expect(result).toBe('live');
  });

  it('is live on an intermediate day of a multi-day event', () => {
    const result = deriveFeedStatus({
      ...base, end: new Date('2027-01-17T23:59:59Z'), now: new Date('2027-01-16T08:00:00Z'),
    });
    expect(result).toBe('live');
  });

  it('treats the exact start instant as live, not upcoming', () => {
    const result = deriveFeedStatus({ ...base, now: new Date('2027-01-15T16:45:00Z') });
    expect(result).toBe('live');
  });

  it('treats the exact end instant as live, not past', () => {
    const result = deriveFeedStatus({ ...base, now: new Date('2027-01-15T23:59:59Z') });
    expect(result).toBe('live');
  });
});
