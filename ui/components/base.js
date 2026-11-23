/**
 * What every container element shares: it takes the whole state through a
 * `state` setter, draws itself from a template string, and listens by
 * delegation, because its children are replaced on every change that matters.
 *
 * Light DOM, no shadow root: one stylesheet styles everything, as before.
 */

/**
 * What names a row that can hold focus, so focus survives a redraw that replaces it:
 * an option of a column, a row that opens, a row that loads.
 */
const ROW_KEYS = ['data-open-group', 'data-open-token', 'data-template', 'data-recent'];

/** The attributes that say how a control looks or what state it is in, not which control it is. */
const LOOKS = ['data-variant', 'data-size', 'data-shape', 'data-text', 'data-tone', 'data-density', 'data-state', 'data-over'];

/**
 * Where focus is, as a way to find it again after a redraw. In a row that can hold focus: the row, and whether it
 * is the row itself or its summary. Any other control: a selector for its like, by what names it (its tag and
 * the `data-*` that are not its look), and which of those it was.
 */
function focusSpot(active, target) {
  if (!active || active === target || !target.contains(active)) return null;
  const row = active.closest?.('tg-row');
  const key = row && target.contains(row) && ROW_KEYS.find((name) => row.hasAttribute(name));
  const inSummary = !!key && active !== row && active.matches('[data-part="summary"]');
  if (key && (active === row || inSummary))
    return { selector: `tg-row[${key}="${CSS.escape(row.getAttribute(key))}"]`, summary: inSummary };
  const names = [...active.attributes]
    .map((attribute) => attribute.name)
    .filter((name) => name.startsWith('data-') && !LOOKS.includes(name));
  const selector = active.localName + names.map((name) => `[${name}="${CSS.escape(active.getAttribute(name))}"]`).join('');
  return { selector, index: [...target.querySelectorAll(selector)].indexOf(active) };
}

export class TgElement extends HTMLElement {
  set state(value) {
    this._state = value;
    if (this.isConnected) this.update(value);
  }

  get state() {
    return this._state;
  }

  connectedCallback() {
    if (!this._bound) {
      this._bound = true;
      this.setup?.();
    }
    if (this._state) this.update(this._state);
  }

  /** Draws from state. Each element overrides it. */
  update() {}

  /**
   * Replaces `target`'s markup, and only when it changed.
   *
   * What a person typed or ticked is not in the state, so it is carried across
   * by id; so are focus and the caret. An input whose value the state owns says
   * so with `data-controlled`, and keeps the value the markup gives it.
   */
  patch(html, target = this) {
    if (target._html === html) return;
    target._html = html;

    const kept = new Map();
    for (const field of target.querySelectorAll('input[id], select[id], textarea[id]')) {
      if (!field.hasAttribute('data-controlled')) kept.set(field.id, { value: field.value, checked: field.checked });
    }
    const active = document.activeElement;
    const focused = active && target.contains(active) && active.id ? active.id : null;
    const caret = focused && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    // Focus that a redraw could not put back, because its control was disabled while a command ran, is still owed.
    const owed = !active || active === document.body ? target._owedFocus : null;
    const spot = focused ? null : (focusSpot(active, target) ?? owed);

    target.innerHTML = html;

    // What had focus has been replaced by one like it: focus goes back to it, so the keys go on from there.
    let owing = null;
    if (spot) {
      const like = spot.index === undefined ? target.querySelector(spot.selector) : target.querySelectorAll(spot.selector)[spot.index];
      const element = spot.summary ? like?.querySelector(':scope > [data-part="summary"]') : like;
      element?.focus();
      if (element && document.activeElement !== element) owing = spot;
    }
    target._owedFocus = owing;

    for (const [id, was] of kept) {
      const field = target.querySelector(`#${CSS.escape(id)}`);
      if (!field || field.hasAttribute('data-controlled') || field.type === 'file') continue;
      if (field.type === 'checkbox' || field.type === 'radio') field.checked = was.checked;
      else field.value = was.value;
    }
    if (focused) {
      const field = target.querySelector(`#${CSS.escape(focused)}`);
      if (field) {
        field.focus();
        if (caret && typeof field.setSelectionRange === 'function') {
          try {
            field.setSelectionRange(caret[0], caret[1]);
          } catch {
            // Not every input type has a caret.
          }
        }
      }
    }
  }

  /** A delegated listener: `fn(matched, event)` for events inside a match of `selector`. */
  on(type, selector, fn) {
    this.addEventListener(type, (event) => {
      const matched = event.target?.closest?.(selector);
      if (matched && this.contains(matched)) fn(matched, event);
    });
  }
}

/** Defines an element once, so a module imported twice does not throw. */
export function define(name, constructor) {
  if (!customElements.get(name)) customElements.define(name, constructor);
}
