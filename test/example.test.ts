/**
 * The running example of the docs, synced into the test mock of a Figma file, and what the sync leaves there kept
 * as golden files under `test/example-output/`.
 *
 * The tokens are `@toghen/lib/example/` (read by `load()`); the component file is `test/example/`. Each
 * snippet a doc shows is one file: the variable plan (collections, modes, variables, what each mode reads), the
 * dry run's warnings as the plugin words them, and what the component check says of `button.component.kdl`.
 * `UPDATE_EXAMPLE=1 pnpm test` rewrites the files; read the diff.
 */

import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { load, Resolver, type ResolverDocument } from '@toghen/lib';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../main/handlers/planVariableSync.js';
import { EXECUTE_VARIABLE_SYNC } from '../main/handlers/executeVariableSync.js';
import { PLAN_STYLE_SYNC } from '../main/handlers/planStyleSync.js';
import { EXECUTE_STYLE_SYNC } from '../main/handlers/executeStyleSync.js';
import { CHECK_COMPONENTS } from '../main/handlers/runComponent.js';
import { getState, resetState } from '../main/runtimeState.js';
import { designSourceOf } from '../main/utils/designSource.js';
import { readComponentFile } from '../shared/components/index.js';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { runFile } from './components/support.js';

const TOKENS = fileURLToPath(import.meta.resolve('@toghen/lib/example/ds.resolver.json'));
const COMPONENT = fileURLToPath(new URL('./example/button.component.kdl', import.meta.url));
const OUTPUT = fileURLToPath(new URL('./example-output/', import.meta.url));
const UPDATE = process.env.UPDATE_EXAMPLE === '1';

const written = new Set<string>();
function golden(name: string, text: string): void {
  written.add(name);
  const body = `${text.replace(/\s+$/, '')}\n`;
  if (UPDATE) {
    mkdirSync(OUTPUT, { recursive: true });
    writeFileSync(`${OUTPUT}${name}`, body);
    return;
  }
  assert.ok(existsSync(`${OUTPUT}${name}`), `${name} does not exist; run with UPDATE_EXAMPLE=1`);
  assert.equal(readFileSync(`${OUTPUT}${name}`, 'utf8'), body, `${name} differs from what the plugin leaves now`);
}

