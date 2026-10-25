/**
 * Two files over one FigCraft connection: a pin by path (a tab, a file opened, a file made), a bridge per pin taking
 * turns, and the root's data (the lock) kept in the record so the next run reads it. Synthetic names only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bridgeOn, connect, pinPath, pinShownFile, savePinned } from '../cli/figcraft.js';
import type { LockedLibrary } from '../shared/protocol.js';
import { startFakeFigcraft } from './support/fakeFigcraft.js';

const quiet = { stdout: () => {}, stderr: () => {} };
const entry = (key: string): LockedLibrary => ({ by: 'build', components: { Badge: { key, set: true } }, styles: {}, variables: {} });

describe('two files over one FigCraft connection', () => {
  it('pins a file by path: its tab, a file opened from disk, or a new file saved there later', async () => {
    const fake = await startFakeFigcraft(['target']);
    const control = await connect(fake.port);
    try {
      fake.disk.set('/work/kept.figcraft', {
        name: 'kept',
        path: '/work/kept.figcraft',
        collections: [],
        variables: [],
        styles: [],
        pages: [{ id: 1, name: 'Page 1', current: true }],
      });
      const opened = await pinPath(control, '/work/kept.figcraft');
      assert.equal(opened.tab.name, 'kept');
      assert.equal(opened.made, undefined);
      assert.equal((await pinPath(control, '/work/kept.figcraft')).tab.index, opened.tab.index, 'found where it is open');
      const made = await pinPath(control, '/work/new-library.figcraft');
      assert.equal(made.made, true);
      assert.equal(made.tab.path, null);
      await savePinned(control, made, '/work/new-library.figcraft');
      assert.equal(made.tab.path, '/work/new-library.figcraft');
      assert.ok(fake.disk.has('/work/new-library.figcraft'));
    } finally {
      control.close();
      await fake.close();
    }
  });

  it("gives each bridge its own file, turn about, and keeps each file's lock for the next run", async () => {
    const fake = await startFakeFigcraft(['target']);
    fake.disk.set('/work/library.figcraft', {
      name: 'library',
      path: '/work/library.figcraft',
      collections: [],
      variables: [],
      styles: [],
      pages: [{ id: 1, name: 'Page 1', current: true }],
    });
    const controls: Array<{ close(): void }> = [];
    const open = async () => {
      // The target is the file shown when a run begins.
      fake.active = 0;
      const control = await connect(fake.port);
      controls.push(control);
      const target = await bridgeOn(control, await pinShownFile(control), quiet, false);
      const library = await bridgeOn(control, await pinPath(control, '/work/library.figcraft'), quiet, false);
      return { control, target, library };
    };
    try {
      const first = await open();
      for (const [bridge, key] of [
        [first.target, 'target-key'],
        [first.library, 'library-key'],
        [first.target, 'target-key-2'],
      ] as const) {
        const answer = await bridge.request({ type: 'LOCK_WRITE', payload: { library: 'ds', entry: entry(key) } }, ['LOCK']);
        assert.equal(answer.type, 'LOCK');
      }
      await first.target.close();
      await first.library.close();
      first.control.close();
      // Nothing of the lock lives in memory any more: each file's record holds its own.
      const second = await open();
      const read = async (bridge: typeof second.target) => {
        const answer = await bridge.request({ type: 'GET_LOCK', payload: {} }, ['LOCK']);
        return answer.type === 'LOCK' ? answer.payload.libraries.ds?.components.Badge.key : undefined;
      };
      assert.equal(await read(second.target), 'target-key-2');
      assert.equal(await read(second.library), 'library-key');
      assert.equal(await read(second.target), 'target-key-2');
      await second.target.close();
      await second.library.close();
      second.control.close();
      assert.ok(
        fake.tabs.every((tab) => tab.pages.some((page) => page.name === '-toghen')),
        'each file has its record page',
      );
    } finally {
      for (const control of controls) control.close();
      await fake.close();
    }
  });
});
