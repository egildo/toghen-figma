/**
 * The markup the screen writes for the design system's components, spelled as
 * its gallery spells them (`@toghen/ui`, `dev/gallery.html`). The elements that
 * need script (the dot, the chip, the callout, the card, the row, the tabs, the
 * segmented control) are defined by `@toghen/ui/elements.js`, imported once in
 * `main.js`; the stylesheet is the design system's. Nothing here draws.
 */

import { iconMarkup } from '@toghen/ui/icons.js';
import { escHtml } from './format.js';

/** One icon, by the name the screen has always used (`token`, `chevronDown`); `size` is `sm`, `lg` or `xl`. */
export const icon = (name, size, tone) => iconMarkup(name, { size, tone });

/** The markup for one dot; `none` is silence. */
export const dot = (state, attrs = '') =>
  `<tg-dot${state && state !== 'none' ? ` data-state="${state}"` : ''}${attrs ? ` ${attrs}` : ''}></tg-dot>`;

/** A counter chip: tone `warn`, `err` or `ok`; `variant` is `code`; `content` is already markup. */
export const chip = (content, { tone, size, variant, attrs = '' } = {}) =>
  `<tg-chip${tone && tone !== 'plain' ? ` data-tone="${tone}"` : ''}${size ? ` data-size="${size}"` : ''}${variant ? ` data-variant="${variant}"` : ''}${attrs ? ` ${attrs}` : ''}>${content}</tg-chip>`;

/**
 * A callout: inform, warn, stop. A title, one line, and at most one action;
 * `title` and `line` are markup, `button` is the button's markup. The element
 * draws the mark. A small one is the one-sentence form that sits inside a
 * row's detail.
 */
export function callout(tone, title, line, button = '', small = false) {
  return (
    `<tg-callout data-tone="${tone}"${small ? ' data-size="sm"' : ''}>` +
    `<div data-part="text"><span data-part="title">${title}</span>${line ? `<span data-part="line">${line}</span>` : ''}</div>` +
    `${button}</tg-callout>`
  );
}

/** A row of a card: a mark, what it says, and what it can do. The label may be markup; the trailing part, when there is one, holds the actions. */
export const row = (leading, label, trailing = '', attrs = '') =>
  `<tg-row data-density="roomy"${attrs ? ` ${attrs}` : ''}><span data-part="leading">${leading}</span><span data-part="label">${label}</span>` +
  `${trailing ? `<span data-part="trailing">${trailing}</span>` : ''}</tg-row>`;

/** A labelled card: the label above the box, with an optional time at its end. `cls` is the application's own hook. */
export function card(label, body, looked = '', cls = '') {
  return (
    `<tg-card${cls ? ` class="${cls}"` : ''}>` +
    (label
      ? `<div data-part="label"><span>${escHtml(label)}</span>${looked ? `<span data-part="note">${escHtml(looked)}</span>` : ''}</div>`
      : '') +
    `<div data-part="body">${body}</div></tg-card>`
  );
}