type Row = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The variables in the file, collection by collection: name, type, code syntax, and what each mode reads. */
function renderVariables(mock: FigmaMockHandle): string {
  const variables = mock.variables() as Row[];
  const collections = mock.collections() as Row[];
  const byId = new Map(variables.map((variable) => [variable.id, variable]));
  const hex = (c: Row) =>
    `#${[c.r, c.g, c.b]
      .map((v: number) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}${c.a !== 1 ? ` alpha ${c.a}` : ''}`;
  const cell = (value: Row) => {
    if (value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS') {
      const target = byId.get(value.id);
      return `alias ${collections.find((c) => c.id === target.variableCollectionId).name}/${target.name}`;
    }
    return value && typeof value === 'object' ? hex(value) : String(value);
  };
  const lines: string[] = [];
  for (const collection of collections) {
    lines.push(`${collection.name}  (modes: ${collection.modes.map((mode: Row) => mode.name).join(', ')})`);
    for (const variable of variables.filter((v) => v.variableCollectionId === collection.id)) {
      lines.push(`  ${variable.name}  ${variable.resolvedType}  ${variable.codeSyntax?.WEB ?? ''}`);
      for (const mode of collection.modes)
        lines.push(`    ${mode.name}: ${cell(mock.valueFor(collection.name, variable.name, mode.name))}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const warningsOf = () =>
  getState()
    .lastPlan!.filter((op) => op.kind === 'WARNING')
    .map((op) => (op as { message: string }).message);

/** What the command line does, in its order, against the mock: load, check the component files, sync variables, sync styles. */
async function sync(document: ResolverDocument, file: string): Promise<{ warnings: string[] }> {
  await LOAD_DOCUMENT(oneFile(JSON.stringify(document)));
  await CHECK_COMPONENTS({ files: [{ fileName: 'button.component.kdl', text: file }] });
  await PLAN_VARIABLE_SYNC({});
  const warnings = warningsOf();
  await EXECUTE_VARIABLE_SYNC();
  await PLAN_STYLE_SYNC({} as never);
  await EXECUTE_STYLE_SYNC();
  return { warnings };
}

const loadExample = async () => (await load(TOKENS, { read: (path) => readFile(path, 'utf8') })).document;
const mockWithFonts = () =>
  createFigmaMock()
    .withFonts([
      { family: 'Inter', style: 'Medium' },
      { family: 'Inter', style: 'Regular' },
    ])
    .install();

describe('the running example in a Figma file', () => {
  useFigmaMock();
  beforeEach(() => resetState());
  after(() => {
    const stray = readdirSync(OUTPUT).filter((name) => !written.has(name));
    if (UPDATE) for (const name of stray) rmSync(`${OUTPUT}${name}`);
    else assert.deepEqual(stray, [], 'files in example-output/ that no test writes any more');
  });

  it('syncs the variables: a collection for the base, one per world, one per axis that folds', async () => {
    const mock = mockWithFonts();
    const kdl = readFileSync(COMPONENT, 'utf8');
    const { warnings } = await sync(await loadExample(), kdl);
    golden('variable-plan.out.txt', renderVariables(mock));
    golden('variable-plan.warnings.txt', warnings.join('\n'));

    const names = (mock.collections() as Row[]).map((collection) => [collection.name, collection.modes.map((mode: Row) => mode.name)]);
    assert.deepEqual(names, [
      ['ds', ['default']],
      ['theme', ['light', 'dark']],
      ['density', ['regular', 'compact']],
      ['variant', ['rest', 'primary']],
      ['state', ['rest', 'hover', 'pressed', 'disabled']],
    ]);
    // the plan the docs describe: variant folds, state folds, selection stays in the path (one variable per part)
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /^"button": folds "variant" .*"state" .*; "selection" stays in the path/);
    assert.ok(mock.variable('state', 'button/selected/backgroundColor'), 'the unfolded selection keeps its variable');
    assert.equal(mock.variable('state', 'button/hover/backgroundColor'), undefined, 'a folded part has no variable');
  });

  it('checks button.component.kdl: the axes, the members, the pins, the bindings', async () => {
    const mock = mockWithFonts();
    const document = await loadExample();
    const kdl = readFileSync(COMPONENT, 'utf8');
    await sync(document, kdl);

    const checked = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: unknown })
      .filter((message) => message.type === 'COMPONENTS_CHECKED');
    golden(
      'button-component-check.out.json',
      JSON.stringify(
        checked.map((message) => message.payload),
        null,
        2,
      ),
    );

    const file = readComponentFile(kdl, designSourceOf(new Resolver(document)));
    assert.deepEqual(
      file.problems.filter((problem) => problem.severity === 'error'),
      [],
    );
    const properties = file.component!.properties.map((property: Row) =>
      property.type === 'VARIANT'
        ? `${property.name}  VARIANT  ${property.values.join(', ')}  ${property.modifier ? `pins the collection ${property.modifier}` : 'no pin: laid out in the path'}`
        : `${property.name}  ${property.type}  default "${property.default}"`,
    );
    const members = file.members.map((member: Row) => {
      const modes = member.tree.fields.modes;
      const fill = member.tree.fields.fills?.[0]?.path;
      return `${member.name}  |  pins ${
        modes
          ? Object.entries(modes)
              .map(([collection, mode]) => `${collection}=${mode}`)
              .join(' ')
          : 'nothing'
      }  |  fill ${fill}`;
    });
    golden(
      'button-component-axes.out.txt',
      [
        `properties (declared first, then the axes taken from the parts)`,
        ...properties.map((line: string) => `  ${line}`),
        '',
        `${file.members.length} members`,
        ...members.map((line: string) => `  ${line}`),
      ].join('\n'),
    );
    golden(
      'button-component-bindings.out.json',
      JSON.stringify({ tokens: file.component!.tokens, groups: file.component!.groups, notes: file.component!.notes }, null, 2),
    );
    assert.equal(file.members.length, 16);
    assert.deepEqual(
      file.component!.properties.map((property: Row) => property.name),
      ['Label', 'variant', 'state', 'selection'],
    );

    // run it: nothing in the way, sixteen members built
    const report = await runFile(mock, kdl, {}, 'button.component.kdl');
    const { setId, ...rest } = report;
    golden('button-component-run.out.json', JSON.stringify(rest, null, 2));
    assert.equal(report.steps[0].kind, 'CREATE_SET');
  });

  it('lays the button out in the path when the component says layout=parts', async () => {
    const mock = mockWithFonts();
    const kdl = readFileSync(COMPONENT, 'utf8').replace('tokens="{button}"', 'tokens="{button}" layout=parts');
    assert.notEqual(kdl, readFileSync(COMPONENT, 'utf8'));
    const { warnings } = await sync(await loadExample(), kdl);
    golden('button-layout-parts.component.kdl', kdl);
    golden('button-layout-parts.variable-plan.out.txt', renderVariables(mock));
    golden('button-layout-parts.variable-plan.warnings.txt', warnings.join('\n'));

    assert.deepEqual(
      (mock.collections() as Row[]).map((collection) => collection.name),
      ['ds', 'theme', 'density'],
    );
    assert.equal(warnings.length, 2, 'one for the button, laid out so by the file, and the field’s own');
    assert.ok(mock.variable('ds', 'button/hover/backgroundColor'));
    // built against the variables the sync left
    const report = await runFile(mock, kdl, {}, 'button.component.kdl');
    assert.equal(report.steps[0].kind, 'CREATE_SET');
  });
});
