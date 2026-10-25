/**
 * The window's two remembered sizes, the switch between them, and the grip.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';
import { RESIZE_UI, loadWindowSizes, WINDOW_SIZES_KEY } from '../main/handlers/resizeUi.js';

describe('the window', () => {
  useFigmaMock();

  it('opens narrow at the size the design is drawn at, with a wide size ready', async () => {
    createFigmaMock().install();
    assert.deepEqual(await loadWindowSizes(), { mode: 'narrow', narrow: { width: 460, height: 720 }, wide: { width: 980, height: 620 } });
  });

  it('reads a size kept before there were two, once, as the narrow one', async () => {
    createFigmaMock().withClientStorage('windowSize', { width: 500, height: 800 }).install();
    const sizes = await loadWindowSizes();
    assert.deepEqual(sizes.narrow, { width: 500, height: 800 });
    assert.equal(sizes.mode, 'narrow');
  });

  it('switches to the other size, stores the mode, and says so', async () => {
    const mock = createFigmaMock().install();
    await RESIZE_UI({ mode: 'wide' });

    assert.deepEqual(mock.calls('ui.resize').at(-1)?.args, [980, 620]);
    assert.equal((mock.clientStorage(WINDOW_SIZES_KEY) as { mode: string }).mode, 'wide');
    assert.deepEqual(mock.calls('ui.postMessage').at(-1)?.args[0], { type: 'WINDOW_MODE', payload: { mode: 'wide' } });
  });

  it('remembers a dragged size under the mode the window is in', async () => {
    const mock = createFigmaMock().install();
    await RESIZE_UI({ mode: 'wide' });
    await RESIZE_UI({ width: 1100, height: 700 });
    assert.equal((await loadWindowSizes()).wide.width, 980, 'a frame of the drag is not remembered');
    await RESIZE_UI({ width: 1100, height: 700, remember: true });

    const sizes = await loadWindowSizes();
    assert.deepEqual(sizes.wide, { width: 1100, height: 700 });
    assert.deepEqual(sizes.narrow, { width: 460, height: 720 });

    // Back to narrow, and wide is still the size it was dragged to.
    await RESIZE_UI({ mode: 'narrow' });
    await RESIZE_UI({ mode: 'wide' });
    assert.deepEqual(mock.calls('ui.resize').at(-1)?.args, [1100, 700]);
  });

  it('never makes the window smaller than its minimum', async () => {
    const mock = createFigmaMock().install();
    await RESIZE_UI({ width: 100, height: 50, remember: true });
    assert.deepEqual(mock.calls('ui.resize').at(-1)?.args, [320, 320]);
  });
});
