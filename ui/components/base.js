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

/** Where focus is, as a way to find it again after a redraw: the row it is in, and whether it is the row itself or its summary button. */
function focusSpot(active, target) {
  const row = active?.closest?.('tg-row');
  if (!row || !target.contains(row)) return null;
  const key = ROW_KEYS.find((name) => row.hasAttribute(name));
  if (!key) return null;
  const inSummary = active !== row && active.matches('[data-part="summary"]');
  if (active !== row && !inSummary) return null;
  return { selector: `tg-row[${key}="${CSS.escape(row.getAttribute(key))}"]`, summary: inSummary };
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
    const spot = focused ? null : focusSpot(active, target);

    target.innerHTML = html;

    // A row that had focus has been replaced by one like it: focus goes back to it, so the keys go on from there.
    if (spot) {
      const row = target.querySelector(spot.selector);
      (spot.summary ? row?.querySelector(':scope > [data-part="summary"]') : row)?.focus();
    }

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
