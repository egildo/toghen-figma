import { send } from './commandBus.js';

/**
 * The two things in this UI that are dragged: the plugin window itself, and the
 * splitter above the shared result surface.
 *
 * Neither is native. A Figma plugin window cannot be resized by the user — the
 * plugin has to offer the affordance and call `figma.ui.resize()` itself, which
 * is why every plugin that resizes grows its own corner grip.
 */

const MIN_WIDTH = 320;
const MIN_HEIGHT = 320;
/** Below this the surface is a header and nothing else, which is its collapsed form. */
const MIN_RESULTS_HEIGHT = 120;

export function initShell() {
  initWindowGrip();
  initResultsSurface();
}

/* ─── Resizing the plugin window ─── */
/**
 * The grip must track the pointer in **screen** coordinates, against the size
 * the drag started from.
 *
 * `clientX`/`clientY` are relative to the iframe viewport — and the iframe
 * viewport is the very thing being resized. Reading them mid-drag is a feedback
 * loop: the window resizes, the grip moves with it, the origin shifts under the
 * pointer, and the next frame measures against a different reference. The window
 * stutters, drifts, or stops following at all. `screenX`/`screenY` are absolute
 * to the display and hold still while everything else moves.
 */
function initWindowGrip() {
  const grip = document.getElementById('window-grip');
  if (!grip) return;

  let origin = null;
  let pending = null;
  let frame = 0;

  const flush = () => {
    frame = 0;
    if (pending) send({ type: 'RESIZE_UI', payload: pending });
  };

  // Listeners go on `window`, not on the grip, and there is no
  // `setPointerCapture`. The grip is `position: fixed` in the bottom-right
  // corner of the very viewport being resized, so it moves under the pointer on
  // every frame of the drag — capturing the pointer to an element that is being
  // relaid out is how the first attempt lost the gesture after a frame or two.
  // `window` does not move.
  const onMove = (event) => {
    if (!origin) return;

    pending = {
      width: Math.max(MIN_WIDTH, Math.round(origin.width + (event.screenX - origin.screenX))),
      height: Math.max(MIN_HEIGHT, Math.round(origin.height + (event.screenY - origin.screenY))),
    };

    // One message per frame. A pointermove fires far more often than the window
    // can redraw, and every one of them crosses the iframe boundary.
    if (!frame) frame = requestAnimationFrame(flush);
  };

  const onUp = () => {
    if (!origin) return;
    origin = null;

    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    grip.classList.remove('is-dragging');

    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    // Only the final size is worth remembering; persisting every frame would
    // write to clientStorage dozens of times for one gesture.
    if (pending) send({ type: 'RESIZE_UI', payload: { ...pending, remember: true } });
    pending = null;
  };

  grip.addEventListener('pointerdown', (event) => {
    origin = {
      screenX: event.screenX,
      screenY: event.screenY,
      width: window.innerWidth,
      height: window.innerHeight,
    };
    grip.classList.add('is-dragging');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    event.preventDefault();
  });
}

/* ─── Resizing the result surface ─── */
/**
 * The splitter above the surface writes `--results-height` inline. An inline
 * custom property beats the stylesheet's relative heights, so a size the person
 * chose is never overridden by a later result, and nothing has to remember that
 * they chose it. Collapsing is the surface's own (its bar is the toggle).
 */
function initResultsSurface() {
  const surface = document.querySelector('tg-results');
  const splitter = document.getElementById('results-splitter');
  if (!surface || !splitter) return;

  let dragging = false;

  splitter.addEventListener('pointerdown', (event) => {
    dragging = true;
    splitter.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  splitter.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    // The surface grows upward: the distance from the pointer to the bottom of
    // the window is the height being asked for.
    const height = window.innerHeight - event.clientY;
    if (height < MIN_RESULTS_HEIGHT) return;
    surface.style.setProperty('--results-height', `${Math.round(height)}px`);
  });

  const stop = (event) => {
    if (!dragging) return;
    dragging = false;
    splitter.releasePointerCapture(event.pointerId);
  };

  splitter.addEventListener('pointerup', stop);
  splitter.addEventListener('pointercancel', stop);
}
