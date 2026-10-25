/**
 * Fixtures shared by the component engine's tests: the tokens the two component
 * files name, as a Figma file would hold them, and the file read into the plain
 * JSON the engine is given.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFigmaMock } from '../support/figmaMock.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { CompactReport, Desired, RunOptions } from '../../shared/components/index.js';
import { RUN_COMPONENT } from '../../main/handlers/runComponent.js';
import type { Response } from '../../shared/protocol.js';

export const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}.component.kdl`, import.meta.url), 'utf8');

/** A component file, read and expanded, then serialised: the engine only ever sees JSON. */
export function desiredOf(name: string): Desired {
  const file = readComponentFile(fixture(name));
  assert.deepEqual(
    file.problems.filter((problem) => problem.severity === 'error'),
    [],
  );
  return JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired;
}

/** Component file text, read and expanded, then serialised: the engine only ever sees JSON. */
export function desiredFromText(text: string): Desired {
  const file = readComponentFile(text);
  assert.deepEqual(
    file.problems.filter((problem) => problem.severity === 'error'),
    [],
    text,
  );
  return JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired;
}

/** A Figma colour variable holds `{r,g,b,a}`, not a DTCG colour. */
export const rgba = (r: number, g: number, b: number) => ({ r, g, b, a: 1 });

/** The tokens the worked example names, in a collection called Demo: today's collection-name prefix. */
export function shellMock() {
  return createFigmaMock()
    .withCollection('Demo', ['light'])
    .withVariable('Demo', 'surface/page', 'COLOR', { light: rgba(0.96, 0.97, 1) })
    .withVariable('Demo', 'border/subtle', 'COLOR', { light: rgba(0.8, 0.8, 0.85) })
    .withVariable('Demo', 'space/lg', 'FLOAT', { light: 24 })
    .withVariable('Demo', 'space/md', 'FLOAT', { light: 16 });
}

/** The tokens, styles, modes and component the control names. */
export function controlMock() {
  return createFigmaMock()
    .withFonts([
      { family: 'Inter', style: 'Regular' },
      { family: 'Inter', style: 'Medium' },
      { family: 'Inter', style: 'Semi Bold' },
    ])
    .withCollection('Demo', ['light'])
    .withCollection('Scale', ['default', 'small'])
    .withVariable('Demo', 'space/md', 'FLOAT', { light: 16 })
    .withVariable('Demo', 'space/sm', 'FLOAT', { light: 8 })
    .withVariable('Demo', 'radius/md', 'FLOAT', { light: 6 })
    .withVariable('Demo', 'surface/control', 'COLOR', { light: rgba(0.9, 0.9, 0.95) })
    .withVariable('Demo', 'surface/control-active', 'COLOR', { light: rgba(0.8, 0.8, 0.9) })
    .withVariable('Demo', 'border/strong', 'COLOR', { light: rgba(0.2, 0.2, 0.3) })
    .withStyle('TEXT', 'text/label', { fontName: { family: 'Inter', style: 'Medium' } })
    .withStyle('TEXT', 'text/label-small', { fontName: { family: 'Inter', style: 'Semi Bold' } })
    .withComponent('Glyph');
}

// A test reads the mock's nodes through their real API; these are only for navigating them.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const walk = (node: Node): Node[] => [node, ...('children' in node ? node.children.flatMap(walk) : [])];

/** A node's stamp as it is written, `{ is, receipt, placed? }`, or undefined when it has none. */
export function stampOf(
  node: Node,
): { is: Record<string, string>; receipt: Record<string, string>; placed?: { x: number; y: number } } | undefined {
  const raw = node.getSharedPluginData('toghen', 'stamp');
  return raw ? JSON.parse(raw) : undefined;
}

/** The layers of a built member, by the address they are stamped with. */
export function byAddress(member: Node): Map<string, Node> {
  const layers = new Map<string, Node>();
  for (const node of walk(member)) {
    const address = stampOf(node)?.is.address;
    if (address !== undefined) layers.set(address, node);
  }
  return layers;
}

/** The key of a property on a set, by its name. */
export function keyOfProperty(set: Node, name: string, type?: string): string {
  const definitions = set.componentPropertyDefinitions as Record<string, { type: string }>;
  const key = Object.keys(definitions).find((k) => k.split('#')[0] === name && (type === undefined || definitions[k].type === type));
  assert.ok(key, `the set has no property named ${name}`);
  return key;
}

/**
 * What the command line does with a component file, and the plugin does on receiving it: `RUN_COMPONENT` with the
 * file's text and name, on the real handler with the mock behind it. Resolves with the report the plugin sent; a run
 * that stopped rejects with its message and every reason, so `assert.rejects` reads as it did for a thrown script.
 */
export async function runFile(
  mock: { calls(api: string): ReadonlyArray<{ args: readonly unknown[] }> },
  text: string,
  options: RunOptions = {},
  fileName = 'test.component.kdl',
  inputs?: Record<string, unknown>,
): Promise<CompactReport & { setId?: string }> {
  const before = mock.calls('ui.postMessage').length;
  await RUN_COMPONENT({ text, fileName, options, ...(inputs ? { inputs } : {}) });
  const message = mock
    .calls('ui.postMessage')
    .slice(before)
    .map((call) => call.args[0] as Response)
    .at(-1)!;
  if (message.type === 'ERROR') throw new Error(message.payload.message);
  assert.equal(message.type, 'COMPONENT_RUN');
  return (message as Extract<Response, { type: 'COMPONENT_RUN' }>).payload.report;
}
