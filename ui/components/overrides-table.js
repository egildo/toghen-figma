/**
 * An overrides map as a table: a name as written, and what was used instead.
 *
 * One shape, used twice (`Overrides` in `shared/protocol.ts`): files in the Load
 * pane, where a `$ref` as written reads another file, and Figma objects in the
 * Build pane, where a name a blueprint writes is swapped for another. One table
 * draws both; each caller names its two columns.
 *
 * A key that matched nothing is a row too, marked as a problem and its words
 * whole (R4): a map entry that did nothing is a typo or a stale path, and a
 * table that left it out would read as though every entry had worked.
 */

import { icon } from '../markup.js';
import { escAttr, escHtml } from '../format.js';

/**
 * @param {{ from: string, to: string, unused?: boolean }[]} rows  `unused`: the key matched nothing; `to` is what the map asked for.
 * @param {{ from: string, to: string }} headings  The two columns' names.
 * @param {{ removable?: boolean }} options  `removable`: each row ends with a Remove (`data-action="override-remove"`, `data-key`), where the map is edited.
 */
export function overridesTable(rows, headings, { removable = false } = {}) {
  const remove = (entry) =>
    removable
      ? `<td class="remove"><button type="button" class="tg-button" data-size="sm" data-variant="quiet" data-action="override-remove" data-key="${escAttr(entry.from)}">Remove</button></td>`
      : '';
  const body = rows
    .map((entry) =>
      entry.unused
        ? `<tr data-unused><td>${escHtml(entry.from)}</td>` +
          `<td data-tone="warn">${icon('warning', 'sm')} matched nothing <span class="faint">(the map says <span data-text="code">${escHtml(entry.to)}</span>)</span></td>${remove(entry)}</tr>`
        : `<tr><td>${escHtml(entry.from)}</td><td>${escHtml(entry.to)}</td>${remove(entry)}</tr>`,
    )
    .join('');
  return (
    `<table class="tg-table overrides"><thead><tr><th>${escHtml(headings.from)}</th><th>${escHtml(headings.to)}</th>${removable ? '<th><span class="tg-visually-hidden">Remove</span></th>' : ''}</tr></thead>` +
    `<tbody>${body}</tbody></table>`
  );
}
