/**
 * Words and numbers as the screen writes them.
 *
 * Dates are absolute, never "3 days ago": the question a date answers here is
 * whether something happened before or after the change being looked at, and a
 * relative phrase cannot settle it.
 */

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** `escHtml` leaves quotes alone, which is fine in text and not in an attribute. */
export function escAttr(str) {
  return escHtml(str).replace(/"/g, '&quot;');
}

/** `8 Oct 2026, 09:14`. */
export function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso ?? '');
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** `1 Oct, 16:03`: a date and time where the year goes without saying, in a table cell. */
export function formatShort(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso ?? '');
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** `6 Oct 2026`. */
export function formatDay(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso ?? '');
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The time something was looked at: the clock alone on the same day, the date
 * as well otherwise. How stale the claim is, is the whole question, and on the
 * same day the date answers nothing.
 */
export function formatClock(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString(
    undefined,
    sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  );
}

export function countOf(n, noun, plural = `${noun}s`) {
  return `${n} ${n === 1 ? noun : plural}`;
}

/** A thousands separator, the way the locale writes one. */
export function number(n) {
  return Number(n).toLocaleString();
}

/**
 * A design system's monogram: initials from its first two words, and a hue
 * from its name, so the same system always wears the same colour. The one
 * colour on screen computed rather than taken from a token.
 */
export function monogram(name, size) {
  const words = String(name ?? '?')
    .trim()
    .split(/[\s\-_.]+/)
    .filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 1)).toUpperCase();
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `<span class="tg-monogram"${size ? ` data-size="${size}"` : ''} style="--hue: ${hash % 360}" aria-hidden="true">${escHtml(initials)}</span>`;
}
