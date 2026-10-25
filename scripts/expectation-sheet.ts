/**
 * Prints what the plugin should produce for a resolver document, so a manual
 * run in Figma compares against numbers rather than impressions.
 *
 * It runs the real planning engines, so it stays honest: if the sheet is wrong,
 * the plugin is wrong, and the difference between them is the bug.
 *
 * ```sh
 * pnpm --filter @toghen/figma expectations
 * pnpm --filter @toghen/figma expectations ../some/other.resolver.json
 * ```
 */
import { readFileSync } from 'node:fs';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { createFigmaMock } from '../test/support/figmaMock.js';
import { VariableSyncEngine } from '../main/engines/variableSyncEngine.js';
import { StyleSyncEngine } from '../main/engines/styleSyncEngine.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import type { Operation } from '../shared/operations.js';
import { isAlias } from '../main/utils/figmaTokenAdapter.js';
import { variableNameOfSymbol } from '../main/utils/correspondence.js';
import { buildSum } from '../main/utils/sum.js';

const documentPath = process.argv[2] ?? 'test/fixtures/sample.resolver.json';
const doc = JSON.parse(readFileSync(documentPath, 'utf8')) as ResolverDocument;
console.log(`${documentPath}\n`);

const resolver = new Resolver(doc);
createFigmaMock().install();

const hex = (v: unknown): string => {
  const c = v as { r: number; g: number; b: number; a?: number };
  const byte = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${byte(c.r)}${byte(c.g)}${byte(c.b)}${c.a !== undefined && c.a < 1 ? ` @${c.a}` : ''}`;
};

const variablePlan = await new VariableSyncEngine().buildPlan(resolver, 'demo', defaultTokenTypeMap);

const counts = (ops: readonly { kind: string }[]) =>
  ops.reduce<Record<string, number>>((acc, op) => {
    acc[op.kind] = (acc[op.kind] ?? 0) + 1;
    return acc;
  }, {});

console.log('COLLECTIONS  (the sum: a base collection, and one per modifier)');
for (const op of variablePlan.operations) {
  if (op.kind === 'CREATE_COLLECTION') {
    console.log(`  ${op.name.padEnd(16)} modes: ${op.modes.join(', ')}   <- Figma modes[0] must be the first`);
  }
}
console.log('\nVARIABLE PLAN', counts(variablePlan.operations));

const WATCH = [
  'demo.color.blue-500',
  'demo.color.grey-200',
  'demo.color.grey-900',
  'demo.color.bg.page',
  'demo.color.bg.surface',
  'demo.component.card.bg',
  'demo.spacing.md',
  'demo.radius.md',
];

const shown = (op: Operation): string => {
  if (op.kind !== 'SET_VARIABLE_VALUE') return '';
  if (isAlias(op.value)) return `→ ${variableNameOfSymbol(op.value.id) ?? op.value.id}`;
  return typeof op.value === 'number' ? String(op.value) : hex(op.value);
};

// A token is one variable, or the links of a chain: the head under its own path, the others under `path~modifier`.
console.log('\n  token                        variable [collection: mode] = value');
for (const path of WATCH) {
  const writes = variablePlan.operations.filter(
    (op) => op.kind === 'SET_VARIABLE_VALUE' && (op.tokenPath === path || op.tokenPath.startsWith(`${path}~`)),
  );
  const cells = writes.map((op) => (op.kind === 'SET_VARIABLE_VALUE' ? `${op.label} = ${shown(op)}` : ''));
  console.log(`  ${path.padEnd(28)} ${cells.length > 0 ? cells.join('   ') : '—'}`);
}

// An opacity is a number from 0 to 1 in the document and a percentage in Figma: this is what the file will hold.
const opacities = buildSum(resolver, 'demo', defaultTokenTypeMap).tokens.filter((token) => token.purpose?.opacity);
console.log('\nOPACITIES  (Figma holds a percentage: 55 draws a layer at 0.55)');
for (const token of opacities) {
  const cells = variablePlan.operations
    .filter((op) => op.kind === 'SET_VARIABLE_VALUE' && (op.tokenPath === token.path || op.tokenPath.startsWith(`${token.path}~`)))
    .map((op) => (op.kind === 'SET_VARIABLE_VALUE' ? `${op.label} = ${shown(op)}%` : ''));
  console.log(`  ${token.path.padEnd(28)} ${cells.join('   ') || '—'}`);
}
if (opacities.length === 0) console.log('  (none)');

console.log('\nSCOPES  (what each new variable is offered to; an existing one is given them by SET_VARIABLE_SCOPES)');
for (const op of variablePlan.operations) {
  if (op.kind === 'CREATE_VARIABLE')
    console.log(`  ${(op.tokenPath ?? op.path).padEnd(32)} ${(op.scopes ?? []).join(', ') || '(none: hidden from every picker)'}`);
  if (op.kind === 'SET_VARIABLE_SCOPES')
    console.log(`  ${op.path.padEnd(32)} ${op.scopes.join(', ') || '(none: hidden from every picker)'}`);
}
for (const op of variablePlan.operations) {
  if (op.kind === 'NOTE') console.log('\nNOTE\n  •', op.message);
}

const stylePlan = await new StyleSyncEngine().buildPlan(resolver, defaultTokenTypeMap);
console.log('\nSTYLE PLAN', counts(stylePlan.operations));

for (const op of stylePlan.operations) {
  if (op.kind !== 'CREATE_STYLE') continue;
  const props = op.props as Record<string, unknown>;
  if (op.styleType === 'TEXT') {
    console.log(
      `  TEXT   ${op.name.padEnd(22)} ${props.fontSize}px  ` +
        `lineHeight=${JSON.stringify(props.lineHeight)}  ` +
        `letterSpacing=${JSON.stringify(props.letterSpacing)}  ` +
        `font=${props.fontFamily} ${props.fontStyle}`,
    );
  }
  if (op.styleType === 'PAINT') {
    const paint = (
      props.paints as Array<{
        gradientStops: Array<{ color: unknown; position: number }>;
        gradientTransform: number[][];
      }>
    )[0];
    const rows = paint.gradientTransform.map((row) => `[${row.map((n) => Number(n.toFixed(4))).join(', ')}]`).join(' ');
    console.log(
      `  PAINT  ${op.name.padEnd(22)} stops=` +
        paint.gradientStops.map((s) => `${hex(s.color)}@${s.position}`).join(' → ') +
        `\n         ${''.padEnd(22)} transform=${rows}`,
    );
  }
  if (op.styleType === 'EFFECT') {
    const effect = (props.effects as Array<{ color: unknown; offset: { x: number; y: number }; radius: number; spread?: number }>)[0];
    console.log(
      `  EFFECT ${op.name.padEnd(22)} ${hex(effect.color)} ` +
        `offset=(${effect.offset.x},${effect.offset.y}) blur=${effect.radius} spread=${effect.spread ?? 0}`,
    );
  }
}

const warnings = [...variablePlan.operations, ...stylePlan.operations].filter((op) => op.kind === 'WARNING');
console.log('\nWARNINGS');
for (const w of warnings) {
  if (w.kind === 'WARNING') console.log('  •', w.message);
}
if (warnings.length === 0) console.log('  (none)');
