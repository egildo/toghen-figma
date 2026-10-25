/**
 * A style named through a reference: `effectStyle="{kbd.boxShadow}"` where the token is only `{elevation.raised}` binds the
 * style the target becomes, the chain followed to the first token that is a style. A reference whose target is not a style
 * still names no style. Synthetic tokens in the W3C structured shapes, a loaded document, the Figma mock.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { run } from '../../main/components/run.js';
import { checkComponentFiles } from '../../main/components/file.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { Desired } from '../../shared/components/index.js';
import { resetState, setState } from '../../main/runtimeState.js';
import { byAddress } from './support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const px = (value: number) => ({ value, unit: 'px' });
const shadow = {
  color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.4 },
  offsetX: px(0),
  offsetY: px(2),
  blur: px(8),
  spread: px(0),
};
const type = { fontFamily: 'Inter', fontSize: px(16), fontWeight: 400, lineHeight: { value: 24, unit: 'px' }, letterSpacing: px(0) };

const DOCUMENT = {
  version: '2025-11-01',
  name: 'ds',
  sets: {
    base: {
      sources: [
        {
          elevation: { raised: { $type: 'shadow', $value: shadow } },
          text: { body: { $type: 'typography', $value: type } },
          color: { ink: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0] } } },
          kbd: {
            boxShadow: { $type: 'shadow', $value: '{elevation.raised}' },
            deeper: { boxShadow: { $type: 'shadow', $value: '{kbd.boxShadow}' } },
            font: { $type: 'typography', $value: '{text.body}' },
            // a reference to something that is no shadow: it is no style, whatever the key says
            tint: { $type: 'shadow', $value: '{color.ink}' },
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
} as unknown as ResolverDocument;

const component = (body: string): string => `component Key\nFRAME Key layoutMode=VERTICAL {\n${body}\n}\n`;
const desiredFrom = (text: string): Desired => {
  const file = readComponentFile(text);
  assert.deepEqual(
    file.problems.filter((p) => p.severity === 'error'),
    [],
  );
  return JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired;
};
const styled = () =>
  createFigmaMock()
    .withFonts([{ family: 'Inter', style: 'Regular' }])
    .withStyle('EFFECT', 'elevation/raised', {})
    .withStyle('TEXT', 'text/body', { fontName: { family: 'Inter', style: 'Regular' } });

describe('a style named through a reference', () => {
  useFigmaMock();
  beforeEach(() => setState({ resolver: new Resolver(DOCUMENT) }));
  afterEach(() => resetState());

  const figmaOf = (): any => (globalThis as { figma?: unknown }).figma; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('binds the effect style the target becomes', async () => {
    const mock = styled().install();
    const [style] = await figmaOf().getLocalEffectStylesAsync();
    const report = await run(desiredFrom(component('    FRAME Box layoutMode=NONE effectStyle="{kbd.boxShadow}"')));
    assert.equal(byAddress(mock.node(report.setId!) as Node).get('Box')!.effectStyleId, style.id);
  });

  it('follows a chain of references to the first token that is a style', async () => {
    const mock = styled().install();
    const [style] = await figmaOf().getLocalEffectStylesAsync();
    const report = await run(desiredFrom(component('    FRAME Box layoutMode=NONE effectStyle="{kbd.deeper.boxShadow}"')));
    assert.equal(byAddress(mock.node(report.setId!) as Node).get('Box')!.effectStyleId, style.id);
  });

  it('binds the text style a typography reference becomes', async () => {
    const mock = styled().install();
    const [style] = await figmaOf().getLocalTextStylesAsync();
    const report = await run(desiredFrom(component('    TEXT Label characters="Esc" textStyle="{kbd.font}"')));
    assert.equal(byAddress(mock.node(report.setId!) as Node).get('Label')!.textStyleId, style.id);
  });

  it('still names the token itself when it is a style, not a reference', async () => {
    const mock = styled().install();
    const [style] = await figmaOf().getLocalEffectStylesAsync();
    const report = await run(desiredFrom(component('    FRAME Box layoutMode=NONE effectStyle="{elevation.raised}"')));
    assert.equal(byAddress(mock.node(report.setId!) as Node).get('Box')!.effectStyleId, style.id);
  });

  it('names no style when the reference ends at a token that is not one', async () => {
    styled().install();
    for (const path of ['kbd.tint']) {
      await assert.rejects(
        run(desiredFrom(component(`    FRAME Box layoutMode=NONE effectStyle="{${path}}"`))),
        (error: Error & { problems?: string[] }) => {
          assert.deepEqual(error.problems, [`effect style {${path}} (line 3) names no effect style`]);
          return true;
        },
      );
    }
  });

  it('names no text style through a reference to a shadow, nor an effect style through one to a typography', async () => {
    styled().install();
    await assert.rejects(run(desiredFrom(component('    TEXT Label characters="x" textStyle="{kbd.boxShadow}"'))), /names no text style/);
    await assert.rejects(run(desiredFrom(component('    FRAME Box layoutMode=NONE effectStyle="{kbd.font}"'))), /names no effect style/);
  });

  it("counts, in a dry run, the target's style the sync would create, and says so by the name it would have", async () => {
    createFigmaMock().install();
    const desired = desiredFrom(component('    FRAME Box layoutMode=NONE effectStyle="{kbd.boxShadow}"'));
    const report = await run(desired, { dryRun: true, pending: { variables: [], textStyles: [], effectStyles: ['elevation/raised'] } });
    assert.deepEqual(report.pending, ['effect style {kbd.boxShadow} (line 3): the style sync would create "elevation/raised"']);
  });

  it("is not confused by the reference token's own name: a style of that name is not looked for", async () => {
    // a style named for the reference token itself is not the one its target made
    createFigmaMock().withStyle('EFFECT', 'kbd/boxShadow', {}).install();
    await assert.rejects(
      run(desiredFrom(component('    FRAME Box layoutMode=NONE effectStyle="{kbd.boxShadow}"'))),
      /names no effect style/,
    );
  });

  it('is checked in the repository by the token existing, which a reference token does', () => {
    const files = [{ fileName: 'key.component.kdl', text: component('    FRAME Box layoutMode=NONE effectStyle="{kbd.boxShadow}"') }];
    assert.deepEqual(checkComponentFiles(files, { names: true }), []);
  });

  it('changes nothing when no document is loaded', async () => {
    resetState();
    const mock = styled().withStyle('EFFECT', 'kbd/boxShadow', {}).install();
    const styles = await figmaOf().getLocalEffectStylesAsync();
    const own = styles.find((s: Node) => s.name === 'kbd/boxShadow');
    const report = await run(desiredFrom(component('    FRAME Box layoutMode=NONE effectStyle="{kbd.boxShadow}"')));
    assert.equal(byAddress(mock.node(report.setId!) as Node).get('Box')!.effectStyleId, own.id);
  });
});
