/**
 * JSON helpers that revive ISO date strings back into Date objects.
 *
 * Without a reviver, every Date-valued field survives a JSON round-trip as a
 * string — the TypeScript types still say `Date` but the runtime value is
 * `string`.  Accessing `.getTime()` / `.toISOString()` on those strings
 * silently returns `undefined` or throws.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }
  return value;
}

/**
 * `JSON.parse` with automatic ISO-date revival.  Safe to use on any JSON
 * string — non-date strings are left untouched.
 */
export function safeJsonParse<T = unknown>(text: string): T {
  return JSON.parse(text, dateReviver) as T;
}
