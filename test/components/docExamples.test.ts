import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readComponentFile } from '../../shared/components/index.js';

const button = readFileSync(new URL('./fixtures/button.component.kdl', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./fixtures/shell.component.kdl', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../../guide.md', import.meta.url), 'utf8');
const specs = readFileSync(new URL('../../specs.md', import.meta.url), 'utf8');

/**
 * The guide's example is a fixture, so it cannot drift from the format: a change
 * that breaks the example breaks this test, and a change to the example must be
 * made in the fixture.
 */
describe('the guide’s component example', () => {
  it('is the fixture, verbatim', () => {
    assert.ok(guide.includes(button.trim()));
  });

  it('validates clean and expands to the one member the guide names', () => {
    const file = readComponentFile(button);
    assert.deepEqual(file.problems, []);
    assert.deepEqual(
      file.members.map((m) => m.name),
      ['Button'],
    );
  });

  it('produces the problem the guide shows for a bare number', () => {
    const [problem] = readComponentFile(button.replace('cornerRadius="{radius.md}"', 'cornerRadius=40')).problems;
    assert.ok(guide.includes(`line ${problem.line}, column ${problem.column}: ${problem.message}`));
  });
});

describe('the specs’ worked example', () => {
  it('is the fixture, verbatim', () => {
    assert.ok(specs.includes(shell.trim()));
  });

  it('validates with the one warning the specs name, and expands to the seven members they name', () => {
    const file = readComponentFile(shell);
    assert.deepEqual(
      file.problems.map((p) => [p.severity, p.member]),
      [['warning', 'Columns=single, Header in=page']],
    );
    assert.equal(file.members.length, 7);
    assert.ok(specs.includes('the set has **seven members**'));
  });
});
