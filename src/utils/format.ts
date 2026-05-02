/**
 * Shared formatting utilities for Dead Yet.
 * Extracted from HomeScreen and ActivityScreen to eliminate DRY violations.
 */

/**
 * Format a duration in minutes to human-readable string.
 * @example formatDuration(75) → "1h 15m"
 * @example formatDuration(30) → "30m"
 * @example formatDuration(0)  → "0m"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Format a Date to a locale-friendly string (e.g., "Jan 5, 2025").
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a Date to a locale-friendly date+time string (e.g., "Jan 5, 2025, 3:30 PM").
 */
export function formatDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Return a human-readable relative time string.
 * @example formatRelativeTime(someDate) → "2 hours ago" or "in 3 days"
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);
  const seconds = Math.floor(absDiffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const prefix = diffMs < 0 ? '' : 'in ';
  const suffix = diffMs < 0 ? ' ago' : '';

  if (days > 0) return `${prefix}${days} day${days > 1 ? 's' : ''}${suffix}`;
  if (hours > 0) return `${prefix}${hours} hour${hours > 1 ? 's' : ''}${suffix}`;
  if (minutes > 0) return `${prefix}${minutes} minute${minutes > 1 ? 's' : ''}${suffix}`;
  return 'just now';
}

/**
 * Return the number of full days between two dates.
 */
export function daysBetween(a: Date, b: Date): number {
  const diff = b.getTime() - a.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
