/**
 * A member binds the variable that carries the token lib's precedence picks over all its parts, folded ones included.
 *
 * `pointer` stays in the path (a `selected.hover` part carries it together with the folded `selection`), and
 * `availability` folds. Under `pointer=hover, availability=disabled`, lib picks `disabled.backgroundColor`, the later
 * axis winning a tie: a cell of the rest's variable, which the member's `availability` pin selects. Synthetic tokens in
 * the W3C structured shapes, read through the `designSourceOf` the plugin uses.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { designSourceOf } from '../../main/utils/designSource.js';
import { readComponentFile } from '../../shared/components/index.js';

const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
const fill = (...components: number[]) => ({ $type: 'color', $value: srgb(...components) });
const radius = { $type: 'dimension', $value: { value: 4, unit: 'px' } };

const option = (extra: Record<string, unknown> = {}) => ({
  backgroundColor: fill(1, 1, 1),
  borderRadius: radius,
  hover: { backgroundColor: fill(0.9, 0.9, 0.9), ...extra },
  selected: { backgroundColor: fill(0, 0, 1), hover: { backgroundColor: fill(0, 0, 0.9) } },
  disabled: { backgroundColor: fill(0.5, 0.5, 0.5) },
});

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    base: {
      sources: [
        {
          ui: {
            $extensions: {
              'com.toghen': {
                css: {
                  parts: {
                    selection: { selected: '[aria-selected=true]' },
                    pointer: { hover: ':hover' },
                    availability: { disabled: '[aria-disabled=true]' },
                  },
                },
              },
            },
            option: option(),
            // The same, with the hover's own disabled ground, which folds into the hover's variable.
            chosen: option({ disabled: { backgroundColor: fill(0.6, 0.6, 0.6) } }),
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
} as unknown as ResolverDocument;

const design = designSourceOf(new Resolver(DOCUMENT));
const read = (group: string) => readComponentFile(`component Option tokens="{ui.${group}}"\nFRAME Option layoutMode=HORIZONTAL\n`, design);
const member = (file: ReturnType<typeof readComponentFile>, name: string) => {
  const found = file.members.find((candidate) => candidate.name === name);
  assert.ok(found, `no member ${name} among ${file.members.map((m) => m.name).join('; ')}`);
  return found.tree.fields;
};
const token = (path: string) => [{ kind: 'token', path }];

describe('a member binds what the precedence picks, folded parts included', () => {
  const file = read('option');

  it('lays the group out as the case needs: pointer in the path, selection and availability folded', () => {
    assert.deepEqual(
      file.problems.filter((problem) => problem.severity === 'error'),
      [],
    );
    assert.deepEqual(
      file.component?.properties.map((property) => property.type === 'VARIANT' && [property.name, property.modifier]),
      [
        ['selection', 'selection'],
        ['pointer', undefined],
        ['availability', 'availability'],
      ],
    );
  });

  it('binds the rest’s variable where a folded part outranks the path-kept one, and pins its mode', () => {
    const fields = member(file, 'selection=rest, pointer=hover, availability=disabled');
    assert.deepEqual(fields.fills, token('ui.option.backgroundColor'));
    assert.deepEqual(fields.modes, { selection: 'rest', availability: 'disabled' });
  });

  it('binds the path-kept part where nothing folded outranks it', () => {
    assert.deepEqual(member(file, 'selection=rest, pointer=hover, availability=rest').fills, token('ui.option.hover.backgroundColor'));
    assert.deepEqual(
      member(file, 'selection=selected, pointer=hover, availability=disabled').fills,
      token('ui.option.hover.backgroundColor'),
      'two parts beat one: selected.hover, a cell of the hover’s variable',
    );
  });

  it('binds what it bound before for a key the folded part does not give', () => {
    assert.deepEqual(member(file, 'selection=rest, pointer=hover, availability=disabled').cornerRadius, {
      kind: 'token',
      path: 'ui.option.borderRadius',
    });
  });

  it('binds the hover’s variable where a hover-and-disabled token gives it that mode', () => {
    const chosen = read('chosen');
    assert.deepEqual(
      member(chosen, 'selection=rest, pointer=hover, availability=disabled').fills,
      token('ui.chosen.hover.backgroundColor'),
    );
  });
});
