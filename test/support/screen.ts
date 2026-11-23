/**
 * Just enough of a page for the screen's modules to import and draw in Node, so their pure parts can be tested:
 * an element is a bag of attributes and listeners, its `patch` keeps the markup it was given, and nothing is laid
 * out. What the screen sends to the main thread is kept in `sent`.
 *
 * Import this before any module under `ui/`: the modules define their elements, and read `window`, when they load.
 */

export const sent: any[] = [];
const registry = new Map<string, any>();

class Element {
  attrs = new Map<string, string>();
  listeners: [string, (event: any) => void][] = [];
  isConnected = false;
  hidden = false;
  style: Record<string, unknown> = { setProperty() {} };
  classList = { toggle() {} };
  html = '';
  focused = false;
  setAttribute(name: string, value: unknown) {
    this.attrs.set(name, String(value));
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string) {
    return this.attrs.has(name);
  }
  removeAttribute(name: string) {
    this.attrs.delete(name);
  }
  addEventListener(type: string, fn: (event: any) => void) {
    this.listeners.push([type, fn]);
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  contains() {
    return true;
  }
  focus() {
    this.focused = true;
  }
}

Object.assign(globalThis, {
  HTMLElement: Element,
  customElements: { get: (name: string) => registry.get(name), define: (name: string, element: unknown) => registry.set(name, element) },
  window: { innerWidth: 460, innerHeight: 720, addEventListener() {} },
  parent: { postMessage: (message: any) => sent.push(message.pluginMessage) },
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {},
    activeElement: null,
  },
  CSS: { escape: (text: string) => text },
});

/** A module of the screen, by its path under `ui/`. */
export const screen = (path: string): Promise<any> => import(new URL(`../../ui/${path}`, import.meta.url).href);

/** One element of the screen, made but not connected: `setup()` is the caller's to run. */
export function make(tag: string): any {
  const element = new (registry.get(tag))();
  element.patch = (html: string) => {
    element.html = html;
  };
  return element;
}

/** Draws one element from `state`, and returns its markup. */
export function draw(tag: string, state: unknown): string {
  const element = make(tag);
  element.update(state);
  return element.html;
}

/** An event of `type` on a node that matches `selector` and nothing else, as the element's delegated listeners see it. */
export function fire(element: any, type: string, selector: string) {
  const target = { closest: (asked: string) => (asked === selector ? target : null), dataset: {} };
  for (const [listening, fn] of element.listeners) if (listening === type) fn({ type, target, preventDefault() {} });
}

/** The markup's words, without its tags and icons. */
export const words = (html: string) =>
  html
    .replace(/<i [^>]*><\/i>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
