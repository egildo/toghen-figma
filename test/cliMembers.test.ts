/**
 * `toghen-figma members`: each component file read and expanded against the design system, printed as JSON, with no
 * plugin and no Figma file. Synthetic tokens in the W3C structured shapes; the files come through a fake `readFile`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { main, type Io } from '../cli/main.js';

const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Tokens',
  sets: {
    base: {
      sources: [
        {
          space: { $type: 'dimension', sm: { $value: { value: 8, unit: 'px' } }, md: { $value: { value: 1, unit: 'rem' } } },
          surface: { page: { $type: 'color', $value: srgb(0.96, 0.97, 1) } },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
};

const chip = `component Chip
properties {
    VARIANT Size small large
    TEXT Label default="Chip"
}
guard large { is (input)Size large }
FRAME Chip layoutMode=HORIZONTAL itemSpacing="{space.sm}" {
    fills "{surface.page}"
    when large itemSpacing="{space.md}"
    TEXT Label characters=(property)Label
}
`;

async function members(argv: string[], files: Record<string, string>) {
  let stdout = '';
  let stderr = '';
  const io: Io = {
    cwd: '/repo',
    readFile: (path) => {
      if (!(path in files)) throw new Error(`no such file ${path}`);
      return files[path];
    },
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    pairingFile: '/nowhere/pairing',
  };
  const code = await main(['members', ...argv], io);
  return { code, stdout, stderr };
}

const FILES = { '/repo/tokens.resolver.json': JSON.stringify(DOCUMENT) };

describe('toghen-figma members', () => {
  it("prints each file's component and its members as JSON: one member per combination, each field as the file wrote it", async () => {
    const out = await members(['tokens.resolver.json', 'chip.component.kdl'], { ...FILES, '/repo/chip.component.kdl': chip });
    assert.equal(out.code, 0, out.stderr);
    const [file] = JSON.parse(out.stdout);
    assert.equal(file.file, 'chip.component.kdl');
    assert.equal(file.component.name, 'Chip');
    assert.deepEqual(
      file.members.map((member: { name: string }) => member.name),
      ['Size=small', 'Size=large'],
    );
    const large = file.members[1].tree;
    assert.deepEqual(large.fields.itemSpacing, { kind: 'token', path: 'space.md' });
    assert.deepEqual(large.children[0].fields.characters, { kind: 'property', name: 'Label' });
    assert.deepEqual(file.problems, []);
  });

  it('exits 1 for a file with an error, which it prints with no members', async () => {
    const out = await members(['tokens.resolver.json', 'chip.component.kdl'], {
      ...FILES,
      '/repo/chip.component.kdl': chip.replace('VARIANT Size', 'VARIANT'),
    });
    assert.equal(out.code, 1);
    const [file] = JSON.parse(out.stdout);
    assert.ok(file.problems.some((problem: { severity: string }) => problem.severity === 'error'));
    assert.deepEqual(file.members, []);
  });

  it('takes the entry and at least one file', async () => {
    assert.equal((await members(['tokens.resolver.json'], FILES)).code, 1);
  });
});
