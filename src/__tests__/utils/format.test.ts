import { formatDuration, formatDate, formatDateTime, formatRelativeTime, daysBetween } from '../../utils/format';

describe('formatDuration', () => {
  it('returns "0m" for zero minutes', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('returns "0m" for negative values', () => {
    expect(formatDuration(-5)).toBe('0m');
  });

  it('formats minutes-only durations', () => {
    expect(formatDuration(1)).toBe('1m');
    expect(formatDuration(30)).toBe('30m');
    expect(formatDuration(59)).toBe('59m');
  });

  it('formats hours + minutes durations', () => {
    expect(formatDuration(60)).toBe('1h 0m');
    expect(formatDuration(75)).toBe('1h 15m');
    expect(formatDuration(180)).toBe('3h 0m');
    expect(formatDuration(1440)).toBe('24h 0m');
  });
});

describe('daysBetween', () => {
  it('returns 0 for same date', () => {
    const d = new Date('2025-06-01T12:00:00Z');
    expect(daysBetween(d, d)).toBe(0);
  });

  it('returns 1 for one day difference', () => {
    const a = new Date('2025-06-01T12:00:00Z');
    const b = new Date('2025-06-02T12:00:00Z');
    expect(daysBetween(a, b)).toBe(1);
  });

  it('returns negative for earlier date', () => {
    const a = new Date('2025-06-02T12:00:00Z');
    const b = new Date('2025-06-01T12:00:00Z');
    expect(daysBetween(a, b)).toBe(-1);
  });
});

describe('formatRelativeTime', () => {
  it('returns "just now" for very recent times', () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 5000); // 5 seconds ago
    expect(formatRelativeTime(recent, now)).toBe('just now');
  });

  it('returns minutes ago for past times', () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const result = formatRelativeTime(fiveMinAgo, now);
    expect(result).toContain('minute');
    expect(result).toContain('ago');
  });

  it('returns hours ago for hours-old times', () => {
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const result = formatRelativeTime(threeHoursAgo, now);
    expect(result).toContain('hour');
    expect(result).toContain('ago');
  });

  it('returns days ago for days-old times', () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const result = formatRelativeTime(twoDaysAgo, now);
    expect(result).toContain('day');
    expect(result).toContain('ago');
  });
});
